/**
 * @file reconcile-itineraries-partial-failure.test.ts
 * @brief reconcileAndAdvanceAppointments partial-failure 测试增强（[026] T18 A1.8 增强）
 *
 * 在 T8 落地的 `reconcile-itineraries.test.ts`（4 case）基础上加 2 case：
 * - case 5 混合批次：3 候选 + 第二个 mock 抛错 → advanced=2, errors=1
 * - case 6 全部失败：N=2 候选全 mock 抛错 → advanced=0, errors=2 + helper 不抛
 *
 * 为什么单开一个测试文件：
 * - 既有 4 case 跑真实 PG + 真实 service.execute 路径（不 mock 任何东西）。
 * - partial-failure case 需要在 file-level `vi.mock` 替掉
 *   `@/app/actions/timebox/mutation-service` 的 `createAppointmentMutationService`
 *   工厂（让 service.execute 在受控次序上选择性抛错）。
 * - `vi.mock` 在 vitest 是 file-scoped、hoist 到顶部——同文件混用会让既有 4 case
 *   的 `service.execute` 也被替成 mock fn，破坏真实路径断言。
 * - 拆文件后两批 case 互不污染，且 partial-failure 这批用真 PG 落 itineraries
 *   作为 findNeedingReconcile 候选（与既有 4 case 同样的 repo.save 模式），
 *   只把 service.execute 这一步换成 mock——观测的是 helper 自身的 catch 兜底
 *   行为，而不是真实 SM/DB 路径。
 *
 * TZ-portable fixtures：参考 reconcile-itineraries.test.ts 的 TZ 教训——
 *   所有日期用本地正午 12:00:00 无时区后缀，now 用 `new Date(yyyy, m, d, 12, 0, 0)`
 *   构造，保证任意 TZ 下 localDayKey 与日期字面值一致。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as s from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { AppointmentRepository } from '@/domains/timebox/repository/appointment'

// ─── vi.mock：file-level，hoist 到顶部 ───────────────────────────
//
// helper 内部 import 的是 `@/app/actions/timebox/mutation-service` 的命名导出
// `createAppointmentMutationService`。在文件顶层 vi.mock 此模块、注入受控 execute
// （按调用次序选择性抛错）——实现"helper catch 兜底不阻断整批"的精准观测。
//
// `vi.mocked` 在 import 之后做 typed accessor；mockExecute 是 service.execute 的
// mock 实例，按测试需要在 beforeEach 里 mockReset + 配次序消费（mockResolvedValueOnce
// / mockRejectedValueOnce）。
const mockExecute = vi.fn()
vi.mock('@/app/actions/timebox/mutation-service', () => ({
  createAppointmentMutationService: () => ({
    execute: (...args: unknown[]) => mockExecute(...args),
  }),
  createTimeboxMutationService: () => ({
    execute: vi.fn(),
  }),
}))

const USER = '00000000-0000-0000-0000-000000000001' as any
// today 取本地正午（任意 TZ 下 localDayKey 都是 2026-07-15）
const today = new Date(2026, 6, 15, 12, 0, 0)

describe('reconcileAndAdvanceAppointments partial-failure（T18 增强）', () => {
  beforeEach(async () => {
    await db.delete(s.appointments).where(eq(s.appointments.userId, USER))
    mockExecute.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  /**
   * 混合批次：3 个候选（2 个 scheduled 当日 + 1 个 scheduled 过日）。
   * mock service.execute 在第 2 次调用时抛错（其余成功）——
   * 期望：result = { advanced: 2, errors: 1 }，且未抛异常（catch 兜底）。
   * 守 helper 的"单条抛错不阻断整批"。
   */
  it('混合批次 partial-failure：3 候选 + 第二个抛错 → advanced=2 errors=1', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(today)
    const repo = new AppointmentRepository()
    // 候选 1：scheduled 当日 → act.kind='needsMarkInProgress' → 期望 markInProgress
    const id1 = crypto.randomUUID() as any
    await repo.save({
      id: id1, status: 'scheduled', title: 't1', detail: null,
      startTime: '2026-07-15T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    // 候选 2：scheduled 过日 → act.kind='needsMarkExpired' → 期望 markExpired
    const id2 = crypto.randomUUID() as any
    await repo.save({
      id: id2, status: 'scheduled', title: 't2', detail: null,
      startTime: '2026-07-10T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    // 候选 3：scheduled 当日 → act.kind='needsMarkInProgress' → 期望 markInProgress
    const id3 = crypto.randomUUID() as any
    await repo.save({
      id: id3, status: 'scheduled', title: 't3', detail: null,
      startTime: '2026-07-15T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)

    // mock execute 行为：第 1 次成功、第 2 次抛错、第 3 次成功
    // mockResolvedValueOnce 配 mockRejectedValueOnce 按次序消费
    mockExecute
      .mockResolvedValueOnce({ success: true, object: { id: id1 } })
      .mockRejectedValueOnce(new Error('mock: SM transition failed for id2'))
      .mockResolvedValueOnce({ success: true, object: { id: id3 } })

    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    // helper 不应抛（catch 兜底）
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(2)
    expect(result.errors).toBe(1)
    // service.execute 被调 3 次（第 2 次抛错被 catch 吞掉，循环继续到第 3 次）
    expect(mockExecute).toHaveBeenCalledTimes(3)
  })

  /**
   * 全部失败：N=2 candidates（都 mock 抛错）→ 期望 result = { advanced: 0, errors: 2 }
   * + helper 不抛（catch 兜底全部）。
   * 守 helper 的"整批全失败也不抛"——调用方（A3.1 /itineraries 等）能正常收到
   * result 对象，page 不会因 reconcile 失败而 500。
   */
  it('全部失败：N=2 candidates 全 mock 抛错 → advanced=0 errors=2 + helper 不抛', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(today)
    const repo = new AppointmentRepository()
    // 候选 1：scheduled 当日
    const id1 = crypto.randomUUID() as any
    await repo.save({
      id: id1, status: 'scheduled', title: 't1', detail: null,
      startTime: '2026-07-15T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)
    // 候选 2：scheduled 过日
    const id2 = crypto.randomUUID() as any
    await repo.save({
      id: id2, status: 'scheduled', title: 't2', detail: null,
      startTime: '2026-07-10T12:00:00', durationMin: 60, people: [], userId: USER,
      inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 1,
    }, USER)

    // mock execute 行为：两次都抛错
    mockExecute
      .mockRejectedValueOnce(new Error('mock: SM transition failed for id1'))
      .mockRejectedValueOnce(new Error('mock: SM transition failed for id2'))

    const { reconcileAndAdvanceAppointments } = await import('../reconcile-appointments')
    // helper 不应抛（catch 兜底全部）
    const result = await reconcileAndAdvanceAppointments(USER as any)
    expect(result.advanced).toBe(0)
    expect(result.errors).toBe(2)
    // service.execute 被调 2 次（两次都被 catch 兜底）
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })
})
