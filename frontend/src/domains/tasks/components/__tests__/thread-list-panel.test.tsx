/**
 * @file thread-list-panel.test
 * @brief ThreadListPanel 删除主线功能的测试
 *
 * TDD 测试：验证删除主线调用 deleteThread 而非 updateThreadStatus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock server actions
const getThreadsMock = vi.fn()
const getOrphanTaskCountMock = vi.fn()
const deleteThreadMock = vi.fn()
const updateThreadStatusMock = vi.fn()

vi.mock('@/app/actions/tasks', () => ({
  getThreads: (...a: unknown[]) => getThreadsMock(...a),
  getOrphanTaskCount: (...a: unknown[]) => getOrphanTaskCountMock(...a),
  deleteThread: (...a: unknown[]) => deleteThreadMock(...a),
  updateThreadStatus: (...a: unknown[]) => updateThreadStatusMock(...a),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ThreadListPanel } from '../thread-list-panel'

/**
 * 已归档主线（仅 archived 状态允许删除，见 getAllowedActions）
 */
const archivedThread = {
  thread: { id: 't1', name: '旧主线', status: 'archived', color: null },
  taskCount: 0,
  completedTaskCount: 0,
}

describe('ThreadListPanel — 删除主线', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getThreadsMock.mockResolvedValue([archivedThread])
    getOrphanTaskCountMock.mockResolvedValue(0)
    deleteThreadMock.mockResolvedValue(undefined)
  })

  it('点删除调用 deleteThread（而非 updateThreadStatus）', async () => {
    const user = userEvent.setup()
    render(
      <ThreadListPanel
        selectedThreadId="__all__"
        onSelectThread={vi.fn()}
        onOpenThreadDetail={vi.fn()}
      />,
    )

    // 等待主线加载
    await waitFor(() => expect(screen.getByText('旧主线')).toBeInTheDocument())

    // 定位主线行（role="button"）
    const row = screen.getByText('旧主线').closest('[role="button"]') as HTMLElement
    expect(row).not.toBeNull()

    // 展开「...」菜单：行内第一个 button
    const moreBtn = row.querySelector('button') as HTMLButtonElement
    expect(moreBtn).not.toBeNull()

    await act(async () => {
      moreBtn.click()
    })

    // 点击删除按钮
    const deleteBtn = await screen.findByText('删除')
    await user.click(deleteBtn)

    // 核心断言：deleteThread 被调用，updateThreadStatus 未被调用
    await waitFor(() => {
      expect(deleteThreadMock).toHaveBeenCalledWith('t1')
    })
    expect(updateThreadStatusMock).not.toHaveBeenCalled()
  })
})
