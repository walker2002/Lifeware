/**
 * @file task-edit-zone.test
 * @brief task-edit-zone 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const updateTaskMock = vi.fn()
const getArchetypesMock = vi.fn()
vi.mock('@/app/actions/tasks', () => ({
  updateTask: (...args: unknown[]) => updateTaskMock(...args),
}))
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: (...args: unknown[]) => getArchetypesMock(...args),
}))
vi.mock('@/nexus/rules/use-manifest-rules', () => ({
  useManifestRules: () => ({ errors: {}, validateField: vi.fn() }),
}))

import { TaskEditZone } from '../task-edit-zone'

const baseProps = {
  task: {
    id: 't1',
    title: '写周报',
    activityArchetypeId: 'a1',
  } as any,
  onTaskUpdate: vi.fn(),
}

describe('TaskEditZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getArchetypesMock.mockResolvedValue({
      success: true,
      data: [
        { id: 'a1', l1Category: '工作', l2Name: '深度专注', isSystem: true, energyCost: {} },
      ],
    })
    updateTaskMock.mockResolvedValue({ id: 't1', activityArchetypeId: null })
  })

  it('[027-A] 渲染「活动原型」字段并显示当前 archetype', async () => {
    render(<TaskEditZone {...baseProps} />)
    expect(await screen.findByText('活动原型')).toBeInTheDocument()
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
  })

  it('[027-A] 清除原型 → draft 落 null → updateTask 收到 activityArchetypeId=null', async () => {
    const user = userEvent.setup()
    render(<TaskEditZone {...baseProps} />)

    // 等待原型加载完成
    await screen.findByText('深度专注')

    // 点击清除按钮
    await user.click(screen.getByRole('button', { name: '清除活动原型' }))

    // [027-A] Finding 1: 视觉断言 - 清除后 picker 应显示「未选择」，而非旧值「深度专注」
    await waitFor(() => {
      expect(screen.queryByText('深度专注')).not.toBeInTheDocument()
    })

    // 等待保存按钮出现（hasChanges 异步重计算可能需要时间）
    await waitFor(() => expect(screen.getByRole('button', { name: /保存修改/ })).toBeInTheDocument())

    // 点击保存按钮
    await user.click(screen.getByRole('button', { name: /保存修改/ }))

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith('t1', expect.objectContaining({ activityArchetypeId: null }))
    })
  })
})
