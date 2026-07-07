/**
 * @file revertTimebox.test
 * @brief revertTimebox server action 测试（[023.12] T4, [023.13] T5 P3）
 *
 * [AM7] executionRecord 守卫：若 timebox.executionRecord != null
 * （即已打卡状态）且调用方未传 opts.clearExecutionRecord=true，
 * revertTimebox 必须 throw「请先清理执行记录再回退」。
 * 传 opts.clearExecutionRecord=true → 复用 repo.updateFields 清空
 * executionRecord 后走 SM revert（[023.13] AM3）。
 * cancelled 状态下 executionRecord 恒为 null，可直接走 SM。
 *
 * 这里只测试 AM7 守卫 + AM3 updateFields 路径（纯函数 + 仓储 mock）。
 * 完整 submitDynamicIntent + SM 集成测试留给 Orchestrator/SM 测试覆盖
 * （避免本文件依赖外部 side effect）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 必须在 import 前 mock 仓储，避免 import-time 副作用
const { mockFindById, mockUpdateFields, mockSubmit } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockUpdateFields: vi.fn(),
  mockSubmit: vi.fn(),
}))
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: class {
    findById = mockFindById
    updateFields = mockUpdateFields
  },
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

describe('revertTimebox（[023.12] T4, [023.13] T5 P3：AM7 + AM3 updateFields 确认清空）', () => {
  beforeEach(() => {
    mockFindById.mockReset()
    mockUpdateFields.mockReset()
    mockSubmit.mockReset()
    // 默认 submit 成功（路径不该到，但兜底）
    mockSubmit.mockResolvedValue({ success: true, object: { id: TB_ID, status: 'planned' } })
    // 默认 updateFields 返回清理后的 timebox（执行后读到 executionRecord=null）
    mockUpdateFields.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'logged',
      executionRecord: null,
    })
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

  // ─── [023.13] T5 P3：AM3 复用 updateFields 确认清空分支 ───────────────

  it('[023.13] P3 logged + executionRecord + opts.clearExecutionRecord=true → 先 updateFields 清空 再走 SM revert', async () => {
    // 已 logged 的 timebox 必有 executionRecord（archive 路径写入）
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'logged',
      executionRecord: { completionRate: 80, notes: 'focused' },
    })
    mockSubmit.mockResolvedValue({
      success: true,
      object: { id: TB_ID, status: 'planned', executionRecord: null },
    })

    const r = await revertTimebox(TB_ID, { clearExecutionRecord: true })

    // AM3：复用通用 updateFields（不引入 clearExecutionRecord repo 抽象）
    expect(mockUpdateFields).toHaveBeenCalledTimes(1)
    expect(mockUpdateFields).toHaveBeenCalledWith(
      TB_ID,
      { executionRecord: null },
      MVP,
    )
    // 清空后才走 SM revert
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith('timebox', 'revertTimebox', { objectId: TB_ID })
    expect(r.status).toBe('ok')
  })

  it('[023.13] P3 logged + executionRecord + opts.clearExecutionRecord=false（显式 false 同未传）→ 抛 AM7', async () => {
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'logged',
      executionRecord: { completionRate: 80 },
    })

    await expect(
      revertTimebox(TB_ID, { clearExecutionRecord: false }),
    ).rejects.toThrow(/请先清理执行记录再回退/)

    // 守卫拒绝后：未调 updateFields、未调 submit
    expect(mockUpdateFields).not.toHaveBeenCalled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('[023.13] P3 cancelled (executionRecord=null) → 直接 revert 不调 updateFields', async () => {
    // cancelled 状态 executionRecord 恒为 null，无需清空
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'cancelled',
      executionRecord: null,
    })
    mockSubmit.mockResolvedValue({
      success: true,
      object: { id: TB_ID, status: 'planned', executionRecord: null },
    })

    const r = await revertTimebox(TB_ID)

    // cancelled 直走 SM，不调 updateFields（避免无谓 UPDATE）
    expect(mockUpdateFields).not.toHaveBeenCalled()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('ok')
  })
})