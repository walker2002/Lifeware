/**
 * @file batch-proposals
 * @brief [023.08] T4 batch undo — AI session state 记录 batch proposals, 5 分钟内可 revert [F4+F8+CT1]
 *
 * 设计：
 * - [F4] 用 memory_episodes 表 (episodeType='batch_proposals') 持久化 batch record:
 *   metadata = { proposals, ownerUserId, acceptedAt, status, failedItems }
 * - [CT1] revert/getRevertableBatches 验证 ownerUserId === callerUserId, mismatch 静默返 empty
 *   (不泄露 batchId 存在性,防御 enumeration attack)
 * - [F8] status state machine:
 *   - 'active': 未 revert / 部分 revert 未完成
 *   - 'partial': 部分 deleteTimebox 失败, retry 时只重试 failedItems
 *   - 'reverted': 全部 succeeded, getRevertableBatches 不再列
 * - 5 分钟 TTL: getRevertableBatches 仅列 window 内 status === 'active' 的 batch
 * - 部分失败容错: deleteTimebox 失败一条不阻断其他;retry 走 metadata.failedItems
 *
 * 实现注：当前 MemoryL2Episode interface 仅暴露 generateSummary（AI 摘要），
 *   不暴露 episode CRUD。本模块直接用 EpisodeRepository（lib/db）落 memory_episodes 表，
 *   并通过 EpisodeRepository.updateMetadata 支持 F8 retry status state machine。
 *   （是 brief plan 的 API adaptation；plan 假设 l2.createEpisode/updateEpisode 已存在,
 *   实际未存在 — 经读 memory/types.ts + memory/layers/l2-episode.ts + episode.repository.ts 确认）
 */
import { EpisodeRepository } from '@/lib/db/repositories/episode.repository'

export interface BatchProposalItem {
  id: string
  timeboxId?: string
  title?: string
}

export type BatchStatus = 'active' | 'partial' | 'reverted'

export interface RecordBatchInput {
  sessionId: string
  userId: string
  proposals: BatchProposalItem[]
}

export interface RevertBatchInput {
  batchId: string
  userId: string
  deleteTimebox: (id: string) => Promise<{ success: boolean; error?: string }>
}

export interface RevertBatchResult {
  success: boolean
  succeeded: string[]
  failed: Array<{ id: string; error: string }>
}

export interface RevertableBatch {
  batchId: string
  acceptedAt: number
  proposals: BatchProposalItem[]
}

interface BatchMetadata {
  proposals: BatchProposalItem[]
  ownerUserId: string
  acceptedAt: number
  status: BatchStatus
  failedItems: BatchProposalItem[]
  failedErrors?: Record<string, string>  // timeboxId → error message
}

/**
 * Record a batch of accepted proposals. Persists to memory_episodes table via EpisodeRepository.
 * [F4 fold]: Replaces in-memory stub with real DB write.
 */
export async function recordBatchProposals(input: RecordBatchInput): Promise<string> {
  const repo = new EpisodeRepository()
  const acceptedAt = Date.now()
  const row = await repo.record({
    userId: input.userId,
    sessionId: input.sessionId,
    domainId: 'timebox',
    action: 'createSmartTimeboxes',
    episodeType: 'batch_proposals',
    summary: `batch_proposals:${input.proposals.length} items`,
    metadata: {
      proposals: input.proposals,
      ownerUserId: input.userId,
      acceptedAt,
      status: 'active' as BatchStatus,
      failedItems: [] as BatchProposalItem[],
    } satisfies BatchMetadata,
  })
  return row.id
}

/**
 * Revert a batch by deleting each timebox. [CT1 fold] verify ownerUserId === userId.
 * [F8 fold] Use status state machine; on partial failure, persist failedItems for retry.
 */
