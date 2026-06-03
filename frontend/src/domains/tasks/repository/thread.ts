/**
 * @file thread
 * @brief 主线仓储实现
 *
 * 实现 IThreadRepository 接口，提供主线数据的数据库操作
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IThreadRepository, CreateThreadInput, UpdateThreadInput } from '../../../usom/interfaces/irepository'
import type { Thread } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { threadRowToUSOM, threadUSOMToRow } from '../../../lib/db/repositories/mappers'

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
    if (filters?.status && !Array.isArray(filters.status)) {
      conditions.push(eq(s.threads.status, filters.status))
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
