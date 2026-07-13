/**
 * @file appointment-window.test
 * @brief ±90 天查询窗口纯函数测试
 */
import { describe, it, expect } from 'vitest'
import {
  getAppointmentPageWindow,
  APPOINTMENT_PAGE_WINDOW_DAYS,
} from '../appointment-window'

describe('getAppointmentPageWindow', () => {
  it('返回 ±90 天窗口，start/end 与基准差恰好 90 天', () => {
    const now = new Date('2026-07-13T12:00:00.000Z')
    const { start, end } = getAppointmentPageWindow(now)
    const dayMs = 24 * 60 * 60 * 1000
    const nowMs = now.getTime()
    expect(new Date(start).getTime()).toBe(nowMs - APPOINTMENT_PAGE_WINDOW_DAYS * dayMs)
    expect(new Date(end).getTime()).toBe(nowMs + APPOINTMENT_PAGE_WINDOW_DAYS * dayMs)
  })

  it('返回值为合法 ISO 字符串（可被 new Date 解析）', () => {
    const { start, end } = getAppointmentPageWindow(new Date('2026-01-01T00:00:00.000Z'))
    expect(new Date(start).getTime()).not.toBeNaN()
    expect(new Date(end).getTime()).not.toBeNaN()
  })
})
