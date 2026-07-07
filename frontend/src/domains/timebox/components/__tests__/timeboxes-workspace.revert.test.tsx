/**
 * @file timeboxes-workspace.revert.test
 * @brief [023.10] T1 — workspace handleAiConfirm revert 路径必须真调 submitCnuiSurface 而非 toast placeholder
 *          [023.13] T7 — workspace handleAction('revert') 走 AlertDialog 确认 + revertTimebox(id, {clearExecutionRecord:true})
 *
 * 关联 [023.08] P0 (4d6e7ca) 同源路由错配防御 — accept 已修，revert 仍 placeholder。
 *
 * 单独成文件（避免 Codex #4 mock shadow：timeboxes-workspace.ai-submit.test.tsx
 * 已含 `vi.mock('@/app/actions/intent', ...)` 全覆盖 mock，与本文件 vi.mock('@/app/actions/intent')
 * 共享 factory path 时 hoist 阶段互相覆盖，导致后面 import 的模块读到先注册的 mock）。
 *
 * 实现策略：通过 accept 路径触发 setRevertableBatches 注入一条测试数据，
 * 然后点 revert 按钮 → 断言 submitCnuiSurface 被以正确参数调用 + 不显 placeholder toast。
 *
 * [023.13] T7 扩展：第二组 describe 验证 handleAction('revert') 的回退确认弹窗。
 * - logged+executionRecord 卡点回退 → 触发 AlertDialog「确认回退」 → 点确认 →
 *   revertTimebox(id, {clearExecutionRecord:true}) 被调
 * - cancelled 卡点回退 → 直接调 revertTimebox(id) 不开弹窗
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const submitCnuiSurfaceMock = vi.fn()
const submitDynamicIntentMock = vi.fn()
const transitionTimeboxMock = vi.fn()
const revertTimeboxMock = vi.fn()

vi.mock('@/app/actions/intent', () => ({
  submitCnuiSurface: (...a: unknown[]) => submitCnuiSurfaceMock(...a),
  submitDynamicIntent: (...a: unknown[]) => submitDynamicIntentMock(...a),
  getTimeboxesByRange: vi.fn().mockResolvedValue([]),
  getAppointmentsByRange: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn(),
  transitionTimebox: (...a: unknown[]) => transitionTimeboxMock(...a),
  revertTimebox: (...a: unknown[]) => revertTimeboxMock(...a),
  deleteTimebox: vi.fn(),
}))

const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/timeboxes',
}))

import { TimeboxesWorkspace } from '../timeboxes-workspace'
import type { TimeboxSummary } from '@/usom/types/summaries'

/** [023.13] T7 辅助：构造带 executionRecord 的 logged 卡样本 */
function makeLoggedSummary(id: string): TimeboxSummary {
  return {
    id,
    title: `测试 logged-${id}`,
    status: 'logged',
    startTime: '2026-07-15T09:00:00.000Z',
    endTime: '2026-07-15T10:00:00.000Z',
    taskIds: [],
    habitIds: [],
    executionRecord: {
      mode: 'simple',
      completionStatus: 'completed',
      actualDuration: 60,
      plannedDuration: 60,
      deviationMinutes: 0,
      sourceType: 'timebox',
      loggedAt: '2026-07-15T10:00:00.000Z',
    },
  }
}

/** [023.13] T7 辅助：构造 cancelled 卡样本（无 executionRecord） */
function makeCancelledSummary(id: string): TimeboxSummary {
  return {
    id,
    title: `测试 cancelled-${id}`,
    status: 'cancelled',
    startTime: '2026-07-15T11:00:00.000Z',
    endTime: '2026-07-15T12:00:00.000Z',
    taskIds: [],
    habitIds: [],
  }
}

/**
 * [023.10] T1 — workspace handleAiConfirm revert 路径必须真调 submitCnuiSurface 而非 toast placeholder。
 *
 * 关联 [023.08] P0 (4d6e7ca) 同源路由错配 — accept 已修，revert 仍 placeholder。
 */
