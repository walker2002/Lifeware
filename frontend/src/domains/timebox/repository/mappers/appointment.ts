/**
 * @file appointment mapper
 * @brief Appointment USOM 对象 ↔ appointments 表行映射（[023.12] T5 3 态收敛 + [026.01] archetype）
 *
 * [023.12] T5: 3 态持久化（scheduled / cancelled / completed）。
 * inProgressAt / expiredAt 列在 T1b drop（schema 残留列待迁移清理），USOM Appointment
 * 类型不含这俩字段（T2 已收窄）。这里不映射这俩字段。
 *
 * [026.01]: activityArchetypeId 双向读写（FK nullable，null ↔ undefined）。
 *
 * 状态直接读 row.status（覆盖式 SM transition 推 status + 对应时间戳）。
 */

import type { Appointment } from '@/usom/types/objects'
import type { AppointmentStatus, USOM_ID } from '@/usom/types/primitives'

type AppointmentRow = typeof import('@/lib/db/schema').appointments.$inferSelect

export function appointmentRowToUSOM(row: AppointmentRow): Appointment {
  return {
    id: row.id as USOM_ID,
    status: row.status as AppointmentStatus,
    title: row.title,
    detail: row.detail,
    startTime: row.startTime.toISOString(),
    durationMin: row.durationMin,
    people: (row.people as string[]) ?? [],
    activityArchetypeId: (row.activityArchetypeId ?? undefined) as USOM_ID | undefined,
    userId: row.userId as USOM_ID,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    schemaVersion: row.schemaVersion,
  }
}

export function appointmentUSOMToRow(it: Appointment, userId: USOM_ID): AppointmentRow {
  return {
    id: it.id as any,
    userId: userId as any,
    schemaVersion: it.schemaVersion,
    title: it.title,
    detail: it.detail,
    startTime: new Date(it.startTime) as any,
    durationMin: it.durationMin,
    people: it.people as any,
    activityArchetypeId: (it.activityArchetypeId ?? null) as any,
    status: it.status,
    completedAt: it.completedAt ? new Date(it.completedAt) as any : null,
    cancelledAt: it.cancelledAt ? new Date(it.cancelledAt) as any : null,
    createdAt: new Date(it.createdAt) as any,
    updatedAt: new Date(it.updatedAt) as any,
  } as AppointmentRow
}
