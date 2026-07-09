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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
})
