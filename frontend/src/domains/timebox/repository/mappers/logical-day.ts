/**
 * @file logical-day mapper
 * @brief [029] logical_days DB row ↔ USOM LogicalDay 双向映射。
 *
 * 沿用 appointment.ts / timebox mapper 的 `as any` FK 转换风格（项目惯例）。
 * date 列（Drizzle 返回 string 'YYYY-MM-DD'）→ USOM DateOnly 同形字符串，
 * 无需 Date 转换；timestamp 列 → ISO 字符串。
 */

import type { LogicalDay } from '@/usom/types/objects'
import type { USOM_ID, DateOnly, Timestamp } from '@/usom/types/primitives'

type LogicalDayRow = typeof import('@/lib/db/schema').logicalDays.$inferSelect

export function logicalDayRowToUSOM(row: LogicalDayRow): LogicalDay {
  return {
    id: row.id as USOM_ID,
    userId: row.userId as USOM_ID,
    dayLabel: row.dayLabel as DateOnly,
    wakeTime: row.wakeTime ? (row.wakeTime.toISOString() as Timestamp) : null,
    sleepDurationMinutes: row.sleepDurationMinutes,
    energyBaseline: row.energyBaseline,
    reviewRating: row.reviewRating,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    schemaVersion: row.schemaVersion,
  }
}

export function logicalDayUSOMToRow(it: LogicalDay): LogicalDayRow {
  return {
    id: it.id as any,
    userId: it.userId as any,
    schemaVersion: it.schemaVersion,
    dayLabel: it.dayLabel as any,
    wakeTime: it.wakeTime ? new Date(it.wakeTime) as any : null,
    sleepDurationMinutes: it.sleepDurationMinutes,
    energyBaseline: it.energyBaseline,
    reviewRating: it.reviewRating,
    reviewNotes: it.reviewNotes,
    createdAt: new Date(it.createdAt) as any,
    updatedAt: new Date(it.updatedAt) as any,
  } as LogicalDayRow
}