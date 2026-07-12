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

/**
 * [023.08] T2 [F6 fold]: HH:MM + date → UTC ISO 8601 timestamp.
 *
 * Orchestration proposal payload.startTime/endTime 用 "HH:MM" 字符串（human-friendly），
 * 但 DB timebox schema 要求 ISO 8601。本 helper 是 server-side bridge,与 [023.09]
 * canonical UTC arithmetic 一致;24:00 / 8:00 等 invalid 抛错(fail-CLOSED)。
 */
export function hhmmToIso(hhmm: string, date: string): string {
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

  // UTC ISO (Z 结尾);与 [023.09] canonical UTC invariant 一致
  return `${date}T${hhmm}:00.000Z`
}

/**
 * [028.2] T1: ISO 8601 timestamp → "HH:MM" 字符串（按 Asia/Shanghai 时区显示）。
 *
 * Reverse of `hhmmToIso`：orchestration handler 输出的 payload.startTime/endTime 是 UTC ISO，
 * cnui surface Proposal.startTime/endTime 是 "HH:MM"（human-friendly）。本 helper 强制按
 * `Asia/Shanghai` 时区转换（与 workspace 既有 getTodayDate 约定一致），避免 Node 默认时区漂移。
 *
 * 非法/空输入返回空串（不抛）；fallback 行为与 `isoToLocalDatetimeInput` 对齐。
 */
export function isoToHhmmInShanghai(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // en-GB locale 输出 "HH:MM"（24h，零填充），跨 Node/browser 一致
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

/**
 * [028.2] T2-fix: ISO OR HH:MM → "HH:MM" 字符串（按 Asia/Shanghai 时区显示）。
 *
 * **路径区分**（[028.2] /browse 抓的 P0 root cause）：
 *   - orchestration handler `generateProposals` 直接调 `this.formatTime(cursorHour, cursorMinute)`
 *     写 `payload.startTime/endTime = "HH:MM"`（[023.08] + [028] 全段保留的 internal contract）。
 *   - `hhmmToIso` 把 "HH:MM" 转成 ISO 是落库侧（onConfirm submit 走规则校验）,
 *     不调 open 路径。
 *   - 旧 `isoToHhmmInShanghai` 直接套 "HH:MM" 串 → `new Date("09:00")` Invalid → 返 ''，
 *     让 AIOrchestratePanel 顶部 proposal 卡片显示 ` – `（空时间）。
 *
 * **修法**：
 *   - "HH:MM"（如 `09:00`、`9:30`）→ 直接 passthrough（format HH:MM 不带秒/时区）。
 *   - ISO 8601（包含 'T' 或 'Z' 或 '+HH:MM'）→ 走 `isoToHhmmInShanghai` 转 Asia/Shanghai。
 *   - 空串/非法 → 返空串（不抛，保留原 fallback 语义）。
 *
 * 注意：本函数不动 [023.08] `formatTime(h,m)` 内 `'HH:MM'` 契约（避免 ripple 到
 * onConfirm submit 路径 rules-registry validation 链）；只修 open 路径 surface 渲染。
 */
export function isoOrHhmmToHhmmInShanghai(value: string): string {
  if (!value) return ''
  // [028.2] T2-fix: HH:MM 直觉判断 — 仅含冒号 + 不含 T/Z/+/-,如 '09:00' / '9:30'
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    // 规范化为两位数（'9:30' → '09:30'）保持与 helper 输出格式一致
    const [h, m] = value.split(':')
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  // ISO / 含时区 / 含 T 分隔符 → 走原 isoToHhmmInShanghai
  return isoToHhmmInShanghai(value)
}
