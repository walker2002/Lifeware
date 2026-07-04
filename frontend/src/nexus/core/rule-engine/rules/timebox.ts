// Timebox 基础规则
// T017: 字段完整性、时长范围、开始时间验证
//
// 所有规则仅在 targetDomain === 'timebox' 时生效，
// 避免对 tasks/habits 域产生虚假警告。

import type { Rule, RuleResult } from '../evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 辅助函数 ─────────────────────────────────────────────────

/**
 * 从 intent.fields 中安全获取字段值
 */
function getField(intent: StructuredIntent, key: string): unknown {
  return intent.fields[key]
}

/**
 * 判断值是否为非空字符串
 */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 判断值是否为有效数字
 */
function isValidNumber(value: unknown): boolean {
  return typeof value === 'number' && !isNaN(value)
}

// ─── 1. FieldCompletenessRule ─────────────────────────────────
// 验证 title / startTime / endTime 非空

// [023] A2 QA hot-fix: 改为校验 endTime 而非 duration（duration 字段已撤销，
// 见 A2 OV#P1-#1 + 客户端把 duration 折成 endTime 上送）
const REQUIRED_FIELDS = ['title', 'startTime', 'endTime']

/**
 * 状态转换 action（不含 createTimebox/editTimebox）：title/startTime/endTime 从 DB
 * 行加载（不是 form 提交），字段必含检查应跳过。
 *
 * 与 domains/timebox/rules-registry.ts:STATUS_TRANSITION_ACTIONS 同源——两侧都需
 * 跳过，否则一边漏一边拦截仍会弹 confirmation dialog。
 *
 * [023.03] QA fix: status transition 应当 pass（字段从 DB 加载，submit 端不会
 * 携带），否则核心规则仍会误判 warning → orchestrator 聚合成 NeedConfirm。
 */
const STATUS_TRANSITION_ACTIONS = new Set([
  'startTimebox', 'endTimebox', 'cancelTimebox', 'logTimebox', 'overtimeTimebox',
  'cancelItinerary', 'startItinerary', 'completeItinerary', 'expireItinerary',
])

export const FieldCompletenessRule: Rule = {
  name: 'FieldCompletenessRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    if (intent.targetDomain !== 'timebox') return { severity: 'pass' }

    // [023.03] QA fix: 状态转换 action 跳过字段必含检查（字段从 DB 加载）
    if (typeof intent.action === 'string' && STATUS_TRANSITION_ACTIONS.has(intent.action)) {
      return { severity: 'pass' }
    }

    // [026] P0-2 修复（issue #2 误判 itinerary 缺 endTime → NeedConfirm）：
    //   itinerary 域用 durationMin 而非 endTime（行程时长由 durationMin 决定，
    //   客户端不折 endTime 上送），timebox 域用 endTime。按 action/objectType
    //   分派：itinerary 类（action 名含 "Itinerary"）必含 title/startTime/durationMin；
    //   timebox 类保持原 title/startTime/endTime 三必含。
    if (isItineraryIntent(intent)) {
      return evaluateCompleteness(intent, ['title', 'startTime', 'durationMin'])
    }
    return evaluateCompleteness(intent, REQUIRED_FIELDS)
  },
}

/**
 * 判断 intent 是否属于 itinerary 域。
 *
 * 当前约定：submitDynamicIntent('timebox', 'createItinerary'/'editItinerary'/...) 路由后
 * intent.targetDomain === 'timebox'，但 action 名含 "Itinerary" 是 itinerary 域的
 * 标志（与 resolveObjectType 同款分派逻辑，参 app/actions/timebox.ts:354 / 392 / 409）。
 * 若未来 objectType 字段下推到 intent 层，可改为读 intent.objectType。
 */
function isItineraryIntent(intent: StructuredIntent): boolean {
  return typeof intent.action === 'string' && intent.action.includes('Itinerary')
}

/**
 * 字段必含检查（共享实现）。
 *
 * 接受非空字符串（title/startTime/endTime）或有效 number（durationMin 等数值字段）。
 * 跨类型：timebox 域全字符串字段，itinerary 域 durationMin 是 number —— 兼容。
 *
 * @param intent 结构化意图
 * @param requiredFields 必须存在的字段名集合（任意字段为空 → warning）
 */
