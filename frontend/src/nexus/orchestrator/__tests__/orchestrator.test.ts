// Orchestrator 单元测试
// TDD: 先写测试，再写实现

import { describe, it, expect, vi } from 'vitest'
import type { StructuredIntent, Habit, HabitTemplate } from '@/usom/types/objects'
import type { ActionSurface, ContextSnapshot } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'

// Mock @/domains/registry to avoid resolving domain index files (which import fs-dependent loader)
vi.mock('@/domains/registry', () => ({
  findDomain: () => ({
    onValidate: () => ({ valid: true, errors: [] as string[] }),
    onEvent: () => {},
    onActionSurfaceRequest: () => [],
    manifest: { domainId: 'test', version: '1.0.0', requiredFields: [], subscribedEvents: [] },
  }),
}))

// Mock @/domains/manifest-loader + plugin-factory for jsdom (cannot resolve fs)
vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({ success: false, errors: [{ domainId: 'test', message: 'mocked in jsdom' }] }),
  formatManifestError: (e: any) => `[${e.phase}] ${e.domainId}: ${e.message}`,
}))

vi.mock('@/domains/plugin-factory', () => ({
  createDomainPlugin: (manifest: any, hooks: any) => ({
    manifest: {
      domainId: manifest?.id ?? 'test',
      version: manifest?.version ?? '1.0.0',
      requiredFields: [] as string[],
      subscribedEvents: [] as string[],
    },
    onValidate: hooks?.onValidate ?? (() => ({ valid: true, errors: [] })),
    onEvent: hooks?.onEvent ?? (() => {}),
    onActionSurfaceRequest: hooks?.onActionSurfaceRequest ?? (() => []),
  }),
}))

// Mock @/domains/timebox/transitions for jsdom
vi.mock('@/domains/timebox/transitions', () => ({
  findTransition: (transitions: any[], fromState: string | null, action: string) =>
    transitions.find((t: any) => {
      const fromMatch = t.from === null ? fromState === null : Array.isArray(t.from) ? t.from.includes(fromState!) : t.from === fromState
      return fromMatch && t.action === action
    }),
  timeboxTransitions: [
    { from: null, to: 'planned', action: 'create', eventType: 'TimeboxCreated' },
    { from: 'planned', to: 'running', action: 'start', eventType: 'TimeboxStarted' },
    { from: 'running', to: 'ended', action: 'end', eventType: 'TimeboxEnded' },
    { from: 'running', to: 'overtime', action: 'overtime', eventType: 'TimeboxOvertime' },
    { from: 'overtime', to: 'ended', action: 'end', eventType: 'TimeboxEnded' },
    { from: 'planned', to: 'cancelled', action: 'cancel', eventType: 'TimeboxCancelled' },
    { from: 'ended', to: 'logged', action: 'log', eventType: 'TimeboxLogged' },
  ],
}))

