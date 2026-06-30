/**
 * @file task-edit-card 单测
 * @brief [023] A3.2 TaskEditCard 编辑路径：archetype 回填 + 两个 onConfirm payload（H1+C2 回归）
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskEditCard } from '../surfaces/TaskEditCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({ success: true, data: [
    { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
  ]}),
}))

describe('[023] A3.2 TaskEditCard archetype 编辑路径', () => {
  it('directEdit（phase=detail）回填 task 原 archetype', async () => {
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
  })
  it('handleSave 提交 payload 含 activityArchetypeId', async () => {
    const onConfirm = vi.fn()
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={onConfirm} />)
    await screen.findByText('深度专注')
    fireEvent.click(screen.getByText('保存'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })
  it('C2 回归：handleAddSubtask 提交同样保留 activityArchetypeId（不丢变更）', async () => {
    const onConfirm = vi.fn()
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={onConfirm} />)
    await screen.findByText('深度专注')
    // 实际渲染按钮文案是 "＋ 添加子任务"（全角 ＋），点开输入框后点 "添加"
    fireEvent.click(screen.getByText(/添加子任务/))
    fireEvent.change(screen.getByPlaceholderText(/子任务标题/), { target: { value: '子1' } })
    fireEvent.click(screen.getByText('添加'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1', createSubtask: expect.anything() }))
  })
})