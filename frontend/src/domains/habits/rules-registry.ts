/**
 * @file rules-registry
 * @brief habits 域规则注册表（命令式处理器）。
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。
 * - realtime（phase: both）：action-invariant 单字段纯函数，客户端 blur
 * - submit（phase: submit）：habit_action_fields_valid 聚合规则，逐字复刻现状
 *   hooks.ts onValidate 全分支（复用 validateHabitFields），返回 validationRejected(全部 errors)
 *
 * [020] registry 即 SSOT：每条 rule 自带 { check, fields, message } meta，
 * realtime rule 的 message 引用 HABIT_RULE_MESSAGES 单源常量（与 validation.ts 共用），
 * manifest 不再声明 rules。D 模式：聚合规则置首，submit 聚合时其 Rejected 先胜出、吞掉粒度规则。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'
import type { StructuredIntent } from '@/usom/types/objects'
import { validateHabitFields, isValidHHMM, HABIT_RULE_MESSAGES } from './validation'

const VALID_FREQUENCY_TYPES = ['daily', 'weekly', 'custom']

// ── realtime checks（phase: both，action-invariant 单字段纯函数）──────────
/** 仅在值「存在且为 number 且 ≤0」时报错（允许 update 部分更新时不传该字段） */
const defaultDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'defaultDuration', message: HABIT_RULE_MESSAGES.defaultDurationPositive }]
  }
  return []
}
const minDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'minDuration', message: HABIT_RULE_MESSAGES.minDurationPositive }]
  }
  return []
}
const frequencyTypeValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && !VALID_FREQUENCY_TYPES.includes(value)) {
    return [{ field: 'frequencyType', message: HABIT_RULE_MESSAGES.frequencyTypeValid }]
  }
  return []
}
/**
 * 仅在字段「有值」时校验格式（undefined/null 跳过，允许部分更新）。
 * message 引用 HABIT_RULE_MESSAGES 单源常量（与 validation.ts submit 聚合共用）。
 */
function timeFormatCheck(field: string, message: string): RealtimeCheck {
  return (value) => {
    if (value !== undefined && value !== null && !isValidHHMM(value)) {
      return [{ field, message }]
    }
    return []
  }
}

// ── submit 聚合（phase: submit）—— 逐字复刻现状 hooks.ts onValidate body ──
const actionFieldsValid: SubmitCheck = async (intent) => {
  const errors: string[] = []
  const { fields } = intent
  const action = intent.action

  if (action === 'createHabit' || action === 'updateHabit') {
    errors.push(...validateHabitFields(fields, action as 'createHabit' | 'updateHabit').errors)
  }

  if (action === 'logHabit') {
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  const lifecycleActions = ['activateHabit', 'suspendHabit', 'archiveHabit', 'reactivateHabit']
  if (lifecycleActions.includes(action)) {
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const habitRuleRegistry: DomainRuleRegistry = {
  realtime: {
    habit_default_duration_positive: {
      check: defaultDurationPositive,
      fields: ['defaultDuration'],
      message: HABIT_RULE_MESSAGES.defaultDurationPositive,
    },
    habit_min_duration_positive: {
      check: minDurationPositive,
      fields: ['minDuration'],
      message: HABIT_RULE_MESSAGES.minDurationPositive,
    },
    habit_frequency_type_valid: {
      check: frequencyTypeValid,
      fields: ['frequencyType'],
      message: HABIT_RULE_MESSAGES.frequencyTypeValid,
    },
    habit_default_time_format: {
      check: timeFormatCheck('defaultTime', HABIT_RULE_MESSAGES.defaultTimeFormat),
      fields: ['defaultTime'],
      message: HABIT_RULE_MESSAGES.defaultTimeFormat,
    },
    habit_earliest_time_format: {
      check: timeFormatCheck('earliestTime', HABIT_RULE_MESSAGES.earliestTimeFormat),
      fields: ['earliestTime'],
      message: HABIT_RULE_MESSAGES.earliestTimeFormat,
    },
    habit_latest_time_format: {
      check: timeFormatCheck('latestStartTime', HABIT_RULE_MESSAGES.latestTimeFormat),
      fields: ['latestStartTime'],
      message: HABIT_RULE_MESSAGES.latestTimeFormat,
    },
  },
  submit: {
    habit_action_fields_valid: {
      check: actionFieldsValid,
      fields: ['title', 'defaultTime', 'earliestTime', 'latestStartTime', 'defaultDuration', 'minDuration', 'frequencyType', 'habitId', 'name', 'applicableDays', 'templateId', 'date', 'timeOverride'],
      message: '习惯字段校验失败',
    },
  },
}
