/**
 * @file rules-registry.test
 * @brief timebox 域规则注册表单元测试（codex E5，对齐 [018-G3]/[020] tasks 范式）
 * - realtime check 行为（title/duration/startTime 边界）
 * - submit 聚合规则 timebox_fields_valid（复刻原 onValidate 全逻辑）
 * - [020] registry rule 自带 meta（check/fields/message）不变式
 * - [020] R14 fail-CLOSED 行为：realtime rule 抛错 → evaluateDomainRules 返回 Rejected
 */
import { describe, it, expect } from 'vitest'
import { timeboxRuleRegistry } from '../rules-registry'
import { evaluateDomainRules } from '@/nexus/rules'
import type { DomainRuleRegistry } from '@/nexus/rules'
import type { StructuredIntent } from '@/usom/types/objects'

const { realtime } = timeboxRuleRegistry

describe('timebox_title_required (realtime)', () => {
  const check = realtime.timebox_title_required.check

  it('非空字符串 → 无错误', () => {
    expect(check('深度工作', {})).toEqual([])
  })

  it('空字符串 → 报错', () => {
    const issues = check('', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('title')
  })

  it('纯空白 → 报错', () => {
    const issues = check('   ', {})
    expect(issues).toHaveLength(1)
  })

  it('undefined → 无错误（允许部分更新，submit 聚合兜底）', () => {
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_duration_range (realtime)', () => {
  const check = realtime.timebox_duration_range.check

  it('5-480 整数 → 无错误', () => {
    expect(check(5, {})).toEqual([])
    expect(check(480, {})).toEqual([])
    expect(check(60, {})).toEqual([])
  })

  it('< 5 → 报错', () => {
    expect(check(4, {})).toHaveLength(1)
  })

  it('> 480 → 报错', () => {
    expect(check(481, {})).toHaveLength(1)
  })

  it('非整数 → 报错', () => {
    expect(check(60.5, {})).toHaveLength(1)
  })

  it('非 number → 无错误（submit 兜底）', () => {
    expect(check('abc', {})).toEqual([])
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_start_time_format (realtime)', () => {
  const check = realtime.timebox_start_time_format.check

  it('有效 ISO 8601 → 无错误', () => {
    expect(check('2026-06-28T14:00:00Z', {})).toEqual([])
    expect(check('2026-06-28T14:00', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    expect(check('not-a-date', {})).toHaveLength(1)
    expect(check(12345, {})).toHaveLength(1)
  })

  it('空值 → 无错误（submit 兜底）', () => {
    expect(check('', {})).toEqual([])
    expect(check(undefined, {})).toEqual([])
  })
})

describe('timebox_fields_valid (submit — 聚合规则，复刻原 onValidate)', () => {
  const check = timeboxRuleRegistry.submit.timebox_fields_valid.check
  const baseIntent = (fields: Record<string, unknown>): StructuredIntent => ({
    id: '1' as any,
    intentionId: 'i1' as any,
    targetDomain: 'timebox',
    action: 'createTimebox',
    fields,
    confidence: 1,
    resolvedBy: 'form',
    createdAt: '',
  }) as any

  it('全字段合法 → Passed', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: '2026-06-28T14:00:00Z', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Passed')
  })

  it('缺 title → Rejected', async () => {
    const result = await check(
      baseIntent({ startTime: '2026-06-28T14:00:00Z', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })

  it('duration 超范围 → Rejected', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: '2026-06-28T14:00:00Z', duration: 600 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })

  it('startTime 无效 → Rejected', async () => {
    const result = await check(
      baseIntent({ title: '写作', startTime: 'bad', duration: 60 }),
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
  })
})

// ─── [020] registry rule 自带 meta 不变式 ──────────────────────────
describe('[020] timebox registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且 fields 恰 1 字段', () => {
    for (const [id, rule] of Object.entries(timeboxRuleRegistry.realtime)) {
      expect(typeof rule.check, `${id} check`).toBe('function')
      expect(Array.isArray(rule.fields), `${id} fields`).toBe(true)
      expect(rule.fields.length, `${id} fields 恰 1 字段`).toBe(1)
      expect(typeof rule.message, `${id} message`).toBe('string')
      expect(rule.message.length, `${id} message 非空`).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 timebox_fields_valid 含 meta', () => {
    const rule = timeboxRuleRegistry.submit.timebox_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message.length).toBeGreaterThan(0)
  })
})

// ─── [020] R14 fail-CLOSED 行为 ──────────────────────────────────
describe('[020] R14 fail-CLOSED 行为', () => {
  it('realtime rule throw → evaluateDomainRules 返回 Rejected（非 unhandled）', async () => {
    const throwingRegistry: DomainRuleRegistry = {
      realtime: {
        thrower: {
          check: () => { throw new Error('boom') },
          fields: ['title'],
          message: 'should not reach',
        },
      },
      submit: {},
    }
    const result = await evaluateDomainRules(
      'timebox',
      {
        id: '1' as any,
        intentionId: 'i1' as any,
        targetDomain: 'timebox',
        action: 'createTimebox',
        fields: { title: 'x' },
        confidence: 1,
        resolvedBy: 'form',
        createdAt: '',
      } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
      throwingRegistry,
    )
    expect(result.kind).toBe('Rejected')
  })
})
