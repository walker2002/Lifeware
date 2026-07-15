/**
 * @file generic-repo-adapter-logical-day.test
 * @brief [029] D2 瓶口注入：adapter timebox.create 自动解析 logicalDayId（真实 PG）。
 *
 * 覆盖 3 路径（穿透图 verified 2026-07-15）：
 * - 显式 logicalDayLabel（drawer / CreateTimeboxInput）→ 短路 tz 读
 * - CNUI date 字段（handlers.ts {...it} spread）→ 短路 tz 读
 * - 无显式 → date(startTime, user_tz) 派生
 *
 * 真实 LogicalDayRepository（findOrCreateByDate），timeboxRepo 用 stub 捕获 save 参数。
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  createTimeboxGenericRepo,
  resolveLogicalDayIdForCreate,
} from '../generic-repo-adapter'
import { LogicalDayRepository } from '../logical-day'

const USER = '00000000-0000-0000-0000-000000000001' as const

// 最小 timeboxRepo stub —— 只需 save 捕获入参；其他方法不应被本测试触发
function makeStubTimeboxRepo() {
  const saved: any[] = []
  return {
    saved,
    save: async (obj: any) => {
      saved.push(obj)
    },
    findById: async () => null,
    updateFields: async () => ({}),
    updateStatus: async () => ({}),
  } as any
}

function makeStubAppointmentRepo() {
  return {
    findById: async () => null,
    save: async () => {},
    updateFields: async () => ({}),
    cancel: async () => {},
    complete: async () => {},
    revert: async () => {},
  } as any
}

const realLdgRepo = new LogicalDayRepository()

describe('[029] resolveLogicalDayIdForCreate（纯函数 + repo）', () => {
  beforeEach(async () => {
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })
  afterAll(async () => {
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })

  it('显式 logicalDayLabel → 用显式，懒建逻辑日', async () => {
    const id = await resolveLogicalDayIdForCreate(
      { logicalDayLabel: '2026-07-15' },
      USER as any,
      '2026-07-14T15:00:00Z',
      db,
    )
    expect(id).toBeTruthy()
    const ld = await realLdgRepo.findByDate('2026-07-15', USER as any)
    expect(ld?.id).toBe(id)
  })

  it('CNUI date 字段 → 用 date（兼容旧路径）', async () => {
    const id = await resolveLogicalDayIdForCreate(
      { date: '2026-07-16' },
      USER as any,
      '2026-07-14T15:00:00Z',
      db,
    )
    expect(id).toBeTruthy()
    const ld = await realLdgRepo.findByDate('2026-07-16', USER as any)
    expect(ld?.id).toBe(id)
  })

  it('无 startTime → 返回 null', async () => {
    const id = await resolveLogicalDayIdForCreate({}, USER as any, undefined, db)
    expect(id).toBeNull()
  })
})

describe('[029] adapter timebox.create logicalDayId 注入', () => {
  beforeEach(async () => {
    await db.delete(s.timeboxes).where(eq(s.timeboxes.userId, USER as any))
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })
  afterAll(async () => {
    await db.delete(s.timeboxes).where(eq(s.timeboxes.userId, USER as any))
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })

  it('显式 logicalDayLabel → save 的 obj 含 logicalDayId 且指向正确行', async () => {
    const stub = makeStubTimeboxRepo()
    const adapter = createTimeboxGenericRepo({
      timeboxRepo: stub,
      appointmentRepo: makeStubAppointmentRepo(),
    })
    await adapter.timebox.create(
      {
        title: 't',
        startTime: '2026-07-14T15:00:00Z',
        endTime: '2026-07-14T16:00:00Z',
        logicalDayLabel: '2026-07-15',
      } as any,
      USER as any,
      db,
    )
    expect(stub.saved).toHaveLength(1)
    const obj = stub.saved[0]
    expect(obj.logicalDayId).toBeTruthy()
    expect(obj.title).toBe('t')
    expect(obj.startTime).toBe('2026-07-14T15:00:00Z')
    expect(obj).not.toHaveProperty('logicalDayLabel') // 临时字段已剥离
    // 验证 logicalDayId 指向 '2026-07-15'
    const ld = await realLdgRepo.findByDate('2026-07-15', USER as any)
    expect(obj.logicalDayId).toBe(ld?.id)
  })

  it('无显式 → 派生（startTime 2026-07-13T16Z = Shanghai 07-14）', async () => {
    const stub = makeStubTimeboxRepo()
    const adapter = createTimeboxGenericRepo({
      timeboxRepo: stub,
      appointmentRepo: makeStubAppointmentRepo(),
    })
    await adapter.timebox.create(
      {
        title: 't',
        startTime: '2026-07-13T16:00:00Z',
        endTime: '2026-07-13T17:00:00Z',
      } as any,
      USER as any,
      db,
    )
    const obj = stub.saved[0]
    expect(obj.logicalDayId).toBeTruthy()
    // user_settings 未必有 Shanghai，但 fallback 是 Asia/Shanghai（per timezone-config.ts:29）
    // 所以派生 label 应该是 '2026-07-14'
    const ld = await realLdgRepo.findByDate('2026-07-14', USER as any)
    expect(obj.logicalDayId).toBe(ld?.id)
  })
})
