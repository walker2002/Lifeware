/**
 * @file format-duration
 * @brief 时长格式化与解析工具函数
 *
 * 将分钟数与"xx小时xx分钟"格式互相转换。
 * 后端存储统一使用分钟数，UI 层负责显示/输入转换。
 */

/**
 * 将分钟数格式化为中文时长文本
 * @param minutes - 总分钟数
 * @returns 格式化文本（如 "2小时30分钟"、"45分钟"、"1小时"），空值返回空字符串
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return ''
  const total = Math.floor(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}分钟`
  if (m === 0) return `${h}小时`
  return `${h}小时${m}分钟`
}

/**
 * 将小时和分钟输入合并为总分钟数
 * @param hours - 小时输入值
 * @param minutes - 分钟输入值
 * @returns 总分钟数（两项均为空或 0 时返回 0）
 */
export function parseDurationToMinutes(hours: string, minutes: string): number {
  const h = parseInt(hours, 10) || 0
  const m = parseInt(minutes, 10) || 0
  return h * 60 + m
}

/**
 * 从总分钟数提取小时部分
 * @param minutes - 总分钟数
 * @returns 小时数字符串（空值返回空字符串）
 */
export function durationHours(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(Math.floor(minutes / 60))
}

/**
 * 从总分钟数提取分钟部分
 * @param minutes - 总分钟数
 * @returns 分钟数字符串（空值返回空字符串）
 */
export function durationMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(minutes % 60)
}
