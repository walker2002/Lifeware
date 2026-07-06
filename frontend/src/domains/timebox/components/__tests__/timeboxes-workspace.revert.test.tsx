/**
 * @file timeboxes-workspace.revert.test
 * @brief [023.10] T1 — workspace handleAiConfirm revert 路径必须真调 submitCnuiSurface 而非 toast placeholder
 *
 * 关联 [023.08] P0 (4d6e7ca) 同源路由错配防御 — accept 已修，revert 仍 placeholder。
 *
 * 单独成文件（避免 Codex #4 mock shadow：timeboxes-workspace.ai-submit.test.tsx
 * 已含 `vi.mock('@/app/actions/intent', ...)` 全覆盖 mock，与本文件 vi.mock('@/app/actions/intent')
 * 共享 factory path 时 hoist 阶段互相覆盖，导致后面 import 的模块读到先注册的 mock）。
 *
 * 实现策略：通过 accept 路径触发 setRevertableBatches 注入一条测试数据，
 * 然后点 revert 按钮 → 断言 submitCnuiSurface 被以正确参数调用 + 不显 placeholder toast。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const submitCnuiSurfaceMock = vi.fn()
const submitDynamicIntentMock = vi.fn()

vi.mock('@/app/actions/intent', () => ({
  submitCnuiSurface: (...a: unknown[]) => submitCnuiSurfaceMock(...a),
  submitDynamicIntent: (...a: unknown[]) => submitDynamicIntentMock(...a),
  getTimeboxesByRange: vi.fn().mockResolvedValue([]),
  getAppointmentsByRange: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn(),
  transitionTimebox: vi.fn(),
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