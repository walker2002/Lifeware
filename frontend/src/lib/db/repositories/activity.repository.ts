import { sql } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'

export interface RecordActivityInput {
  activityType: 'intent_execute' | 'menu_click' | 'page_navigate' | 'cnui_action'
  source: 'ai_assistant' | 'growth_menu' | 'shortcut' | 'page_route' | 'cnui_surface'
  targetDomain?: string
  targetAction?: string
  metadata?: Record<string, unknown>
}

export interface FrequentIntentRow {
  targetDomain: string
  targetAction: string
  totalScore: number
}

export interface ActivityTypeCount {
  activityType: string
  count: number
}

export interface DailyActivityCount {
  date: string
  count: number
}

export class ActivityRepository {
  async insert(userId: string, input: RecordActivityInput): Promise<void> {
    await db.insert(s.userActivities).values({
      userId,
      activityType: input.activityType,
      source: input.source,
      targetDomain: input.targetDomain ?? null,
      targetAction: input.targetAction ?? null,
      metadata: input.metadata ?? {},
    })
  }

  async fetchFrequentIntents(userId: string, limit: number, sinceDays: number = 30): Promise<FrequentIntentRow[]> {
    const since = new Date()
    since.setDate(since.getDate() - sinceDays)
    const sinceStr = since.toISOString()
    const rows = await db
      .select({
        targetDomain: s.userActivities.targetDomain,
        targetAction: s.userActivities.targetAction,
        totalScore: sql<number>`sum(exp(-extract(epoch from (now() - ${s.userActivities.createdAt})) / 604800))`,
      })
      .from(s.userActivities)
      .where(
        sql`${s.userActivities.userId} = ${userId}
            AND ${s.userActivities.createdAt} >= ${sinceStr}
            AND ${s.userActivities.targetDomain} IS NOT NULL
            AND ${s.userActivities.targetAction} IS NOT NULL`
      )
      .groupBy(s.userActivities.targetDomain, s.userActivities.targetAction)
      .orderBy(sql`sum(exp(-extract(epoch from (now() - ${s.userActivities.createdAt})) / 604800)) desc`)
      .limit(limit)
    return rows.map(r => ({
      targetDomain: r.targetDomain!,
      targetAction: r.targetAction!,
      totalScore: Number(r.totalScore),
    }))
  }

  async fetchActivityTypeCounts(userId: string, since: Date): Promise<ActivityTypeCount[]> {
    const sinceStr = since.toISOString()
    const rows = await db
      .select({
        activityType: s.userActivities.activityType,
        count: sql<number>`count(*)`,
      })
      .from(s.userActivities)
      .where(sql`${s.userActivities.userId} = ${userId} AND ${s.userActivities.createdAt} >= ${sinceStr}`)
      .groupBy(s.userActivities.activityType)
    return rows.map(r => ({ activityType: r.activityType, count: Number(r.count) }))
  }

  async fetchDailyActivityCounts(userId: string, since: Date): Promise<DailyActivityCount[]> {
    const sinceStr = since.toISOString()
    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', ${s.userActivities.createdAt})::text`,
        count: sql<number>`count(*)`,
      })
      .from(s.userActivities)
      .where(sql`${s.userActivities.userId} = ${userId} AND ${s.userActivities.createdAt} >= ${sinceStr}`)
      .groupBy(sql`date_trunc('day', ${s.userActivities.createdAt})`)
      .orderBy(sql`date_trunc('day', ${s.userActivities.createdAt})`)
    return rows.map(r => ({ date: r.date.slice(0, 10), count: Number(r.count) }))
  }
}
