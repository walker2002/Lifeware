/**
 * @file contribution
 * @brief Contribution 仓储实现（OKR 域私有 junction）
 *
 * [022] Phase 2：CRUD + 按 KR/来源查询 + recomputeProgress 读时重算。
 * 映射函数统一在 lib/db/repositories/mappers.ts 中维护。
 */

import { eq, and } from 'drizzle-orm'
import { db, type DbClient } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { IContributionRepository, CreateContributionInput } from '../../../usom/interfaces/irepository'
import type { Contribution } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import { contributionRowToUSOM } from '../../../lib/db/repositories/mappers'

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
  ): Promise<{ currentValue: number; progressRate: number; completedCount: number; totalCount: number }> {
    const contributions = await this.findByKeyResult(keyResultId, userId, tx)
    // [022] 2A-T4 骨架占位：Task 6 补全实际读时重算逻辑
    return { currentValue: 0, progressRate: 0, completedCount: 0, totalCount: contributions.length }
  }
}
