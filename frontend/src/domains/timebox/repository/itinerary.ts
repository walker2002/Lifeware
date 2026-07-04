/**
 * @file itinerary repository
 * @brief Itinerary CRUD + range/reconcile/status update（[026] D2 reversal）
 *
 * D2 reversal 后：所有 5 态存 DB；updateStatus 完整支持 markInProgress/markExpired/cancel；
 * findNeedingReconcile 供 reconcileItineraryStatuses 配合用（实际 reconcile 在内存里用，
 * 这里只取候选行）。
 *
 * 多租户 T-02：所有查询/写入必带 userId 过滤。
 * 写入口经 mutation service 调用本 repo，不在调用点直接 new repo 写。
 */

import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import * as s from '@/lib/db/schema'
import { db, type DbClient } from '@/lib/db'
import type { Itinerary } from '@/usom/types/objects'
import type { ItineraryStatus, USOM_ID, Timestamp } from '@/usom/types/primitives'
import { itineraryRowToUSOM, itineraryUSOMToRow } from './mappers/itinerary'

/** 非终态集合：reconcile 候选 + 列表视图 + 范围查询统一使用。 */
const NON_TERMINAL: ItineraryStatus[] = ['scheduled', 'in_progress']

export class ItineraryRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Itinerary | null> {
    const rows = await tx.select().from(s.itineraries)
      .where(and(eq(s.itineraries.id, id as any), eq(s.itineraries.userId, userId as any)))
    return rows[0] ? itineraryRowToUSOM(rows[0]) : null
  }

  async save(it: Itinerary, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = itineraryUSOMToRow(it, userId)
    await tx.insert(s.itineraries).values(row).onConflictDoUpdate({
      target: s.itineraries.id,
      set: row,
    })
  }

  /** 单 UPDATE，无读后写（R-01）。透传 tx。 */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Itinerary> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.itineraries).set(setPayload)
      .where(and(eq(s.itineraries.id, id as any), eq(s.itineraries.userId, userId as any)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`Itinerary ${id} not found after updateFields`)
    return updated
  }

  /** 软删：盖 cancelledAt + status='cancelled'（D2 reversal）。从 {scheduled, in_progress} 取消。 */
  async cancel(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const now = new Date()
    await tx.update(s.itineraries)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(and(eq(s.itineraries.id, id as any), eq(s.itineraries.userId, userId as any)))
  }

  /** D2 reversal: markInProgress 盖 inProgressAt + status='in_progress'（从 scheduled） */
  async markInProgress(id: USOM_ID, userId: USOM_ID, at: Date, tx: DbClient = db): Promise<void> {
    await tx.update(s.itineraries)
      .set({ status: 'in_progress', inProgressAt: at, updatedAt: at })
      .where(and(eq(s.itineraries.id, id as any), eq(s.itineraries.userId, userId as any)))
  }

  /** D2 reversal: markExpired 盖 expiredAt + status='expired'（从 {scheduled, in_progress}） */
  async markExpired(id: USOM_ID, userId: USOM_ID, at: Date, tx: DbClient = db): Promise<void> {
    await tx.update(s.itineraries)
      .set({ status: 'expired', expiredAt: at, updatedAt: at })
      .where(and(eq(s.itineraries.id, id as any), eq(s.itineraries.userId, userId as any)))
  }

  /** 范围查询：startTime 落在 [start,end] 且未终态。/timeboxes 读时合并用。 */
  async findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID, tx: DbClient = db): Promise<Itinerary[]> {
    const rows = await tx.select().from(s.itineraries)
      .where(and(
        eq(s.itineraries.userId, userId as any),
        inArray(s.itineraries.status, NON_TERMINAL as any),
        gte(s.itineraries.startTime, new Date(start)),
        lte(s.itineraries.startTime, new Date(end)),
      ))
    return rows.map(itineraryRowToUSOM)
  }

  /**
   * findNeedingReconcile：D2 reversal reconcile 的 DB 候选行查询
   * 选 userId 全部 status ∈ {scheduled, in_progress} 的非终态行程，
   * 内存里 reconcileItineraryStatuses 决定是否真的需要推进。
   * 用 idx_itineraries_user_status_start 索引。
   */
  async findNeedingReconcile(userId: USOM_ID, tx: DbClient = db): Promise<Itinerary[]> {
    const rows = await tx.select().from(s.itineraries)
      .where(and(
        eq(s.itineraries.userId, userId as any),
        inArray(s.itineraries.status, NON_TERMINAL as any),
      ))
    return rows.map(itineraryRowToUSOM)
  }

  /** 列表查询：未终态 + 按 startTime 升序（行程 Page 列表视图用）。 */
  async findActive(userId: USOM_ID, tx: DbClient = db): Promise<Itinerary[]> {
    const rows = await tx.select().from(s.itineraries)
      .where(and(eq(s.itineraries.userId, userId as any), inArray(s.itineraries.status, NON_TERMINAL as any)))
      .orderBy(s.itineraries.startTime)
    return rows.map(itineraryRowToUSOM)
  }
}
