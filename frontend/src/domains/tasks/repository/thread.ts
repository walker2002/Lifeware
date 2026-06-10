/**
 * @file thread
 * @brief 主线仓储实现
 *
 * 实现 IThreadRepository 接口，提供主线数据的数据库操作
 */

import { eq, and, inArray, sql } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IThreadRepository, CreateThreadInput, UpdateThreadInput } from '../../../usom/interfaces/irepository'
import type { Thread } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { threadRowToUSOM, threadUSOMToRow } from '../../../lib/db/repositories/mappers'

/**
 * 带任务计数的 Thread 查询结果
 */
export interface ThreadWithCount {
  thread: Thread
  taskCount: number
  completedTaskCount: number
}

/**
 * 主线仓储
 */
export class ThreadRepository implements IThreadRepository {
  // ─── 查询方法 ──────────────────────────────────────────────────

  async findById(id: USOM_ID, userId: USOM_ID): Promise<Thread | null> {
    const rows = await db.select().from(s.threads)
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))
    return rows[0] ? threadRowToUSOM(rows[0] as any) : null
  }

  async findByUserId(userId: USOM_ID, filters?: { status?: Thread['status'] | Thread['status'][] }): Promise<Thread[]> {
    const conditions = [eq(s.threads.userId, userId)]
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(s.threads.status, filters.status))
      } else {
        conditions.push(eq(s.threads.status, filters.status))
      }
    }
    const rows = await db.select().from(s.threads)
      .where(and(...conditions))
    return rows.map(r => threadRowToUSOM(r as any))
  }

  async findByStatus(status: Thread['status'], userId: USOM_ID): Promise<Thread[]> {
    const rows = await db.select().from(s.threads)
      .where(and(eq(s.threads.userId, userId), eq(s.threads.status, status)))
    return rows.map(r => threadRowToUSOM(r as any))
  }

  /**
   * 根据 ID 查找单个主线并附带任务计数
   * @param id - 主线 ID
   * @param userId - 用户 ID
   * @returns 带计数的 Thread 或 null
   */
  async findByIdWithCount(id: USOM_ID, userId: USOM_ID): Promise<ThreadWithCount | null> {
    const rows = await db.select({
      thread: s.threads,
      taskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} != 'archived')::int`,
      completedTaskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} = 'completed')::int`,
    })
      .from(s.threads)
      .leftJoin(s.tasks, and(
        eq(s.tasks.threadId, s.threads.id),
        sql`${s.tasks.status} != 'archived'`,
      ))
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))
      .groupBy(s.threads.id)

    if (rows.length === 0) return null
    return {
      thread: threadRowToUSOM(rows[0].thread as any),
      taskCount: rows[0].taskCount,
      completedTaskCount: rows[0].completedTaskCount,
    }
  }

  /**
   * 查找所有主线并附带任务计数，按 status > priority > updatedAt 排序
   * @param userId - 用户 ID
   * @returns 带计数的 Thread 列表
   */
  async findAllWithCount(userId: USOM_ID): Promise<ThreadWithCount[]> {
    const rows = await db.select({
      thread: s.threads,
      taskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} != 'archived')::int`,
      completedTaskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} = 'completed')::int`,
    })
      .from(s.threads)
      .leftJoin(s.tasks, and(
        eq(s.tasks.threadId, s.threads.id),
        sql`${s.tasks.status} != 'archived'`,
      ))
      .where(eq(s.threads.userId, userId))
      .groupBy(s.threads.id)
      .orderBy(
        sql`CASE ${s.threads.status}
        WHEN 'active' THEN 0
        WHEN 'paused' THEN 1
        WHEN 'completed' THEN 2
        ELSE 3 END`,
        sql`CASE ${s.threads.priority}
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4 END`,
        s.threads.updatedAt,
      )

    return rows.map(r => ({
      thread: threadRowToUSOM(r.thread as any),
      taskCount: r.taskCount,
      completedTaskCount: r.completedTaskCount,
    }))
  }

  /**
   * 按名称模糊搜索主线
   *
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @returns 匹配的主线列表
   */
  async searchByName(query: string, userId: USOM_ID): Promise<Thread[]> {
    const rows = await db.select().from(s.threads)
      .where(and(
        eq(s.threads.userId, userId),
        sql`${s.threads.name} ILIKE ${`%${query.trim()}%`}`,
      ))
    return rows.map(r => threadRowToUSOM(r as any))
  }

  // ─── 写入方法 ──────────────────────────────────────────────────

  async create(data: CreateThreadInput, userId: USOM_ID): Promise<Thread> {
    const id = crypto.randomUUID() as USOM_ID
    const now = new Date().toISOString() as Timestamp

    const thread: Thread = {
      id,
      status: 'active',
      name: data.name,
      description: data.description,
      color: data.color,
      startDate: data.startDate,
      endDate: data.endDate,
      priority: data.priority,
      tags: data.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }

    const row = threadUSOMToRow(thread, userId)
    await db.insert(s.threads).values(row)
    return thread
  }

  async update(id: USOM_ID, data: UpdateThreadInput, userId: USOM_ID): Promise<Thread> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Thread ${id} not found`)

    const updated: Thread = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
      ...(data.tags !== undefined && { tags: data.tags }),
      updatedAt: new Date().toISOString() as Timestamp,
    }

    const row = threadUSOMToRow(updated, userId)
    await db.update(s.threads).set(row)
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))
    return updated
  }

  async updateStatus(id: USOM_ID, status: Thread['status'], userId: USOM_ID): Promise<Thread> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`Thread ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    }
    if (status === 'completed') updates.completedAt = now
    if (status === 'archived') updates.archivedAt = now

    await db.update(s.threads).set(updates)
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))

    return {
      ...existing,
      status,
      updatedAt: now.toISOString() as Timestamp,
      ...(status === 'completed' && { completedAt: now.toISOString() as Timestamp }),
      ...(status === 'archived' && { archivedAt: now.toISOString() as Timestamp }),
    }
  }

  async save(thread: Thread, userId: USOM_ID): Promise<void> {
    const row = threadUSOMToRow(thread, userId)
    await db.insert(s.threads).values(row).onConflictDoUpdate({
      target: s.threads.id,
      set: row,
    })
  }

  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.threads)
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.threads)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.threads.id, id), eq(s.threads.userId, userId)))
  }
}
