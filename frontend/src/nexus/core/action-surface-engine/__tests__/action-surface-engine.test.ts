// Action Surface Engine 单元测试

import { describe, it, expect, vi } from 'vitest'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type {
  DomainPlugin,
  USOMSnapshot,
  DerivedSignals,
  ActionCandidate,
  ContextSnapshot,
} from '@/usom/types/process'
import { createActionSurfaceEngine } from '../index'

// ─── 测试工具 ─────────────────────────────────────────────────

/** 创建 mock ContextSnapshot */
function createMockSnapshot(overrides?: Partial<ContextSnapshot>): ContextSnapshot {
  const now = new Date().toISOString() as Timestamp
  return {
    snapshotId: 'snapshot-001' as USOM_ID,
    userId: 'user-001' as USOM_ID,
    generatedAt: now,
    generatedBy: 'state_machine',
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: now,
    currentDate: now.slice(0, 10) as unknown as import('@/usom/types/primitives').DateOnly,
    dayOfWeek: new Date().getDay(),
    timeOfDay: 'morning' as const,
    energyState: {
      inferredLevel: 5,
      calibratedLevel: null,
      activeLevel: 5,
      source: 'system',
    },
    ...overrides,
  }
}

/** 创建 mock DomainPlugin */
function createMockDomainPlugin(
  actions: ActionCandidate[],
  category: 'guide' | 'tile' | 'cue' = 'tile',
  weight: number = 50,
): DomainPlugin {
  return {
    manifest: {
      domainId: 'timebox',
      version: '0.1.0',
      requiredFields: [],
      subscribedEvents: [],
    },
    onValidate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    onEvent: vi.fn().mockReturnValue({ metrics: [], suggestions: [] }),
    onActionSurfaceRequest: vi.fn().mockReturnValue({ actions, category, weight }),
  }
}

// ─── 测试用例 ─────────────────────────────────────────────────

describe('createActionSurfaceEngine', () => {
  it('generate 返回分类后的 ActionSurface', async () => {
    // Arrange: 准备跨分类的候选动作
    const actions: ActionCandidate[] = [
      {
        id: 'action-001' as USOM_ID,
        sourceObjectId: 'tb-001' as USOM_ID,
        sourceObjectType: 'timebox',
        label: '进行中: 专注工作',
        actionType: 'start_timebox',
        category: 'tile',
        weight: 90,
      },
      {
        id: 'action-002' as USOM_ID,
        sourceObjectId: 'tb-002' as USOM_ID,
        sourceObjectType: 'timebox',
        label: '即将开始: 午休',
        actionType: 'start_timebox',
        category: 'cue',
        weight: 80,
      },
      {
        id: 'action-003' as USOM_ID,
        sourceObjectId: 'tb-003' as USOM_ID,
        sourceObjectType: 'timebox',
        label: '建议: 安排休息',
        actionType: 'capture_intent',
        category: 'guide',
        weight: 60,
      },
    ]

    const plugin = createMockDomainPlugin(actions)
    const engine = createActionSurfaceEngine(plugin)
    const snapshot = createMockSnapshot()

    // Act
    const surface = await engine.generate(snapshot)

    // Assert: 候选项已正确分类
    expect(surface.tiles).toHaveLength(1)
    expect(surface.tiles[0].id).toBe('action-001')
    expect(surface.tiles[0].category).toBe('tile')

    expect(surface.cues).toHaveLength(1)
    expect(surface.cues[0].id).toBe('action-002')
    expect(surface.cues[0].category).toBe('cue')

    expect(surface.guide).toHaveLength(1)
    expect(surface.guide[0].id).toBe('action-003')
    expect(surface.guide[0].category).toBe('guide')

    // Assert: 元数据正确
    expect(surface.userId).toBe('user-001')
    expect(surface.snapshotId).toBe('snapshot-001')
    expect(surface.generatedAt).toBeDefined()
    expect(surface.id).toBeDefined()
  })

  it('空候选列表返回空 ActionSurface', async () => {
    // Arrange
    const plugin = createMockDomainPlugin([], 'cue', 0)
    const engine = createActionSurfaceEngine(plugin)
    const snapshot = createMockSnapshot()

    // Act
    const surface = await engine.generate(snapshot)

    // Assert
    expect(surface.guide).toHaveLength(0)
    expect(surface.tiles).toHaveLength(0)
    expect(surface.cues).toHaveLength(0)
  })

  it('使用 userId 参数覆盖 snapshot 中的 userId', async () => {
    // Arrange
    const plugin = createMockDomainPlugin([])
    const engine = createActionSurfaceEngine(plugin)
    const snapshot = createMockSnapshot()
    const overrideUserId = 'user-override' as USOM_ID

    // Act
    const surface = await engine.generate(snapshot, undefined, overrideUserId)

    // Assert
    expect(surface.userId).toBe('user-override')
  })

  it('调用 domainPlugin.onActionSurfaceRequest 传入正确参数', async () => {
    // Arrange
    const onActionSurfaceRequest = vi.fn().mockReturnValue({ actions: [], category: 'cue' as const, weight: 0 })
    const plugin: DomainPlugin = {
      manifest: {
        domainId: 'timebox',
        version: '0.1.0',
        requiredFields: [],
        subscribedEvents: [],
      },
      onValidate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      onEvent: vi.fn().mockReturnValue({ metrics: [], suggestions: [] }),
      onActionSurfaceRequest,
    }
    const engine = createActionSurfaceEngine(plugin)
    const snapshot = createMockSnapshot()

    // Act
    await engine.generate(snapshot)

    // Assert: onActionSurfaceRequest 被调用，且传入 snapshot 和 signals
    expect(onActionSurfaceRequest).toHaveBeenCalledTimes(1)
    const [snapshotArg, signalsArg] = onActionSurfaceRequest.mock.calls[0]
    expect(snapshotArg).toBeDefined()
    expect(signalsArg).toBeDefined()
    // signals 应该是 DerivedSignals 结构
    expect(signalsArg.userId).toBe('user-001')
    expect(signalsArg.activeTaskCount).toBe(0)
    expect(signalsArg.isOvercommitted).toBe(false)
  })

  it('同一类别有多个候选项时全部保留', async () => {
    // Arrange
    const actions: ActionCandidate[] = [
      {
        id: 'action-001' as USOM_ID,
        sourceObjectId: 'tb-001' as USOM_ID,
        sourceObjectType: 'timebox',
        label: '进行中: 工作A',
        actionType: 'start_timebox',
        category: 'tile',
        weight: 90,
      },
      {
        id: 'action-002' as USOM_ID,
        sourceObjectId: 'tb-002' as USOM_ID,
        sourceObjectType: 'timebox',
        label: '进行中: 工作B',
        actionType: 'start_timebox',
        category: 'tile',
        weight: 85,
      },
    ]

    const plugin = createMockDomainPlugin(actions)
    const engine = createActionSurfaceEngine(plugin)
    const snapshot = createMockSnapshot()

    // Act
    const surface = await engine.generate(snapshot)

    // Assert: 两个 tile
    expect(surface.tiles).toHaveLength(2)
    expect(surface.guide).toHaveLength(0)
    expect(surface.cues).toHaveLength(0)
  })
})
