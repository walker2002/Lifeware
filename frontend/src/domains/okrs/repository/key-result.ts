/**
 * @file key-result
 * @brief KeyResult 仓储实现
 *
 * 实现 IKeyResultRepository 接口，提供 KeyResult 数据的数据库操作。
 * [022] Phase 2：updateProgress 经 ContributionRepository.recomputeProgress 重算，
 * 含孤儿贡献清理（源已删除的 task/habit 引用）。
 */

import { eq, and, inArray } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IKeyResultRepository } from '../../../usom/interfaces/irepository'
import type { KeyResult } from '../../../usom/types/objects'
import type { USOM_ID, KeyResultStatus } from '../../../usom/types/primitives'
import { keyResultRowToUSOM, keyResultUSOMToRow } from '../../../lib/db/repositories/mappers'
import { ContributionRepository } from './contribution'

/**
 * KeyResult 仓储
 */
export class KeyResultRepository implements IKeyResultRepository {
  async findById(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<KeyResult | null> {
    const rows = await tx.select().from(s.keyResults)
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
    return rows[0] ? keyResultRowToUSOM(rows[0] as any) : null
  }

  async findByObjective(objectiveId: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<KeyResult[]> {
    const rows = await tx.select().from(s.keyResults)
      .where(and(eq(s.keyResults.objectiveId, objectiveId), eq(s.keyResults.userId, userId)))
    return rows.map(r => keyResultRowToUSOM(r as any))
  }

  /**
   * 更新 KeyResult 进度（经 ContributionRepository.recomputeProgress 重算）。
   *
   * [022] 2B-T8：不再信任传入的 _currentValue，改为从 junction 表重算。
   * 重算前会清理孤儿贡献（源 task/habit 已删除的引用）。
   * 保留 status 派生（currentValue >= targetValue → completed）和下钳（Math.max(0, …)）。
   */
  async updateProgress(id: USOM_ID, _currentValue: number, userId: USOM_ID): Promise<KeyResult> {
    const contributionRepo = new ContributionRepository()

    // ── 0. 孤儿清理：移除源已不存在的贡献记录 ──
    const contributions = await contributionRepo.findByKeyResult(id, userId)

    // 0a. Task 孤儿：查询 tasks 表确认每个 contributorId 仍存在
    const taskContribs = contributions.filter(c => c.contributorType === 'task')
    if (taskContribs.length > 0) {
      const taskIds = [...new Set(taskContribs.map(c => c.contributorId))]
      const existingTasks = await db.select({ id: s.tasks.id })
        .from(s.tasks)
        .where(and(
          eq(s.tasks.userId, userId),
          inArray(s.tasks.id, taskIds),
        ))
      const existingTaskIds = new Set(existingTasks.map(t => t.id))
      for (const c of taskContribs) {
        if (!existingTaskIds.has(c.contributorId)) {
          await contributionRepo.removeByContributor('task', c.contributorId, userId)
        }
      }
    }

    // 0b. Habit 孤儿：查询 habits 表确认每个 contributorId 仍存在
    const habitContribs = contributions.filter(c => c.contributorType === 'habit')
    if (habitContribs.length > 0) {
      const habitIds = [...new Set(habitContribs.map(c => c.contributorId))]
      const existingHabits = await db.select({ id: s.habits.id })
        .from(s.habits)
        .where(and(
          eq(s.habits.userId, userId),
          inArray(s.habits.id, habitIds),
        ))
      const existingHabitIds = new Set(existingHabits.map(h => h.id))
      for (const c of habitContribs) {
        if (!existingHabitIds.has(c.contributorId)) {
          await contributionRepo.removeByContributor('habit', c.contributorId, userId)
        }
      }
    }

    // ── 1. 经 junction 表重算进度 ──
    const { currentValue, progressRate } = await contributionRepo.recomputeProgress(id, userId)

    // ── 2. 获取 KR 元数据用于 status 派生 ──
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`KeyResult ${id} not found`)

    // ── 3. 下钳保底（recomputeProgress 已内部钳制，此处再保底一次）──
    const clampedValue = Math.max(0, currentValue)

    // ── 4. Status 派生：currentValue >= targetValue → completed ──
    const newStatus: KeyResultStatus = clampedValue >= existing.targetValue ? 'completed' : existing.status

    // ── 5. 持久化 ──
    await db.update(s.keyResults)
      .set({
        currentValue: String(clampedValue),
        progressRate: String(progressRate),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))

    const updated = await this.findById(id, userId)
    if (!updated) throw new Error(`KeyResult ${id} not found after updateProgress`)
    return updated
  }

  async batchUpdateStatus(objectiveId: USOM_ID, fromStatus: KeyResultStatus, toStatus: KeyResultStatus, userId: USOM_ID): Promise<void> {
    await db.update(s.keyResults)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(
        eq(s.keyResults.objectiveId, objectiveId),
        eq(s.keyResults.userId, userId),
        eq(s.keyResults.status, fromStatus),
      ))
  }

  async deleteDraft(id: USOM_ID, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    await tx.delete(s.keyResults)
      .where(and(
        eq(s.keyResults.id, id),
        eq(s.keyResults.userId, userId),
        eq(s.keyResults.status, 'draft'),
      ))
  }

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，禁止读后写：直接 update().set(fields).where(id 且 userId) 一次完成。
   * fields 的键为 schema 列属性名（驼峰）。多租户 T-02：where 必含 userId 过滤。
   */
  async updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<KeyResult> {
    const setPayload: Record<string, unknown> = { ...fields, updatedAt: new Date() }
    await tx.update(s.keyResults)
      .set(setPayload)
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
    const updated = await this.findById(id, userId, tx)
    if (!updated) throw new Error(`KeyResult ${id} not found after updateFields`)
    return updated
  }

  async save(keyResult: KeyResult, userId: USOM_ID, tx: DbClient = db): Promise<void> {
    const row = keyResultUSOMToRow(keyResult, userId)
    await tx.insert(s.keyResults).values(row).onConflictDoUpdate({
      target: s.keyResults.id,
      set: row,
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.keyResults)
      .set({ status: 'archived', archivedAt: new Date() })
      .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
  }
}
