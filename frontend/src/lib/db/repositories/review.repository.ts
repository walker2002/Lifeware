import { eq, and, gte, lte } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IReviewRepository } from '../../../usom/interfaces/irepository'
import type { Review } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly } from '../../../usom/types/primitives'
import { reviewRowToUSOM, reviewUSOMToRow } from './mappers'

export class ReviewRepository implements IReviewRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Review | null> {
    const rows = await db.select().from(s.reviews)
      .where(and(eq(s.reviews.id, id), eq(s.reviews.userId, userId)))
    return rows[0] ? reviewRowToUSOM(rows[0] as any) : null
  }

  async findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Review[]> {
    const rows = await db.select().from(s.reviews)
      .where(and(eq(s.reviews.userId, userId), gte(s.reviews.periodStart, start), lte(s.reviews.periodEnd, end)))
    return rows.map(r => reviewRowToUSOM(r as any))
  }

  async findByType(type: Review['type'], userId: USOM_ID): Promise<Review[]> {
    const rows = await db.select().from(s.reviews)
      .where(and(eq(s.reviews.userId, userId), eq(s.reviews.type, type)))
    return rows.map(r => reviewRowToUSOM(r as any))
  }

  async save(review: Review, userId: USOM_ID): Promise<void> {
    const row = reviewUSOMToRow(review, userId)
    await db.insert(s.reviews).values(row).onConflictDoUpdate({
      target: s.reviews.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.reviews)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.reviews.id, id), eq(s.reviews.userId, userId)))
  }
}
