import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IDerivedSignalsRepository } from '../../../usom/interfaces/irepository'
import type { DerivedSignals } from '../../../usom/types/process'
import type { USOM_ID } from '../../../usom/types/primitives'
import { derivedSignalsRowToUSOM, derivedSignalsUSOMToRow } from './mappers'

export class DerivedSignalsRepository implements IDerivedSignalsRepository {
  async findByUser(userId: USOM_ID): Promise<DerivedSignals | null> {
    const rows = await db.select().from(s.derivedSignals)
      .where(eq(s.derivedSignals.userId, userId))
    return rows[0] ? derivedSignalsRowToUSOM(rows[0] as any) : null
  }

  async upsert(signals: DerivedSignals, userId: USOM_ID): Promise<void> {
    const row = derivedSignalsUSOMToRow(signals, userId)
    await db.insert(s.derivedSignals).values({ id: signals.userId, ...row })
      .onConflictDoUpdate({ target: s.derivedSignals.userId, set: row })
  }
}
