import { eq, and, gte, lte, not } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { ISystemEventRepository } from '../../../usom/interfaces/irepository'
import type { SystemEvent } from '../../../usom/types/process'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { systemEventRowToUSOM, systemEventUSOMToRow } from './mappers'

export class SystemEventRepository implements ISystemEventRepository {
  async append(event: SystemEvent, userId: USOM_ID): Promise<void> {
    await db.insert(s.systemEvents).values(systemEventUSOMToRow(event, userId))
  }

  async findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<SystemEvent[]> {
    const rows = await db.select().from(s.systemEvents)
      .where(and(eq(s.systemEvents.userId, userId), gte(s.systemEvents.occurredAt, new Date(startAt)), lte(s.systemEvents.occurredAt, new Date(endAt))))
    return rows.map(r => systemEventRowToUSOM(r as any))
  }

  async findUnprocessed(userId: USOM_ID): Promise<SystemEvent[]> {
    const rows = await db.select().from(s.systemEvents)
      .where(and(eq(s.systemEvents.userId, userId), not(s.systemEvents.processed)))
    return rows.map(r => systemEventRowToUSOM(r as any))
  }

  async markProcessed(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.systemEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(and(eq(s.systemEvents.id, id), eq(s.systemEvents.userId, userId)))
  }
}
