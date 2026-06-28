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
import type { USOM_ID, DateOnly, Timestamp } from '../../../usom/types/primitives'
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

  /**
   * 保存 cycle（按自然键 upsert）。
   *
   * [022] 1A-T8：改按自然键 (user_id, period_start, period_end) 冲突更新，
   * 依赖 uq_cycles_user_period 唯一索引。冲突时保留已有主键 id 与 createdAt，
   * 仅更新其他字段。
   *
   * @returns 实际持久化的 Cycle（含正确的 id——冲突更新后的已有 id）。
   */
  async save(cycle: Cycle, userId: USOM_ID, tx: DbClient = db): Promise<Cycle> {
    const row = cycleUSOMToRow(cycle, userId)
    const { id: _id, createdAt: _createdAt, ...rowWithoutIdAndCreatedAt } = row
    await tx.insert(s.cycles).values(row).onConflictDoUpdate({
      target: [s.cycles.userId, s.cycles.periodStart, s.cycles.periodEnd],
      set: rowWithoutIdAndCreatedAt,
    })
    // 按自然键回查，获取实际持久化的行（id 可能因冲突而不同于输入 cycle.id）
    const rows = await tx
      .select()
      .from(s.cycles)
      .where(
        and(
          eq(s.cycles.userId, userId),
          eq(s.cycles.periodStart, row.periodStart),
          eq(s.cycles.periodEnd, row.periodEnd),
        ),
      )
      .limit(1)
    if (!rows[0]) throw new Error(`Cycle save 后按自然键回查失败`)
    return cycleRowToUSOM(rows[0] as any)
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

  /**
   * 删除周期。多租户 T-02：where 必含 userId 过滤。
   *
   * [024] G1：周期级联检查由调用方（server action）负责——
   * 本方法仅做单行硬删（无 FK ON DELETE 行为需顾虑：objectives.cycleId
   * 若有引用本应在上层被「有目标 → 拒绝删除」拦截）。
   *
   * 用 .returning() 取被删行（drizzle pg 的 delete 不暴露 rowCount，
   * 改用 returning.length 准确判断是否真删了 1 行）。
   *
   * @returns 被删除的行数（0=未找到或被 userId 过滤掉；1=实际删除）。
   */
  async delete(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<number> {
    const deleted = await tx.delete(s.cycles)
      .where(and(eq(s.cycles.id, id), eq(s.cycles.userId, userId)))
      .returning({ id: s.cycles.id })
    return deleted.length
  }

  /**
   * 按客观键 (user_id, period_start, period_end) 查找已有 cycle 或新建。
   *
   * 幂等：任意次调用仅返回同一 cycle 的 id。用于 okr-import 等批量导入场景，
   * 避免每个 objective 都产生重复 cycle 行。
   *
   * @param userId - 用户 ID
   * @param periodType - 原始周期类型枚举（如 weekly/monthly/quarterly/annual）
   * @param periodStart - 周期起始日期 YYYY-MM-DD
   * @param periodEnd - 周期结束日期 YYYY-MM-DD
   * @param status - 新建 cycle 的初始状态，默认 'draft'
   * @param tx - 可选事务句柄
   * @returns 已有或新建的 Cycle
   */
  async findOrCreateCycle(
    userId: USOM_ID,
    periodType: string,
    periodStart: string,
    periodEnd: string,
    status: Cycle['status'] = 'draft',
    tx: DbClient = db,
  ): Promise<Cycle> {
    const existing = await tx.select().from(s.cycles)
      .where(and(
        eq(s.cycles.userId, userId),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
      .limit(1)
    if (existing.length > 0) return cycleRowToUSOM(existing[0] as any)

    const cycleType = deriveCycleType(periodType)
    const cycle: Cycle = {
      id: crypto.randomUUID(),
      cycleType,
      name: ['annual', 'quarterly', 'monthly', 'semi_annual'].includes(periodType)
        ? `${periodStart}~${periodEnd}`
        : `${periodType}:${periodStart}~${periodEnd}`,
      period: { start: periodStart as DateOnly, end: periodEnd as DateOnly },
      status,
      createdAt: new Date().toISOString() as Timestamp,
      updatedAt: new Date().toISOString() as Timestamp,
    }
    await tx.insert(s.cycles).values(cycleUSOMToRow(cycle, userId))
    return cycle
  }
}

/**
 * 把 period_* 枚举映射到 cycleType。
 * annual / quarterly / monthly / semi_annual → 直映；
 * daily / weekly → 'custom'（标注原类型在 name 中）。
 */
function deriveCycleType(periodType: string): Cycle['cycleType'] {
  const KEEP = ['annual', 'quarterly', 'monthly', 'semi_annual']
  return KEEP.includes(periodType)
    ? (periodType as Cycle['cycleType'])
    : 'custom'
}
