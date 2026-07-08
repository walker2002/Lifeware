/**
 * @file appointment-filter
 * @brief [026.02] T2 — AppointmentSummary 过滤纯函数
 *
 * 客户端筛选：status + 日期范围闭区间。
 * 派生组件 AppointmentWorkspace 的 useMemo 直接调用本函数。
 * 纯函数 — 不修改入参，不读外部状态。
 */

import type { AppointmentSummary } from '@/usom/types/summaries'
import type { AppointmentStatus } from '@/usom/types/primitives'

export type AppointmentFilterStatus = AppointmentStatus | 'all'

export interface AppointmentDateRange {
  start: Date
  end: Date
}

/** 按 status + 日期范围过滤约定列表（不修改原数组） */
export function filterAppointments(
  items: readonly AppointmentSummary[],
  status: AppointmentFilterStatus,
  range: AppointmentDateRange,
): AppointmentSummary[] {
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()
  return items.filter(it => {
    if (status !== 'all' && it.status !== status) return false
    const t = new Date(it.startTime).getTime()
    if (t < startMs || t > endMs) return false
    return true
  })
}
