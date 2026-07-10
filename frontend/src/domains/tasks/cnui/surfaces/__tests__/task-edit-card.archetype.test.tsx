/**
 * @file task-edit-card.archetype 单测
 * @brief [027-A] Phase A 验证 TaskEditCard 接入 ArchetypePicker AI 匹配
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskEditCard } from '../TaskEditCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[027-A] TaskEditCard AI 匹配', () => {
  it('editTitle 非空时渲染「AI 匹配」按钮', async () => {
    render(<TaskEditCard surfaceType="task-edit-card" dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报' } }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
})
