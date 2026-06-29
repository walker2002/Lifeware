/**
 * @file timebox-template.repository.test
 * @brief TimeboxTemplateRepository 单元测试（[023] A2）
 *
 * 覆盖：CRUD + audit log 写入 + A3 owner-check 拒绝跨用户订阅 id。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db（factory 内闭包，vi.mock 提升到顶部）
vi.mock('@/lib/db', () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn((fn: any) =>
        fn({
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        }),
      ),
    },
  }
})

describe('TimeboxTemplateRepository', () => {
  let repo: any
  const MVP_USER = '00000000-0000-0000-0000-000000000001'

  const FAKE_TEMPLATE_ROW = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: MVP_USER,
    schemaVersion: 1,
    name: '工作日模板',
    survivalSegments: { wake: { start: '07:00', end: '07:30' } },
    subscribedHabits: ['habit-1'],
    subscribedTasks: [],
    subscribedThreads: [],
    createdAt: new Date('2026-06-29T00:00:00Z'),
    updatedAt: new Date('2026-06-29T00:00:00Z'),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../timebox-template')
    repo = new mod.TimeboxTemplateRepository()
  })

  // 工具：构造 select 链 select().from().where()
  function mockSelectWhere(rows: any[]) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(rows)),
        orderBy: vi.fn(() => ({
          // 兼容 orderBy 链
        })),
      })),
    }
  }

  function mockSelectWhereOrderBy(rows: any[]) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(rows)),
        })),
      })),
    }
  }

  function mockInsertReturning(rows: any[]) {
    return {
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(rows)),
      })),
    }
  }

  function mockInsertVoid() {
    return {
      values: vi.fn(() => Promise.resolve(undefined)),
    }
  }

  // ─── findByUser ────────────────────────────────────────────
  describe('findByUser', () => {
    it('应返回当前用户所有模板', async () => {
      const { db } = await import('@/lib/db')
      vi.mocked(db.select).mockReturnValue(mockSelectWhereOrderBy([FAKE_TEMPLATE_ROW]) as any)

      const result = await repo.findByUser(MVP_USER)
      expect(Array.isArray(result)).toBe(true)
      expect(result[0]?.id).toBe(FAKE_TEMPLATE_ROW.id)
      expect(result[0]?.name).toBe('工作日模板')
      expect(result[0]?.subscribedHabits).toEqual(['habit-1'])
    })
  })

  // ─── findById ──────────────────────────────────────────────
  describe('findById', () => {
    it('应返回指定 id 的模板', async () => {
      const { db } = await import('@/lib/db')
      vi.mocked(db.select).mockReturnValue(mockSelectWhere([FAKE_TEMPLATE_ROW]) as any)

      const result = await repo.findById(FAKE_TEMPLATE_ROW.id, MVP_USER)
      expect(result?.id).toBe(FAKE_TEMPLATE_ROW.id)
    })

    it('未找到时应返回 null', async () => {
      const { db } = await import('@/lib/db')
      vi.mocked(db.select).mockReturnValue(mockSelectWhere([]) as any)

      const result = await repo.findById('non-existent', MVP_USER)
      expect(result).toBeNull()
    })
  })

  // ─── create ────────────────────────────────────────────────
  describe('create', () => {
    it('应在订阅 id 均归属当前用户时成功创建并写 audit log', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: vi.fn(),
          delete: vi.fn(),
        }),
      )

      // owner-check habits → [{id:'habit-1'}]
      txSelect.mockReturnValueOnce(mockSelectWhere([{ id: 'habit-1' }]) as any)
      // owner-check tasks → []
      txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)
      // owner-check threads → []
      txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)
      // insert returning → [FAKE_TEMPLATE_ROW]
      txInsert.mockReturnValueOnce(mockInsertReturning([FAKE_TEMPLATE_ROW]) as any)
      // audit log insert → void
      txInsert.mockReturnValueOnce(mockInsertVoid() as any)

      const result = await repo.create(
        {
          name: '工作日模板',
          survivalSegments: FAKE_TEMPLATE_ROW.survivalSegments,
          subscribedHabits: ['habit-1'],
          subscribedTasks: [],
          subscribedThreads: [],
        },
        MVP_USER,
      )

      expect(result.id).toBe(FAKE_TEMPLATE_ROW.id)
      // txInsert 至少 2 次：timebox_templates + user_audit_log
      expect(txInsert).toHaveBeenCalledTimes(2)
    })

    it('A3 owner-check：订阅跨用户 habit id 应抛出', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: vi.fn(),
          delete: vi.fn(),
        }),
      )

      // owner-check habits → 空（跨用户 → 拒绝）
      txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)

      await expect(
        repo.create(
          {
            name: '跨用户尝试',
            survivalSegments: {},
            subscribedHabits: ['other-user-habit'],
            subscribedTasks: [],
            subscribedThreads: [],
          },
          MVP_USER,
        ),
      ).rejects.toThrow(/订阅的习惯 .* 不存在或不属于当前用户/)

      // owner-check 失败后不应有 insert
      expect(txInsert).not.toHaveBeenCalled()
    })
  })

  // ─── delete ────────────────────────────────────────────────
  describe('delete', () => {
    it('应删除模板并写 audit log', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txDelete = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: vi.fn(),
          delete: txDelete,
        }),
      )

      // findById 返回模板
      txSelect.mockReturnValueOnce(mockSelectWhere([FAKE_TEMPLATE_ROW]) as any)
      // delete where → void
      txDelete.mockReturnValueOnce({
        where: vi.fn(() => Promise.resolve(undefined)),
      } as any)
      // audit log insert → void
      txInsert.mockReturnValueOnce(mockInsertVoid() as any)

      await repo.delete(FAKE_TEMPLATE_ROW.id, MVP_USER)

      expect(txDelete).toHaveBeenCalledTimes(1)
      // audit log insert 一次
      expect(txInsert).toHaveBeenCalledTimes(1)
    })

    it('模板不存在时应抛出', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        }),
      )
      txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)

      await expect(repo.delete('missing', MVP_USER)).rejects.toThrow(/not found/)
    })
  })
})