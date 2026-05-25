import { describe, it, expect } from 'vitest'
import { resolvePathType } from '../path-router'
import type { DomainManifest } from '@/domains/manifest-loader/schema'

function makeManifest(overrides: Partial<DomainManifest> = {}): DomainManifest {
  return {
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
    view_routes: {},
    ...overrides,
  } as DomainManifest
}

describe('resolvePathType', () => {
  it('returns "query" when action is in query_actions', () => {
    const manifest = makeManifest({
      query_actions: {
        list_items: {
          description: 'list',
          response_mode: 'cnui',
          context_capabilities: [],
        },
      },
    })
    expect(resolvePathType('list_items', manifest)).toBe('query')
  })

  it('returns "generative" when action is in generation_actions', () => {
    const manifest = makeManifest({
      generation_actions: {
        createItem: {
          description: 'create',
          contexts: [],
        },
      },
    })
    expect(resolvePathType('createItem', manifest)).toBe('generative')
  })

  it('query_actions takes priority over generation_actions', () => {
    const manifest = makeManifest({
      query_actions: {
        sharedAction: {
          description: 'query version',
          response_mode: 'cnui',
          context_capabilities: [],
        },
      },
      generation_actions: {
        sharedAction: {
          description: 'gen version',
          contexts: [],
        },
      },
    })
    expect(resolvePathType('sharedAction', manifest)).toBe('query')
  })

  it('returns "contract" when action is in neither', () => {
    const manifest = makeManifest({})
    expect(resolvePathType('unknownAction', manifest)).toBe('contract')
  })

  it('returns "contract" when manifest is null', () => {
    expect(resolvePathType('anyAction', null)).toBe('contract')
  })

  it('returns "contract" when query_actions is undefined', () => {
    const manifest = makeManifest({ query_actions: undefined })
    expect(resolvePathType('anyAction', manifest)).toBe('contract')
  })
})
