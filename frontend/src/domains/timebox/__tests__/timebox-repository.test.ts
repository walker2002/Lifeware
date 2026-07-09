/**
 * @file timebox-repository.test
 * @brief TimeboxRepository 单元测试（[026.02.4] TD-028 Site 0: findRunning 读时派生）
 *
 * 覆盖 findRunning 的读时派生语义：返回 status='planned' 且 NOW() 落在
 * [start_time, end_time] 区间内的行（与 v_running_timeboxes view +
 * derive-display-status.ts 的逻辑对齐）。
 *
 * 该方法旧实现查 status='running'，但 timeboxes.status enum 不含 'running'
 * （[023.12] 3 态收敛：planned/logged/cancelled），导致 6 个 caller 全部拿到 []。
 *
 * [026.02.4-r2] I-4: 新增 WHERE-clause shape test — 用 vi.mock drizzle 操作符
 *   验证 findRunning 构造的 WHERE 包含 status='planned' + NOW() 上下界 +
 *   userId 过滤。这是 IRON RULE 测试（测试真查询构造而非 JS 层 filter），
 *   防止「test only verifies its own mock」反模式。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock drizzle 操作符（captures 调用，assert real query construction）───
// [026.02.4-r2] I-4: spy via vi.mock — ESM namespace 不能 vi.spyOn
const eqCalls: unknown[][] = []
const lteCalls: unknown[][] = []
const gteCalls: unknown[][] = []
const sqlCalls: unknown[][] = []
const andCalls: unknown[][] = []

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capture = (arr: unknown[][], fn: any) => (...args: unknown[]) => {
    arr.push(args)
    return fn(...args)
  }
  return {
    ...actual,
    eq: capture(eqCalls, actual.eq) as typeof actual.eq,
    lte: capture(lteCalls, actual.lte) as typeof actual.lte,
    gte: capture(gteCalls, actual.gte) as typeof actual.gte,
    sql: capture(sqlCalls, actual.sql) as unknown as typeof actual.sql,
    and: capture(andCalls, actual.and) as typeof actual.and,
  }
})

// Mock lib/db（factory 内闭包，vi.mock 提升到顶部）
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('TimeboxRepository.findRunning [026.02.4] TD-028 Site 0', () => {
  let repo: any
  let mockDb: any

  beforeEach(async () => {
    vi.clearAllMocks()
    eqCalls.length = 0
    lteCalls.length = 0
    gteCalls.length = 0
    sqlCalls.length = 0
    andCalls.length = 0
    const { db } = await import('@/lib/db')
    mockDb = db
    const mod = await import('../repository')
    repo = new mod.TimeboxRepository()
  })

  it('findRunning 返回 planned 行且 NOW() ∈ [start, end]（mock shape 与新 WHERE 兼容）', async () => {
    const now = new Date()
    const userId = 'user-1'
    // 5 fixture 行：planned+now / planned+past / planned+future / logged+now / cancelled+now
    // 字段满足 timeboxRowToUSOM 所需：id/userId/status/title/startTime/endTime +
    // createdAt/updatedAt（toISOString 所需）+ isRecurring/recurrenceRule/executionRecord
    // + startedAt/overtimeAt/endedAt/loggedAt/tags/notes/taskIds/habitIds/activityArchetypeId
    const baseRow = (overrides: Record<string, unknown>) => ({
      id: 'tb-x', userId, status: 'planned',
      title: 't',
      startTime: new Date(now.getTime()), endTime: new Date(now.getTime()),
      isRecurring: false, recurrenceRule: null,
      tags: [], notes: null, executionRecord: null,
      createdAt: now, updatedAt: now,
      startedAt: null, overtimeAt: null, endedAt: null, loggedAt: null,
      taskIds: [], habitIds: [], activityArchetypeId: null,
      ...overrides,
    })
    const fixtureRows = [
      baseRow({ id: 'tb-1', startTime: new Date(now.getTime() - 30 * 60 * 1000), endTime: new Date(now.getTime() + 30 * 60 * 1000) }),
      baseRow({ id: 'tb-2', startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), endTime: new Date(now.getTime() - 60 * 60 * 1000) }),
      baseRow({ id: 'tb-3', startTime: new Date(now.getTime() + 60 * 60 * 1000), endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000) }),
      baseRow({ id: 'tb-4', status: 'logged', startTime: new Date(now.getTime() - 30 * 60 * 1000), endTime: new Date(now.getTime() + 30 * 60 * 1000) }),
      baseRow({ id: 'tb-5', status: 'cancelled', startTime: new Date(now.getTime() - 30 * 60 * 1000), endTime: new Date(now.getTime() + 30 * 60 * 1000) }),
    ]
    // mock 队列：第 1 次 select → 主查询（mock 在 where() 层过滤模拟 PG WHERE 语义）
    // 第 2/3 次 select → 关联查询（timeboxTasks/timeboxHabits 空数组）
    mockDb.select
      .mockReturnValueOnce({
        from: () => ({
          where: async () => fixtureRows.filter(r => r.id === 'tb-1'),
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })

    const result = await repo.findRunning(userId)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('tb-1')
  })

  it('findRunning 子用例：无匹配行时返回 []（子 case 验证空结果 + loadWithJunctions 不被调用）', async () => {
    // 主查询直接返 [] → loadWithJunctions 内的 for 循环零次迭代，不再调 select
    mockDb.select.mockReturnValue({ from: () => ({ where: async () => [] }) })
    const result = await repo.findRunning('user-1')
    expect(result).toEqual([])
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  // [026.02.4-r2] I-4: IRON RULE test — verify real WHERE clause construction
  it('findRunning WHERE clause includes userId + status=planned + NOW() bounds (IRON RULE)', async () => {
    const userId = 'user-test'
    // 主查询直接返 []（不验证结果，只看 WHERE 构造）
    mockDb.select.mockReturnValue({ from: () => ({ where: async () => [] }) })

    await repo.findRunning(userId as any)

    // and(...) 至少 1 次（4 个条件组合）
    expect(andCalls.length).toBeGreaterThanOrEqual(1)

    // eq 必须出现 ≥2 次：userId 过滤 + status='planned'
    const eqUserId = eqCalls.find(args => args[1] === userId)
    const eqStatus = eqCalls.find(args => args[1] === 'planned')
    expect(eqUserId, 'WHERE must include eq(userId, ?)').toBeTruthy()
    expect(eqStatus, 'WHERE must include eq(status, "planned")').toBeTruthy()

    // lte + gte 至少各 1 次（时间上下界）
    expect(lteCalls.length).toBeGreaterThanOrEqual(1)
    expect(gteCalls.length).toBeGreaterThanOrEqual(1)

    // sql 必须包含 NOW()（时间上下界用 sql`NOW()`）
    const sqlNow = sqlCalls.find(args => {
      const a = args[0]
      // sql tag 函数第 1 个参数是 TemplateStringsArray,内容应为 ['NOW()']
      return Array.isArray(a) && a[0] === 'NOW()'
    })
    expect(sqlNow, 'WHERE must use sql`NOW()` for time bounds').toBeTruthy()
  })
})
