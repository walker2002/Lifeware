/**
 * @file repository
 * @brief 时间盒仓储实现
 *
 * 实现 ITimeboxRepository 接口，提供时间盒数据的数据库操作
 *
 * Appointment 与 Timebox 同库同 namespace（[026]），共享通用 repo-adapter；
 * 这里 re-export AppointmentRepository 让 `@/domains/timebox/repository` 取得到。
 */

export { AppointmentRepository } from './appointment'

import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { Timebox, ExecutionRecord } from '@/usom/types/objects'
import type { USOM_ID, Timestamp, TimeboxStatus } from '@/usom/types/primitives'
import { timeboxRowToUSOM, timeboxUSOMToRow } from '@/lib/db/repositories/mappers'
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'

/**
 * 加载时间盒关联的任务和习惯 ID
 *
 * @param timeboxId - 时间盒 ID
 * @param tx - 可选事务句柄，缺省回退到 db 单例
 * @returns 关联的任务 ID 和习惯 ID 列表
 */
async function loadJunctions(timeboxId: USOM_ID, tx: DbClient = db): Promise<{ taskIds: USOM_ID[]; habitIds: USOM_ID[] }> {
  const [taskLinks, habitLinks] = await Promise.all([
    tx.select().from(s.timeboxTasks).where(eq(s.timeboxTasks.timeboxId, timeboxId)),
    tx.select().from(s.timeboxHabits).where(eq(s.timeboxHabits.timeboxId, timeboxId)),
  ])
  return {
    taskIds: taskLinks.map(l => l.taskId),
    habitIds: habitLinks.map(l => l.habitId),
  }
}

