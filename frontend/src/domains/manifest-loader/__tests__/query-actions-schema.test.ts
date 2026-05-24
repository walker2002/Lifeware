import { describe, it, expect } from 'vitest'
import { ManifestSchema } from '../schema'

const BASE_MANIFEST = {
  id: 'test',
  version: '1.0.0',
  name: 'Test',
  description: 'test',
  intent_triggers: [],
  lifecycle: {},
  field_metadata: {},
  list_actions: [],
  required_fields: {},
  subscribed_events: [],
}

describe('query_actions schema', () => {
  it('parses manifest with query_actions', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        list_items: {
          description: 'List items in conversation',
          response_mode: 'cnui',
          cnui_surface: 'item-list-card',
          context_capabilities: [
            { id: 'activeItems', query: 'active_items', params: ['userId'] },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const qa = result.data.query_actions!.list_items!
      expect(qa.description).toBe('List items in conversation')
      expect(qa.response_mode).toBe('cnui')
      expect(qa.cnui_surface).toBe('item-list-card')
      expect(qa.context_capabilities).toHaveLength(1)
    }
  })

  it('parses manifest with both query_actions and generation_actions', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      generation_actions: {
        createItem: {
          description: 'Create item',
          contexts: [{ id: 'existingItems', query: 'test', params: [] }],
        },
      },
      query_actions: {
        list_items: {
          description: 'List items',
          response_mode: 'text',
          context_capabilities: [
            { id: 'activeItems', query: 'test', params: [] },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.generation_actions).toBeDefined()
      expect(result.data.query_actions).toBeDefined()
    }
  })

  it('validates response_mode enum', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        bad: {
          description: 'bad',
          response_mode: 'invalid',
          context_capabilities: [],
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects query_actions with missing required fields', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        incomplete: {
          // missing description, response_mode, context_capabilities
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('query_actions is optional (backward compat)', () => {
    const result = ManifestSchema.safeParse(BASE_MANIFEST)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.query_actions).toBeUndefined()
    }
  })
})
