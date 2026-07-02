/**
 * @file cycle.test
 * @brief [022.01] Cycle 仓储 + adapter 测试
 *
 * Phase 1（adapter.cycle.create 幂等与降级防护）+ Phase 2 Task 1
 * （CycleRepository.updateStatus + adapter 接线）：
 * 1. adapter.cycle.create 不再抛 "不支持通过 GenericRepo 创建" 错误
 * 2. 同自然键已有 in_progress cycle 时，create 不覆写其 status（前置 SELECT 短路）
 * 3. 自然键不存在时，create 构造 draft cycle 并 save
 * 4. CycleRepository.updateStatus：draft → in_progress
 * 5. CycleRepository.updateStatus：in_progress → ended
 * 6. CycleRepository.updateStatus：ended → reviewed
 * 7. CycleRepository.updateStatus：对象不存在时抛错
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

  it('同自然键已有 in_progress cycle 时，create 不覆写其 status（返回已有行）', async () => {
    const existingCycle = {
      id: 'existing-id',
      status: 'in_progress',
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
 * [022.01] Phase 2 Task 1：CycleRepository.updateStatus 状态转换测试
 *
 * 验证 updateStatus 正确设置 status + 对应时间戳。
 * 用 mock tx 对象记录 UPDATE 调用参数，避免依赖 PG。
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

  it('draft → in_progress：设置 status=in_progress + startedAt=now', async () => {
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

    const result = await repo.updateStatus('c-1', 'in_progress', MVP_USER_ID, tx as any)

    // called findById
    expect(repo.findById).toHaveBeenCalledWith('c-1', MVP_USER_ID, tx)

    // UPDATE set 含 status + startedAt
    expect(tx.updates.length).toBe(1)
    expect(tx.updates[0].set.status).toBe('in_progress')
    expect(tx.updates[0].set.startedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.endedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()

    // 返回的对象含新 status + startedAt
    expect(result.status).toBe('in_progress')
    expect(result.startedAt).toBeDefined()

    // restore
    repo.findById = origFindById
  })

  it('in_progress → ended：设置 status=ended + endedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'in_progress',
      startedAt: '2026-07-01T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'ended', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('ended')
    expect(tx.updates[0].set.endedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.startedAt).toBeUndefined()
    expect(result.status).toBe('ended')
    expect(result.endedAt).toBeDefined()

    repo.findById = origFindById
  })

  it('ended → reviewed：设置 status=reviewed + reviewedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'ended',
      startedAt: '2026-07-01T00:00:00.000Z',
      endedAt: '2026-09-30T00:00:00.000Z',
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
    expect(result.status).toBe('reviewed')
    expect(result.reviewedAt).toBeDefined()

    repo.findById = origFindById
  })

  it('对象不存在时抛错', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue(null)

    await expect(
      repo.updateStatus('c-nonexistent', 'in_progress', MVP_USER_ID),
    ).rejects.toThrow('Cycle c-nonexistent not found')

    repo.findById = origFindById
  })
})
