/**
 * @file okr-actions.test
 * @brief app/actions/okr.ts Server Actions 集成测试
 *
 * [022] 2026-06-26 review deferred TEST gaps：
 * 覆盖 okr.ts 中 getActiveCycles / createCycle / getObjectives 等
 * 无编排依赖的纯查询/单行写 Server Actions（真实 PG）。
 *
 * 不测试走 Orchestrator 的复杂 actions（createObjective 等）——
 * 那些路径由 cross-domain-event.test / hook 集成测试覆盖，本文件
 * 只锁住「Server Action 直连 repo」这条最简写路径不被回归破坏。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  getActiveCycles,
  createCycle,
  getObjectives,
  getObjectiveById,
} from '@/app/actions/okr'

/** MVP 用户 ID（与 actions/okr.ts 内部 const 一致） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

describe('app/actions/okr.ts Server Actions', () => {
  let testCycleId: string

  beforeAll(async () => {
    // 准备：确保至少存在一个 in_progress 周期供 getActiveCycles 返回
    const periodStart = '2026-07-01'
    const periodEnd = '2026-09-30'
    const existing = await db.select().from(s.cycles)
      .where(and(
        eq(s.cycles.userId, MVP_USER_ID),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
      .limit(1)
    if (existing.length > 0) {
      testCycleId = existing[0].id
    } else {
      testCycleId = crypto.randomUUID()
      await db.insert(s.cycles).values({
        id: testCycleId,
        userId: MVP_USER_ID,
        cycleType: 'quarterly',
        name: '2026-Q3-actions-test',
        periodStart,
        periodEnd,
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })

  afterAll(async () => {
    // 测试周期可能被其他 objectives FK 引用，仅在无引用时清理
    const referenced = await db.select({ id: s.objectives.id })
      .from(s.objectives)
      .where(eq(s.objectives.cycleId, testCycleId))
      .limit(1)
    if (referenced.length === 0) {
      await db.delete(s.cycles)
        .where(and(
          eq(s.cycles.userId, MVP_USER_ID),
          eq(s.cycles.id, testCycleId),
        ))
    }
  })

  // ─── getActiveCycles ────────────────────────────────────────

  it('getActiveCycles 返回 success 且仅含 in_progress 周期', async () => {
    const result = await getActiveCycles()
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(Array.isArray(result.data)).toBe(true)
    // 所有返回项 status 均为 in_progress
    for (const c of result.data!) {
      expect(c.status).toBe('in_progress')
    }
    // 至少含本次测试用的周期
    expect(result.data!.some((c) => c.id === testCycleId)).toBe(true)
  })

  // ─── createCycle（白名单允许直写）──────────────────────────

  it('createCycle 单行 upsert：新周期能 findById 取回', async () => {
    const periodStart = '2026-10-01'
    const periodEnd = '2026-12-31'
    const cycleInput = {
      id: crypto.randomUUID(),
      cycleType: 'quarterly' as const,
      name: '2026-Q4-actions-test',
      period: { start: periodStart, end: periodEnd },
      status: 'in_progress' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    } as any

    const result = await createCycle(cycleInput)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.id).toBe(cycleInput.id)
    expect(result.data!.name).toBe('2026-Q4-actions-test')

    // 清理
    await db.delete(s.cycles)
      .where(and(eq(s.cycles.id, cycleInput.id), eq(s.cycles.userId, MVP_USER_ID)))
  })

  it('createCycle 重复 (id 相同) 应走 upsert 覆盖', async () => {
    const id = crypto.randomUUID()
    const base = {
      id,
      cycleType: 'quarterly' as const,
      name: 'actions-test-upsert-A',
      period: { start: '2027-01-01', end: '2027-03-31' },
      status: 'draft' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    } as any

    // 第一次写入
    const r1 = await createCycle(base)
    expect(r1.success).toBe(true)
    expect(r1.data!.name).toBe('actions-test-upsert-A')

    // 第二次同 id，name 改变 → 应 upsert 覆盖
    const r2 = await createCycle({ ...base, name: 'actions-test-upsert-B' })
    expect(r2.success).toBe(true)
    expect(r2.data!.name).toBe('actions-test-upsert-B')

    // 清理
    await db.delete(s.cycles).where(and(eq(s.cycles.id, id), eq(s.cycles.userId, MVP_USER_ID)))
  })

  // ─── getObjectives（无 status 过滤，返回全部）───────────────

  it('getObjectives 无 status 参数：返回当前用户全部 objectives', async () => {
    const result = await getObjectives()
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('getObjectives(draft) 仅返回 draft objectives', async () => {
    const result = await getObjectives('draft')
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
    for (const o of result.data!) {
      expect(o.status).toBe('draft')
    }
  })

  // ─── getObjectiveById ──────────────────────────────────────

  it('getObjectiveById 不存在的 id 返回 success=false', async () => {
    const result = await getObjectiveById('00000000-0000-0000-0000-000000000999')
    expect(result.success).toBe(false)
    expect(result.error).toBe('目标不存在')
  })
})