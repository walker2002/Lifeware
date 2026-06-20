/**
 * @file rules-registry.test
 * @brief [018-G3] R1 Task4 — habits registry：realtime 单字段 + submit 聚合全分支
 *
 * submit 聚合逐字对标 golden（Task1）；realtime 各字段独立纯函数。
 */
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { habitRuleRegistry } from '../rules-registry'
import type { ServerRuleCtx, ClientRuleCtx } from '@/nexus/rules/types'

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
    expect(habitRuleRegistry.realtime.habit_default_duration_positive(0, clientCtx))
      .toEqual([{ field: 'defaultDuration', message: '默认时长必须大于 0' }])
  })
  it('defaultDuration 正数 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive(30, clientCtx)).toEqual([])
  })
  it('minDuration<=0 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_min_duration_positive(0, clientCtx))
      .toEqual([{ field: 'minDuration', message: '最短时长必须大于 0' }])
  })
  it('frequencyType 非法 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid('bad', clientCtx))
      .toEqual([{ field: 'frequencyType', message: '频率类型必须是 daily/weekly/custom' }])
  })
  it('frequencyType 合法 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid('daily', clientCtx)).toEqual([])
  })
  it('defaultTime 非法格式 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format('25:00', clientCtx))
      .toEqual([{ field: 'defaultTime', message: '默认时间必须是有效的 HH:MM 格式' }])
  })
  it('defaultTime 缺省（undefined）→ 空（仅在有值时校验格式）', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format(undefined, clientCtx)).toEqual([])
  })
  it('realtime 不覆盖 title（无 habit_title_required check）', () => {
    expect(habitRuleRegistry.realtime.habit_title_required).toBeUndefined()
  })
})

describe('habits submit 聚合 habit_action_fields_valid（逐字对标 golden）', () => {
  it('合法 createHabit → Passed', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(
      intent('createHabit', { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' }),
      serverCtx,
    )
    expect(r.kind).toBe('Passed')
  })
  it('createHabit 多错误（缺 title + duration 0 + minDuration 15 + 频率非法）→ Rejected 全部 errors 按序（含最短时长不能大于默认时长）', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(
      intent('createHabit', { title: '', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0, minDuration: 15, trackable: true, frequencyType: 'bad' }),
      serverCtx,
    )
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['标题必填', '默认时长必须大于 0', '最短时长不能大于默认时长', '频率类型必须是 daily/weekly/custom'])
  })
  it('logHabit 缺 habitId → Rejected「habitId 必填」', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('logHabit', { status: 'completed' }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors).toEqual(['habitId 必填'])
  })
  it('createTemplate name 空 → Rejected「name 必填」', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('createTemplate', { name: '', applicableDays: [1, 2, 3, 4, 5] }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors).toEqual(['name 必填'])
  })
  it('addHabitToTemplate timeOverride 非法 → Rejected 含 timeOverride', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('addHabitToTemplate', { templateId: 't1', habitId: 'h1', timeOverride: 'bad' }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors.some((e) => e.includes('timeOverride'))).toBe(true)
  })
  it('未知 action → Passed（无匹配分支）', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('unknownAction', {}), serverCtx)
    expect(r.kind).toBe('Passed')
  })
})
