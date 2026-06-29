/**
 * @file rules-registry
 * @brief timebox 域规则注册表（codex E5，命令式处理器）。
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。对齐 [018-G3]/[020]
 * tasks/habits 范式：
 * - realtime（phase: both）：单字段纯函数（title/startTime/endTime），客户端 blur
 * - submit（phase: submit）：timebox_fields_valid 聚合规则，复刻原 hooks.ts onValidate
 *   全分支（title 非空 / startTime 有效 ISO / endTime 晚于 startTime 且 ≤8 小时），返回
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
 * ## F2 — realtime "空值" 静默透传是有意 fail-OPEN 设计（[023] A0 post-review 评估）
 *
 * adversarial CRITICAL #1 指出 `startTimeFormat` 对 undefined/null/空串 silent pass
 * 是 UX 缺陷。**经分析维持现状**，理由：
 * - **[018-G3] 异常不对称治理约束**：「客户端 realtime fail-OPEN / 服务端 submit
 *   fail-CLOSED」—— 部分更新场景下，realtime 不应把缺失字段当 error 阻塞用户输入。
 * - submit 聚合规则 `timebox_fields_valid` 已 fail-CLOSED：缺 startTime 时返回
 *   `Rejected`，经 `mapServerErrorsToFields` 按 message 匹配回填到 startTime 字段。
 *   用户提交后会立即看到该字段的错误。
 * - 强行在 realtime 给 missing 加 error 会破坏 [018-G3] 部分更新语义 + 与
 *   `titleRequired`/`endTimeFormat`（同样 fail-OPEN for undefined）行为不一致。
 * - FieldIssue contract 无 severity 字段，无法区分"required hint"与"format error"。
 *   升级 contract 影响 habits/tasks/okrs 三域 G3 系统，超出 A0 范围。
 *
 * **决策**：保持代码逻辑不动，本注释 + 测试断言「undefined → 无错误（submit 兜底）」
 * 作为有意选择的明示文档。
 *
 * @see frontend/src/domains/tasks/rules-registry.ts 范式参考
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules'
import type { StructuredIntent } from '@/usom/types/objects'

/** timebox 规则提示文案（单源，与 realtime message 同源） */
const TIMEBOX_RULE_MESSAGES = {
  titleRequired: 'title 不能为空',
  endTimeFormat: 'endTime 必须是有效的 ISO 8601 时间格式且晚于 startTime',
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

const startTimeFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || isNaN(Date.parse(value))) {
      return [{ field: 'startTime', message: TIMEBOX_RULE_MESSAGES.startTimeFormat }]
    }
  }
  return []
}

// [023] A2 QA hot-fix: duration 字段已被 A2 OV#P1-#1 撤销（客户端折成 endTime 上送），
// realtime 只校验 endTime 是合法 ISO（单字段）；endTime > startTime 多字段校验进 SubmitCheck。
const endTimeFormat: RealtimeCheck = (value) => {
  if (value === undefined || value === null || value === '') return [] // 缺失由 submit 兜底
  if (typeof value !== 'string' || isNaN(Date.parse(value))) {
    return [{ field: 'endTime', message: TIMEBOX_RULE_MESSAGES.endTimeFormat }]
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

  // [023] A2 QA hot-fix: 改为校验 endTime 而非 duration（duration 字段已撤销）
  const endTime = fields['endTime']
  if (
    !endTime ||
    typeof endTime !== 'string' ||
    isNaN(Date.parse(endTime)) ||
    (typeof startTime === 'string' && !isNaN(Date.parse(startTime)) && Date.parse(endTime) <= Date.parse(startTime))
  ) {
    errors.push(TIMEBOX_RULE_MESSAGES.endTimeFormat)
  }

  // [023] A2 QA hot-fix: 8 小时上限（与 rule-engine EndTimeAfterStartRule 对齐）
  if (
    typeof startTime === 'string' && !isNaN(Date.parse(startTime)) &&
    typeof endTime === 'string' && !isNaN(Date.parse(endTime))
  ) {
    const hours = (Date.parse(endTime) - Date.parse(startTime)) / 3_600_000
    if (hours > 8) {
      errors.push(`时间盒持续 ${hours.toFixed(1)} 小时超过 8 小时上限，建议拆分`)
    }
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
    timebox_start_time_format: {
      check: startTimeFormat,
      fields: ['startTime'],
      message: TIMEBOX_RULE_MESSAGES.startTimeFormat,
    },
    timebox_end_time_format: {
      check: endTimeFormat,
      fields: ['endTime'],
      message: TIMEBOX_RULE_MESSAGES.endTimeFormat,
    },
  },
  submit: {
    timebox_fields_valid: {
      check: timeboxFieldsValid,
      fields: ['title', 'startTime', 'endTime'],
      message: TIMEBOX_RULE_MESSAGES.fieldsValid,
    },
  },
}
