/**
 * @file timebox-timeline.regression.test
 * @brief [026] T15 P1 CRITICAL IRON RULE 守护 — TimeboxTimeline 纯 timebox-only 输入
 *
 * [026] A3.2 把 TimeboxTimeline 改为接受 `events: ScheduleEvent[]` 并按 kind 分支。
 * IRON RULE 承诺：纯 kind='timebox' 输入的渲染输出与 T13 改动前字节级一致
 * （timebox 路径走 STATUS_COLORS + getCardBorderColor，itinerary 走 ITINERARY_COLOR）。
 *
 * 方案 B：DOM 必须仅含 timebox status 颜色类（`bg-primary/20` / `bg-surface-soft` /
 * `bg-warning/20` / `bg-muted/20` / `bg-success/20`），**不得**含 itinerary 独有的
 * `bg-primary/10`（ITINERARY_COLOR）。
 *
 * 方案 A：snapshot 锁当前已通过的渲染。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { TimeboxTimeline } from '../timebox-timeline'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { ScheduleEvent } from '../schedule-event'
import { timeboxToEvent } from '../schedule-event'

// 固定"现在"让 timeline 的"当前时间线"位置确定，snapshot 才能稳定。
const FROZEN_NOW = new Date('2026-07-15T17:00:00.000Z')
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
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
  const s3: TimeboxSummary = {
    id: 'tb-3',
    title: '复盘',
    status: 'ended',
    startTime: '2026-07-15T14:00:00.000Z',
    endTime: '2026-07-15T15:00:00.000Z',
    taskIds: ['t-1'],
    habitIds: ['h-2'],
    startedAt: '2026-07-15T14:00:00.000Z',
    endedAt: '2026-07-15T15:00:00.000Z',
  }
  return [s1, s2, s3].map(timeboxToEvent)
}

describe('[026] T15 IRON RULE — TimeboxTimeline 纯 timebox 渲染回归', () => {
  it('纯 kind: timebox 输入：3 个时间盒色块按 STATUS_COLORS 渲染', () => {
    const { container } = render(<TimeboxTimeline events={makeSamples()} />)
    // title 必须出现
    expect(container.textContent).toContain('晨会')
    expect(container.textContent).toContain('深度工作')
    expect(container.textContent).toContain('复盘')
    // running 状态对应 bg-primary/20（timebox 状态颜色，非 itinerary 的 bg-primary/10）
    expect(container.querySelectorAll('.bg-primary\\/20').length).toBeGreaterThan(0)
    // planned / ended 状态对应 bg-surface-soft
    expect(container.querySelectorAll('.bg-surface-soft').length).toBeGreaterThan(0)
  })

  it('纯 kind: timebox 输入：不含 itinerary 独有的 bg-primary/10（ITINERARY_COLOR）', () => {
    const { container } = render(<TimeboxTimeline events={makeSamples()} />)
    // ITINERARY_COLOR = "bg-primary/10 border-primary" — 出现即污染
    const polluted = container.querySelectorAll('.bg-primary\\/10')
    expect(polluted.length).toBe(0)
  })

  it('纯 kind: timebox 输入：snapshot 锁（方案 A 防御）', () => {
    const { container } = render(<TimeboxTimeline events={makeSamples()} />)
    expect(container).toMatchSnapshot()
  })

  it('空 events 数组：渲染空状态，不分支到 timebox/itinerary', () => {
    const { container } = render(<TimeboxTimeline events={[]} />)
    expect(container.textContent).toContain('暂无时间安排')
    expect(container.querySelectorAll('.bg-primary\\/10').length).toBe(0)
    expect(container.querySelectorAll('.bg-primary\\/20').length).toBe(0)
  })
})
