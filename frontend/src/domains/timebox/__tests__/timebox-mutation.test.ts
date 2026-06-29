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

  it('transitionTimebox start → startTimebox intent（走 submitDynamicIntent）', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'running' } })
    const r = await transitionTimebox('tb-1', 'start')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'startTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })

  it('updateTimebox 字段写 → 直调 mutation service.execute（不经 submitDynamicIntent）', async () => {
    // execute 返回 object，跳过 findById 兜底
    mockExecute.mockResolvedValue({ success: true, object: { id: 'tb-1', title: '写作', status: 'planned' } })
    const r = await updateTimebox('tb-1', { title: '写作', activityArchetypeId: 'arch-1' })
    expect(r.status).toBe('ok')
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
      domainId: 'timebox', objectType: 'timebox', targetId: 'tb-1',
      steps: [
        { kind: 'field', field: 'title', value: '写作' },
        { kind: 'field', field: 'activityArchetypeId', value: 'arch-1' },
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
})
