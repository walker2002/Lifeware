/**
 * @file key-result-repo
 * @brief KeyResultRepository.updateProgress 集成测试
 *
 * [022] 2B-T8：验证 updateProgress 经 ContributionRepository.recomputeProgress 重算，
 * 含孤儿贡献清理（源已删除的 task/habit 引用）。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { KeyResultRepository } from '../repository/key-result'
import { ContributionRepository } from '../repository/contribution'
import { registerContextCapability, clearRegistry } from '@/nexus/context-engine/registry'

/** MVP 用户 ID（与 contribution-repo.test 保持一致） */
const USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 避免 uq_cycles_user_period 冲突，使用唯一日期区间 */
const periodStart = '2025-10-01'
const periodEnd = '2025-12-31'

/** 测试用的实体 ID */
let cycleId: string
let objectiveId: string
let krId: string

describe('KeyResultRepository.updateProgress 集成', () => {
  const krRepo = new KeyResultRepository()
  const contributionRepo = new ContributionRepository()

  /** 创建前置实体链：Cycle → Objective → KeyResult */
  beforeAll(async () => {
    // 1. Cycle
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
        name: '2025-Q4-T8',
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
        title: 'T8 测试目标',
        cycleId,
        status: 'active',
        okrType: 'committed',
        objectiveNumber: 'O-T8',
        priority: 'P1',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 3. KeyResult
    const existingKR = await db.select().from(s.keyResults)
      .where(and(
        eq(s.keyResults.userId, USER_ID),
        eq(s.keyResults.objectiveId, objectiveId),
        eq(s.keyResults.title, 'T8 KR-更新进度'),
      ))
      .limit(1)
    if (existingKR.length > 0) {
      krId = existingKR[0].id
    } else {
      krId = crypto.randomUUID()
      await db.insert(s.keyResults).values({
        id: krId,
        userId: USER_ID,
        objectiveId,
        title: 'T8 KR-更新进度',
        targetValue: '10',
        currentValue: '0',
        unit: '任务数',
        progressRate: '0',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 4. 注册 completedTasks ContextProvider（供 recomputeProgress task 路径使用）
    registerContextCapability({
      id: 'completedTasks',
      visibility: 'planning',
      schema: z.array(z.object({
        id: z.string(),
        title: z.string(),
        completedAt: z.string().optional(),
      })),
      description: '已完成任务（T8 测试用）',
      provider: {
        async provide(query: string, params: Record<string, unknown>) {
          if (query !== 'completed_ids') return []
          const { userId } = params as { userId: string }
          const rows = await db.select({
            id: s.tasks.id,
            title: s.tasks.title,
            completedAt: s.tasks.completedAt,
          })
            .from(s.tasks)
            .where(and(
              eq(s.tasks.userId, userId),
              eq(s.tasks.status, 'completed'),
            ))
          return rows.map(r => ({
            id: r.id,
            title: r.title,
            completedAt: r.completedAt?.toISOString(),
          }))
        },
      },
    })
  })

  afterAll(() => {
    clearRegistry()
  })

  /** 辅助：清理指定 KR 下所有 contribution */
  async function cleanContributions(krIdToClean: string) {
    const existing = await contributionRepo.findByKeyResult(krIdToClean, USER_ID)
    for (const c of existing) await contributionRepo.remove(c.id, USER_ID)
  }

  // ─── 测试 (a)：经 ContributionRepository 重算 currentValue ───

  it('updateProgress 经 ContributionRepository 重算 currentValue（任务数单位）', async () => {
    // 准备 KR
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0', status: 'active' })
      .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId)

    // 创建 3 个已完成 task（其中 2 个在周期内 completedAt）
    const taskId1 = crypto.randomUUID()
    const taskId2 = crypto.randomUUID()
    const taskId3 = crypto.randomUUID()
    const testTaskIds = [taskId1, taskId2, taskId3]
    await db.insert(s.tasks).values([
      {
        id: taskId1, userId: USER_ID,
        status: 'completed', title: 'T8 测试任务-1',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-15'),
      },
      {
        id: taskId2, userId: USER_ID,
        status: 'completed', title: 'T8 测试任务-2',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-20'),
      },
      {
        id: taskId3, userId: USER_ID,
        status: 'completed', title: 'T8 测试任务-3',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-08-01'), // 周期外（早于 10-01）
      },
    ])

    // 添加 3 个 task 贡献
    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: taskId1 }, USER_ID)
    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: taskId2 }, USER_ID)
    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: taskId3 }, USER_ID)

    // 调用 updateProgress（_currentValue 被忽略，经 junction 重算）
    const updated = await krRepo.updateProgress(krId, 999, USER_ID)

    // 断言：仅 2 个周期内完成的 task 被计数
    expect(Number(updated.currentValue)).toBe(2)
    expect(Number(updated.progressRate)).toBe(0.2)

    // 清理
    await cleanContributions(krId)
    for (const id of testTaskIds) {
      await db.delete(s.tasks).where(and(eq(s.tasks.id, id), eq(s.tasks.userId, USER_ID)))
    }
  })

  it('updateProgress status 派生 — currentValue 达 targetValue 时自动 completed', async () => {
    // 准备 KR：targetValue=2
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '2', currentValue: '0', status: 'active' })
      .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId)

    // 创建 2 个已完成 task（均在周期内）
    const taskId1 = crypto.randomUUID()
    const taskId2 = crypto.randomUUID()
    const testTaskIds = [taskId1, taskId2]
    await db.insert(s.tasks).values([
      {
        id: taskId1, userId: USER_ID,
        status: 'completed', title: 'T8 状态派生-1',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-15'),
      },
      {
        id: taskId2, userId: USER_ID,
        status: 'completed', title: 'T8 状态派生-2',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-20'),
      },
    ])

    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: taskId1 }, USER_ID)
    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: taskId2 }, USER_ID)

    const updated = await krRepo.updateProgress(krId, 0, USER_ID)

    // 断言：currentValue=2 >= targetValue=2 → status='completed'
    expect(Number(updated.currentValue)).toBe(2)
    expect(updated.status).toBe('completed')

    // 清理
    await cleanContributions(krId)
    for (const id of testTaskIds) {
      await db.delete(s.tasks).where(and(eq(s.tasks.id, id), eq(s.tasks.userId, USER_ID)))
    }
  })

  // ─── 测试 (b)：孤儿清理 — 源已删除的贡献被自动移除 ───

  it('updateProgress 孤儿清理 — 已删除 task 的 contribution 被自动移除', async () => {
    // 准备 KR
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0', status: 'active' })
      .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId)

    // 创建一个 task，添加 contribution，然后删除 task（模拟孤儿场景）
    const deadTaskId = crypto.randomUUID()
    await db.insert(s.tasks).values({
      id: deadTaskId, userId: USER_ID,
      status: 'completed', title: 'T8 将死任务',
      priority: 'medium', energyRequired: 'medium',
      completedAt: new Date('2025-11-15'),
    })
    await contributionRepo.add({ keyResultId: krId, contributorType: 'task', contributorId: deadTaskId }, USER_ID)

    // 确认 contribution 已存在
    const before = await contributionRepo.findByKeyResult(krId, USER_ID)
    expect(before.some(c => c.contributorId === deadTaskId)).toBe(true)

    // 删除 task（模拟源已不存在）
    await db.delete(s.tasks).where(and(eq(s.tasks.id, deadTaskId), eq(s.tasks.userId, USER_ID)))

    // 调用 updateProgress → 应触发孤儿清理
    const updated = await krRepo.updateProgress(krId, 0, USER_ID)

    // 断言：孤儿 contribution 已被移除
    const after = await contributionRepo.findByKeyResult(krId, USER_ID)
    expect(after.some(c => c.contributorId === deadTaskId)).toBe(false)

    // 断言：currentValue 为 0（因为没有有效贡献）
    expect(Number(updated.currentValue)).toBe(0)

    // 清理
    await cleanContributions(krId)
  })

  it('updateProgress 孤儿清理 — 已删除 habit 的 contribution 被自动移除', async () => {
    // 准备 KR
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0', status: 'active' })
      .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId)

    // 创建一个 habit，添加 contribution，然后删除 habit（模拟孤儿场景）
    const deadHabitId = crypto.randomUUID()
    const now = new Date()
    await db.insert(s.habits).values({
      id: deadHabitId, userId: USER_ID,
      status: 'active', title: 'T8 将死习惯',
      frequencyType: 'daily',
      defaultTime: '08:00', earliestTime: '06:00', latestStartTime: '10:00',
      defaultDuration: 30, minDuration: 5,
      trackable: true, startDate: '2025-10-01',
      streak: 0, longestStreak: 0, completionRate7d: 0,
      tags: [],
      createdAt: now, updatedAt: now,
    })
    await contributionRepo.add({ keyResultId: krId, contributorType: 'habit', contributorId: deadHabitId }, USER_ID)

    // 确认 contribution 已存在
    const before = await contributionRepo.findByKeyResult(krId, USER_ID)
    expect(before.some(c => c.contributorId === deadHabitId)).toBe(true)

    // 删除 habit（模拟源已不存在）
    await db.delete(s.habits).where(and(eq(s.habits.id, deadHabitId), eq(s.habits.userId, USER_ID)))

    // 调用 updateProgress → 应触发孤儿清理
    const updated = await krRepo.updateProgress(krId, 0, USER_ID)

    // 断言：孤儿 contribution 已被移除
    const after = await contributionRepo.findByKeyResult(krId, USER_ID)
    expect(after.some(c => c.contributorId === deadHabitId)).toBe(false)

    // 断言：currentValue 为 0（因为没有有效贡献）
    expect(Number(updated.currentValue)).toBe(0)

    // 清理
    await cleanContributions(krId)
  })
})