describe('[023.10] T1 — workspace handleAiConfirm revert 真 wire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 accept mock：第一次调用返回 success+batchId，让 workspace 把 revertable batch 塞进 state
    submitCnuiSurfaceMock.mockResolvedValue({ success: true, batchId: 'batch-test-001' })
  })

  it('点 revert 后 submitCnuiSurface 被以 (timebox, revertSmartTimeboxes, { batchId }) 调用', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)

    // 1) 打开 AI 智能推荐 panel
    await user.click(screen.getByTestId('ai-orchestrate-button'))
    await waitFor(() => expect(screen.getByTestId('ai-panel-overlay')).toBeInTheDocument())

    // 2) 触发 accept 路径，让 workspace 把 revertable batch 写入 state（panel 会随之关闭）
    await user.click(screen.getByTestId('accept-all-btn'))

    // 3) 重新打开 panel — 此时 revertableBatches 已非空，revert 按钮可见
    await waitFor(() => expect(screen.queryByTestId('ai-panel-overlay')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('ai-orchestrate-button'))
    await waitFor(() => expect(screen.getByTestId('revert-batch-btn')).toBeInTheDocument())

    // 4) 现在 revert 按钮可见 → 触发 revert
    await user.click(screen.getByTestId('revert-batch-btn'))

    // 5) 断言：submitCnuiSurface 调用列表里至少有一次以 (timebox, revertSmartTimeboxes, { batchId }) 调用
    await waitFor(() => {
      const revertCall = submitCnuiSurfaceMock.mock.calls.find(
        (call) => (call[2] as string) === 'revertSmartTimeboxes',
      )
      expect(revertCall).toBeDefined()
      if (revertCall) {
        const [, domainId, action, fields] = revertCall as [string, string, string, Record<string, unknown>]
        expect(domainId).toBe('timebox')
        expect(action).toBe('revertSmartTimeboxes')
        expect(fields).toEqual(expect.objectContaining({ batchId: expect.any(String) }))
      }
    })
  })

  it('revert 后 UI 不再显 placeholder toast "撤销状态已重置"', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)

    await user.click(screen.getByTestId('ai-orchestrate-button'))
    await waitFor(() => expect(screen.getByTestId('ai-panel-overlay')).toBeInTheDocument())
    await user.click(screen.getByTestId('accept-all-btn'))
    await waitFor(() => expect(screen.queryByTestId('ai-panel-overlay')).not.toBeInTheDocument())

    await user.click(screen.getByTestId('ai-orchestrate-button'))
    await waitFor(() => expect(screen.getByTestId('revert-batch-btn')).toBeInTheDocument())

    toastSuccessMock.mockClear() // 清掉 accept 路径可能的 success 调用计数
    await user.click(screen.getByTestId('revert-batch-btn'))

    // TDD 守门：placeholder message 不应再被 toast.success 触发
    await waitFor(() => {
      const placeholderCall = toastSuccessMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && /撤销状态已重置/.test(call[0] as string),
      )
      expect(placeholderCall).toBeUndefined()
    })
  })
})

/**
 * [023.13] T7 — workspace handleAction('revert') 走 AlertDialog 二次确认。
 *
 * 关联 [023.13] T5：revertTimebox(id, opts?: { clearExecutionRecord?: boolean })
 * - logged + executionRecord → UI 弹 AlertDialog「确认回退」→ 点确认 →
 *   revertTimebox(id, { clearExecutionRecord: true }) 被调
 * - cancelled（无 executionRecord）→ 直接 revertTimebox(id) 不开弹窗
 *
 * 测试策略：mock getTimeboxesByRange 返回带 executionRecord 的 logged 卡 / cancelled 卡
 * → 等 DayView 渲染出「回退」按钮 → 点 → 断言：
 *   - logged case: 弹窗出现，点确认后 revertTimebox 收到 {clearExecutionRecord:true}
 *   - cancelled case: 弹窗不出现，revertTimebox 立即被调用
 */
