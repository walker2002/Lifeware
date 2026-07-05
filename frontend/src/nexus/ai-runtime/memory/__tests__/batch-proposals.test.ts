/**
 * @file batch-proposals.test
 * @brief [023.08] T4 batch undo — memory record + revert + 5 分钟 TTL
 *
 * 测试 F4+F8+CT1 folds:
 * - F4: 写 memory_episodes 表 (episodeType='batch_proposals') 经 EpisodeRepository
 * - F8: status state machine (active / partial / reverted)
 * - CT1: 跨 userId 调用静默返 empty（防 enumeration leak）
 *
 * 注：vitest 用 `vi.mock('@/lib/db/index')` mock DB（与 phase7-memory.test.ts 同模式），
 *     不依赖真实 PG 启动。in-memory state 跟踪所有 call。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── In-memory DB state ────────────────────────────────────────
type EpisodeRow = {
  id: string
  userId: string
  sessionId: string | null
  domainId: string | null
  action: string | null
  episodeType: string
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
}

let episodeStore: EpisodeRow[] = []
let idCounter = 1
function nextUuid(): string {
  return `00000000-0000-0000-0000-${String(idCounter++).padStart(12, '0')}`
}
function nowIso(): string {
  return new Date().toISOString()
}

// Mock EpisodeRepository directly (cleaner than mocking drizzle query builders —
// drizzle's eq() returns a SQL node that mocks can't easily inspect).
vi.mock('@/lib/db/repositories/episode.repository', () => {
  return {
    EpisodeRepository: class FakeEpisodeRepository {
      async record(ep: Omit<EpisodeRow, 'id' | 'createdAt'>) {
        const row: EpisodeRow = {
          id: nextUuid(),
          userId: ep.userId,
          sessionId: ep.sessionId,
          domainId: ep.domainId,
          action: ep.action,
          episodeType: ep.episodeType,
          summary: ep.summary,
          metadata: ep.metadata,
          createdAt: nowIso(),
        }
        episodeStore.push(row)
        return row
      }
      async findBySessionId(sessionId: string) {
        return episodeStore
          .filter(r => r.sessionId === sessionId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }
      async findByUserId(userId: string, limit = 50) {
        return episodeStore
          .filter(r => r.userId === userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      }
      async updateMetadata(id: string, patch: { metadata?: Record<string, unknown>; summary?: string }) {
        const idx = episodeStore.findIndex(r => r.id === id)
        if (idx >= 0) {
          episodeStore[idx] = {
            ...episodeStore[idx],
            metadata: patch.metadata !== undefined
              ? { ...episodeStore[idx].metadata, ...patch.metadata }
              : episodeStore[idx].metadata,
            summary: patch.summary ?? episodeStore[idx].summary,
          }
        }
      }
    },
  }
})

// ─── Tests ─────────────────────────────────────────────────────
import { recordBatchProposals, revertBatchProposals, getRevertableBatches } from '../batch-proposals'
import { resetMemoryFramework } from '../index'

beforeEach(() => {
  episodeStore = []
  idCounter = 1
  resetMemoryFramework()
})

describe('batch-proposals', () => {
  it('recordBatchProposals 写 memory_episode 并返 batchId', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-1',
      userId: '00000000-0000-0000-0000-000000000001',
      proposals: [{ id: 'p1', title: 'task 1' }, { id: 'p2', title: 'task 2' }],
    })
    expect(batchId).toBeTruthy()
    expect(episodeStore.length).toBe(1)
    expect(episodeStore[0].episodeType).toBe('batch_proposals')
  })

  it('revertBatchProposals 调 deleteTimebox 每条 + 标 reverted', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-2',
      userId: '00000000-0000-0000-0000-000000000001',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    const deletedIds: string[] = []
    const result = await revertBatchProposals({
      batchId,
      userId: '00000000-0000-0000-0000-000000000001',
      deleteTimebox: async (id) => { deletedIds.push(id); return { success: true } },
    })
    expect(result.success).toBe(true)
    expect(deletedIds).toEqual(['tb-1', 'tb-2'])
  })

  it('revert 部分失败时仍继续,返 succeeded/failed 明细', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-3',
      userId: '00000000-0000-0000-0000-000000000001',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    const result = await revertBatchProposals({
      batchId,
      userId: '00000000-0000-0000-0000-000000000001',
      deleteTimebox: async (id) => id === 'tb-1'
        ? { success: true }
        : { success: false, error: 'not found' },
    })
    expect(result.succeeded).toEqual(['tb-1'])
    expect(result.failed).toEqual([{ id: 'tb-2', error: 'not found' }])
  })

  it('getRevertableBatches 仅列 5 分钟内未 revert 的 batch', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-4',
      userId: '00000000-0000-0000-0000-000000000001',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    const batches = await getRevertableBatches({
      sessionId: 'session-4',
      userId: '00000000-0000-0000-0000-000000000001',
      windowMs: 5 * 60 * 1000,
    })
    expect(batches.map(b => b.batchId)).toContain(batchId)
  })

  // [G5 fold]: DB 真实写入 (memory_episodes 表) — 用 mock db 验证 insert 调用 + payload
  it('[G5] recordBatchProposals 持久化到 memory_episodes (episodeType=batch_proposals)', async () => {
    const userId = '00000000-0000-0000-0000-00000000db01'
    const batchId = await recordBatchProposals({
      sessionId: 'session-db-1',
      userId,
      proposals: [{ id: 'p1', timeboxId: 'tb-1', title: 'db-test' }],
    })
    expect(episodeStore.length).toBe(1)
    const row = episodeStore[0]
    expect(row.id).toBe(batchId)
    expect(row.episodeType).toBe('batch_proposals')
    expect(row.userId).toBe(userId)
    expect(row.metadata).toMatchObject({
      ownerUserId: userId,
      status: 'active',
      failedItems: [],
      proposals: [{ id: 'p1', timeboxId: 'tb-1', title: 'db-test' }],
    })
  })

  // [G7 fold]: 部分失败 retry — status=partial 时只重试 failed items
  it('[G7] revertBatchProposals status=partial retry 只重试 failed items', async () => {
    const userId = '00000000-0000-0000-0000-00000000g7ff'
    const batchId = await recordBatchProposals({
      sessionId: 'session-g7',
      userId,
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }, { id: 'p2', timeboxId: 'tb-2' }],
    })
    // 第一次 revert: tb-1 成功, tb-2 失败 → status=partial
    const r1 = await revertBatchProposals({
      batchId,
      userId,
      deleteTimebox: async (id) => id === 'tb-1'
        ? { success: true }
        : { success: false, error: 'not found' },
    })
    expect(r1.succeeded).toEqual(['tb-1'])
    expect(r1.failed).toEqual([{ id: 'tb-2', error: 'not found' }])

    // 第二次 revert (retry): 应只重试 tb-2 (status=partial)
    const r2 = await revertBatchProposals({
      batchId,
      userId,
      deleteTimebox: async (id) => {
        expect(id).toBe('tb-2')
        return { success: true }
      },
    })
    expect(r2.succeeded).toEqual(['tb-2'])
    expect(r2.failed).toEqual([])
  })

  // [G8 fold]: userId mismatch permission check — silent empty return
  it('[G8] revertBatchProposals 跨 userId 调用返回 empty 不泄露', async () => {
    const batchId = await recordBatchProposals({
      sessionId: 'session-g8',
      userId: '00000000-0000-0000-0000-000000000aaa',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    // attacker 用不同 userId 调 revert
    const deletedIds: string[] = []
    const r = await revertBatchProposals({
      batchId,
      userId: '00000000-0000-0000-0000-00000000bbb',
      deleteTimebox: async (id) => { deletedIds.push(id); return { success: true } },
    })
    expect(r.succeeded).toEqual([])
    expect(r.failed).toEqual([])
    expect(deletedIds).toEqual([]) // 跨 user 没 delete 任何
  })

  // [G8 fold]: getRevertableBatches userId mismatch
  it('[G8] getRevertableBatches 跨 userId 调用返回 empty', async () => {
    await recordBatchProposals({
      sessionId: 'session-g8b',
      userId: '00000000-0000-0000-0000-000000000aaa',
      proposals: [{ id: 'p1', timeboxId: 'tb-1' }],
    })
    const batches = await getRevertableBatches({
      sessionId: 'session-g8b',
      userId: '00000000-0000-0000-0000-00000000bbb',
      windowMs: 5 * 60 * 1000,
    })
    expect(batches).toEqual([])
  })
})