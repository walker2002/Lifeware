import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectRepository } from '../../../../domains/tasks/repository/project'
import { Priority } from '../../../../usom/types/primitives'

// Mock db
vi.mock('../../index', () => {
  const mockQuery = vi.fn(() => Promise.resolve([]))
  const mockFrom = vi.fn(() => ({ where: mockQuery }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))

  const mockTxQuery = vi.fn(() => Promise.resolve([]))
  const mockTxFrom = vi.fn(() => ({ where: mockTxQuery, orderBy: vi.fn(() => Promise.resolve([])) }))
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

describe('ProjectRepository', () => {
  let repo: ProjectRepository
  const userId = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    repo = new ProjectRepository()
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('应调用 insert 创建项目', async () => {
      const result = await repo.create({ name: '测试项目', priority: Priority.High }, userId)
      expect(result).toBeDefined()
    })
  })

  describe('findByUserId', () => {
    it('应返回用户的所有项目', async () => {
      const result = await repo.findByUserId(userId)
      expect(Array.isArray(result)).toBe(true)
    })

    it('应支持按状态筛选', async () => {
      const result = await repo.findByUserId(userId, { status: 'active' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('应支持按多状态筛选', async () => {
      const result = await repo.findByUserId(userId, { status: ['active', 'planning'] })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('findByStatus', () => {
    it('应返回指定状态的项目', async () => {
      const result = await repo.findByStatus('planning', userId)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('update', () => {
    it('应更新项目并返回更新后的项目', async () => {
      const result = await repo.update('proj-1', { name: '新名称' }, userId)
      expect(result).toBeDefined()
    })
  })

  describe('updateStatus', () => {
    it('应更新项目状态', async () => {
      const result = await repo.updateStatus('proj-1', 'active', userId)
      expect(result).toBeDefined()
    })
  })

  describe('saveAsTemplate', () => {
    it('项目不存在时应抛出错误', async () => {
      // mock 数据库返回空结果，saveAsTemplate 内部 findById 返回 null
      await expect(repo.saveAsTemplate('nonexistent', userId)).rejects.toThrow('Project not found')
    })
  })

  describe('delete', () => {
    it('应删除项目', async () => {
      await expect(repo.delete('proj-1', userId)).resolves.toBeUndefined()
    })
  })
})
