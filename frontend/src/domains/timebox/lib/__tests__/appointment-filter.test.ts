/**
 * @file appointment-filter.test
 * @brief [026.02] T2 — filterAppointments 纯函数 TDD
 */

import { describe, it, expect } from 'vitest'
import { filterAppointments } from '../appointment-filter'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'appt-' + Math.random(),
  title: '测试约定',
  startTime: '2026-07-08T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

const range = (startISO: string, endISO: string) => ({
  start: new Date(startISO),
  end: new Date(endISO),
})

describe('filterAppointments', () => {
  it('空数组返回空数组', () => {
    expect(filterAppointments([], 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))).toEqual([])
  })

  it("status='all' 不过滤状态，只过滤日期范围", () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-10T10:00:00Z', status: 'scheduled' }),
      mk({ id: '2', startTime: '2026-07-15T10:00:00Z', status: 'completed' }),
      mk({ id: '3', startTime: '2026-07-20T10:00:00Z', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1', '2', '3'])
  })

  it("status='scheduled' 只保留 scheduled", () => {
    const items = [
      mk({ id: '1', status: 'scheduled' }),
      mk({ id: '2', status: 'completed' }),
      mk({ id: '3', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('日期范围闭区间（边界包含）', () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-01T00:00:00Z' }),  // 起点
      mk({ id: '2', startTime: '2026-07-31T23:59:59Z' }),  // 终点
      mk({ id: '3', startTime: '2026-06-30T23:59:59Z' }),  // 之前
      mk({ id: '4', startTime: '2026-08-01T00:00:00Z' }),  // 之后
    ]
    const r = filterAppointments(items, 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1', '2'])
  })

  it('status + range 同时过滤', () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-10T10:00:00Z', status: 'scheduled' }),
      mk({ id: '2', startTime: '2026-07-15T10:00:00Z', status: 'completed' }),
      mk({ id: '3', startTime: '2026-06-30T10:00:00Z', status: 'scheduled' }),  // 范围外
      mk({ id: '4', startTime: '2026-07-20T10:00:00Z', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('不修改原数组', () => {
    const items = [mk({ id: '1', status: 'completed' })]
    const snapshot = JSON.stringify(items)
    filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(JSON.stringify(items)).toBe(snapshot)
  })
})
