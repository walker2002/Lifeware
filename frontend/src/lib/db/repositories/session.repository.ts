import { eq, and, desc, lt } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IAISessionRepository } from '../../../usom/interfaces/irepository'
import type { AISession, AISessionSummary, ChatMessage } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { aiSessionRowToUSOM, aiSessionUSOMToRow } from './mappers'

export class AISessionRepository implements IAISessionRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<AISession | null> {
    const rows = await db.select().from(s.aiSessions)
      .where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
    return rows[0] ? aiSessionRowToUSOM(rows[0]) : null
  }

  async findByUserId(userId: USOM_ID): Promise<AISessionSummary[]> {
    const rows = await db.select({
      id: s.aiSessions.id,
      title: s.aiSessions.title,
      status: s.aiSessions.status,
      createdAt: s.aiSessions.createdAt,
      updatedAt: s.aiSessions.updatedAt,
    }).from(s.aiSessions)
      .where(eq(s.aiSessions.userId, userId))
      .orderBy(desc(s.aiSessions.updatedAt))

    return rows
      .filter(r => r.status !== 'deleted')
      .map(r => ({
        id: r.id,
        title: r.title,
        status: r.status as AISessionSummary['status'],
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }))
  }

  async create(session: Omit<AISession, 'id' | 'createdAt' | 'updatedAt'>, userId: USOM_ID): Promise<AISession> {
    const row = aiSessionUSOMToRow(session)
    const [inserted] = await db.insert(s.aiSessions).values({ ...row }).returning()
    return aiSessionRowToUSOM(inserted)
  }

  async updateMessages(id: USOM_ID, messages: ChatMessage[], userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        intentRef: m.intentRef ?? undefined,
      })),
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async updateStateSnapshot(id: USOM_ID, snapshot: Record<string, unknown>, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      stateSnapshot: snapshot,
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async updateTitle(id: USOM_ID, title: string, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      title,
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async updateTimestamp(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      status: 'archived',
      archivedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async restore(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      status: 'active',
      archivedAt: null,
      deletedAt: null,
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async softDelete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async hardDeleteExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000)

    const results = await db.delete(s.aiSessions).where(
      and(eq(s.aiSessions.status, 'deleted'), lt(s.aiSessions.deletedAt!, cutoff))
    ).returning({ id: s.aiSessions.id })

    return results.length
  }
}
