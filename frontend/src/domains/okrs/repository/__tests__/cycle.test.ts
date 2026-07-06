/**
 * @file cycle.test
 * @brief [022.01] + [023.12] T6 Cycle 仓储 + adapter 测试
 *
 * Phase 1（adapter.cycle.create 幂等与降级防护）+ Phase 2 Task 1
 * （CycleRepository.updateStatus + adapter 接线）：
 * 1. adapter.cycle.create 不再抛 "不支持通过 GenericRepo 创建" 错误
 * 2. 同自然键已有 approved cycle 时，create 不覆写其 status（前置 SELECT 短路）
 *    [023.12] T6：in_progress→approved（[AM6] 同步）
 * 3. 自然键不存在时，create 构造 draft cycle 并 save
 * 4. CycleRepository.updateStatus：draft → approved
 * 5. CycleRepository.updateStatus：approved → finished
 * 6. CycleRepository.updateStatus：finished → reviewed
 * 7. CycleRepository.updateStatus：reviewed → finished（[T6] revert 一致性：保留 approvedAt/finishedAt）
 * 8. CycleRepository.updateStatus：draft → draft（无时间戳字段变更）
 * 9. CycleRepository.updateStatus：对象不存在时抛错
 */
import { describe, it, expect, vi } from 'vitest'
import { createOkrsGenericRepo } from '../generic-repo-adapter'
import { CycleRepository } from '../cycle'
import type { USOM_ID } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID

function makeMockObjectiveRepo() {
  return {
    findById: vi.fn(),
    save: vi.fn(),
    updateFields: vi.fn(),
  }
}

function makeMockKeyResultRepo() {
  return {
    findById: vi.fn(),
    save: vi.fn(),
    findByObjective: vi.fn(),
    deleteDraft: vi.fn(),
    updateProgress: vi.fn(),
    updateFields: vi.fn(),
  }
}

describe('[022.01] adapter.cycle.create', () => {
  it('不应再抛 "不支持通过 GenericRepo 创建" 错误', async () => {
    const mockCycleRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue({ id: 'new-id', status: 'draft' }),
      updateStatus: vi.fn(),
      updateFields: vi.fn(),
      findByPeriod: vi.fn().mockResolvedValue(null),
    }
    const repos = createOkrsGenericRepo({
      objectiveRepo: makeMockObjectiveRepo(),
      keyResultRepo: makeMockKeyResultRepo(),
      cycleRepo: mockCycleRepo,
    })

    // adapter.cycle.create 被调用时应不再 throw
    const result = await repos.cycle.create(
      { cycleType: 'quarterly', name: '2026 Q3', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
      MVP_USER_ID,
    )
    expect(result).toBeDefined()
    expect(result.status).toBe('draft')
    expect(result.id).toBeDefined()
  })

  it('同自然键已有 approved cycle 时，create 不覆写其 status（返回已有行）', async () => {
    // [023.12] T6：原 in_progress→approved
    const existingCycle = {
      id: 'existing-id',
      status: 'approved',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
    }
    const mockCycleRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateFields: vi.fn(),
      findByPeriod: vi.fn().mockResolvedValue(existingCycle),
    }
    const repos = createOkrsGenericRepo({
      objectiveRepo: makeMockObjectiveRepo(),
      keyResultRepo: makeMockKeyResultRepo(),
      cycleRepo: mockCycleRepo,
    })

    const result = await repos.cycle.create(
      { cycleType: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
      MVP_USER_ID,
    )

    expect(result).toBe(existingCycle)
    expect(mockCycleRepo.save).not.toHaveBeenCalled() // 未写入 DB
  })

  it('自然键不存在时，create 构造 draft cycle 并 save', async () => {
    const mockCycleRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue({ id: 'new-id', status: 'draft' }),
      updateStatus: vi.fn(),
      updateFields: vi.fn(),
      findByPeriod: vi.fn().mockResolvedValue(null),
    }
    const repos = createOkrsGenericRepo({
      objectiveRepo: makeMockObjectiveRepo(),
      keyResultRepo: makeMockKeyResultRepo(),
      cycleRepo: mockCycleRepo,
    })

    const result = await repos.cycle.create(
      { cycleType: 'quarterly', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
      MVP_USER_ID,
    )

    expect(mockCycleRepo.save).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: 'new-id', status: 'draft' })
  })
})

/**
 * [022.01] Phase 2 Task 1 + [023.12] T6：CycleRepository.updateStatus 状态转换测试
 *
 * 验证 updateStatus 正确设置 status + 对应时间戳。
 * 用 mock tx 对象记录 UPDATE 调用参数，避免依赖 PG。
 * [T6] 4 态收敛：draft/approved/finished/reviewed。
 */
