/**
 * @file task
 * @brief 任务仓储实现（重构后）
 *
 * 实现 ITaskRepository 接口，支持嵌套任务、主线关联、标签查询
 */

import { eq, and, isNull, inArray, gte, lte, sql } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
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

  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Task | null> {
    const rows = await tx.select().from(s.tasks)
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
    if (filters?.clarity) {
      if (Array.isArray(filters.clarity)) {
        conditions.push(inArray(s.tasks.clarity, filters.clarity))
      } else {
        conditions.push(eq(s.tasks.clarity, filters.clarity))
      }
    }
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

  /**
   * 搜索匹配查询的任务，并构建祖先链
   *
   * 对 title/description 做 ILIKE 匹配，返回匹配结果及其完整祖先路径。
   * 用于任务树搜索模式，可搜索到未展开的深层子任务。
   *
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @param filters - 额外筛选条件
   * @returns 匹配任务列表 + 祖先映射（taskId → 祖先链，从最近父级到根级）
   */
  async findMatchingWithAncestors(
    query: string,
    userId: USOM_ID,
    filters?: { threadId?: string; clarity?: string[]; status?: string[] },
  ): Promise<{
    matches: Task[]
    ancestorMap: Map<string, Task[]>
  }> {
    const conditions = [
      eq(s.tasks.userId, userId),
      sql`(${s.tasks.title} ILIKE ${`%${query.trim()}%`} OR ${s.tasks.description} ILIKE ${`%${query.trim()}%`})`,
    ]

    if (filters?.threadId) {
      conditions.push(eq(s.tasks.threadId, filters.threadId))
    }
    if (filters?.clarity && filters.clarity.length > 0) {
      conditions.push(inArray(s.tasks.clarity, filters.clarity as any[]))
    }
    if (filters?.status && filters.status.length > 0) {
      conditions.push(inArray(s.tasks.status, filters.status as any[]))
    }

    const rows = await db.select().from(s.tasks)
      .where(and(...conditions))
    const matches = rows.map(r => taskRowToUSOM(r as any))

    // 构建祖先映射（批量加载，避免 N+1）
    const ancestorMap = new Map<string, Task[]>()
    const loadedTasks = new Map<string, Task>()

    if (matches.length > 0) {
      // 收集所有需要加载的祖先 ID
      let pendingIds = new Set(matches.map(m => m.parentId).filter(Boolean) as string[])

      for (let depth = 0; depth < 10 && pendingIds.size > 0; depth++) {
        // 去掉已加载的 ID
        const toLoad = [...pendingIds].filter(id => !loadedTasks.has(id))
        if (toLoad.length === 0) break

        // 批量查询：一次加载该层的所有祖先
        const parentRows = await db.select().from(s.tasks)
          .where(and(
            eq(s.tasks.userId, userId),
            inArray(s.tasks.id, toLoad as any[]),
          ))

        const parents = parentRows.map(r => taskRowToUSOM(r as any))
        for (const p of parents) {
          loadedTasks.set(p.id, p)
        }

        // 下一层：这些祖先的 parentId
        pendingIds = new Set(parents.map(p => p.parentId).filter(Boolean) as string[])
      }

      // 为每个匹配结果构建祖先链
      for (const match of matches) {
        const ancestors: Task[] = []
        let currentParentId = match.parentId

        for (let i = 0; i < 10 && currentParentId; i++) {
          const parent = loadedTasks.get(currentParentId)
          if (!parent) break
          ancestors.push(parent)
          currentParentId = parent.parentId
        }

        ancestorMap.set(match.id, ancestors)
      }
    }

    return { matches, ancestorMap }
  }

  /**
   * 按标题或描述模糊搜索任务
   *
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @param statusFilter - 可选的状态过滤（in 查询）
   * @returns 匹配的任务列表
   */
  async searchByTitle(
    query: string,
    userId: USOM_ID,
    statusFilter?: Array<Task['status']>,
  ): Promise<Task[]> {
    const conditions = [
      eq(s.tasks.userId, userId),
      sql`(${s.tasks.title} ILIKE ${`%${query.trim()}%`} OR ${s.tasks.description} ILIKE ${`%${query.trim()}%`})`,
    ]
    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(s.tasks.status, statusFilter as any[]))
    }
    const rows = await db.select().from(s.tasks).where(and(...conditions))
    return rows.map(r => taskRowToUSOM(r as any))
  }

  /**
   * 按多个状态查询任务
   *
   * @param statuses - 状态列表
   * @param userId - 用户 ID
   * @returns 匹配的任务列表
   */
  async findByStatuses(
    statuses: Array<Task['status']>,
    userId: USOM_ID,
  ): Promise<Task[]> {
    return this.findByUserId(userId, { status: statuses })
  }

  // ─── 写入方法 ──────────────────────────────────────────────────

  async create(data: CreateTaskInput, userId: USOM_ID, tx: DbClient = db): Promise<Task> {
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
      // [023] A3.1.2: 透传 activityArchetypeId 到 USOM Task
      activityArchetypeId: data.activityArchetypeId,
      schedulingConstraint: data.schedulingConstraint,
      tracking: data.tracking ?? 'check_in',

      // AI 辅助扩展
      aiTags: {},
    }

    const row = taskUSOMToRow(task, userId)
    await tx.insert(s.tasks).values(row)
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
      // [023] A3.1.2: update 透传 activityArchetypeId（undefined 时跳过）
      ...(data.activityArchetypeId !== undefined && { activityArchetypeId: data.activityArchetypeId }),
      ...(data.schedulingConstraint !== undefined && { schedulingConstraint: data.schedulingConstraint }),
      ...(data.tracking !== undefined && { tracking: data.tracking }),
      updatedAt: new Date().toISOString() as Timestamp,
    }

    const row = taskUSOMToRow(updated, userId)
    await db.update(s.tasks).set(row)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    return updated
  }

  async updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID, tx: DbClient = db): Promise<Task> {
    const existing = await this.findById(id, userId, tx)
    if (!existing) throw new Error(`Task ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    }
    if (status === 'completed') updates.completedAt = now
    if (status === 'archived') updates.archivedAt = now

    await tx.update(s.tasks).set(updates)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))

    return {
      ...existing,
      status,
      updatedAt: now.toISOString() as Timestamp,
      ...(status === 'completed' && { completedAt: now.toISOString() as Timestamp }),
      ...(status === 'archived' && { archivedAt: now.toISOString() as Timestamp }),
    }
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，禁止读后写：直接 update().set(fields).where(id 且 userId) 一次完成，
   * 不先 findById 再 save。fields 的键为 schema 列属性名（驼峰），由 Drizzle 映射到数据库列。
   * 多租户 T-02：where 子句必含 userId 过滤。
   *
   * @param id - 任务 ID
   * @param fields - 待更新字段（驼峰键，如 title / description / priority）
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄，缺省回退到 db 单例
   * @returns 更新后的完整 USOM 对象
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Task> {
    // 注入 updatedAt，确保更新时间戳随字段写一起落库
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.tasks)
      .set(setPayload)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
    // 更新后回读一次，返回最新 USOM 对象
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`Task ${id} not found after updateFields`)
    return updated
  }

  async save(task: Task, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = taskUSOMToRow(task, userId)
    await tx.insert(s.tasks).values(row).onConflictDoUpdate({
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
   * 统计无主线（orphan）任务数量：thread_id 为空且未归档。
   *
   * 补齐 ThreadRepository.findAllWithCount 的盲区——该方法以
   * threads LEFT JOIN tasks ON thread_id 关联，thread_id 为空的任务
   * 不挂任何主线行，永远不会被计入。此方法用于侧栏「普通任务」计数
   * 与「全部任务」合计，使 orphan 任务不再从计数中消失。
   *
   * @param userId - 用户 ID（多租户 T-02：where 必含 userId）
   * @returns 未归档的 orphan 任务数
   */
  async countOrphanTasks(userId: USOM_ID): Promise<number> {
    const rows = await db.select({ count: sql<number>`count(*)::int` })
      .from(s.tasks)
      .where(and(
        eq(s.tasks.userId, userId),
        isNull(s.tasks.threadId),
        sql`${s.tasks.status} != 'archived'`,
      ))
    return rows[0]?.count ?? 0
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
