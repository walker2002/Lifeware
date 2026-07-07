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
 * - `frontend/src/nexus/core/rule-engine/` — **提案评估层**（orchestration-handler 生成的
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
import { buildStatusTransitionActions } from './lib/build-status-transition-actions'

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

/**
 * 状态转换 action（不含 createTimebox/editTimebox / createAppointment/editAppointment）：
 * title/startTime/endTime 从 DB 行加载（不是 form 提交），submit 端字段必含检查应跳过。
 *
 * [023.13] TD-019 A1：从 manifest.lifecycle 派生（lib/build-status-transition-actions），
 * 取代手工常量——新增 lifecycle transition 自动纳入，杜绝漂移（[023.12] revert 漏注册根因）。
 * create action 显式排除（create 需字段必含校验，不跳过）。
 */
export const STATUS_TRANSITION_ACTIONS: Set<string> = buildStatusTransitionActions()

const timeboxFieldsValid: SubmitCheck = async (intent: StructuredIntent) => {
  // [023.03] QA fix: 状态转换 action 跳过字段必含检查（字段从 DB 加载）
  if (STATUS_TRANSITION_ACTIONS.has(intent.action)) {
    return validationPassed()
  }
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

// ── [026] A1.6 appointment 规则（D2 reversal）/ [023.05] PR2 T9 itinerary→appointment
//
// 约定是独立对象（[026] D2 reversal：5 态存储，SM 驱动全部 transition）。
// 与 timebox 规则不同点：
// - 字段为 title / startTime / durationMin（无 endTime——约定时长由 durationMin 决定，
//   客户端计算 endTime 上送）
// - 约定可标记 cancelled / completed 等终态（timebox 走 logged），但 submit 端
//   appointment_fields_valid 复刻 timebox 范式：纯字段校验，不做 SM 终态/转移检查
//   （SM 由 orchestrator 独立把关）
// - 走独立 appointmentRuleRegistry，由 hooks.ts onValidate 按 objectType 分派
// - 复用 validationPassed/validationRejected（同 process 模块）

/** appointment 规则提示文案（单源，与 realtime message 同源） */
const APPOINTMENT_RULE_MESSAGES = {
  titleRequired: '事件名称不能为空',
  startTimeInFuture: '开始时间必须是未来',
  durationPositive: '时长必须大于 0 分钟',
  fieldsValid: '约定字段校验失败',
} as const

// ── realtime checks（phase: both，单字段纯函数）──────────

const appointmentTitleRequired: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return [{ field: 'title', message: APPOINTMENT_RULE_MESSAGES.titleRequired }]
  }
  return []
}

const appointmentStartTimeInFuture: RealtimeCheck = (value) => {
  // [026] 与 timebox F2 一致：缺值/空值 fail-OPEN（部分更新语义），submit 兜底
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string' || isNaN(Date.parse(value))) {
    return [{ field: 'startTime', message: APPOINTMENT_RULE_MESSAGES.startTimeInFuture }]
  }
  if (Date.parse(value) <= Date.now()) {
    return [{ field: 'startTime', message: APPOINTMENT_RULE_MESSAGES.startTimeInFuture }]
  }
  return []
}

const appointmentDurationPositive: RealtimeCheck = (value) => {
  if (value === undefined || value === null) return [] // 缺值由 submit 兜底
  if (typeof value !== 'number' || value <= 0) {
    return [{ field: 'durationMin', message: APPOINTMENT_RULE_MESSAGES.durationPositive }]
  }
  return []
}

// ── submit 聚合（phase: submit，复刻 realtime 3 条 + 跨字段检查）──────────

const appointmentFieldsValid: SubmitCheck = async (
  intent: StructuredIntent,
  ctx,
) => {
  // [026] P0-1 修复（issue #1 阻断 reconcile / mark / delete 路径）：
  //   submit 规则对所有 action 都校验字段会把 mark* / delete* / complete* / revert* 阻断
  //   （这些 action 只传 {objectId}，缺 title/startTime/durationMin → reject）。故仅在
  //   createAppointment / editAppointment 时校验字段；其他 action（completeAppointment /
  //   revertAppointment / cancelAppointment / deleteAppointment）立即通过，由 SM 独立把关
  //   终态/转移检查。
  // [023.05] PR2 T9: action 名 itinerary→appointment
  // [023.12] T5: 取代原 markInProgressAppointment / markExpiredAppointment
  // [023.13] A1 收敛：appointment 状态转换也走派生 Set（与 timebox 同机制，drift 单一源）
  if (STATUS_TRANSITION_ACTIONS.has(intent.action)) {
    return validationPassed()
  }

  const errors: string[] = []
  const { fields } = intent

  // title: submit 必须 fail-CLOSED 兜底（与 timebox timeboxFieldsValid 范式一致）
  // realtime fail-OPEN 是部分更新语义，但 submit 不允许缺值通过
  const title = fields['title']
  if (!title || (typeof title === 'string' && title.trim() === '')) {
    errors.push(APPOINTMENT_RULE_MESSAGES.titleRequired)
  }

  const startTime = fields['startTime']
  // submit 必须校验 startTime：缺/非 ISO/过去都拒绝
  if (
    !startTime ||
    typeof startTime !== 'string' ||
    isNaN(Date.parse(startTime)) ||
    Date.parse(startTime) <= ctx.now
  ) {
    errors.push(APPOINTMENT_RULE_MESSAGES.startTimeInFuture)
  }

  const durationMin = fields['durationMin']
  if (
    durationMin === undefined ||
    durationMin === null ||
    typeof durationMin !== 'number' ||
    durationMin <= 0
  ) {
    errors.push(APPOINTMENT_RULE_MESSAGES.durationPositive)
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const appointmentRuleRegistry: DomainRuleRegistry = {
  realtime: {
    appointment_title_required: {
      check: appointmentTitleRequired,
      fields: ['title'],
      message: APPOINTMENT_RULE_MESSAGES.titleRequired,
    },
    appointment_start_time_in_future: {
      check: appointmentStartTimeInFuture,
      fields: ['startTime'],
      message: APPOINTMENT_RULE_MESSAGES.startTimeInFuture,
    },
    appointment_duration_positive: {
      check: appointmentDurationPositive,
      fields: ['durationMin'],
      message: APPOINTMENT_RULE_MESSAGES.durationPositive,
    },
  },
  submit: {
    appointment_fields_valid: {
      check: appointmentFieldsValid,
      fields: ['title', 'startTime', 'durationMin'],
      message: APPOINTMENT_RULE_MESSAGES.fieldsValid,
    },
  },
}
