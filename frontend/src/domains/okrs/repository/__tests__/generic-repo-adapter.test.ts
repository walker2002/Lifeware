/**
 * @file generic-repo-adapter.test
 * @brief OKRs 域 GenericRepo 适配器单元测试
 *
 * [022.01] Phase 3：移除 objective/key_result 的 updateStatus / deleteDraft 测试，
 * 移除 create 时硬编码 status 的断言（manifest 已去 status 列）。
 * 保留 findById / save / create / updateFields / findByParent + cycle.updateStatus 的覆盖。
 */

import { describe, it, expect, vi } from 'vitest'
import { createOkrsGenericRepo } from '../generic-repo-adapter'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── Mock 仓储工厂 ──────────────────────────────────────────────

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
    updateProgress: vi.fn(),
    updateFields: vi.fn(),
  }
}

function makeMockCycleRepo() {
  return {
    findById: vi.fn(),
    save: vi.fn(),
    updateStatus: vi.fn(),
    updateFields: vi.fn(),
    findByPeriod: vi.fn(),
  }
}

const userId = 'user-001' as USOM_ID

// ─── 测试 ────────────────────────────────────────────────────────

describe('createOkrsGenericRepo', () => {
  it('返回包含 objective 和 key_result 两个键的映射', () => {
    const objectiveRepo = makeMockObjectiveRepo()
    const keyResultRepo = makeMockKeyResultRepo()
    const cycleRepo = makeMockCycleRepo()
    const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })

    expect(repos).toHaveProperty('objective')
    expect(repos).toHaveProperty('key_result')
    expect(repos).toHaveProperty('cycle')
    expect(Object.keys(repos)).toHaveLength(3)
  })

  // ─── Objective adapter ──────────────────────────────────────

  describe('objective adapter', () => {
    it('findById 委托到 objectiveRepo.findById', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      const expected = { id: 'o-1', title: 'Q3 目标' }
      objectiveRepo.findById.mockResolvedValue(expected)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.objective.findById('o-1' as USOM_ID, userId)

      expect(objectiveRepo.findById).toHaveBeenCalledWith('o-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('save 委托到 objectiveRepo.save', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      const obj = { id: 'o-1', title: '测试目标' }

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      await repos.objective.save(obj, userId)

      expect(objectiveRepo.save).toHaveBeenCalledWith(obj, userId, undefined)
    })

    it('create 构造完整对象并持久化（[022.01] Phase 3：不再含 status 字段）', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      objectiveRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.objective.create(
        { title: '新目标', priority: 'P0' },
        userId,
      )

      expect(result.id).toBeTruthy()
      expect(result.title).toBe('新目标')
      expect(result.priority).toBe('P0')
      expect(result.createdAt).toBeTruthy()
      // Phase 3：status 字段已从 Objective USOM 类型移除
      expect((result as any).status).toBeUndefined()
      expect(objectiveRepo.save).toHaveBeenCalledWith(expect.objectContaining({ title: '新目标' }), userId, undefined)
    })
  })

  // ─── KeyResult adapter ───────────────────────────────────────

  describe('key_result adapter', () => {
    it('findById 委托到 keyResultRepo.findById', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      const expected = { id: 'kr-1', title: 'KR1' }
      keyResultRepo.findById.mockResolvedValue(expected)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.key_result.findById('kr-1' as USOM_ID, userId)

      expect(keyResultRepo.findById).toHaveBeenCalledWith('kr-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('create 构造完整 KR 对象并持久化（Phase 3：不再含 status 字段）', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      keyResultRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.key_result.create(
        { objectiveId: 'o-1', title: '新 KR', targetValue: 100, unit: '个' },
        userId,
      )

      expect(result.id).toBeTruthy()
      expect(result.objectiveId).toBe('o-1')
      expect(result.title).toBe('新 KR')
      expect(result.targetValue).toBe(100)
      expect(result.currentValue).toBe(0)
      expect((result as any).status).toBeUndefined()
      expect(keyResultRepo.save).toHaveBeenCalled()
    })

    it('findByParent 委托到 keyResultRepo.findByObjective', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      const krs = [{ id: 'kr-1' }, { id: 'kr-2' }]
      keyResultRepo.findByObjective.mockResolvedValue(krs)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.key_result.findByParent!('o-1' as USOM_ID, userId)

      expect(keyResultRepo.findByObjective).toHaveBeenCalledWith('o-1', userId, undefined)
      expect(result).toEqual(krs)
    })
  })

  // ─── Cycle adapter（仍保留 status 转换）──────────────────────

  describe('cycle adapter', () => {
    it('updateStatus 委托到 cycleRepo.updateStatus', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const cycleRepo = makeMockCycleRepo()
      cycleRepo.updateStatus.mockResolvedValue({ id: 'c-1', status: 'in_progress' })

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo, cycleRepo })
      const result = await repos.cycle.updateStatus!('c-1' as USOM_ID, 'in_progress', userId)

      expect(cycleRepo.updateStatus).toHaveBeenCalledWith('c-1', 'in_progress', userId, undefined)
      expect(result).toEqual({ id: 'c-1', status: 'in_progress' })
    })
  })
})