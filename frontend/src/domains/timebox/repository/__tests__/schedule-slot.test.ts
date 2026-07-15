/**
 * @file schedule-slot.test
 * @brief [029] D3 ScheduleSlotRepository 集成测试（真实 PG + v_schedule_slots 视图）。
 *
 * T5 migration applied → v_schedule_slots 视图已建。
 * seed: 1 logical_day + 1 timebox(planned) + 1 appointment(scheduled) + 1 timebox
 * 不同 logicalDay（验证过滤）。
 * 断言 2 类返回、slot_state 归一、startTime 排序。
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { ScheduleSlotRepository } from '../schedule-slot'
import { LogicalDayRepository } from '../logical-day'

const USER = '00000000-0000-0000-0000-000000000001' as const

describe('[029] ScheduleSlotRepository（v_schedule_slots pgView）', () => {
  const repo = new ScheduleSlotRepository()
  const ldgRepo = new LogicalDayRepository()
  let ldId: string
  let otherLdId: string

  beforeEach(async () => {
    await db.delete(s.timeboxes).where(eq(s.timeboxes.userId, USER as any))
    await db.delete(s.appointments).where(eq(s.appointments.userId, USER as any))
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
    const ld = await ldgRepo.findOrCreateByDate('2026-07-14', USER as any)
    const other = await ldgRepo.findOrCreateByDate('2026-07-15', USER as any)
    ldId = ld.id
    otherLdId = other.id

    await db.insert(s.timeboxes).values({
      id: randomUUID() as any, userId: USER as any, schemaVersion: 1, occVersion: 1,
      status: 'planned', title: 'tb-title',
      startTime: new Date('2026-07-13T15:00:00Z'),
      endTime:   new Date('2026-07-13T16:00:00Z'),
      isRecurring: false, tags: [] as any, taskIds: [] as any, habitIds: [] as any,
      logicalDayId: ldId as any,
    } as any)
    await db.insert(s.appointments).values({
      id: randomUUID() as any, userId: USER as any, schemaVersion: 1,
      title: 'ap-title',
      startTime: new Date('2026-07-13T17:00:00Z'),
      durationMin: 60,
      status: 'completed',
      people: [] as any,
      logicalDayId: ldId as any,
    } as any)
    // 另一 logicalDay 的 timebox：验证过滤
    await db.insert(s.timeboxes).values({
      id: randomUUID() as any, userId: USER as any, schemaVersion: 1, occVersion: 1,
      status: 'planned', title: 'other-day',
      startTime: new Date('2026-07-14T01:00:00Z'),
      endTime:   new Date('2026-07-14T02:00:00Z'),
      isRecurring: false, tags: [] as any, taskIds: [] as any, habitIds: [] as any,
      logicalDayId: otherLdId as any,
    } as any)
  })

  afterAll(async () => {
    await db.delete(s.timeboxes).where(eq(s.timeboxes.userId, USER as any))
    await db.delete(s.appointments).where(eq(s.appointments.userId, USER as any))
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })

  it('同 logicalDay 返回 timebox + appointment 两类，slot_state 归一', async () => {
    const slots = await repo.findByLogicalDay(ldId as any, USER as any)
    expect(slots).toHaveLength(2)
    const tb = slots.find((x) => x.sourceType === 'timebox')!
    const ap = slots.find((x) => x.sourceType === 'appointment')!
    expect(tb.title).toBe('tb-title')
    expect(tb.slotState).toBe('scheduled')   // planned → scheduled
    expect(ap.slotState).toBe('completed')   // completed → completed
    expect(ap.endTime).toBe(new Date('2026-07-13T18:00:00Z').toISOString()) // start + 60min
  })

  it('按 startTime 升序排序', async () => {
    const slots = await repo.findByLogicalDay(ldId as any, USER as any)
    const times = slots.map((s) => s.startTime)
    expect(times).toEqual([...times].sort())
    expect(slots[0].sourceType).toBe('timebox') // 15:00 < 17:00
    expect(slots[1].sourceType).toBe('appointment')
  })

  it('过滤：另一 logicalDay 的 slot 不返回', async () => {
    const other = await repo.findByLogicalDay(otherLdId as any, USER as any)
    expect(other).toHaveLength(1)
    expect(other[0].title).toBe('other-day')
    expect(other[0].sourceType).toBe('timebox')
  })
})