export class TimeboxRepository implements ITimeboxRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Timebox | null> {
    const rows = await tx.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
    if (!rows[0]) return null
    const { taskIds, habitIds } = await loadJunctions(id, tx)
    return timeboxRowToUSOM(rows[0] as any, taskIds, habitIds)
  }

  /**
   * [026.02.4] TD-028 Site 0: derive 'running' as planned + now ∈ [start, end]
   * (matches v_running_timeboxes view + derive-display-status.ts logic)
   *
   * 旧实现查 status='running'，但 timeboxes.status enum 不含 'running'
   * （[023.12] 3 态收敛：planned/logged/cancelled）。6 个 caller + 6 个 mock
   * 都因此拿到 []。本方法改为读时派生：status='planned' 且 NOW() 落在
   * [start_time, end_time] 区间内即视为 running。
   */
  async findRunning(userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(
        eq(s.timeboxes.userId, userId),
        eq(s.timeboxes.status, 'planned'),
        lte(s.timeboxes.startTime, sql`NOW()`),
        gte(s.timeboxes.endTime, sql`NOW()`),
      ))
    return this.loadWithJunctions(rows)
  }

  async findByStatus(status: TimeboxStatus, userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), eq(s.timeboxes.status, status)))
    return this.loadWithJunctions(rows)
  }

  async findUpcoming(userId: USOM_ID, withinHours = 2): Promise<Timebox[]> {
    const now = new Date()
    const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000)
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), gte(s.timeboxes.startTime, now), lte(s.timeboxes.startTime, cutoff)))
    return this.loadWithJunctions(rows)
  }

  async findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID): Promise<Timebox[]> {
    const rows = await db.select().from(s.timeboxes)
      .where(and(eq(s.timeboxes.userId, userId), gte(s.timeboxes.endTime, new Date(start)), lte(s.timeboxes.startTime, new Date(end))))
    return this.loadWithJunctions(rows)
  }

  async save(timebox: Timebox, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = timeboxUSOMToRow(timebox, userId)
    await tx.insert(s.timeboxes).values(row).onConflictDoUpdate({
      target: s.timeboxes.id,
      set: row,
    })
    await tx.delete(s.timeboxTasks).where(eq(s.timeboxTasks.timeboxId, timebox.id))
    await tx.delete(s.timeboxHabits).where(eq(s.timeboxHabits.timeboxId, timebox.id))
    const taskIds = (timebox as unknown as Record<string, unknown>).taskIds as USOM_ID[] | undefined
    const habitIds = (timebox as unknown as Record<string, unknown>).habitIds as USOM_ID[] | undefined
    if (taskIds?.length) {
      await tx.insert(s.timeboxTasks).values(taskIds.map(taskId => ({ timeboxId: timebox.id, taskId })))
    }
    if (habitIds?.length) {
      await tx.insert(s.timeboxHabits).values(habitIds.map(habitId => ({ timeboxId: timebox.id, habitId })))
    }
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * [TD-003] T2：OCC 乐观并发控制 — 单条 UPDATE WHERE id AND userId AND
   * occ_version = expectedOccVersion 一次完成：
   * - 0 rows affected → 抛 ConflictError(currentOccVersion, attemptedOccVersion)
   * - 1 row → 返回更新后的 Timebox（occVersion 自动 +1）
   *
   * 为什么 OCC 在 Repository 层：plan-eng-review Codex P0+P1+P2 fix
   * (multi-field atomic update + READ COMMITTED atomic UPDATE + 避开
   * nexus blanket catch swallowing)。field-executor (Task 3) 重构后
   * 走 single batch updateFields 调用，OCC 在此 single atomic UPDATE 内关掉。
   *
   * 仅更新 timeboxes 主表字段；junction（taskIds/habitIds）不在字段写范围内。
   * fields 的键为 schema 列属性名（驼峰）。
   * 多租户 T-02：where 必含 userId 过滤。
   *
   * 抛错场景：
   * - ConflictError：occVersion stale（外部已修改）或行 id/userId 不匹配
   * - 「Timebox not found after updateFields」：理论不会触发（0 rows 走 ConflictError 分支），
   *   仅当 row 在 UPDATE 与 findById 之间被删（极小窗口）
   *
   * @param id - 时间盒 ID
   * @param fields - 待更新字段
   * @param userId - 用户 ID
   * @param expectedOccVersion - caller 认为的当前 occ_version（OCC 必填）
   * @param tx - 可选事务句柄
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    expectedOccVersion: number,
    tx: DbClient = db,
  ): Promise<Timebox> {
    // OCC atomic UPDATE：SET occ_version = occ_version + 1 同时校验 expectedOccVersion
    const setPayload: Record<string, unknown> = {
      ...fields,
      occVersion: sql`${s.timeboxes.occVersion} + 1`,
      updatedAt: new Date(),
    }
    const result = await tx.update(s.timeboxes)
      .set(setPayload)
      .where(and(
        eq(s.timeboxes.id, id),
        eq(s.timeboxes.userId, userId),
        eq(s.timeboxes.occVersion, expectedOccVersion),
      ))
      .returning({ id: s.timeboxes.id })

    if (result.length === 0) {
      // 0 rows：要么 occVersion stale，要么 id/userId 不匹配
      // 读 current occVersion 给 caller（retry / UX 用）
      const [currentRow] = await tx.select({ occVersion: s.timeboxes.occVersion })
        .from(s.timeboxes)
        .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
      const currentOccVersion = currentRow?.occVersion ?? -1
      throw new ConflictError(currentOccVersion, expectedOccVersion)
    }
    const updated = await this.findById(id, userId, tx)
    if (!updated) {
      throw new Error(`Timebox ${id} not found after updateFields`)
    }
    return updated
  }

  async archive(id: USOM_ID, userId: USOM_ID, executionRecord?: ExecutionRecord): Promise<void> {
    const updates: Record<string, unknown> = {
      status: 'logged',
      loggedAt: new Date(),
    }
    if (executionRecord) {
      updates.executionRecord = executionRecord as unknown as Record<string, unknown>
    }
    await db.update(s.timeboxes)
      .set(updates)
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
  }

  /**
   * 回退：{logged, cancelled} → planned（[023.12] T4）
   *
   * 软重置：仅盖 status='planned' + updatedAt=now，不动 executionRecord /
   * startedAt / loggedAt 等历史字段——回退 = 「撤销 SM 转换」而非「清空数据」。
   * 若调用方要彻底回退（如 AM7 守卫想清 executionRecord），由调用点显式
   * 在 revert 前清空（这里不耦合 AM7 业务决策，保持仓储纯粹）。
   *
   * 多租户 T-02：where 必含 userId。
   *
   * @param id - 时间盒 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   */
  async revertTransition(
    id: USOM_ID,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<void> {
    await tx.update(s.timeboxes)
      .set({ status: 'planned', updatedAt: new Date() })
      .where(and(eq(s.timeboxes.id, id), eq(s.timeboxes.userId, userId)))
  }

  private async loadWithJunctions(rows: any[]): Promise<Timebox[]> {
    const results: Timebox[] = []
    for (const row of rows) {
      const { taskIds, habitIds } = await loadJunctions(row.id)
      results.push(timeboxRowToUSOM(row as any, taskIds, habitIds))
    }
    return results
  }
}
