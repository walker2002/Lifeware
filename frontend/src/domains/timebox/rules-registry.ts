/**
 * @file rules-registry
 * @brief timebox 域规则注册表（codex E5，命令式处理器）。
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。对齐 [018-G3]/[020]
 * tasks/habits 范式：
 * - realtime（phase: both）：单字段纯函数（title/duration/startTime），客户端 blur
 * - submit（phase: submit）：timebox_fields_valid 聚合规则，复刻原 hooks.ts onValidate
 *   全分支（title 非空 / startTime 有效 ISO / duration 5-480 整数），返回
 *   validationRejected(全部 errors)
 *
 * [020] registry 即 SSOT：每条 rule 自带 { check, fields, message } meta。
 * manifest 不声明 rules（timebox manifest 已无 rules 区）。
 *
 * ## R10 — core/rule-engine vs nexus/rules 职责区分（codex E2 + 实施期确认）
 *
 * - `frontend/src/nexus/core/rule-engine/` — **提案评估层**（scheduling-handler 生成的
 *   schedule 提案校验）。`createRuleEngine` 在 `intent.ts:265,512` + `okr.ts:177` 调用，
 *   关联 timebox rules（FieldCompletenessRule / DurationRangeRule / StartTimeInFutureRule）。
 * - `frontend/src/nexus/rules/` — **意图校验层**（onValidate 走 evaluateDomainRules）。
 *   timebox rules-registry（本文件）注册到这里。
 * - **两者职责不同，非重复**。A0.4 只接 nexus/rules（意图校验），**不动
 *   core/rule-engine**（提案评估层，留作 A2 timebox 重写时评估是否清理）。
 * - 副作用：同名字段（title / startTime / duration）在两处都有校验规则 ——
 *   维护困惑是已存在债。A0.4 文档化此状态便于未来清理。
 *
 * @see frontend/src/domains/tasks/rules-registry.ts 范式参考
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules'
import type { StructuredIntent } from '@/usom/types/objects'

/** 最小持续时间（分钟） */
const MIN_DURATION = 5
/** 最大持续时间（分钟） */
const MAX_DURATION = 480

/** timebox 规则提示文案（单源，与 realtime message 同源） */
const TIMEBOX_RULE_MESSAGES = {
  titleRequired: 'title 不能为空',
  durationRange: `duration 必须是 ${MIN_DURATION}~${MAX_DURATION} 之间的整数（分钟）`,
  startTimeFormat: 'startTime 必须是有效的 ISO 8601 时间格式',
  fieldsValid: '时间盒字段校验失败',
} as const

// ── realtime checks（phase: both，单字段纯函数）──────────

const titleRequired: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return [{ field: 'title', message: TIMEBOX_RULE_MESSAGES.titleRequired }]
  }
  return []
}

const durationRange: RealtimeCheck = (value) => {
  if (typeof value === 'number' && (!Number.isInteger(value) || value < MIN_DURATION || value > MAX_DURATION)) {
    return [{ field: 'duration', message: TIMEBOX_RULE_MESSAGES.durationRange }]
  }
  return []
}

const startTimeFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || isNaN(Date.parse(value))) {
      return [{ field: 'startTime', message: TIMEBOX_RULE_MESSAGES.startTimeFormat }]
    }
  }
  return []
}

// ── submit 聚合（phase: submit，复刻原 onValidate 全逻辑）──────────

const timeboxFieldsValid: SubmitCheck = async (intent: StructuredIntent) => {
  const errors: string[] = []
  const { fields } = intent

  const title = fields['title']
  if (!title || (typeof title === 'string' && title.trim() === '')) {
    errors.push(TIMEBOX_RULE_MESSAGES.titleRequired)
  }

  const startTime = fields['startTime']
  if (!startTime || typeof startTime !== 'string' || isNaN(Date.parse(startTime))) {
    errors.push(TIMEBOX_RULE_MESSAGES.startTimeFormat)
  }

  const duration = fields['duration']
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < MIN_DURATION ||
    duration > MAX_DURATION
  ) {
    errors.push(TIMEBOX_RULE_MESSAGES.durationRange)
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const timeboxRuleRegistry: DomainRuleRegistry = {
  realtime: {
    timebox_title_required: {
      check: titleRequired,
      fields: ['title'],
      message: TIMEBOX_RULE_MESSAGES.titleRequired,
    },
    timebox_duration_range: {
      check: durationRange,
      fields: ['duration'],
      message: TIMEBOX_RULE_MESSAGES.durationRange,
    },
    timebox_start_time_format: {
      check: startTimeFormat,
      fields: ['startTime'],
      message: TIMEBOX_RULE_MESSAGES.startTimeFormat,
    },
  },
  submit: {
    timebox_fields_valid: {
      check: timeboxFieldsValid,
      fields: ['title', 'startTime', 'duration'],
      message: TIMEBOX_RULE_MESSAGES.fieldsValid,
    },
  },
}