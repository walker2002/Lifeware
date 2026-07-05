/**
 * @file episode.repository
 * @brief Memory L2 Episode 仓储 — memory_episodes 表 CRUD（[023.08] T4 加 updateMetadata 支持 batch_proposals retry）
 */
import { db } from '@/lib/db'
import { memoryEpisodes } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export interface MemoryEpisodeRecord {
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

export class EpisodeRepository {
  async record(episode: Omit<MemoryEpisodeRecord, 'id' | 'createdAt'>): Promise<MemoryEpisodeRecord> {
    const [row] = await db.insert(memoryEpisodes).values({
      userId: episode.userId,
      sessionId: episode.sessionId,
      domainId: episode.domainId,
      action: episode.action,
      episodeType: episode.episodeType,
      summary: episode.summary,
      metadata: episode.metadata,
    }).returning()

    return row as unknown as MemoryEpisodeRecord
  }

  async findBySessionId(sessionId: string): Promise<MemoryEpisodeRecord[]> {
    const rows = await db
      .select()
      .from(memoryEpisodes)
      .where(eq(memoryEpisodes.sessionId, sessionId))
      .orderBy(desc(memoryEpisodes.createdAt))

    return rows as unknown as MemoryEpisodeRecord[]
  }

  async findByUserId(userId: string, limit = 50): Promise<MemoryEpisodeRecord[]> {
    const rows = await db
      .select()
      .from(memoryEpisodes)
      .where(eq(memoryEpisodes.userId, userId))
      .orderBy(desc(memoryEpisodes.createdAt))
      .limit(limit)

    return rows as unknown as MemoryEpisodeRecord[]
  }

  // [023.08] T4 — 局部更新 metadata/summary（用于 batch_proposals retry status）
  async updateMetadata(
    id: string,
    patch: { metadata?: Record<string, unknown>; summary?: string }
  ): Promise<void> {
    const setClause: Record<string, unknown> = {}
    if (patch.metadata !== undefined) setClause.metadata = patch.metadata
    if (patch.summary !== undefined) setClause.summary = patch.summary
    if (Object.keys(setClause).length === 0) return
    await db
      .update(memoryEpisodes)
      .set(setClause)
      .where(eq(memoryEpisodes.id, id))
  }
}
