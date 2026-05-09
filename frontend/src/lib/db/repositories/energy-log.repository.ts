import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IEnergyLogRepository } from '../../../usom/interfaces/irepository'
import type { EnergyLog } from '../../../usom/types/process'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { energyLogToRow } from './mappers'

export class EnergyLogRepository implements IEnergyLogRepository {
  async findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<EnergyLog[]> {
    const rows = await db.select().from(s.energyLogs)
      .where(and(eq(s.energyLogs.userId, userId), gte(s.energyLogs.loggedAt, new Date(startAt)), lte(s.energyLogs.loggedAt, new Date(endAt))))
    return rows.map(r => ({
      id: (r as any).id,
      userId: (r as any).user_id,
      level: (r as any).level,
      source: (r as any).source,
      context: (r as any).context ?? {},
      loggedAt: (r as any).logged_at.toISOString(),
    }) as EnergyLog)
  }

  async save(log: EnergyLog, userId: USOM_ID): Promise<void> {
    await db.insert(s.energyLogs).values(energyLogToRow(log, userId))
  }
}
