/**
 * @file evaluate.test
 * @brief evaluateDomainRules 聚合 + fail-closed + fixture round-trip + [020] registry 直读
 */
import { describe, it, expect } from 'vitest'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateDomainRules } from '../evaluate'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'
import type { DomainRuleRegistry } from '../types'

const ctx = { repos: {}, userId: 'u-1' as USOM_ID, now: 0 }

function intent(fields: Record<string, unknown>): StructuredIntent {
  return {
    id: 'i', intentionId: 'in', targetDomain: '_rulefixture',
    action: 'create', fields, confidence: 1, resolvedBy: 'template_form',
    createdAt: '2026-06-20T00:00:00Z',
  } as unknown as StructuredIntent
}

describe('evaluateDomainRules — fixture round-trip', () => {
  it('both 规则空 name → Rejected（realtime 重跑 + 适配）', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: '', count: 5 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Rejected')
  })

  it('both 规则合法 name + submit 规则 count>0 → Passed', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 5 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Passed')
  })

  it('submit 规则 count<=0 → Rejected', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 0 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Rejected')
  })

  it('无 rules 的域 → Passed（真实域 R0 兼容）', async () => {
    const r = await evaluateDomainRules('__nonexistent__', intent({}), ctx, { realtime: {}, submit: {} })
    expect(r.kind).toBe('Passed')
  })
})

describe('evaluateDomainRules — fail-closed', () => {
  it('SubmitCheck 抛错 → Rejected（fail-closed，不放过）', async () => {
    const throwingRegistry: DomainRuleRegistry = {
      realtime: {},
      submit: {
        fixture_count_positive: {
          check: (async () => { throw new Error('repo down') }) as any,
          fields: ['count'],
          message: '数量必须为正数',
        },
      },
    }
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 5 }), ctx, throwingRegistry)
    expect(r.kind).toBe('Rejected')
  })
})

describe('[020] evaluateDomainRules 读 registry（不经 manifest）', () => {
  // baseIntent：构造最小合法 StructuredIntent；[020] 起不再读 manifest，域 id 无意义。
  const baseIntent = (action: string, fields: Record<string, unknown> = {}): StructuredIntent =>
    ({ id: 'i1', intentionId: 'in', targetDomain: 'test', action, fields, confidence: 1, resolvedBy: 'template_form', createdAt: '2026-06-20T00:00:00Z' } as unknown as StructuredIntent)
  const serverCtx = { repos: {}, userId: 'u' as unknown as USOM_ID, now: 0 }

  it('D 模式吞粒：submit Rejected 先胜出，realtime 错被吞（RT3 regression）', async () => {
    // RT3/outside-voice F6：arrayContaining 会掩盖吞粒，必须用精确断言。
    // submit 先跑 → Rejected(['submit-err']) 先进 results；realtime 后跑虽产
    // RT_ERROR_SHOULD_BE_SWALLOWED，但 aggregateValidation（a.kind==='Rejected' return a）
    // 折叠时首个 Rejected 胜出吞粒度——realtime 错不应出现在最终 errors。
    const reg: DomainRuleRegistry = {
      realtime: { rt1: { check: () => [{ field: 'a', message: 'RT_ERROR_SHOULD_BE_SWALLOWED' }], fields: ['a'], message: 'rt' } },
      submit: { s1: { check: async () => validationRejected(['submit-err']), fields: ['a'], message: 'submit' } },
    }
    const res = await evaluateDomainRules('test', baseIntent('x', { a: 1 }), serverCtx, reg)
    expect(res.kind).toBe('Rejected')
    const errors = (res as { errors: string[] }).errors
    expect(errors).toContain('submit-err')
    expect(errors.some(e => e.includes('RT_ERROR_SHOULD_BE_SWALLOWED'))).toBe(false) // realtime 错被吞
  })

  it('submit 全过 + realtime 命中 → Rejected', async () => {
    const reg: DomainRuleRegistry = {
      realtime: { rt1: { check: (v: unknown) => (typeof v === 'number' && v < 0 ? [{ field: 'a', message: '负数' }] : []), fields: ['a'], message: 'rt' } },
      submit: { s1: { check: async () => validationPassed(), fields: ['a'], message: 'submit' } },
    }
    const res = await evaluateDomainRules('test', baseIntent('x', { a: -1 }), serverCtx, reg)
    expect(res.kind).toBe('Rejected')
  })

  it('registry 无规则 → Passed', async () => {
    const res = await evaluateDomainRules('test', baseIntent('x'), serverCtx, { realtime: {}, submit: {} })
    expect(res.kind).toBe('Passed')
  })
})
