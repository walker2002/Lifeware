/**
 * @file integrity.test
 * @brief R0 Task3 — validateRuleIntegrity：manifest rule.id ↔ registry 一致性
 */
import { describe, it, expect } from 'vitest'
import { validateRuleIntegrity } from '../integrity'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '../types'
import type { Rule } from '@/usom/types/domain-types'
import { validationPassed } from '@/usom/types/process'

const rt = (() => []) as RealtimeCheck
const sm = (async () => validationPassed()) as SubmitCheck

function manifestWith(rules: Rule[]) {
  return { rules } as { rules: Rule[] }
}

describe('validateRuleIntegrity', () => {
  it('合法：both 规则有 realtime check，submit 规则有 submit check', () => {
    const m = manifestWith([
      { id: 'a', phase: 'both', fields: ['x'], message: 'a' },
      { id: 'b', phase: 'submit', fields: ['y'], message: 'b' },
    ])
    const reg: DomainRuleRegistry = { realtime: { a: rt }, submit: { b: sm } }
    expect(validateRuleIntegrity(m, reg)).toEqual([])
  })

  it('违法：both 规则缺 realtime check（孤儿 id）', () => {
    const m = manifestWith([{ id: 'a', phase: 'both', fields: ['x'], message: 'a' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    const errs = validateRuleIntegrity(m, reg)
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('a')
  })

  it('违法：submit 规则缺 submit check', () => {
    const m = manifestWith([{ id: 'b', phase: 'submit', fields: ['y'], message: 'b' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    expect(validateRuleIntegrity(m, reg)).toHaveLength(1)
  })

  it('违法：both 规则的 check 注册在 submit 而非 realtime', () => {
    const m = manifestWith([{ id: 'a', phase: 'both', fields: ['x'], message: 'a' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: { a: sm } }
    expect(validateRuleIntegrity(m, reg)).toHaveLength(1)
  })

  it('合法：无 rules（真实域 R0）', () => {
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    expect(validateRuleIntegrity({ rules: undefined } as any, reg)).toEqual([])
  })

  it('违法：duplicate rule id', () => {
    const m = manifestWith([
      { id: 'a', phase: 'both', fields: ['x'], message: 'a' },
      { id: 'a', phase: 'both', fields: ['y'], message: 'a2' },
    ])
    const reg: DomainRuleRegistry = { realtime: { a: rt }, submit: {} }
    expect(validateRuleIntegrity(m, reg).length).toBeGreaterThanOrEqual(1)
  })
})
