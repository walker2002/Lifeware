// Episode Repository — Memory L2 摘要记录持久化
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

    return row as MemoryEpisodeRecord
  }

  async findBySessionId(sessionId: string): Promise<MemoryEpisodeRecord[]> {
    const rows = await db
      .select()
      .from(memoryEpisodes)
      .where(eq(memoryEpisodes.sessionId, sessionId))
      .orderBy(desc(memoryEpisodes.createdAt))

    return rows as MemoryEpisodeRecord[]
  }

  async findByUserId(userId: string, limit = 50): Promise<MemoryEpisodeRecord[]> {
    const rows = await db
      .select()
      .from(memoryEpisodes)
      .where(eq(memoryEpisodes.userId, userId))
      .orderBy(desc(memoryEpisodes.createdAt))
      .limit(limit)

    return rows as MemoryEpisodeRecord[]
  }
}
