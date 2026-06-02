/**
 * @file repository
 * @brief 时间盒仓储实现
 * 
 * 实现 ITimeboxRepository 接口，提供时间盒数据的数据库操作
 */

import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { Timebox, ExecutionRecord } from '@/usom/types/objects'
import type { USOM_ID, Timestamp, TimeboxStatus } from '@/usom/types/primitives'
import { timeboxRowToUSOM, timeboxUSOMToRow } from '@/lib/db/repositories/mappers'

/**
 * 加载时间盒关联的任务和习惯 ID
 * 
 * @param timeboxId - 时间盒 ID
 * @returns 关联的任务 ID 和习惯 ID 列表
 */
async function loadJunctions(timeboxId: USOM_ID): Promise<{ taskIds: USOM_ID[]; habitIds: USOM_ID[] }> {
  const [taskLinks, habitLinks] = await Promise.all([
    db.select().from(s.timeboxTasks).where(eq(s.timeboxTasks.timeboxId, timeboxId)),
    db.select().from(s.timeboxHabits).where(eq(s.timeboxHabits.timeboxId, timeboxId)),
  ])
  return {
    taskIds: taskLinks.map(l => l.taskId),
    habitIds: habitLinks.map(l => l.habitId),
  }
}

export class TimeboxRepository implements ITimeboxRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Timebox | null> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
    if (!rows[0]) return null
    const { taskIds, habitIds } = await loadJunctions(id)
    return timeboxRowToUSOM(rows[0] as any, taskIds, habitIds)
  }

  async findRunning(userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), eq(s.timeboxes.status, 'running')))
    return this.loadWithJunctions(rows)
  }

  async findByStatus(status: TimeboxStatus, userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), eq(s.timeboxes.status, status)))
    return this.loadWithJunctions(rows)
  }

  async findUpcoming(userId: USOM_ID, withinHours = 2): Promise<Timebox[]> {
    const now = new Date()
    const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000)
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), gte(s.timeboxes.startTime, now), lte(s.timeboxes.startTime, cutoff)))
    return this.loadWithJunctions(rows)
  }

  async findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), gte(s.timeboxes.endTime, new Date(start)), lte(s.timeboxes.startTime, new Date(end))))
    return this.loadWithJunctions(rows)
  }

  async save(timebox: Timebox, userId: USOM_ID): Promise<void> {
    const row = timeboxUSOMToRow(timebox, userId)
    await db.insert(s.timeboxes).values(row).onConflictDoUpdate({
      target: s.timeboxes.id,
      set: row,
    })
    await db.delete(s.timeboxTasks).where(eq(s.timeboxTasks.timeboxId, timebox.id))
    await db.delete(s.timeboxHabits).where(eq(s.timeboxHabits.timeboxId, timebox.id))
    const taskIds = (timebox as unknown as Record<string, unknown>).taskIds as USOM_ID[] | undefined
    const habitIds = (timebox as unknown as Record<string, unknown>).habitIds as USOM_ID[] | undefined
    if (taskIds?.length) {
      await db.insert(s.timeboxTasks).values(taskIds.map(taskId => ({ timeboxId: timebox.id, taskId })))
    }
    if (habitIds?.length) {
      await db.insert(s.timeboxHabits).values(habitIds.map(habitId => ({ timeboxId: timebox.id, habitId })))
    }
  }

  async archive(id: USOM_ID, userId: USOM_ID, executionRecord?: ExecutionRecord): Promise<void> {
    const updates: Record<string, unknown> = {
      status: 'logged',
      loggedAt: new Date(),
    }
    if (executionRecord) {
      updates.executionRecord = executionRecord as unknown as Record<string, unknown>
    }
    await db.update(s.timeboxes)
      .set(updates)
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
  }

  private async loadWithJunctions(rows: any[]): Promise<Timebox[]> {
    const results: Timebox[] = []
    for (const row of rows) {
      const { taskIds, habitIds } = await loadJunctions(row.id)
      results.push(timeboxRowToUSOM(row as any, taskIds, habitIds))
    }
    return results
  }
}
