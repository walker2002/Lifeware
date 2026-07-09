/**
 * @file appointment-date-utils
 * @brief [026.02.2] M-4 — appointment 域日期工具（DRY ymdKey 提取）
 *
 * 之前 3 处（appointment-workspace + appointment-mini-calendar + appointment-month-view）
 * 各自实现相同 `ymdKey(d: Date)` 函数，本任务统一到 lib。
 * 使用本地时区（与原实现一致），输出 YYYY-MM-DD。
 */

/**
 * 将 Date 序列化为 YYYY-MM-DD 字符串（本地时区）。
 *
 * @param d - 待序列化的 Date 对象
 * @returns `YYYY-MM-DD` 格式字符串（月份/日期补零到 2 位）
 *
 * @example
 * ymdKey(new Date(2026, 6, 8)) // '2026-07-08'
 */
export function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
