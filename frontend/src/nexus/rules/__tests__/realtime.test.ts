/**
 * @file realtime.test
 * @brief R0 Task6 — evaluateRealtimeRules 纯核心：命中字段的 both 规则
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules } from '../realtime'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

const ctx = {}

describe('evaluateRealtimeRules — fixture', () => {
  it('blur name=空 → 命中 fixture_name_required，返回 1 issue', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'name', '', ctx, fixtureRuleRegistry)
    expect(issues).toEqual([{ field: 'name', message: '名称不能为空' }])
  })

  it('blur name=合法 → 无 issue', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'name', 'ok', ctx, fixtureRuleRegistry)
    expect(issues).toEqual([])
  })

  it('blur count → 无 both 规则命中 count（fixture_count_positive 是 submit，不进 realtime）', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'count', -1, ctx, fixtureRuleRegistry)
    expect(issues).toEqual([])
  })

  it('realtime check 抛错 → fail-OPEN（吞错，返回空，不崩）', () => {
    const throwingRegistry = {
      realtime: { fixture_name_required: (() => { throw new Error('boom') }) as any },
      submit: {},
    }
    const issues = evaluateRealtimeRules('_rulefixture', 'name', 'x', ctx, throwingRegistry)
    expect(issues).toEqual([])
  })
})
