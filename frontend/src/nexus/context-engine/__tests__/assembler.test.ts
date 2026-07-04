import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { assembleContext } from '../assembler'
import { registerContextCapability, clearRegistry } from '../registry'
import type { ContextCapability } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { DomainManifest } from '@/domains/manifest-loader/schema'

const TestSchema = z.object({ value: z.string() })

function makeCap(id: string, returnValue: unknown): ContextCapability {
  return {
    id,
    visibility: 'planning',
    schema: TestSchema,
    provider: {
      provide: async (_query: string, params: Record<string, unknown>) => ({
        value: `${id}-${params.date ?? 'no-date'}`,
      }),
    },
  }
}

function makeIntent(action: string, fields: Record<string, unknown> = {}): StructuredIntent {
  return {
    id: 'intent-1' as any,
    intentionId: '' as any,
    targetDomain: 'timebox',
    action,
    fields,
    confidence: 1.0,
    resolvedBy: 'ai',
    createdAt: '2026-05-20T00:00:00Z' as any,
  }
}

function makeManifest(action: string, contextIds: string[], params: string[][] = []): DomainManifest {
  return {
    id: 'timebox',
    version: '1.0.0',
    name: 'Timebox',
    description: 'test',
    intent_triggers: [],
    lifecycle: {},
    field_metadata: {},
    list_actions: [],
    required_fields: {},
    subscribed_events: [],
    generation_actions: {
      [action]: {
        description: `test ${action}`,
        contexts: contextIds.map((id, i) => ({
          id,
          query: 'test_query',
          params: params[i] ?? [],
        })),
      },
    },
  } as DomainManifest
}

describe('Assembler', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('assembles all declared contexts into GenerationRequest', async () => {
    const ids = ['ctx1', 'ctx2', 'ctx3', 'ctx4', 'ctx5']
    ids.forEach(id => registerContextCapability(makeCap(id, {})))

    const intent = makeIntent('createSmartTimeboxes', { date: '2026-05-20' })
    const manifest = makeManifest('createSmartTimeboxes', ids, ids.map(() => ['date']))

    const result = await assembleContext(intent, manifest)

    expect(result.intent).toBe(intent)
    expect(Object.keys(result.contexts)).toHaveLength(5)
    expect(result.contexts.ctx1).toEqual({ value: 'ctx1-2026-05-20' })
  })

  it('throws when a declared capability does not exist', async () => {
    const intent = makeIntent('createSmartTimeboxes')
    const manifest = makeManifest('createSmartTimeboxes', ['missingCap'])

    await expect(assembleContext(intent, manifest)).rejects.toThrow(/missingCap/)
  })

  it('handles empty contexts list', async () => {
    const intent = makeIntent('emptyAction')
    const manifest = makeManifest('emptyAction', [])

    const result = await assembleContext(intent, manifest)
    expect(result.contexts).toEqual({})
  })

  it('maps params from intent.fields correctly', async () => {
    registerContextCapability(makeCap('withParam', {}))

    const intent = makeIntent('testAction', { date: '2026-05-20', userId: 'u1' })
    const manifest = makeManifest('testAction', ['withParam'], [['date']])

    const result = await assembleContext(intent, manifest)
    expect(result.contexts.withParam).toEqual({ value: 'withParam-2026-05-20' })
  })

  it('throws when action has no generation_actions entry', async () => {
    const intent = makeIntent('unknownAction')
    const manifest = makeManifest('otherAction', [])

    await expect(assembleContext(intent, manifest)).rejects.toThrow(/No action config/)
  })

  describe('Query Path support', () => {
    it('assembles query context from query_actions', async () => {
      registerContextCapability(makeCap('activeHabits', {}))

      const intent = makeIntent('list_active_habits', { userId: 'u1' })
      const manifest = makeManifest('list_active_habits', [], [])
      // 注入 query_actions
      ;(manifest as any).query_actions = {
        list_active_habits: {
          description: 'test',
          response_mode: 'cnui',
          context_capabilities: [
            { id: 'activeHabits', query: 'test_query', params: ['userId'] },
          ],
        },
      }

      const result = await assembleContext(intent, manifest)

      expect(result.intent).toBe(intent)
      // QueryContext 应有 contexts + intent
      expect(result).toHaveProperty('contexts')
      expect((result as any).contexts.activeHabits).toBeDefined()
    })

    it('still assembles generation context from generation_actions', async () => {
      registerContextCapability(makeCap('ctx1', {}))

      const intent = makeIntent('createSmartTimeboxes', { date: '2026-05-20' })
      const manifest = makeManifest('createSmartTimeboxes', ['ctx1'], [['date']])

      const result = await assembleContext(intent, manifest)

      expect(result.intent).toBe(intent)
      expect((result as any).contexts.ctx1).toEqual({ value: 'ctx1-2026-05-20' })
    })

    it('throws when action is in neither', async () => {
      const intent = makeIntent('unknownAction')
      const manifest = makeManifest('otherAction', [])

      await expect(assembleContext(intent, manifest)).rejects.toThrow(/No action config/)
    })
  })
})
