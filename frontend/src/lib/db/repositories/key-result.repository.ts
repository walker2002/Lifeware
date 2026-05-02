import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IKeyResultRepository } from '../../../usom/interfaces/irepository'
import type { KeyResult } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { keyResultRowToUSOM, keyResultUSOMToRow } from './mappers'

export class KeyResultRepository implements IKeyResultRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null> {
    const rows = await db.select().from(s.keyResults)
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
    return rows[0] ? keyResultRowToUSOM(rows[0] as any) : null
  }

  async findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]> {
    const rows = await db.select().from(s.keyResults)
      .where(and(eq(s.keyResults.objectiveId, objectiveId), eq(s.keyResults.userId, userId)))
    return rows.map(r => keyResultRowToUSOM(r as any))
  }

  async save(keyResult: KeyResult, userId: USOM_ID): Promise<void> {
    const row = keyResultUSOMToRow(keyResult, userId)
    await db.insert(s.keyResults).values(row).onConflictDoUpdate({
      target: s.keyResults.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.keyResults)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
  }
}
