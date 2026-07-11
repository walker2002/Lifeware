/**
 * @file task-detail-drawer.test
 * @brief TaskDetailDrawer archetype 去重验证（[027-A] 修复）
 *
 * [027-A] 前：drawer 渲染 archetype 两处（TaskEditZone 编辑 + 独立只读块）
 * [027-A] 修：移除冗余只读块，archetype 仅由 TaskEditZone 渲染（可编辑）
 * 本测试验证 archetype 只渲染一次（无重复）
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

describe('[027-A] TaskDetailDrawer archetype 去重', () => {
  it('activityArchetypeId 非空时 archetype 仅渲染一次（无重复）', async () => {
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

    // 等待 archetype 渲染（TaskEditZone 内的 ArchetypePicker）
    await waitFor(() => {
      const matches = screen.getAllByText('深度专注')
      expect(matches.length).toBe(1) // 仅一处，无重复
    })
  })
})