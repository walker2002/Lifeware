/**
 * @file schedule-slot
 * @brief [029] D3 ScheduleSlotRepository —— 统一 schedule 统计入口（pgView 类型化）。
 *
 * 反制 v_running_timebones 僵尸化（0036 注释点明）：typed pgView → 消费体验好 →
 * 不被闲置。IRON RULE（spec §3.4 + view COMMENT）：统计/聚合必须走本仓库，
 * 禁裸查 timeboxes/appointments。appointment.end_time 派生不可索引，范围
 * 查询按 logical_day_id 过滤（两表均建索引，谓词下推）。
 */

import { and, asc, eq } from 'drizzle-orm'
import * as s from '@/lib/db/schema'
import { db, type DbClient } from '@/lib/db'
import type { USOM_ID } from '@/usom/types/primitives'

export type SlotSourceType = 'timebox' | 'appointment'
export type SlotState = 'scheduled' | 'completed' | 'cancelled'

export interface ScheduleSlot {
  id: string
  userId: USOM_ID
  logicalDayId: USOM_ID | null
  title: string
  startTime: string // ISO
  endTime: string   // ISO
  activityArchetypeId: USOM_ID | null
  sourceType: SlotSourceType
  sourceStatus: string
  slotState: SlotState
  people: string[] | null
}

export class ScheduleSlotRepository {
  /**
   * 按 logicalDayId 查该日全部 slot（timebox+appointment），按 startTime 升序。
   * 范围查询走 logical_day_id（两表均索引，谓词下推）；避免按 end_time 范围
   * 扫（appointment.end_time 不可索引）。
   */
  async findByLogicalDay(
    logicalDayId: USOM_ID,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<ScheduleSlot[]> {
    const rows = await tx
      .select()
      .from(s.vScheduleSlots)
      .where(and(
        eq(s.vScheduleSlots.userId, userId as any),
        eq(s.vScheduleSlots.logicalDayId, logicalDayId as any),
      ))
      .orderBy(asc(s.vScheduleSlots.startTime))
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId as USOM_ID,
      logicalDayId: r.logicalDayId as USOM_ID | null,
      title: r.title,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      activityArchetypeId: r.activityArchetypeId as USOM_ID | null,
      sourceType: r.sourceType as SlotSourceType,
      sourceStatus: r.sourceStatus,
      slotState: r.slotState as SlotState,
      people: (r.people as string[] | null) ?? null,
    }))
  }
}
