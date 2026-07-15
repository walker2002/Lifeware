/**
 * @file logical-day repository
 * @brief [029] LogicalDayRepository —— 查找/懒建逻辑日行（含 getCurrentLogicalDay, AC-5）。
 *
 * 设计要点：
 * - 沿用 TimeboxRepository / AppointmentRepository 的 class-based 风格 + 可选 tx 句柄
 * - findOrCreateByDate 处理并发 unique 冲突兜底（兜底重读而非抛错，对应设计 spec 并发安全）
 * - findCurrentByDate（AC-5）：用 user_tz 派生 today 标签 → 查行；无则 null（不自动创建）
 *   —— AC-5 只读语义，懒建由调用方显式触发
 *
 * PR1 范围：不引入 habit 关联、暂不实现批量/范围查询（PR2 阶段）。
 */

import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import * as s from '@/lib/db/schema'
import { db, type DbClient } from '@/lib/db'
import type { LogicalDay } from '@/usom/types/objects'
import type { USOM_ID, DateOnly, Timestamp } from '@/usom/types/primitives'
import { logicalDayRowToUSOM, logicalDayUSOMToRow } from './mappers/logical-day'
import { formatDateLabel } from '@/lib/logical-day/resolver'

export class LogicalDayRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<LogicalDay | null> {
    const rows = await tx.select().from(s.logicalDays)
      .where(and(eq(s.logicalDays.id, id as any), eq(s.logicalDays.userId, userId as any)))
    return rows[0] ? logicalDayRowToUSOM(rows[0]) : null
  }

  async findByDate(dayLabel: DateOnly, userId: USOM_ID, tx: DbClient = db): Promise<LogicalDay | null> {
    const rows = await tx.select().from(s.logicalDays)
      .where(and(eq(s.logicalDays.dayLabel, dayLabel as any), eq(s.logicalDays.userId, userId as any)))
    return rows[0] ? logicalDayRowToUSOM(rows[0]) : null
  }

  async save(it: LogicalDay, tx: DbClient = db): Promise<void> {
    await tx.insert(s.logicalDays).values(logicalDayUSOMToRow(it))
      .onConflictDoUpdate({ target: s.logicalDays.id, set: logicalDayUSOMToRow(it) })
  }

  /** 懒建：无则创建空行（仅 id/userId/dayLabel），返回 USOM。并发兜底处理 unique 冲突。 */
  async findOrCreateByDate(dayLabel: DateOnly, userId: USOM_ID, tx: DbClient = db): Promise<LogicalDay> {
    const existing = await this.findByDate(dayLabel, userId, tx)
    if (existing) return existing
    const now = new Date().toISOString() as Timestamp
    const it: LogicalDay = {
      id: randomUUID() as USOM_ID,
      userId,
      dayLabel,
      wakeTime: null, sleepDurationMinutes: null, energyBaseline: null,
      reviewRating: null, reviewNotes: null,
      createdAt: now, updatedAt: now, schemaVersion: 1,
    }
    try {
      await this.save(it, tx)
      return it
    } catch {
      // 并发：unique 冲突 → 重新读
      const again = await this.findByDate(dayLabel, userId, tx)
      if (again) return again
      throw new Error(`LogicalDay findOrCreate failed for ${dayLabel}`)
    }
  }

  /** [029] AC-5: 当前逻辑日 = today(user_tz) 的 logical_day 行（无则 null） */
  async findCurrentByDate(userId: USOM_ID, tz: string, tx: DbClient = db): Promise<LogicalDay | null> {
    const todayLabel = formatDateLabel(new Date(), tz) as DateOnly
    return this.findByDate(todayLabel, userId, tx)
  }
}