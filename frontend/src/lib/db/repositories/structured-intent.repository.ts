import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IStructuredIntentRepository } from '../../../usom/interfaces/irepository'
import type { StructuredIntent } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { structuredIntentRowToUSOM, structuredIntentUSOMToRow } from './mappers'

export class StructuredIntentRepository implements IStructuredIntentRepository {
  async findByIntention(intentionId: USOM_ID, userId: USOM_ID): Promise<StructuredIntent | null> {
    const rows = await db.select().from(s.structuredIntents)
      .where(and(eq(s.structuredIntents.intentionId, intentionId), eq(s.structuredIntents.userId, userId)))
    return rows[0] ? structuredIntentRowToUSOM(rows[0] as any) : null
  }

  async save(structuredIntent: StructuredIntent, userId: USOM_ID): Promise<void> {
    await db.insert(s.structuredIntents).values(structuredIntentUSOMToRow(structuredIntent, userId))
  }
}
