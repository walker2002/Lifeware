import { eq, and, gte, lte, asc } from 'drizzle-orm'
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

  /**
   * 查询指定日期范围内用户的所有打卡记录
   * @returns 按 habitId 分组的记录 Map
   */
  async findByDateRange(userId: USOM_ID, startDate: DateOnly, endDate: DateOnly): Promise<Map<string, HabitLog[]>> {
    const rows = await db.select().from(s.habitLogs)
      .where(and(
        eq(s.habitLogs.userId, userId),
        gte(s.habitLogs.date, startDate),
        lte(s.habitLogs.date, endDate),
      ))
      .orderBy(asc(s.habitLogs.date))

    const grouped = new Map<string, HabitLog[]>()
    for (const row of rows) {
      const log = habitLogRowToUSOM(row as any)
      const existing = grouped.get(log.habitId) ?? []
      existing.push(log)
      grouped.set(log.habitId, existing)
    }
    return grouped
  }
}
