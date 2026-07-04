/**
 * @file overlap-layout.test
 * @brief [023.03] T1: B3 重叠布局算法单测
 *
 * 覆盖：单事件 / 2 重叠 / 3 重叠 / 链式重叠 / 4+ 重叠 / itinerary 不参与。
 */

import { describe, it, expect } from 'vitest'
import { computeOverlapLayout } from '../overlap-layout'
import type { ScheduleEvent } from '../../components/schedule-event'
import type { TimeboxSummary } from '@/usom/types/summaries'

const tb = (id: string, start: string, end: string): ScheduleEvent => ({
  kind: 'timebox',
  id,
  title: id,
  start,
  end,
  status: 'planned',
  source: { id, title: id, startTime: start, endTime: end, status: 'planned', taskIds: [], habitIds: [] } as TimeboxSummary,
})

const itn = (id: string, start: string, end: string): ScheduleEvent => ({
  kind: 'itinerary',
  id,
  title: id,
  start,
  end,
  status: 'scheduled',
  locked: true,
  source: { id, title: id, startTime: start, endTime: end, durationMin: 60, status: 'scheduled', userId: 'u-1' } as any,
})

describe('computeOverlapLayout — 单事件', () => {
  it('单 timebox → col=0, totalCols=1, isOvercrowded=false', () => {
    const ev = tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const result = computeOverlapLayout([ev])
    expect(result).toEqual([{ event: ev, col: 0, totalCols: 1, isOvercrowded: false }])
  })
})

describe('computeOverlapLayout — 多事件重叠', () => {
  it('2 timebox 完全重叠 → col 0/1, totalCols=2, 都不 isOvercrowded', () => {
    const a = tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const b = tb('b', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const result = computeOverlapLayout([a, b])
    expect(result).toHaveLength(2)
    expect(result.find(r => r.event.id === 'a')).toMatchObject({ col: 0, totalCols: 2, isOvercrowded: false })
    expect(result.find(r => r.event.id === 'b')).toMatchObject({ col: 1, totalCols: 2, isOvercrowded: false })
  })

  it('3 timebox 部分重叠链 → totalCols 一致且不 overcrowd', () => {
    const a = tb('a', '2026-07-15T08:00:00Z', '2026-07-15T10:00:00Z')
    const b = tb('b', '2026-07-15T09:00:00Z', '2026-07-15T10:30:00Z')
    const c = tb('c', '2026-07-15T08:30:00Z', '2026-07-15T09:30:00Z')
    const result = computeOverlapLayout([a, b, c])
    // 所有事件的 totalCols 必须一致（共享同一个重叠聚类）
    const totalColsValues = new Set(result.map(r => r.totalCols))
    expect(totalColsValues.size).toBe(1)
    expect(result.every(r => r.isOvercrowded === false)).toBe(true)
  })

  it('链式邻接（A 8-9 / B 9-10 / C 10-11）→ 各自 totalCols=1（无重叠）', () => {
    const a = tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const b = tb('b', '2026-07-15T09:00:00Z', '2026-07-15T10:00:00Z')
    const c = tb('c', '2026-07-15T10:00:00Z', '2026-07-15T11:00:00Z')
    const result = computeOverlapLayout([a, b, c])
    expect(result.every(r => r.totalCols === 1)).toBe(true)
    expect(result.every(r => r.col === 0)).toBe(true)
  })

  it('5 timebox 完全重叠 → isOvercrowded=true', () => {
    const events = ['a','b','c','d','e'].map(id =>
      tb(id, '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z'),
    )
    const result = computeOverlapLayout(events)
    expect(result.every(r => r.totalCols === 5)).toBe(true)
    expect(result.every(r => r.isOvercrowded === true)).toBe(true)
  })
})

describe('computeOverlapLayout — itinerary 不参与', () => {
  it('itinerary 与 timebox 同时存在 → itinerary 输出 col=0,totalCols=1', () => {
    const ev = tb('t', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const iv = itn('i', '2026-07-15T08:30:00Z', '2026-07-15T09:30:00Z')
    const result = computeOverlapLayout([ev, iv])
    const ivr = result.find(r => r.event.id === 'i')
    expect(ivr).toMatchObject({ col: 0, totalCols: 1, isOvercrowded: false })
  })
})

describe('computeOverlapLayout — IRON RULE', () => {
  it('单 timebox 输入（无重叠）→ 退化为 col=0, totalCols=1, isOvercrowded=false', () => {
    // 与现 timeline 行为对齐：width=100%, left=0
    const ev = tb('a', '2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')
    const result = computeOverlapLayout([ev])
    expect(result[0]).toEqual({ event: ev, col: 0, totalCols: 1, isOvercrowded: false })
  })
})