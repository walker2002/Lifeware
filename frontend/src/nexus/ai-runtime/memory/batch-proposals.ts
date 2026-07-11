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
 * ───────────────────────────────────────────────────────────────────────
 * [F4 fold] **架构决定：故意绕过 MemoryFramework.l2 抽象层直接使用 EpisodeRepository**
 * ───────────────────────────────────────────────────────────────────────
 *
 * 背景：brief plan 假设存在 `MemoryFramework.l2.{createEpisode, readEpisode,
 *   updateEpisode, listEpisodesByKind}` 这套 CRUD API；T4 实现时核对现状发现
 *   `MemoryL2Episode` interface（memory/layers/l2-episode.ts:20-22）实际仅暴露
 *   `generateSummary(data, aiRuntime)` —— 它是"无状态的 AI 摘要生成器",
 *   完全不提供 episode 的持久化 / 读取 / 元数据更新入口。MemoryFramework.l1
 *   倒是包了 L1MessageRepository,所以会话抽象走通;但 l2 没有 episode repo 注入。
 *
 * 决策：本模块直接 import `@/lib/db/repositories/episode.repository` 的
 *   `EpisodeRepository`,调用其 `record` / `findByUserId` / `updateMetadata`。
 *   这三个方法都打在同一个 `memory_episodes` 表上,与 MemoryFramework 概念上
 *   期望的 l2 CRUD 完全等价 —— 所以 [F4] 语义要求（真实持久化到
 *   memory_episodes）100% 保留,blast radius 没有意外扩散。
 *
 * WHY 不在 T4 顺势扩 MemoryL2Episode 接口：
 *   1. 范围控制：T4 的 core 是 batch undo(state machine + retry +
 *      enumeration defense);扩 l2 interface 会把 blast radius 扩到所有
 *      MemoryFramework 构造路径(createMemoryFramework singleton 等)
 *      与潜在的 future l2 调用方
 *   2. l2 当前层语义是"AI 摘要",不是"episode 存储";把 episode CRUD 强行
 *      塞进一个以 aiRuntime 注入为特征的接口上是语义错位
 *   3. 没有真实的 l2 调用方需要 episode CRUD;现在加方法等于"为用而写"
 *
 * 已知后果 / 风险：
 *   - 如果将来 MemoryFramework 的设计意图是要所有 episode 访问都走 l2
 *     (例如 future ticket 想加 l2 层的缓存 / 校验 / 审计),这个文件会
 *     绕开那一层。要新增此类横切关注点时,必须【先】迁移本模块再到 l2
 *     加装饰,否则 silent stale。
 *   - 后续读者可能误判:"既然是 L2 episode,为什么 batch-proposals 直接
 *     动 lib/db 的 EpisodeRepository?是不是应该扩 l2 接口?" —— 本 header
 *     显式回答:NO,是 explicit decision,见下方 TODO。
 *   - 由于 singleton MemoryFramework + 本模块独立持有 repo 实例,短期
 *     不会出现 repo 状态分裂;但 future ticket 重构 EpisodeRepository
 *     构造方式时,本模块需要同步跟进。
 *
 * TODO([023.x] 在 [023.08] 后启动的下一个 023 ticket 内执行):
 *   - 在 `MemoryL2Episode` interface（memory/layers/l2-episode.ts:20-22）
 *     增加 4 个方法：`createEpisode` / `readEpisode` /
 *     `updateEpisode` / `listEpisodesByKind`。内部委托给
 *     `EpisodeRepository`(与本模块现在的做法一致)。
 *   - 同时调整 `createMemoryFramework()`(memory/index.ts:10) 接受
 *     `EpisodeRepository` 注入,让 l2 层具备横切关注点(caching /
 *     validation / audit)的实施空间。
 *   - 迁移本模块 3 个 export 函数(recordBatchProposals /
 *     revertBatchProposals / getRevertableBatches)改用
 *     `createMemoryFramework().l2.xxxEpisode(...)` 调用,删除
 *     `import { EpisodeRepository } from '@/lib/db/repositories/episode.repository'`。
 *   - 追踪项:上述迁移完成前,任何在 l2 层加的横切逻辑对本模块无效 —— 这是
 *     本决策的显式警告,不要在被遗忘的状态下上线 l2 装饰。
 *
 * 经核实（2026-07-05）：memory/types.ts:18 MemoryFramework 接口、
 *   memory/layers/l2-episode.ts:20-22 MemoryL2Episode 接口定义、
 *   memory/layers/l1-session.ts:1-33 createMemoryL1 已注入 repo 实例、
 *   memory/index.ts:10-19 createMemoryFramework 构造路径。
 *   lib/db/repositories/episode.repository.ts 暴露 record /
 *   findByUserId / updateMetadata,落 memory_episodes 表。
 *   一切现状与上方"决策 / WHY / 已知后果 / TODO"一致。
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
 * [028] T9: action 字段 'createSmartTimeboxes' → 'scheduleProposal'（与 manifest intent_triggers.action 同步）。
 *   getRevertableBatches (line 233-242) filter 不读 action 字段，rename 不影响撤销路径。
 */
export async function recordBatchProposals(input: RecordBatchInput): Promise<string> {
  const repo = new EpisodeRepository()
  const acceptedAt = Date.now()
  const row = await repo.record({
    userId: input.userId,
    sessionId: input.sessionId,
    domainId: 'timebox',
    action: 'scheduleProposal',
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
  // [023.10] T6 — limit 200 → 2000 (旧 hard limit 200 在 episode 累积后让 >200 batch 静默不可见)
  const all = await repo.findByUserId(input.userId, 2000)
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
  // [023.10] T6 — limit 200 → 2000
  const all = await repo.findByUserId(input.userId, 2000)
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