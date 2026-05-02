import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { ITaskRepository } from '../../../usom/interfaces/irepository'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { taskRowToUSOM, taskUSOMToRow } from './mappers'

export class TaskRepository implements ITaskRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    return rows[0] ? taskRowToUSOM(rows[0] as any) : null
  }

  async findByStatus(status: Task['status'], userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.status, status), eq(s.tasks.userId, userId)))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
    const junctions = await db.select().from(s.timeboxTasks)
      .where(eq(s.timeboxTasks.timeboxId, timeboxId))
    const taskIds = junctions.map(j => j.taskId)
    if (taskIds.length === 0) return []
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.userId, userId), eq(s.tasks.timeboxId, timeboxId)))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findActive(userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.userId, userId), eq(s.tasks.status, 'active')))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async save(task: Task, userId: USOM_ID): Promise<void> {
    const row = taskUSOMToRow(task, userId)
    await db.insert(s.tasks).values(row).onConflictDoUpdate({
      target: s.tasks.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.tasks)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
  }
}
