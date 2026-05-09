import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IIntentionRepository } from '../../../usom/interfaces/irepository'
import type { Intention } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { intentionRowToUSOM, intentionUSOMToRow } from './mappers'

export class IntentionRepository implements IIntentionRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Intention | null> {
    const rows = await db.select().from(s.intentions)
      .where(and(eq(s.intentions.id, id), eq(s.intentions.userId, userId)))
    return rows[0] ? intentionRowToUSOM(rows[0] as any) : null
  }

  async findByStatus(status: Intention['status'], userId: USOM_ID): Promise<Intention[]> {
    const rows = await db.select().from(s.intentions)
      .where(and(eq(s.intentions.userId, userId), eq(s.intentions.status, status)))
    return rows.map(r => intentionRowToUSOM(r as any))
  }

  async save(intention: Intention, userId: USOM_ID): Promise<void> {
    const row = intentionUSOMToRow(intention, userId)
    await db.insert(s.intentions).values(row).onConflictDoUpdate({
      target: s.intentions.id,
      set: row,
    })
  }

  async dissolve(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.intentions)
      .set({ status: 'dissolved', dissolvedAt: new Date() })
      .where(and(eq(s.intentions.id, id), eq(s.intentions.userId, userId)))
  }
}
