/**
 * @file okr.test
 * @brief app/actions/okr.ts Server Action 集成测试 —— [024] G1 deleteCycle
 *
 * 真实 PG 集成：覆盖 deleteCycle 的两条核心路径：
 * 1. 空周期可删（success=true, DB 行消失）
 * 2. 有目标的周期拒绝删除（success=false, DB 行保留）
 *
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 *
 * 自包含策略：测试在 beforeAll 里造一对「空周期 + 含目标周期」，
 * 不依赖 seed-dev 的固定 UUID（DB 可能被重置过），保证可重复。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { deleteCycle, createCycle } from '../okr'

/** MVP 用户 ID（与 app/actions/okr.ts 内部 const 一致） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 本次测试动态创建的两个周期（beforeAll 准备，afterAll 兜底清理） */
let emptyCycleId: string
let nonEmptyCycleId: string

describe('[024] G1 deleteCycle server action', () => {
  beforeAll(async () => {
    const now = new Date()
    emptyCycleId = crypto.randomUUID()
    nonEmptyCycleId = crypto.randomUUID()

    // 1) 空周期（用于「可删」用例）
    // [022.01] Phase 2: assertEditable 守卫仅允许 draft 状态删除；fix status 为 'draft'
    await db.insert(s.cycles).values({
      id: emptyCycleId,
      userId: MVP_USER_ID,
      cycleType: 'quarterly',
      name: 'test-del-024-empty-2027Q1',
      periodStart: '2027-01-01',
      periodEnd: '2027-03-31',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })

    // 2) 含目标的周期（用于「拒绝」用例）：先建周期，再挂一条 objective
    await db.insert(s.cycles).values({
      id: nonEmptyCycleId,
      userId: MVP_USER_ID,
      cycleType: 'quarterly',
      name: 'test-del-024-nonempty-2027Q2',
      periodStart: '2027-04-01',
      periodEnd: '2027-06-30',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(s.objectives).values({
      id: crypto.randomUUID(),
      userId: MVP_USER_ID,
      cycleId: nonEmptyCycleId,
      title: 'test-del-024-guard-obj',
      description: '挂在 nonEmptyCycleId 上用于阻断 deleteCycle',
      objectiveNumber: '27Q2-O1',
      priority: 'P1',
      okrType: 'committed',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    // 兜底：即使中途断言失败，也确保测试期创建的资源被清理
    // 先删 objective（FK 引用），再删 cycle
    await db.delete(s.objectives)
      .where(eq(s.objectives.cycleId, nonEmptyCycleId))
    if (emptyCycleId) {
      await db.delete(s.cycles)
        .where(and(eq(s.cycles.id, emptyCycleId), eq(s.cycles.userId, MVP_USER_ID)))
    }
    if (nonEmptyCycleId) {
      await db.delete(s.cycles)
        .where(and(eq(s.cycles.id, nonEmptyCycleId), eq(s.cycles.userId, MVP_USER_ID)))
    }
  })

  it('空周期可删（success=true，DB 行消失）', async () => {
    const r = await deleteCycle(emptyCycleId)
    expect(r.success).toBe(true)
    expect(r.error).toBeUndefined()

    // 验证 DB 中周期确实被删除
    const rows = await db.select({ id: s.cycles.id })
      .from(s.cycles)
      .where(and(eq(s.cycles.id, emptyCycleId), eq(s.cycles.userId, MVP_USER_ID)))
    expect(rows.length).toBe(0)
  })

  it('有目标的周期拒绝删除（success=false，DB 行保留）', async () => {
    const r = await deleteCycle(nonEmptyCycleId)
    expect(r.success).toBe(false)
    expect(r.error).toBeDefined()

    // 验证 DB 中周期仍存在（未被误删）
    const rows = await db.select({ id: s.cycles.id, name: s.cycles.name })
      .from(s.cycles)
      .where(and(eq(s.cycles.id, nonEmptyCycleId), eq(s.cycles.userId, MVP_USER_ID)))
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('test-del-024-nonempty-2027Q2')
  })
})
