import { eq, and, isNull, or, lt, sql } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IL1MessageRepository } from '../../../usom/interfaces/irepository'
import type { ChatMessage, CnuiSurfaceRef } from '../../../usom/types/objects'

export class L1MessageRepository implements IL1MessageRepository {
  async append(message: {
    sessionId: string; userId: string; role: string; content: string
    intentRef?: string; cnuiSurface?: Record<string, unknown> | CnuiSurfaceRef
  }): Promise<void> {
    await db.insert(s.l1Messages).values({
      sessionId: message.sessionId,
      userId: message.userId,
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      intentRef: message.intentRef ?? null,
      cnuiSurface: message.cnuiSurface as Record<string, unknown> | null ?? null,
    })
  }

  async findBySessionId(sessionId: string, userId: string): Promise<ChatMessage[]> {
    const rows = await db.select()
      .from(s.l1Messages)
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
        isNull(s.l1Messages.deletedAt),
      ))
      .orderBy(s.l1Messages.createdAt)

    return rows.map(r => ({
      id: r.id,
      role: r.role as ChatMessage['role'],
      content: r.content,
      timestamp: r.createdAt.toISOString(),
      intentRef: r.intentRef ?? undefined,
      cnuiSurface: r.cnuiSurface as unknown as ChatMessage['cnuiSurface'],
    }))
  }

  async softDeleteBySessionId(sessionId: string, userId: string): Promise<void> {
    await db.update(s.l1Messages)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
        isNull(s.l1Messages.deletedAt),
      ))
  }

  async restoreBySessionId(sessionId: string, userId: string): Promise<void> {
    await db.update(s.l1Messages)
      .set({ deletedAt: null })
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
      ))
  }

  async hardDeleteExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000)

    // 删除条件：软删除超期 或 正常消息超期
    const results = await db.delete(s.l1Messages).where(
      or(
        // 软删除超期
        sql`${s.l1Messages.deletedAt} IS NOT NULL AND ${s.l1Messages.deletedAt} < ${cutoff}`,
        // 正常消息超期
        sql`${s.l1Messages.createdAt} < ${cutoff}`,
      )!
    ).returning({ id: s.l1Messages.id })

    return results.length
  }
}
