/**
 * @file cross-domain-event.test
 * @brief [022-A4] OKR 域 onEvent 跨域事件处理测试
 *
 * 验证：当任务/习惯完成后，OKR 的 onEvent 应触发 ContributionRepository 重算进度。
 * - TaskCompleted → findByContributor('task', ...) + recomputeProgress
 * - HabitLogged → findByContributor('habit', ...) + recomputeProgress
 * - 错误隔离（try/catch）
 * - userId 缺失时 no-op
 * - objectId 缺失时 no-op
 * - 没有 contributionRepo 时 no-op（防御）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 直接测试 hooks.ts 的 handleTaskCompleted / handleHabitLogged 入口需要暴露它们。
// 为避免改 hooks.ts 公共 API，本测试通过 createOkrsHooks 工厂间接覆盖。
// 构造最小化 manifest + repos mock。

const mockManifest = {
  id: 'okrs',
  version: '1.0.0',
  name: 'OKR管理',
  description: '目标与关键结果管理',
  intent_triggers: [],
  lifecycle: {},
  field_metadata: {
    okrType: { type: 'enum', label: 'OKR类型', required: false, options: ['visionary', 'committed'] },
  },
  list_actions: [],
  required_fields: {},
  subscribed_events: [
    'ObjectiveCreated', 'ObjectiveActivated', 'ObjectivePaused', 'ObjectiveResumed',
    'ObjectiveCompleted', 'ObjectiveDiscarded', 'ObjectiveArchived',
    'KeyResultUpdated', 'KeyResultCompleted', 'KeyResultProgressUpdated',
    'TaskCompleted', 'HabitLogged',
  ],
}

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({ success: true, manifest: mockManifest }),
}))

import { createOkrsHooks } from '../hooks'
import type { USOMSnapshot, SystemEvent } from '@/usom/types/process'
import type { IContributionRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

function makeSnapshot(userId: string = 'user-1'): USOMSnapshot {
  return {
    userId: userId as USOM_ID,
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: new Date().toISOString() as any,
    currentDate: new Date().toISOString().slice(0, 10) as any,
    dayOfWeek: 1,
    timeOfDay: 'morning' as const,
    energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' },
    sourceSnapshotId: 'snap-id' as any,
  }
}

function makeEvent(type: 'TaskCompleted' | 'HabitLogged', objectId: string): SystemEvent {
  return {
    id: `evt-${type}-${objectId}` as any,
    type,
    occurredAt: new Date().toISOString() as any,
    triggeredBy: 'state_machine',
    payload: { objectId, intentId: 'intent-1', proposalId: 'prop-1', fromStatus: 'active', toStatus: 'completed' },
    snapshotId: 'snap' as any,
  }
}

function makeMockRepo(): IContributionRepository & {
  findByContributor: ReturnType<typeof vi.fn>
  recomputeProgress: ReturnType<typeof vi.fn>
} {
  return {
    findByContributor: vi.fn(),
    recomputeProgress: vi.fn(),
    findByKeyResult: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    removeByContributor: vi.fn(),
  } as any
}

describe('[022-A4] OKR onEvent 跨域事件驱动 KR 进度重算', () => {
  let mockRepo: ReturnType<typeof makeMockRepo>
  let hooks: ReturnType<typeof createOkrsHooks>

  beforeEach(() => {
    mockRepo = makeMockRepo()
    // createOkrsHooks 第一参数是 DomainManifest 类型（manifest-loader/schema 形状）
    // 直接传我们的简化对象（onEvent 路径只用 subscribed_events 和 field_metadata.okrType.options）
    hooks = createOkrsHooks(mockManifest as any, { contributionRepo: mockRepo } as any)
  })

  describe('TaskCompleted', () => {
    it('查找贡献并对每个 KR 触发 recomputeProgress', async () => {
      const taskId = 'task-1'
      const krId1 = 'kr-1'
      const krId2 = 'kr-2'
      mockRepo.findByContributor.mockResolvedValueOnce([
        { keyResultId: krId1, contributorType: 'task', contributorId: taskId },
        { keyResultId: krId2, contributorType: 'task', contributorId: taskId },
      ])
      mockRepo.recomputeProgress.mockResolvedValue({ currentValue: 1, progressRate: 0.5 })

      const result = await hooks.onEvent(makeEvent('TaskCompleted', taskId), makeSnapshot())

      expect(mockRepo.findByContributor).toHaveBeenCalledWith('task', taskId, 'user-1')
      expect(mockRepo.recomputeProgress).toHaveBeenCalledTimes(2)
      expect(mockRepo.recomputeProgress).toHaveBeenCalledWith(krId1, 'user-1')
      expect(mockRepo.recomputeProgress).toHaveBeenCalledWith(krId2, 'user-1')
      // 不污染 ActionSurface
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })

    it('snapshot 无 userId 时 no-op', async () => {
      const emptySnapshot = makeSnapshot() as any
      emptySnapshot.userId = undefined

      const result = await hooks.onEvent(makeEvent('TaskCompleted', 'task-1'), emptySnapshot)

      expect(mockRepo.findByContributor).not.toHaveBeenCalled()
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })

    it('payload 无 objectId 时 no-op', async () => {
      const event = makeEvent('TaskCompleted', '')
      event.payload = { intentId: 'intent-1' }

      const result = await hooks.onEvent(event, makeSnapshot())

      expect(mockRepo.findByContributor).not.toHaveBeenCalled()
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })

    it('findByContributor 抛错被隔离（console.error）', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.findByContributor.mockRejectedValueOnce(new Error('DB error'))

      const result = await hooks.onEvent(makeEvent('TaskCompleted', 'task-1'), makeSnapshot())

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
      consoleSpy.mockRestore()
    })

    it('单个 recomputeProgress 抛错不影响其他 KR', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.findByContributor.mockResolvedValueOnce([
        { keyResultId: 'kr-1', contributorType: 'task', contributorId: 'task-1' },
        { keyResultId: 'kr-2', contributorType: 'task', contributorId: 'task-1' },
        { keyResultId: 'kr-3', contributorType: 'task', contributorId: 'task-1' },
      ])
      mockRepo.recomputeProgress
        .mockResolvedValueOnce({ currentValue: 1, progressRate: 0.3 })  // kr-1 ok
        .mockRejectedValueOnce(new Error('recompute failed'))            // kr-2 fail
        .mockResolvedValueOnce({ currentValue: 2, progressRate: 0.6 })  // kr-3 ok

      const result = await hooks.onEvent(makeEvent('TaskCompleted', 'task-1'), makeSnapshot())

      expect(mockRepo.recomputeProgress).toHaveBeenCalledTimes(3)
      expect(consoleSpy).toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
      consoleSpy.mockRestore()
    })

    it('无贡献时不调 recomputeProgress', async () => {
      mockRepo.findByContributor.mockResolvedValueOnce([])

      const result = await hooks.onEvent(makeEvent('TaskCompleted', 'task-orphan'), makeSnapshot())

      expect(mockRepo.findByContributor).toHaveBeenCalledWith('task', 'task-orphan', 'user-1')
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })

    it('无 contributionRepo 时 no-op', async () => {
      const hooksWithoutRepo = createOkrsHooks(mockManifest as any)
      const result = await hooksWithoutRepo.onEvent(makeEvent('TaskCompleted', 'task-1'), makeSnapshot())
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })
  })

  describe('HabitLogged', () => {
    it('查找 habit 贡献并触发 recomputeProgress', async () => {
      const habitId = 'habit-1'
      mockRepo.findByContributor.mockResolvedValueOnce([
        { keyResultId: 'kr-h1', contributorType: 'habit', contributorId: habitId },
      ])
      mockRepo.recomputeProgress.mockResolvedValueOnce({ currentValue: 3, progressRate: 0.6 })

      const result = await hooks.onEvent(makeEvent('HabitLogged', habitId), makeSnapshot())

      expect(mockRepo.findByContributor).toHaveBeenCalledWith('habit', habitId, 'user-1')
      expect(mockRepo.recomputeProgress).toHaveBeenCalledWith('kr-h1', 'user-1')
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })

    it('snapshot 无 userId 时 no-op', async () => {
      const emptySnapshot = makeSnapshot() as any
      emptySnapshot.userId = undefined
      const result = await hooks.onEvent(makeEvent('HabitLogged', 'habit-1'), emptySnapshot)
      expect(mockRepo.findByContributor).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
    })

    it('payload 无 objectId 时 no-op', async () => {
      const event = makeEvent('HabitLogged', '')
      event.payload = { intentId: 'intent-1' }
      const result = await hooks.onEvent(event, makeSnapshot())
      expect(mockRepo.findByContributor).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
    })

    it('findByContributor 抛错被隔离', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.findByContributor.mockRejectedValueOnce(new Error('connection lost'))
      const result = await hooks.onEvent(makeEvent('HabitLogged', 'habit-1'), makeSnapshot())
      expect(consoleSpy).toHaveBeenCalled()
      expect(result.metrics).toEqual([])
      consoleSpy.mockRestore()
    })

    it('无贡献时不调 recomputeProgress', async () => {
      mockRepo.findByContributor.mockResolvedValueOnce([])
      const result = await hooks.onEvent(makeEvent('HabitLogged', 'habit-orphan'), makeSnapshot())
      expect(mockRepo.findByContributor).toHaveBeenCalledWith('habit', 'habit-orphan', 'user-1')
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      expect(result.metrics).toEqual([])
    })
  })

  describe('兼容性 - 原有 OKR 自域事件', () => {
    it('KeyResultProgressUpdated 不调用 contributionRepo（[022.01] Phase 3：ObjectiveCompleted 已移除）', async () => {
      const event: SystemEvent = {
        id: 'e1' as any,
        type: 'KeyResultProgressUpdated',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { title: '完成关键结果' },
        snapshotId: 'snap' as any,
      }
      const result = await hooks.onEvent(event, makeSnapshot())
      // KR 进度事件不再触发 contribution 重算（Phase 3：updateProgress 内部已直接 recompute）
      expect(mockRepo.findByContributor).not.toHaveBeenCalled()
      expect(mockRepo.recomputeProgress).not.toHaveBeenCalled()
      // KR 进度事件非 review trigger；不产生 suggestions
      expect(result.suggestions).toBeDefined()
    })
  })
})