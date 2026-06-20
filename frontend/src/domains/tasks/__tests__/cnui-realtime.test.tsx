/**
 * @file cnui-realtime.test
 * @brief [018-G3] R3 — tasks CNUI surface 客户端 realtime 校验测试
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from '@/nexus/rules/realtime'
import { mapServerErrorsToFields } from '@/nexus/rules/server-error-mapping'
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

  it('estimatedDuration=undefined（空字段 blur）→ 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', undefined, clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })

  it('estimatedDuration=1440（恰好等于上限）→ 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 1440, clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })
})

describe('R3 — 服务端错误回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', () => {
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

  it('未匹配到字段的错误走表单级', () => {
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

describe('R3 — TaskEditCard realtime 校验', () => {
  it('estimatedDuration 为负数 → 报错', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', -10, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'estimatedDuration' && i.message === '预估时长必须大于 0')).toBe(true)
  })

  it('priority 从 select 选 "medium" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'medium', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })

  it('estimatedDuration 为空字符串 → 无错误（可选字段，Number("")=0 但 NaN guard 返回 undefined）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })
})

describe('R3 — ThreadCreationCard realtime 校验', () => {
  it('color="red"（非 #RRGGBB）→ 报错"颜色格式必须是 #RRGGBB"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', 'red', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'color' && i.message === '颜色格式必须是 #RRGGBB')).toBe(true)
  })

  it('color="#FF5733" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', '#FF5733', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'color')).toEqual([])
  })

  it('color="" → 无错误（可选字段）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'color')).toEqual([])
  })

  it('priority="low" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'low', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })
})

describe('R3 — TaskEditZone realtime 校验（page-level）', () => {
  it('energyRequired="extreme" → 报错"能量要求必须是 high/medium/low 之一"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'energyRequired', 'extreme', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'energyRequired')).toBe(true)
  })

  it('energyRequired="medium" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'energyRequired', 'medium', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'energyRequired')).toEqual([])
  })

  it('energyRequired="" → 无错误（可选字段）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'energyRequired', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'energyRequired')).toEqual([])
  })

  it('dueDate="2026/12/31" → 报错"截止日期格式必须是 YYYY-MM-DD"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026/12/31', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'dueDate')).toBe(true)
  })

  it('dueDate="2026-12-31" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026-12-31', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'dueDate')).toEqual([])
  })
})

describe('R3 — CNUI handler errors[] 回填闭环', () => {
  it('handler 返回的 errors[] 能被 mapServerErrorsToFields 正确映射', () => {
    const serverErrors = [
      '预估时长必须大于 0',
      '优先级必须是 critical/high/medium/low 之一',
      '任务标题必填',
    ]
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const result = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    expect(result.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(result.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(result.formErrors).toEqual(['任务标题必填'])
  })
})
