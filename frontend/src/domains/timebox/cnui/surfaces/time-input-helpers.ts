/**
 * @file time-input-helpers
 * @brief [023-01+ v2] ISO 8601 ↔ datetime-local 输入互转（按用户本地时区）
 *
 * 后台始终以 ISO 8601（UTC）保存；CNUI 表面的开始/结束时间用
 * `<input type="datetime-local">` 让用户按**本地时区**输入与查看。
 * 本文件负责两个边界互转，集中时区逻辑，避免散落到各组件。
 */

/**
 * ISO 8601 串 → datetime-local 输入值（YYYY-MM-DDTHH:MM，按用户本地时区显示）。
 * 非法/空输入返回空串（不抛），便于 input 受控渲染。
 */
export function isoToLocalDatetimeInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  // 用本地时间分量（getHours/getDate 等），让 datetime-local 显示用户时区的时刻
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * datetime-local 输入值（YYYY-MM-DDTHH:MM）→ ISO 8601 串。
 * `new Date("YYYY-MM-DDTHH:MM")` 按**用户本地时区**解析，toISOString() 转 UTC 落库。
 * 非法/空输入返回空串（不抛）。
 */
export function localDatetimeInputToIso(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}
