/**
 * @file appointment-day-view.test
 * @brief [026.02] T7 — AppointmentDayView 两栏式日视图组件测试
 *
 * 左：选中日约定列表（按 startTime 升序，EmptyState 兜底）
 * 右：AppointmentMiniCalendar（标记来自 appointmentsByDate 全集）
 *
 * 日期抗漂移：与 T6 一致，使用相对 offset 派生「今天/明天」，
 * 避免硬编码日期随真实日期漂移而翻转「过期/未过期」判定。
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, afterAll, vi } from 'vitest'
import { AppointmentDayView } from '../appointment-day-view'
import type { AppointmentSummary } from '@/usom/types/summaries'

// 锁定系统时间到 currentDate，规避 MiniCalendar 内部 `new Date()` 漂移
const currentDate = new Date('2026-07-15T12:00:00Z')
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(currentDate)
})
afterAll(() => {
  vi.useRealTimers()
})

const DAY_MS = 24 * 60 * 60 * 1000
const today = new Date('2026-07-15T00:00:00Z')
const tomorrow = new Date(today.getTime() + 1 * DAY_MS)

function isoDayStart(d: Date, hour = 14): string {
  // 14:00Z > currentDate 12:00Z → 未来（future marker）
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0)).toISOString()
}

function isoAt(d: Date, hour: number, minute = 0): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0)).toISOString()
}

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: '约定 ' + Math.random(),
  startTime: isoDayStart(today),
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

describe('AppointmentDayView', () => {
  const todayList = [
    mk({ id: '1', title: '晨会', startTime: isoAt(today, 14) }),
    mk({ id: '2', title: '复盘', startTime: isoAt(today, 19) }),
  ]
  const tomorrowItem = mk({
    id: '3',
    title: '明日约定',
    startTime: isoDayStart(tomorrow),
  })
  const byDate = new Map<string, AppointmentSummary[]>([
    [ymd(today), todayList],
    [ymd(tomorrow), [tomorrowItem]],
  ])

  it('渲染两栏布局', () => {
    const { container } = render(
      <AppointmentDayView
        appointments={todayList}
        selectedDate={today}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    // 列表区 + 日历区
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
    expect(container.querySelector('[data-day-calendar]')).toBeInTheDocument()
  })

  it('左侧列表只显示选中日的约定', () => {
    render(
      <AppointmentDayView
        appointments={todayList}
        selectedDate={today}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText('晨会')).toBeInTheDocument()
    expect(screen.getByText('复盘')).toBeInTheDocument()
    expect(screen.queryByText('明日约定')).not.toBeInTheDocument()
  })

  it('空列表显示 EmptyState', () => {
    render(
      <AppointmentDayView
        appointments={[]}
        selectedDate={today}
        appointmentsByDate={new Map()}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText(/该日无约定/)).toBeInTheDocument()
  })

  it('右侧日历使用 appointmentsByDate 渲染标记', () => {
    const { container } = render(
      <AppointmentDayView
        appointments={todayList}
        selectedDate={today}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    // 今日 (currentDate, 未过期) + 明日 (未来) 都应有 future 标记
    expect(
      container.querySelector(`[data-day-cell="${ymd(today)}"] [data-marker="future"]`),
    ).toBeInTheDocument()
    expect(
      container.querySelector(`[data-day-cell="${ymd(tomorrow)}"] [data-marker="future"]`),
    ).toBeInTheDocument()
  })
})
