import { eq, and, between, inArray, ne, like, sql } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IObjectiveRepository, ObjectiveWithKR } from '../../../usom/interfaces/irepository'
import type { Objective } from '../../../usom/types/objects'
import type { USOM_ID, ObjectiveStatus, DateOnly } from '../../../usom/types/primitives'
import { objectiveRowToUSOM, objectiveUSOMToRow } from '../../../lib/db/repositories/mappers'
import { keyResultRowToUSOM } from '../../../lib/db/repositories/mappers'

export class ObjectiveRepository implements IObjectiveRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
    if (!rows[0]) return null
    const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
      .where(eq(s.keyResults.objectiveId, id))
    return objectiveRowToUSOM(rows[0] as any, krs.map(k => k.id))
  }

  async findAll(userId: USOM_ID): Promise<Objective[]> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.userId, userId), ne(s.objectives.status, 'archived')))
    const results: Objective[] = []
    for (const row of rows) {
      const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
        .where(eq(s.keyResults.objectiveId, row.id))
      results.push(objectiveRowToUSOM(row as any, krs.map(k => k.id)))
    }
    return results
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

  async findByStatus(status: ObjectiveStatus, userId: USOM_ID): Promise<Objective[]> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.userId, userId), eq(s.objectives.status, status)))
    const results: Objective[] = []
    for (const row of rows) {
      const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
        .where(eq(s.keyResults.objectiveId, row.id))
      results.push(objectiveRowToUSOM(row as any, krs.map(k => k.id)))
    }
    return results
  }

  async findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]> {
    const rows = await db.select().from(s.objectives)
      .where(and(
        eq(s.objectives.userId, userId),
        between(s.objectives.periodStart, start, end),
      ))
    const results: Objective[] = []
    for (const row of rows) {
      const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
        .where(eq(s.keyResults.objectiveId, row.id))
      results.push(objectiveRowToUSOM(row as any, krs.map(k => k.id)))
    }
    return results
  }

  async findByStatusInPeriod(status: ObjectiveStatus[], start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]> {
    const rows = await db.select().from(s.objectives)
      .where(and(
        eq(s.objectives.userId, userId),
        inArray(s.objectives.status, status),
        between(s.objectives.periodStart, start, end),
      ))
    const results: Objective[] = []
    for (const row of rows) {
      const krs = await db.select({ id: s.keyResults.id }).from(s.keyResults)
        .where(eq(s.keyResults.objectiveId, row.id))
      results.push(objectiveRowToUSOM(row as any, krs.map(k => k.id)))
    }
    return results
  }

  async findWithKeyResults(id: USOM_ID, userId: USOM_ID): Promise<ObjectiveWithKR | null> {
    const rows = await db.select().from(s.objectives)
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
    if (!rows[0]) return null
    const krRows = await db.select().from(s.keyResults)
      .where(eq(s.keyResults.objectiveId, id))
    const obj = objectiveRowToUSOM(rows[0] as any, krRows.map(k => k.id))
    return { ...obj, keyResults: krRows.map(r => keyResultRowToUSOM(r as any)) }
  }

  async save(objective: Objective, userId: USOM_ID): Promise<void> {
    if (!objective.objectiveNumber) {
      const prefix = this.buildNumberPrefix(objective.period.type, objective.period.start)
      const count = await this.countByPrefix(prefix, userId)
      objective = { ...objective, objectiveNumber: `${prefix}-O${count + 1}` }
    }
    const row = objectiveUSOMToRow(objective, userId)
    await db.insert(s.objectives).values(row).onConflictDoUpdate({
      target: s.objectives.id,
      set: row,
    })
  }

  private buildNumberPrefix(periodType: string, periodStart: string): string {
    const start = new Date(periodStart)
    const yy = String(start.getFullYear()).slice(-2)
    switch (periodType) {
      case 'annual': return `${yy}Y`
      case 'semi_annual': return `${yy}H${start.getMonth() < 6 ? 1 : 2}`
      case 'quarterly': return `${yy}Q${Math.floor(start.getMonth() / 3) + 1}`
      case 'monthly': return `${yy}M${String(start.getMonth() + 1).padStart(2, '0')}`
      default: return `${yy}Q${Math.floor(start.getMonth() / 3) + 1}`
    }
  }

  private async countByPrefix(prefix: string, userId: USOM_ID): Promise<number> {
    const rows = await db.select({ objectiveNumber: s.objectives.objectiveNumber })
      .from(s.objectives)
      .where(and(
        eq(s.objectives.userId, userId),
        like(s.objectives.objectiveNumber, `${prefix}-O%`),
      ))
    return rows.length
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.objectives)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.objectives.id, id), eq(s.objectives.userId, userId)))
  }
}
