/**
 * @file habits.test
 * @brief [027-A] updateHabit archetype 持久化回归断言
 *
 * 沿用 [post-ship-codex-catches-cross-task-routing-bug] real-routing verify 精神，
 * 验证 activityArchetypeId 字段能正确透传到持久化层。
 *
 * 采用真实 contract 断言：mock mutation service，调用真实的 updateHabit，
 * 验证字段确实被路由到下游。
 *
 * 这些测试会在字段路由被破坏时失败（例如 updateHabit 开始过滤 null 或 drop 字段），
 * 不测试 mutation service 内部路由（由其他测试覆盖）。
 *
 * 注意：submitHabitIntent 因在同一文件 intent.ts 内，无法用 vi.mock 同模块内部调用，
 * 故仅测试 updateHabit（已覆盖关键路由逻辑：set/clear/skip 三态）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHabitsMutationService } from '../habits/mutation-service'
import { HabitRepository } from '@/domains/habits/repository/habit'

// Mock mutation service 下游边界
vi.mock('../habits/mutation-service', () => ({
  createHabitsMutationService: vi.fn(),
}))
// Mock Repository 避免 DB 连接
vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: vi.fn(),
}))

describe('[027-A] Habits archetype persistence regression (real contract)', () => {
  const mockHabit = { id: 'h1', title: '测试习惯', activityArchetypeId: 'a1' }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock HabitRepository.findById 返回习惯，避免 DB 连接
    vi.mocked(HabitRepository).mockImplementation(function() {
      return {
        findById: vi.fn().mockResolvedValue(mockHabit),
      } as any
    })
  })

  it('updateHabit routes activityArchetypeId (set) to mutation service', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createHabitsMutationService).mockReturnValue(mockService as any)

    // 动态 import 真实的 updateHabit 函数（从 intent.ts）
    const { updateHabit } = await import('../intent')
    await updateHabit('h1', { activityArchetypeId: 'a1' })

    // 验证 mutation service.execute 被调用时 steps 包含 activityArchetypeId
    expect(mockService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          { kind: 'field', field: 'activityArchetypeId', value: 'a1' },
        ]),
      }),
      expect.any(String),
    )
    // 若 updateHabit 开始过滤该字段，本测试会失败
  })

  it('updateHabit routes activityArchetypeId (clear=null) to mutation service', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createHabitsMutationService).mockReturnValue(mockService as any)

    // 动态 import 真实的 updateHabit 函数
    const { updateHabit } = await import('../intent')
    await updateHabit('h1', { activityArchetypeId: null as any })

    // 验证 null 值被路由到 mutation service（关键：证明 null 能到 repo 写层）
    expect(mockService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          { kind: 'field', field: 'activityArchetypeId', value: null },
        ]),
      }),
      expect.any(String),
    )
    // 若 updateHabit 开始过滤 null 或 drop 字段，本测试会失败
    // 这确保对齐 updateHabit 中 null !== undefined 写入逻辑
  })

  it('updateHabit skips undefined (skip semantics)', async () => {
    const mockService = {
      execute: vi.fn().mockResolvedValue({
        success: true,
      }),
    }
    vi.mocked(createHabitsMutationService).mockReturnValue(mockService as any)

    // 动态 import 真实的 updateHabit 函数
    const { updateHabit } = await import('../intent')
    // 当所有字段都是 undefined 时，fieldSteps 为空，updateHabit 直接返回不调用 service
    // 我们测试 activityArchetypeId=undefined 混合其他字段时的行为
    await updateHabit('h1', { title: '新标题', activityArchetypeId: undefined } as any)

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
