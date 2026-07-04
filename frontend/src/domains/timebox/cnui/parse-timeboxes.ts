/**
 * @file parse-timeboxes
 * @brief [023.04] T3 中文意图解析（修改/取消）—— MVP 纯规则
 *
 * 策略：先纯规则解析。无 aiRuntime 时不强依赖 LLM；
 * 解析失败 → kind:'unsure' → handler.open 降级到 selecting 列表。
 *
 * 规则要点：
 * - 中文时间词：「早上/上午」= today 06:00-11:59 范围匹配；「下午」= 12:00-18:00；「晚上」= 18:00-23:59
 * - 时间表达：「HH:MM」/「X 点」/「下午 X 点」/「X 分」直接提取
 * - 标题关键词：today 某条 title 全子串匹配
 * - 动作词：「改/调整/修改/变更」→ edit；「取消/不要了/删除/去掉」→ cancel
 *
 * [023.04] T-eng-6 fold-in：extractHour 无具体数字只匹配时段词（上午/下午/晚上）
 * 时 confidence=0.4（<0.5 门槛 → handler 降级 selecting）；有具体 HH:MM 或 X 点
 * 时 confidence=0.85。
 */

import type { AIRuntime } from '@/nexus/ai-runtime'
import type { TimeboxSummary } from '@/usom/types/summaries'

export type ParsedEditIntent =
  | { kind: 'edit'; timeboxId: string; newTitle?: string; newStartTime?: string; newEndTime?: string; confidence: number }
  | { kind: 'cancel'; timeboxId: string; confidence: number }
  | { kind: 'unsure'; reason: string }
  | { kind: 'noop' }

const CANCEL_KEYWORDS = ['取消', '删除', '去掉', '不要', 'cancel']
const EDIT_KEYWORDS = ['改', '调整', '变更', '修改', '移到', '推迟', '提前']

/**
 * [023.04] T3 时段关键词匹配 —— 用 now 当前小时所属时段
 * 返回匹配到的当日时间盒（仅一条时返回该条；多条时返回首条 / null 由调用方降级）。
 *
 * 注：从 ISO 字符串里直接抽小时分量（不通过 Date 对象转本地时间），
 * 因为项目惯例 = TimeboxSummary.startTime 的 ISO 标签代表"用户本地时刻"
 * （mini-calendar 等回归测试也按此约定）；用 getHours() 会受 runner TZ 干扰。
 */
function getLocalHourFromIso(iso: string): number {
  const m = iso.match(/T(\d{2}):\d{2}/)
  return m ? Number(m[1]) : Number.NaN
}

function matchByTimeWord(today: TimeboxSummary[], now: Date): TimeboxSummary | null {
  const hour = now.getHours()
  if (hour < 12) {
    // 早/上午 范围匹配
    const morning = today.filter(t => {
      const h = getLocalHourFromIso(t.startTime)
      return Number.isFinite(h) && h < 12
    })
    return morning.length === 1 ? morning[0] : morning[0] ?? null
  }
  if (hour < 18) {
    const afternoon = today.filter(t => {
      const h = getLocalHourFromIso(t.startTime)
      return Number.isFinite(h) && h >= 12 && h < 18
    })
    return afternoon.length === 1 ? afternoon[0] : afternoon[0] ?? null
  }
  return null
}

/**
 * [023.04] T3 标题关键词匹配 —— today 任一条 title 全子串匹配
 */
function matchByKeyword(today: TimeboxSummary[], input: string): TimeboxSummary | null {
  for (const tb of today) {
    if (input.includes(tb.title)) return tb
  }
  return null
}

/**
 * [023.04] T3 extractHour
 * - 「下午 14:00」/「15:30」/「3 点」/「3 点半」→ 返回具体小时
 * - 仅时段词（「上午」/「下午」/「晚上」）无具体数字 → 返回时段默认值
 *   并标 hadDigit=false（用于 confidence 判定）
 * - 其他 → null
 */
