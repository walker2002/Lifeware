/**
 * @file appointment repository
 * @brief Appointment CRUD + range + 状态推进（[023.12] T5 3 态收敛）
 *
 * [023.12] T5 后：3 态持久化（scheduled / cancelled / completed）。in_progress / expired
 * 不落库——读时由 status/derive-display-status.ts 派生显示。
 *
 * 状态推进接口：
 * - cancel: scheduled → cancelled（用户主动）
 * - complete: scheduled → completed（用户主动）
 * - revert: {cancelled, completed} → scheduled（用户主动）
 *
 * 多租户 T-02：所有查询/写入必带 userId 过滤。
 * 写入口经 mutation service 调用本 repo，不在调用点直接 new repo 写。
 */

import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import * as s from '@/lib/db/schema'
import { db, type DbClient } from '@/lib/db'
import type { Appointment } from '@/usom/types/objects'
import type { AppointmentStatus, USOM_ID, Timestamp } from '@/usom/types/primitives'
import { appointmentRowToUSOM, appointmentUSOMToRow } from './mappers/appointment'

/** 非终态集合：3 态收敛后仅 scheduled 一态（cancelled/completed 终态） */
const NON_TERMINAL: AppointmentStatus[] = ['scheduled']

export class AppointmentRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Appointment | null> {
    const rows = await tx.select().from(s.appointments)
      .where(and(eq(s.appointments.id, id as any), eq(s.appointments.userId, userId as any)))
    return rows[0] ? appointmentRowToUSOM(rows[0]) : null
  }

  async save(it: Appointment, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = appointmentUSOMToRow(it, userId)
    await tx.insert(s.appointments).values(row).onConflictDoUpdate({
      target: s.appointments.id,
      set: row,
    })
  }

  /** 单 UPDATE，无读后写（R-01）。透传 tx。 */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Appointment> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    // [FIX] Drizzle PgTimestamp.mapToDriverValue 期望 Date 对象；对 ISO 字符串调
    //   .toISOString() 抛 TypeError。handler.ts /editAppointment 等上游 patch
    //   直接传 USOM startTime（ISO 字符串），与 save 路径（appointmentUSOMToRow
    //   显式 `new Date()`）不一致。归一化保证 timestamp 列正确落库。
    if (typeof setPayload.startTime === 'string') {
      setPayload.startTime = new Date(setPayload.startTime)
    }
    await tx.update(s.appointments).set(setPayload)
      .where(and(eq(s.appointments.id, id as any), eq(s.appointments.userId, userId as any)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`Appointment ${id} not found after updateFields`)
    return updated
  }

  /** 软删：盖 cancelledAt + status='cancelled'。从 scheduled 取消。 */
  async cancel(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const now = new Date()
    await tx.update(s.appointments)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(and(eq(s.appointments.id, id as any), eq(s.appointments.userId, userId as any)))
  }

  /**
   * [023.12] T5: scheduled → completed
   * （取代原 markInProgress / markExpired 写库路径——in_progress/expired 改读时派生）
   */
  async complete(id: USOM_ID, userId: USOM_ID, at: Date = new Date(), tx: DbClient = db): Promise<void> {
    await tx.update(s.appointments)
      .set({ status: 'completed', completedAt: at, updatedAt: at })
      .where(and(eq(s.appointments.id, id as any), eq(s.appointments.userId, userId as any)))
  }

  /**
   * [023.12] T5: {cancelled, completed} → scheduled
   * SM 守门：本函数无状态校验——上层 server action 走 SM transition，
   * 非 from {cancelled, completed} 的 revert 会被 SM 拒。
   */
  async revert(id: USOM_ID, userId: USOM_ID, at: Date = new Date(), tx: DbClient = db): Promise<void> {
    await tx.update(s.appointments)
      .set({
        status: 'scheduled',
        // 回退：清掉 cancelledAt / completedAt 痕迹，让行回到「刚 create 完」的可视态
        cancelledAt: null,
        completedAt: null,
        updatedAt: at,
      })
      .where(and(eq(s.appointments.id, id as any), eq(s.appointments.userId, userId as any)))
  }

  /** 范围查询：startTime 落在 [start,end] 且未终态。/timeboxes 读时合并用。 */
  async findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID, tx: DbClient = db): Promise<Appointment[]> {
    const rows = await tx.select().from(s.appointments)
      .where(and(
        eq(s.appointments.userId, userId as any),
        inArray(s.appointments.status, NON_TERMINAL as any),
        gte(s.appointments.startTime, new Date(start)),
        lte(s.appointments.startTime, new Date(end)),
      ))
    return rows.map(appointmentRowToUSOM)
  }

  /**
   * findNeedingReconcile：[023.12] T5 后——派生为「所有非终态」，由调用方按 startTime
   * 派生显示状态（in_progress/expired），不再依赖「写回 in_progress/expired 状态」。
   * 保留方法名兼容 page.tsx 等调用方（[023.12] T5 删了写库 helper，但 T13 仍会调
   * 这条 read 路径派生 badges）。
   */
  async findNeedingReconcile(userId: USOM_ID, tx: DbClient = db): Promise<Appointment[]> {
    const rows = await tx.select().from(s.appointments)
      .where(and(
        eq(s.appointments.userId, userId as any),
        inArray(s.appointments.status, NON_TERMINAL as any),
      ))
    return rows.map(appointmentRowToUSOM)
  }

  /** 列表查询：未终态 + 按 startTime 升序（约定 Page 列表视图用）。 */
  async findActive(userId: USOM_ID, tx: DbClient = db): Promise<Appointment[]> {
    const rows = await tx.select().from(s.appointments)
      .where(and(eq(s.appointments.userId, userId as any), inArray(s.appointments.status, NON_TERMINAL as any)))
      .orderBy(s.appointments.startTime)
    return rows.map(appointmentRowToUSOM)
  }
}
