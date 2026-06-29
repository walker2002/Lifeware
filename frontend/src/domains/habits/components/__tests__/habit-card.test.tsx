/**
 * @file habit-card.test
 * @brief HabitCard 单击编辑/批量选择/操作按钮隔离 测试
 */

/**
 * @file habit-card.test
 * @brief HabitCard 单击编辑/批量选择/操作按钮隔离 测试
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