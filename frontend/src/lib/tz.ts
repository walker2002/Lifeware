/**
 * @file tz
 * @brief [TZ-1] 跨 Node/browser 一致的时区工具
 *
 * **设计意图（架构治本）**：
 * 1. DB 持久化 ISO 8601 UTC（schema `timestamp with time zone`）
 * 2. user_tz（用户配置时区）由 `getEffectiveTimezone(userId)` 提供：
 *    DB → 系统时区（`Intl.DateTimeFormat().resolvedOptions().timeZone`）→ 'Asia/Shanghai' 三级 fallback
 * 3. Handler internal arithmetic + UI 渲染都用 user_tz（不再依赖浏览器本地时区偶然 = Shanghai）
 * 4. `(HH:MM, date)` 输入视为 user_tz 本地时间，统一经 `hhmmToIso(hhmm, date, tz)` 转 UTC 落库
 *
 * 历史背景：
 * - 旧 `time-input-helpers.ts:hhmmToIso` 直接拼 `${date}T${hhmm}:00.000Z` 把 "08:00" 当 UTC 字面
 * - 旧 `orchestration-handler.ts:extractOccupiedSlots` 用 `getUTCHours`（canonical UTC arithmetic）
 * - 旧 `parse-timeboxes.ts:36` 注释说 "ISO 标签代表用户本地时刻"（与 UTC arithmetic 冲突）
 * - 用户报告：/ScheduleProposal 添加的记录在 /timeboxes 显示 +8 小时（Shanghai 浏览器 UTC 8 → getHours 16）
 *
 * 本模块提供 cross-platform helper（不依赖运行时 TZ）：
 * - `tzLocalToUtcMs(y, mo, d, h, m, tz)`：把 tz-local 时刻转 UTC ms
 * - `getUserTzHour(date, tz)` / `getUserTzMinute(date, tz)`：取 tz 分量
 * - `isoToHhmmInUserTz(iso, tz)`：ISO → "HH:MM"（按 tz 显示）
 * - `getSystemTimezone()`：系统时区兜底（SSR / CI / Node 默认）
 */

/**
 * tz-local 时刻 → UTC ms（跨 Node/browser 一致，不依赖运行时 TZ）
 *
 * 用 Intl.DateTimeFormat 在指定 tz 下"显示"猜测的 UTC 时刻，
 * 反向得到 tz offset（noon 时刻避开 DST 边缘）。
 *
 * @example
 * tzLocalToUtcMs(2026, 7, 12, 8, 0, 'Asia/Shanghai') // = 2026-07-12T00:00:00.000Z
 * tzLocalToUtcMs(2026, 7, 12, 22, 0, 'Asia/Tokyo')   // = 2026-07-12T13:00:00.000Z
 */
export function tzLocalToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  // 1. 假设 (year, month, day, hour, minute) 是 UTC，构造 guessUtc
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute)
  // 2. 用 Intl 在 tz 下"显示" guessUtc 得到 tz-local 时刻分量
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(guessUtc))
  const get = (type: string): number =>
    Number(parts.find(p => p.type === type)?.value ?? '0')
  const hourStr = get('hour')
  // en-GB 等 locale 偶发 '24:00' 边界
  const adjustedHour = hourStr === 24 ? 0 : hourStr
  // 3. tzDisplayUtc = 把 tz-local 显示分量当作 UTC，得到 tz-local 时刻对应的 UTC 表示
  const tzDisplayUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    adjustedHour,
    get('minute'),
    get('second'),
  )
  // 4. offset = tzDisplayUtc - guessUtc（tz 偏移的 ms 数）
  const offsetMs = tzDisplayUtc - guessUtc
  // 5. 真正 UTC = guessUtc - offset
  return guessUtc - offsetMs
}

/**
 * 取 Date 对象在 tz 下的 hour 分量（0-23）
 */
export function getUserTzHour(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  return hour === 24 ? 0 : hour
}

/**
 * 取 Date 对象在 tz 下的 minute 分量（0-59）
 */
export function getUserTzMinute(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    minute: '2-digit',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'minute')?.value ?? '0')
}

/**
 * ISO 8601 UTC timestamp → "HH:MM"（按 tz 显示）
 * 非法/空输入返回空串（不抛）。
 */
export function isoToHhmmInUserTz(iso: string, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = getUserTzHour(d, tz)
  const m = getUserTzMinute(d, tz)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * ISO 8601 UTC timestamp → datetime-local 输入值 "YYYY-MM-DDTHH:MM"（按 tz 显示）
 * 非法/空输入返回空串（不抛）。
 */
export function isoToLocalDatetimeInputInTz(iso: string, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string): string =>
    parts.find(p => p.type === type)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hourStr = get('hour')
  const adjustedHour = hourStr === '24' ? '00' : hourStr
  return `${year}-${month}-${day}T${adjustedHour}:${get('minute')}`
}

/**
 * 系统时区兜底（SSR / Node / 浏览器均可调用）
 *
 * 三级 fallback（per [TZ-1] 设计）：
 * 1. DB user_settings.timezone（user 配置，per-user 持久化）
 * 2. `Intl.DateTimeFormat().resolvedOptions().timeZone`（运行时系统时区）
 * 3. 'Asia/Shanghai'（兜底，覆盖不支持 Intl 的环境）
 */
export function getSystemTimezone(): string {
  if (typeof Intl !== 'undefined') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      // Intl 异常 → 兜底
    }
  }
  return 'Asia/Shanghai'
}