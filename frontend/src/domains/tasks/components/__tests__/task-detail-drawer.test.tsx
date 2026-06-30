/**
 * @file task-detail-drawer.test
 * @brief [023] A3.2 TaskDetailDrawer archetype 只读行 render 守护（H2）
 *
 * - activityArchetypeId 非空时渲染只读 archetype 区（l2Name + 无「选择」按钮）
 * - activityArchetypeId 为 undefined 时整块不渲染（M3：FK ON DELETE SET NULL → undefined → 不渲染）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getTaskByIdMock = vi.fn()
const getTaskAncestorsMock = vi.fn()
const getThreadByIdMock = vi.fn()
const getArchetypesMock = vi.fn()

vi.mock('@/app/actions/tasks', () => ({
  getTaskById: (...a: unknown[]) => getTaskByIdMock(...a),
  getTaskAncestors: (...a: unknown[]) => getTaskAncestorsMock(...a),
  getThreadById: (...a: unknown[]) => getThreadByIdMock(...a),
}))

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: (...a: unknown[]) => getArchetypesMock(...a),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { TaskDetailDrawer } from '../task-detail-drawer'

const baseTask = (activityArchetypeId: string | undefined) => ({
  id: 'task-1',
  userId: 'user-1',
  status: 'todo' as const,
  title: '写论文',
  description: '',
  priority: 'P1' as const,
  energyRequired: 'medium' as const,
  clarity: 'clear' as const,
  complexity: [],
  captureMode: 'manual' as const,
  tracking: 'measurable' as const,
  aiTags: {},
  tags: [],
  createdAt: '2026-06-30T00:00:00Z',
  updatedAt: '2026-06-30T00:00:00Z',
  activityArchetypeId,
})

describe('[023] A3.2 TaskDetailDrawer archetype 只读行', () => {
  it('activityArchetypeId 非空时渲染只读 archetype 区（无「选择」按钮）', async () => {
    getTaskByIdMock.mockResolvedValue(baseTask('a1'))
    getTaskAncestorsMock.mockResolvedValue([])
    getThreadByIdMock.mockResolvedValue(null)
    getArchetypesMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          userId: 'user-1',
          l1Category: '工作',
          l2Name: '深度专注',
          energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 },
          activityLabel: {
            enjoyment: 5,
            typicalDuration: 60,
            interruptTolerance: 'low',
            environment: [],
            location: [],
            parallelizable: false,
          },
          isSystem: true,
          createdAt: '2026-06-30T00:00:00Z',
          updatedAt: '2026-06-30T00:00:00Z',
        },
      ],
    })

    render(
      <TaskDetailDrawer
        taskId={'task-1' as never}
        userId={'user-1' as never}
        onClose={vi.fn()}
      />,
    )

    // 等待 archetype 拉取 + 渲染
    await waitFor(() => {
      expect(screen.getByText('深度专注')).toBeInTheDocument()
    })
    // readOnly：ArchetypePicker 在选中态不渲染「选择」按钮
    expect(screen.queryByText('选择')).not.toBeInTheDocument()
    // 「活动原型」label 渲染
    expect(screen.getByText('活动原型')).toBeInTheDocument()
  })

  it('activityArchetypeId 为 undefined 时整块不渲染（M3: SET NULL→undefined→不渲染）', async () => {
    getTaskByIdMock.mockResolvedValue(baseTask(undefined))
    getTaskAncestorsMock.mockResolvedValue([])
    getThreadByIdMock.mockResolvedValue(null)
    getArchetypesMock.mockResolvedValue({ success: true, data: [] })

    render(
      <TaskDetailDrawer
        taskId={'task-1' as never}
        userId={'user-1' as never}
        onClose={vi.fn()}
      />,
    )

    // 等待任务加载（标题出现即表示抽屉已渲染）
    await waitFor(() => {
      expect(screen.getAllByText('写论文').length).toBeGreaterThan(0)
    })
    // 整块不渲染：既不显示 label，也不显示 picker
    expect(screen.queryByText('活动原型')).not.toBeInTheDocument()
    expect(screen.queryByText('深度专注')).not.toBeInTheDocument()
    expect(screen.queryByText('未选择（可选）')).not.toBeInTheDocument()
  })
})