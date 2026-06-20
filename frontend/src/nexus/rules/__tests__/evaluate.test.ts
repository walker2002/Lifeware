/**
 * @file evaluate.test
 * @brief R0 Task5 — evaluateDomainRules 聚合 + fail-closed + fixture round-trip
 */
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateDomainRules } from '../evaluate'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

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
    const throwingRegistry = {
      realtime: {},
      submit: {
        fixture_count_positive: (async () => { throw new Error('repo down') }) as any,
      },
    }
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 5 }), ctx, throwingRegistry)
    expect(r.kind).toBe('Rejected')
  })
})
