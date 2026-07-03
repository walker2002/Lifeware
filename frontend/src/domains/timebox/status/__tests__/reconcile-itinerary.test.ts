/**
 * @file reconcile-itinerary.test.ts
 * @brief reconcileItineraryStatuses 纯函数单元测试（[026] A1.3 TDD）
 *
 * 覆盖 spec D2 reversal 各 branch：
 * - 未来 / 当日 / 昨日 三种时态 × 各状态（scheduled / in_progress / 终态三态）
 * - 多条混合场景
 *
 * note 1（brief 修订）: brief Step 1 原始期望用 action: 'markInProgress'，按 codex D6
 *   修复统一为 kind: 'needsMarkInProgress' / 'needsMarkExpired'，前缀 'needs' 强调
 *   "需要做"而非"动作本身"。
 *
 * note 2（TZ-portable fixtures）: 原 brief 用 UTC 时间串 + 本地时间串混搭，在 CST
 *   等 UTC+ 时区下跨越午夜，导致 "昨日" 误判为 "未来"。修正：所有日期用本地正午
 *   无时区后缀（如 '2026-07-15T12:00:00'），now 用 Date(yyyy, m, d, 12, 0, 0)
 *   构造，保证任意 TZ 下 localDayKey 与日期字面值一致。startTime 取本地正午
 *   → 任意 TZ 下都落在 2026-07-15 本地日。
 */
import { describe, it, expect } from 'vitest'
import { reconcileItineraryStatuses } from '../reconcile-itinerary'
import type { Itinerary } from '@/usom/types/objects'
import type { ItineraryStatus } from '@/usom/types/primitives'

const base = (overrides: Partial<Itinerary> = {}): Itinerary => ({
  id: 'i1',
  status: 'scheduled' as ItineraryStatus,
  title: 't',
  detail: null,
  // startTime 取本地正午（12:00:00 无时区后缀）→ 任意 TZ 下 localDayKey 都是 2026-07-15
  startTime: '2026-07-15T12:00:00',
  durationMin: 60,
  people: [],
  userId: 'u',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  inProgressAt: null,
  expiredAt: null,
  completedAt: null,
  cancelledAt: null,
  schemaVersion: 1,
  ...overrides,
})

// future: nowDay < startDay（行程还没到）→ 跳过
//   startTime=2026-07-15, now=2026-07-10 → 20260710 < 20260715
const future = new Date(2026, 6, 10, 12, 0, 0)
// today: nowDay === startDay → scheduled → needsMarkInProgress
//   startTime=2026-07-15, now=2026-07-15 → 20260715 === 20260715
const today = new Date(2026, 6, 15, 12, 0, 0)
// yesterday: nowDay > startDay（行程日已过）→ needsMarkExpired
//   startTime=2026-07-15, now=2026-07-16 → 20260716 > 20260715
const yesterday = new Date(2026, 6, 16, 12, 0, 0)

describe('reconcileItineraryStatuses', () => {
  it('未来行程：status=scheduled 不变，返回 []', () => {
    expect(reconcileItineraryStatuses([base()], future)).toEqual([])
  })

  it('当日行程：scheduled → needsMarkInProgress', () => {
    const actions = reconcileItineraryStatuses([base()], today)
    expect(actions).toEqual([
      { itineraryId: 'i1', kind: 'needsMarkInProgress', at: today },
    ])
  })

  it('过日行程：scheduled → needsMarkExpired', () => {
    const actions = reconcileItineraryStatuses([base()], yesterday)
    expect(actions).toEqual([
      { itineraryId: 'i1', kind: 'needsMarkExpired', at: yesterday },
    ])
  })

  it('in_progress 当日：不变（仍 in_progress 范围内）', () => {
    const actions = reconcileItineraryStatuses(
      [base({ status: 'in_progress' })],
      today,
    )
    expect(actions).toEqual([])
  })

  it('in_progress 过日 → needsMarkExpired', () => {
    const actions = reconcileItineraryStatuses(
      [base({ status: 'in_progress' })],
      yesterday,
    )
    expect(actions).toEqual([
      { itineraryId: 'i1', kind: 'needsMarkExpired', at: yesterday },
    ])
  })

  it('终态 cancelled：跳过，不返回', () => {
    expect(
      reconcileItineraryStatuses(
        [base({ status: 'cancelled', cancelledAt: '2026-07-14T12:00:00' })],
        yesterday,
      ),
    ).toEqual([])
  })

  it('终态 expired：跳过，不返回', () => {
    expect(
      reconcileItineraryStatuses(
        [base({ status: 'expired', expiredAt: '2026-07-14T12:00:00' })],
        yesterday,
      ),
    ).toEqual([])
  })

  it('终态 completed：跳过，不返回', () => {
    expect(
      reconcileItineraryStatuses(
        [base({ status: 'completed', completedAt: '2026-07-14T12:00:00' })],
        yesterday,
      ),
    ).toEqual([])
  })

  it('多条混合：返回所有需要推进的 transition', () => {
    const list = [
      base({ id: 'a' }), // scheduled, 当日 → needsMarkInProgress
      base({ id: 'b', startTime: '2026-07-20T12:00:00' }), // scheduled, 未来 → 跳过
      base({ id: 'c', startTime: '2026-07-10T12:00:00' }), // scheduled, 过日 → needsMarkExpired
    ]
    // now=today (2026-07-15): a=当日, b=未来(20260720>20260715), c=过日(20260710<20260715)
    const actions = reconcileItineraryStatuses(list, today)
    expect(actions).toEqual([
      { itineraryId: 'a', kind: 'needsMarkInProgress', at: today },
      { itineraryId: 'c', kind: 'needsMarkExpired', at: today },
    ])
  })
})