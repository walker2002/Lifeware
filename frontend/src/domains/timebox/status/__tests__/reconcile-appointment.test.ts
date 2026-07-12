/**
 * @file reconcile-appointment.test.ts
 * @brief deriveAppointmentBadges 纯函数单元测试（[023.12] T5 改造：badge 派生）
 *
 * 覆盖 spec D2 reversal 各 branch（现 reads-as-derives）：
 * - 未来 / 当日 / 昨日 三种时态 × 各状态（scheduled / cancelled / completed）
 * - 多条混合场景
 *
 * note 1（[023.12] T5）：原 reconcileAppointmentStatuses 返回 write 行动（[026] D2
 *   reversal），按 [023.12] 3 态收敛决策改为纯函数 deriveAppointmentBadges，断言
 *   派生 badge 而非断言 write side effect。
 *
 * note 2（TZ-portable fixtures）：原 brief 用 UTC 时间串 + 本地时间串混搭，在 CST
 *   等 UTC+ 时区下跨越午夜，导致 "昨日" 误判为 "未来"。修正：所有日期用本地正午
 *   无时区后缀（如 '2026-07-15T12:00:00'），now 用 Date(yyyy, m, d, 12, 0, 0)
 *   构造，保证任意 TZ 下 localDayKey 与日期字面值一致。startTime 取本地正午
 *   → 任意 TZ 下都落在 2026-07-15 本地日。
 *
 * [TZ-2.2] tz 必传：测试默认用 Asia/Shanghai（与 schema default + 系统 TZ 一致）
 */
import { describe, it, expect } from 'vitest'
import {
  deriveAppointmentBadges,
  findExpiredAppointmentIds,
  findInProgressAppointmentIds,
} from '../reconcile-appointment'
import type { Appointment } from '@/usom/types/objects'
import type { AppointmentStatus } from '@/usom/types/primitives'

const base = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'i1',
  status: 'scheduled' as AppointmentStatus,
  title: 't',
  detail: null,
  // startTime 取本地正午（12:00:00 无时区后缀）→ 任意 TZ 下 localDayKey 都是 2026-07-15
  startTime: '2026-07-15T12:00:00',
  durationMin: 60,
  people: [],
  userId: 'u',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  schemaVersion: 1,
  ...overrides,
})

// future: nowDay < startDay（约定还没到）→ badge=null
//   startTime=2026-07-15, now=2026-07-10 → 20260710 < 20260715
const future = new Date(2026, 6, 10, 12, 0, 0)
// today: nowDay === startDay → badge='in_progress'
//   startTime=2026-07-15, now=2026-07-15 → 20260715 === 20260715
const today = new Date(2026, 6, 15, 12, 0, 0)
// yesterday: nowDay > startDay（约定日已过）→ badge='expired'
//   startTime=2026-07-15, now=2026-07-16 → 20260716 > 20260715
const yesterday = new Date(2026, 6, 16, 12, 0, 0)

// [TZ-2.2] tz 必传：测试默认用 Asia/Shanghai（与 schema default + 系统 TZ 一致）
const TZ = 'Asia/Shanghai'

