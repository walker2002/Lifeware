/**
 * @file timebox-timeline.overlap.test
 * @brief [023.03] T2: TimeboxTimeline 集成重叠算法（2/3/5 重叠场景）
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render } from '@testing-library/react'
import { renderWithTz } from '@/contexts/__tests__/test-utils'
import { TimeboxTimeline } from '../timebox-timeline'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { TimeboxesEvent } from '../timeboxes-event'
import { timeboxToEvent } from '../timeboxes-event'
import { TooltipProvider } from '@/components/ui/tooltip'

const FROZEN_NOW = new Date('2026-07-15T17:00:00.000Z')
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

// Radix Tooltip 必须在 TooltipProvider 下使用——app/layout.tsx 全局包裹，
// 测试单独 render 时需要手动套一层。
const renderWithTooltip = (ui: React.ReactElement) =>
  renderWithTz(<TooltipProvider>{ui}</TooltipProvider>)

const tb = (id: string, start: string, end: string): TimeboxesEvent => {
  const s: TimeboxSummary = {
    id, title: id, status: 'planned', startTime: start, endTime: end, taskIds: [], habitIds: [],
  }
  return timeboxToEvent(s)
}

describe('[023.03] T2 — TimeboxTimeline 重叠集成', () => {
  it('2 重叠：两个并排块（width 各占 50%）', () => {
    const events = [
      tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
      tb('b', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
    ]
    const { container } = renderWithTooltip(<TimeboxTimeline events={events} />)
    const blocks = container.querySelectorAll('.absolute.rounded-md')
    expect(blocks.length).toBe(2)
    // 两个块 width 都是 calc(...) * 0.5（=50%）
    blocks.forEach(b => {
      const w = (b as HTMLElement).style.width
      expect(w).toMatch(/0\.5 \*|\* 0\.5$|50%/)
    })
  })

  it('5 重叠（isOvercrowded=true）：每个块 width=100%, left=0', () => {
    const events = ['a','b','c','d','e'].map(id =>
      tb(id, '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
    )
    const { container } = renderWithTooltip(<TimeboxTimeline events={events} />)
    const blocks = container.querySelectorAll('.absolute.rounded-md')
    expect(blocks.length).toBe(5)
    blocks.forEach(b => {
      const w = (b as HTMLElement).style.width
      const l = (b as HTMLElement).style.left
      expect(w).toMatch(/100%/)
      expect(l).toMatch(/calc\(2\.5rem/)
    })
  })

  it('重叠块加 border-error', () => {
    const events = [
      tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
      tb('b', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
    ]
    const { container } = renderWithTooltip(<TimeboxTimeline events={events} />)
    expect(container.querySelectorAll('.border-error').length).toBe(2)
  })
})
