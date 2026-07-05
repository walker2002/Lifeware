/**
 * @file batch-proposals-limit.test.ts
 * @brief [023.10] T6 — A3 findByUserId limit 200 → 2000 + 201 synthetic fixture 全可见
 *         (Codex #7 path 修订: 实际 nexus/ai-runtime/memory/, 不是 domains/timebox/)
 *
 * 复用 [023.08] T4 fake EpisodeRepository 模式（与 batch-proposals.test.ts 同结构），
 * 仅切换 limit 行为断言 201 episode 不被硬截断。
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

import { recordBatchProposals, getRevertableBatches } from '../batch-proposals'

const TEST_USER_ID = '00000000-0000-0000-0000-00002010aaaa'
const TEST_SESSION = 'session-201-fixture'

beforeEach(() => {
  episodeStore = []
  idCounter = 1
})

describe('batch-proposals limit (A3 fix)', () => {
  // [023.10] T6 — 旧 limit 200 静默丢第 201 个 batch
  it('201 episodes 全部 getRevertableBatches 可见（不含旧 200 限制）', async () => {
    // 注：recordBatchProposals 内部 mock findByUserId 也走 .slice(0, limit)，
    //     若 batch-proposals.ts 仍传 200，fake repo 也只返 200。
    //     我们的 fake repo 不限制 limit 入参,真实判断点是 batch-proposals.ts 里传的 limit 数值。
    // 用 spy 抓 findByUserId 入参验证。
    const fakeRepoModule = await import('@/lib/db/repositories/episode.repository')
    const spy = vi.spyOn(fakeRepoModule.EpisodeRepository.prototype, 'findByUserId')

    for (let i = 0; i < 201; i++) {
      await recordBatchProposals({
        sessionId: TEST_SESSION,
        userId: TEST_USER_ID,
        proposals: [{ id: `p-${i}`, timeboxId: `tb-${i}` }],
      })
    }

    const batches = await getRevertableBatches({
      sessionId: TEST_SESSION,
      userId: TEST_USER_ID,
      windowMs: 5 * 60 * 1000,
    })

    // 验证调用使用的是 limit >= 2000
    expect(spy).toHaveBeenCalled()
    const limitArg = spy.mock.calls[0][1]
    expect(limitArg).toBeGreaterThanOrEqual(2000)

    // 验证 201 episodes 全部可见
    expect(batches).toHaveLength(201)
  })
})