describe('deriveAppointmentBadges（[023.12] T5 改造：badge 派生 + [TZ-2.2] tz 必传）', () => {
  it('未来约定：badge=null', () => {
    expect(deriveAppointmentBadges([base()], future, TZ)).toEqual([
      { appointmentId: 'i1', badge: null },
    ])
  })

  it('当日约定：scheduled → badge=in_progress', () => {
    expect(deriveAppointmentBadges([base()], today, TZ)).toEqual([
      { appointmentId: 'i1', badge: 'in_progress' },
    ])
  })

  it('过日约定：scheduled → badge=expired', () => {
    expect(deriveAppointmentBadges([base()], yesterday, TZ)).toEqual([
      { appointmentId: 'i1', badge: 'expired' },
    ])
  })

  it('cancelled 当日：badge=null（终态不派生）', () => {
    expect(
      deriveAppointmentBadges(
        [base({ status: 'cancelled', cancelledAt: '2026-07-14T12:00:00' })],
        today,
        TZ,
      ),
    ).toEqual([
      { appointmentId: 'i1', badge: null },
    ])
  })

  it('cancelled 过日：badge=null（终态不派生，不回退为 expired）', () => {
    expect(
      deriveAppointmentBadges(
        [base({ status: 'cancelled', cancelledAt: '2026-07-14T12:00:00' })],
        yesterday,
        TZ,
      ),
    ).toEqual([
      { appointmentId: 'i1', badge: null },
    ])
  })

  it('completed 当日：badge=null（终态不派生）', () => {
    expect(
      deriveAppointmentBadges(
        [base({ status: 'completed', completedAt: '2026-07-14T12:00:00' })],
        today,
        TZ,
      ),
    ).toEqual([
      { appointmentId: 'i1', badge: null },
    ])
  })

  it('completed 过日：badge=null（终态不派生）', () => {
    expect(
      deriveAppointmentBadges(
        [base({ status: 'completed', completedAt: '2026-07-14T12:00:00' })],
        yesterday,
        TZ,
      ),
    ).toEqual([
      { appointmentId: 'i1', badge: null },
    ])
  })

  it('多条混合：返回所有 badge 派生', () => {
    const list = [
      base({ id: 'a' }), // scheduled, 当日 → in_progress
      base({ id: 'b', startTime: '2026-07-20T12:00:00' }), // scheduled, 未来 → null
      base({ id: 'c', startTime: '2026-07-10T12:00:00' }), // scheduled, 过日 → expired
      base({ id: 'd', status: 'cancelled', cancelledAt: '2026-07-14T12:00:00' }), // 终态 → null
    ]
    const badges = deriveAppointmentBadges(list, today, TZ)
    expect(badges).toEqual([
      { appointmentId: 'a', badge: 'in_progress' },
      { appointmentId: 'b', badge: null },
      { appointmentId: 'c', badge: 'expired' },
      { appointmentId: 'd', badge: null },
    ])
  })

  // ── helper: findExpiredAppointmentIds ──

  it('findExpiredAppointmentIds：仅返 badge=expired 的 id', () => {
    const list = [
      base({ id: 'a' }),
      base({ id: 'b', startTime: '2026-07-20T12:00:00' }),
      base({ id: 'c', startTime: '2026-07-10T12:00:00' }),
    ]
    expect(findExpiredAppointmentIds(list, today, TZ)).toEqual(['c'])
  })

  it('findExpiredAppointmentIds：空数组（无 expired）', () => {
    expect(findExpiredAppointmentIds([base()], future, TZ)).toEqual([])
  })

  // ── helper: findInProgressAppointmentIds ──

  it('findInProgressAppointmentIds：仅返 badge=in_progress 的 id', () => {
    const list = [
      base({ id: 'a' }),
      base({ id: 'b', startTime: '2026-07-20T12:00:00' }),
      base({ id: 'c', startTime: '2026-07-10T12:00:00' }),
    ]
    expect(findInProgressAppointmentIds(list, today, TZ)).toEqual(['a'])
  })

  it('findInProgressAppointmentIds：空数组（无 in_progress）', () => {
    expect(findInProgressAppointmentIds([base()], future, TZ)).toEqual([])
  })

  it('纯函数性质：相同输入多次调用结果一致', () => {
    const list = [base({ id: 'x', startTime: '2026-07-10T12:00:00' })]
    expect(deriveAppointmentBadges(list, today, TZ)).toEqual(
      deriveAppointmentBadges(list, today, TZ),
    )
  })

  // ── [TZ-2.2] 跨 TZ list batch ──

  it('[TZ-2.2] TZ=Asia/Tokyo：UTC 16:00 startTime（Tokyo 7/13 01:00）+ now Tokyo 7/13 02:00 → batch 跨 TZ 同日判定', () => {
    const list = [
      base({ id: 'tokyo-today', startTime: '2026-07-12T16:00:00.000Z' }), // Tokyo 7/13 01:00
    ]
    const now = new Date('2026-07-12T17:00:00.000Z') // Tokyo 7/13 02:00
    expect(deriveAppointmentBadges(list, now, 'Asia/Tokyo')).toEqual([
      { appointmentId: 'tokyo-today', badge: 'in_progress' },
    ])
  })

  it('[TZ-2.2] TZ=America/New_York：UTC 12:00 startTime（NY 7/12 08:00 EDT）+ now NY 7/12 09:00 → batch 同日判定', () => {
    const list = [
      base({ id: 'ny-today', startTime: '2026-07-12T12:00:00.000Z' }), // NY 7/12 08:00 (EDT)
    ]
    const now = new Date('2026-07-12T13:00:00.000Z') // NY 7/12 09:00
    expect(deriveAppointmentBadges(list, now, 'America/New_York')).toEqual([
      { appointmentId: 'ny-today', badge: 'in_progress' },
    ])
  })

  it('[TZ-2.2] 同一 list + 不同 tz → 不同判定（Tokyo in_progress / NY expired 反例）', () => {
    // startTime UTC 14:00 = Tokyo 7/12 23:00（同日）vs NY 7/12 10:00（EDT 同日）
    //   - Tokyo now=UTC 18:00 (= Tokyo 7/13 03:00) → start 7/12 < now 7/13 → expired
    //   - NY    now=UTC 18:00 (= NY 7/12 14:00 EDT) → start 7/12 = now 7/12 → in_progress
    const list = [base({ id: 'cross', startTime: '2026-07-12T14:00:00.000Z' })]
    const now = new Date('2026-07-12T18:00:00.000Z')
    expect(deriveAppointmentBadges(list, now, 'Asia/Tokyo')).toEqual([
      { appointmentId: 'cross', badge: 'expired' },
    ])
    expect(deriveAppointmentBadges(list, now, 'America/New_York')).toEqual([
      { appointmentId: 'cross', badge: 'in_progress' },
    ])
  })
})