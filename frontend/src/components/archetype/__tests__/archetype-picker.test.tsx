/**
 * @file archetype-picker 单测
 * @brief [023] A3.2 裸版/带盒版公共化：readOnly 行为 + Card 包裹
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArchetypePicker } from '../archetype-picker'
import { ArchetypePickerCard } from '../archetype-picker-card'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 ArchetypePicker 裸版', () => {
  it('可写模式渲染「选择」按钮', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    // 等 getArchetypes effect 落幕
    expect(await screen.findByText('选择')).toBeInTheDocument()
  })

  it('readOnly 模式不渲染「选择/更换」按钮', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} />)
    await screen.findByText('深度专注')
    expect(screen.queryByText('选择')).not.toBeInTheDocument()
    expect(screen.queryByText('更换')).not.toBeInTheDocument()
  })

  it('选中后展示 l2Name + l1Category', async () => {
    render(<ArchetypePicker value="a1" onChange={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
    expect(screen.getByText(/工作/)).toBeInTheDocument()
  })

  it('点击下拉项触发 onChange(id, archetype)', async () => {
    const onChange = vi.fn()
    render(<ArchetypePicker value={undefined} onChange={onChange} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    expect(onChange).toHaveBeenCalledWith('a1', expect.objectContaining({ l2Name: '深度专注' }))
  })
})

describe('[023] A3.2 ArchetypePickerCard 带盒版', () => {
  it('渲染 h3 标题 + bg-surface-card 盒', async () => {
    const { container } = render(<ArchetypePickerCard value={undefined} onChange={() => {}} />)
    expect(screen.getByText('活动原型')).toBeInTheDocument()
    expect(container.querySelector('.bg-surface-card')).toBeInTheDocument()
  })
})
