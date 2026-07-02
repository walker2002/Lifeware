/**
 * @file cycle.test
 * @brief [022.01] Phase 1: adapter.cycle.create 幂等与降级防护测试
 *
 * 三个用例：
 * 1. adapter.cycle.create 不再抛 "不支持通过 GenericRepo 创建" 错误
 * 2. 同自然键已有 in_progress cycle 时，create 不覆写其 status（前置 SELECT 短路）
 * 3. 自然键不存在时，create 构造 draft cycle 并 save
 */
import { describe, it, expect, vi } from 'vitest'
import { createOkrsGenericRepo } from '../generic-repo-adapter'
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
      updateFields: vi.fn(),
      findByPeriod: vi.fn().mockResolvedValue(null),
    }
    const repos = createOkrsGenericRepo({
      objectiveRepo: makeMockObjectiveRepo(),
      keyResultRepo: makeMockKeyResultRepo(),
      cycleRepo: mockCycleRepo,
    })

    // adapter.cycle.create 被调用时应不再 throw
    await expect(
      repos.cycle.create(
        { cycleType: 'quarterly', name: '2026 Q3', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
        MVP_USER_ID,
      ),
    ).resolves.toBeDefined()
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