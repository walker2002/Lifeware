import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import {
  registerContextCapability,
  resolveContext,
  getRegisteredCapabilities,
  clearRegistry,
} from '../registry'
import type { ContextCapability } from '@/usom/types/process'

const TestSchema = z.object({ items: z.array(z.string()) })

function makeCap(id: string, data: unknown, visibility: ContextCapability['visibility'] = 'planning'): ContextCapability {
  return {
    id,
    visibility,
    schema: TestSchema,
    provider: {
      provide: async (_query: string, _params: Record<string, unknown>) => data,
    },
  }
}

describe('Context Registry', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('registers and resolves a capability', async () => {
    registerContextCapability(makeCap('testCap', { items: ['a', 'b'] }))
    const result = await resolveContext('testCap', 'any', {})
    expect(result).toEqual({ items: ['a', 'b'] })
  })

  it('throws on unknown capability id', async () => {
    await expect(resolveContext('nonexistent', 'any', {})).rejects.toThrow(/nonexistent/)
  })

  it('rejects data that fails schema validation', async () => {
    const cap: ContextCapability = {
      id: 'badCap',
      visibility: 'planning',
      schema: z.object({ count: z.number() }),
      provider: {
        provide: async () => ({ count: 'not-a-number' }),
      },
    }
    registerContextCapability(cap)
    await expect(resolveContext('badCap', 'any', {})).rejects.toThrow(/schema/i)
  })

  it('enforces visibility when required', async () => {
    registerContextCapability(makeCap('privateCap', { items: [] }, 'private'))
    await expect(
      resolveContext('privateCap', 'any', {}, 'planning'),
    ).rejects.toThrow(/visibility/)
  })

  it('lists all registered capability ids', () => {
    registerContextCapability(makeCap('cap1', { items: [] }))
    registerContextCapability(makeCap('cap2', { items: [] }))
    expect(getRegisteredCapabilities()).toEqual(expect.arrayContaining(['cap1', 'cap2']))
  })

  describe('resolveContext error messages', () => {
    afterEach(() => {
      clearRegistry()
    })

    it('未注册 capability 时错误消息含已注册列表', async () => {
      registerContextCapability(makeCap('existingTimeboxes', { items: [] }))
      await expect(resolveContext('activeHabits', 'q', {})).rejects.toThrow(/activeHabits/)
      await expect(resolveContext('activeHabits', 'q', {})).rejects.toThrow(/existingTimeboxes/)
    })
  })

  it('handles concurrent calls to the same capability', async () => {
    let callCount = 0
    const cap: ContextCapability = {
      id: 'concurrent',
      visibility: 'planning',
      schema: TestSchema,
      provider: {
        provide: async () => {
          callCount++
          return { items: [String(callCount)] }
        },
      },
    }
    registerContextCapability(cap)

    const [r1, r2, r3] = await Promise.all([
      resolveContext('concurrent', 'any', {}),
      resolveContext('concurrent', 'any', {}),
      resolveContext('concurrent', 'any', {}),
    ])
    expect(callCount).toBe(3)
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
    expect(r3).toBeDefined()
  })
})
