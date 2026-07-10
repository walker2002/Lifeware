/**
 * @file habit-card.test
 * @brief HabitCard 单击编辑/批量选择/操作按钮隔离 + archetype 小标签 测试
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HabitCard } from '../habit-card'

const base = { title: '阅读', trackable: true, defaultTime: '09:00', earliestTime: '08:00', latestStartTime: '10:00', defaultDuration: 30, minDuration: 15, streak: 0 } as any

describe('[024] HabitCard 单击编辑', () => {
  it('非批量模式整卡单击触发 onEdit', () => {
    const onEdit = vi.fn()
    render(<HabitCard {...base} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('阅读'))
    expect(onEdit).toHaveBeenCalled()
  })
  it('批量模式单击触发 onSelectToggle 而非 onEdit', () => {
    const onEdit = vi.fn(); const onSelectToggle = vi.fn()
    render(<HabitCard {...base} selectable onEdit={onEdit} onSelectToggle={onSelectToggle} />)
    fireEvent.click(screen.getByText('阅读'))
    expect(onSelectToggle).toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
  it('点操作按钮不触发 onEdit', () => {
    const onEdit = vi.fn(); const onLog = vi.fn()
    render(<HabitCard {...base} status="active" onEdit={onEdit} onLog={onLog} />)
    fireEvent.click(screen.getByText('打卡'))
    expect(onLog).toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('HabitCard 双击进入编辑', () => {
  it('批量模式下双击仍触发 onEdit（不被 selection toggle 吞掉）', () => {
    const onEdit = vi.fn(); const onSelectToggle = vi.fn()
    render(<HabitCard {...base} selectable onEdit={onEdit} onSelectToggle={onSelectToggle} />)
    fireEvent.doubleClick(screen.getByText('阅读'))
    expect(onEdit).toHaveBeenCalled()
  })
  it('非批量模式双击触发 onEdit', () => {
    const onEdit = vi.fn()
    render(<HabitCard {...base} onEdit={onEdit} />)
    fireEvent.doubleClick(screen.getByText('阅读'))
    expect(onEdit).toHaveBeenCalled()
  })
})

describe('[023] A3.2 HabitCard archetype 小标签', () => {
  it('传 archetypeLabel 时渲染活动原型 Badge', () => {
    render(<HabitCard {...base} archetypeLabel="深度专注" />)
    expect(screen.getByText('深度专注')).toBeInTheDocument()
  })
  it('不传 archetypeLabel 时不渲染标签', () => {
    render(<HabitCard {...base} />)
    // 任何以「活动原型」为前缀/标题的标签都不应出现（[023] A3.2 仅小标签）
    expect(screen.queryByText('活动原型')).not.toBeInTheDocument()
  })
})