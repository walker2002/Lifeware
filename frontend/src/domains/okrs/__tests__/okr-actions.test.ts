/**
 * @file okr-actions.test
 * @brief app/actions/okr.ts Server Actions 集成测试
 *
 * [022] 2026-06-26 review deferred TEST gaps：
 * 覆盖 okr.ts 中 getActiveCycles / createCycle / getObjectives 等
 * 无编排依赖的纯查询/单行写 Server Actions（真实 PG）。
 *
 * [022.01] Phase 1：createCycle 改走 executeIntent → SM create→draft。
 * 客户端仅传 {cycleType,name,periodStart,periodEnd}，server 构造 id/timestamps，
 * SM 强制 status='draft'。自然键 (periodStart, periodEnd) 幂等。
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

  // ─── createCycle（[022.01] Phase 1：走 executeIntent → SM create→draft）──────────────

  it('createCycle 走 executeIntent：新周期以 draft 创建并返回完整 Cycle', async () => {
    const periodStart = '2026-10-01'
    const periodEnd = '2026-12-31'
    const result = await createCycle({
      cycleType: 'quarterly',
      name: '2026-Q4-actions-test',
      periodStart,
      periodEnd,
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.name).toBe('2026-Q4-actions-test')
    expect(result.data!.cycleType).toBe('quarterly')
    expect(result.data!.period.start).toBe(periodStart)
    expect(result.data!.period.end).toBe(periodEnd)
    // SM 强制 status='draft'（不再由调用方传入）
    expect(result.data!.status).toBe('draft')
    expect(result.data!.id).toBeDefined()
    expect(result.data!.createdAt).toBeDefined()
    expect(result.data!.updatedAt).toBeDefined()

    // 清理
    await db.delete(s.cycles)
      .where(and(
        eq(s.cycles.userId, MVP_USER_ID),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
  })

  it('createCycle 同自然键 (periodStart, periodEnd) 重复调用应幂等返回已有 cycle', async () => {
    const periodStart = '2027-01-01'
    const periodEnd = '2027-03-31'

    // 第一次创建
    const r1 = await createCycle({
      cycleType: 'quarterly',
      name: 'actions-test-nk-A',
      periodStart,
      periodEnd,
    })
    expect(r1.success).toBe(true)
    expect(r1.data!.name).toBe('actions-test-nk-A')
    expect(r1.data!.status).toBe('draft')
    const firstId = r1.data!.id

    // 第二次同自然键（不同 name）→ 幂等：返回已有行，name 不被覆盖为 -B
    // [022.01] iter 3 修复：adapter.cycle.create 前置 SELECT 查重，
    // 同自然键已存在 → 直接返回已有行（不写 DB），保护已有 cycle 不被降级
    const r2 = await createCycle({
      cycleType: 'quarterly',
      name: 'actions-test-nk-B',
      periodStart,
      periodEnd,
    })
    expect(r2.success).toBe(true)
    expect(r2.data!.id).toBe(firstId)
    expect(r2.data!.name).toBe('actions-test-nk-A') // 保持首次创建

    // 清理
    await db.delete(s.cycles).where(and(
      eq(s.cycles.userId, MVP_USER_ID),
      eq(s.cycles.periodStart, periodStart),
      eq(s.cycles.periodEnd, periodEnd),
    ))
  })

  // ─── getObjectives（无 status 过滤，返回全部）───────────────

  it('getObjectives 无 status 参数：返回当前用户全部 objectives', async () => {
    const result = await getObjectives()
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  // [022.01] Phase 3：Objective 不再有 status 字段；getObjectives 不接受 status 参数。
  // 原"按 draft 过滤"测试已无意义——改为验证返回列表中无 archivedAt/discardedAt 非 NULL 的目标。
  it('getObjectives 不返回 archivedAt 非 NULL 的 objectives', async () => {
    const result = await getObjectives()
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
    for (const o of result.data!) {
      expect((o as any).archivedAt).toBeFalsy()
      expect((o as any).discardedAt).toBeFalsy()
    }
  })

  // ─── getObjectiveById ──────────────────────────────────────

  it('getObjectiveById 不存在的 id 返回 success=false', async () => {
    const result = await getObjectiveById('00000000-0000-0000-0000-000000000999')
    expect(result.success).toBe(false)
    expect(result.error).toBe('目标不存在')
  })

  // ─── [022.01] Phase 3: assertEditable 守卫测试 ───────────────
  // 验证 reviewed cycle 下写路径被守卫拒绝（不再走 status 字段）。
  // 使用真实 PG 写入 reviewed cycle + 调 createObjective/updateKeyResultProgress 验拒。

  it('createObjective reviewed cycle → 返回 error（assertEditable 守卫）', async () => {
    // 准备：建 reviewed cycle
    const reviewedStart = '2027-10-01'
    const reviewedEnd = '2027-12-31'
    const reviewedCycleId = crypto.randomUUID()
    await db.insert(s.cycles).values({
      id: reviewedCycleId,
      userId: MVP_USER_ID,
      cycleType: 'quarterly',
      name: '2027-Q4-actions-reviewed-guard',
      periodStart: reviewedStart,
      periodEnd: reviewedEnd,
      status: 'reviewed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 调 createObjective（reviewed cycle）→ 应被守卫拒绝
    const result = await createObjective({
      cycleId: reviewedCycleId,
      title: 'P3-守卫-应被拒',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('reviewed')

    // 清理
    await db.delete(s.cycles).where(and(
      eq(s.cycles.userId, MVP_USER_ID),
      eq(s.cycles.id, reviewedCycleId),
    ))
  })

  it('createObjective in_progress cycle → 成功（assertEditable 守卫通过）', async () => {
    // 准备：建 in_progress cycle
    const inProgressStart = '2028-01-01'
    const inProgressEnd = '2028-03-31'
    const ipCycleId = crypto.randomUUID()
    await db.insert(s.cycles).values({
      id: ipCycleId,
      userId: MVP_USER_ID,
      cycleType: 'quarterly',
      name: '2028-Q1-actions-inprogress-guard',
      periodStart: inProgressStart,
      periodEnd: inProgressEnd,
      status: 'in_progress',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await createObjective({
      cycleId: ipCycleId,
      title: 'P3-守卫-应成功',
    })
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    // 清理：删 obj（若存在）+ cycle
    const objId = result.data?.id
    if (objId) {
      // 同时清理挂载的 KR（若有）+ 关联 obj
      await db.delete(s.objectives).where(and(
        eq(s.objectives.userId, MVP_USER_ID),
        eq(s.objectives.id, objId),
      ))
    }
    await db.delete(s.cycles).where(and(
      eq(s.cycles.userId, MVP_USER_ID),
      eq(s.cycles.id, ipCycleId),
    ))
  })

  it('updateKeyResultProgress reviewed cycle → 返回 error（assertEditable 守卫）', async () => {
    // 准备：建 reviewed cycle + objective + KR
    const reviewedStart = '2028-04-01'
    const reviewedEnd = '2028-06-30'
    const reviewedCycleId = crypto.randomUUID()
    const objId = crypto.randomUUID()
    const krId = crypto.randomUUID()
    await db.insert(s.cycles).values({
      id: reviewedCycleId,
      userId: MVP_USER_ID,
      cycleType: 'quarterly',
      name: '2028-Q2-krprogress-reviewed-guard',
      periodStart: reviewedStart,
      periodEnd: reviewedEnd,
      status: 'reviewed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(s.objectives).values({
      id: objId, userId: MVP_USER_ID, cycleId: reviewedCycleId,
      title: 'P3-KR守卫-obj', okrType: 'committed',
      objectiveNumber: '28Q2-O1', priority: 'P1', tags: [],
      createdAt: new Date(), updatedAt: new Date(),
    })
    await db.insert(s.keyResults).values({
      id: krId, userId: MVP_USER_ID, objectiveId: objId,
      title: 'P3-KR守卫-kr',
      targetValue: '10', currentValue: '0', unit: '任务数', progressRate: '0',
      createdAt: new Date(), updatedAt: new Date(),
    })

    // 调 updateKeyResultProgress（reviewed cycle）→ 应被守卫拒绝
    const { updateKeyResultProgress } = await import('@/app/actions/okr')
    const result = await updateKeyResultProgress(krId, 5)
    expect(result.success).toBe(false)
    expect(result.error).toContain('reviewed')

    // 清理
    await db.delete(s.keyResults).where(and(
      eq(s.keyResults.userId, MVP_USER_ID),
      eq(s.keyResults.id, krId),
    ))
    await db.delete(s.objectives).where(and(
      eq(s.objectives.userId, MVP_USER_ID),
      eq(s.objectives.id, objId),
    ))
    await db.delete(s.cycles).where(and(
      eq(s.cycles.userId, MVP_USER_ID),
      eq(s.cycles.id, reviewedCycleId),
    ))
  })
})