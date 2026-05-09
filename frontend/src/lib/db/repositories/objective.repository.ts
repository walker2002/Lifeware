import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IObjectiveRepository } from '../../../usom/interfaces/irepository'
import type { Objective } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { objectiveRowToUSOM, objectiveUSOMToRow } from './mappers'

export class ObjectiveRepository implements IObjectiveRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
    if (!rows[0]) return null
    const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
      .where(eq(s.keyResults.objectiveId, id))
    return objectiveRowToUSOM(rows[0] as any, krs.map(k => k.id))
  }

  async findActive(userId: USOM_ID): Promise<Objective[]> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.userId, userId), eq(s.objectives.status, 'active')))
    const results: Objective[] = []
    for (const row of rows) {
      const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
        .where(eq(s.keyResults.objectiveId, row.id))
      results.push(objectiveRowToUSOM(row as any, krs.map(k => k.id)))
    }
    return results
  }

  async save(objective: Objective, userId: USOM_ID): Promise<void> {
    const row = objectiveUSOMToRow(objective, userId)
    await db.insert(s.objectives).values(row).onConflictDoUpdate({
      target: s.objectives.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.objectives)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
  }
}
