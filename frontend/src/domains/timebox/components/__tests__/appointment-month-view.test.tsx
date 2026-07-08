/**
 * @file appointment-month-view.test
 * @brief [026.02] T8 — AppointmentMonthView 全月网格组件测试
 *
 * 42 天格（7×6），每格显示日期 + 当日 scheduled 约定计数 + 状态色。
 * 点击触发 onSelectDate（父组件决定是否切日视图）。
 *
 * 日期抗漂移：与 T6/T7 一致，vi.useFakeTimers + setSystemTime 冻结 Date，
 * 防止「过期/未过期」判定随真实今天日期翻转。
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, afterAll, vi } from 'vitest'
import { AppointmentMonthView } from '../appointment-month-view'
import type { AppointmentSummary } from '@/usom/types/summaries'

// 锁定系统时间到 currentDate，使组件内部 `new Date()` 固定（抗漂移）
const currentDate = new Date('2026-07-15T12:00:00Z')
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(currentDate)
})
afterAll(() => {
  vi.useRealTimers()
})

const DAY_MS = 24 * 60 * 60 * 1000
const day10 = new Date(currentDate.getTime() - 5 * DAY_MS)  // 2026-07-10 已过期
const day20 = new Date(currentDate.getTime() + 5 * DAY_MS)  // 2026-07-20 未过期
function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
const day10Key = ymd(day10)
const day20Key = ymd(day20)

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: 'x',
  startTime: day10.toISOString(),
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentMonthView', () => {
  const items = [
    mk({ id: '1', startTime: day10.toISOString() }),  // 已过期
    mk({ id: '2', startTime: day20.toISOString() }),  // 未过期
  ]

  it('渲染 7 列 × 6 行 = 42 天格', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={() => {}}
      />,
    )
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells.length).toBe(42)
  })

  it('有约定的日期显示计数', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={() => {}}
      />,
    )
    expect(container.querySelector(`[data-day-cell="${day10Key}"] [data-count]`)?.textContent).toBe('1')
    expect(container.querySelector(`[data-day-cell="${day20Key}"] [data-count]`)?.textContent).toBe('1')
  })

  it('点击日期触发 onSelectDate 并跳日视图（父组件负责切换 viewMode）', async () => {
    const user = userEvent.setup()
    const onSelectDate = vi.fn()
    render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={onSelectDate}
      />,
    )
    const cells = screen.getAllByRole('gridcell')
    const day20Cell = cells.find(c => c.getAttribute('data-day-cell') === day20Key)
    await user.click(day20Cell!)
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    const [d] = onSelectDate.mock.calls[0]
    expect((d as Date).getDate()).toBe(20)
  })

  it('当月以外日期显示淡灰', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={[]}
        onSelectDate={() => {}}
      />,
    )
    // 7月第一天是星期三，所以第 1 行前 2 格是邻月（6月最后两天）
    const cells = container.querySelectorAll('[role="gridcell"]')
    const firstCell = cells[0]
    expect(firstCell.className).toMatch(/text-body\/40|opacity/i)  // 邻月样式
  })
})