function evaluateCompleteness(
  intent: StructuredIntent,
  requiredFields: string[],
): RuleResult {
  const missing: string[] = []
  for (const field of requiredFields) {
    const value = getField(intent, field)
    const present = isNonEmptyString(value) || isValidNumber(value)
    if (!present) missing.push(field)
  }
  if (missing.length === 0) {
    return { severity: 'pass' }
  }
  return {
    severity: 'warning',
    message: `缺少必需字段: ${missing.join(', ')}`,
  }
}

// ─── 2. EndTimeAfterStartRule ─────────────────────────────────
// [023] A2 QA hot-fix: 替代 DurationRangeRule（duration 字段已撤销）。
// 验证 endTime > startTime 且 endTime 距 startTime ≤ 8 小时（合理上限）。

const MAX_TIMEBOX_HOURS = 8

export const EndTimeAfterStartRule: Rule = {
  name: 'EndTimeAfterStartRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    if (intent.targetDomain !== 'timebox') return { severity: 'pass' }

    const startTime = getField(intent, 'startTime')
    const endTime = getField(intent, 'endTime')

    if (!isNonEmptyString(startTime) || !isNonEmptyString(endTime)) {
      return { severity: 'pass' } // 缺失由 FieldCompletenessRule 负责
    }

    const start = Date.parse(startTime as string)
    const end = Date.parse(endTime as string)

    if (isNaN(start) || isNaN(end)) {
      return { severity: 'pass' } // 无效格式由其他规则负责
    }

    if (end <= start) {
      return {
        severity: 'warning',
        message: 'endTime 必须晚于 startTime',
      }
    }

    const durationHours = (end - start) / 3_600_000
    if (durationHours > MAX_TIMEBOX_HOURS) {
      return {
        severity: 'warning',
        message: `时间盒持续 ${durationHours.toFixed(1)} 小时超过 ${MAX_TIMEBOX_HOURS} 小时上限，建议拆分`,
      }
    }

    return { severity: 'pass' }
  },
}

// ─── 3. StartTimeInFutureRule ─────────────────────────────────
// 验证 startTime > 当前时间

export const StartTimeInFutureRule: Rule = {
  name: 'StartTimeInFutureRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    if (intent.targetDomain !== 'timebox') return { severity: 'pass' }

    const startTime = getField(intent, 'startTime')

    // 缺失由 FieldCompletenessRule 负责
    if (!isNonEmptyString(startTime)) {
      return { severity: 'pass' }
    }

    const parsed = Date.parse(startTime as string)

    // 无效日期格式
    if (isNaN(parsed)) {
      return {
        severity: 'warning',
        message: 'startTime 格式无效，无法解析为有效日期',
      }
    }

    const now = Date.now()
    if (parsed <= now) {
      return {
        severity: 'warning',
        message: `startTime 在过去（${startTime}），建议选择未来的时间`,
      }
    }

    return { severity: 'pass' }
  },
}

// ─── 4. DelayedStartRule ──────────────────────────────────────
// start 动作时，如果 startTime 已过超过 30 分钟，返回 warning

const DELAYED_START_THRESHOLD_MS = 30 * 60 * 1000 // 30 分钟

export const DelayedStartRule: Rule = {
  name: 'DelayedStartRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    // 仅对非创建动作生效
    const action = intent.action
    if (action !== 'start_timebox') {
      return { severity: 'pass' }
    }

    const startTime = getField(intent, 'startTime')
    if (!isNonEmptyString(startTime)) {
      return { severity: 'pass' }
    }

    const parsed = Date.parse(startTime as string)
    if (isNaN(parsed)) {
      return { severity: 'pass' }
    }

    const now = Date.now()
    const delayMs = now - parsed

    if (delayMs > DELAYED_START_THRESHOLD_MS) {
      const delayMinutes = Math.round(delayMs / 60000)
      return {
        severity: 'warning',
        message: `开始时间已过 ${delayMinutes} 分钟，确认要开始吗？`,
      }
    }

    return { severity: 'pass' }
  },
}
