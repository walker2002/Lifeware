/**
 * @file appointment-window
 * @brief 约定页面查询窗口纯函数（±90 天）
 *
 * 从 app/appointments/page.tsx 抽出。page 退化为 thin wrapper 后由
 * domains/timebox/lib/server/load-appointments.ts 调用。
 * 纯函数：不 IO，可跨 client/server 使用，测试可注入 now。
 */

/** 约定页面默认查询窗口半宽（天）：过去 N 天 + 未来 N 天 */
export const APPOINTMENT_PAGE_WINDOW_DAYS = 90

/**
 * 计算约定页面查询窗口（±90 天），返回 ISO string。
 *
 * 与 AppointmentWorkspace reload 窗口一致（[026.02] T10：7→90 扩窗），
 * 避免 page 首载与 workspace reload 窗口不一致导致数据闪失。
 *
 * @param now - 基准时间，默认 new Date()；测试应注入固定值
 * @returns { start, end } ISO 8601 UTC 字符串
 */
export function getAppointmentPageWindow(now: Date = new Date()): {
  start: string
  end: string
} {
  const start = new Date(now)
  start.setDate(start.getDate() - APPOINTMENT_PAGE_WINDOW_DAYS)
  const end = new Date(now)
  end.setDate(end.getDate() + APPOINTMENT_PAGE_WINDOW_DAYS)
  return { start: start.toISOString(), end: end.toISOString() }
}