// 模拟 lifecycle-configs，提供稳定的动态函数避免 jsdom 中 fs 不可用
vi.mock('../lifecycle-configs', () => {
  const lifecycles: Record<string, Array<{ from: string | string[] | null; action: string; to: string; eventType: string }>> = {
    timebox: [
      { from: null, action: 'create', to: 'planned', eventType: 'TimeboxCreated' },
      { from: 'planned', action: 'start', to: 'running', eventType: 'TimeboxStarted' },
      { from: 'running', action: 'end', to: 'ended', eventType: 'TimeboxEnded' },
      { from: 'running', action: 'overtime', to: 'overtime', eventType: 'TimeboxOvertime' },
      { from: 'overtime', action: 'end', to: 'ended', eventType: 'TimeboxEnded' },
      { from: 'planned', action: 'cancel', to: 'cancelled', eventType: 'TimeboxCancelled' },
      { from: 'ended', action: 'log', to: 'logged', eventType: 'TimeboxLogged' },
    ],
    habit: [
      { from: null, action: 'create', to: 'draft', eventType: 'HabitCreated' },
      { from: 'draft', action: 'activate', to: 'active', eventType: 'HabitActivated' },
      { from: 'active', action: 'suspend', to: 'suspended', eventType: 'HabitSuspended' },
      { from: 'suspended', action: 'reactivate', to: 'active', eventType: 'HabitActivated' },
      { from: 'suspended', action: 'archive', to: 'archived', eventType: 'HabitArchived' },
    ],
    objective: [
      { from: null, action: 'create', to: 'draft', eventType: 'ObjectiveCreated' },
      { from: 'draft', action: 'activate', to: 'active', eventType: 'ObjectiveActivated' },
      { from: 'active', action: 'pause', to: 'paused', eventType: 'ObjectivePaused' },
      { from: 'paused', action: 'resume', to: 'active', eventType: 'ObjectiveResumed' },
      { from: 'active', action: 'complete', to: 'completed', eventType: 'ObjectiveCompleted' },
      { from: 'draft', action: 'discard', to: 'discarded', eventType: 'ObjectiveDiscarded' },
      { from: 'completed', action: 'archive', to: 'archived', eventType: 'ObjectiveArchived' },
    ],
    task: [
      { from: null, action: 'create', to: 'todo', eventType: 'TaskCreated' },
      { from: 'todo', action: 'activate', to: 'active', eventType: 'TaskActivated' },
      { from: 'active', action: 'complete', to: 'completed', eventType: 'TaskCompleted' },
      { from: 'active', action: 'archive', to: 'archived', eventType: 'TaskArchived' },
    ],
    thread: [
      { from: null, action: 'create', to: 'active', eventType: 'ThreadCreated' },
      { from: 'active', action: 'pause', to: 'paused', eventType: 'ThreadPaused' },
      { from: 'paused', action: 'resume', to: 'active', eventType: 'ThreadResumed' },
      { from: 'active', action: 'complete', to: 'completed', eventType: 'ThreadCompleted' },
      { from: 'completed', action: 'archive', to: 'archived', eventType: 'ThreadArchived' },
    ],
  }

  const terminalStates: Record<string, string[]> = {
    timebox: ['cancelled', 'logged'],
    habit: ['archived'],
    objective: ['archived', 'discarded'],
    task: ['archived'],
    thread: ['archived'],
  }

  return {
    buildActionMap: () => ({
      createTimebox: 'create', startTimebox: 'start', endTimebox: 'end', overtimeTimebox: 'overtime', cancelTimebox: 'cancel', logTimebox: 'log',
      create_timebox: 'create', start_timebox: 'start', end_timebox: 'end', overtime_timebox: 'overtime', cancel_timebox: 'cancel', log_timebox: 'log',
      createHabit: 'create', activateHabit: 'activate', suspendHabit: 'suspend', archiveHabit: 'archive', reactivateHabit: 'reactivate', logHabit: 'log',
      createObjective: 'create', updateObjective: 'update', activateObjective: 'activate', pauseObjective: 'pause', resumeObjective: 'resume',
      completeObjective: 'complete', discardObjective: 'discard', archiveObjective: 'archive',
      createKeyResult: 'create', updateKeyResult: 'update', updateKeyResultProgress: 'updateProgress', deleteKeyResult: 'deleteDraft',
      create_objective: 'create', create_key_result: 'create',
      createTask: 'create', updateTask: 'update', completeTask: 'complete', archiveTask: 'archive', activateTask: 'activate',
      createThread: 'create', updateThread: 'update', pauseThread: 'pause', resumeThread: 'resume',
      completeThread: 'complete', archiveThread: 'archive',
      create_task: 'create', create_thread: 'create',
    }),
    resolveObjectType: (domainId: string, action: string) => {
      // 线程类操作返回 thread
      if (domainId === 'tasks' && (action.endsWith('Thread') || action.includes('thread'))) return 'thread'
      const map: Record<string, string> = { timebox: 'timebox', habits: 'habit', okrs: 'objective', tasks: 'task' }
      return map[domainId] ?? domainId
    },
    getTransitionFromManifest: (_domainId: string, objectType: string, fromState: string | null, action: string) => {
      const transitions = lifecycles[objectType] ?? []
      return transitions.find(t => {
        const fromMatch = t.from === null ? fromState === null : Array.isArray(t.from) ? t.from.includes(fromState!) : t.from === fromState
        return fromMatch && t.action === action
      })
    },
    getLifecycleFromManifest: (_domainId: string, objectType: string) => {
      const transitions = lifecycles[objectType] ?? []
      if (transitions.length === 0) return undefined
      const states = [...new Set(transitions.flatMap(t => [t.from, t.to]).filter((s): s is string => s !== null))]
      const initialState = transitions.find(t => t.from === null)?.to ?? states[0]
      return {
        states,
        initial_state: initialState,
        transitions: transitions.map(t => ({
          from: t.from,
          action: t.action,
          to: t.to,
          event_type: t.eventType,
        })),
        terminal_states: terminalStates[objectType] ?? [],
      }
    },
  }
})

import { createOrchestrator } from '../index'
import type { GenericRepo } from '@/nexus/core/state-machine'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

/** 创建 mock StructuredIntent */
function createMockIntent(overrides?: Partial<StructuredIntent>): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '专注工作时间',
      startTime: '2026-05-03T09:00:00Z',
      endTime: '2026-05-03T11:00:00Z',
      taskIds: [],
      habitIds: [],
      isRecurring: false,
      tags: [],
    },
    confidence: 0.95,
    resolvedBy: 'ai',
    createdAt: '2026-05-03T08:00:00Z',
    ...overrides,
  }
}

/** 创建 mock RuleEngine */
function createMockRuleEngine(result: 'pass' | 'warning' | 'confirm') {
  return {
    evaluate: vi.fn().mockResolvedValue({
      result,
      warnings: result === 'warning' ? ['时间盒接近晚餐时段'] : [],
      confirmations: result === 'confirm' ? ['该时段已有 3 个时间盒，确认要继续？'] : [],
    }),
  }
}

/** 创建 mock IntentEngine */
function createMockIntentEngine(intent?: StructuredIntent) {
  return {
    parse: vi.fn().mockResolvedValue(intent ?? createMockIntent()),
  }
}

/** 创建 mock TimeboxRepository */
function createMockTimeboxRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findRunning: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

