/**
 * @file appointment repository test
 * @brief AppointmentRepository 集成测试（[023.12] T5: 3 态收敛 + [026.01] archetype 映射）
 *
 * 对接真实 Docker PostgreSQL，验证 AppointmentRepository 的 CRUD +
 * cancel / complete / revert 三条 SM transition 路径 + findNeedingReconcile +
 * findByDateRange 范围查询。
 *
 * [023.12] T5 改造：原 D2 reversal 5 态存储改为 3 态（scheduled / cancelled /
 * completed）。in_progress / expired 不持久化——读时由 derive-display-status.ts
 * 派生。本文件覆盖完整 3 态生命周期。
 *
 * [026.01]: mapper 双向读写 activityArchetypeId 单元测试（makeRow/makeUSOM fixture）。
 *
 * 测试用户隔离：固定 userId ...001（与 T4 brief 一致），beforeEach 清理该用户约定。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AppointmentRepository } from '../appointment'
import * as s from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { appointmentRowToUSOM, appointmentUSOMToRow } from '../mappers/appointment'
import type { Appointment } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

const USER = '00000000-0000-0000-0000-000000000001' as any
const future = '2026-07-20T14:00:00.000Z'
const past = '2026-07-10T14:00:00.000Z'

const baseIt = (overrides: Partial<any> = {}): any => ({
  id: crypto.randomUUID() as any,
  status: 'scheduled' as const,
  title: 't', detail: null,
  startTime: future, durationMin: 60, people: [],
  userId: USER,
  // [023.12] T5: 不再有 inProgressAt/expiredAt；completedAt/cancelledAt 仅在终态有值
  completedAt: null, cancelledAt: null,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  schemaVersion: 1, ...overrides,
})

// [026.01] mapper 单元测试 fixture：构造 appointments row 类型
type AppointmentRow = ReturnType<typeof appointmentUSOMToRow>
function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'row-1' as any,
    userId: 'user-1' as any,
    schemaVersion: 1,
    title: 'test',
    detail: null,
    startTime: new Date('2026-07-15T14:00:00Z'),
    durationMin: 60,
    people: [],
    activityArchetypeId: null,
    status: 'scheduled',
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-07-15T00:00:00Z'),
    updatedAt: new Date('2026-07-15T00:00:00Z'),
    ...overrides,
  } as AppointmentRow
}

function makeUSOM(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1' as USOM_ID,
    status: 'scheduled',
    title: 'test',
    detail: null,
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    people: [],
    userId: 'user-1' as USOM_ID,
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
    completedAt: null,
    cancelledAt: null,
    schemaVersion: 1,
    ...overrides,
  } as Appointment
}

describe('AppointmentRepository（[023.12] T5: 3 态收敛）', () => {
  beforeEach(async () => { await db.delete(s.appointments).where(eq(s.appointments.userId, USER)) })

  it('save → findById 往返保持 status=scheduled', async () => {
    const repo = new AppointmentRepository()
    const it = baseIt()
    await repo.save(it, USER)
    const got = await repo.findById(it.id, USER)
    expect(got?.status).toBe('scheduled')
    expect(got?.title).toBe('t')
    expect(got?.people).toEqual([])
  })

  it('save → findById 往返保持 completed + completedAt', async () => {
    // [023.12] T5: completed 仍是合法 status，但仅由 complete() 写
    const repo = new AppointmentRepository()
    const it = baseIt({ status: 'completed', completedAt: '2026-07-15T10:00:00.000Z' })
    await repo.save(it, USER)
    const got = await repo.findById(it.id, USER)
    expect(got?.status).toBe('completed')
    expect(got?.completedAt).toBe('2026-07-15T10:00:00.000Z')
  })

  it('cancel 盖 status=cancelled + cancelledAt', async () => {
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.cancel(id, USER)
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('cancelled')
    expect(got?.cancelledAt).not.toBeNull()
  })

  // [023.12] T5 新增：complete 路径
  it('complete 盖 status=completed + completedAt', async () => {
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.complete(id, USER, new Date('2026-07-15T10:00:00.000Z'))
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('completed')
    expect(got?.completedAt).toBe('2026-07-15T10:00:00.000Z')
  })

  // [023.12] T5 新增：revert 路径
  it('revert 从 cancelled 回 scheduled + 清 cancelledAt', async () => {
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.cancel(id, USER)
    let got = await repo.findById(id, USER)
    expect(got?.status).toBe('cancelled')
    expect(got?.cancelledAt).not.toBeNull()

    await repo.revert(id, USER, new Date('2026-07-15T11:00:00.000Z'))
    got = await repo.findById(id, USER)
    expect(got?.status).toBe('scheduled')
    expect(got?.cancelledAt).toBeNull()
  })

  it('revert 从 completed 回 scheduled + 清 completedAt', async () => {
    const repo = new AppointmentRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.complete(id, USER, new Date('2026-07-15T10:00:00.000Z'))
    let got = await repo.findById(id, USER)
    expect(got?.status).toBe('completed')
    expect(got?.completedAt).not.toBeNull()

    await repo.revert(id, USER, new Date('2026-07-15T11:00:00.000Z'))
    got = await repo.findById(id, USER)
    expect(got?.status).toBe('scheduled')
    expect(got?.completedAt).toBeNull()
  })

  it('findNeedingReconcile 只返非终态（3 态收敛后 = 仅 scheduled）', async () => {
    const repo = new AppointmentRepository()
    const idA = crypto.randomUUID() as any
    const idB = crypto.randomUUID() as any
    const idC = crypto.randomUUID() as any
    await repo.save(baseIt({ id: idA, status: 'scheduled' }), USER)
    await repo.save(baseIt({ id: idB, status: 'cancelled', cancelledAt: '2026-07-14T00:00:00.000Z' }), USER)
    await repo.save(baseIt({ id: idC, status: 'completed', completedAt: '2026-07-14T00:00:00.000Z' }), USER)
    const list = await repo.findNeedingReconcile(USER)
    const ids = list.map(i => i.id)
    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
    expect(ids).not.toContain(idC)
  })

  it('findByDateRange 只返非终态 + 落区间', async () => {
    const repo = new AppointmentRepository()
    const idIn = crypto.randomUUID() as any
    const idOut = crypto.randomUUID() as any
    await repo.save(baseIt({ id: idIn, startTime: '2026-07-15T14:00:00.000Z' }), USER)
    await repo.save(baseIt({ id: idOut, startTime: '2026-07-30T14:00:00.000Z' }), USER)
    const list = await repo.findByDateRange('2026-07-15T00:00:00.000Z' as any, '2026-07-15T23:59:59.000Z' as any, USER)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(idIn)
  })
})

// [026.01] mapper 双向读写 archetype 单元测试（不入库，纯映射逻辑）
describe('Appointment mapper with activityArchetypeId [026.01]', () => {
  it('appointmentRowToUSOM includes activityArchetypeId when present', () => {
    const row = makeRow({ activityArchetypeId: 'arch-123' as any })
    const usom = appointmentRowToUSOM(row)
    expect(usom.activityArchetypeId).toBe('arch-123')
  })

  it('appointmentRowToUSOM handles missing activityArchetypeId as undefined', () => {
    const row = makeRow({ activityArchetypeId: null })
    const usom = appointmentRowToUSOM(row)
    expect(usom.activityArchetypeId).toBeUndefined()
  })

  it('appointmentUSOMToRow includes activityArchetypeId when present', () => {
    const it = makeUSOM({ activityArchetypeId: 'arch-456' as USOM_ID })
    const row = appointmentUSOMToRow(it, 'user-1' as USOM_ID)
    expect(row.activityArchetypeId).toBe('arch-456')
  })

  it('appointmentUSOMToRow handles missing activityArchetypeId as null', () => {
    const it = makeUSOM({ activityArchetypeId: undefined })
    const row = appointmentUSOMToRow(it, 'user-1' as USOM_ID)
    expect(row.activityArchetypeId).toBeNull()
  })
})
