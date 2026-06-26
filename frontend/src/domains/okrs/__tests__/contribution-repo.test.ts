/**
 * @file contribution-repo
 * @brief ContributionRepository 真实 PG 集成测试
 *
 * [022] 2A-T4：contribution 的 add→findByKeyResult 往返、findByContributor 按来源过滤、
 * remove 后不可查、removeByContributor 级联清理。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ContributionRepository } from '../repository/contribution'

/** MVP 用户 ID（与 app/actions/okr.ts 保持一致的现状来源） */
const USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 避免 uq_cycles_user_period 冲突，使用唯一日期区间 */
const periodStart = '2025-10-01'
const periodEnd = '2025-12-31'

/** 测试用的实体 ID（在 beforeAll 中解析实际数据库中的 ID） */
let cycleId: string
let objectiveId: string
let krId1: string
let krId2: string

describe('ContributionRepository', () => {
  const repo = new ContributionRepository()

  /** 创建或复用前置实体：Cycle → Objective → KeyResult（满足 FK 约束链） */
  beforeAll(async () => {
    // 1. Cycle：按自然键查找已有，否则新建
    const existingCycle = await db.select().from(s.cycles)
      .where(and(
        eq(s.cycles.userId, USER_ID),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
      .limit(1)
    if (existingCycle.length > 0) {
      cycleId = existingCycle[0].id
    } else {
      cycleId = crypto.randomUUID()
      await db.insert(s.cycles).values({
        id: cycleId,
        userId: USER_ID,
        cycleType: 'quarterly',
        name: '2025-Q4-T4',
        periodStart,
        periodEnd,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 2. Objective
    const existingObj = await db.select().from(s.objectives)
      .where(and(
        eq(s.objectives.userId, USER_ID),
        eq(s.objectives.cycleId, cycleId),
      ))
      .limit(1)
    if (existingObj.length > 0) {
      objectiveId = existingObj[0].id
    } else {
      objectiveId = crypto.randomUUID()
      await db.insert(s.objectives).values({
        id: objectiveId,
        userId: USER_ID,
        title: 'T4 测试目标',
        cycleId: cycleId,
        status: 'active',
        okrType: 'committed',
        objectiveNumber: 'O-T4',
        priority: 'P1',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 3. KeyResult x2
    const existingKRs = await db.select().from(s.keyResults)
      .where(and(
        eq(s.keyResults.userId, USER_ID),
        eq(s.keyResults.objectiveId, objectiveId),
      ))
    const existingKRMap = new Map(existingKRs.map(kr => [kr.title, kr.id]))
    krId1 = existingKRMap.get('T4 KR-1') ?? crypto.randomUUID()
    krId2 = existingKRMap.get('T4 KR-2') ?? crypto.randomUUID()
    for (const kr of [
      { id: krId1, title: 'T4 KR-1', targetValue: '100' },
      { id: krId2, title: 'T4 KR-2', targetValue: '50' },
    ]) {
      if (!existingKRMap.has(kr.title)) {
        await db.insert(s.keyResults).values({
          id: kr.id,
          userId: USER_ID,
          objectiveId: objectiveId,
          title: kr.title,
          targetValue: kr.targetValue,
          currentValue: '0',
          unit: '',
          progressRate: '0',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    }
  })

  it('add → findByKeyResult 往返', async () => {
    const c = await repo.add({
      keyResultId: krId1,
      contributorType: 'task',
      contributorId: crypto.randomUUID(),
    }, USER_ID)
    expect(c.id).toBeDefined()
    expect(c.contributorType).toBe('task')
    expect(c.keyResultId).toBe(krId1)

    const found = await repo.findByKeyResult(krId1, USER_ID)
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found.some(f => f.id === c.id)).toBe(true)
  })

  it('findByContributor 按来源过滤', async () => {
    const taskId = crypto.randomUUID()
    await repo.add({
      keyResultId: krId1,
      contributorType: 'task',
      contributorId: taskId,
    }, USER_ID)

    const found = await repo.findByContributor('task', taskId, USER_ID)
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found.every(f => f.contributorType === 'task' && f.contributorId === taskId)).toBe(true)
  })

  it('remove 后查不到', async () => {
    const c = await repo.add({
      keyResultId: krId2,
      contributorType: 'manual',
      contributorId: crypto.randomUUID(),
    }, USER_ID)
    expect(c.id).toBeDefined()

    await repo.remove(c.id, USER_ID)
    const found = await repo.findByKeyResult(krId2, USER_ID)
    expect(found.some(f => f.id === c.id)).toBe(false)
  })

  it('removeByContributor 级联清理', async () => {
    const habitId = crypto.randomUUID()
    // 插入 2 条同 contributor 但不同 KR 的记录（uq_contributions_kr_source 不允许同源重复）
    await repo.add({ keyResultId: krId1, contributorType: 'habit', contributorId: habitId }, USER_ID)
    await repo.add({ keyResultId: krId2, contributorType: 'habit', contributorId: habitId }, USER_ID)

    await repo.removeByContributor('habit', habitId, USER_ID)
    const found = await repo.findByContributor('habit', habitId, USER_ID)
    expect(found.length).toBe(0)
  })

  it('recomputeProgress 返回骨架占位（T6 补全完整实现）', async () => {
    // 先确保 KR 下有 contribution
    await repo.add({
      keyResultId: krId1,
      contributorType: 'manual',
      contributorId: crypto.randomUUID(),
      delta: 10,
      weight: 1.0,
    }, USER_ID)

    const progress = await repo.recomputeProgress(krId1, USER_ID)
    expect(progress).toEqual({
      currentValue: 0,
      progressRate: 0,
      completedCount: 0,
      totalCount: expect.any(Number),
    })
    expect(progress.totalCount).toBeGreaterThanOrEqual(1)
  })
})
