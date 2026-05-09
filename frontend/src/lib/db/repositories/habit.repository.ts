import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IHabitRepository } from '../../../usom/interfaces/irepository'
import type { Habit, HabitFrequency } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { habitRowToUSOM, habitUSOMToRow } from './mappers'

export class HabitRepository implements IHabitRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null> {
    const rows = await db.select().from(s.habits)
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
    return rows[0] ? habitRowToUSOM(rows[0] as any) : null
  }

  async findActive(userId: USOM_ID): Promise<Habit[]> {
    const rows = await db.select().from(s.habits)
      .where(and(eq(s.habits.userId, userId), eq(s.habits.status, 'active')))
    return rows.map(r => habitRowToUSOM(r as any))
  }

  async findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]> {
    const rows = await db.select().from(s.habits)
      .where(and(eq(s.habits.userId, userId), eq(s.habits.frequencyType, frequencyType)))
    return rows.map(r => habitRowToUSOM(r as any))
  }

  async save(habit: Habit, userId: USOM_ID): Promise<void> {
    const row = habitUSOMToRow(habit, userId)
    await db.insert(s.habits).values(row).onConflictDoUpdate({
      target: s.habits.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.habits)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.habits.id, id), eq(s.habits.userId, userId)))
  }
}
