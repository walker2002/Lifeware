/**
 * @file subtask-list.test
 * @brief SubtaskList 组件测试 — onChanged 回调
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock 外部依赖
const getSubtasksMock = vi.fn()
const createTaskMock = vi.fn()
vi.mock('@/app/actions/tasks', () => ({
  getSubtasks: (...a: unknown[]) => getSubtasksMock(...a),
  createTask: (...a: unknown[]) => createTaskMock(...a),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// 导入被测组件
import { SubtaskList } from '../subtask-list'

describe('SubtaskList — onChanged 回调', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认：getSubtasks 返回空数组，createTask 返回新创建的子任务
    getSubtasksMock.mockResolvedValue([])
    createTaskMock.mockResolvedValue({ id: 'sub-1', title: '子任务' })
  })

  it('添加子任务后调用 onChanged（通知父组件刷新树）', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()

    render(
      <SubtaskList
        taskId="task-1"
        userId={'user-1' as never}
        onOpenTask={vi.fn()}
        onChanged={onChanged}
      />,
    )

    // 等待输入框出现
    await waitFor(() =>
      expect(screen.getByPlaceholderText('+ 添加子任务')).toBeInTheDocument(),
    )

    // 输入子任务标题并按回车
    await user.type(screen.getByPlaceholderText('+ 添加子任务'), '第一个子任务')
    await user.keyboard('{Enter}')

    // 验证 createTask 被正确调用
    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '第一个子任务',
          parentId: 'task-1',
        }),
      )
    })

    // 验证 onChanged 回调被调用
    expect(onChanged).toHaveBeenCalled()
  })
})
