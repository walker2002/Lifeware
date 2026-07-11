/**
 * @file tasks.test
 * @brief [027-A] createTask/updateTask archetype 持久化回归断言
 *
 * 沿用 [post-ship-codex-catches-cross-task-routing-bug] real-routing verify 精神，
 * 验证 activityArchetypeId 字段能正确透传到持久化层。
 *
 * 采用真实 contract 断言：mock 下游边界（submitDynamicIntent / mutation service），
 * 调用真实的 createTask/updateTask，验证字段确实被路由到下游。
 *
 * 这些测试会在字段路由被破坏时失败（例如 updateTask 开始过滤 null 或 drop 字段），
 * 不测试 submitDynamicIntent/mutation service 内部路由（由其他测试覆盖）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTask, updateTask } from '../tasks'
import { submitDynamicIntent } from '../intent'
import { createTasksMutationService } from '../tasks/mutation-service'
import { TaskRepository } from '@/domains/tasks/repository/task'

// Mock 下游边界
vi.mock('../intent', () => ({
  submitDynamicIntent: vi.fn(),
}))
vi.mock('../tasks/mutation-service', () => ({
  createTasksMutationService: vi.fn(),
}))
// Mock Repository 避免 DB 连接
vi.mock('@/domains/tasks/repository/task', () => ({
  TaskRepository: vi.fn(),
}))

describe('[027-A] Tasks archetype persistence regression (real contract)', () => {
  const mockTask = { id: 't1', title: '测试任务', activityArchetypeId: 'a1' }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock TaskRepository.findById 返回任务，避免 DB 连接
    vi.mocked(TaskRepository).mockImplementation(function() {
      return {
        findById: vi.fn().mockResolvedValue(mockTask),
      } as any
    })
  })

  it('createTask routes activityArchetypeId to submitDynamicIntent', async () => {
    vi.mocked(submitDynamicIntent).mockResolvedValue({
      success: true,
      object: mockTask,
      timeboxes: [],
    } as any)

    await createTask({ title: '测试任务', activityArchetypeId: 'a1' })

    // 验证 submitDynamicIntent 被调用时 activityArchetypeId 在 input 中透传
    expect(submitDynamicIntent).toHaveBeenCalledWith(
      'tasks',
      'createTask',
      expect.objectContaining({ activityArchetypeId: 'a1' }),
    )
    // 若 createTask 开始 drop 该字段，本测试会失败
  })

  it('updateTask routes activityArchetypeId (set) to mutation service', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createTasksMutationService).mockReturnValue(mockService as any)

    await updateTask('t1', { activityArchetypeId: 'a1' })

    // 验证 mutation service.execute 被调用时 steps 包含 activityArchetypeId
    expect(mockService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          { kind: 'field', field: 'activityArchetypeId', value: 'a1' },
        ]),
      }),
      expect.any(String),
    )
    // 若 updateTask 开始过滤该字段，本测试会失败
  })

  it('updateTask routes activityArchetypeId (clear=null) to mutation service', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createTasksMutationService).mockReturnValue(mockService as any)

    await updateTask('t1', { activityArchetypeId: null as any })

    // 验证 null 值被路由到 mutation service（关键：证明 null 能到 repo 写层）
    expect(mockService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          { kind: 'field', field: 'activityArchetypeId', value: null },
        ]),
      }),
      expect.any(String),
    )
    // 若 updateTask 开始过滤 null 或 drop 字段，本测试会失败
    // 这确保对齐 task.ts:320 的 null !== undefined 写入逻辑
  })

  it('updateTask skips undefined (skip semantics)', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createTasksMutationService).mockReturnValue(mockService as any)

    // 当所有字段都是 undefined 时，fieldSteps 为空，updateTask 直接返回不调用 service
    // 我们测试 activityArchetypeId=undefined 混合其他字段时的行为
    await updateTask('t1', { title: '新标题', activityArchetypeId: undefined } as any)

    // 验证 mutation service.execute 被调用，但 steps 中无 activityArchetypeId
    expect(mockService.execute).toHaveBeenCalled()
    const steps = mockService.execute.mock.calls[0][0].steps
    const hasArchetypeStep = steps.some(
      (s: any) => s.field === 'activityArchetypeId',
    )
    expect(hasArchetypeStep).toBe(false)
    // 若 filter 逻辑被破坏（undefined 未过滤），本测试会失败
  })
})
