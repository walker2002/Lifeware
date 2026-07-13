/**
 * @file reconcile-appointment.ts
 * @brief 约定显示状态派生（[023.12] T5 改造：纯函数 badge 派生）
 *
 * [023.12] T5 决策大脑：3 态持久化后，in_progress / expired 不再落库——读时由本函数
 * 派生显示状态 badge。取代 [026] D2 reversal 时的「reconcileAppointmentStatuses
 * 返回 write 行动 → 逐条 submitDynamicIntent」写库路径。
 *
 * 纯函数：不 IO、不写库。按日历日（localDayKey：年*10000+月*100+日）比较。
 * T3 derive-display-status.ts 提供 per-appointment 派生，本文件包 list 批量 + 命名收敛。
 *
 * 设计：原 `reconcileAppointmentStatuses` 返回 ReconcileAction 写库行动——
 * 现改造为返回 AppointmentBadge 列表（badge 是 UI 展示需要的，不是 DB 状态）。
 * 命名迁移：`reconcileAppointmentStatuses` 保留作 deprecated alias，指向
 * `deriveAppointmentBadges`；T10 UI 接新名，旧名仅供遗留调用方（罕见）。
 *
 * [TZ-2.2] localDayKey(d, tz) tz 必传：替代 OS TZ；list helper 同步加 tz 参数。
 *   当前 production 无 callsite（仅测试引用，per TZ-2.2 spec grep 验证），
 *   但保持 export API 对称便于未来接入。
 */

import type { Appointment } from '@/usom/types/objects'
import { deriveAppointmentDisplayStatus } from './derive-display-status'
import { getUserTzYear, getUserTzMonth, getUserTzDate } from '@/lib/tz'

/** [TZ-2.2] tz 必传（与 derive-display-status.ts 同语义） */
function localDayKey(d: Date, tz: string): number {
  return getUserTzYear(d, tz) * 10000
       + getUserTzMonth(d, tz) * 100
       + getUserTzDate(d, tz)
}

/**
 * 约定显示状态 badge：T5 后仅在内存派生；不持久化
 * - 'in_progress'：约定日 == 今日（scheduled）
 * - 'expired'：约定日 < 今日（scheduled）
 * - null：未来约定 / 非 scheduled 状态
 */
export type AppointmentBadge = {
  appointmentId: string
  badge: 'in_progress' | 'expired' | null
}

/**
 * 批量派生 badge 列表。
 *
 * @param appointments - 约定列表（已过滤 userId）
 * @param now - 当前时间
 * @param tz - IANA 时区（如 'Asia/Shanghai' / 'Asia/Tokyo'）；[TZ-2.2] 必传
 * @returns 每条约定一个 badge
 */
export function deriveAppointmentBadges(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,
): AppointmentBadge[] {
  return appointments.map(a => ({
    appointmentId: a.id as string,
    badge: deriveAppointmentDisplayStatus(a.status, a.startTime, now, tz),
  }))
}

/**
 * 找 badge=expired 的所有约定 ID（UI 列表「过期未处理」过滤用）
 *
 * [TZ-2.2] tz 必传，与 deriveAppointmentBadges 同步
 */
export function findExpiredAppointmentIds(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,
): string[] {
  return deriveAppointmentBadges(appointments, now, tz)
    .filter(b => b.badge === 'expired')
    .map(b => b.appointmentId)
}

/**
 * 找 badge=in_progress 的所有约定 ID（UI 列表「今日执行中」过滤用）
 *
 * [TZ-2.2] tz 必传，与 deriveAppointmentBadges 同步
 */
export function findInProgressAppointmentIds(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,
): string[] {
  return deriveAppointmentBadges(appointments, now, tz)
    .filter(b => b.badge === 'in_progress')
    .map(b => b.appointmentId)
}