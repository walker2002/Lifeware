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
import { beforeAll, afterAll, vi } from 'vitest'
import { AppointmentMiniCalendar } from '../appointment-mini-calendar'
import type { AppointmentSummary } from '@/usom/types/summaries'

// 把组件内部的 `new Date()` 锁定到 currentDate，规避真实今天日期漂移导致
// 「过期/未过期」判定反转（例如 2026-07-10 随真实日期从未来→过去漂移）。
// 与 mini-calendar.regression.test.tsx 同模式（IRON RULE 同源）。
const currentDate = new Date('2026-07-15T12:00:00Z')
beforeAll(() => {
  // 只冻结 Date，使组件内部的 `new Date()` 固定到 currentDate；
  // 不冻结 setTimeout 等，避免 userEvent.click 等异步操作挂死。
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(currentDate)
})
afterAll(() => {
  vi.useRealTimers()
})

// 日期帮助：从 currentDate 派生相对偏移日期，抗漂移。
const DAY_MS = 24 * 60 * 60 * 1000
const dayBefore = new Date(currentDate.getTime() - 5 * DAY_MS)
const dayAfter = new Date(currentDate.getTime() + 5 * DAY_MS)
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
const dayBeforeKey = ymd(dayBefore)
const dayAfterKey = ymd(dayAfter)

const mkAppt = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: 'x',
  startTime: dayBefore.toISOString(),
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentMiniCalendar', () => {
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
    const appt = mkAppt({ startTime: dayBefore.toISOString(), status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    const cell = container.querySelector(`[data-day-cell="${dayBeforeKey}"]`)
    expect(cell?.querySelector('[data-marker="expired"]')).toBeInTheDocument()
  })

  it('未过期约定（startTime >= now, status=scheduled）日期格显示蓝点', () => {
    const appt = mkAppt({ startTime: dayAfter.toISOString(), status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    const cell = container.querySelector(`[data-day-cell="${dayAfterKey}"]`)
    expect(cell?.querySelector('[data-marker="future"]')).toBeInTheDocument()
  })

  it('终态约定（cancelled/completed）日期格不打点', () => {
    const appt1 = mkAppt({ id: '1', startTime: dayBefore.toISOString(), status: 'cancelled' })
    const appt2 = mkAppt({ id: '2', startTime: dayAfter.toISOString(), status: 'completed' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt1, appt2]} />,
    )
    expect(
      container.querySelector(`[data-day-cell="${dayBeforeKey}"]`)?.querySelector('[data-marker]'),
    ).toBeNull()
    expect(
      container.querySelector(`[data-day-cell="${dayAfterKey}"]`)?.querySelector('[data-marker]'),
    ).toBeNull()
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