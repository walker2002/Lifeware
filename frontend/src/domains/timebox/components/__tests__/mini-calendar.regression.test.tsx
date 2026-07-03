/**
 * @file mini-calendar.regression.test
 * @brief [026] T15 P1 CRITICAL IRON RULE 守护 — MiniCalendar 纯 timebox-only 输入
 *
 * [026] A3.2 把 MiniCalendar 改为接受 `events: ScheduleEvent[]`。
 * MiniCalendar 仅判断"指定日期是否有任意事件"（不按 kind 派生态），因此：
 * - IRON RULE：纯 timebox-only 输入（kind 全部 = 'timebox'）的渲染输出
 *   与 T13 改动前字节级一致。
 *
 * 方案 B：DOM 中应出现 3 个事件点（timebox 起点落在 7/15）；
 *   不应出现 itinerary 独有的渲染标记（MiniCalendar 不区分 kind，所以没有
 *   itinerary 特有 className；守卫点是有事件日子数 = 3）。
 *
 * 方案 A：snapshot 锁当前已通过的渲染。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { MiniCalendar } from '../mini-calendar'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { ScheduleEvent } from '../schedule-event'
import { timeboxToEvent } from '../schedule-event'

// 固定"今天"：MiniCalendar 用 `new Date()` 判 isToday，
// snapshot 必须有确定日期才能稳定。
const FROZEN_TODAY = new Date('2026-07-15T10:00:00.000Z')
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_TODAY)
})
afterAll(() => {
  vi.useRealTimers()
})

function makeSamples(): ScheduleEvent[] {
  const s1: TimeboxSummary = {
    id: 'tb-1',
    title: '晨会',
    status: 'planned',
    startTime: '2026-07-15T08:00:00.000Z',
    endTime: '2026-07-15T09:00:00.000Z',
    taskIds: [],
    habitIds: [],
  }
  const s2: TimeboxSummary = {
    id: 'tb-2',
    title: '深度工作',
    status: 'running',
    startTime: '2026-07-15T09:30:00.000Z',
    endTime: '2026-07-15T11:00:00.000Z',
    taskIds: [],
    habitIds: [],
    startedAt: '2026-07-15T09:30:00.000Z',
  }
  // 第三个样本故意放在不同日（7/20），验证日历上 2 个日子被标记
  const s3: TimeboxSummary = {
    id: 'tb-3',
    title: '复盘',
    status: 'ended',
    startTime: '2026-07-20T14:00:00.000Z',
    endTime: '2026-07-20T15:00:00.000Z',
    taskIds: ['t-1'],
    habitIds: ['h-2'],
    startedAt: '2026-07-20T14:00:00.000Z',
    endedAt: '2026-07-20T15:00:00.000Z',
  }
  return [s1, s2, s3].map(timeboxToEvent)
}

describe('[026] T15 IRON RULE — MiniCalendar 纯 timebox 渲染回归', () => {
  it('纯 kind: timebox 输入：渲染当月日历网格 + 标记 2 个有事件日', () => {
    const currentDate = new Date('2026-07-15T00:00:00.000Z')
    const { container } = render(
      <MiniCalendar currentDate={currentDate} events={makeSamples()} />,
    )
    // 月份标题
    expect(container.textContent).toContain('2026年7月')
    // 事件点：每个有事件的日期渲染 1 个 `size-1 rounded-full` 圆点
    // 样本 1+2 都在 7/15（同一日共享 1 个圆点），样本 3 在 7/20 → 共 2 个圆点
    const dots = container.querySelectorAll('span.rounded-full')
    expect(dots.length).toBe(2)
  })

  it('纯 kind: timebox 输入：不含 itinerary 独有 className 标记', () => {
    const currentDate = new Date('2026-07-15T00:00:00.000Z')
    const { container } = render(
      <MiniCalendar currentDate={currentDate} events={makeSamples()} />,
    )
    // MiniCalendar 不按 kind 派生态，不存在 itinerary 独有 className；
    // 守卫：与改前一致地不出现 ItineraryLockedCard / MapPin 等
    expect(container.querySelectorAll('svg.lucide-map-pin').length).toBe(0)
    expect(container.textContent).not.toContain('行程已锁定')
  })

  it('纯 kind: timebox 输入：snapshot 锁（方案 A 防御）', () => {
    const currentDate = new Date('2026-07-15T00:00:00.000Z')
    const { container } = render(
      <MiniCalendar currentDate={currentDate} events={makeSamples()} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('空 events 数组：渲染日历网格 + 0 事件点', () => {
    const currentDate = new Date('2026-07-15T00:00:00.000Z')
    const { container } = render(
      <MiniCalendar currentDate={currentDate} events={[]} />,
    )
    expect(container.textContent).toContain('2026年7月')
    expect(container.querySelectorAll('span.rounded-full').length).toBe(0)
  })
})
