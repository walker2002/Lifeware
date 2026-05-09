import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type {
  IHabitRepository,
  HabitFilters,
  CreateHabitInput,
  UpdateHabitInput,
} from '../../../usom/interfaces/irepository'
import type { Habit, HabitFrequency } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly, Timestamp } from '../../../usom/types/primitives'
import { habitRowToUSOM, habitUSOMToRow } from './mappers'

export class HabitRepository implements IHabitRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null> {
    const rows = await db.select().from(s.habits)
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

  async create(data: CreateHabitInput, userId: USOM_ID): Promise<Habit> {
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
      latestEndTime: data.latestEndTime,
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
    await db.insert(s.habits).values(row)
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
      ...(data.latestEndTime !== undefined && { latestEndTime: data.latestEndTime }),
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

  async updateStatus(id: USOM_ID, status: Habit['status'], userId: USOM_ID): Promise<Habit> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Habit ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updated_at: now,
    }
    if (status === 'suspended') updates.suspended_at = now
    if (status === 'archived') updates.archived_at = now

    await db.update(s.habits).set(updates)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))

    return { ...existing, status, updatedAt: now.toISOString() as Timestamp }
  }

  async save(habit: Habit, userId: USOM_ID): Promise<void> {
    const row = habitUSOMToRow(habit, userId)
    await db.insert(s.habits).values(row).onConflictDoUpdate({
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
}
