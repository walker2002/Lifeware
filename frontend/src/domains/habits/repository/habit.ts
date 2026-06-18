/**
 * @file habit
 * @brief 习惯仓储实现
 * 
 * 实现 IHabitRepository 接口，提供习惯数据的数据库操作
 */

import { eq, and, asc } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type {
  IHabitRepository,
  HabitFilters,
  HabitReferenceInfo,
  CreateHabitInput,
  UpdateHabitInput,
} from '../../../usom/interfaces/irepository'
import type { Habit, HabitFrequency } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly, Timestamp } from '../../../usom/types/primitives'
import { habitRowToUSOM, habitUSOMToRow } from '../../../lib/db/repositories/mappers'
import { calculateStreak, calculateLongestStreak, calculateCompletion7d } from '../streak-calculator'

/**
 * 习惯仓储
 */
export class HabitRepository implements IHabitRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Habit | null> {
    const rows = await tx.select().from(s.habits)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
    return rows[0] ? habitRowToUSOM(rows[0] as any) : null
  }

  async findByUserId(userId: USOM_ID, filters?: HabitFilters): Promise<Habit[]> {
    const conditions = [eq(s.habits.userId, userId)]
    if (filters?.status) conditions.push(eq(s.habits.status, filters.status))
    if (filters?.trackable !== undefined) conditions.push(eq(s.habits.trackable, filters.trackable))

    const rows = await db.select().from(s.habits)
      .where(and(...conditions))
    return rows.map(r => habitRowToUSOM(r as any))
  }

  async findActive(userId: USOM_ID): Promise<Habit[]> {
    const rows = await db.select().from(s.habits)
      .where(and(eq(s.habits.userId, userId), eq(s.habits.status, 'active')))
    return rows.map(r => habitRowToUSOM(r as any))
  }

  async findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]> {
    const rows = await db.select().from(s.habits)
      .where(and(eq(s.habits.userId, userId), eq(s.habits.frequencyType, frequencyType)))
    return rows.map(r => habitRowToUSOM(r as any))
  }

  async create(data: CreateHabitInput, userId: USOM_ID, tx: DbClient = db): Promise<Habit> {
    const now = new Date().toISOString() as Timestamp
    const id = crypto.randomUUID() as USOM_ID
    const habit: Habit = {
      id,
      status: 'draft',
      title: data.title,
      description: data.description,
      frequency: {
        type: data.frequencyType,
        daysOfWeek: data.daysOfWeek,
      },
      defaultTime: data.defaultTime,
      earliestTime: data.earliestTime,
      latestStartTime: data.latestStartTime,
      defaultDuration: data.defaultDuration,
      minDuration: data.minDuration,
      trackable: data.trackable,
      startDate: data.startDate,
      endDate: data.endDate,
      keyResultId: data.keyResultId,
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
    const row = habitUSOMToRow(habit, userId)
    await tx.insert(s.habits).values(row)
    return habit
  }

  async update(id: USOM_ID, data: UpdateHabitInput, userId: USOM_ID): Promise<Habit> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Habit ${id} not found`)

    const updated: Habit = {
      ...existing,
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.defaultTime !== undefined && { defaultTime: data.defaultTime }),
      ...(data.earliestTime !== undefined && { earliestTime: data.earliestTime }),
      ...(data.latestStartTime !== undefined && { latestStartTime: data.latestStartTime }),
      ...(data.defaultDuration !== undefined && { defaultDuration: data.defaultDuration }),
      ...(data.minDuration !== undefined && { minDuration: data.minDuration }),
      ...(data.trackable !== undefined && { trackable: data.trackable }),
      ...(data.frequencyType !== undefined && {
        frequency: { ...existing.frequency, type: data.frequencyType as HabitFrequency['type'] },
      }),
      ...(data.daysOfWeek !== undefined && {
        frequency: { ...existing.frequency, daysOfWeek: data.daysOfWeek },
      }),
      ...(data.startDate !== undefined && { startDate: data.startDate as DateOnly }),
      ...(data.endDate !== undefined && { endDate: data.endDate as DateOnly }),
      ...(data.keyResultId !== undefined && { keyResultId: data.keyResultId }),
      ...(data.tags !== undefined && { tags: data.tags }),
      updatedAt: new Date().toISOString() as Timestamp,
    }
    const row = habitUSOMToRow(updated, userId)
    await db.update(s.habits).set(row).where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
    return updated
  }

  async updateStatus(id: USOM_ID, status: Habit['status'], userId: USOM_ID, tx: DbClient = db): Promise<Habit> {
    const existing = await this.findById(id, userId, tx)
    if (!existing) throw new Error(`Habit ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updated_at: now,
    }
    if (status === 'suspended') updates.suspended_at = now
    if (status === 'archived') updates.archived_at = now

    await tx.update(s.habits).set(updates)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))

    return { ...existing, status, updatedAt: now.toISOString() as Timestamp }
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，禁止读后写：直接 update().set(fields).where(id 且 userId) 一次完成。
   * 注意 habit 表部分列在 schema 中以 snake_case 数据库列名定义，
   * fields 键应使用 schema 列属性名（驼峰，如 title / defaultTime）。
   * 多租户 T-02：where 必含 userId 过滤。
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Habit> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.habits)
      .set(setPayload)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`Habit ${id} not found after updateFields`)
    return updated
  }

  async save(habit: Habit, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = habitUSOMToRow(habit, userId)
    await tx.insert(s.habits).values(row).onConflictDoUpdate({
      target: s.habits.id,
      set: row,
    })
  }

  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.habits)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.habits)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
  }

  async checkReferences(id: USOM_ID, userId: USOM_ID): Promise<HabitReferenceInfo> {
    const [logs, templates, timeboxes] = await Promise.all([
      db.select({ id: s.habitLogs.id }).from(s.habitLogs)
        .where(and(eq(s.habitLogs.habitId, id), eq(s.habitLogs.userId, userId)))
        .limit(1),
      db.select({ id: s.templateHabits.templateId }).from(s.templateHabits)
        .where(eq(s.templateHabits.habitId, id))
        .limit(1),
      db.select({ id: s.timeboxHabits.timeboxId }).from(s.timeboxHabits)
        .where(eq(s.timeboxHabits.habitId, id))
        .limit(1),
    ])
    const habitLogs = logs.length
    const templateHabits = templates.length
    const timeboxHabits = timeboxes.length
    return {
      habitLogs,
      templateHabits,
      timeboxHabits,
      hasReferences: habitLogs > 0 || templateHabits > 0 || timeboxHabits > 0,
    }
  }

  // ─── 打卡指标自动计算 ──────────────────────────────────────────

  /** 获取指定习惯所有 completed 状态的打卡日期（ASC 排序） */
  private async getCompletedDates(habitId: USOM_ID, userId: USOM_ID): Promise<string[]> {
    const rows = await db.select({ date: s.habitLogs.date })
      .from(s.habitLogs)
      .where(and(
        eq(s.habitLogs.habitId, habitId),
        eq(s.habitLogs.userId, userId),
        eq(s.habitLogs.completionStatus, 'completed'),
      ))
      .orderBy(asc(s.habitLogs.date))
    return rows.map(r => r.date!)
  }

  async calculateStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number> {
    const dates = await this.getCompletedDates(habitId, userId)
    const today = new Date().toISOString().slice(0, 10)
    return calculateStreak(dates, today)
  }

  async calculateLongestStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number> {
    const dates = await this.getCompletedDates(habitId, userId)
    return calculateLongestStreak(dates)
  }

  async calculateCompletion7d(habitId: USOM_ID, userId: USOM_ID): Promise<number> {
    const dates = await this.getCompletedDates(habitId, userId)
    const today = new Date().toISOString().slice(0, 10)
    return calculateCompletion7d(dates, today)
  }

  async updateMetrics(
    habitId: USOM_ID,
    userId: USOM_ID,
    metrics: { streak: number; longestStreak: number; completionRate7d: number },
  ): Promise<void> {
    await db.update(s.habits)
      .set({
        streak: metrics.streak,
        longestStreak: metrics.longestStreak,
        completionRate7d: metrics.completionRate7d,
        updatedAt: new Date(),
      })
      .where(and(eq(s.habits.id, habitId), eq(s.habits.userId, userId)))
  }
}
