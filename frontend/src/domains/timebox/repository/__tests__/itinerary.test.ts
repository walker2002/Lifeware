/**
 * @file itinerary repository test
 * @brief ItineraryRepository 集成测试（[026] A1.4，D2 reversal: 5 态存储）
 *
 * 对接真实 Docker PostgreSQL，验证 ItineraryRepository 的 CRUD +
 * updateStatus 完整 5 态路径 + findNeedingReconcile 候选过滤 + findByDateRange 范围查询。
 *
 * 测试用户隔离：固定 userId ...001（与 T4 brief 一致），beforeEach 清理该用户行程。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ItineraryRepository } from '../itinerary'
import * as s from '@/lib/db/schema'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'

const USER = '00000000-0000-0000-0000-000000000001' as any
const future = '2026-07-20T14:00:00.000Z'
const past = '2026-07-10T14:00:00.000Z'

const baseIt = (overrides: Partial<any> = {}): any => ({
  id: crypto.randomUUID() as any,
  status: 'scheduled' as const,
  title: 't', detail: null,
  startTime: future, durationMin: 60, people: [],
  userId: USER,
  inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  schemaVersion: 1, ...overrides,
})

describe('ItineraryRepository（D2 reversal: 5 态存储）', () => {
  beforeEach(async () => { await db.delete(s.itineraries).where(eq(s.itineraries.userId, USER)) })

  it('save → findById 往返保持 status=scheduled', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt()
    await repo.save(it, USER)
    const got = await repo.findById(it.id, USER)
    expect(got?.status).toBe('scheduled')
    expect(got?.title).toBe('t')
    expect(got?.people).toEqual([])
  })

  it('save → findById 往返保持 in_progress + inProgressAt', async () => {
    const repo = new ItineraryRepository()
    const it = baseIt({ status: 'in_progress', inProgressAt: '2026-07-15T10:00:00.000Z' })
    await repo.save(it, USER)
    const got = await repo.findById(it.id, USER)
    expect(got?.status).toBe('in_progress')
    expect(got?.inProgressAt).toBe('2026-07-15T10:00:00.000Z')
  })

  it('markInProgress 盖 status + inProgressAt', async () => {
    const repo = new ItineraryRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.markInProgress(id, USER, new Date('2026-07-15T10:00:00.000Z'))
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('in_progress')
    expect(got?.inProgressAt).toBe('2026-07-15T10:00:00.000Z')
  })

  it('markExpired 盖 status + expiredAt', async () => {
    const repo = new ItineraryRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id, startTime: past }), USER)
    await repo.markExpired(id, USER, new Date('2026-07-16T00:00:00.000Z'))
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('expired')
    expect(got?.expiredAt).toBe('2026-07-16T00:00:00.000Z')
  })

  it('cancel 盖 status + cancelledAt', async () => {
    const repo = new ItineraryRepository()
    const id = crypto.randomUUID() as any
    await repo.save(baseIt({ id }), USER)
    await repo.cancel(id, USER)
    const got = await repo.findById(id, USER)
    expect(got?.status).toBe('cancelled')
    expect(got?.cancelledAt).not.toBeNull()
  })

  it('findNeedingReconcile 只返非终态', async () => {
    const repo = new ItineraryRepository()
    const idA = crypto.randomUUID() as any
    const idB = crypto.randomUUID() as any
    const idC = crypto.randomUUID() as any
    await repo.save(baseIt({ id: idA, status: 'scheduled' }), USER)
    await repo.save(baseIt({ id: idB, status: 'cancelled', cancelledAt: '2026-07-14T00:00:00.000Z' }), USER)
    await repo.save(baseIt({ id: idC, status: 'expired', expiredAt: '2026-07-14T00:00:00.000Z' }), USER)
    const list = await repo.findNeedingReconcile(USER)
    const ids = list.map(i => i.id)
    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
    expect(ids).not.toContain(idC)
  })

  it('findByDateRange 只返非终态 + 落区间', async () => {
    const repo = new ItineraryRepository()
    const idIn = crypto.randomUUID() as any
    const idOut = crypto.randomUUID() as any
    await repo.save(baseIt({ id: idIn, startTime: '2026-07-15T14:00:00.000Z' }), USER)
    await repo.save(baseIt({ id: idOut, startTime: '2026-07-30T14:00:00.000Z' }), USER)
    const list = await repo.findByDateRange('2026-07-15T00:00:00.000Z' as any, '2026-07-15T23:59:59.000Z' as any, USER)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(idIn)
  })
})
