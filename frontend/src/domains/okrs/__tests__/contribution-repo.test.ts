/**
 * @file contribution-repo
 * @brief ContributionRepository 真实 PG 集成测试
 *
 * [022] 2A-T4：contribution 的 add→findByKeyResult 往返、findByContributor 按来源过滤、
 * remove 后不可查、removeByContributor 级联清理。
 * [022] 2B-T6：recomputeProgress 完整实现 — 任务数单位、非任务数 delta、习惯 per-completion、
 * 周期过滤、零贡献。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { ContributionRepository } from '../repository/contribution'
import { registerContextCapability, clearRegistry } from '@/nexus/context-engine/registry'

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
        name: '2025-Q4-T6',
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
        title: 'T6 测试目标',
        cycleId: cycleId,
        status: 'active',
        okrType: 'committed',
        objectiveNumber: 'O-T6',
        priority: 'P1',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 3. KeyResult x2（默认 unit 设为 ''，各测试按需覆盖）
    const existingKRs = await db.select().from(s.keyResults)
      .where(and(
        eq(s.keyResults.userId, USER_ID),
        eq(s.keyResults.objectiveId, objectiveId),
      ))
    const existingKRMap = new Map(existingKRs.map(kr => [kr.title, kr.id]))
    krId1 = existingKRMap.get('T6 KR-1') ?? crypto.randomUUID()
    krId2 = existingKRMap.get('T6 KR-2') ?? crypto.randomUUID()
    for (const kr of [
      { id: krId1, title: 'T6 KR-1', targetValue: '100' },
      { id: krId2, title: 'T6 KR-2', targetValue: '50' },
    ]) {
      if (!existingKRMap.has(kr.title)) {
        await db.insert(s.keyResults).values({
          id: kr.id,
          userId: USER_ID,
          objectiveId: objectiveId,
          title: kr.title,
          targetValue: kr.targetValue,
          currentValue: '0',
          unit: '任务数',
          progressRate: '0',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
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
      description: '已完成任务（测试用）',
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

  // ─── T4 原有测试 ────────────────────────────────────────────────

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

  // ─── T6 recomputeProgress 测试 ──────────────────────────────────

  /** 辅助：清理指定 KR 下所有 contribution */
  async function cleanContributions(krId: string) {
    const existing = await repo.findByKeyResult(krId, USER_ID)
    for (const c of existing) await repo.remove(c.id, USER_ID)
  }

  it('recomputeProgress 零贡献记录 → currentValue=0 / progressRate=0', async () => {
    await cleanContributions(krId2)
    const result = await repo.recomputeProgress(krId2, USER_ID)
    expect(result).toEqual({ currentValue: 0, progressRate: 0 })
  })

  it('recomputeProgress 任务数单位 — 统计周期内已完成 task 贡献', async () => {
    // 准备 KR：unit=任务数、targetValue=10
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId1), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId1)

    // 创建已完成 task（completedAt 在周期内）
    const taskId1 = crypto.randomUUID()
    const taskId2 = crypto.randomUUID()
    const testTaskIds = [taskId1, taskId2]
    await db.insert(s.tasks).values([
      {
        id: taskId1, userId: USER_ID,
        status: 'completed', title: 'T6 测试任务-1',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-15'),
      },
      {
        id: taskId2, userId: USER_ID,
        status: 'completed', title: 'T6 测试任务-2',
        priority: 'medium', energyRequired: 'medium',
        completedAt: new Date('2025-11-20'),
      },
    ])

    // 添加 task contribution
    await repo.add({ keyResultId: krId1, contributorType: 'task', contributorId: taskId1 }, USER_ID)
    await repo.add({ keyResultId: krId1, contributorType: 'task', contributorId: taskId2 }, USER_ID)

    const result = await repo.recomputeProgress(krId1, USER_ID)
    expect(result.currentValue).toBe(2)
    expect(result.progressRate).toBe(0.2)

    // 清理
    await cleanContributions(krId1)
    for (const id of testTaskIds) {
      await db.delete(s.tasks).where(and(eq(s.tasks.id, id), eq(s.tasks.userId, USER_ID)))
    }
  })

  it('recomputeProgress 非任务数单位 — manual 贡献加总 delta', async () => {
    // 准备 KR：unit=小时、targetValue=20
    await db.update(s.keyResults)
      .set({ unit: '小时', targetValue: '20', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId2), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId2)

    // 添加 2 条 manual 贡献，各 delta=5
    const c1 = await repo.add({
      keyResultId: krId2, contributorType: 'manual',
      contributorId: crypto.randomUUID(), delta: 5,
    }, USER_ID)
    const c2 = await repo.add({
      keyResultId: krId2, contributorType: 'manual',
      contributorId: crypto.randomUUID(), delta: 5,
    }, USER_ID)

    const result = await repo.recomputeProgress(krId2, USER_ID)
    expect(result.currentValue).toBe(10)
    expect(result.progressRate).toBe(0.5)

    // 清理
    await repo.remove(c1.id, USER_ID)
    await repo.remove(c2.id, USER_ID)
  })

  it('recomputeProgress 习惯 per-completion — 每条 completed habit_log 计 1 单位', async () => {
    // 准备 KR：unit=任务数、targetValue=10
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId2), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId2)

    // 创建测试 habit
    const habitId = crypto.randomUUID()
    const now = new Date()
    await db.insert(s.habits).values({
      id: habitId, userId: USER_ID,
      status: 'active', title: 'T6 测试习惯',
      frequencyType: 'daily',
      defaultTime: '08:00', earliestTime: '06:00', latestStartTime: '10:00',
      defaultDuration: 30, minDuration: 5,
      trackable: true, startDate: '2025-10-01',
      streak: 0, longestStreak: 0, completionRate7d: 0,
      tags: [],
      createdAt: now, updatedAt: now,
    })

    // 插入 3 条 completed habit_log（均在周期内）
    await db.insert(s.habitLogs).values([
      { habitId, userId: USER_ID, date: '2025-10-05', completionStatus: 'completed' },
      { habitId, userId: USER_ID, date: '2025-10-10', completionStatus: 'completed' },
      { habitId, userId: USER_ID, date: '2025-11-01', completionStatus: 'completed' },
    ])

    // 添加 habit contribution
    const c = await repo.add({
      keyResultId: krId2, contributorType: 'habit', contributorId: habitId,
    }, USER_ID)

    const result = await repo.recomputeProgress(krId2, USER_ID)
    expect(result.currentValue).toBe(3) // 每条 completed log = 1
    expect(result.progressRate).toBe(0.3)

    // 清理
    await repo.remove(c.id, USER_ID)
    await db.delete(s.habitLogs).where(and(eq(s.habitLogs.habitId, habitId), eq(s.habitLogs.userId, USER_ID)))
    await db.delete(s.habits).where(and(eq(s.habits.id, habitId), eq(s.habits.userId, USER_ID)))
  })

  it('recomputeProgress 周期过滤 — 排除 cycle period 外的 habit_log', async () => {
    // 准备 KR：unit=任务数、targetValue=10
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId1), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId1)

    // 创建测试 habit
    const habitId = crypto.randomUUID()
    const now = new Date()
    await db.insert(s.habits).values({
      id: habitId, userId: USER_ID,
      status: 'active', title: 'T6 周期过滤测试习惯',
      frequencyType: 'daily',
      defaultTime: '08:00', earliestTime: '06:00', latestStartTime: '10:00',
      defaultDuration: 30, minDuration: 5,
      trackable: true, startDate: '2025-09-01',
      streak: 0, longestStreak: 0, completionRate7d: 0,
      tags: [],
      createdAt: now, updatedAt: now,
    })

    // 插入 habit_logs：2 条在周期内（2025-10-01~2025-12-31），1 条在周期外
    await db.insert(s.habitLogs).values([
      { habitId, userId: USER_ID, date: '2025-09-15', completionStatus: 'completed' }, // 周期外（早于 10-01）
      { habitId, userId: USER_ID, date: '2025-10-15', completionStatus: 'completed' }, // 周期内
      { habitId, userId: USER_ID, date: '2025-11-20', completionStatus: 'completed' }, // 周期内
    ])

    // 添加 habit contribution
    const c = await repo.add({
      keyResultId: krId1, contributorType: 'habit', contributorId: habitId,
    }, USER_ID)

    const result = await repo.recomputeProgress(krId1, USER_ID)
    // 仅 2 条周期内 completed log 被计数
    expect(result.currentValue).toBe(2)
    expect(result.progressRate).toBe(0.2)

    // 清理
    await repo.remove(c.id, USER_ID)
    await db.delete(s.habitLogs).where(and(eq(s.habitLogs.habitId, habitId), eq(s.habitLogs.userId, USER_ID)))
    await db.delete(s.habits).where(and(eq(s.habits.id, habitId), eq(s.habits.userId, USER_ID)))
  })

  it('recomputeProgress 双向钳制 — currentValue 不超出 [0, targetValue]', async () => {
    // 准备 KR：targetValue=10，非任务数单位以启用 delta 路径
    await db.update(s.keyResults)
      .set({ unit: '小时', targetValue: '10', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId1), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId1)

    // 添加 manual 贡献 delta=15（超过 targetValue），应被钳制到 10
    const c = await repo.add({
      keyResultId: krId1, contributorType: 'manual',
      contributorId: crypto.randomUUID(), delta: 15,
    }, USER_ID)

    const result = await repo.recomputeProgress(krId1, USER_ID)
    expect(result.currentValue).toBe(10) // 钳制到 targetValue
    expect(result.progressRate).toBe(1.0)

    // 清理
    await repo.remove(c.id, USER_ID)
  })

  it('recomputeProgress 混合来源 — task + habit 联合计算', async () => {
    // 准备 KR：unit=任务数、targetValue=20
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '20', currentValue: '0' })
      .where(and(eq(s.keyResults.id, krId1), eq(s.keyResults.userId, USER_ID)))
    await cleanContributions(krId1)

    // Task 贡献
    const taskId = crypto.randomUUID()
    await db.insert(s.tasks).values({
      id: taskId, userId: USER_ID,
      status: 'completed', title: 'T6 混合测试任务',
      priority: 'medium', energyRequired: 'medium',
      completedAt: new Date('2025-11-15'),
    })
    await repo.add({ keyResultId: krId1, contributorType: 'task', contributorId: taskId }, USER_ID)

    // Habit 贡献（2 条 completed log）
    const habitId = crypto.randomUUID()
    const now = new Date()
    await db.insert(s.habits).values({
      id: habitId, userId: USER_ID,
      status: 'active', title: 'T6 混合测试习惯',
      frequencyType: 'daily',
      defaultTime: '08:00', earliestTime: '06:00', latestStartTime: '10:00',
      defaultDuration: 30, minDuration: 5,
      trackable: true, startDate: '2025-10-01',
      streak: 0, longestStreak: 0, completionRate7d: 0,
      tags: [],
      createdAt: now, updatedAt: now,
    })
    await db.insert(s.habitLogs).values([
      { habitId, userId: USER_ID, date: '2025-10-05', completionStatus: 'completed' },
      { habitId, userId: USER_ID, date: '2025-11-01', completionStatus: 'completed' },
    ])
    await repo.add({ keyResultId: krId1, contributorType: 'habit', contributorId: habitId }, USER_ID)

    // Manual 贡献（delta=3）
    const cManual = await repo.add({
      keyResultId: krId1, contributorType: 'manual',
      contributorId: crypto.randomUUID(), delta: 3,
    }, USER_ID)

    const result = await repo.recomputeProgress(krId1, USER_ID)
    // task(1) + habit(2) + manual(1) = 4（单位是"次"=count unit）
    // 但 manual 的 delta=3 在 count unit 下被忽略（count unit 下 manual 也是 1）
    expect(result.currentValue).toBe(4)
    expect(result.progressRate).toBe(0.2)

    // 清理
    await cleanContributions(krId1)
    await db.delete(s.tasks).where(and(eq(s.tasks.id, taskId), eq(s.tasks.userId, USER_ID)))
    await db.delete(s.habitLogs).where(and(eq(s.habitLogs.habitId, habitId), eq(s.habitLogs.userId, USER_ID)))
    await db.delete(s.habits).where(and(eq(s.habits.id, habitId), eq(s.habits.userId, USER_ID)))
  })
})
