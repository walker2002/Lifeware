/**
 * @file rules-roundtrip.test
 * @brief [018-G3] R2 — realtime→submit→回填 闭环集成（tasks 域）
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateRealtimeRules, evaluateDomainRules, mapServerErrorsToFields, type RealtimeRuleMeta } from '@/nexus/rules'
import { taskRuleRegistry } from '../rules-registry'

vi.mock('@/domains/manifest-loader', () => {
  // 与真实 tasks manifest rules 区块一致的内存 manifest（供 evaluateDomainRules 读）
  const bothRules = [
    { id: 'task_estimated_duration_positive', phase: 'both', fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
    { id: 'task_estimated_duration_max', phase: 'both', fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
    { id: 'task_priority_valid', phase: 'both', fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
    { id: 'task_energy_required_valid', phase: 'both', fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
    { id: 'task_due_date_format', phase: 'both', fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
    { id: 'thread_color_format', phase: 'both', fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
  ]
  const submitRule = { id: 'task_action_fields_valid', phase: 'submit', fields: [], message: '任务/主线字段校验失败' }
  return {
    loadDomainManifest: () => ({
      success: true,
      manifest: { id: 'tasks', version: '2.0.0', name: '任务管理', description: 'd', intent_triggers: [], lifecycle: { task: { states: [], transitions: [] }, thread: { states: [], transitions: [] } }, field_metadata: {}, list_actions: [], required_fields: {}, subscribed_events: [], rules: [submitRule, ...bothRules] },
    }),
  }
})

function intent(fields: Record<string, unknown>, action: string = 'createTask'): StructuredIntent {
  return { id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'tasks', action, fields, confidence: 1, resolvedBy: 'form', createdAt: '2026-06-20T00:00:00Z' } as unknown as StructuredIntent
}
const serverCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx = {}

// realtime 元数据（与 manifest both 规则一致）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'task_estimated_duration_positive', fields: ['estimatedDuration'] },
  { id: 'task_estimated_duration_max', fields: ['estimatedDuration'] },
  { id: 'task_priority_valid', fields: ['priority'] },
  { id: 'task_due_date_format', fields: ['dueDate'] },
]
const ruleMessages: Record<string, string> = {
  task_estimated_duration_positive: '预估时长必须大于 0',
  task_estimated_duration_max: '预估时长不能超过 24 小时（1440 分钟）',
  task_priority_valid: '优先级必须是 critical/high/medium/low 之一',
  task_due_date_format: '截止日期格式必须是 YYYY-MM-DD',
}

describe('[roundtrip] realtime 抓得到 → submit 权威也抓', () => {
  it('estimatedDuration=0：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 0, clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '预估时长必须大于 0')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', estimatedDuration: 0 }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('预估时长必须大于 0')).toBe(true)
  })

  it('priority 非法：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'urgent', clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '优先级必须是 critical/high/medium/low 之一')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', priority: 'urgent' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('优先级必须是 critical/high/medium/low 之一')).toBe(true)
  })

  it('dueDate 格式非法：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026/12/31', clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '截止日期格式必须是 YYYY-MM-DD')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', dueDate: '2026/12/31' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('截止日期格式必须是 YYYY-MM-DD')).toBe(true)
  })

  it('estimatedDuration=2000（超上限）：realtime 抓到 + submit 也抓到', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 2000, clientCtx, taskRuleRegistry)
    // estimatedDuration 命中两条 both 规则：positive（通过，>0） + max（失败，>1440）
    expect(issues.some((i) => i.message === '预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', estimatedDuration: 2000 }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
  })
})

describe('[roundtrip] 回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', () => {
    const mapped = mapServerErrorsToFields(
      ['预估时长必须大于 0', '标题必填'],
      realtimeRules,
      ruleMessages,
    )
    expect(mapped.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(mapped.formErrors).toEqual(['标题必填'])
  })

  it('多条 realtime 错误均正确回填', () => {
    const mapped = mapServerErrorsToFields(
      ['预估时长必须大于 0', '优先级必须是 critical/high/medium/low 之一', '截止日期格式必须是 YYYY-MM-DD'],
      realtimeRules,
      ruleMessages,
    )
    expect(mapped.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(mapped.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(mapped.fieldErrors.dueDate).toBe('截止日期格式必须是 YYYY-MM-DD')
    expect(mapped.formErrors).toEqual([])
  })
})

describe('[roundtrip] D 模式：多错误 submit 全显', () => {
  it('缺 title + duration 0 + priority 非法 → submit 返回 3 条 errors（聚合规则置首）', async () => {
    const result = await evaluateDomainRules('tasks', intent({ title: '', estimatedDuration: 0, priority: 'bad' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors).toEqual([
      '任务标题必填',
      '预估时长必须大于 0',
      '优先级必须是 critical/high/medium/low 之一',
    ])
  })

  it('createThread：缺 name + color 非法 → 2 条 errors', async () => {
    const result = await evaluateDomainRules('tasks', intent({ name: '', color: 'red' }, 'createThread'), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('主线名称必填')
      expect(result.errors).toContain('颜色格式必须是 #RRGGBB')
    }
  })
})
