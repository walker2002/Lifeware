/**
 * @file key-result-repo
 * @brief KeyResultRepository.updateProgress 集成测试
 *
 * [022] 2B-T8：验证 updateProgress 经 ContributionRepository.recomputeProgress 重算，
 * 含孤儿贡献清理（源已删除的 task/habit 引用）。
 * [022.01] Phase 3：移除 KR.status 字段派生；改为自动管理 completedAt。
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

    // 2. Objective — [022.01] Phase 3：移除 status 字段
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
        okrType: 'committed',
        objectiveNumber: 'O-T8',
        priority: 'P1',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 3. KeyResult — [022.01] Phase 3：移除 status 字段
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
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
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

  // [022.01] Phase 3：移除 status 派生，改为 completedAt 自动管理。
  // 新语义：progressRate >= 1.0 时自动设置 completedAt。
  it('updateProgress 派生 completedAt — progressRate >= 1.0 自动设置', async () => {
    // 准备 KR：targetValue=2
    await db.update(s.keyResults)
      .set({ unit: '任务数', targetValue: '2', currentValue: '0', completedAt: null })
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

    // 断言：currentValue=2 >= targetValue=2 → completedAt 自动设置
    expect(Number(updated.currentValue)).toBe(2)
    expect(updated.completedAt).toBeDefined()
    expect(updated.completedAt).not.toBeNull()

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
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
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
      .set({ unit: '任务数', targetValue: '10', currentValue: '0' })
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

  // ─── [022] 2026-06-26 review deferred TEST gaps ───────────
  // 补 KeyResultRepository.updateFields / save 两个未覆盖方法的回归测试
  // [022.01] Phase 3：移除 archive 方法测试（status 字段已删除，archive 不再是测试目标）

  it('updateFields 局部字段更新（仅改 title，其余字段保持）', async () => {
    const updated = await krRepo.updateFields(
      krId,
      { title: 'T8 KR-更新进度-afterUpdateFields' },
      USER_ID,
    )
    expect(updated.title).toBe('T8 KR-更新进度-afterUpdateFields')
    // 断言：其他字段未被覆盖
    expect(updated.targetValue).toBe(10)
    expect(updated.unit).toBe('任务数')
    // 还原 title 以免影响后续测试
    await krRepo.updateFields(krId, { title: 'T8 KR-更新进度' }, USER_ID)
  })

  it('updateFields 不存在的 id 抛错', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000999'
    await expect(
      krRepo.updateFields(fakeId, { title: 'never' }, USER_ID),
    ).rejects.toThrow('not found after updateFields')
  })

  it('save (upsert) 按 id 冲突更新：第二次 save 覆盖第一次的字段', async () => {
    // 准备：构造 KR 对象，第一次 save — [022.01] Phase 3：移除 status 字段
    const krA = {
      id: krId,
      userId: USER_ID as any,
      objectiveId,
      title: 'T8 KR-saveTest-A',
      description: 'desc-A',
      targetValue: 10,
      currentValue: 0,
      unit: '任务数' as const,
      progressRate: 0,
      priority: 'P1' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    } as any
    await krRepo.save(krA, USER_ID)
    let got = await krRepo.findById(krId, USER_ID)
    expect(got?.title).toBe('T8 KR-saveTest-A')
    expect(got?.description).toBe('desc-A')

    // 第二次 save：相同 id，title/description 不同 → 应覆盖
    const krB = {
      ...krA,
      title: 'T8 KR-saveTest-B',
      description: 'desc-B',
      updatedAt: new Date().toISOString() as any,
    }
    await krRepo.save(krB, USER_ID)
    got = await krRepo.findById(krId, USER_ID)
    expect(got?.title).toBe('T8 KR-saveTest-B')
    expect(got?.description).toBe('desc-B')

    // 还原
    await krRepo.updateFields(krId, { title: 'T8 KR-更新进度' }, USER_ID)
  })

  // ─── [022.01] Phase 3: updateProgress completedAt 自动管理 ───

  /**
   * 矩阵：
   *  - progressRate >= 1.0 + completedAt NULL → 设置 completedAt
   *  - progressRate >= 1.0 + completedAt 存在 → 保持不变
   *  - progressRate < 1.0  + completedAt 存在 → 清空 completedAt
   *  - progressRate < 1.0  + completedAt NULL → 不变
   */
  describe('updateProgress completedAt auto-management', () => {
    /** 工具：直接更新 KR 行（绕过 updateProgress）以预设 completedAt 状态 */
    async function presetKR(opts: { target: number; current: number; completedAt: Date | null }) {
      await db.update(s.keyResults)
        .set({
          targetValue: String(opts.target),
          currentValue: String(opts.current),
          progressRate: '0',
          unit: '任务数',
          completedAt: opts.completedAt,
        })
        .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
      await cleanContributions(krId)
    }

    /** 工具：注册一个 0 贡献让 updateProgress 重算 progressRate = 0 */
    async function addContribution(id: string) {
      await contributionRepo.add(
        { keyResultId: krId, contributorType: 'task', contributorId: id },
        USER_ID,
      )
    }

    it('progressRate < 1.0 且 completedAt 为 NULL → 不变', async () => {
      // 初始 completedAt NULL
      await presetKR({ target: 10, current: 0, completedAt: null })

      const updated = await krRepo.updateProgress(krId, 0, USER_ID)

      expect(Number(updated.progressRate)).toBe(0)
      expect(updated.completedAt).toBeNull()
    })

    it('progressRate >= 1.0 且 completedAt 已存在 → 保持不变（不重置）', async () => {
      // 预设 completedAt = 一个已知的过去时间戳
      const pastDate = new Date('2025-06-01T00:00:00.000Z')
      // 重置为 currentValue=10 >= target=5 → progressRate >= 1.0（手动 UPDATE 字段绕过 updateProgress）
      await db.update(s.keyResults)
        .set({
          targetValue: '5',
          currentValue: '10',
          progressRate: '0',
          unit: '任务数',
          completedAt: pastDate,
        })
        .where(and(eq(s.keyResults.id, krId), eq(s.keyResults.userId, USER_ID)))
      await cleanContributions(krId)

      const updated = await krRepo.updateProgress(krId, 0, USER_ID)

      // completedAt 应保持原值（不被覆盖为 now）
      expect(updated.completedAt).toEqual(pastDate)
    })

    it('progressRate < 1.0 且 completedAt 已存在 → 清空 completedAt', async () => {
      // 预设 completedAt 存在，但当前 progressRate 会被重算为 0
      const pastDate = new Date('2025-06-01T00:00:00.000Z')
      await presetKR({ target: 10, current: 0, completedAt: pastDate })

      const updated = await krRepo.updateProgress(krId, 0, USER_ID)

      expect(Number(updated.progressRate)).toBe(0)
      expect(updated.completedAt).toBeNull()
    })
  })
})