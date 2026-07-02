/**
 * @file cycle
 * @brief Cycle 仓储：CRUD + 自然键查重 + 状态持久化（updateStatus 独立于 save 的 onConflictDoUpdate）
 *
 * [022] 1A-T4 → [022.01] Phase 1/2 演进：
 * - save 按自然键 (userId, periodStart, periodEnd) upsert，SET 排除 status 防降级
 * - updateStatus 直写 status + 时间戳（SM 调用，与 save 分离）
 * - 方法均带可选 tx 参数，支持事务内调用
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
   * 按自然键 (userId, periodStart, periodEnd) 查找 cycle。
   * 供 adapter.cycle.create 前置查重使用，避免 onConflictDoUpdate 覆写已有 status。
   */
  async findByPeriod(
    userId: USOM_ID,
    periodStart: string,
    periodEnd: string,
    tx: DbClient = db,
  ): Promise<Cycle | null> {
    const rows = await tx.select().from(s.cycles)
      .where(and(
        eq(s.cycles.userId, userId),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
      .limit(1)
    return rows[0] ? cycleRowToUSOM(rows[0] as any) : null
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
    // [022.01] iter 3 修复：onConflictDoUpdate 的 SET 子句必须排除生命周期字段
    // (status/startedAt/endedAt/reviewedAt)，避免同自然键已有 in_progress cycle 被
    // adapter.create 构造的 draft 降级。仅更新 name/cycleType/updatedAt 等可写字段。
    const {
      id: _id,
      createdAt: _createdAt,
      status: _status,
      startedAt: _startedAt,
      endedAt: _endedAt,
      reviewedAt: _reviewedAt,
      ...rowWithoutLifecycle
    } = row
    await tx.insert(s.cycles).values(row).onConflictDoUpdate({
      target: [s.cycles.userId, s.cycles.periodStart, s.cycles.periodEnd],
      set: rowWithoutLifecycle,
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
   * 更新周期状态（[022.01] Phase 2：供 SM 状态转换持久化使用）。
   *
   * CycleRepository.save 的 onConflictDoUpdate SET 排除了 status 等生命周期字段
   * （Phase 1 iter 3 防降级），因此状态更新必须走独立的 UPDATE 路径。
   *
   * 时间戳规则（按 manifest cycle lifecycle transitions）：
   * - in_progress → startedAt = now
   * - ended → endedAt = now（保留已有 startedAt）
   * - reviewed → reviewedAt = now（保留已有 startedAt/endedAt）
   * - draft/not_started → 无特殊时间戳（仅 updatedAt）
   *
   * @param id - 周期 ID
   * @param status - 目标状态（draft | not_started | in_progress | ended | reviewed）
   * @param userId - 用户 ID（多租户 T-02）
   * @param tx - 可选事务句柄
   * @returns 更新后的完整 Cycle
   */
  async updateStatus(
    id: USOM_ID,
    status: Cycle['status'],
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Cycle> {
    const existing = await this.findById(id, userId, tx)
    if (!existing) throw new Error(`Cycle ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    }
    if (status === 'in_progress') updates.startedAt = now
    if (status === 'ended') updates.endedAt = now
    if (status === 'reviewed') updates.reviewedAt = now

    await tx.update(s.cycles)
      .set(updates)
      .where(and(eq(s.cycles.id, id), eq(s.cycles.userId, userId)))

    return {
      ...existing,
      status,
      updatedAt: now.toISOString() as Timestamp,
      ...(status === 'in_progress' && { startedAt: now.toISOString() as Timestamp }),
      ...(status === 'ended' && { endedAt: now.toISOString() as Timestamp }),
      ...(status === 'reviewed' && { reviewedAt: now.toISOString() as Timestamp }),
    }
  }

}