describe('[022.01] CycleRepository.updateStatus', () => {
  // mock tx 对象：记录 UPDATE 调用参数
  function mockTx() {
    const updates: Array<{ set: Record<string, unknown>; where: unknown }> = []
    return {
      updates,
      update: vi.fn((_table: unknown) => ({
        set: vi.fn((payload: Record<string, unknown>) => {
          updates.push({ set: payload, where: null })
          return {
            where: vi.fn((_conds: unknown) => {
              updates[updates.length - 1].where = _conds
              return Promise.resolve()
            }),
          }
        }),
      })),
    }
  }

  it('draft → approved：设置 status=approved + approvedAt=now（[T6] 原 startedAt）', async () => {
    const repo = new CycleRepository()
    const tx = mockTx()

    // mock findById 返回 draft cycle
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'draft',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const result = await repo.updateStatus('c-1', 'approved', MVP_USER_ID, tx as any)

    // called findById
    expect(repo.findById).toHaveBeenCalledWith('c-1', MVP_USER_ID, tx)

    // UPDATE set 含 status + approvedAt（[T6] AM6）
    expect(tx.updates.length).toBe(1)
    expect(tx.updates[0].set.status).toBe('approved')
    expect(tx.updates[0].set.approvedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.finishedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()
    // [T6] 旧字段名不再使用
    expect(tx.updates[0].set.startedAt).toBeUndefined()
    expect(tx.updates[0].set.endedAt).toBeUndefined()

    // 返回的对象含新 status + approvedAt
    expect(result.status).toBe('approved')
    expect(result.approvedAt).toBeDefined()

    // restore
    repo.findById = origFindById
  })

  it('approved → finished：设置 status=finished + finishedAt=now（[T6] 原 endedAt）', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'approved',
      approvedAt: '2026-07-01T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'finished', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('finished')
    expect(tx.updates[0].set.finishedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.approvedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()
    expect(tx.updates[0].set.startedAt).toBeUndefined()
    expect(tx.updates[0].set.endedAt).toBeUndefined()
    expect(result.status).toBe('finished')
    expect(result.finishedAt).toBeDefined()

    repo.findById = origFindById
  })

  it('finished → reviewed：设置 status=reviewed + reviewedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'finished',
      approvedAt: '2026-07-01T00:00:00.000Z',
      finishedAt: '2026-09-30T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'reviewed', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('reviewed')
    expect(tx.updates[0].set.reviewedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.approvedAt).toBeUndefined()
    expect(tx.updates[0].set.finishedAt).toBeUndefined()
    expect(result.status).toBe('reviewed')
    expect(result.reviewedAt).toBeDefined()

    repo.findById = origFindById
  })

  it('reviewed → finished（revert，[T6] AM10）：无时间戳字段变更（仅 status + updatedAt）', async () => {
    // [023.12] T6 新增：[AM10] 一致性约束——
    // reviewed→finished 是一致性回退，复盘证据（reviewedAt）和历史时间戳
    // （approvedAt/finishedAt）必须保留，不允许被覆盖。
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'reviewed',
      approvedAt: '2026-07-01T00:00:00.000Z',
      finishedAt: '2026-09-30T00:00:00.000Z',
      reviewedAt: '2026-10-05T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'finished', MVP_USER_ID, tx as any)

    // UPDATE set 仅含 status + updatedAt；不修改任何 *At 时间戳
    expect(tx.updates.length).toBe(1)
    expect(tx.updates[0].set.status).toBe('finished')
    expect(tx.updates[0].set.approvedAt).toBeUndefined()
    expect(tx.updates[0].set.finishedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()

    // 返回的对象 status 回到 finished；*At 时间戳保持 findById 返回原值
    expect(result.status).toBe('finished')
    expect(result.reviewedAt).toBe('2026-10-05T00:00:00.000Z')

    repo.findById = origFindById
  })

  it('draft → draft（test fixture 状态保持）：无时间戳字段变更（仅 status + updatedAt）', async () => {
    // [023.12] T6：替代原 draft → not_started——测试 SET 行为而非具体 to 值。
    // draft cycle 状态写不触发任何 *At 字段，仅 updatedAt。
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'draft',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'draft', MVP_USER_ID, tx as any)

    // UPDATE set 仅含 status + updatedAt；不触发任何 *At 字段
    expect(tx.updates.length).toBe(1)
    expect(tx.updates[0].set.status).toBe('draft')
    expect(tx.updates[0].set.approvedAt).toBeUndefined()
    expect(tx.updates[0].set.finishedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()

    // 返回的对象 status 保持 draft
    expect(result.status).toBe('draft')

    repo.findById = origFindById
  })

  it('对象不存在时抛错', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue(null)

    await expect(
      repo.updateStatus('c-nonexistent', 'approved', MVP_USER_ID),
    ).rejects.toThrow('Cycle c-nonexistent not found')

    repo.findById = origFindById
  })
})