describe('[023.13] T7 — workspace handleAction("revert") 走 AlertDialog 二次确认', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 关键：本组测试依赖 DayView 渲染出「回退」按钮 — 必须 mock getTimeboxesByRange 返回样本卡
    // 直接通过 mockResolvedValueOnce + mockResolvedValue 反复轮换；这里简化：在 beforeEach 重设默认
    revertTimeboxMock.mockResolvedValue({ status: 'ok', timebox: undefined })
    submitDynamicIntentMock.mockResolvedValue({ success: true })
  })

  it('logged+executionRecord 卡点回退 → 触发确认弹窗 → 点确认 → revertTimebox(id, {clearExecutionRecord:true})', async () => {
    const user = userEvent.setup()
    const loggedSample = makeLoggedSummary('tb-logged-001')
    // 第一次调用（initial load）返回样本；后续 loadRange 调用也用相同返回
    const { getTimeboxesByRange } = await import('@/app/actions/intent')
    vi.mocked(getTimeboxesByRange).mockResolvedValue([loggedSample])

    render(<TimeboxesWorkspace />)

    // 等 DayView 渲染出 logged 卡的「回退」按钮
    const revertBtn = await screen.findByRole('button', { name: /回退/ })
    await user.click(revertBtn)

    // 弹窗出现：「确认回退」标题 + 「清除执行记录...」描述（用 heading role 避免与按钮文字重名）
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '确认回退' })).toBeInTheDocument()
    })
    expect(screen.getByText(/清除该时间盒的执行记录/)).toBeInTheDocument()

    // 此时 revertTimebox 还没被调
    expect(revertTimeboxMock).not.toHaveBeenCalled()

    // 点确认
    const confirmBtn = screen.getByTestId('revert-confirm-btn')
    await user.click(confirmBtn)

    // 断言：revertTimebox(id, { clearExecutionRecord: true }) 被调
    await waitFor(() => {
      expect(revertTimeboxMock).toHaveBeenCalledWith(
        'tb-logged-001',
        expect.objectContaining({ clearExecutionRecord: true }),
      )
    })

    // 弹窗关闭
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '确认回退' })).not.toBeInTheDocument()
    })
  })

  it('logged 卡点回退 → 取消弹窗 → revertTimebox 不被调', async () => {
    const user = userEvent.setup()
    const loggedSample = makeLoggedSummary('tb-logged-002')
    const { getTimeboxesByRange } = await import('@/app/actions/intent')
    vi.mocked(getTimeboxesByRange).mockResolvedValue([loggedSample])

    render(<TimeboxesWorkspace />)

    const revertBtn = await screen.findByRole('button', { name: /回退/ })
    await user.click(revertBtn)

    await waitFor(() => expect(screen.getByRole('heading', { name: '确认回退' })).toBeInTheDocument())

    // 点取消 — AlertDialogCancel 默认就是「取消」按钮
    const cancelBtn = screen.getByRole('button', { name: '取消' })
    await user.click(cancelBtn)

    // revertTimebox 不应被调
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '确认回退' })).not.toBeInTheDocument()
    })
    expect(revertTimeboxMock).not.toHaveBeenCalled()
  })

  it('cancelled 卡点回退 → 直接调 revertTimebox(id) 不开弹窗', async () => {
    const user = userEvent.setup()
    const cancelledSample = makeCancelledSummary('tb-cancelled-001')
    const { getTimeboxesByRange } = await import('@/app/actions/intent')
    vi.mocked(getTimeboxesByRange).mockResolvedValue([cancelledSample])

    render(<TimeboxesWorkspace />)

    const revertBtn = await screen.findByRole('button', { name: /回退/ })
    await user.click(revertBtn)

    // cancelled 卡点回退 → 不应弹窗
    expect(screen.queryByText('确认回退')).not.toBeInTheDocument()

    // revertTimebox 立即被调（无第二参数，或 opts 为 undefined）
    await waitFor(() => {
      expect(revertTimeboxMock).toHaveBeenCalledWith('tb-cancelled-001')
    })
    // 关键断言：opts 不传 {clearExecutionRecord:true}
    const call = revertTimeboxMock.mock.calls[0] as [string, unknown?]
    expect(call[1]).toBeUndefined()
  })
})