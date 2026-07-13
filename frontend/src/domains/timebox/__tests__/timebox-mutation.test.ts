import { describe, it, expect, vi, beforeEach } from 'vitest'

// 状态转换路径依赖
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))

// TimeboxRepository：必须可 new（class 风格 mock）。factory 内闭包，
// 避免 vitest hoist 后顶层变量未初始化。
const mockFindById = vi.fn()
vi.mock('@/domains/timebox/repository', () => {
  return {
    TimeboxRepository: class MockTimeboxRepository {
      findById = mockFindById
    },
  }
})

// ActivityArchetypeRepository：避免真连 PG（archetype id 形如 'arch-1' 非合法 UUID）
const mockArchetypeFindById = vi.fn()
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => {
  return {
    ActivityArchetypeRepository: class MockActivityArchetypeRepository {
      findById = mockArchetypeFindById
    },
  }
})

// 字段写路径依赖（updateTimebox 直调）
const mockExecute = vi.fn()
vi.mock('@/app/actions/timebox/mutation-service', () => ({
  createTimeboxMutationService: () => ({ execute: mockExecute }),
}))

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimebox, transitionTimebox, updateTimebox, deleteTimebox } from '@/app/actions/timebox'

describe('[023] A2 timebox server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // archetype 默认视为合法，让 owner-check 通过
    mockArchetypeFindById.mockResolvedValue({ id: 'arch-1' })
  })

  it('createTimebox 成功 → status ok（走 submitDynamicIntent）', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'planned' } })
    const r = await createTimebox({ title: '写作', startTime: '2026-06-29T09:00:00Z', endTime: '2026-06-29T10:00:00Z', activityArchetypeId: 'arch-1' })
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'createTimebox', expect.objectContaining({ activityArchetypeId: 'arch-1' }), undefined)
  })

  it('createTimebox needsConfirmation → status needs_confirm', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: false, needsConfirmation: true, confirmationMessage: '时间重叠' })
    const r = await createTimebox({ title: 'x', startTime: '2026-06-29T09:00:00Z', endTime: '2026-06-29T10:00:00Z' })
    expect(r.status).toBe('needs_confirm')
    expect((r as any).message).toBe('时间重叠')
  })

  it('transitionTimebox log → logTimebox intent（走 submitDynamicIntent）', async () => {
    // [TD-017] 2026-07-12: 'start' 已从 manifest lifecycle 删(2ddd223 codex review);
    //   action union 收窄到 'cancel' | 'log'。本测试改测 'log' 路径以验证
    //   ACTION_TO_INTENT dispatch 仍是活的 (manifest logTimebox intent_trigger 已 ship)。
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'logged' } })
    const r = await transitionTimebox('tb-1', 'log')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'logTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })

  it('updateTimebox 字段写 → 直调 mutation service.execute（不经 submitDynamicIntent）', async () => {
    // [TD-003] T4: updateTimebox 入口先读 current occVersion（OCC 透传前置）。
    // 这里 stub 一个 occVersion=1 的 row，避免 not found 报错。
    mockFindById.mockResolvedValue({ id: 'tb-1', userId: '00000000-0000-0000-0000-000000000001', occVersion: 1 } as any)
    // execute 返回 object，跳过 findById 兜底
    mockExecute.mockResolvedValue({ success: true, object: { id: 'tb-1', title: '写作', status: 'planned' } })
    const r = await updateTimebox('tb-1', { title: '写作', activityArchetypeId: 'arch-1' })
    expect(r.status).toBe('ok')
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
      domainId: 'timebox', objectType: 'timebox', targetId: 'tb-1',
      steps: [
        { kind: 'field', field: 'title', value: '写作', expectedOccVersion: 1 },
        { kind: 'field', field: 'activityArchetypeId', value: 'arch-1', expectedOccVersion: 1 },
      ],
    }), expect.anything())
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('updateTimebox 仅 undefined 字段 → findById 读回，不写', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', title: 'x', status: 'planned' })
    const r = await updateTimebox('tb-1', { title: undefined })
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockFindById).toHaveBeenCalledWith('tb-1', expect.anything())
    expect(r.status).toBe('ok')
  })

  it('deleteTimebox 对 logged 状态 → 抛错守卫（OV#8，不派发 cancel）', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', status: 'logged' })
    await expect(deleteTimebox('tb-1')).rejects.toThrow(/不可删除/)
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('deleteTimebox 对 planned 状态 → 派发 cancelTimebox', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', status: 'planned' })
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'cancelled' } })
    const r = await deleteTimebox('tb-1')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'cancelTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })

  // [026.02.4] TD-028 Site 3: 'running' 不持久化,error msg 不应再有 '进行中' 分支。
  // 任何非 planned 状态(ending / cancelled / logged)均统一走「已结束」。
  it("[026.02.4] TD-028: deleteTimebox error msg 不含「进行中」分支", async () => {
    mockFindById.mockResolvedValue({ id: 'tb-2', status: 'cancelled' })
    await expect(deleteTimebox('tb-2')).rejects.toThrow(/已结束/)
    await expect(deleteTimebox('tb-2')).rejects.not.toThrow(/进行中/)
  })
})
