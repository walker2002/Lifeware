import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { ITimeboxRepository } from '../../../usom/interfaces/irepository'
import type { Timebox, ExecutionRecord } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp, TimeboxStatus } from '../../../usom/types/primitives'
import { timeboxRowToUSOM, timeboxUSOMToRow } from './mappers'

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
    if (timebox.taskIds.length > 0) {
      await db.insert(s.timeboxTasks).values(timebox.taskIds.map(taskId => ({ timeboxId: timebox.id, taskId })))
    }
    if (timebox.habitIds.length > 0) {
      await db.insert(s.timeboxHabits).values(timebox.habitIds.map(habitId => ({ timeboxId: timebox.id, habitId })))
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
