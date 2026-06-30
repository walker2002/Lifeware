/**
 * @file task-creation-card 单测
 * @brief [023] A3.2 验证 TaskCreationCard 接入 ArchetypePicker：提交 payload 含 activityArchetypeId
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskCreationCard } from '../surfaces/TaskCreationCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 TaskCreationCard archetype 接入', () => {
  it('选 archetype 后提交，payload 含 activityArchetypeId', async () => {
    const onConfirm = vi.fn()
    render(
      <TaskCreationCard
        surfaceType="task-creation-card"
        dataModel={{}}
        onDataChange={() => {}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    // 选 archetype（等 getArchetypes effect 落幕后点「选择」→ 点下拉项）
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    // 填必填标题 + 提交
    fireEvent.change(screen.getByPlaceholderText('例如：完成周报'), { target: { value: '写周报' } })
    fireEvent.click(screen.getByText('创建任务'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })

  it('未选 archetype 提交，payload 不含 activityArchetypeId（optional，不阻塞）', async () => {
    const onConfirm = vi.fn()
    render(
      <TaskCreationCard surfaceType="task-creation-card" dataModel={{}} onDataChange={() => {}} onConfirm={onConfirm} onCancel={() => {}} />,
    )
    await screen.findByText('选择')
    fireEvent.change(screen.getByPlaceholderText('例如：完成周报'), { target: { value: '写周报' } })
    fireEvent.click(screen.getByText('创建任务'))
    expect(onConfirm).toHaveBeenCalledWith(expect.not.objectContaining({ activityArchetypeId: expect.anything() }))
  })
})