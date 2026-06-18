/**
 * @file generic-repo-adapter.test
 * @brief OKRs 域 GenericRepo 适配器单元测试
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
    deleteDraft: vi.fn(),
    updateProgress: vi.fn(),
    updateFields: vi.fn(),
  }
}

const userId = 'user-001' as USOM_ID

// ─── 测试 ────────────────────────────────────────────────────────

describe('createOkrsGenericRepo', () => {
  it('返回包含 objective 和 key_result 两个键的映射', () => {
    const objectiveRepo = makeMockObjectiveRepo()
    const keyResultRepo = makeMockKeyResultRepo()
    const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })

    expect(repos).toHaveProperty('objective')
    expect(repos).toHaveProperty('key_result')
    expect(Object.keys(repos)).toHaveLength(2)
  })

  // ─── Objective adapter ──────────────────────────────────────

  describe('objective adapter', () => {
    it('findById 委托到 objectiveRepo.findById', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const expected = { id: 'o-1', status: 'draft', title: 'Q3 目标' }
      objectiveRepo.findById.mockResolvedValue(expected)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.objective.findById('o-1' as USOM_ID, userId)

      expect(objectiveRepo.findById).toHaveBeenCalledWith('o-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('save 委托到 objectiveRepo.save', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const obj = { id: 'o-1', status: 'draft', title: '测试目标' }

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      await repos.objective.save(obj, userId)

      expect(objectiveRepo.save).toHaveBeenCalledWith(obj, userId, undefined)
    })

    it('create 构造完整对象并持久化', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      objectiveRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.objective.create(
        { title: '新目标', status: 'draft', priority: 'P0' },
        userId,
      )

      expect(result.id).toBeTruthy()
      expect(result.title).toBe('新目标')
      expect(result.status).toBe('draft')
      expect(result.priority).toBe('P0')
      expect(result.createdAt).toBeTruthy()
      expect(objectiveRepo.save).toHaveBeenCalledWith(expect.objectContaining({ title: '新目标' }), userId, undefined)
    })

    it('create 使用 SM 注入的 status', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      objectiveRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.objective.create(
        { title: '新目标', status: 'active' },
        userId,
      )

      expect(result.status).toBe('active')
    })

    it('updateStatus 加载现有对象、合并状态、持久化并返回', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const existing = {
        id: 'o-1', status: 'draft', title: '目标', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }
      objectiveRepo.findById.mockResolvedValue(existing)
      objectiveRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.objective.updateStatus('o-1' as USOM_ID, 'active', userId)

      expect(result.status).toBe('active')
      expect(result.updatedAt).toBeTruthy()
      expect(objectiveRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }), userId, undefined)
    })

    it('updateStatus 对 discarded 状态添加 discardedAt', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      objectiveRepo.findById.mockResolvedValue({ id: 'o-1', status: 'draft', title: '目标' })
      objectiveRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.objective.updateStatus('o-1' as USOM_ID, 'discarded', userId)

      expect(result.discardedAt).toBeTruthy()
    })
  })

  // ─── KeyResult adapter ───────────────────────────────────────

  describe('key_result adapter', () => {
    it('findById 委托到 keyResultRepo.findById', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const expected = { id: 'kr-1', status: 'draft', title: 'KR1' }
      keyResultRepo.findById.mockResolvedValue(expected)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.key_result.findById('kr-1' as USOM_ID, userId)

      expect(keyResultRepo.findById).toHaveBeenCalledWith('kr-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('create 构造完整 KR 对象并持久化', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      keyResultRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.key_result.create(
        { objectiveId: 'o-1', title: '新 KR', targetValue: 100, unit: '个', status: 'draft' },
        userId,
      )

      expect(result.id).toBeTruthy()
      expect(result.objectiveId).toBe('o-1')
      expect(result.title).toBe('新 KR')
      expect(result.targetValue).toBe(100)
      expect(result.status).toBe('draft')
      expect(result.currentValue).toBe(0)
      expect(keyResultRepo.save).toHaveBeenCalled()
    })

    it('findByParent 委托到 keyResultRepo.findByObjective', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      const krs = [{ id: 'kr-1' }, { id: 'kr-2' }]
      keyResultRepo.findByObjective.mockResolvedValue(krs)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.key_result.findByParent!('o-1' as USOM_ID, userId)

      expect(keyResultRepo.findByObjective).toHaveBeenCalledWith('o-1', userId, undefined)
      expect(result).toEqual(krs)
    })

    it('deleteDraft 委托到 keyResultRepo.deleteDraft', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      keyResultRepo.deleteDraft.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      await repos.key_result.deleteDraft!('kr-1' as USOM_ID, userId)

      expect(keyResultRepo.deleteDraft).toHaveBeenCalledWith('kr-1', userId, undefined)
    })

    it('updateStatus 对 archived 状态添加 archivedAt', async () => {
      const objectiveRepo = makeMockObjectiveRepo()
      const keyResultRepo = makeMockKeyResultRepo()
      keyResultRepo.findById.mockResolvedValue({ id: 'kr-1', status: 'completed' })
      keyResultRepo.save.mockResolvedValue(undefined)

      const repos = createOkrsGenericRepo({ objectiveRepo, keyResultRepo })
      const result = await repos.key_result.updateStatus('kr-1' as USOM_ID, 'archived', userId)

      expect(result.archivedAt).toBeTruthy()
    })
  })
})
