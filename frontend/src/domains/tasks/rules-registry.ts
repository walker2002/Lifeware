/**
 * @file rules-registry
 * @brief [018-G3] R2 tasks 域规则注册表（命令式处理器）
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。
 * - realtime（phase: both）：action-invariant 单字段纯函数，客户端 blur
 * - submit（phase: submit）：task_action_fields_valid 聚合规则，复刻现状
 *   hooks.ts onValidate 全分支（复用 validateTaskFields / validateThreadFields；
 *   normalizeFieldValues 预处理由 hooks.ts 上游执行；transition 查找表已修正），
 *   返回 validationRejected(全部 errors)
 *
 * D 模式：聚合规则在 manifest 中置首，submit 聚合时其 Rejected 先胜出、吞掉粒度规则。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'
import { Priority, EnergyLevel } from '@/usom/types/primitives'
import { validateTaskFields, validateThreadFields } from './validation'
import { taskTransitions as rawTaskTransitions, threadTransitions as rawThreadTransitions } from './transitions'

const VALID_PRIORITIES = Object.values(Priority)
const VALID_ENERGY_LEVELS = Object.values(EnergyLevel)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

// ── 辅助：将 Transition[] 数组转为 Record<from, to[]> 查找表 ──────────
/** 复刻 hooks.ts buildTransitionMap 逻辑，将 transitions.ts 数组转换为查找表 */
function buildTransitionMap(
  transitions: Array<{ from: string | string[] | null; to: string }>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const t of transitions) {
    const fromList = t.from === null ? [] : Array.isArray(t.from) ? t.from : [t.from]
    for (const f of fromList) {
      if (!map[f]) map[f] = []
      if (!map[f].includes(t.to)) map[f].push(t.to)
    }
  }
  return map
}

const TASK_TRANSITION_MAP = buildTransitionMap(rawTaskTransitions)
const THREAD_TRANSITION_MAP = buildTransitionMap(rawThreadTransitions)

// ── realtime checks（phase: both，action-invariant 单字段纯函数）──────────

/** 仅在值「存在且为 number 且 ≤0」时报错（允许 update 部分更新时不传该字段） */
const estimatedDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'estimatedDuration', message: '预估时长必须大于 0' }]
  }
  return []
}

const estimatedDurationMax: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value > 1440) {
    return [{ field: 'estimatedDuration', message: '预估时长不能超过 24 小时（1440 分钟）' }]
  }
  return []
}

const priorityValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value !== '' && !VALID_PRIORITIES.includes(value as Priority)) {
    return [{ field: 'priority', message: '优先级必须是 critical/high/medium/low 之一' }]
  }
  return []
}

const energyRequiredValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value !== '' && !VALID_ENERGY_LEVELS.includes(value as EnergyLevel)) {
    return [{ field: 'energyRequired', message: '能量要求必须是 high/medium/low 之一' }]
  }
  return []
}

/** 仅在字段「有值且非 null 且非空串」时校验格式（undefined/null/空串 跳过，允许部分更新） */
const dueDateFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
      return [{ field: 'dueDate', message: '截止日期格式必须是 YYYY-MM-DD' }]
    }
  }
  return []
}

const colorFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || !COLOR_REGEX.test(value)) {
      return [{ field: 'color', message: '颜色格式必须是 #RRGGBB' }]
    }
  }
  return []
}

// ── submit 聚合（phase: submit）
// normalizeFieldValues（中式枚举→英文、日期格式整理）由 hooks.ts 上游预处理，
// 此处假定 fields 已规范化（Priority/EnergyLevel 为英文，dueDate 为 YYYY-MM-DD）
const actionFieldsValid: SubmitCheck = async (intent) => {
  const errors: string[] = []
  const { fields, action } = intent

  if (action === 'createTask' || action === 'updateTask') {
    errors.push(...validateTaskFields(fields, action as 'createTask' | 'updateTask').errors)
  }

  if (action === 'createThread' || action === 'updateThread') {
    errors.push(...validateThreadFields(fields, action as 'createThread' | 'updateThread').errors)
  }

  // 生命周期状态转换验证（多字段 → submit 专属）
  const targetStatus = fields['targetStatus'] as string | undefined
  const currentStatus = fields['currentStatus'] as string | undefined
  const targetType = fields['targetType'] as 'task' | 'thread' | undefined

  if (targetStatus && currentStatus && targetType) {
    const transitions = targetType === 'thread' ? THREAD_TRANSITION_MAP : TASK_TRANSITION_MAP
    const allowed = transitions[currentStatus] ?? []
    if (!allowed.includes(targetStatus)) {
      errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
    }
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const taskRuleRegistry: DomainRuleRegistry = {
  realtime: {
    task_estimated_duration_positive: estimatedDurationPositive,
    task_estimated_duration_max: estimatedDurationMax,
    task_priority_valid: priorityValid,
    task_energy_required_valid: energyRequiredValid,
    task_due_date_format: dueDateFormat,
    thread_color_format: colorFormat,
  },
  submit: {
    task_action_fields_valid: actionFieldsValid,
  },
}
