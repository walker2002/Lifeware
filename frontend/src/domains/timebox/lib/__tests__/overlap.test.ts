/**
 * @file overlap.test
 * @brief [023.04] T0 assertNoInternalOverlap 纯函数单测
 *
 * 覆盖空数组/单条/多条两两不重叠/两条完全重叠/边界相切 end==start 不重叠/跨日不算同日。
 */

import { describe, it, expect } from 'vitest'
import { assertNoInternalOverlap, type OverlapItem } from '../overlap'

const day = (h: number, m = 0) => `2026-07-04T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`
const dayStart = '2026-07-04T00:00:00+08:00'
const dayEnd = '2026-07-05T00:00:00+08:00'

describe('[023.04] assertNoInternalOverlap', () => {
  it('空数组 → hasOverlap=false', () => {
    expect(assertNoInternalOverlap([], dayStart, dayEnd)).toEqual({ hasOverlap: false, conflictTitles: [] })
  })

  it('单条 → hasOverlap=false', () => {
    const items: OverlapItem[] = [{ title: 'A', startTime: day(9), endTime: day(10) }]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('两条完全不重叠 → hasOverlap=false', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(10) },
      { title: 'B', startTime: day(11), endTime: day(12) },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('两条完全重叠 → hasOverlap=true + conflictTitles 含双方', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(11) },
      { title: 'B', startTime: day(10), endTime: day(12) },
    ]
    const r = assertNoInternalOverlap(items, dayStart, dayEnd)
    expect(r.hasOverlap).toBe(true)
    expect(r.conflictTitles).toContain('A')
    expect(r.conflictTitles).toContain('B')
  })

  it('边界相切 end==start → 不算重叠（半开区间）', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(10) },
      { title: 'B', startTime: day(10), endTime: day(11) },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('跨日不算同日重叠', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: '2026-07-04T23:00:00+08:00', endTime: '2026-07-05T01:00:00+08:00' },
      { title: 'B', startTime: '2026-07-05T09:00:00+08:00', endTime: '2026-07-05T10:00:00+08:00' },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })
})