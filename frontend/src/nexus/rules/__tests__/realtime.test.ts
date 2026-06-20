/**
 * @file realtime.test
 * @brief R0/R1 — evaluateRealtimeRules 纯核心：命中字段的 both 规则（client-safe）
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from '../realtime'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

const ctx = {}
const fixtureBothRules: RealtimeRuleMeta[] = [
  { id: 'fixture_name_required', fields: ['name'] },
]

describe('evaluateRealtimeRules — fixture', () => {
  it('blur name=空 → 命中 fixture_name_required，返回 1 issue', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', '', ctx, fixtureRuleRegistry))
      .toEqual([{ field: 'name', message: '名称不能为空' }])
  })
  it('blur name=合法 → 无 issue', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', 'ok', ctx, fixtureRuleRegistry)).toEqual([])
  })
  it('blur count → 无 both 规则命中 count（fixture_count_positive 是 submit，不进 realtime）', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'count', -1, ctx, fixtureRuleRegistry)).toEqual([])
  })
  it('realtime check 抛错 → fail-OPEN（吞错，返回空，不崩）', () => {
    const throwingRegistry = {
      realtime: { fixture_name_required: (() => { throw new Error('boom') }) as any },
      submit: {},
    }
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', 'x', ctx, throwingRegistry)).toEqual([])
  })
})
