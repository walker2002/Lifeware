/**
 * @file appointment-mini-calendar.test
 * @brief [026.02] T6 — AppointmentMiniCalendar 独立组件测试
 *
 * IRON RULE：与 timebox MiniCalendar 完全独立（[026] T15 已锁定 timebox MiniCalendar
 *   为 timebox-only）。本组件接受 AppointmentSummary[]，按 status + startTime
 *   派生过期/未过期双色标记。
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentMiniCalendar } from '../appointment-mini-calendar'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mkAppt = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: 'x',
  startTime: '2026-07-10T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentMiniCalendar', () => {
  const currentDate = new Date('2026-07-15T12:00:00Z')

  it('渲染本月日历网格（含标题行 + 6 周）', () => {
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[]} />,
    )
    // 7 个 weekday header (一~日)
    expect(screen.getAllByText(/^[一二三四五六日]$/u).length).toBeGreaterThanOrEqual(7)
    // 6 行 × 7 列 = 42 天格
    const days = container.querySelectorAll('[data-day-cell]')
    expect(days.length).toBe(42)
  })

  it('过期约定（startTime < now, status=scheduled）日期格显示红点', () => {
    const appt = mkAppt({ startTime: '2026-07-10T10:00:00Z', status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    // 找到 10 号的日期格，检查有红点
    const day10 = container.querySelector('[data-day-cell="2026-07-10"]')
    expect(day10?.querySelector('[data-marker="expired"]')).toBeInTheDocument()
  })

  it('未过期约定（startTime >= now, status=scheduled）日期格显示蓝点', () => {
    const appt = mkAppt({ startTime: '2026-07-20T10:00:00Z', status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    const day20 = container.querySelector('[data-day-cell="2026-07-20"]')
    expect(day20?.querySelector('[data-marker="future"]')).toBeInTheDocument()
  })

  it('终态约定（cancelled/completed）日期格不打点', () => {
    const appt1 = mkAppt({ id: '1', startTime: '2026-07-12T10:00:00Z', status: 'cancelled' })
    const appt2 = mkAppt({ id: '2', startTime: '2026-07-13T10:00:00Z', status: 'completed' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt1, appt2]} />,
    )
    expect(container.querySelector('[data-day-cell="2026-07-12"]')?.querySelector('[data-marker]')).toBeNull()
    expect(container.querySelector('[data-day-cell="2026-07-13"]')?.querySelector('[data-marker]')).toBeNull()
  })

  it('selectedDate 渲染选中态', () => {
    render(
      <AppointmentMiniCalendar
        currentDate={currentDate}
        appointments={[]}
        selectedDate={new Date('2026-07-15T00:00:00Z')}
      />,
    )
    const cells = screen.getAllByRole('gridcell')
    const selected = cells.find(c => c.getAttribute('aria-selected') === 'true')
    expect(selected).toBeDefined()
    expect(selected?.textContent).toContain('15')
  })

  it('点击日期触发 onDateSelect', async () => {
    const user = userEvent.setup()
    const onDateSelect = vi.fn()
    render(
      <AppointmentMiniCalendar
        currentDate={currentDate}
        appointments={[]}
        onDateSelect={onDateSelect}
      />,
    )
    // 找 15 号的格子（点击触发）
    const cells = screen.getAllByRole('gridcell')
    const day15 = cells.find(c => c.textContent?.trim() === '15')
    expect(day15).toBeDefined()
    await user.click(day15!)
    expect(onDateSelect).toHaveBeenCalledTimes(1)
    const [d] = onDateSelect.mock.calls[0]
    expect(d).toBeInstanceOf(Date)
    expect((d as Date).getDate()).toBe(15)
  })
})