import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { ITaskRepository, CreateTaskInput } from '../../../usom/interfaces/irepository'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly } from '../../../usom/types/primitives'
import { taskRowToUSOM, taskUSOMToRow } from './mappers'
import { v4 } from 'uuid'

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

  async findByProject(projectId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.projectId, projectId), eq(s.tasks.userId, userId)))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.parentId, parentId), eq(s.tasks.userId, userId)))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findIndependent(userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.userId, userId), isNull(s.tasks.projectId)))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.userId, userId)))
    return rows.filter(r => r.startDate && r.startDate >= start && r.startDate <= end)
      .map(r => taskRowToUSOM(r as any))
  }

  async save(task: Task, userId: USOM_ID): Promise<void> {
    const row = taskUSOMToRow(task, userId)
    await db.insert(s.tasks).values(row).onConflictDoUpdate({
      target: s.tasks.id,
      set: row,
    })
  }

  async updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'completed') updates.completedAt = new Date()
    if (status === 'archived') updates.archivedAt = new Date()
    await db.update(s.tasks).set(updates)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    return (await this.findById(id, userId))!
  }

  async bulkCreate(inputs: CreateTaskInput[], userId: USOM_ID): Promise<Task[]> {
    const now = new Date()
    const tasks: Task[] = []
    for (const input of inputs) {
      const id = v4()
      await db.insert(s.tasks).values({
        id,
        userId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        energyRequired: input.energyRequired,
        estimatedDuration: input.estimatedDuration,
        status: 'draft',
        projectId: input.projectId ?? null,
        parentId: input.parentId ?? null,
        earliestTime: input.earliestTime ?? null,
        latestStartTime: input.latestStartTime ?? null,
        defaultTime: input.defaultTime ?? null,
        defaultDuration: input.defaultDuration ?? null,
        frequencyType: input.frequencyType ?? null,
        daysOfWeek: input.daysOfWeek ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        tags: [],
        recurrence: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      tasks.push((await this.findById(id, userId))!)
    }
    return tasks
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.tasks)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
  }
}