export async function revertBatchProposals(input: RevertBatchInput): Promise<RevertBatchResult> {
  const repo = new EpisodeRepository()

  // 读取 batch episode (by session+id 简化查找：先按 userId 列,再 filter)
  // [F4 adaptation] EpisodeRepository 当前无 findById;用 findByUserId 拉全集再 filter id
  const all = await repo.findByUserId(input.userId, 200)
  const episode = all.find(ep => ep.id === input.batchId)
  const meta = episode?.metadata as Partial<BatchMetadata> | undefined

  // [CT1 fold] permission check — silent return empty (no leak of batchId existence)
  // 注意：findByUserId 已按 userId 过滤,所以 'episode not found' 也涵盖 userId mismatch 的隐式场景。
  // 但为防御 enumeration,我们额外校验 ownerUserId（防止 user 拥有 batch 但 batch 不归 user 所有）
  if (!episode || !meta || meta.ownerUserId !== input.userId) {
    return { success: false, succeeded: [], failed: [] }
  }

  // [F8 fold] status check — already fully reverted, no-op
  if (meta.status === 'reverted') {
    return { success: true, succeeded: [], failed: [] }
  }

  // [F8 fold] retry logic — partial 状态只重试 failedItems
  const itemsToRetry: BatchProposalItem[] =
    meta.status === 'partial' && Array.isArray(meta.failedItems) && meta.failedItems.length > 0
      ? meta.failedItems
      : (meta.proposals ?? [])

  const succeeded: string[] = []
  const failedItems: BatchProposalItem[] = []
  const failedErrors: Record<string, string> = {}

  for (const p of itemsToRetry) {
    if (!p.timeboxId) continue
    try {
      const r = await input.deleteTimebox(p.timeboxId)
      if (r.success) {
        succeeded.push(p.timeboxId)
      } else {
        failedItems.push(p)
        failedErrors[p.timeboxId] = r.error ?? 'unknown'
      }
    } catch (e) {
      failedItems.push(p)
      failedErrors[p.timeboxId] = e instanceof Error ? e.message : 'unknown'
    }
  }

  // [F8 fold] update episode metadata — status + failedItems
  const newStatus: BatchStatus = failedItems.length === 0 ? 'reverted' : 'partial'
  const newMeta: BatchMetadata = {
    proposals: meta.proposals ?? [],
    ownerUserId: meta.ownerUserId ?? input.userId,
    acceptedAt: meta.acceptedAt ?? Date.now(),
    status: newStatus,
    failedItems,
    failedErrors,
  }
  await repo.updateMetadata(input.batchId, { metadata: newMeta as unknown as Record<string, unknown> })

  return {
    success: newStatus === 'reverted',
    succeeded,
    failed: failedItems
      .filter(p => !!p.timeboxId)
      .map(p => ({ id: p.timeboxId!, error: failedErrors[p.timeboxId!] ?? 'unknown' })),
  }
}

/**
 * List revertable batches within windowMs. [CT1 fold] filter by ownerUserId === userId.
 * [F8 fold] only status='active' (i.e. exclude 'reverted' and 'partial' that already
 *   represents an in-progress retry — caller can still invoke revert on it).
 */
export async function getRevertableBatches(input: {
  sessionId: string
  userId: string
  windowMs: number
}): Promise<RevertableBatch[]> {
  const repo = new EpisodeRepository()
  const now = Date.now()
  const all = await repo.findByUserId(input.userId, 200)
  return all
    .filter(ep => {
      if (ep.episodeType !== 'batch_proposals') return false
      const meta = ep.metadata as Partial<BatchMetadata> | undefined
      if (!meta || meta.ownerUserId !== input.userId) return false
      if (meta.status !== 'active') return false
      if (typeof meta.acceptedAt !== 'number') return false
      if (now - meta.acceptedAt > input.windowMs) return false
      return true
    })
    .map(ep => {
      const meta = ep.metadata as unknown as BatchMetadata
      return {
        batchId: ep.id,
        acceptedAt: meta.acceptedAt,
        proposals: meta.proposals,
      }
    })
}