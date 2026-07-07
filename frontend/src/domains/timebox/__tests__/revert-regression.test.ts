/**
 * @file revert-regression 测试
 * @brief [023.13] §2 — TD-019 回退 bug 集成回归：logged/cancelled → revert → planned
 *
 * 跨模块集成回归（与 [023.13] T5 `revertTimebox.test.ts` 8 个单测互补）：
 * - T5 覆盖 AM7 守卫 + AM3 updateFields 路径（纯函数 + 仓储 mock，单模块）
 * - 本文件覆盖：服务端 action 链（revertTimebox → submitDynamicIntent → SM）跨模块
 *   协调 + STATUS_TRANSITION_ACTIONS 派生生效（TD-019 A1/A2 落地验证）
 *
 * [023.13] T5 已用 AM3 实现：`revertTimebox` 调 `repo.updateFields(id, {executionRecord:
 * null}, userId)` 而非 `clearExecutionRecord`（消除冗余抽象，复用同通道）。故本测试
 * mock `updateFields`（而非原 brief 写的 `clearExecutionRecord`），断言调 `updateFields`。
 *
 * TD-019 关闭证据：
 * - 场景 1：cancelled (executionRecord=null) → revert 直接走 SM
 * - 场景 2：logged + executionRecord + clearExecutionRecord=true → updateFields 清空后走 SM
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 必须在 import 前 mock，避免 import-time 副作用
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
import { revertTimebox } from '@/app/actions/timebox'

const MVP = '00000000-0000-0000-0000-000000000001'
const TB_ID = 'tb-1'

describe('TD-019 回退回归（[023.13] §2 — 集成层：A1 派生 + A3 updateFields 落地验证）', () => {
  beforeEach(() => {
    mockFindById.mockReset()
    mockUpdateFields.mockReset()
    mockSubmit.mockReset()
    // 默认 submit 成功（路径不该到，但兜底）
    mockSubmit.mockResolvedValue({ success: true, object: { id: TB_ID, status: 'planned' } })
  })

  it('cancelled (executionRecord=null) revert 成功 → planned', async () => {
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'cancelled', executionRecord: null,
    })

    const r = await revertTimebox(TB_ID)

    // cancelled 无 executionRecord：守卫放行，不调 updateFields，直走 SM
    expect(mockUpdateFields).not.toHaveBeenCalled()
    // TD-019 A1：revertTimebox 派生自 manifest.lifecycle，submit 不再落字段必含校验
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith('timebox', 'revertTimebox', { objectId: TB_ID })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.timebox.status).toBe('planned')
    }
  })

  it('logged + executionRecord + opts.clearExecutionRecord=true → updateFields 清空后 revert 成功', async () => {
    // 已 logged 的 timebox 必有 executionRecord（archive 路径写入）
    mockFindById.mockResolvedValue({
      id: TB_ID, userId: MVP, status: 'logged',
      executionRecord: { mode: 'simple', completionRate: 80 },
    })
    mockSubmit.mockResolvedValue({
      success: true,
      object: { id: TB_ID, status: 'planned', executionRecord: null },
    })

    const r = await revertTimebox(TB_ID, { clearExecutionRecord: true })

    // [AM3] AM3 复用 updateFields 而非 clearExecutionRecord（消除冗余抽象）
    expect(mockUpdateFields).toHaveBeenCalledTimes(1)
    expect(mockUpdateFields).toHaveBeenCalledWith(
      TB_ID,
      { executionRecord: null },
      MVP,
    )
    // 清空后才走 SM revert（顺序：updateFields → submit）
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith('timebox', 'revertTimebox', { objectId: TB_ID })
    expect(r.status).toBe('ok')
  })
})