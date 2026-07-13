/**
 * @file timeboxes-workspace.openai.test
 * @brief [028.2] T1 — workspace.openAiPanel 真接 openCnuiSurface + score 徽章 + needConfirm 路径
 *
 * 验证 [028] 已 ship 的 cnui handler scheduleProposal open 路径被 workspace 真接入：
 * - openAiPanel 调 openCnuiSurface('timebox', 'scheduleProposal', { date }) 而非静态 mock
 * - dataSnapshot.proposals 注入到 aiProposals state
 * - dataSnapshot.score 注入到 aiScore state → AIOrchestratePanel 渲染 score-badge
 * - dataSnapshot.needConfirm=true → setAiNeedConfirm 走 ArchetypePicker 候选视图
 * - openCnuiSurface throw → toast.error + 不打开 panel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithTz } from '@/contexts/__tests__/test-utils'
import userEvent from '@testing-library/user-event'

const submitCnuiSurfaceMock = vi.fn()
const submitDynamicIntentMock = vi.fn()
const openCnuiSurfaceMock = vi.fn()
const transitionTimeboxMock = vi.fn()
const revertTimeboxMock = vi.fn()

vi.mock('@/app/actions/intent', () => ({
  submitCnuiSurface: (...a: unknown[]) => submitCnuiSurfaceMock(...a),
  submitDynamicIntent: (...a: unknown[]) => submitDynamicIntentMock(...a),
  openCnuiSurface: (...a: unknown[]) => openCnuiSurfaceMock(...a),
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

describe('[028.2] T1 — workspace.openAiPanel 真接 openCnuiSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitCnuiSurfaceMock.mockResolvedValue({ success: true })
    submitDynamicIntentMock.mockResolvedValue({ success: true })
    // 默认：openCnuiSurface 返正常 proposals + score + dimensions
    openCnuiSurfaceMock.mockResolvedValue({
      content: '智能编排时间盒 — ...',
      surface: {
        cnuiSurfaceId: 'mock-cnui-id',
        cnuiSurfaceType: 'schedule-proposal',
        domainId: 'timebox',
        action: 'scheduleProposal',
        dataSnapshot: {
          proposals: [
            { id: 'p-1', title: '上午写作', startTime: '09:00', endTime: '11:00' },
            { id: 'p-2', title: '午后站会', startTime: '14:00', endTime: '15:00' },
          ],
          revertableBatches: [],
          needConfirm: false,
          archetypeCandidates: [],
          confirmReason: '',
          score: 8.5,
          dimensions: { energy: 9, conflict: 8, balance: 8, priority: 9, buffer: 8 },
        },
      },
    })
  })

  it('点 AI 智能推荐 → openCnuiSurface(timebox, scheduleProposal, { date }) 被调', async () => {
    const user = userEvent.setup()
    renderWithTz(<TimeboxesWorkspace />)

    await user.click(screen.getByTestId('ai-orchestrate-button'))

    await waitFor(() => {
      expect(openCnuiSurfaceMock).toHaveBeenCalledTimes(1)
    })
    const [domainId, action, fields] = openCnuiSurfaceMock.mock.calls[0]
    expect(domainId).toBe('timebox')
    expect(action).toBe('scheduleProposal')
    expect(fields).toHaveProperty('date')
    expect(typeof (fields as { date: string }).date).toBe('string')
  })

  it('openCnuiSurface 返回 proposals → AIOrchestratePanel 渲染 score-badge', async () => {
    const user = userEvent.setup()
    renderWithTz(<TimeboxesWorkspace />)

    await user.click(screen.getByTestId('ai-orchestrate-button'))

    // 等 panel 打开 + proposal 卡片渲染
    await waitFor(() => expect(screen.getByTestId('ai-panel-overlay')).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByTestId('proposal-card')).toHaveLength(2))

    // score 徽章渲染
    expect(screen.getByTestId('score-badge')).toBeInTheDocument()
    expect(screen.getByTestId('score-value')).toHaveTextContent('8.5 / 10')
  })

  it('needConfirm=true → AIOrchestratePanel 不渲染，走 need-confirm-card 视图', async () => {
    openCnuiSurfaceMock.mockResolvedValueOnce({
      content: '需要确认',
      surface: {
        cnuiSurfaceId: 'mock-cnui-id',
        cnuiSurfaceType: 'schedule-proposal',
        domainId: 'timebox',
        action: 'scheduleProposal',
        dataSnapshot: {
          proposals: [],  // needConfirm 路径下 proposals 为空
          revertableBatches: [],
          needConfirm: true,
          archetypeCandidates: [
            { id: 'c-1', title: '手动改约定', source: 'fallback', reason: 'NL 涉及 Tier0 改时' },
          ],
          confirmReason: 'NL 置信度低（0.30 < 0.6）',
          score: undefined,
          dimensions: undefined,
        },
      },
    })

    const user = userEvent.setup()
    renderWithTz(<TimeboxesWorkspace />)
    await user.click(screen.getByTestId('ai-orchestrate-button'))

    await waitFor(() => expect(screen.getByTestId('need-confirm-card')).toBeInTheDocument())
    // needConfirm 视图不显示 proposal 卡片
    expect(screen.queryByTestId('proposal-card')).not.toBeInTheDocument()
    // 不显示 score 徽章（needConfirm 路径无 score）
    expect(screen.queryByTestId('score-badge')).not.toBeInTheDocument()
    // 候选标题显示
    expect(screen.getByText('手动改约定')).toBeInTheDocument()
  })

  it('openCnuiSurface throw → toast.error + 不打开 panel', async () => {
    openCnuiSurfaceMock.mockRejectedValueOnce(new Error('network error'))

    const user = userEvent.setup()
    renderWithTz(<TimeboxesWorkspace />)
    await user.click(screen.getByTestId('ai-orchestrate-button'))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('编排服务暂不可用，请稍后重试'))
    // panel 不打开
    await waitFor(() => {
      expect(screen.queryByTestId('ai-panel-overlay')).not.toBeInTheDocument()
    })
  })
})