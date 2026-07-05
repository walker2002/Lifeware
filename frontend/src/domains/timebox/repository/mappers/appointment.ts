/**
 * @file appointment mapper
 * @brief Appointment USOM 对象 ↔ appointments 表行映射（[026] D2 reversal）
 *
 * 状态直接读 row.status（D2 reversal 取消占位）。在 ProgressAt/ExpiredAt/CompletedAt/CancelledAt
 * 与 status 推进匹配时盖（SM 层负责一致性）。
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
    userId: row.userId as USOM_ID,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    inProgressAt: row.inProgressAt ? row.inProgressAt.toISOString() : null,
    expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
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
    status: it.status,
    inProgressAt: it.inProgressAt ? new Date(it.inProgressAt) as any : null,
    expiredAt: it.expiredAt ? new Date(it.expiredAt) as any : null,
    completedAt: it.completedAt ? new Date(it.completedAt) as any : null,
    cancelledAt: it.cancelledAt ? new Date(it.cancelledAt) as any : null,
    createdAt: new Date(it.createdAt) as any,
    updatedAt: new Date(it.updatedAt) as any,
  } as AppointmentRow
}
