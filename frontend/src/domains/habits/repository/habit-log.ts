import { eq, and } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IHabitLogRepository } from '../../../usom/interfaces/irepository'
import type { HabitLog } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly } from '../../../usom/types/primitives'
import { habitLogRowToUSOM, habitLogUSOMToRow } from '../../../lib/db/repositories/mappers'

export class HabitLogRepository implements IHabitLogRepository {
  async findByHabitAndDate(habitId: USOM_ID, date: DateOnly, userId: USOM_ID): Promise<HabitLog | null> {
    const rows = await db.select().from(s.habitLogs)
      .where(and(eq(s.habitLogs.habitId, habitId), eq(s.habitLogs.date, date), eq(s.habitLogs.userId, userId)))
    return rows[0] ? habitLogRowToUSOM(rows[0] as any) : null
  }

  async findByUserAndDate(date: DateOnly, userId: USOM_ID): Promise<HabitLog[]> {
    const rows = await db.select().from(s.habitLogs)
      .where(and(eq(s.habitLogs.userId, userId), eq(s.habitLogs.date, date)))
    return rows.map(r => habitLogRowToUSOM(r as any))
  }

  async findByHabit(habitId: USOM_ID, userId: USOM_ID): Promise<HabitLog[]> {
    const rows = await db.select().from(s.habitLogs)
      .where(and(eq(s.habitLogs.habitId, habitId), eq(s.habitLogs.userId, userId)))
    return rows.map(r => habitLogRowToUSOM(r as any))
  }

  async save(log: HabitLog, userId: USOM_ID): Promise<void> {
    await db.insert(s.habitLogs).values(habitLogUSOMToRow(log, userId))
  }
}