/** 创建 mock SystemEventRepository */
function createMockEventRepo() {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    findByUserInRange: vi.fn().mockResolvedValue([]),
    findUnprocessed: vi.fn().mockResolvedValue([]),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  }
}

/** 创建 timebox 域的 getRepo 工厂 */
function createTimeboxGetRepo(timeboxRepo: ReturnType<typeof createMockTimeboxRepo>) {
  const timeboxGenericRepo: GenericRepo = {
    findById: timeboxRepo.findById,
    save: timeboxRepo.save,
    create: async (fields, userId) => {
      const id = crypto.randomUUID() as USOM_ID
      const now = new Date().toISOString()
      const obj = { id, ...fields, createdAt: now, updatedAt: now }
      await timeboxRepo.save(obj, userId)
      return obj
    },
    updateStatus: async (id, toStatus, userId) => {
      const existing = await timeboxRepo.findById(id, userId)
      if (!existing) throw new Error('时间盒不存在')
      const now = new Date().toISOString()
      const updated = { ...existing, status: toStatus, updatedAt: now }
      await timeboxRepo.save(updated, userId)
      return updated
    },
    updateFields: vi.fn().mockResolvedValue({}),
  }
  return (domainId: string, objectType: string) => {
    if (domainId === 'timebox' && objectType === 'timebox') return timeboxGenericRepo
    throw new Error(`未知的 repo: ${domainId}/${objectType}`)
  }
}

// ─── 测试用例 ─────────────────────────────────────────────────

