import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

// Mock context-engine
vi.mock('@/nexus/context-engine', () => ({
  assembleContext: vi.fn().mockResolvedValue({
    intent: { id: 'i1', action: 'createSmartSchedule' },
    contexts: { existingTimeboxes: [], activeTasks: [] },
  }),
}))

// Mock @/domains/registry
vi.mock('@/domains/registry', () => ({
  findDomain: () => ({
    onValidate: () => ({ valid: true, errors: [] }),
    onEvent: () => {},
    manifest: { domainId: 'timebox', version: '1.0.0' },
  }),
  findHandler: vi.fn(),
}))

// Mock @/domains/manifest-loader — 默认无 generation_actions
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

vi.mock('../lifecycle-configs', () => ({
  buildActionMap: () => ({ createTimebox: 'create' }),
  resolveObjectType: () => 'timebox',
  getTransitionFromManifest: () => undefined,
  getLifecycleFromManifest: () => ({
    states: ['planned', 'running', 'ended', 'cancelled', 'logged'],
    initial_state: 'planned',
    transitions: [
      { from: null, action: 'create', to: 'planned', event_type: 'TimeboxCreated' },
    ],
    terminal_states: ['cancelled', 'logged'],
  }),
}))

import { createOrchestrator } from '../index'
import { findHandler } from '@/domains/registry'
import { assembleContext } from '@/nexus/context-engine'

function makeDeps() {
  return {
    eventRepo: {
      append: vi.fn(),
      findByUserInRange: vi.fn().mockResolvedValue([]),
      findUnprocessed: vi.fn().mockResolvedValue([]),
      markProcessed: vi.fn(),
    },
    intentEngine: {
      parse: vi.fn(),
    },
    ruleEngine: {
      evaluate: vi.fn().mockResolvedValue({ result: 'pass', warnings: [] }),
    },
    getRepo: () => ({
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'mock-id', status: 'planned' }),
    }),
  }
}

function makeIntent(action: string, domainId = 'timebox'): StructuredIntent {
  return {
    id: 'test-intent' as any,
    intentionId: '' as any,
    targetDomain: domainId,
    action,
    fields: { date: '2026-05-20' },
    confidence: 1.0,
    resolvedBy: 'ai',
    createdAt: '2026-05-20T00:00:00Z' as any,
  }
}

describe('Orchestrator Generative Path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      },
    })
  })

  it('routes generative action through ContextEngine → Handler', async () => {
    // 配置 manifest 包含 generation_actions
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
            contexts: [{ id: 'existingTimeboxes', query: 'test', params: ['date'] }],
          },
        },
      },
    })

    const mockHandler = {
      handle: vi.fn().mockResolvedValue({
        proposalSet: { id: 'ps1', label: 'test', proposals: [], tags: [] },
        presentation: { type: 'markdown', content: '# test' },
        warnings: [],
      }),
    }
    vi.mocked(findHandler).mockResolvedValue(mockHandler as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createSmartSchedule')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.generativeResult).toBeDefined()
    expect(result.generativeResult!.proposalSet.label).toBe('test')
    expect(assembleContext).toHaveBeenCalled()
    expect(findHandler).toHaveBeenCalledWith('timebox', 'createSmartSchedule')
    expect(mockHandler.handle).toHaveBeenCalled()
  })

  it('falls through to reactive path for non-generative actions', async () => {
    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createTimebox')

    // createTimebox 不在 generation_actions 中，应走被动型路径
    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    // 被动型路径会走 timebox SM（因为我们 mock 了 loadManifest 返回无 generation_actions 的 manifest）
    // 不会调用 assembleContext
    expect(assembleContext).not.toHaveBeenCalled()
    expect(findHandler).not.toHaveBeenCalled()
  })

  it('returns error when Handler throws', async () => {
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

    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn().mockRejectedValue(new Error('Handler explosion')),
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createSmartSchedule')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Handler explosion')
    // 错误事件被记录
    expect(deps.eventRepo.append).toHaveBeenCalled()
  })

  it('emits trace events for generative path', async () => {
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

    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn().mockResolvedValue({
        proposalSet: { id: 'ps1', label: 'test', proposals: [], tags: [] },
      }),
    } as any)

    const traceSteps: unknown[] = []
    const deps = { ...makeDeps(), onTrace: (step: unknown) => traceSteps.push(step) }
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createSmartSchedule')

    await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    // 应至少包含 ContextEngine + Handler 的 start/end
    const components = traceSteps.map((s: any) => s.component)
    expect(components).toContain('ContextEngine')
    expect(components).toContain('Handler')

    // 每个组件应有 start 和 end
    const cePhases = traceSteps.filter((s: any) => s.component === 'ContextEngine').map((s: any) => s.phase)
    const hPhases = traceSteps.filter((s: any) => s.component === 'Handler').map((s: any) => s.phase)
    expect(cePhases).toContain('start')
    expect(cePhases).toContain('end')
    expect(hPhases).toContain('start')
    expect(hPhases).toContain('end')
  })
})
