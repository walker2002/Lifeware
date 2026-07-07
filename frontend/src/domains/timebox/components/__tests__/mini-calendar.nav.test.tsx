/**
 * @file mini-calendar.nav 测试
 * @brief [023.13] §5 月历上下月翻页
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniCalendar } from '../mini-calendar'

describe('MiniCalendar 上下月翻页', () => {
  it('初始显示 currentDate 所在月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    expect(screen.getByText('2026年7月')).toBeTruthy()
  })

  it('点 › 显示下月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('下个月'))
    expect(screen.getByText('2026年8月')).toBeTruthy()
  })

  it('点 ‹ 显示上月', () => {
    render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('上个月'))
    expect(screen.getByText('2026年6月')).toBeTruthy()
  })

  it('用户翻过后，currentDate 同月变化不抢回 viewMonth', () => {
    const { rerender } = render(<MiniCalendar currentDate={new Date('2026-07-15')} events={[]} />)
    fireEvent.click(screen.getByLabelText('下个月')) // → 8月
    rerender(<MiniCalendar currentDate={new Date('2026-07-20')} events={[]} />) // currentDate 仍在7月
    expect(screen.getByText('2026年8月')).toBeTruthy() // 锁定8月
  })
})