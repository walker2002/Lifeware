import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../index', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn() })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
  },
}))

describe('L1MessageRepository', () => {
  let repo: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { L1MessageRepository } = await import('../l1-message.repository')
    repo = new L1MessageRepository()
  })

  it('append 插入一条消息', async () => {
    const { db } = await import('../../index')
    await repo.append({ sessionId: 's1', userId: 'u1', role: 'user', content: 'hello' })
    expect(db.insert).toHaveBeenCalled()
  })

  it('findBySessionId 返回按时间排序的消息列表', async () => {
    const { db } = await import('../../index')
    const mockMsgs = [
      { id: '1', sessionId: 's1', userId: 'u1', role: 'user', content: 'hi', intentRef: null, cnuiSurface: null, createdAt: new Date(), deletedAt: null },
    ]
    const mockOrderBy = vi.fn(() => Promise.resolve(mockMsgs))
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }))
    ;(db.select as any).mockReturnValue({ from: vi.fn(() => ({ where: mockWhere })) })

    const msgs = await repo.findBySessionId('s1', 'u1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('softDeleteBySessionId 设置 deleted_at', async () => {
    await repo.softDeleteBySessionId('s1', 'u1')
    const { db } = await import('../../index')
    expect(db.update).toHaveBeenCalled()
  })

  it('restoreBySessionId 清除 deleted_at', async () => {
    await repo.restoreBySessionId('s1', 'u1')
    const { db } = await import('../../index')
    expect(db.update).toHaveBeenCalled()
  })

  it('hardDeleteExpired 调用 delete', async () => {
    await repo.hardDeleteExpired(60)
    const { db } = await import('../../index')
    expect(db.delete).toHaveBeenCalled()
  })
})
