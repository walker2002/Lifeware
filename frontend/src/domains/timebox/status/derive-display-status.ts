/**
 * @file derive-display-status
 * @brief timebox/appointment 读时派生显示状态（[023.12] 时间态不持久化）
 *
 * running/overtime/in_progress/expired 都不写 DB——UI 读时用 now vs 时间区间/日历日算。
 * 纯函数，不 IO。日历日算法与原 reconcile-appointment.ts localDayKey 同语义。
 *
 * [TZ-2.2] tz 必传：localDayKey(d, tz) 用 Intl 取 tz 分量计算 Y/M/D，
 *   不再依赖运行时 OS TZ。生产 callsite（appointment-locked-card.tsx）
 *   通过 useUserTz() 透传 user_tz。
 */
import type { TimeboxStatus, AppointmentStatus } from '@/usom/types/primitives';
import { getUserTzYear, getUserTzMonth, getUserTzDate } from '@/lib/tz';

export type TimeboxDisplayStatus = 'running' | 'overtime' | null;

export function deriveTimeboxDisplayStatus(
  status: TimeboxStatus,
  startTime: string,
  endTime: string,
  now: Date,
): TimeboxDisplayStatus {
  if (status !== 'planned') return null;
  const nowMs = now.getTime();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (nowMs > endMs) return 'overtime';
  if (nowMs >= startMs) return 'running';
  return null;
}

export type AppointmentDisplayStatus = 'in_progress' | 'expired' | null;

/**
 * [TZ-2.2] tz 必传（替代 OS TZ）
 *
 * 用 Intl 取 tz 下的 Y/M/D 计算日历日整数键（年*10000+月*100+日）。
 * 与 reconcile-appointment.ts localDayKey 同语义，但 tz 显式传入避免 OS TZ 耦合。
 */
function localDayKey(d: Date, tz: string): number {
  return getUserTzYear(d, tz) * 10000
       + getUserTzMonth(d, tz) * 100
       + getUserTzDate(d, tz)
}

export function deriveAppointmentDisplayStatus(
  status: AppointmentStatus,
  startTime: string,
  now: Date,
  tz: string,
): AppointmentDisplayStatus {
  if (status !== 'scheduled') return null;
  const nowDay = localDayKey(now, tz);
  const startDay = localDayKey(new Date(startTime), tz);
  if (nowDay > startDay) return 'expired';
  if (nowDay === startDay) return 'in_progress';
  return null;
}