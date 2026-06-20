/**
 * @file rules-registry
 * @brief [018-G3] R1 habits 域规则注册表（命令式处理器）
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。
 * - realtime（phase: both）：action-invariant 单字段纯函数，客户端 blur
 * - submit（phase: submit）：habit_action_fields_valid 聚合规则，逐字复刻现状
 *   hooks.ts onValidate 全分支（复用 validateHabitFields），返回 validationRejected(全部 errors)
 *
 * D 模式：聚合规则在 manifest 中置首，submit 聚合时其 Rejected 先胜出、吞掉粒度规则。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'
import type { StructuredIntent } from '@/usom/types/objects'
import { validateHabitFields, isValidHHMM } from './validation'

const VALID_FREQUENCY_TYPES = ['daily', 'weekly', 'custom']

// ── realtime checks（phase: both，action-invariant 单字段纯函数）──────────
/** 仅在值「存在且为 number 且 ≤0」时报错（允许 update 部分更新时不传该字段） */
const defaultDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'defaultDuration', message: '默认时长必须大于 0' }]
  }
  return []
}
const minDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'minDuration', message: '最短时长必须大于 0' }]
  }
  return []
}
const frequencyTypeValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && !VALID_FREQUENCY_TYPES.includes(value)) {
    return [{ field: 'frequencyType', message: '频率类型必须是 daily/weekly/custom' }]
  }
  return []
}
/** 仅在字段「有值」时校验格式（undefined/null 跳过，允许部分更新） */
function timeFormatCheck(field: string, label: string): RealtimeCheck {
  return (value) => {
    if (value !== undefined && value !== null && !isValidHHMM(value)) {
      return [{ field, message: `${label}必须是有效的 HH:MM 格式` }]
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

  if (action === 'createTemplate') {
    const name = fields['name']
    if (!name || (typeof name === 'string' && name.trim() === '')) errors.push('name 必填')
    const applicableDays = fields['applicableDays']
    if (!Array.isArray(applicableDays) || applicableDays.length === 0) errors.push('applicableDays 不能为空')
  }

  if (action === 'addHabitToTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
    const timeOverride = fields['timeOverride']
    if (timeOverride !== undefined && !isValidHHMM(timeOverride)) errors.push('timeOverride 必须是有效的 HH:MM 格式')
  }

  if (action === 'removeHabitFromTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  if (action === 'applyTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const date = fields['date']
    if (!date || typeof date !== 'string') errors.push('date 必填')
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const habitRuleRegistry: DomainRuleRegistry = {
  realtime: {
    habit_default_duration_positive: defaultDurationPositive,
    habit_min_duration_positive: minDurationPositive,
    habit_frequency_type_valid: frequencyTypeValid,
    habit_default_time_format: timeFormatCheck('defaultTime', '默认时间'),
    habit_earliest_time_format: timeFormatCheck('earliestTime', '最早开始时间'),
    habit_latest_time_format: timeFormatCheck('latestStartTime', '最迟开始时间'),
  },
  submit: {
    habit_action_fields_valid: actionFieldsValid,
  },
}
