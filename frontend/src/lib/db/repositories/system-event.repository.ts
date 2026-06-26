import { eq, and, gte, lte, not, sql } from 'drizzle-orm'
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

  /**
   * [022] ADV-#1 修复 2026-06-26：按 intentId 精确查找事件。
   *
   * 用 PG JSONB 路径操作 `payload->>'intentId' = ${intentId}`，避免 orchestrator
   * 「5 秒窗口 + JS 过滤」方案的并发意图泄漏风险（spike §R7）。索引由
   * `idx_system_events_user_occurred` 辅助 userId 过滤；payload 列的
   * `intentId` key 未单独建索引（按需在 defer 列表），MVP 量级（每 intent
   * 1-5 events）下顺序扫描开销可接受。
   */
  async findByIntent(intentId: USOM_ID, userId: USOM_ID): Promise<SystemEvent[]> {
    const rows = await db.select().from(s.systemEvents)
      .where(and(
        eq(s.systemEvents.userId, userId),
        sql`${s.systemEvents.payload}->>'intentId' = ${intentId}`,
      ))
      .orderBy(s.systemEvents.occurredAt)
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
