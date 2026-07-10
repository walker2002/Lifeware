/**
 * @file task-creation-card.archetype 单测
 * @brief [027-A] Phase A 验证 TaskCreationCard 接入 ArchetypePicker AI 匹配
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskCreationCard } from '../TaskCreationCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[027-A] TaskCreationCard AI 匹配', () => {
  it('title 非空时渲染「AI 匹配」按钮', async () => {
    render(<TaskCreationCard surfaceType="task-creation-card" dataModel={{ title: '写周报' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
})
