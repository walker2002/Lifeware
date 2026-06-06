/**
 * @file task
 * @brief 任务仓储实现（重构后）
 *
 * 实现 ITaskRepository 接口，支持嵌套任务、主线关联、标签查询
 */

import { eq, and, isNull, inArray, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { ITaskRepository, CreateTaskInput, UpdateTaskInput, TaskFilters } from '../../../usom/interfaces/irepository'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly, Timestamp } from '../../../usom/types/primitives'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'
import { taskRowToUSOM, taskUSOMToRow } from '../../../lib/db/repositories/mappers'

/**
 * 任务仓储
 */
export class TaskRepository implements ITaskRepository {
  // ─── 查询方法 ──────────────────────────────────────────────────

  async findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null> {
    const rows = await db.select().from(s.tasks)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    return rows[0] ? taskRowToUSOM(rows[0] as any) : null
  }

  async findByUserId(userId: USOM_ID, filters?: TaskFilters): Promise<Task[]> {
    const conditions = [eq(s.tasks.userId, userId)]
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(s.tasks.status, filters.status))
      } else {
        conditions.push(eq(s.tasks.status, filters.status))
      }
    }
    if (filters?.clarity) conditions.push(eq(s.tasks.clarity, filters.clarity))
    if (filters?.threadId) conditions.push(eq(s.tasks.threadId, filters.threadId))
    if (filters?.parentId === null) {
      conditions.push(isNull(s.tasks.parentId))
    } else if (filters?.parentId) {
      conditions.push(eq(s.tasks.parentId, filters.parentId))
    }

    const rows = await db.select().from(s.tasks)
      .where(and(...conditions))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findByStatus(status: Task['status'], userId: USOM_ID): Promise<Task[]> {
    return this.findByUserId(userId, { status })
  }

  async findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
    return this.findByUserId(userId, { parentId })
  }

  async findActive(userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(
        eq(s.tasks.userId, userId),
        eq(s.tasks.status, 'todo'),
      ))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]> {
    const rows = await db.select().from(s.tasks)
      .where(and(
        eq(s.tasks.userId, userId),
        gte(s.tasks.dueDate, start),
        lte(s.tasks.dueDate, end),
      ))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  async findAll(userId: USOM_ID): Promise<Task[]> {
    return this.findByUserId(userId)
  }

  /**
   * 获取子任务数量
   * @param parentId - 父任务 ID
   * @param userId - 用户 ID
   * @returns 子任务数量
   */
  async getChildCount(parentId: USOM_ID, userId: USOM_ID): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(s.tasks)
      .where(and(
        eq(s.tasks.parentId, parentId),
        eq(s.tasks.userId, userId),
      ))
    return result[0]?.count ?? 0
  }

  /**
   * 批量获取子任务数量（用于任务树展开箭头）
   * @param parentIds - 父任务 ID 列表
   * @param userId - 用户 ID
   * @returns Map<parentId, count>
   */
  async getChildCounts(parentIds: USOM_ID[], userId: USOM_ID): Promise<Map<string, number>> {
    if (parentIds.length === 0) return new Map()
    const rows = await db.select({
      parentId: s.tasks.parentId,
      count: sql<number>`count(*)::int`,
    })
      .from(s.tasks)
      .where(and(
        inArray(s.tasks.parentId, parentIds),
        eq(s.tasks.userId, userId),
      ))
      .groupBy(s.tasks.parentId)
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.parentId) map.set(row.parentId, row.count)
    }
    return map
  }

  // ─── 写入方法 ──────────────────────────────────────────────────

  async create(data: CreateTaskInput, userId: USOM_ID): Promise<Task> {
    const id = crypto.randomUUID() as USOM_ID
    const now = new Date().toISOString() as Timestamp

    const task: Task = {
      id,
      status: 'todo',
      title: data.title,
      description: data.description,
      priority: data.priority ?? Priority.Medium,
      energyRequired: data.energyRequired ?? EnergyLevel.Medium,
      estimatedDuration: data.estimatedDuration,
      startDate: data.startDate,
      endDate: data.endDate,
      threadId: data.threadId,
      parentId: data.parentId,
      tags: data.tags ?? [],
      notes: undefined,
      createdAt: now,
      updatedAt: now,

      // AI 维护标签（默认值 + 后续由 AI 计算）
      clarity: data.clarity ?? 'fuzzy',
      complexity: data.complexity ?? [],
      decomposition: data.decomposition,

      // 用户管理标签（默认值）
      captureMode: data.captureMode ?? 'ad_hoc',
      energyProfile: data.energyProfile,
      schedulingConstraint: data.schedulingConstraint,
      tracking: data.tracking ?? 'check_in',

      // AI 辅助扩展
      aiTags: {},
    }

    const row = taskUSOMToRow(task, userId)
    await db.insert(s.tasks).values(row)
    return task
  }

  async update(id: USOM_ID, data: UpdateTaskInput, userId: USOM_ID): Promise<Task> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Task ${id} not found`)

    const updated: Task = {
      ...existing,
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.energyRequired !== undefined && { energyRequired: data.energyRequired }),
      ...(data.estimatedDuration !== undefined && { estimatedDuration: data.estimatedDuration }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
      ...(data.threadId !== undefined && { threadId: data.threadId }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.recurrence !== undefined && { recurrence: data.recurrence }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.clarity !== undefined && { clarity: data.clarity }),
      ...(data.complexity !== undefined && { complexity: data.complexity }),
      ...(data.decomposition !== undefined && { decomposition: data.decomposition }),
      ...(data.captureMode !== undefined && { captureMode: data.captureMode }),
      ...(data.energyProfile !== undefined && { energyProfile: data.energyProfile }),
      ...(data.schedulingConstraint !== undefined && { schedulingConstraint: data.schedulingConstraint }),
      ...(data.tracking !== undefined && { tracking: data.tracking }),
      updatedAt: new Date().toISOString() as Timestamp,
    }

    const row = taskUSOMToRow(updated, userId)
    await db.update(s.tasks).set(row)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    return updated
  }

  async updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Task ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    }
    if (status === 'completed') updates.completedAt = now
    if (status === 'archived') updates.archivedAt = now

    await db.update(s.tasks).set(updates)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))

    return {
      ...existing,
      status,
      updatedAt: now.toISOString() as Timestamp,
      ...(status === 'completed' && { completedAt: now.toISOString() as Timestamp }),
      ...(status === 'archived' && { archivedAt: now.toISOString() as Timestamp }),
    }
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

  /**
   * 彻底删除任务（不可恢复）
   *
   * 注意：数据库 schema 定义 parentId 的 onDelete 为 'set null'，
   * 因此删除后子任务会自动变为根任务（parentId = null），
   * 子任务仍保留原 threadId 归属。
   *
   * @param id - 任务 ID
   * @param userId - 用户 ID
   */
  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.tasks)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
  }
}
