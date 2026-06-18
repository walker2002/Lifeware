/**
 * @file generic-repo-adapter.test
 * @brief Habits 域 GenericRepo 适配器单元测试
 */

import { describe, it, expect, vi } from 'vitest'
import { createHabitsGenericRepo } from '../generic-repo-adapter'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── Mock 仓储工厂 ──────────────────────────────────────────────

function makeMockHabitRepo() {
  return {
    findById: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateFields: vi.fn(),
  }
}

function makeMockHabitLogRepo() {
  return {
    save: vi.fn(),
  }
}

const userId = 'user-001' as USOM_ID

// ─── 测试 ────────────────────────────────────────────────────────

describe('createHabitsGenericRepo', () => {
  it('返回包含 habit 和 habit_log 两个键的映射', () => {
    const habitRepo = makeMockHabitRepo()
    const habitLogRepo = makeMockHabitLogRepo()
    const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })

    expect(repos).toHaveProperty('habit')
    expect(repos).toHaveProperty('habit_log')
    expect(Object.keys(repos)).toHaveLength(2)
  })

  // ─── habit 适配器 ────────────────────────────────────────────

  describe('habit adapter', () => {
    it('findById 委托到 habitRepo.findById', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      const expected = { id: 'h-1', status: 'active', title: '晨跑' }
      habitRepo.findById.mockResolvedValue(expected)

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      const result = await repos.habit.findById('h-1' as USOM_ID, userId)

      expect(habitRepo.findById).toHaveBeenCalledWith('h-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('save 委托到 habitRepo.save', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      const obj = { id: 'h-1', status: 'active', title: '晨跑' }
      habitRepo.save.mockResolvedValue(undefined)

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      await repos.habit.save(obj, userId)

      expect(habitRepo.save).toHaveBeenCalledWith(obj, userId, undefined)
    })

    it('create 委托到 habitRepo.create', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      const fields = { title: '冥想', frequencyType: 'daily' }
      const created = { id: 'h-2', status: 'draft', ...fields }
      habitRepo.create.mockResolvedValue(created)

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      const result = await repos.habit.create(fields, userId)

      expect(habitRepo.create).toHaveBeenCalledWith(fields, userId, undefined)
      expect(result).toEqual(created)
    })

    it('updateStatus 委托到 habitRepo.updateStatus', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      const updated = { id: 'h-1', status: 'suspended' }
      habitRepo.updateStatus.mockResolvedValue(updated)

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      const result = await repos.habit.updateStatus('h-1' as USOM_ID, 'suspended', userId)

      expect(habitRepo.updateStatus).toHaveBeenCalledWith('h-1', 'suspended', userId, undefined)
      expect(result).toEqual(updated)
    })
  })

  // ─── habit_log 适配器 ────────────────────────────────────────

  describe('habit_log adapter', () => {
    it('findById 始终返回 null', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      const result = await repos.habit_log.findById('log-1' as USOM_ID, userId)

      expect(result).toBeNull()
    })

    it('save 委托到 habitLogRepo.save', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      const obj = { id: 'log-1', habitId: 'h-1', completionStatus: 'completed' }
      habitLogRepo.save.mockResolvedValue(undefined)

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      await repos.habit_log.save(obj, userId)

      expect(habitLogRepo.save).toHaveBeenCalledWith(obj, userId)
    })

    it('create 生成 ID 并委托到 habitLogRepo.save', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()
      habitLogRepo.save.mockResolvedValue(undefined)

      const fields = { habitId: 'h-1', completionStatus: 'completed' }
      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      const result = await repos.habit_log.create(fields, userId)

      // 返回值包含生成的 id 和传入字段
      expect(result).toHaveProperty('id')
      expect(result.habitId).toBe('h-1')
      expect(result.completionStatus).toBe('completed')

      // save 被调用了一次
      expect(habitLogRepo.save).toHaveBeenCalledTimes(1)
      const savedObj = habitLogRepo.save.mock.calls[0][0]
      expect(savedObj).toHaveProperty('id')
      expect(savedObj.habitId).toBe('h-1')
    })

    it('updateStatus 抛出错误', async () => {
      const habitRepo = makeMockHabitRepo()
      const habitLogRepo = makeMockHabitLogRepo()

      const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
      await expect(
        repos.habit_log.updateStatus('log-1' as USOM_ID, 'completed', userId),
      ).rejects.toThrow('HabitLog 不支持状态转换')
    })
  })

  // ─── 独立性验证 ──────────────────────────────────────────────

  it('habit 和 habit_log 适配器互不干扰', async () => {
    const habitRepo = makeMockHabitRepo()
    const habitLogRepo = makeMockHabitLogRepo()
    habitRepo.findById.mockResolvedValue({ id: 'h-1', type: 'habit' })

    const repos = createHabitsGenericRepo({ habitRepo, habitLogRepo })
    const habitResult = await repos.habit.findById('h-1' as USOM_ID, userId)
    const logResult = await repos.habit_log.findById('log-1' as USOM_ID, userId)

    expect(habitRepo.findById).toHaveBeenCalledTimes(1)
    expect(habitResult).toEqual({ id: 'h-1', type: 'habit' })
    expect(logResult).toBeNull()
  })
})
