/**
 * @file key-result
 * @brief KeyResult 仓储实现
 * 
 * 实现 IKeyResultRepository 接口，提供 KeyResult 数据的数据库操作
 */

import { eq, and } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IKeyResultRepository } from '../../../usom/interfaces/irepository'
import type { KeyResult } from '../../../usom/types/objects'
import type { USOM_ID, KeyResultStatus } from '../../../usom/types/primitives'
import { keyResultRowToUSOM, keyResultUSOMToRow } from '../../../lib/db/repositories/mappers'

/**
 * KeyResult 仓储
 */
export class KeyResultRepository implements IKeyResultRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<KeyResult | null> {
    const rows = await tx.select().from(s.keyResults)
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
    return rows[0] ? keyResultRowToUSOM(rows[0] as any) : null
  }

  async findByObjective(objectiveId: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<KeyResult[]> {
    const rows = await tx.select().from(s.keyResults)
      .where(and(eq(s.keyResults.objectiveId, objectiveId), eq(s.keyResults.userId, userId)))
    return rows.map(r => keyResultRowToUSOM(r as any))
  }

  async updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID): Promise<KeyResult> {
    // 先获取当前 KR 以计算 progressRate
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`KeyResult ${id} not found`)

    const clampedValue = Math.max(0, Math.min(currentValue, existing.targetValue))
    const progressRate = existing.targetValue > 0
      ? Number((clampedValue / existing.targetValue).toFixed(4))
      : 0

    const newStatus = clampedValue >= existing.targetValue ? 'completed' : existing.status

    await db.update(s.keyResults)
      .set({
        currentValue: String(clampedValue),
        progressRate: String(progressRate),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))

    const updated = await this.findById(id, userId)
    if (!updated) throw new Error(`KeyResult ${id} not found after update`)
    return updated
  }

  async batchUpdateStatus(objectiveId: USOM_ID, fromStatus: KeyResultStatus, toStatus: KeyResultStatus, userId: USOM_ID): Promise<void> {
    await db.update(s.keyResults)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(
        eq(s.keyResults.objectiveId, objectiveId),
        eq(s.keyResults.userId, userId),
        eq(s.keyResults.status, fromStatus),
      ))
  }

  async deleteDraft(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    await tx.delete(s.keyResults)
      .where(and(
        eq(s.keyResults.id, id),
        eq(s.keyResults.userId, userId),
        eq(s.keyResults.status, 'draft'),
      ))
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，禁止读后写：直接 update().set(fields).where(id 且 userId) 一次完成。
   * fields 的键为 schema 列属性名（驼峰）。多租户 T-02：where 必含 userId 过滤。
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<KeyResult> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.keyResults)
      .set(setPayload)
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`KeyResult ${id} not found after updateFields`)
    return updated
  }

  async save(keyResult: KeyResult, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = keyResultUSOMToRow(keyResult, userId)
    await tx.insert(s.keyResults).values(row).onConflictDoUpdate({
      target: s.keyResults.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.keyResults)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
  }
}
