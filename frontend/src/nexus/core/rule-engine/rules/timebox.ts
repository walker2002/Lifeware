// Timebox 基础规则
// T017: 字段完整性、时长范围、开始时间验证

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
// 验证 title / startTime / duration 非空

const REQUIRED_FIELDS = ['title', 'startTime', 'duration']

export const FieldCompletenessRule: Rule = {
  name: 'FieldCompletenessRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    const missing: string[] = []

    for (const field of REQUIRED_FIELDS) {
      const value = getField(intent, field)
      // title 需要非空字符串；startTime 需要存在且非空；duration 需要是数字
      if (field === 'title') {
        if (!isNonEmptyString(value)) {
          missing.push(field)
        }
      } else if (field === 'startTime') {
        if (!isNonEmptyString(value)) {
          missing.push(field)
        }
      } else if (field === 'duration') {
        if (!isValidNumber(value)) {
          missing.push(field)
        }
      } else if (value === undefined || value === null || value === '') {
        missing.push(field)
      }
    }

    if (missing.length === 0) {
      return { severity: 'pass' }
    }

    return {
      severity: 'warning',
      message: `缺少必需字段: ${missing.join(', ')}`,
    }
  },
}

// ─── 2. DurationRangeRule ─────────────────────────────────────
// 验证 5 ≤ duration ≤ 480 分钟

const MIN_DURATION = 5
const MAX_DURATION = 480

export const DurationRangeRule: Rule = {
  name: 'DurationRangeRule',

  evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): RuleResult {
    const duration = getField(intent, 'duration')

    if (!isValidNumber(duration)) {
      return {
        severity: 'warning',
        message: 'duration 不是有效数字',
      }
    }

    const d = duration as number

    if (d < MIN_DURATION) {
      return {
        severity: 'warning',
        message: `duration 过短（${d} 分钟），建议至少 ${MIN_DURATION} 分钟`,
      }
    }

    if (d > MAX_DURATION) {
      return {
        severity: 'warning',
        message: `duration 过长（${d} 分钟），建议不超过 ${MAX_DURATION} 分钟`,
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
