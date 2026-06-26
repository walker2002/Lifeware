/**
 * @file cycle
 * @brief Cycle 仓储实现（OKR 周期一级对象）
 *
 * [022] 1A-T4：Cycle 的 CRUD。后续 T6/T7/T11 的依赖基座。
 * 四个方法均带可选 tx，便于 T13 经 mutation-service 在事务内调用。
 */

import { eq, and } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { Cycle } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { cycleRowToUSOM, cycleUSOMToRow } from '../../../lib/db/repositories/mappers'

/**
 * Cycle 仓储
 */
export class CycleRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Cycle | null> {
    const rows = await tx.select().from(s.cycles)
      .where(and(eq(s.cycles.id, id), eq(s.cycles.userId, userId)))
    return rows[0] ? cycleRowToUSOM(rows[0] as any) : null
  }

  async findByUserAndStatus(status: Cycle['status'], userId: USOM_ID, tx: DbClient = db): Promise<Cycle[]> {
    const rows = await tx.select().from(s.cycles)
      .where(and(eq(s.cycles.userId, userId), eq(s.cycles.status, status)))
    return rows.map((r) => cycleRowToUSOM(r as any))
  }

  async save(cycle: Cycle, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = cycleUSOMToRow(cycle, userId)
    await tx.insert(s.cycles).values(row).onConflictDoUpdate({
      target: s.cycles.id,
      set: row,
    })
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
  ): Promise<Cycle> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.cycles)
      .set(setPayload)
      .where(and(eq(s.cycles.id, id), eq(s.cycles.userId, userId)))
    const got = await this.findById(id, userId, tx)
    if (!got) throw new Error(`Cycle ${id} not found after updateFields`)
    return got
  }
}
