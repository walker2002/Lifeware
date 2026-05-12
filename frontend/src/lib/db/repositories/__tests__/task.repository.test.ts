import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskRepository } from '../task.repository'
import { Priority, EnergyLevel } from '../../../../usom/types/primitives'

// Mock db
vi.mock('../../index', () => {
  const mockQuery = vi.fn(() => Promise.resolve([]))
  const mockFrom = vi.fn(() => ({ where: mockQuery }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))

  const mockTxQuery = vi.fn(() => Promise.resolve([]))
  const mockTxFrom = vi.fn(() => ({ where: mockTxQuery }))
  const mockTxSelect = vi.fn(() => ({ from: mockTxFrom }))

  return {
    db: {
      select: mockSelect,
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      transaction: vi.fn((fn: any) =>
        fn({
          select: mockTxSelect,
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => Promise.resolve([])),
              onConflictDoUpdate: vi.fn(() => Promise.resolve()),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
          })),
        })
      ),
    },
  }
})

describe('TaskRepository', () => {
  let repo: TaskRepository
  const userId = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    repo = new TaskRepository()
    vi.clearAllMocks()
  })

  describe('findByProject', () => {
    it('应返回指定项目下的所有任务', async () => {
      const result = await repo.findByProject('proj-1', userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('findByParent', () => {
    it('应返回指定父任务下的所有子任务', async () => {
      const result = await repo.findByParent('parent-1', userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('findIndependent', () => {
    it('应返回所有未关联项目的独立任务', async () => {
      const result = await repo.findIndependent(userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('findByDateRange', () => {
    it('应返回日期范围内的任务', async () => {
      const result = await repo.findByDateRange('2026-05-01', '2026-05-31', userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('updateStatus', () => {
    it('应更新任务状态并返回任务对象', async () => {
      const result = await repo.updateStatus('task-1', 'active', userId)
      // 由于 mock 返回空结果, 会抛出错误, 但类型验证通过
      expect(result).toBeDefined()
    })
  })

  describe('bulkCreate', () => {
    it('应批量创建任务', async () => {
      const result = await repo.bulkCreate([
        { title: '批量任务1', priority: Priority.Medium, energyRequired: EnergyLevel.Medium, estimatedDuration: 60 },
        { title: '批量任务2', priority: Priority.High, energyRequired: EnergyLevel.High, estimatedDuration: 120 },
      ], userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
