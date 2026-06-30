/**
 * @file rules-registry.test
 * @brief habits 域规则注册表单元测试。
 * - [018-G3] R1 Task4：realtime 单字段 + submit 聚合全分支（逐字对标 golden）
 * - [020] Phase 1：registry rule 自带 meta（check/fields/message）不变式
 */
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { habitRuleRegistry } from '../rules-registry'
import type { ServerRuleCtx, ClientRuleCtx } from '@/nexus/rules/types'
import { HABIT_RULE_MESSAGES } from '../validation'

function intent(action: string, fields: Record<string, unknown>): StructuredIntent {
  return {
    id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits',
    action, fields, confidence: 1, resolvedBy: 'template_form', createdAt: '2026-06-20T00:00:00Z',
  } as unknown as StructuredIntent
}
const serverCtx: ServerRuleCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx: ClientRuleCtx = {}

describe('habits realtime checks（phase: both）', () => {
  it('defaultDuration<=0 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.check(0, clientCtx))
      .toEqual([{ field: 'defaultDuration', message: '默认时长必须大于 0' }])
  })
  it('defaultDuration 正数 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.check(30, clientCtx)).toEqual([])
  })
  it('minDuration<=0 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_min_duration_positive.check(0, clientCtx))
      .toEqual([{ field: 'minDuration', message: '最短时长必须大于 0' }])
  })
  it('frequencyType 非法 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid.check('bad', clientCtx))
      .toEqual([{ field: 'frequencyType', message: '频率类型必须是 daily/weekly/custom' }])
  })
  it('frequencyType 合法 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid.check('daily', clientCtx)).toEqual([])
  })
  it('defaultTime 非法格式 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format.check('25:00', clientCtx))
      .toEqual([{ field: 'defaultTime', message: '默认时间必须是有效的 HH:MM 格式' }])
  })
  it('defaultTime 缺省（undefined）→ 空（仅在有值时校验格式）', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format.check(undefined, clientCtx)).toEqual([])
  })
  it('realtime 不覆盖 title（无 habit_title_required check）', () => {
    expect(habitRuleRegistry.realtime.habit_title_required).toBeUndefined()
  })
})

describe('habits submit 聚合 habit_action_fields_valid（逐字对标 golden）', () => {
  it('合法 createHabit → Passed', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid.check(
      intent('createHabit', { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' }),
      serverCtx,
    )
    expect(r.kind).toBe('Passed')
  })
  it('createHabit 多错误（缺 title + duration 0 + minDuration 15 + 频率非法）→ Rejected 全部 errors 按序（含最短时长不能大于默认时长）', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid.check(
      intent('createHabit', { title: '', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0, minDuration: 15, trackable: true, frequencyType: 'bad' }),
      serverCtx,
    )
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['标题必填', '默认时长必须大于 0', '最短时长不能大于默认时长', '频率类型必须是 daily/weekly/custom'])
  })
  it('logHabit 缺 habitId → Rejected「habitId 必填」', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid.check(intent('logHabit', { status: 'completed' }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors).toEqual(['habitId 必填'])
  })
  it('未知 action → Passed（无匹配分支）', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid.check(intent('unknownAction', {}), serverCtx)
    expect(r.kind).toBe('Passed')
  })
})

// ─── [020] Phase 1：registry rule 自带 meta 不变式 ──────────────────────────
describe('[020] habits registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且 fields 恰 1 字段', () => {
    for (const [id, rule] of Object.entries(habitRuleRegistry.realtime)) {
      expect(typeof rule.check, `${id} check`).toBe('function')
      expect(Array.isArray(rule.fields), `${id} fields`).toBe(true)
      expect(rule.fields.length, `${id} fields 恰 1 字段`).toBe(1)
      expect(typeof rule.message, `${id} message`).toBe('string')
      expect(rule.message.length, `${id} message 非空`).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 habit_action_fields_valid 含 meta', () => {
    const rule = habitRuleRegistry.submit.habit_action_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message).toBe('习惯字段校验失败')
  })

  it('realtime 字段映射与原 manifest L 一致', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.fields).toEqual(['defaultDuration'])
    expect(habitRuleRegistry.realtime.habit_latest_time_format.fields).toEqual(['latestStartTime'])
  })

  it('realtime rule message 与 manifest L 区文本一致（回填匹配契约）', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.message).toBe('默认时长必须大于 0')
    expect(habitRuleRegistry.realtime.habit_min_duration_positive.message).toBe('最短时长必须大于 0')
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid.message).toBe('频率类型必须是 daily/weekly/custom')
    expect(habitRuleRegistry.realtime.habit_default_time_format.message).toBe('默认时间必须是有效的 HH:MM 格式')
    expect(habitRuleRegistry.realtime.habit_earliest_time_format.message).toBe('最早开始时间必须是有效的 HH:MM 格式')
    expect(habitRuleRegistry.realtime.habit_latest_time_format.message).toBe('最迟开始时间必须是有效的 HH:MM 格式')
  })

  it('RT1: 每条 realtime message 与 HABIT_RULE_MESSAGES 常量同源（防漂移）', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.message).toBe(HABIT_RULE_MESSAGES.defaultDurationPositive)
    expect(habitRuleRegistry.realtime.habit_min_duration_positive.message).toBe(HABIT_RULE_MESSAGES.minDurationPositive)
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid.message).toBe(HABIT_RULE_MESSAGES.frequencyTypeValid)
    expect(habitRuleRegistry.realtime.habit_default_time_format.message).toBe(HABIT_RULE_MESSAGES.defaultTimeFormat)
    expect(habitRuleRegistry.realtime.habit_earliest_time_format.message).toBe(HABIT_RULE_MESSAGES.earliestTimeFormat)
    expect(habitRuleRegistry.realtime.habit_latest_time_format.message).toBe(HABIT_RULE_MESSAGES.latestTimeFormat)
  })
})
