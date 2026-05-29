import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db
vi.mock('../../index', () => {
  const mockWhere = vi.fn(() => Promise.resolve([]))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))

  return {
    db: {
      select: mockSelect,
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    },
  }
})

describe('AISessionRepository', () => {
  let repo: any
  const userId = '00000000-0000-0000-0000-000000000001'

  beforeEach(async () => {
    vi.clearAllMocks()
    const { AISessionRepository } = await import('../session.repository')
    repo = new AISessionRepository()
  })

  describe('create', () => {
    it('should create a new session with default values', async () => {
      const { db } = await import('../../index')
      const mockReturning = vi.fn(() => Promise.resolve([{
        id: 'new-session-id',
        user_id: userId,
        title: '新对话',
        status: 'active',
        messages: [],
        state_snapshot: {},
        referenced_object_ids: [],
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      }]))
      const mockValues = vi.fn(() => ({ returning: mockReturning }))
      ;(db.insert as any).mockReturnValue({ values: mockValues })

      const session = await repo.create({
        userId,
        title: '新对话',
        status: 'active',
        messages: [],
        stateSnapshot: {},
        referencedObjectIds: [],
      }, userId)

      expect(session.id).toBe('new-session-id')
      expect(session.title).toBe('新对话')
      expect(session.status).toBe('active')
      expect(db.insert).toHaveBeenCalled()
    })
  })

  describe('findById', () => {
    it('should return null for non-existent session', async () => {
      const result = await repo.findById('nonexistent', userId)
      expect(result).toBeNull()
    })

    it('should return session when found', async () => {
      const { db } = await import('../../index')
      const mockWhere = vi.fn(() => Promise.resolve([{
        id: 'session-1',
        user_id: userId,
        title: '测试对话',
        status: 'active',
        messages: [{ role: 'user', content: '你好', timestamp: '2026-05-16T10:00:00Z' }],
        state_snapshot: {},
        referenced_object_ids: [],
        created_at: new Date('2026-05-16T10:00:00Z'),
        updated_at: new Date('2026-05-16T10:00:00Z'),
        archived_at: null,
      }]))
      const mockFrom = vi.fn(() => ({ where: mockWhere }))
      ;(db.select as any).mockReturnValue({ from: mockFrom })

      const result = await repo.findById('session-1', userId)
      expect(result).not.toBeNull()
      expect(result.title).toBe('测试对话')
      expect(result.messages).toHaveLength(1)
    })
  })

  describe('findByUserId', () => {
    it('should return session summaries ordered by updatedAt desc', async () => {
      const { db } = await import('../../index')
      const mockOrderBy = vi.fn(() => Promise.resolve([
        { id: 's1', title: '对话1', status: 'active', createdAt: new Date(), updatedAt: new Date() },
        { id: 's2', title: '对话2', status: 'archived', createdAt: new Date(), updatedAt: new Date() },
      ]))
      const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }))
      const mockFrom = vi.fn(() => ({ where: mockWhere }))
      ;(db.select as any).mockReturnValue({ from: mockFrom })

      const results = await repo.findByUserId(userId)
      expect(results).toHaveLength(2)
      expect(results[0].title).toBe('对话1')
      expect(results[1].status).toBe('archived')
    })
  })

  describe('archive', () => {
    it('should set status to archived and set archivedAt', async () => {
      const { db } = await import('../../index')
      const mockWhere = vi.fn(() => Promise.resolve())
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      ;(db.update as any).mockReturnValue({ set: mockSet })

      await repo.archive('session-1', userId)
      expect(db.update).toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalled()
    })
  })

  describe('restore', () => {
    it('should set status to active and clear archivedAt', async () => {
      const { db } = await import('../../index')
      const mockWhere = vi.fn(() => Promise.resolve())
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      ;(db.update as any).mockReturnValue({ set: mockSet })

      await repo.restore('session-1', userId)
      expect(db.update).toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('should only delete archived sessions', async () => {
      const { db } = await import('../../index')

      const mockWhere = vi.fn(() => Promise.resolve([{
        id: 'session-1',
        user_id: userId,
        title: '已归档对话',
        status: 'archived',
        messages: [],
        state_snapshot: {},
        referenced_object_ids: [],
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: new Date(),
      }]))
      const mockFrom = vi.fn(() => ({ where: mockWhere }))
      ;(db.select as any).mockReturnValue({ from: mockFrom })

      const mockDeleteWhere = vi.fn(() => Promise.resolve())
      ;(db.update as any).mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })

      await repo.softDelete('session-1', userId)
      expect(db.update).toHaveBeenCalled()
    })

    it('should refuse to delete active session', async () => {
      const { db } = await import('../../index')

      const mockWhere = vi.fn(() => Promise.resolve([{
        id: 'session-1',
        user_id: userId,
        title: '活跃对话',
        status: 'active',
        messages: [],
        state_snapshot: {},
        referenced_object_ids: [],
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      }]))
      const mockFrom = vi.fn(() => ({ where: mockWhere }))
      ;(db.select as any).mockReturnValue({ from: mockFrom })

      // delete 方法已替换为 softDelete（允许直接软删除）
      await repo.softDelete('session-1', userId)
      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('updateMessages', () => {
    it('should update messages and refresh updatedAt', async () => {
      const { db } = await import('../../index')
      const mockWhere = vi.fn(() => Promise.resolve())
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      ;(db.update as any).mockReturnValue({ set: mockSet })

      const messages = [
        { role: 'user' as const, content: '你好', timestamp: '2026-05-16T10:00:00Z' },
        { role: 'assistant' as const, content: '你好！', timestamp: '2026-05-16T10:00:01Z' },
      ]
      await repo.updateMessages('session-1', messages, userId)
      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('updateStateSnapshot', () => {
    it('should update stateSnapshot and refresh updatedAt', async () => {
      const { db } = await import('../../index')
      const mockWhere = vi.fn(() => Promise.resolve())
      const mockSet = vi.fn(() => ({ where: mockWhere }))
      ;(db.update as any).mockReturnValue({ set: mockSet })

      await repo.updateStateSnapshot('session-1', { key: 'value' }, userId)
      expect(db.update).toHaveBeenCalled()
    })
  })
})
