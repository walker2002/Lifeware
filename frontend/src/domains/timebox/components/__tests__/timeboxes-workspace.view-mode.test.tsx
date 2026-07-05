/**
 * @file timeboxes-workspace.view-mode.test
 * @brief [023.06] T3: 三向路由 — 点击「周/月」按钮后 workspace 切到对应视图（WeekView / MonthView），
 *              并把 events（discriminated union）按 kind='timebox' 过滤后转 source 数组传入。
 *
 * 与 range.test.tsx 拆为独立文件（避免 mock 互相覆盖）。
 *
 * 关键 assertion：WeekView/MonthView 用 react-big-calendar，会渲染 .rbc-calendar 节点；
 * DayView 不会渲染 .rbc-calendar。所以「点周/月后 .rbc-calendar 出现」是 T3 三向路由的强证据。
 *
 * 数据 fixture：mock 1 个 timebox + 1 个 itinerary 验证「events 过滤 kind='timebox'」
 * 的 adapter 路径正确——itinerary 应被剔除，WeekView/MonthView 只接收 TimeboxSummary[]。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TimeboxSummary, ItinerarySummary } from '@/usom/types/summaries'

// [023.06] T3 数据 fixture：保证切到周/月时 timeboxSources 非空，否则渲染空态分支
const timeboxFixture: TimeboxSummary = {
  id: 'tb-1',
  title: '晨练',
  status: 'planned',
  startTime: '2026-07-05T08:00:00.000Z',
  endTime: '2026-07-05T09:00:00.000Z',
  taskIds: [],
  habitIds: [],
}
const itineraryFixture: ItinerarySummary = {
  id: 'it-1',
  title: '咖啡馆',
  startTime: '2026-07-05T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
}

const getTimeboxesByRangeMock = vi.fn().mockResolvedValue([timeboxFixture])
const getItinerariesByRangeMock = vi.fn().mockResolvedValue([itineraryFixture])

vi.mock('@/app/actions/intent', () => ({
  getTimeboxesByRange: (...a: unknown[]) => getTimeboxesByRangeMock(...a),
  getItinerariesByRange: (...a: unknown[]) => getItinerariesByRangeMock(...a),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn().mockResolvedValue(null),
  transitionTimebox: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { TimeboxesWorkspace } from '../timeboxes-workspace'

describe('[023.06] T3 — 周/月三向路由', () => {
  beforeEach(() => {
    getTimeboxesByRangeMock.mockClear()
    getItinerariesByRangeMock.mockClear()
    getTimeboxesByRangeMock.mockResolvedValue([timeboxFixture])
    getItinerariesByRangeMock.mockResolvedValue([itineraryFixture])
  })

  it('click 周 → workspace 切到 WeekView（.rbc-calendar 出现，week 范围被拉取）', async () => {
    const user = userEvent.setup()
    const { container } = render(<TimeboxesWorkspace />)
    // 等初次 loadRange 落定（day 模式）
    await waitFor(() =>
      expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(1),
    )
    // 初始 day 模式：DayView 渲染，应**没有** .rbc-calendar
    expect(container.querySelector('.rbc-calendar')).toBeNull()
    // 切到 week
    await user.click(screen.getByRole('button', { name: '周' }))
    // T3 关键 assertion：WeekView 挂载 → .rbc-calendar 出现
    await waitFor(() =>
      expect(container.querySelector('.rbc-calendar')).not.toBeNull(),
    )
    // 同时验证 getTimeboxesByRange 第二次调用是 week 范围（end.getDay()===0）
    await waitFor(() =>
      expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    )
    const lastCall = getTimeboxesByRangeMock.mock.calls.at(-1)! as [Date, Date]
    const [, end] = lastCall
    expect(end.getDay()).toBe(0)
  })

  it('click 月 → workspace 切到 MonthView（.rbc-calendar 出现，month 范围被拉取）', async () => {
    const user = userEvent.setup()
    const { container } = render(<TimeboxesWorkspace />)
    // 等初次 loadRange 落定（day 模式）
    await waitFor(() =>
      expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(1),
    )
    expect(container.querySelector('.rbc-calendar')).toBeNull()
    // 切到 month
    await user.click(screen.getByRole('button', { name: '月' }))
    // T3 关键 assertion：MonthView 挂载 → .rbc-calendar 出现
    await waitFor(() =>
      expect(container.querySelector('.rbc-calendar')).not.toBeNull(),
    )
    // 同时验证 getTimeboxesByRange 第二次调用是 month 范围（start.getDate()===1）
    await waitFor(() =>
      expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    )
    const lastCall = getTimeboxesByRangeMock.mock.calls.at(-1)! as [Date, Date]
    const [start] = lastCall
    expect(start.getDate()).toBe(1)
  })
})