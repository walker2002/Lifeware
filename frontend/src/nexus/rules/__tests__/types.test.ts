/**
 * @file types.test
 * @brief R0 Task1 — RuleSchema 结构不变式（§4.2：无 realtime-only / both⟹单字段）
 */
import { describe, it, expect } from 'vitest'
import { ManifestSchema } from '@/domains/manifest-loader/schema'

describe('RuleSchema 不变式', () => {
  it('合法：phase: both 单字段规则通过', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x_required', phase: 'both', fields: ['x'], message: 'x 必填' }],
    })
    expect(r.success).toBe(true)
  })

  it('合法：phase: submit 多字段规则通过', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'rel', phase: 'submit', fields: ['a', 'b'], message: 'a/b 关系' }],
    })
    expect(r.success).toBe(true)
  })

  it('违法：phase: realtime（无 realtime-only）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x', phase: 'realtime' as any, fields: ['x'], message: 'm' }],
    })
    expect(r.success).toBe(false)
  })

  it('违法：phase: both 多字段（both⟹单字段）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x', phase: 'both', fields: ['a', 'b'], message: 'm' }],
    })
    expect(r.success).toBe(false)
  })

  it('合法：无 rules 字段（向后兼容，真实域 R0 无 rules）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.rules).toBeUndefined()
  })
})
