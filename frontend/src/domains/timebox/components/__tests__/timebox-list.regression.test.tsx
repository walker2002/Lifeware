/**
 * @file timebox-list.regression.test
 * @brief [026] T15 P1 CRITICAL IRON RULE 守护 — TimeboxList 纯 timebox-only 输入
 *
 * [026] A3.2 把 TimeboxList 改为接受 `events: TimeboxesEvent[]` 并按 kind 分支。
 * IRON RULE 承诺：纯 kind='timebox' 输入的渲染输出与 T13 改动前字节级一致。
 *
 * 本测试同时使用两种守护手段：
 * - **方案 B（结构断言）**：DOM 必须含 timebox 特有 className / 文本；
 *   **不得**含 appointment 独有 className（`border-l-primary` + MapPin SVG）。
 * - **方案 A（snapshot 锁）**：对当前已通过的渲染输出做 `toMatchSnapshot`，
 *   future 任意回归会自动 fail。
 *
 * [023.12] T8 适配：TimeboxStatus 收窄为 3（planned/logged/cancelled）。
 * sample 改用 planned/logged/cancelled；派生 displayStatus 由 now 决定。
 *
 * 不依赖 T13 改动前的代码（已不存在），以当前实现渲染为 SSOT。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render } from '@testing-library/react'
import { renderWithTz } from '@/contexts/__tests__/test-utils'
import { TimeboxList } from '../timebox-list'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { TimeboxesEvent } from '../timeboxes-event'
import { timeboxToEvent } from '../timeboxes-event'

// 固定"现在"避免 TimeboxCard 的倒计时/timeline 的当前线每次跑都漂，
// snapshot 才能跨运行一致。
const FROZEN_NOW = new Date('2026-07-15T12:00:00.000Z')
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

/** 构造 3 个不同形态的 TimeboxSummary 样本（[023.12] T8 改用 3 状态） */
function makeSamples(): TimeboxesEvent[] {
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
    status: 'planned',
    startTime: '2026-07-15T09:30:00.000Z',
    endTime: '2026-07-15T11:00:00.000Z',
    taskIds: [],
    habitIds: [],
  }
  const s3: TimeboxSummary = {
    id: 'tb-3',
    title: '复盘',
    status: 'logged',
    startTime: '2026-07-15T14:00:00.000Z',
    endTime: '2026-07-15T15:00:00.000Z',
    taskIds: ['t-1'],
    habitIds: ['h-2'],
  }
  return [s1, s2, s3].map(timeboxToEvent)
}

describe('[026] T15 IRON RULE — TimeboxList 纯 timebox 渲染回归', () => {
  it('纯 kind: timebox 输入：渲染 3 个 TimeboxSummary 数据正确', () => {
    const { container } = renderWithTz(<TimeboxList events={makeSamples()} />)
    // 时间盒标题必须出现在 DOM（timebox 路径）
    expect(container.textContent).toContain('晨会')
    expect(container.textContent).toContain('深度工作')
    expect(container.textContent).toContain('复盘')
    // TimeboxCard 内不出现 appointment 标签
    expect(container.textContent).not.toContain('约定已锁定')
  })

  it('纯 kind: timebox 输入：不含 appointment 独有的 border-l-primary + MapPin 标记', () => {
    const { container } = renderWithTz(<TimeboxList events={makeSamples()} />)
    // AppointmentLockedCard 用 `border-l-primary`（TimeboxCard 来自 executionRecord 走 coral/amber/gray/transparent）
    const polluted = container.querySelectorAll('.border-l-primary')
    expect(polluted.length).toBe(0)
    // AppointmentLockedCard 含 MapPin lucide icon（path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"）
    // —— TimeboxCard 不渲染该 SVG
    const mapPins = container.querySelectorAll('svg.lucide-map-pin')
    expect(mapPins.length).toBe(0)
  })

  it('纯 kind: timebox 输入：snapshot 锁（方案 A 防御）', () => {
    const { container } = renderWithTz(<TimeboxList events={makeSamples()} />)
    expect(container).toMatchSnapshot()
  })

  it('空 events 数组：渲染空状态，不分支到 timebox/appointment', () => {
    const { container } = renderWithTz(<TimeboxList events={[]} />)
    expect(container.textContent).toContain('还没有时间盒')
    expect(container.querySelectorAll('.border-l-primary').length).toBe(0)
  })
})
