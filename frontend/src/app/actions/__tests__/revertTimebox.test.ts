/**
 * @file revertTimebox.test
 * @brief revertTimebox server action 测试（[023.12] T4, AM7）
 *
 * [AM7] executionRecord 守卫：若 timebox.executionRecord != null
 * （即已打卡状态），revertTimebox 必须 throw「请先清理执行记录再回退」。
 * cancelled 状态下 executionRecord 恒为 null，可直接走 SM。
 *
 * 这里只测试 AM7 守卫（纯函数 + 仓储 mock）。完整 submitDynamicIntent +
 * SM 集成测试留给 Orchestrator/SM 测试覆盖（避免本文件依赖外部 side effect）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 必须在 import 前 mock 仓储，避免 import-time 副作用
const { mockFindById, mockSubmit } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockSubmit: vi.fn(),
}))
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: class { findById = mockFindById },
  AppointmentRepository: class {},
}))
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: (...args: unknown[]) => mockSubmit(...args),
}))

// import-after-mock
// eslint-disable-next-line import/first
import { revertTimebox } from '../timebox'

const MVP = '00000000-0000-0000-0000-000000000001'
const TB_ID = 'tb-123'

describe('revertTimebox（[023.12] T4, [AM7] executionRecord 守卫）', () => {
  beforeEach(() => {
    mockFindById.mockReset()
    mockSubmit.mockReset()
    // 默认 submit 成功（路径不该到，但兜底）
    mockSubmit.mockResolvedValue({ success: true, object: { id: TB_ID, status: 'planned' } })
  })

  it('executionRecord != null → throw「请先清理执行记录再回退」（AM7 守卫生效）', async () => {
    // 已 logged 的 timebox 必有 executionRecord（archive 路径写入）
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'logged',
      executionRecord: { completionRate: 80, notes: 'focused' },
    })

    await expect(revertTimebox(TB_ID)).rejects.toThrow(/请先清理执行记录再回退/)

    // 关键断言：守卫拒绝后不应调 submitDynamicIntent
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('executionRecord == null + status=cancelled → 通过守卫并走 SM revert', async () => {
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'cancelled',
      executionRecord: null,
    })
    mockSubmit.mockResolvedValue({
      success: true,
      object: { id: TB_ID, status: 'planned', executionRecord: null },
    })

    const r = await revertTimebox(TB_ID)

    expect(r.status).toBe('ok')
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith('timebox', 'revertTimebox', { objectId: TB_ID })
  })

  it('executionRecord == null + status=planned（边缘：已是 planned）→ 通过守卫（守卫不判 status）', async () => {
    // 注：实际生产路径下，UI 不应允许对 planned 调 revert。但 AM7 守卫只看
    // executionRecord，不限制 from 状态——SM 层兜底拒绝（同态）。这里只测
    // 守卫本身让请求通过，SM 是否拒绝由 SM 测试覆盖。
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'planned',
      executionRecord: null,
    })

    await revertTimebox(TB_ID)
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('timebox 不存在（findById 返回 null）→ throw', async () => {
    mockFindById.mockResolvedValue(null)
    await expect(revertTimebox(TB_ID)).rejects.toThrow(/not found/i)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('ownership 隔离：findById 第二个参数必传 MVP_USER_ID（多租户 T-02）', async () => {
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'cancelled',
      executionRecord: null,
    })
    await revertTimebox(TB_ID)
    expect(mockFindById).toHaveBeenCalledWith(TB_ID, MVP)
  })
})