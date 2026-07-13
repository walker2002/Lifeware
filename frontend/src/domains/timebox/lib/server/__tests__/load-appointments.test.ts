/**
 * @file load-appointments.test
 * @brief lib/server/load-appointments 直接单测（不依赖真实 PG/Server Action 网络）
 *
 * 覆盖契约：
 *  - loadAppointmentsForPage() 调用 getAppointmentPageWindow() 取 start/end
 *  - 把 start/end 透传给 getAppointmentsByRange
 *  - 返回值直传
 *  - getAppointmentsByRange 抛错时，错误正常向上传
 */
import { describe, it, expect, vi } from 'vitest'

const FIXED_START = '2026-01-01T00:00:00.000Z'
const FIXED_END = '2026-04-01T00:00:00.000Z'

// vi.mock factory 会被 hoist——所有外部变量（含 getAppointmentsByRange）必须 vi.hoisted
const { getAppointmentsByRange, getAppointmentPageWindowMock } = vi.hoisted(() => {
  const getAppointmentsByRangeFn = vi.fn()
  const getAppointmentPageWindowMockFn = vi.fn(() => ({ start: '2026-01-01T00:00:00.000Z', end: '2026-04-01T00:00:00.000Z' }))
  return { getAppointmentsByRange: getAppointmentsByRangeFn, getAppointmentPageWindowMock: getAppointmentPageWindowMockFn }
})

vi.mock('@/domains/timebox/lib/appointment-window', () => ({
  getAppointmentPageWindow: getAppointmentPageWindowMock,
}))

vi.mock('@/app/actions/intent', () => ({
  getAppointmentsByRange: (...args: unknown[]) => getAppointmentsByRange(...args),
}))

import { loadAppointmentsForPage } from '../load-appointments'
import type { AppointmentSummary } from '@/usom/types/summaries'

describe('loadAppointmentsForPage', () => {
  it('调用 getAppointmentPageWindow 取窗口，并把 start/end 透传给 getAppointmentsByRange', async () => {
    const fixedList: AppointmentSummary[] = [
      {
        id: 'a-1',
        title: '晨会',
        startTime: '2026-02-10T08:00:00.000Z',
        endTime: '2026-02-10T08:30:00.000Z',
        activityArchetypeId: null,
      } as unknown as AppointmentSummary,
    ]
    getAppointmentsByRange.mockResolvedValueOnce(fixedList)

    const out = await loadAppointmentsForPage()

    expect(vi.mocked(getAppointmentPageWindowMock)).toHaveBeenCalledTimes(1)
    expect(getAppointmentsByRange).toHaveBeenCalledTimes(1)
    expect(getAppointmentsByRange).toHaveBeenCalledWith(FIXED_START, FIXED_END)
    expect(out).toBe(fixedList)
  })

  it('返回值直接透传：返回的 list 应等于 getAppointmentsByRange 的 resolved value', async () => {
    const expected: AppointmentSummary[] = []
    getAppointmentsByRange.mockResolvedValueOnce(expected)
    const out = await loadAppointmentsForPage()
    expect(out).toBe(expected)
  })

  it('getAppointmentsByRange 抛错时错误向上传播', async () => {
    getAppointmentsByRange.mockRejectedValueOnce(new Error('boom'))
    await expect(loadAppointmentsForPage()).rejects.toThrow('boom')
  })
})