function extractHour(input: string, now: Date): { hour: number; hadDigit: boolean } | null {
  // 「下午 14:00」/「15:30」 → HH:MM
  const timeMatch = input.match(/(\d{1,2})[：:](\d{1,2})/)
  if (timeMatch) return { hour: Number(timeMatch[1]), hadDigit: true }
  // 「3 点」/「3 点半」/「下午 3 点」
  const hourMatch = input.match(/(\d{1,2})\s*点/)
  if (hourMatch) {
    let h = Number(hourMatch[1])
    if (input.includes('下午') || input.includes('晚上')) {
      if (h < 12) h += 12
    } else if (input.includes('上午') || input.includes('早上') || input.includes('凌晨')) {
      if (h === 12) h = 0
    }
    return { hour: h, hadDigit: true }
  }
  // [023.04] T-eng-6 fold-in：仅时段词 → 用 now 时段的 right-bound，且 hadDigit=false
  if (input.includes('下午')) return { hour: 14, hadDigit: false }
  if (input.includes('晚上')) return { hour: 19, hadDigit: false }
  if (input.includes('上午') || input.includes('早上')) return { hour: 9, hadDigit: false }
  return null
}

/**
 * [023.04] T3 主入口 —— parseTimeboxesIntent
 *
 * 流程：
 * 1) 识别动作（cancel / edit）—— 命中 CANCEL/EDIT 关键词
 *    - 无动作词 + 有查询词（看/查/打开/列表）→ noop
 *    - 无动作词 + 无查询词 → unsure
 * 2) 匹配目标时间盒（先 title 关键词 → 后时段词 → 都不行 → unsure）
 * 3) cancel 路径：直接返回 cancel + confidence
 * 4) edit 路径：extractHour —— null → unsure
 *                      —— hadDigit=false → confidence=0.4(<0.5 触发 handler 降级)
 *                      —— hadDigit=true  → confidence=0.85
 */
export async function parseTimeboxesIntent(
  rawInput: string,
  todayTimeboxes: TimeboxSummary[],
  _aiRuntime?: AIRuntime,
  now: Date = new Date(),
): Promise<ParsedEditIntent> {
  const lower = rawInput.toLowerCase()

  // 1. 解析动作（cancel / edit / noop）
  let action: 'edit' | 'cancel' | null = null
  if (CANCEL_KEYWORDS.some(k => lower.includes(k))) action = 'cancel'
  else if (EDIT_KEYWORDS.some(k => lower.includes(k))) action = 'edit'
  if (!action) {
    // 纯查询类（无动作词）
    if (lower.includes('看') || lower.includes('查') || lower.includes('打开') || lower.includes('列表')) {
      return { kind: 'noop' }
    }
    return { kind: 'unsure', reason: '未识别到修改/取消动作词' }
  }

  // 2. 匹配目标时间盒（先用关键词，再用时段，再降级 unsure）
  const target =
    matchByKeyword(todayTimeboxes, rawInput) ??
    matchByTimeWord(todayTimeboxes, now)
  if (!target) {
    return { kind: 'unsure', reason: '未匹配到当日时间盒' }
  }

  // 3. cancel 路径
  if (action === 'cancel') {
    return { kind: 'cancel', timeboxId: target.id, confidence: 0.85 }
  }

  // 4. edit 路径：尝试提取新时间
  const extracted = extractHour(rawInput, now)
  if (extracted == null) {
    return { kind: 'unsure', reason: '未识别到新时间' }
  }

  // [023.04] T-eng-6 fold-in：仅时段词无具体数字 → confidence=0.4(<0.5 触发 unsure 降级)
  const confidence = extracted.hadDigit ? 0.85 : 0.4

  // 构造新 startTime / endTime（保留原 duration）
  // 用 now 的 ISO 日期 + UTC+08:00 偏移构造
  const todayStr = now.toISOString().split('T')[0]
  const newStart = new Date(`${todayStr}T${String(extracted.hour).padStart(2, '0')}:00:00+08:00`).toISOString()
  if (isNaN(new Date(newStart).getTime())) {
    return { kind: 'unsure', reason: '时间解析失败' }
  }
  const duration = new Date(target.endTime).getTime() - new Date(target.startTime).getTime()
  const newEnd = new Date(new Date(newStart).getTime() + duration).toISOString()
  return {
    kind: 'edit',
    timeboxId: target.id,
    newStartTime: newStart,
    newEndTime: newEnd,
    confidence,
  }
}
