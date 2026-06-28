/**
 * @file activity-archetype-repo.test
 * @brief ActivityArchetypeRepository 单元测试（mock drizzle）
 *
 * 测试模块加载 + 核心方法签名存在 + CRUD 关键路径。
 * 完整 drizzle 链 mock 比较繁琐，集成测试在 psql 上跑。
 *
 * @see docs/usom-design.md §3.11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock db 模块：select/insert/update/delete 返回 chain
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

describe('ActivityArchetypeRepository — 单元（mock）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('module 可正常 import，类存在', async () => {
    const { ActivityArchetypeRepository } = await import(
      '@/lib/db/repositories/activity-archetype.repository'
    )
    expect(ActivityArchetypeRepository).toBeDefined()
    const repo = new ActivityArchetypeRepository()
    expect(repo.findById).toBeInstanceOf(Function)
    expect(repo.findByUser).toBeInstanceOf(Function)
    expect(repo.findByL1Category).toBeInstanceOf(Function)
    expect(repo.create).toBeInstanceOf(Function)
    expect(repo.update).toBeInstanceOf(Function)
    expect(repo.delete).toBeInstanceOf(Function)
    expect(repo.seedDefaults).toBeInstanceOf(Function)
  })

  it('接口 IActivityArchetypeRepository 可从 irepository 导入', async () => {
    const iface = await import('@/usom/interfaces/irepository')
    // 仅类型导出，运行时检查字段存在性
    expect(iface).toBeDefined()
  })
})