describe('createOrchestrator', () => {
  const userId = 'user-001' as USOM_ID

  it('完整管道: IntentEngine + RuleEngine 通过 → 成功创建 timebox', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert: 整体成功
    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect(result.error).toBeUndefined()
    expect(result.needsConfirmation).toBeFalsy()

    // Assert: 返回的对象关键字段
    expect((result.object as any)?.title).toBe('专注工作时间')
    expect((result.object as any)?.status).toBe('planned')
    expect((result.object as any)?.startTime).toBe('2026-05-03T09:00:00Z')
    expect((result.object as any)?.endTime).toBe('2026-05-03T11:00:00Z')

    // Assert: IntentEngine 被调用
    expect(intentEngine.parse).toHaveBeenCalledWith(
      '明天早上9点到11点安排专注工作',
      userId,
    )

    // Assert: RuleEngine 被调用（executeIntent 内部调用）
    expect(ruleEngine.evaluate).toHaveBeenCalledTimes(1)
    expect(ruleEngine.evaluate).toHaveBeenCalledWith(mockIntent, expect.any(Object))

    // Assert: 持久化被调用（T-03: userId 由 Orchestrator 注入）
    // 通用 SM: create 内部 save + 状态修正 save = 2 次
    expect(timeboxRepo.save).toHaveBeenCalled()
    expect(eventRepo.append).toHaveBeenCalledWith(expect.any(Object), userId)
  })

  it('RuleEngine 返回 confirm → needsConfirmation=true，不创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    // Act
    const result = await orchestrator.execute('安排时间盒', userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.confirmationMessage).toBe('该时段已有 3 个时间盒，确认要继续？')
    expect(result.object).toBeUndefined()

    // Assert: 没有持久化
    expect(eventRepo.append).not.toHaveBeenCalled()
  })

  it('confirm + confirmed=true → 继续创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    // Act: 传入 confirmed=true
    const result = await orchestrator.execute('安排时间盒', userId, true)

    // Assert: 管道继续执行，成功创建 timebox
    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect(result.needsConfirmation).toBeFalsy()

    // Assert: 持久化被调用
    // 通用 SM: create 内部 save + 状态修正 save = 2 次
    expect(timeboxRepo.save).toHaveBeenCalled()
    expect(eventRepo.append).toHaveBeenCalled()
  })

  it('confirm + confirmed=false → needsConfirmation=true，不创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    // Act: 传入 confirmed=false
    const result = await orchestrator.execute('安排时间盒', userId, false)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.object).toBeUndefined()
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('State Machine 失败 → 返回错误', async () => {
    // Arrange: 创建一个会导致状态机失败的 intent（action 不是 create）
    const badIntent = createMockIntent({ action: 'delete_timebox' })
    const intentEngine = createMockIntentEngine(badIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    // Act
    const result = await orchestrator.execute('开始时间盒', userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('非法状态转换')
    expect(result.object).toBeUndefined()

    // Assert: 没有持久化（state machine 内部在失败前不会 save）
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('IntentEngine 抛出异常 → 错误传播', async () => {
    // Arrange
    const intentEngine = {
      parse: vi.fn().mockRejectedValue(new Error('AI 服务不可用')),
    }
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    // Act & Assert
    await expect(
      orchestrator.execute('安排时间盒', userId),
    ).rejects.toThrow('AI 服务不可用')

    // Assert: 后续步骤未被调用
    expect(ruleEngine.evaluate).not.toHaveBeenCalled()
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('ActionSurfaceEngine 可用时，成功结果包含 actionSurface', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const mockActionSurface: ActionSurface = {
      id: 'surface-001' as USOM_ID,
      userId,
      snapshotId: 'snapshot-001' as USOM_ID,
      generatedAt: '2026-05-03T08:00:00Z',
      guide: [],
      tiles: [
        {
          id: 'action-001' as USOM_ID,
          sourceObjectId: 'tb-001' as USOM_ID,
          sourceObjectType: 'timebox',
          label: '进行中: 专注工作',
          actionType: 'start_timebox',
          category: 'tile',
          weight: 90,
        },
      ],
      cues: [],
    }

    const actionSurfaceEngine = {
      generate: vi.fn().mockResolvedValue(mockActionSurface),
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      actionSurfaceEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.actionSurface).toBeDefined()
    expect(result.actionSurface!.tiles).toHaveLength(1)
    expect(result.actionSurface!.tiles[0].label).toBe('进行中: 专注工作')

    // Assert: actionSurfaceEngine.generate 被正确调用
    expect(actionSurfaceEngine.generate).toHaveBeenCalledTimes(1)
  })

  it('ActionSurfaceEngine 不可用时，结果不含 actionSurface', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
      // 不传 actionSurfaceEngine
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.actionSurface).toBeUndefined()
  })
})

// ─── Habit 意图分发测试 ─────────────────────────────────────────

/** 创建 mock HabitRepository */
function createMockHabitRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue([]),
    findActive: vi.fn().mockResolvedValue([]),
    findByFrequency: vi.fn().mockResolvedValue([]),
    calculateStreak: vi.fn().mockResolvedValue(0),
    calculateLongestStreak: vi.fn().mockResolvedValue(0),
    calculateCompletion7d: vi.fn().mockResolvedValue(0),
    updateMetrics: vi.fn().mockResolvedValue(undefined),
    checkReferences: vi.fn().mockResolvedValue({ habitLogs: 0, templateHabits: 0, timeboxHabits: 0, hasReferences: false }),
    create: vi.fn().mockImplementation(async (data) => ({
      id: 'habit-new-001' as USOM_ID,
      status: 'draft' as const,
      title: data.title,
      description: data.description,
      frequency: { type: data.frequencyType, daysOfWeek: data.daysOfWeek },
      defaultTime: data.defaultTime,
      earliestTime: data.earliestTime,
      latestStartTime: data.latestStartTime,
      defaultDuration: data.defaultDuration,
      minDuration: data.minDuration,
      trackable: data.trackable,
      startDate: data.startDate,
      endDate: data.endDate,
      keyResultId: data.keyResultId,
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: (data.tags ?? []).map((t: string) => t),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    update: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockImplementation(async (id, status) => ({
      id,
      status,
    })),
    updateFields: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

/** 创建 createHabit 类型的 StructuredIntent */
function createHabitIntent(overrides?: Partial<StructuredIntent>): StructuredIntent {
  return {
    id: 'intent-habit-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'habits',
    action: 'createHabit',
    fields: {
      title: '晨跑',
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      frequencyType: 'daily',
      startDate: '2026-05-09',
    },
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: '2026-05-09T08:00:00Z',
    ...overrides,
  }
}

describe('createOrchestrator — Habit 意图分发', () => {
  const userId = 'user-001' as USOM_ID

  it('createHabit 意图 → 调用 HabitRepository.create 并返回 habit 对象', async () => {
    // Arrange
    const habitIntent = createHabitIntent()
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const habitRepo = createMockHabitRepo()
    const eventRepo = createMockEventRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    // Act
    const result = await orchestrator.executeIntent(habitIntent, userId)

    // Assert: 成功
    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect((result.object as any)?.title).toBe('晨跑')
    expect((result.object as any)?.status).toBe('draft')
    expect((result.object as any)?.trackable).toBe(true)

    // Assert: HabitRepository.create 被调用
    // 第 3 参数为可选 tx 句柄；无事务时为 undefined（GenericRepo 透传，T4）
    expect(habitRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '晨跑', defaultTime: '07:00', trackable: true }),
      userId,
      undefined,
    )

    // Assert: SystemEvent 被记录
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HabitCreated' }),
      userId,
    )
  })

  it('createHabit + RuleEngine confirm → needsConfirmation=true', async () => {
    // Arrange
    const habitIntent = createHabitIntent()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const habitRepo = createMockHabitRepo()
    const eventRepo = createMockEventRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    // Act
    const result = await orchestrator.executeIntent(habitIntent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(habitRepo.create).not.toHaveBeenCalled()
    expect(eventRepo.append).not.toHaveBeenCalled()
  })

  it('activateHabit 意图 → 加载习惯并更新状态为 active', async () => {
    // Arrange
    const existingHabit: Habit = {
      id: 'habit-001' as USOM_ID,
      status: 'draft',
      title: '晨跑',
      frequency: { type: 'daily' },
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      startDate: '2026-05-09',
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: [],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(existingHabit)
    habitRepo.updateStatus.mockImplementation(async (id, status) => ({
      ...existingHabit,
      status,
      updatedAt: new Date().toISOString(),
    }))

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const activateIntent: StructuredIntent = {
      id: 'intent-activate-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'activateHabit',
      fields: { habitId: 'habit-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeIntent(activateIntent, userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect((result.object as any)?.status).toBe('active')
    expect(habitRepo.findById).toHaveBeenCalledWith('habit-001', userId, undefined)
    expect(habitRepo.updateStatus).toHaveBeenCalledWith('habit-001', 'active', userId, undefined)
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HabitActivated' }),
      userId,
    )
  })

  it('习惯不存在 → 返回错误', async () => {
    // Arrange
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(null)

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const intent: StructuredIntent = {
      id: 'intent-suspend-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'suspendHabit',
      fields: { habitId: 'habit-nonexist' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeIntent(intent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
    expect(habitRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('非法状态转换 → 返回错误', async () => {
    // Arrange: status=archived 习惯不能 suspend
    const archivedHabit: Habit = {
      id: 'habit-001' as USOM_ID,
      status: 'archived',
      title: '晨跑',
      frequency: { type: 'daily' },
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      startDate: '2026-05-09',
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: [],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(archivedHabit)

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const intent: StructuredIntent = {
      id: 'intent-suspend-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'suspendHabit',
      fields: { habitId: 'habit-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeIntent(intent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('非法')
  })
})

// ─── Apply Template 测试 ─────────────────────────────────────────

/** 创建 mock HabitTemplateRepository */
function createMockTemplateRepo(templates: HabitTemplate[] = []) {
  const templateMap = new Map(templates.map(t => [t.id, t]))

  return {
    findById: vi.fn().mockImplementation(async (id: string) => templateMap.get(id) ?? null),
    findByUserId: vi.fn().mockResolvedValue(templates),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    addHabit: vi.fn().mockResolvedValue(undefined),
    removeHabit: vi.fn().mockResolvedValue(undefined),
  }
}

describe.skip('createOrchestrator — applyTemplate', () => {
  const userId = 'user-001' as USOM_ID

  const mockTemplate: HabitTemplate = {
    id: 'tpl-workday' as USOM_ID,
    name: '工作日',
    status: 'active',
    applicableDays: [1, 2, 3, 4, 5],
    habits: [
      { habitId: 'habit-run' as USOM_ID, sortOrder: 1, timeOverride: '06:30' },
      { habitId: 'habit-lunch' as USOM_ID, sortOrder: 2 },
      { habitId: 'habit-review' as USOM_ID, sortOrder: 3 },
    ],
    createdAt: '2026-05-09T08:00:00Z',
    updatedAt: '2026-05-09T08:00:00Z',
  }

  it('applyTemplate → 为每个习惯生成 draft 时间盒', async () => {
    // Arrange
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'habit-run') return {
        id: 'habit-run' as USOM_ID, status: 'active', title: '晨跑',
        frequency: { type: 'daily' }, defaultTime: '07:00', earliestTime: '06:00',
        latestStartTime: '09:00', defaultDuration: 30, minDuration: 15,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      if (id === 'habit-lunch') return {
        id: 'habit-lunch' as USOM_ID, status: 'active', title: '午餐',
        frequency: { type: 'daily' }, defaultTime: '12:00', earliestTime: '11:30',
        latestStartTime: '13:30', defaultDuration: 60, minDuration: 30,
        trackable: false, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      if (id === 'habit-review') return {
        id: 'habit-review' as USOM_ID, status: 'active', title: '复盘',
        frequency: { type: 'daily' }, defaultTime: '22:00', earliestTime: '21:30',
        latestStartTime: '23:00', defaultDuration: 15, minDuration: 10,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      return null
    })

    const templateRepo = createMockTemplateRepo([mockTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()
    const ruleEngine = createMockRuleEngine('pass')

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: () => { throw new Error('applyTemplate not implemented') },
    })

    // Act: 2026-05-09 是周六(6)，工作日模板 applicableDays=[1,2,3,4,5]
    // 为了测试方便，让模板包含周六
    const saturdayTemplate = { ...mockTemplate, applicableDays: [1, 2, 3, 4, 5, 6] }
    templateRepo.findById.mockResolvedValue(saturdayTemplate)

    // @ts-expect-error — applyTemplate 不存在于当前 OrchestratorDeps 接口
    const result = await orchestrator.applyTemplate('tpl-workday', '2026-05-09', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.generatedTimeboxes).toBeDefined()
    expect(result.generatedTimeboxes!.length).toBe(3)
    expect(result.generatedTimeboxes![0].title).toBe('晨跑')
    expect(result.generatedTimeboxes![0].status).toBe('planned')
    // 晨跑有 timeOverride=06:30，应该使用覆盖值
    expect(result.generatedTimeboxes![0].startTime).toContain('06:30')
    expect(result.generatedTimeboxes![1].title).toBe('午餐')
    expect(result.generatedTimeboxes![2].title).toBe('复盘')

    // 时间盒通过 habitIds 关联对应习惯
    expect(result.generatedTimeboxes![0].habitIds).toContain('habit-run')

    // 持久化被调用
    expect(timeboxRepo.save).toHaveBeenCalledTimes(3)
    expect(eventRepo.append).toHaveBeenCalled()
  })

  it('模板不存在 → 返回错误', async () => {
    const templateRepo = createMockTemplateRepo([])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()
    const habitRepo = createMockHabitRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: () => { throw new Error('applyTemplate not implemented') },
    })

    // @ts-expect-error — applyTemplate 不存在于当前 OrchestratorDeps 接口
    const result = await orchestrator.applyTemplate('tpl-nonexist', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('templateRepo 未配置 → 返回错误', async () => {
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: () => { throw new Error('applyTemplate not implemented') },
    })

    // @ts-expect-error — applyTemplate 不存在于当前 OrchestratorDeps 接口
    const result = await orchestrator.applyTemplate('tpl-001', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('未配置')
  })

  it('同一天重复应用同一模板 → 拒绝', async () => {
    const habitRepo = createMockHabitRepo()
    const templateRepo = createMockTemplateRepo([mockTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    // 模拟当天已有时间盒覆盖了模板中所有习惯
    timeboxRepo.findByDateRange.mockResolvedValue([
      {
        id: 'tb-existing' as USOM_ID,
        status: 'planned',
        title: '晨跑',
        startTime: '2026-05-09T06:30:00Z',
        endTime: '2026-05-09T07:00:00Z',
        taskIds: [],
        habitIds: ['habit-run', 'habit-lunch', 'habit-review'],
        isRecurring: false,
        tags: [],
        createdAt: '2026-05-09T08:00:00Z',
        updatedAt: '2026-05-09T08:00:00Z',
      },
    ])

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: () => { throw new Error('applyTemplate not implemented') },
    })

    // @ts-expect-error — applyTemplate 不存在于当前 OrchestratorDeps 接口
    const result = await orchestrator.applyTemplate('tpl-workday', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('已使用该模板')
  })

  it('applyTemplate 生成的时间盒使用本地时区偏移（+08:00），不是 UTC（Z）', async () => {
    // Bug [010]: 习惯的 HH:MM 是本地时间，拼接时不应使用 Z（UTC）后缀
    // 例如 "07:30" 本地时间拼接 Z 变成 UTC 07:30 = 本地 15:30（UTC+8 错位）
    // 应该拼接 +08:00 使 07:30 保持为本地 07:30
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'habit-run') return {
        id: 'habit-run' as USOM_ID, status: 'active', title: '晨跑',
        frequency: { type: 'daily' }, defaultTime: '07:30', earliestTime: '07:00',
        latestStartTime: '08:00', defaultDuration: 30, minDuration: 15,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      return null
    })

    const singleHabitTemplate: HabitTemplate = {
      id: 'tpl-tz-test' as USOM_ID,
      name: '时区测试',
      status: 'active',
      applicableDays: [1, 2, 3, 4, 5, 6],
      habits: [
        { habitId: 'habit-run' as USOM_ID, sortOrder: 1 },
      ],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const templateRepo = createMockTemplateRepo([singleHabitTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: () => { throw new Error('applyTemplate not implemented') },
    })

    // @ts-expect-error — applyTemplate 不存在于当前 OrchestratorDeps 接口
    const result = await orchestrator.applyTemplate('tpl-tz-test', '2026-05-09', userId)

    expect(result.success).toBe(true)
    expect(result.generatedTimeboxes).toBeDefined()
    expect(result.generatedTimeboxes!.length).toBe(1)

    const tb = result.generatedTimeboxes![0]
    // 时间盒的开始时间必须使用 +08:00 后缀（本地时区），不能是 Z（UTC）
    expect(tb.startTime).toBe('2026-05-09T07:30:00+08:00')
    expect(tb.endTime).toBe('2026-05-09T08:00:00+08:00')
    // 绝对不能是 Z 后缀（会导致 UTC+8 时区错位 8 小时）
    expect(tb.startTime).not.toContain('T07:30:00Z')
    expect(tb.endTime).not.toContain('T08:00:00Z')
  })
})

// ─── Phase 7: executeIntent 统一入口测试 ──────────────────────────
describe('Orchestrator — executeIntent 统一入口', () => {
  const userId = 'user-001' as USOM_ID

  it('不应暴露 executeHabitIntent 方法', () => {
    const eventRepo = createMockEventRepo()
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('pass')

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    expect((orchestrator as Record<string, unknown>).executeHabitIntent).toBeUndefined()
  })

  it('不应暴露 executeOKRIntent 方法', () => {
    const eventRepo = createMockEventRepo()
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('pass')

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    expect((orchestrator as Record<string, unknown>).executeOKRIntent).toBeUndefined()
  })

  it('executeIntent 应暴露为方法', () => {
    const eventRepo = createMockEventRepo()
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('pass')

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    expect(typeof orchestrator.executeIntent).toBe('function')
  })

  it('executeIntent 对 habits 域 createIntent 应调用 onValidate 并返回成功', async () => {
    const eventRepo = createMockEventRepo()
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('pass')
    const habitRepo = createMockHabitRepo()

    const habitGenericRepo: GenericRepo = {
      findById: habitRepo.findById,
      save: habitRepo.save,
      create: habitRepo.create,
      updateStatus: habitRepo.updateStatus,
      updateFields: habitRepo.updateFields,
    }

    const habitIntent: StructuredIntent = {
      id: 'intent-h-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'createHabit',
      fields: {
        title: '每日冥想',
        defaultTime: '07:00',
        earliestTime: '06:00',
        latestStartTime: '08:00',
        defaultDuration: 30,
        minDuration: 10,
        trackable: true,
        frequencyType: 'daily',
        startDate: '2026-05-15',
      },
      confidence: 0.9,
      resolvedBy: 'ai',
      createdAt: '2026-05-15T08:00:00Z',
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'habits' && objectType === 'habit') return habitGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(habitIntent, userId)

    expect(result.success).toBe(true)
    // 应该调用了 rule engine
    expect(ruleEngine.evaluate).toHaveBeenCalled()
  })

  it('executeIntent 对 timebox 域 create_timebox 应成功创建', async () => {
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('pass')

    const timeboxIntent: StructuredIntent = {
      id: 'intent-tb-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'timebox',
      action: 'create_timebox',
      fields: {
        title: '专注工作',
        startTime: '2026-05-15T09:00:00Z',
        duration: 120,
        endTime: '2026-05-15T11:00:00Z',
        taskIds: [],
        habitIds: [],
        isRecurring: false,
        tags: [],
      },
      confidence: 0.95,
      resolvedBy: 'ai',
      createdAt: '2026-05-15T08:00:00Z',
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    const result = await orchestrator.executeIntent(timeboxIntent, userId)

    expect(result.success).toBe(true)
    // 通用 SM 返回 object/objectType，不再设置 timebox 字段
    expect(result.object).toBeDefined()
    expect((result.object as any)!.status).toBe('planned')
    expect(result.objectType).toBe('timebox')
  })
})

// ─── Tasks 意图分发测试 ─────────────────────────────────────────

/** 创建 mock TaskRepository */
function createMockTaskRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findByThread: vi.fn().mockResolvedValue([]),
    findByParent: vi.fn().mockResolvedValue([]),
    findActive: vi.fn().mockResolvedValue([]),
    findByClarity: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input) => ({
      id: 'task-new-001' as USOM_ID,
      status: 'todo',
      title: input.title,
      priority: input.priority ?? 'medium',
      energyRequired: input.energyRequired ?? 'medium',
      estimatedDuration: input.estimatedDuration ?? 60,
      tags: [],
      clarity: 'fuzzy',
      complexity: [],
      captureMode: 'ad_hoc',
      tracking: 'check_in',
      aiTags: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    update: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockImplementation(async (id, status) => ({
      id,
      status,
      title: '测试任务',
      priority: 'medium',
      energyRequired: 'medium',
      estimatedDuration: 60,
      tags: [],
      createdAt: '2026-05-15T08:00:00Z',
      updatedAt: new Date().toISOString(),
    })),
    updateFields: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

/** 创建 mock ThreadRepository */
function createMockThreadRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input) => ({
      id: 'thread-new-001' as USOM_ID,
      status: 'active',
      name: input.name,
      description: input.description,
      priority: input.priority,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    update: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockImplementation(async (id, status) => ({
      id,
      status,
      name: '测试主线',
      tags: [],
      createdAt: '2026-05-15T08:00:00Z',
      updatedAt: new Date().toISOString(),
    })),
    updateFields: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Orchestrator — Tasks 意图分发', () => {
  const userId = 'user-001' as USOM_ID

  it('createTask 意图 → 调用 taskRepo.create 并发布 TaskCreated 事件', async () => {
    const taskIntent: StructuredIntent = {
      id: 'intent-task-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'createTask',
      fields: {
        title: '完成报告',
        priority: 'high',
        energyRequired: 'high',
        estimatedDuration: 120,
        threadId: 'thread-001',
      },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T08:00:00Z',
    }

    const taskRepo = createMockTaskRepo()
    const threadRepo = createMockThreadRepo()
    const ruleEngine = createMockRuleEngine('pass')
    const eventRepo = createMockEventRepo()

    const taskGenericRepo: GenericRepo = {
      findById: taskRepo.findById,
      save: taskRepo.save,
      create: taskRepo.create,
      updateStatus: taskRepo.updateStatus,
      updateFields: taskRepo.updateFields,
    }
    const threadGenericRepo: GenericRepo = {
      findById: threadRepo.findById,
      save: threadRepo.save,
      create: threadRepo.create,
      updateStatus: threadRepo.updateStatus,
      updateFields: threadRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'tasks' && objectType === 'task') return taskGenericRepo
        if (domainId === 'tasks' && objectType === 'thread') return threadGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(taskIntent, userId)

    expect(result.success).toBe(true)
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '完成报告', priority: 'high', threadId: 'thread-001' }),
      userId,
      undefined,
    )
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TaskCreated' }),
      userId,
    )
  })

  it('completeTask 意图 → 更新任务状态为 completed 并发布事件', async () => {
    const existingTask = {
      id: 'task-001' as USOM_ID,
      status: 'active' as const,
      title: '测试任务',
      priority: 'medium' as const,
      energyRequired: 'medium' as const,
      estimatedDuration: 60,
      tags: [],
      createdAt: '2026-05-15T08:00:00Z',
      updatedAt: '2026-05-15T08:00:00Z',
    }
    const taskRepo = createMockTaskRepo()
    taskRepo.findById.mockResolvedValue(existingTask)
    taskRepo.updateStatus.mockResolvedValue({ ...existingTask, status: 'completed', completedAt: '2026-05-15T10:00:00Z' })

    const intent: StructuredIntent = {
      id: 'intent-complete-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'completeTask',
      fields: { taskId: 'task-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T09:00:00Z',
    }

    const taskGenericRepo: GenericRepo = {
      findById: taskRepo.findById,
      save: taskRepo.save,
      create: taskRepo.create,
      updateStatus: taskRepo.updateStatus,
      updateFields: taskRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo: createMockEventRepo(),
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'tasks' && objectType === 'task') return taskGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(intent, userId)

    expect(result.success).toBe(true)
    expect(taskRepo.findById).toHaveBeenCalledWith('task-001', userId, undefined)
    expect(taskRepo.updateStatus).toHaveBeenCalledWith('task-001', 'completed', userId, undefined)
  })

  it('createThread 意图 → 调用 threadRepo.create 并发布 ThreadCreated 事件', async () => {
    const threadIntent: StructuredIntent = {
      id: 'intent-thread-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'createThread',
      fields: {
        name: '产品重构',
        description: 'Q3 核心主线',
        priority: 'high',
      },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T08:00:00Z',
    }

    const taskRepo = createMockTaskRepo()
    const threadRepo = createMockThreadRepo()
    const eventRepo = createMockEventRepo()

    const threadGenericRepo: GenericRepo = {
      findById: threadRepo.findById,
      save: threadRepo.save,
      create: threadRepo.create,
      updateStatus: threadRepo.updateStatus,
      updateFields: threadRepo.updateFields,
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'tasks' && objectType === 'thread') return threadGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(threadIntent, userId)

    expect(result.success).toBe(true)
    expect(threadRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '产品重构', description: 'Q3 核心主线' }),
      userId,
      undefined,
    )
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ThreadCreated' }),
      userId,
    )
  })

  it('archiveThread 意图 → 更新主线状态为 archived', async () => {
    const existingThread = {
      id: 'thread-001' as USOM_ID,
      status: 'completed' as const,
      name: '已完成主线',
      tags: [],
      createdAt: '2026-05-15T08:00:00Z',
      updatedAt: '2026-05-15T08:00:00Z',
    }
    const threadRepo = createMockThreadRepo()
    threadRepo.findById.mockResolvedValue(existingThread)
    threadRepo.updateStatus.mockResolvedValue({ ...existingThread, status: 'archived' })
    const eventRepo = createMockEventRepo()

    const threadGenericRepo: GenericRepo = {
      findById: threadRepo.findById,
      save: threadRepo.save,
      create: threadRepo.create,
      updateStatus: threadRepo.updateStatus,
      updateFields: threadRepo.updateFields,
    }

    const intent: StructuredIntent = {
      id: 'intent-arch-t-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'archiveThread',
      fields: { threadId: 'thread-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T09:00:00Z',
    }

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'tasks' && objectType === 'thread') return threadGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(intent, userId)

    expect(result.success).toBe(true)
    expect(threadRepo.findById).toHaveBeenCalledWith('thread-001', userId, undefined)
    expect(threadRepo.updateStatus).toHaveBeenCalledWith('thread-001', 'archived', userId, undefined)
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ThreadArchived' }),
      userId,
    )
  })

  it('非法任务状态转换 → 返回错误', async () => {
    const draftTask = {
      id: 'task-001' as USOM_ID,
      status: 'draft' as const,
      title: '草稿任务',
      priority: 'medium' as const,
      energyRequired: 'medium' as const,
      estimatedDuration: 60,
      tags: [],
      createdAt: '2026-05-15T08:00:00Z',
      updatedAt: '2026-05-15T08:00:00Z',
    }
    const taskRepo = createMockTaskRepo()
    taskRepo.findById.mockResolvedValue(draftTask)

    const taskGenericRepo: GenericRepo = {
      findById: taskRepo.findById,
      save: taskRepo.save,
      create: taskRepo.create,
      updateStatus: taskRepo.updateStatus,
      updateFields: taskRepo.updateFields,
    }

    const intent: StructuredIntent = {
      id: 'intent-bad-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'completeTask',
      fields: { taskId: 'task-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T09:00:00Z',
    }

    const orchestrator = createOrchestrator({
      eventRepo: createMockEventRepo(),
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'tasks' && objectType === 'task') return taskGenericRepo
        throw new Error(`未知的 repo: ${domainId}/${objectType}`)
      },
    })

    const result = await orchestrator.executeIntent(intent, userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('非法状态转换')
    expect(taskRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('getRepo 抛出异常 → 错误向上传播', async () => {
    const intent: StructuredIntent = {
      id: 'intent-task-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'tasks',
      action: 'createTask',
      fields: { title: '测试' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-15T08:00:00Z',
    }

    const orchestrator = createOrchestrator({
      eventRepo: createMockEventRepo(),
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      getRepo: () => { throw new Error('未知的域') },
    })

    await expect(
      orchestrator.executeIntent(intent, userId),
    ).rejects.toThrow('未知的域')
  })
})
