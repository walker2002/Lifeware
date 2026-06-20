/**
 * @file cnui-realtime.test
 * @brief [018-G3] R3 — tasks CNUI surface 客户端 realtime 校验测试
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from '@/nexus/rules'
import { taskRuleRegistry } from '../rules-registry'

// 与 manifest.yaml both 规则一致的元数据（模拟 getRealtimeRules("tasks") 返回）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'task_estimated_duration_positive', fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
  { id: 'task_estimated_duration_max', fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
  { id: 'task_priority_valid', fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
  { id: 'task_energy_required_valid', fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
  { id: 'task_due_date_format', fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
  { id: 'thread_color_format', fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
]

const clientCtx = {}

describe('R3 — TaskCreationCard realtime 校验', () => {
  it('estimatedDuration=0 → 报错"预估时长必须大于 0"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 0, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'estimatedDuration' && i.message === '预估时长必须大于 0')).toBe(true)
  })

  it('estimatedDuration=2000 → 报错"不能超过 24 小时"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 2000, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.message === '预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
  })

  it('estimatedDuration=30 → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 30, clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })

  it('priority="urgent" → 报错"优先级必须是 critical/high/medium/low 之一"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'urgent', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'priority')).toBe(true)
  })

  it('priority="high" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'high', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })

  it('priority=""（未选择）→ 无错误（可选字段）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })
})

describe('R3 — 服务端错误回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', async () => {
    const { mapServerErrorsToFields } = await import('@/nexus/rules/server-error-mapping')
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const result = mapServerErrorsToFields(
      ['预估时长必须大于 0', '优先级必须是 critical/high/medium/low 之一'],
      realtimeRules,
      ruleMessages,
    )
    expect(result.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(result.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(result.formErrors).toEqual([])
  })

  it('未匹配到字段的错误走表单级', async () => {
    const { mapServerErrorsToFields } = await import('@/nexus/rules/server-error-mapping')
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const result = mapServerErrorsToFields(
      ['任务标题必填'],
      realtimeRules,
      ruleMessages,
    )
    expect(result.fieldErrors).toEqual({})
    expect(result.formErrors).toEqual(['任务标题必填'])
  })
})
