/**
 * @file timebox-template.repository.test
 * @brief TimeboxTemplateRepository 单元测试（[023-02] 行列表 + daysOfWeek 形态；[027-B] rowToTemplate 读时自愈）
 *
 * 覆盖：CRUD + audit log 写入 + A3 owner-check 拒绝跨用户订阅 id。
 * [023-02] 决议 C.1：update() 三场景——rows 未变跳过 owner-check、rows 变化触发 owner-check、跨用户 habit。
 * [027-B] rowToTemplate 读时自愈：旧形状 {start,end} → 新形状 {defaultStart,defaultDuration}。
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
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    rows: [
      {
        id: 'r1',
        activityName: '晨跑',
        start: '06:00',
        end: '07:00',
        source: 'habit',
        sourceId: 'habit-1',
      },
      {
        id: 'r2',
        activityName: '起床',
        start: '07:00',
        end: '07:30',
        source: 'custom',
      },
    ],
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

  function mockUpdateReturning(rows: any[]) {
    return {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(rows)),
        })),
      })),
    }
  }

  function mockUpdateVoid() {
    return {
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(undefined)),
      })),
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
      expect(result[0]?.rows).toHaveLength(2)
      expect(result[0]?.rows[0]?.source).toBe('habit')
      expect(result[0]?.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6])
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
    it('应在 rows 中 source 全部归属当前用户时成功创建并写 audit log', async () => {
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

      // owner-check：rows 仅有 1 条 habit 引用，遍历 → habits select 命中
      txSelect.mockReturnValueOnce(mockSelectWhere([{ id: 'habit-1' }]) as any)
      // task/thread 校验因无 id 直接 skip（不调 select）
      // insert returning → [FAKE_TEMPLATE_ROW]
      txInsert.mockReturnValueOnce(mockInsertReturning([FAKE_TEMPLATE_ROW]) as any)
      // audit log insert → void
      txInsert.mockReturnValueOnce(mockInsertVoid() as any)

      const result = await repo.create(
        {
          name: '工作日模板',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          rows: FAKE_TEMPLATE_ROW.rows,
        },
        MVP_USER,
      )

      expect(result.id).toBe(FAKE_TEMPLATE_ROW.id)
      // [027-B] 读时自愈：rows 经 rowToTemplate 归一为新形状 {defaultStart, defaultDuration}
      expect(result.rows[0]).toMatchObject({ defaultStart: '06:00', defaultDuration: 60, source: 'habit' })
      expect(result.rows[1]).toMatchObject({ defaultStart: '07:00', defaultDuration: 30, source: 'custom' })
      expect(result.rows).toHaveLength(2)
      expect(txInsert).toHaveBeenCalledTimes(2)
    })

    it('A3 owner-check：rows 中 habit 跨用户应抛出', async () => {
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
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            rows: [
              {
                id: 'r1',
                activityName: '晨跑',
                start: '06:00',
                end: '07:00',
                source: 'habit',
                sourceId: 'other-user-habit',
              },
            ],
          },
          MVP_USER,
        ),
      ).rejects.toThrow(/订阅的习惯 .* 不存在或不属于当前用户/)

      expect(txInsert).not.toHaveBeenCalled()
    })
  })

  // ─── update（[023-02] 决议 C.1：rows 引用相等跳过 owner-check） ──
  describe('update', () => {
    it('rows 引用未变时 [027-B] 归一读出触发 owner-check（行列表总是新数组引用）', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txUpdate = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: txUpdate,
          delete: vi.fn(),
        }),
      )

      // [OQ-7 audit] 抓 raw rows 用作 audit log 的 oldValues.rows
      txSelect.mockReturnValueOnce(mockSelectWhere([{ rows: FAKE_TEMPLATE_ROW.rows }]) as any)
      // findById → 返回 FAKE_TEMPLATE_ROW
      txSelect.mockReturnValueOnce(mockSelectWhere([FAKE_TEMPLATE_ROW]) as any)
      // [027-B] rowToTemplate 归一化产生新数组 → old.rows !== input.rows → owner-check 触发
      // owner-check habits → 命中（rows 含 habit-1 引用）
      txSelect.mockReturnValueOnce(mockSelectWhere([{ id: 'habit-1' }]) as any)
      // update returning → [FAKE_TEMPLATE_ROW 重命名后]
      txUpdate.mockReturnValueOnce(mockUpdateReturning([FAKE_TEMPLATE_ROW]) as any)
      // audit log insert → void
      txInsert.mockReturnValueOnce(mockInsertVoid() as any)

      // 引用同一个 rows 数组：意味着编辑器 setState 没换 rows
      const result = await repo.update(
        FAKE_TEMPLATE_ROW.id,
        {
          id: FAKE_TEMPLATE_ROW.id,
          name: '工作日模板 V2',
          daysOfWeek: FAKE_TEMPLATE_ROW.daysOfWeek,
          rows: FAKE_TEMPLATE_ROW.rows, // 同一引用
        },
        MVP_USER,
      )

      expect(result.id).toBe(FAKE_TEMPLATE_ROW.id)
      // [OQ-7] + findById + habits：raw rows 1 + findById 1 + habits 1 = 3 次 select
      expect(txSelect).toHaveBeenCalledTimes(3)
      expect(txUpdate).toHaveBeenCalledTimes(1)
    })

    it('应在 rows 引用变化时触发 owner-check', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txUpdate = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: txUpdate,
          delete: vi.fn(),
        }),
      )

      // [OQ-7 audit] 抓 raw rows
      txSelect.mockReturnValueOnce(mockSelectWhere([{ rows: FAKE_TEMPLATE_ROW.rows }]) as any)
      // findById → 返回 FAKE_TEMPLATE_ROW
      txSelect.mockReturnValueOnce(mockSelectWhere([FAKE_TEMPLATE_ROW]) as any)
      // owner-check habits → 命中（rows 引用变了 = 重新校验）
      txSelect.mockReturnValueOnce(mockSelectWhere([{ id: 'habit-1' }]) as any)
      // update returning → [FAKE_TEMPLATE_ROW]
      txUpdate.mockReturnValueOnce(mockUpdateReturning([FAKE_TEMPLATE_ROW]) as any)
      // audit log insert → void
      txInsert.mockReturnValueOnce(mockInsertVoid() as any)

      // 全新 rows 数组（不同引用）→ 触发 owner-check
      // 仅含 habit-1（FAKE_TEMPLATE_ROW 已有），所以 owner-check 命中
      const newRows: Array<typeof FAKE_TEMPLATE_ROW.rows[number]> = [
        {
          id: 'r1',
          activityName: '晨跑',
          start: '06:00',
          end: '07:00',
          source: 'habit',
          sourceId: 'habit-1',
        },
      ]

      await repo.update(
        FAKE_TEMPLATE_ROW.id,
        {
          id: FAKE_TEMPLATE_ROW.id,
          name: FAKE_TEMPLATE_ROW.name,
          daysOfWeek: FAKE_TEMPLATE_ROW.daysOfWeek,
          rows: newRows,
        },
        MVP_USER,
      )

      // [OQ-7] + owner-check：raw rows 1 + findById 1 + habits 1 = 3 次 select
      expect(txSelect).toHaveBeenCalledTimes(3)
      expect(txUpdate).toHaveBeenCalledTimes(1)
    })

    it('A3 owner-check：update rows 中 habit 跨用户应抛出', async () => {
      const { db } = await import('@/lib/db')
      const txSelect = vi.fn()
      const txUpdate = vi.fn()
      const txInsert = vi.fn()
      vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
        fn({
          select: txSelect,
          insert: txInsert,
          update: txUpdate,
          delete: vi.fn(),
        }),
      )

      // [OQ-7 audit] 抓 raw rows（在 owner-check 抛出前也会跑一次）
      txSelect.mockReturnValueOnce(mockSelectWhere([{ rows: FAKE_TEMPLATE_ROW.rows }]) as any)
      // findById → 返回 FAKE_TEMPLATE_ROW
      txSelect.mockReturnValueOnce(mockSelectWhere([FAKE_TEMPLATE_ROW]) as any)
      // owner-check habits → 空（跨用户 → 拒绝）
      txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)

      const newRows = [
        {
          id: 'r9',
          activityName: '跨用户 habit',
          start: '06:00',
          end: '07:00',
          source: 'habit' as const,
          sourceId: 'other-user-habit',
        },
      ]

      await expect(
        repo.update(
          FAKE_TEMPLATE_ROW.id,
          {
            id: FAKE_TEMPLATE_ROW.id,
            name: '尝试改 rows',
            daysOfWeek: FAKE_TEMPLATE_ROW.daysOfWeek,
            rows: newRows,
          },
          MVP_USER,
        ),
      ).rejects.toThrow(/订阅的习惯 .* 不存在或不属于当前用户/)

      // owner-check 失败：不应有 update/insert
      expect(txUpdate).not.toHaveBeenCalled()
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

  // ─── [027-B] rowToTemplate 读时自愈 ────────────────────────
  // 直接单测 rowToTemplate：旧形状 rows 读出后应已归一为新形状。
  // 不连真实 DB（rowToTemplate 是纯映射函数）。
  describe('rowToTemplate — 读时自愈', () => {
    it('旧形状 {start,end} 行归一为 defaultStart + defaultDuration', async () => {
      const mod = await import('../timebox-template')
      const out = mod.rowToTemplate({
        id: 't1', userId: 'u1', schemaVersion: 1, name: '旧模板',
        daysOfWeek: [1, 2, 3, 4, 5],
        rows: [
          { id: 'r1', activityName: '起床', start: '07:00', end: '07:30', source: 'custom' },
          { id: 'r2', activityName: '睡眠', start: '23:00', end: '07:00', source: 'custom' },
        ],
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
      } as never)
      expect(out.rows[0]).toMatchObject({ defaultStart: '07:00', defaultDuration: 30 })
      expect(out.rows[1]).toMatchObject({ defaultStart: '23:00', defaultDuration: 480 })
      expect(out.rows[0]).not.toHaveProperty('start')
    })
    it('新形状行直通', async () => {
      const mod = await import('../timebox-template')
      const out = mod.rowToTemplate({
        id: 't2', userId: 'u1', schemaVersion: 1, name: '新模板',
        daysOfWeek: [],
        rows: [{ id: 'r', activityName: 'x', defaultStart: '09:00', defaultDuration: 60, source: 'custom' }],
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      } as never)
      expect(out.rows[0]).toMatchObject({ defaultStart: '09:00', defaultDuration: 60, earliestStart: null })
    })
  })
})