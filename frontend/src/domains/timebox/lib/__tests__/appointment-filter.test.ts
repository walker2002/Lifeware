/**
 * @file appointment-filter.test
 * @brief [026.02] T2 — filterAppointments 纯函数 TDD
 *
 * [026.02.2] M-3: 使用 fake timers 锁定「now」为 2026-07-08T12:00:00Z，
 * fixture startTime 改为 Date.now() ± 偏移，避免 hardcoded date 随真实日期漂移。
 * 参照 [026.02] T6/T7/T8 fake timers 模式。
 */

import { describe, it, expect, vi } from 'vitest'
import { filterAppointments } from '../appointment-filter'
import type { AppointmentSummary } from '@/usom/types/summaries'

// 用固定 now 锚定本测试日期语义，避免「2026-07-08」字面量随真实日期推进产生歧义
const NOW = new Date('2026-07-08T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const offsetISO = (deltaMs: number) => new Date(NOW.getTime() + deltaMs).toISOString()

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'appt-' + Math.random(),
  title: '测试约定',
  startTime: offsetISO(-2 * HOUR), // 距 now -2h,落在本月约定筛选 (fixture) 日期范围内
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

const range = (startISO: string, endISO: string) => ({
  start: new Date(startISO),
  end: new Date(endISO),
})

describe('filterAppointments', () => {
  // [026.02.2] M-3: fake timers 锁定系统时间，避免 hardcoded date 漂移
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('空数组返回空数组', () => {
    expect(filterAppointments([], 'all', range(offsetISO(-7 * 24 * HOUR), offsetISO(23 * 24 * HOUR)))).toEqual([])
  })

  it("status='all' 不过滤状态，只过滤日期范围", () => {
    const items = [
      mk({ id: '1', startTime: offsetISO(2 * 24 * HOUR), status: 'scheduled' }),
      mk({ id: '2', startTime: offsetISO(7 * 24 * HOUR), status: 'completed' }),
      mk({ id: '3', startTime: offsetISO(12 * 24 * HOUR), status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'all', range(offsetISO(-7 * 24 * HOUR), offsetISO(23 * 24 * HOUR)))
    expect(r.map(i => i.id)).toEqual(['1', '2', '3'])
  })

  it("status='scheduled' 只保留 scheduled", () => {
    const items = [
      mk({ id: '1', status: 'scheduled' }),
      mk({ id: '2', status: 'completed' }),
      mk({ id: '3', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range(offsetISO(-7 * 24 * HOUR), offsetISO(23 * 24 * HOUR)))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('日期范围闭区间（边界包含）', () => {
    // 测试「边界包含」语义：起点 + 终点 = 包含内，前后越界排除
    const rangeStart = NOW.getTime() - 7 * 24 * HOUR
    const rangeEnd = NOW.getTime() + 23 * 24 * HOUR
    const items = [
      mk({ id: '1', startTime: offsetISO(-7 * 24 * HOUR) }),  // 起点
      mk({ id: '2', startTime: offsetISO(23 * 24 * HOUR) }),  // 终点
      mk({ id: '3', startTime: offsetISO(-7 * 24 * HOUR - 1000) }),  // 之前（边界外）
      mk({ id: '4', startTime: offsetISO(23 * 24 * HOUR + 1000) }),  // 之后（边界外）
    ]
    const r = filterAppointments(items, 'all', range(new Date(rangeStart).toISOString(), new Date(rangeEnd).toISOString()))
    expect(r.map(i => i.id)).toEqual(['1', '2'])
  })

  it('status + range 同时过滤', () => {
    const items = [
      mk({ id: '1', startTime: offsetISO(2 * 24 * HOUR), status: 'scheduled' }),
      mk({ id: '2', startTime: offsetISO(7 * 24 * HOUR), status: 'completed' }),
      mk({ id: '3', startTime: offsetISO(-7 * 24 * HOUR - 1 * HOUR), status: 'scheduled' }),  // 范围外（起点之前）
      mk({ id: '4', startTime: offsetISO(12 * 24 * HOUR), status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range(offsetISO(-7 * 24 * HOUR), offsetISO(23 * 24 * HOUR)))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('不修改原数组', () => {
    const items = [mk({ id: '1', status: 'completed' })]
    const snapshot = JSON.stringify(items)
    filterAppointments(items, 'scheduled', range(offsetISO(-7 * 24 * HOUR), offsetISO(23 * 24 * HOUR)))
    expect(JSON.stringify(items)).toBe(snapshot)
  })
})
