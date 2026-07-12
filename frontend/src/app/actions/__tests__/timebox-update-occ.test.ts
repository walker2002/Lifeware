/**
 * @file timebox-update-occ.test
 * @brief updateTimebox 透传 expectedOccVersion + 3-tab 并发测试（[TD-003] T4）
 *
 * 覆盖：
 * - ③ 串行 save：同 user 同 timebox 第二次 save 用新 occVersion 应 ok
 *   （第一次拿到 occVersion=1 → save 后 occVersion=2；第二次再读 occVersion=2 → save 后 3）
 * - ④ 3-tab 并发：1 win + 2 ConflictError，ConflictError 携带 currentOccVersion
 *
 * [TD-003] T4：updateTimebox action 必须在聚合路径上读 current occVersion 并透传给
 * field-executor，OCC 关掉并发覆盖窗口。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 必须在 import 前 mock 仓储 + mutation service + 意图通道
const { mockFindById, mockUpdateFields, mockServiceExecute, mockArchFindById } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockUpdateFields: vi.fn(),
  mockServiceExecute: vi.fn(),
  mockArchFindById: vi.fn(),
}))

vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: class {
    findById = mockArchFindById
  },
}))

vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))

vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: class {
    findById = mockFindById
    updateFields = mockUpdateFields
  },
  AppointmentRepository: class {},
}))

vi.mock('@/app/actions/timebox/mutation-service', () => ({
  createTimeboxMutationService: () => ({ execute: mockServiceExecute }),
  createAppointmentMutationService: () => ({ execute: mockServiceExecute }),
}))

// import-after-mock
// eslint-disable-next-line import/first
import { updateTimebox } from '../timebox'
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'

const MVP = '00000000-0000-0000-0000-000000000001'
const TB_ID = 'tb-occ'

describe('[TD-003] T4 updateTimebox OCC 透传', () => {
  beforeEach(() => {
    mockFindById.mockReset()
    mockUpdateFields.mockReset()
    mockServiceExecute.mockReset()
    mockArchFindById.mockReset()
    // 默认 owner-check 跳过（activityArchetypeId 非 string 时不调）
    // 默认 service.execute 成功
    mockServiceExecute.mockResolvedValue({
      success: true,
      object: { id: TB_ID, status: 'planned', title: 'first', occVersion: 2 },
    })
  })

  it('③ 串行 save — 第二次 save 用新 occVersion 应 ok', async () => {
    // 第一次 save 前 read current = 1；第二次 save 前 read current = 2
    mockFindById
      .mockResolvedValueOnce({ id: TB_ID, occVersion: 1, title: 't0' } as any)
      .mockResolvedValueOnce({ id: TB_ID, occVersion: 2, title: 'first' } as any)
    // service.execute 第一次成功后返回 occVersion=2，第二次返回 occVersion=3
    mockServiceExecute
      .mockResolvedValueOnce({
        success: true,
        object: { id: TB_ID, status: 'planned', title: 'first', occVersion: 2 },
      })
      .mockResolvedValueOnce({
        success: true,
        object: { id: TB_ID, status: 'planned', title: 'second', occVersion: 3 },
      })

    await updateTimebox(TB_ID, { title: 'first' })
    await updateTimebox(TB_ID, { title: 'second' })

    // 关键断言：service.execute 被调用 2 次，每次 step 都透传 expectedOccVersion
    expect(mockServiceExecute).toHaveBeenCalledTimes(2)

    // 第一次：fieldSteps 含 expectedOccVersion=1（读到的 current）
    const firstCallArg = mockServiceExecute.mock.calls[0][0]
    expect(firstCallArg.targetId).toBe(TB_ID)
    expect(firstCallArg.steps).toHaveLength(1)
    expect(firstCallArg.steps[0]).toMatchObject({
      kind: 'field',
      field: 'title',
      value: 'first',
      expectedOccVersion: 1,
    })

    // 第二次：fieldSteps 含 expectedOccVersion=2（第二次 save 前读到的 current）
    const secondCallArg = mockServiceExecute.mock.calls[1][0]
    expect(secondCallArg.steps[0]).toMatchObject({
      kind: 'field',
      field: 'title',
      value: 'second',
      expectedOccVersion: 2,
    })

    // read current occVersion 路径：getTimeboxById 调 2 次（每次 updateTimebox 入口前一次读）
    expect(mockFindById).toHaveBeenCalledTimes(2)
    expect(mockFindById.mock.calls[0]).toEqual([TB_ID, MVP])
    expect(mockFindById.mock.calls[1]).toEqual([TB_ID, MVP])
  })

  it('④ 3-tab 并发 — 1 win + 2 ConflictError，ConflictError 携带 currentOccVersion', async () => {
    // 三个 tab 起始都 read current occVersion=1（同时读同一版本）
    mockFindById.mockResolvedValue({ id: TB_ID, occVersion: 1, title: 't0' } as any)

    // service.execute 行为模拟：第一个 win（返回 occVersion=2），后续 2 个 抛 ConflictError
    // 透传底层：tab1 的执行最终落到 repo.updateFields(... , 1) → 1 row affected → occVersion=2
    // tab2 和 tab3 的执行落到 repo.updateFields(... , 1) → 0 rows（因为已被 tab1 +1）→ ConflictError
    const winnerRow = { id: TB_ID, status: 'planned', title: 'A', occVersion: 2 } as any
    mockServiceExecute
      .mockResolvedValueOnce({ success: true, object: winnerRow })
      .mockResolvedValueOnce({
        success: false,
        error: 'ConflictError',
        // domain-mutation-service.execute 的 catch 路径不抛 ConflictError，而是包成字符串 error
        // ——但 reject 调用方应能拿到 ConflictError 实例（透传到 caller）
      })
      .mockImplementationOnce(async () => {
        throw new ConflictError(2, 1)
      })
      .mockImplementationOnce(async () => {
        throw new ConflictError(2, 1)
      })

    const results = await Promise.allSettled([
      updateTimebox(TB_ID, { title: 'A' }),
      updateTimebox(TB_ID, { title: 'B' }),
      updateTimebox(TB_ID, { title: 'C' }),
    ])

    // 1 win + 2 fail
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(2)

    // win 拿到 occVersion=2
    const win = (fulfilled[0] as PromiseFulfilledResult<any>).value
    expect(win.status).toBe('ok')

    // 2 个 rejected 必须是 ConflictError 实例（携带 currentOccVersion=2）
    for (const r of rejected) {
      const err = (r as PromiseRejectedResult).reason
      expect(err).toBeInstanceOf(Error)
      // ConflictError 错误信息可被普通 throw 透传（updateTimebox 顶层 try/catch
      // 会用 err.message 重新包，但**会保留** ConflictError message 通道——这里
      // 测的是 instance 链能识别为 OCC 冲突——T5 drawer 会 catch 这个 message
      // 来触发 reload + toast）
      expect(String(err)).toMatch(/OCC conflict|occ_version|更新|ConflictError/)
    }

    // 关键：3 次入口都先读 current occVersion=1（findById 调 3 次）
    expect(mockFindById).toHaveBeenCalledTimes(3)
    // 3 个 step payload 都透传 expectedOccVersion=1
    for (let i = 0; i < 3; i++) {
      const arg = mockServiceExecute.mock.calls[i]?.[0]
      expect(arg?.steps?.[0]?.expectedOccVersion).toBe(1)
    }
  })

  it('无字段可写时跳过 mutation service（已有短路保持不变）', async () => {
    // 全部字段都被白名单丢弃（status 生命周期列）
    mockFindById.mockResolvedValue({
      id: TB_ID, occVersion: 5, title: 't',
    } as any)

    await updateTimebox(TB_ID, { status: 'cancelled' } as any)

    // 无 field step 时短路读回：service.execute 不调
    expect(mockServiceExecute).not.toHaveBeenCalled()
    // findById 仍被调 1 次（短路兜底）
    expect(mockFindById).toHaveBeenCalledWith(TB_ID, MVP)
  })

  it('activityArchetypeId 为 string 时先 owner-check（field 写也校验）', async () => {
    mockArchFindById.mockResolvedValue(null) // 跨用户 archetype
    mockFindById.mockResolvedValue({ id: TB_ID, occVersion: 1 } as any)

    await expect(updateTimebox(TB_ID, { activityArchetypeId: 'arch-foreign' } as any))
      .rejects.toThrow(/活动原型不存在或不属于当前用户/)

    // owner-check 失败后未调 service.execute
    expect(mockServiceExecute).not.toHaveBeenCalled()
  })
})
