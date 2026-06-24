/**
 * @file rules-registry.test
 * @brief tasks 域规则注册表单元测试。
 * - [018-G3] R2：realtime check 行为（边界/合法性）
 * - [020] Phase 1：registry rule 自带 meta（check/fields/message）不变式
 */
import { describe, it, expect } from 'vitest'
import { taskRuleRegistry } from '../rules-registry'

const { realtime } = taskRuleRegistry

describe('task_estimated_duration_positive', () => {
  const check = realtime.task_estimated_duration_positive.check

  it('number > 0 → 无错误', () => {
    expect(check(30, {})).toEqual([])
    expect(check(1, {})).toEqual([])
  })

  it('number = 0 → 报错', () => {
    const issues = check(0, {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('estimatedDuration')
    expect(issues[0].message).toBe('预估时长必须大于 0')
  })

  it('number < 0 → 报错', () => {
    const issues = check(-5, {})
    expect(issues).toHaveLength(1)
  })

  it('undefined / null → 无错误（允许部分更新）', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })

  it('非 number（string）→ 无错误（realtime 不做类型转换，提交时由 validateTaskFields 覆盖）', () => {
    expect(check('abc', {})).toEqual([])
  })
})

describe('task_estimated_duration_max', () => {
  const check = realtime.task_estimated_duration_max.check

  it('number ≤ 1440 → 无错误', () => {
    expect(check(1440, {})).toEqual([])
    expect(check(60, {})).toEqual([])
  })

  it('number > 1440 → 报错', () => {
    const issues = check(1441, {})
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toBe('预估时长不能超过 24 小时（1440 分钟）')
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('task_priority_valid', () => {
  const check = realtime.task_priority_valid.check

  it.each(['critical', 'high', 'medium', 'low'])('有效值 "%s" → 无错误', (val) => {
    expect(check(val, {})).toEqual([])
  })

  it('非法值 → 报错', () => {
    const issues = check('urgent', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('priority')
  })

  it('空字符串 → 无错误（可选字段，用户可能未选择）', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
  })
})

describe('task_energy_required_valid', () => {
  const check = realtime.task_energy_required_valid.check

  it.each(['high', 'medium', 'low'])('有效值 "%s" → 无错误', (val) => {
    expect(check(val, {})).toEqual([])
  })

  it('非法值 → 报错', () => {
    const issues = check('extreme', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('energyRequired')
  })

  it('空字符串 → 无错误', () => {
    expect(check('', {})).toEqual([])
  })
})

describe('task_due_date_format', () => {
  const check = realtime.task_due_date_format.check

  it('有效格式 YYYY-MM-DD → 无错误', () => {
    expect(check('2026-12-31', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    const issues = check('2026/12/31', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('dueDate')
  })

  it('空字符串 → 无错误（可选字段）', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('thread_color_format', () => {
  const check = realtime.thread_color_format.check

  it('有效格式 #RRGGBB → 无错误', () => {
    expect(check('#FF5733', {})).toEqual([])
    expect(check('#00aabb', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    const issues = check('red', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('color')
  })

  it('空字符串 → 无错误', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('task_action_fields_valid (submit — 聚合规则)', () => {
  const check = taskRuleRegistry.submit.task_action_fields_valid.check

  it('createTask 缺 title → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: { title: '' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
  })

  it('createTask 所有字段合法 → Passed', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: { title: '测试任务', priority: 'high', estimatedDuration: 60, dueDate: '2026-12-31' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Passed')
  })

  it('createThread 缺 name → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createThread', fields: { name: '' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('主线名称必填')
    }
  })

  it('生命周期：非法状态转换 → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'updateTask', fields: { title: 't', currentStatus: 'completed', targetStatus: 'todo', targetType: 'task' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors.some(e => e.includes('状态不能转换'))).toBe(true)
    }
  })

  it('生命周期：合法状态转换 → Passed', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'updateTask', fields: { title: 't', currentStatus: 'todo', targetStatus: 'planned', targetType: 'task' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Passed')
  })
})

// ─── [020] Phase 1：registry rule 自带 meta 不变式 ──────────────────────────
describe('[020] tasks registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且 fields 恰 1 字段', () => {
    for (const [id, rule] of Object.entries(taskRuleRegistry.realtime)) {
      expect(typeof rule.check, `${id} check`).toBe('function')
      expect(Array.isArray(rule.fields), `${id} fields`).toBe(true)
      expect(rule.fields.length, `${id} fields 恰 1 字段`).toBe(1)
      expect(typeof rule.message, `${id} message`).toBe('string')
      expect(rule.message.length, `${id} message 非空`).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 task_action_fields_valid 含 meta', () => {
    const rule = taskRuleRegistry.submit.task_action_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message).toBe('任务/主线字段校验失败')
  })

  it('realtime 字段映射与原 manifest L 一致（无回归）', () => {
    expect(taskRuleRegistry.realtime.task_estimated_duration_positive.fields).toEqual(['estimatedDuration'])
    expect(taskRuleRegistry.realtime.task_priority_valid.fields).toEqual(['priority'])
    expect(taskRuleRegistry.realtime.thread_color_format.fields).toEqual(['color'])
  })

  it('realtime rule message 与 manifest L 区文本一致（回填匹配契约）', () => {
    expect(taskRuleRegistry.realtime.task_estimated_duration_positive.message).toBe('预估时长必须大于 0')
    expect(taskRuleRegistry.realtime.task_estimated_duration_max.message).toBe('预估时长不能超过 24 小时（1440 分钟）')
    expect(taskRuleRegistry.realtime.task_priority_valid.message).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(taskRuleRegistry.realtime.task_energy_required_valid.message).toBe('能量要求必须是 high/medium/low 之一')
    expect(taskRuleRegistry.realtime.task_due_date_format.message).toBe('截止日期格式必须是 YYYY-MM-DD')
    expect(taskRuleRegistry.realtime.thread_color_format.message).toBe('颜色格式必须是 #RRGGBB')
  })
})
