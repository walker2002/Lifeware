/**
 * @file habit-form-archetype 单测
 * @brief [023] A3.2 验证 HabitForm 接入 ArchetypePicker：提交 payload 含 activityArchetypeId
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HabitForm } from '../habit-form'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 HabitForm archetype 接入', () => {
  it('选 archetype 后提交，payload 含 activityArchetypeId', async () => {
    const onSubmit = vi.fn()
    render(<HabitForm onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    // 填必填标题 + 提交
    fireEvent.change(screen.getByPlaceholderText('例如：晨跑、午休冥想'), { target: { value: '晨跑' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })

  it('编辑模式 initial.activityArchetypeId 回填', async () => {
    render(<HabitForm initial={{ title: '晨跑', activityArchetypeId: 'a1' } as any} onSubmit={() => {}} onCancel={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
  })
})