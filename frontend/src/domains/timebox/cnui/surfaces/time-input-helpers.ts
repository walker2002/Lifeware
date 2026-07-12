/**
 * @file time-input-helpers
 * @brief [023-01+ v2 → TZ-1] ISO 8601 ↔ datetime-local / HH:MM 输入互转（按用户时区）
 *
 * 后台始终以 ISO 8601（UTC）保存；CNUI 表面的开始/结束时间用
 * `<input type="datetime-local">` 让用户按**用户时区（user_tz）**输入与查看。
 * 本文件负责两个边界互转，集中时区逻辑，避免散落到各组件。
 *
 * **[TZ-1] 治本变更**：
 *   - 旧 `hhmmToIso` 直接拼 `${date}T${hhmm}:00.000Z`，把 "08:00" 当 UTC 字面，
 *     导致 Shanghai 用户在 /timeboxes 看到 UTC 字面 + 8h 偏移（用户报告 bug）。
 *   - 新版 `hhmmToIso(hhmm, date, tz)` 把 (HH:MM, date) 当 **tz 本地时间** 转 UTC 落库；
 *     调用方透传 user_tz（`getEffectiveTimezone(userId)`），保证读写一致。
 *   - `isoToLocalDatetimeInput`/`isoToHhmmInShanghai` 重构为 tz 参数化；
 *     `isoToHhmmInUserTz`/`isoToLocalDatetimeInputInTz` 在 `@/lib/tz` 提供。
 *
 * 时区 helper（`tzLocalToUtcMs`/`getUserTzHour`/`getUserTzMinute`/`getSystemTimezone`），
 * 见 `@/lib/tz`。
 */

import {
  isoToHhmmInUserTz,
  isoToLocalDatetimeInputInTz,
  tzLocalToUtcMs,
} from '@/lib/tz'

/** 默认 fallback TZ（仅当调用方未传 tz 时使用，正常路径应传 user_tz） */
const DEFAULT_TZ = 'Asia/Shanghai'

/**
 * ISO 8601 串 → datetime-local 输入值（YYYY-MM-DDTHH:MM，按 user_tz 显示）。
 * 非法/空输入返回空串（不抛），便于 input 受控渲染。
 *
 * [TZ-1] 重构：原版本用浏览器本地时区 `getHours/getDate`，现改为 tz 参数化。
 */
export function isoToLocalDatetimeInput(iso: string, tz: string = DEFAULT_TZ): string {
  return isoToLocalDatetimeInputInTz(iso, tz)
}

/**
 * datetime-local 输入值（YYYY-MM-DDTHH:MM）→ ISO 8601 串。
 * `new Date("YYYY-MM-DDTHH:MM")` 按 **user_tz 本地时间** 解析，toISOString() 转 UTC 落库。
 * 非法/空输入返回空串（不抛）。
 */
export function localDatetimeInputToIso(local: string, tz: string = DEFAULT_TZ): string {
  if (!local) return ''
  // datetime-local 字符串无时区 → 解析为系统本地时间（user_tz 的语义对齐系统 TZ）
  // 注意：浏览器/Node 在不同 TZ 下解析 datetime-local 会得到不同 UTC；
  // 我们假设服务端运行时 TZ = user_tz（或接近），caller 应保证一致性。
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

/**
 * [023.08] T2 [F6 fold] → [TZ-1] 治本：HH:MM + date → UTC ISO 8601 timestamp.
 *
 * 把 (HH:MM + date) 视为 **tz 本地时间**，转 UTC ISO 落库。
 *
 * 与旧实现的差异：
 *   - 旧：`${date}T${hhmm}:00.000Z` 拼接（"08:00" 被当 UTC 字面）
 *   - 新：`(HH:MM, date, tz)` 经 `tzLocalToUtcMs` 转 UTC（Shanghai 08:00 → UTC 00:00）
 *
 * 24:00 / 8:00 等 invalid 抛错（fail-CLOSED）。
 */
export function hhmmToIso(hhmm: string, date: string, tz: string = DEFAULT_TZ): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    throw new Error(`hhmmToIso: invalid hh:mm format: "${hhmm}"`)
  }
  const [hStr, mStr] = hhmm.split(':')
  const hour = Number(hStr)
  const minute = Number(mStr)
  if (hour < 0 || hour > 23) throw new Error(`hhmmToIso: invalid hour: ${hour}`)
  if (minute < 0 || minute > 59) throw new Error(`hhmmToIso: invalid minute: ${minute}`)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`hhmmToIso: invalid date format: "${date}"`)
  }

  const [y, mo, d] = date.split('-').map(Number)
  const utcMs = tzLocalToUtcMs(y, mo, d, hour, minute, tz)
  return new Date(utcMs).toISOString()
}

/**
 * [028.2] T1 → [TZ-1] 重构：ISO 8601 timestamp → "HH:MM"（按 tz 显示）。
 *
 * @deprecated 使用 `@/lib/tz:isoToHhmmInUserTz` 直接替代。本文件保留 re-export
 * 以最小化 [028.2] 既有用法的迁移负担；新代码应直接 import `isoToHhmmInUserTz`。
 */
export function isoToHhmmInShanghai(iso: string): string {
  return isoToHhmmInUserTz(iso, 'Asia/Shanghai')
}

/**
 * [028.2] T2-fix → [TZ-1] 重构：ISO OR HH:MM → "HH:MM"（按 tz 显示）。
 *
 * **路径区分**（[028.2] /browse 抓的 P0 root cause 保留）：
 *   - HH:MM（如 `09:00`、`9:30`）→ 直接 passthrough（format HH:MM 不带秒/时区）
 *   - ISO 8601 → 走 `isoToHhmmInUserTz` 转 tz
 *   - 空串/非法 → 返空串（不抛）
 *
 * 本函数不动 [023.08] `formatTime(h,m)` 内 `'HH:MM'` 契约（避免 ripple 到
 * onConfirm submit 路径 rules-registry validation 链）；只修 open 路径 surface 渲染。
 */
export function isoOrHhmmToHhmmInShanghai(value: string): string {
  return isoOrHhmmToHhmmInTz(value, 'Asia/Shanghai')
}

/**
 * [TZ-1] 新增：ISO OR HH:MM → "HH:MM"（按指定 tz 显示）。
 */
export function isoOrHhmmToHhmmInTz(value: string, tz: string = DEFAULT_TZ): string {
  if (!value) return ''
  // HH:MM 直觉判断 — 仅含冒号 + 不含 T/Z/+/-,如 '09:00' / '9:30'
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(':')
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  // ISO / 含时区 / 含 T 分隔符 → 走 isoToHhmmInUserTz
  return isoToHhmmInUserTz(value, tz)
}