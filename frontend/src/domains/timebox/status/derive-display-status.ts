/**
 * @file derive-display-status
 * @brief timebox/appointment 读时派生显示状态（[023.12] 时间态不持久化）
 *
 * running/overtime/in_progress/expired 都不写 DB——UI 读时用 now vs 时间区间/日历日算。
 * 纯函数，不 IO。日历日算法与原 reconcile-appointment.ts localDayKey 同语义。
 */
import type { TimeboxStatus, AppointmentStatus } from '@/usom/types/primitives';

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

function localDayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function deriveAppointmentDisplayStatus(
  status: AppointmentStatus,
  startTime: string,
  now: Date,
): AppointmentDisplayStatus {
  if (status !== 'scheduled') return null;
  const nowDay = localDayKey(now);
  const startDay = localDayKey(new Date(startTime));
  if (nowDay > startDay) return 'expired';
  if (nowDay === startDay) return 'in_progress';
  return null;
}