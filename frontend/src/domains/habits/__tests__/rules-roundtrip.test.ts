/**
 * @file rules-roundtrip.test
 * @brief [018-G3] R1 Task11 — realtime→submit→回填 闭环集成
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateRealtimeRules, evaluateDomainRules, mapServerErrorsToFields, type RealtimeRuleMeta } from '@/nexus/rules'
import { habitRuleRegistry } from '../rules-registry'

vi.mock('@/domains/manifest-loader', () => {
  // 与真实 habits manifest rules 区块一致的内存 manifest（供 evaluateDomainRules 读）
  const bothRules = [
    { id: 'habit_default_duration_positive', phase: 'both', fields: ['defaultDuration'], message: '默认时长必须大于 0' },
    { id: 'habit_min_duration_positive', phase: 'both', fields: ['minDuration'], message: '最短时长必须大于 0' },
    { id: 'habit_frequency_type_valid', phase: 'both', fields: ['frequencyType'], message: '频率类型必须是 daily/weekly/custom' },
    { id: 'habit_default_time_format', phase: 'both', fields: ['defaultTime'], message: '默认时间必须是有效的 HH:MM 格式' },
    { id: 'habit_earliest_time_format', phase: 'both', fields: ['earliestTime'], message: '最早开始时间必须是有效的 HH:MM 格式' },
    { id: 'habit_latest_time_format', phase: 'both', fields: ['latestStartTime'], message: '最迟开始时间必须是有效的 HH:MM 格式' },
  ]
  const submitRule = { id: 'habit_action_fields_valid', phase: 'submit', fields: [], message: '习惯字段校验失败' }
  return {
    loadDomainManifest: () => ({
      success: true,
      manifest: { id: 'habits', version: '1.0.0', name: '习惯管理', description: 'd', intent_triggers: [], lifecycle: {}, field_metadata: {}, list_actions: [], required_fields: {}, subscribed_events: [], rules: [submitRule, ...bothRules] },
    }),
    __bothRules: bothRules,
  }
})

function intent(fields: Record<string, unknown>): StructuredIntent {
  return { id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits', action: 'createHabit', fields, confidence: 1, resolvedBy: 'form', createdAt: '2026-06-20T00:00:00Z' } as unknown as StructuredIntent
}
const serverCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx = {}
// realtime 元数据（与 manifest both 规则一致）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'habit_default_duration_positive', fields: ['defaultDuration'], message: '默认时长必须大于 0' },
  { id: 'habit_default_time_format', fields: ['defaultTime'], message: '默认时间必须是有效的 HH:MM 格式' },
]
const ruleMessages: Record<string, string> = {
  habit_default_duration_positive: '默认时长必须大于 0',
  habit_default_time_format: '默认时间必须是有效的 HH:MM 格式',
}

describe('[roundtrip] realtime 抓得到 → submit 权威也抓', () => {
  it('defaultDuration=0：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(habitRuleRegistry, 'defaultDuration', 0, clientCtx)
    expect(issues.some((i) => i.message === '默认时长必须大于 0')).toBe(true)
    const result = await evaluateDomainRules('habits', intent({ title: 't', defaultDuration: 0 }), serverCtx, habitRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('默认时长必须大于 0')).toBe(true)
  })
})

describe('[roundtrip] 回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', () => {
    const mapped = mapServerErrorsToFields(['默认时长必须大于 0', '标题必填'], realtimeRules, ruleMessages)
    expect(mapped.fieldErrors.defaultDuration).toBe('默认时长必须大于 0')
    expect(mapped.formErrors).toEqual(['标题必填'])
  })
})

describe('[roundtrip] D 模式：多错误 submit 全显', () => {
  it('缺 title + duration 0 + 频率非法（无 minDuration）→ submit 返回 3 条 errors（聚合规则置首）', async () => {
    const result = await evaluateDomainRules('habits', intent({ title: '', defaultDuration: 0, frequencyType: 'bad' }), serverCtx, habitRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors).toEqual(['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'])
  })
})
