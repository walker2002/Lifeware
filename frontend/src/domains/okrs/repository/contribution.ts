/**
 * @file contribution
 * @brief Contribution 仓储实现（OKR 域私有 junction）
 *
 * [022] Phase 2：CRUD + 按 KR/来源查询 + recomputeProgress 读时重算。
 * 映射函数统一在 lib/db/repositories/mappers.ts 中维护。
 */

import { eq, and, between } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IContributionRepository, CreateContributionInput } from '../../../usom/interfaces/irepository'
import type { Contribution } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { contributionRowToUSOM } from '../../../lib/db/repositories/mappers'
import { resolveContext } from '../../../nexus/context-engine/registry'

export class ContributionRepository implements IContributionRepository {
  async findByKeyResult(keyResultId: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<Contribution[]> {
    const rows = await tx.select().from(s.contributions)
      .where(and(
        eq(s.contributions.keyResultId, keyResultId),
        eq(s.contributions.userId, userId),
      ))
    return rows.map(r => contributionRowToUSOM(r as any))
  }

  async findByContributor(
    contributorType: string,
    contributorId: USOM_ID,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Contribution[]> {
    const rows = await tx.select().from(s.contributions)
      .where(and(
        eq(s.contributions.contributorType, contributorType as any),
        eq(s.contributions.contributorId, contributorId),
        eq(s.contributions.userId, userId),
      ))
    return rows.map(r => contributionRowToUSOM(r as any))
  }

  async add(input: CreateContributionInput, userId: USOM_ID, tx: DbClient = db): Promise<Contribution> {
    const now = new Date()
    const id = crypto.randomUUID() as USOM_ID
    await tx.insert(s.contributions).values({
      id,
      userId,
      keyResultId: input.keyResultId,
      contributorType: input.contributorType,
      contributorId: input.contributorId,
      delta: input.delta?.toString(),
      weight: input.weight?.toString() ?? '1.0',
      createdAt: now,
      updatedAt: now,
    } as any)
    return {
      id,
      keyResultId: input.keyResultId,
      contributorType: input.contributorType,
      contributorId: input.contributorId,
      delta: input.delta,
      weight: input.weight ?? 1.0,
      createdAt: now.toISOString() as Timestamp,
      updatedAt: now.toISOString() as Timestamp,
    }
  }

  async remove(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    await tx.delete(s.contributions)
      .where(and(eq(s.contributions.id, id), eq(s.contributions.userId, userId)))
  }

  async removeByContributor(
    contributorType: string,
    contributorId: USOM_ID,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<void> {
    await tx.delete(s.contributions)
      .where(and(
        eq(s.contributions.contributorType, contributorType as any),
        eq(s.contributions.contributorId, contributorId),
        eq(s.contributions.userId, userId),
      ))
  }

  async recomputeProgress(
    keyResultId: USOM_ID,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<{ currentValue: number; progressRate: number }> {
    // 1. 获取 KR 信息 + 周期区间（KR → objective → cycle）
    const krRows = await tx.select({
      unit: s.keyResults.unit,
      targetValue: s.keyResults.targetValue,
      periodStart: s.cycles.periodStart,
      periodEnd: s.cycles.periodEnd,
    })
      .from(s.keyResults)
      .innerJoin(s.objectives, eq(s.keyResults.objectiveId, s.objectives.id))
      .innerJoin(s.cycles, eq(s.objectives.cycleId, s.cycles.id))
      .where(and(eq(s.keyResults.id, keyResultId), eq(s.keyResults.userId, userId)))

    if (!krRows[0]) throw new Error(`KeyResult ${keyResultId} not found`)
    const kr = krRows[0]
    const targetValue = Number(kr.targetValue)
    const periodStart = kr.periodStart as string
    const periodEnd = kr.periodEnd as string
    const isCountUnit = kr.unit === '任务数'

    // 2. 读取所有贡献记录
    const contributions = await this.findByKeyResult(keyResultId, userId, tx)
    const totalCount = contributions.length

    if (totalCount === 0) {
      return { currentValue: 0, progressRate: 0 }
    }

    // 3. 按 contributorType 分组查询来源完成状态
    let computedValue = 0

    // 3a. Task 来源：经 ContextProvider 获取已完成 task ID 集合，按周期过滤 completedAt
    const taskContribs = contributions.filter(c => c.contributorType === 'task')
    if (taskContribs.length > 0) {
      const completedTasks = await resolveContext('completedTasks', 'completed_ids', { userId }) as Array<{ id: string; completedAt?: string }>
      // 过滤：仅统计周期内完成的任务（completedAt 在 [periodStart, periodEnd] 区间内）
      const completedInPeriod = completedTasks.filter(t => {
        if (!t.completedAt) return false
        const completedDate = t.completedAt.slice(0, 10) // ISO timestamp → 'YYYY-MM-DD'
        return completedDate >= periodStart && completedDate <= periodEnd
      })
      const completedIds = new Set(completedInPeriod.map(t => t.id))
      for (const c of taskContribs) {
        if (completedIds.has(c.contributorId)) {
          computedValue += isCountUnit ? 1 : (c.delta ?? targetValue / totalCount)
        }
      }
    }

    // 3b. Habit 来源：直接查 habit_logs，按 per-completion 计数 + 周期过滤
    const habitContribs = contributions.filter(c => c.contributorType === 'habit')
    if (habitContribs.length > 0) {
      const habitIds = [...new Set(habitContribs.map(c => c.contributorId))]
      // 统计周期内每条 completed habit_log（per-completion 计数）
      const completedLogs = await tx.select({
        habitId: s.habitLogs.habitId,
      })
        .from(s.habitLogs)
        .where(and(
          eq(s.habitLogs.userId, userId),
          eq(s.habitLogs.completionStatus, 'completed'),
          between(s.habitLogs.date, periodStart, periodEnd),
        ))
      // 累计每个 habit 的完成次数
      const habitCompletionCount = new Map<string, number>()
      for (const log of completedLogs) {
        habitCompletionCount.set(log.habitId, (habitCompletionCount.get(log.habitId) ?? 0) + 1)
      }
      for (const c of habitContribs) {
        const count = habitCompletionCount.get(c.contributorId) ?? 0
        computedValue += isCountUnit ? count : count * (c.delta ?? targetValue / totalCount)
      }
    }

    // 3c. Manual 来源：每条贡献直接视为已完成
    const manualContribs = contributions.filter(c => c.contributorType === 'manual')
    for (const c of manualContribs) {
      computedValue += isCountUnit ? 1 : (c.delta ?? targetValue / totalCount)
    }

    // 4. 双向钳制 + 计算进度率
    const currentValue = Math.max(0, Math.min(computedValue, targetValue))
    const progressRate = targetValue > 0 ? Number((currentValue / targetValue).toFixed(4)) : 0

    return { currentValue, progressRate }
  }
}
