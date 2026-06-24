/**
 * @file realtime.test
 * @brief evaluateRealtimeRules 纯核心 + realtimeMetaFromRegistry：命中字段的 realtime 规则（client-safe）
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules, realtimeMetaFromRegistry } from '../realtime'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'
import type { DomainRuleRegistry } from '../types'

const ctx = {}

describe('evaluateRealtimeRules — fixture', () => {
  it('blur name=空 → 命中 fixture_name_required，返回 1 issue', () => {
    expect(evaluateRealtimeRules(fixtureRuleRegistry, 'name', '', ctx))
      .toEqual([{ field: 'name', message: '名称不能为空' }])
  })
  it('blur name=合法 → 无 issue', () => {
    expect(evaluateRealtimeRules(fixtureRuleRegistry, 'name', 'ok', ctx)).toEqual([])
  })
  it('blur count → 无 realtime 规则命中 count（fixture_count_positive 是 submit，不进 realtime）', () => {
    expect(evaluateRealtimeRules(fixtureRuleRegistry, 'count', -1, ctx)).toEqual([])
  })
  it('realtime check 抛错 → fail-OPEN（吞错，返回空，不崩）', () => {
    const throwingRegistry: DomainRuleRegistry = {
      realtime: { fixture_name_required: { check: () => { throw new Error('boom') }, fields: ['name'], message: '名称必填' } },
      submit: {},
    }
    expect(evaluateRealtimeRules(throwingRegistry, 'name', 'x', ctx)).toEqual([])
  })
})

describe('[020] realtime 读 registry', () => {
  const reg: DomainRuleRegistry = {
    realtime: {
      r1: { check: (v: unknown) => (v === 'bad' ? [{ field: 'a', message: '错' }] : []), fields: ['a'], message: 'a 提示' },
      r2: { check: () => [], fields: ['b'], message: 'b 提示' },
    },
    submit: {},
  }

  it('realtimeMetaFromRegistry 从 registry 派生 meta', () => {
    const meta = realtimeMetaFromRegistry(reg)
    expect(meta).toEqual([
      { id: 'r1', fields: ['a'], message: 'a 提示' },
      { id: 'r2', fields: ['b'], message: 'b 提示' },
    ])
  })

  it('evaluateRealtimeRules 直接读 registry（单参 registry）', () => {
    const issues = evaluateRealtimeRules(reg, 'a', 'bad', {})
    expect(issues).toEqual([{ field: 'a', message: '错' }])
    // 命中字段过滤：b 字段规则不跑
    expect(evaluateRealtimeRules(reg, 'b', 'x', [])).toEqual([])
  })
})
