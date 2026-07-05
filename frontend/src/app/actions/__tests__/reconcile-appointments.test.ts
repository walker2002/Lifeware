/**
 * @file reconcile-itineraries.test.ts
 * @brief reconcileAndAdvanceAppointments server action helper 集成测试（[026] A1.8 TDD）
 *
 * 覆盖 spec A1.8 验收四场景：
 * 1. 没有非终态约定：no-op（advanced=0）
 * 2. scheduled 当日约定 → markInProgressAppointment 落库
 * 3. scheduled 过日约定 → markExpiredAppointment 落库
 * 4. 终态 cancelled 约定：跳过，advanced=0
 *
 * note 1（D6 修复落实点）: helper 内部用 `act.kind`（不是 `action`）判别——避免
 *   short SM action 名误传给 submitDynamicIntent 路由错到 timebox。
 *
 * note 2（T7 已落实 D5）: getAppointmentsByRange 是纯读函数，**不**内联 reconcile。
 *   reconcileAndAdvanceAppointments 供 A3.1 (/itineraries) + A3.2 (/schedule loadDay)
 *   显式调用。
 *
 * note 3（TZ-portable fixtures）: 参考 reconcile-appointment.test.ts 的 TZ 教训——
 *   所有日期用本地正午 12:00:00 无时区后缀，now 用 `new Date(yyyy, m, d, 12, 0, 0)`
 *   构造，保证任意 TZ 下 localDayKey 与日期字面值一致。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as s from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { AppointmentRepository } from '@/domains/timebox/repository/appointment'

const USER = '00000000-0000-0000-0000-000000000001' as any
// today 取本地正午（任意 TZ 下 localDayKey 都是 2026-07-15）
const today = new Date(2026, 6, 15, 12, 0, 0)

describe('reconcileAndAdvanceAppointments', () => {
  beforeEach(async () => { await db.delete(s.appointments).where(eq(s.appointments.userId, USER)) })
  afterEach(() => vi.useRealTimers())

  it('没有非终态约定：no-op', async () => {
    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('scheduled 当日约定 → advanced=1（markInProgress）', async () => {
    // 仅 fake Date（不要 fake setTimeout/Interval——会卡住 Drizzle/pg 连接超时）
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(today)
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save({
      id, status: 'scheduled', title: 't', detail: null,
      // startTime 本地正午 12:00:00 无时区后缀 → 任意 TZ 下 localDayKey=20260715
      startTime: '2026-07-15T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(1)
    expect(result.errors).toBe(0)
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('in_progress')
    expect(got?.inProgressAt).not.toBeNull()
  })

  it('scheduled 过日约定 → advanced=1（markExpired）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(today)
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save({
      id, status: 'scheduled', title: 't', detail: null,
      // startTime 取 7-10 本地正午 → 任意 TZ 下 localDayKey=20260710（< today 20260715）
      startTime: '2026-07-10T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(1)
    expect(result.errors).toBe(0)
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('expired')
    expect(got?.expiredAt).not.toBeNull()
  })

  it('终态 cancelled 约定：跳过，advanced=0', async () => {
    // 终态不进 findNeedingReconcile（只查 status IN non-terminal），所以 helper 无候选
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save({
      id, status: 'cancelled', title: 't', detail: null,
      startTime: '2026-07-10T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null,
      completedAt: '2026-07-14T12:00:00' as any,
      cancelledAt: '2026-07-14T12:00:00' as any,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(0)
    expect(result.errors).toBe(0)
    // 终态 status 不变
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('cancelled')
  })
})
