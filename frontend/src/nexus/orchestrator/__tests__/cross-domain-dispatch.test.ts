/**
 * @file cross-domain-dispatch.test
 * @brief [022-A4] Orchestrator post-mutation 跨域事件分发测试
 *
 * 验证 dispatchCrossDomainEvents（通过 orchestrator.executeIntent 间接调用）：
 * - 同域事件被 L891-893 既有 onEvent 处理，post-hook 跳过（不双重分发，R1 缓解）
 * - 跨域事件按 manifest.subscribedEvents 分发到目标域 onEvent
 * - 错误隔离（try/catch）
 * - 走 eventRepo.findByUserInRange + intentId 过滤（R7 缓解）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// hoisted mocks（必须在 top-level 才能被 vi.mock factory 访问）
const { mockOkrsOnEvent, mockHabitsOnEvent, mockTasksOnEvent } = vi.hoisted(() => ({
  mockOkrsOnEvent: vi.fn(),
  mockHabitsOnEvent: vi.fn(),
  mockTasksOnEvent: vi.fn(),
}))

vi.mock('@/domains/registry', () => ({
  findDomain: (id: string) => {
    if (id === 'okrs') return {
      manifest: { domainId: 'okrs', subscribedEvents: ['TaskCompleted', 'HabitLogged'] },
      onEvent: mockOkrsOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    }
    if (id === 'habits') return {
      manifest: { domainId: 'habits', subscribedEvents: ['TaskCompleted'] },
      onEvent: mockHabitsOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    }
    if (id === 'tasks') return {
      manifest: { domainId: 'tasks', subscribedEvents: [] },
      onEvent: mockTasksOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    }
    return undefined
  },
  domainRegistry: [
    {
      manifest: { domainId: 'okrs', subscribedEvents: ['TaskCompleted', 'HabitLogged'] },
      onEvent: mockOkrsOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    },
    {
      manifest: { domainId: 'habits', subscribedEvents: ['TaskCompleted'] },
      onEvent: mockHabitsOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    },
    {
      manifest: { domainId: 'tasks', subscribedEvents: [] },
      onEvent: mockTasksOnEvent,
      onValidate: () => ({ kind: 'Passed' }),
      onActionSurfaceRequest: () => ({ actions: [], category: 'cue', weight: 0 }),
    },
  ],
  findHandler: () => undefined,
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (id: string) => {
    if (id === 'tasks') {
      return {
        success: true,
        manifest: {
          id: 'tasks',
          version: '1.0.0',
          name: 'Tasks',
          description: 'tasks',
          intent_triggers: [],
          lifecycle: {
            task: {
              states: ['active', 'completed', 'archived'],
              initial_state: 'active',
              transitions: [
                { from: 'active', to: 'completed', trigger: 'intent' as const, action: 'complete', event_type: 'TaskCompleted' },
              ],
              terminal_states: ['archived'],
            },
          },
          field_metadata: {},
          list_actions: [],
          required_fields: {},
          subscribed_events: [],
        },
      }
    }
    return { success: false, errors: [{ domainId: id, message: 'not found' }] }
  },
}))

vi.mock('@/domains/plugin-factory', () => ({
  createDomainPlugin: (manifest: any, hooks: any) => ({
    manifest,
    onValidate: hooks?.onValidate ?? (() => ({ kind: 'Passed' })),
    onEvent: hooks?.onEvent ?? (() => {}),
    onActionSurfaceRequest: hooks?.onActionSurfaceRequest ?? (() => ({ actions: [], category: 'cue', weight: 0 })),
  }),
}))

vi.mock('../lifecycle-configs', () => ({
  buildActionMap: () => ({}),
  resolveObjectType: () => 'task',
  getLifecycleFromManifest: () => ({
    states: ['active', 'completed', 'archived'],
    initial_state: 'active',
    transitions: [
      { from: 'active', to: 'completed', trigger: 'intent' as const, action: 'complete', event_type: 'TaskCompleted' },
    ],
    terminal_states: ['archived'],
  }),
}))

import { createOrchestrator } from '../index'

describe('[022-A4] Orchestrator dispatchCrossDomainEvents', () => {
  let mockEventRepo: any
  let mockRuleEngine: any
  let orchestrator: ReturnType<typeof createOrchestrator>

  beforeEach(() => {
    mockOkrsOnEvent.mockReset().mockResolvedValue({ metrics: [], suggestions: [] })
    mockHabitsOnEvent.mockReset().mockResolvedValue({ metrics: [], suggestions: [] })
    mockTasksOnEvent.mockReset().mockResolvedValue({ metrics: [], suggestions: [] })

    mockEventRepo = {
      append: vi.fn().mockResolvedValue(undefined),
      findByUserInRange: vi.fn().mockResolvedValue([]),
      findUnprocessed: vi.fn().mockResolvedValue([]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
    }

    mockRuleEngine = {
      evaluate: vi.fn().mockResolvedValue({ result: 'pass', warnings: [] }),
    }

    orchestrator = createOrchestrator({
      intentEngine: { parse: vi.fn() } as any,
      ruleEngine: mockRuleEngine,
      eventRepo: mockEventRepo,
      stateProposalRepo: {} as any,
      cascadeCheck: vi.fn().mockResolvedValue({ kind: 'Passed' }) as any,
      actionSurfaceEngine: undefined,
      getRepo: vi.fn().mockReturnValue({
        getCurrentState: vi.fn().mockResolvedValue('active'),
        transition: vi.fn().mockResolvedValue({ success: true }),
        findById: vi.fn().mockResolvedValue({ id: 'task-1', status: 'active' }),
        updateStatus: vi.fn().mockResolvedValue({ success: true, object: { id: 'task-1', status: 'completed' }, event: {
          id: 'evt-1' as any,
          type: 'TaskCompleted',
          occurredAt: new Date().toISOString() as any,
          triggeredBy: 'state_machine',
          payload: { objectId: 'task-1', intentId: 'intent-test-1' },
          snapshotId: 'snap' as any,
        } }),
      }),
      onTrace: undefined,
    } as any)
  })

  it('同域事件不通过 post-hook 触发 onEvent（R1 缓解验证）', async () => {
    const intentId = 'intent-test-1'
    mockEventRepo.findByUserInRange.mockResolvedValueOnce([
      {
        id: 'evt-1' as any,
        type: 'TaskCompleted',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { objectId: 'task-1', intentId },
        snapshotId: 'snap' as any,
      },
    ])

    const intent = {
      id: intentId as any,
      intentionId: 'intention-1' as any,
      targetDomain: 'tasks',
      action: 'complete',
      fields: { objectId: 'task-1' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      pathType: 'contract',
      createdAt: new Date().toISOString() as any,
    }

    await orchestrator.executeIntent(intent as any, 'user-1' as any)

    // OKR 订阅 TaskCompleted —— 跨域分发（tasks 不订阅）
    expect(mockOkrsOnEvent).toHaveBeenCalledTimes(1)
    // habits 也订阅 TaskCompleted —— 跨域分发
    expect(mockHabitsOnEvent).toHaveBeenCalledTimes(1)
  })

  it('eventRepo 抛错被隔离（不影响主流程）', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockEventRepo.findByUserInRange.mockRejectedValueOnce(new Error('DB connection lost'))

    const intent = {
      id: 'intent-test-2' as any,
      intentionId: 'intention-1' as any,
      targetDomain: 'tasks',
      action: 'complete',
      fields: { objectId: 'task-1' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      pathType: 'contract',
      createdAt: new Date().toISOString() as any,
    }

    const result = await orchestrator.executeIntent(intent as any, 'user-1' as any)
    expect(result).toBeDefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('HabitLogged 事件分发到订阅域（OKR）', async () => {
    const intentId = 'intent-test-3'
    // 模拟 HabitLogged 事件（task 域执行，habits 域订阅，但需 OKR 也订阅 → 跨域分发）
    // 这里把 intent 走 tasks 域（已 mock）但模拟 eventRepo 返回 HabitLogged
    mockEventRepo.findByUserInRange.mockResolvedValueOnce([
      {
        id: 'evt-2' as any,
        type: 'HabitLogged',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { objectId: 'habit-1', intentId },
        snapshotId: 'snap' as any,
      },
    ])

    // 使用 tasks 域（已 mock 好 lifecycle），模拟 eventRepo 返回 HabitLogged 事件
    const intent = {
      id: intentId as any,
      intentionId: 'intention-1' as any,
      targetDomain: 'tasks',
      action: 'complete',
      fields: { objectId: 'task-1' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      pathType: 'contract',
      createdAt: new Date().toISOString() as any,
    }

    await orchestrator.executeIntent(intent as any, 'user-1' as any)

    // OKR 订阅 HabitLogged —— 应被分发（tasks 同域跳过，habits 不订阅 HabitLogged）
    expect(mockOkrsOnEvent).toHaveBeenCalledTimes(1)
  })

  it('未订阅事件不触发跨域 onEvent', async () => {
    const intentId = 'intent-test-4'
    mockEventRepo.findByUserInRange.mockResolvedValueOnce([
      {
        id: 'evt-3' as any,
        type: 'TimeboxLogged',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { objectId: 'tb-1', intentId },
        snapshotId: 'snap' as any,
      },
    ])

    const intent = {
      id: intentId as any,
      intentionId: 'intention-1' as any,
      targetDomain: 'tasks',
      action: 'complete',
      fields: { objectId: 'task-1' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      pathType: 'contract',
      createdAt: new Date().toISOString() as any,
    }

    await orchestrator.executeIntent(intent as any, 'user-1' as any)

    // 无域订阅 TimeboxLogged —— 不应触发
    expect(mockOkrsOnEvent).not.toHaveBeenCalled()
    expect(mockHabitsOnEvent).not.toHaveBeenCalled()
  })

  it('intentId 不匹配的事件被过滤掉', async () => {
    const intentId = 'intent-test-5'
    mockEventRepo.findByUserInRange.mockResolvedValueOnce([
      {
        id: 'evt-other' as any,
        type: 'TaskCompleted',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { objectId: 'task-other', intentId: 'OTHER-INTENT' },
        snapshotId: 'snap' as any,
      },
    ])

    const intent = {
      id: intentId as any,
      intentionId: 'intention-1' as any,
      targetDomain: 'tasks',
      action: 'complete',
      fields: { objectId: 'task-1' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      pathType: 'contract',
      createdAt: new Date().toISOString() as any,
    }

    await orchestrator.executeIntent(intent as any, 'user-1' as any)

    expect(mockOkrsOnEvent).not.toHaveBeenCalled()
    expect(mockHabitsOnEvent).not.toHaveBeenCalled()
  })
})