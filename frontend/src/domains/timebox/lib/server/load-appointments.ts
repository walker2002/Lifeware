/**
 * @file load-appointments
 * @brief 服务端预取约定列表（lib/server 目录约定：仅 server 调用）
 *
 * 查询窗口来自 appointment-window 纯函数（±90 天，与 AppointmentWorkspace reload 一致）。
 * 从 app/appointments/page.tsx 抽出。
 */
import { getAppointmentsByRange } from '@/app/actions/intent'
import { getAppointmentPageWindow } from '@/domains/timebox/lib/appointment-window'
import type { AppointmentSummary } from '@/usom/types/summaries'

/**
 * 预取约定页面 ±90 天窗口数据
 * @returns AppointmentSummary 列表（startTime 为 ISO string，跨 RSC boundary 安全）
 */
export async function loadAppointmentsForPage(): Promise<AppointmentSummary[]> {
  const { start, end } = getAppointmentPageWindow()
  return getAppointmentsByRange(start, end)
}
