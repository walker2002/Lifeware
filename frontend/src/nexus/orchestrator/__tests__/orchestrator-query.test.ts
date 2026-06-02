import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

// Mock context-engine
vi.mock('@/nexus/context-engine', () => ({
  assembleContext: vi.fn().mockResolvedValue({
    intent: { id: 'i1', action: 'test' },
    contexts: {},
  }),
}))

// Mock @/domains/registry
vi.mock('@/domains/registry', () => ({
  findDomain: () => ({
    onValidate: () => ({ valid: true, errors: [] }),
    onEvent: () => {},
    manifest: { domainId: 'habits', version: '1.0.0' },
  }),
  findHandler: vi.fn(),
}))

// Mock @/domains/manifest-loader
const mockLoadManifest = vi.fn().mockReturnValue({
  success: true,
  manifest: {
    id: 'timebox',
    version: '1.0.0',
    name: 'Timebox',
    intent_triggers: [],
    lifecycle: {},
    field_metadata: {},
    list_actions: [],
    required_fields: {},
    subscribed_events: [],
  },
})

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (...args: unknown[]) => mockLoadManifest(...args),
}))

vi.mock('@/domains/plugin-factory', () => ({
  createDomainPlugin: () => null,
}))

vi.mock('@/domains/timebox/transitions', () => ({
  timeboxTransitions: [],
  findTransition: () => undefined,
}))

vi.mock('./lifecycle-configs', () => ({
  buildActionMap: () => ({}),
  resolveObjectType: () => 'timebox',
  getTransitionFromManifest: () => undefined,
}))

// Mock @/nexus/core/rule-engine
vi.mock('@/nexus/core/rule-engine', () => ({
  evaluateProposals: () => [],
}))

// Mock @/nexus/ai-runtime
vi.mock('@/nexus/ai-runtime', () => ({
  createAIRuntime: () => ({}),
}))

// Mock @/nexus/ai-runtime/session
const mockSessionManager = {
  findActiveSessionByDomain: vi.fn().mockReturnValue(undefined),
  create: vi.fn().mockResolvedValue({ id: 's1', domainId: 'habits', status: 'created' }),
  activate: vi.fn().mockResolvedValue({ id: 's1', domainId: 'habits', status: 'active' }),
  recordQueryResult: vi.fn(),
  getQueryResults: vi.fn().mockReturnValue([]),
}

vi.mock('@/nexus/ai-runtime/session', () => ({
  createAISessionManager: () => mockSessionManager,
}))

import { createOrchestrator } from '../index'
import { findHandler } from '@/domains/registry'
import { assembleContext } from '@/nexus/context-engine'

function makeDeps() {
  return {
    timeboxRepo: {
      findById: vi.fn().mockResolvedValue(null),
      findRunning: vi.fn().mockResolvedValue([]),
      findByStatus: vi.fn().mockResolvedValue([]),
      findUpcoming: vi.fn().mockResolvedValue([]),
      findByDateRange: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      archive: vi.fn(),
    },
    eventRepo: { append: vi.fn() },
    intentEngine: { parse: vi.fn() },
    ruleEngine: {
      evaluate: vi.fn().mockResolvedValue({ result: 'pass', warnings: [] }),
    },
  }
}

function makeIntent(action: string, domainId = 'habits', pathType?: string): StructuredIntent {
  return {
    id: 'test-intent' as any,
    intentionId: '' as any,
    targetDomain: domainId,
    action,
    fields: { userId: 'u1' },
    confidence: 1.0,
    resolvedBy: 'ai',
    pathType: pathType as any,
    createdAt: '2026-05-24T00:00:00Z' as any,
  }
}

describe('Orchestrator Query Path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'habits',
        version: '1.0.0',
        name: 'Habits',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        query_actions: {
          list_active_habits: {
            description: 'List habits',
            response_mode: 'cnui',
            cnui_surface: 'generic-list',
            context_capabilities: [
              { id: 'activeHabits', query: 'test', params: ['userId'] },
            ],
          },
        },
      },
    })
  })

  it('routes query path through Shortcut Path (no handler) and returns cnui result', async () => {
    vi.mocked(findHandler).mockResolvedValue(undefined) // 无 handler → Shortcut

    // Mock assembleContext to return QueryContext-shaped data
    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('list_active_habits', 'habits', 'query'),
      contexts: {
        activeHabits: [
          { id: 'h1', title: '晨跑', status: 'active' },
        ],
      },
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('list_active_habits', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.queryResult).toBeDefined()
    expect(result.queryResult!.type).toBe('cnui')
  })

  it('routes query path through Handler Path when handler.onQuery exists', async () => {
    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn(),
      onQuery: vi.fn().mockResolvedValue({
        type: 'text',
        content: '习惯分析报告...',
      }),
    } as any)

    // manifest 有 habit_statistics query_action（response_mode: text）
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'habits',
        version: '1.0.0',
        name: 'Habits',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        query_actions: {
          habit_statistics: {
            description: 'Stats',
            response_mode: 'text',
            context_capabilities: [
              { id: 'habitLogs', query: 'test', params: [] },
            ],
          },
        },
      },
    })

    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('habit_statistics', 'habits', 'query'),
      contexts: {
        habitLogs: [],
        habitStreaks: [],
      },
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('habit_statistics', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.queryResult).toBeDefined()
    expect(result.queryResult!.type).toBe('text')
  })

  it('returns error when query_action not found in manifest', async () => {
    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('nonexistent_query', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain('query_action')
  })

  it('generative path still works after refactor', async () => {
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'timebox',
        version: '1.0.0',
        name: 'Timebox',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        generation_actions: {
          createSmartSchedule: {
            description: 'test',
            contexts: [{ id: 'existingTimeboxes', query: 'test', params: [] }],
          },
        },
      },
    })

    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('createSmartSchedule', 'timebox'),
      contexts: { existingTimeboxes: [] },
    } as any)

    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn().mockResolvedValue({
        proposalSet: { id: 'ps1', label: 'test', proposals: [], tags: [] },
      }),
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createSmartSchedule', 'timebox')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.generativeResult).toBeDefined()
  })
})
