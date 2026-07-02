/**
 * @file generic-repo-adapter
 * @brief OKRs 域 GenericRepo 适配器
 *
 * 将 IObjectiveRepository / IKeyResultRepository 适配为通用 GenericRepo 接口，
 * 使 OKRs 域可使用通用状态机（GenericStateMachine）处理所有 CRUD 和状态转换。
 * KeyResult adapter 额外支持 findByParent（cascade）和 deleteDraft。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID, Timestamp, DateOnly } from '@/usom/types/primitives'
import type { Cycle } from '@/usom/types/objects'
import type { DbClient } from '@/lib/db'

/**
 * OKRs 域的 GenericRepo 适配器工厂参数
 * @property objectiveRepo - 目标仓储实例
 * @property keyResultRepo - 关键结果仓储实例
 */
interface OkrsRepoPair {
  objectiveRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  keyResultRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    findByObjective(objectiveId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>[]>
    deleteDraft(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  cycleRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, status: Cycle['status'], userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    findByPeriod(userId: USOM_ID, periodStart: string, periodEnd: string, tx?: DbClient): Promise<Record<string, unknown> | null>
  }
}

/**
 * 创建 OKRs 域的 GenericRepo 映射
 * @param repos - 包含 objectiveRepo 和 keyResultRepo 的对象
 * @returns 以对象类型为键的 GenericRepo 映射表
 */
export function createOkrsGenericRepo(repos: OkrsRepoPair): Record<string, GenericRepo> {
  return {
    objective: {
      async findById(id, userId, tx) {
        return repos.objectiveRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.objectiveRepo.save(obj, userId, tx)
        return obj
      },
      async create(fields, userId, tx) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const objective = {
          id,
          status: fields.status ?? 'draft',
          title: fields.title ?? '',
          description: fields.description,
          okrType: fields.okrType ?? 'committed',
          priority: fields.priority ?? 'P1',
          tags: fields.tags ?? [],
          cycleId: fields.cycleId,
          keyResultIds: [] as string[],
          objectiveNumber: '',
          createdAt: now,
          updatedAt: now,
        }
        await repos.objectiveRepo.save(objective, userId, tx)
        return objective
      },
      async updateStatus(id, toStatus, userId, tx) {
        const existing = await repos.objectiveRepo.findById(id, userId, tx)
        if (!existing) throw new Error(`Objective ${id} not found`)
        const now = new Date().toISOString()
        const updated = {
          ...existing,
          status: toStatus,
          updatedAt: now,
          ...(toStatus === 'discarded' ? { discardedAt: now } : {}),
          ...(toStatus === 'completed' ? { completedAt: now } : {}),
          ...(toStatus === 'archived' ? { archivedAt: now } : {}),
        }
        await repos.objectiveRepo.save(updated, userId, tx)
        return updated
      },
      async updateFields(id, fields, userId, tx) {
        return repos.objectiveRepo.updateFields(id, fields, userId, tx)
      },
    },
    key_result: {
      async findById(id, userId, tx) {
        return repos.keyResultRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.keyResultRepo.save(obj, userId, tx)
        return obj
      },
      async create(fields, userId, tx) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const kr = {
          id,
          objectiveId: fields.objectiveId,
          title: fields.title ?? '',
          description: fields.description,
          targetValue: fields.targetValue ?? 0,
          currentValue: 0,
          unit: fields.unit ?? '',
          progressRate: 0,
          status: fields.status ?? 'draft',
          createdAt: now,
          updatedAt: now,
        }
        await repos.keyResultRepo.save(kr, userId, tx)
        return kr
      },
      async updateStatus(id, toStatus, userId, tx) {
        const existing = await repos.keyResultRepo.findById(id, userId, tx)
        if (!existing) throw new Error(`KeyResult ${id} not found`)
        const now = new Date().toISOString()
        const updated = {
          ...existing,
          status: toStatus,
          updatedAt: now,
          ...(toStatus === 'discarded' ? { discardedAt: now } : {}),
          ...(toStatus === 'completed' ? { completedAt: now } : {}),
          ...(toStatus === 'archived' ? { archivedAt: now } : {}),
        }
        await repos.keyResultRepo.save(updated, userId, tx)
        return updated
      },
      async updateFields(id, fields, userId, tx) {
        return repos.keyResultRepo.updateFields(id, fields, userId, tx)
      },
      async findByParent(parentId, userId, tx) {
        return repos.keyResultRepo.findByObjective(parentId, userId, tx)
      },
      async deleteDraft(id, userId, tx) {
        await repos.keyResultRepo.deleteDraft(id, userId, tx)
      },
    },
    cycle: {
      async findById(id, userId, tx) {
        return repos.cycleRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        return repos.cycleRepo.save(obj, userId, tx)
      },
      async create(fields, userId, tx) {
        const now = new Date().toISOString() as Timestamp
        const periodStart = fields.periodStart as string
        const periodEnd = fields.periodEnd as string

        // ⚠️ iter 3: 前置 SELECT 查重 —— 防止 onConflictDoUpdate 覆写已有 cycle 的 status
        // 同自然键已存在 → 直接返回已有行（不写 DB），保护已有 cycle 不被降级为 draft
        const existing = await repos.cycleRepo.findByPeriod(
          userId, periodStart, periodEnd, tx,
        )
        if (existing) return existing

        const cycle: Cycle = {
          id: crypto.randomUUID() as USOM_ID,
          cycleType: (fields.cycleType as Cycle['cycleType']) ?? 'custom',
          name: (fields.name as string) ?? `${periodStart}~${periodEnd}`,
          period: { start: periodStart as DateOnly, end: periodEnd as DateOnly },
          status: 'draft', // manifest initial_state，强制 draft
          createdAt: now,
          updatedAt: now,
        }
        return repos.cycleRepo.save(cycle as unknown as Record<string, unknown>, userId, tx)
      },
      async updateStatus(id, toStatus, userId, tx) {
        return repos.cycleRepo.updateStatus(
          id as USOM_ID,
          toStatus as Cycle['status'],
          userId,
          tx,
        ) as Promise<Record<string, unknown>>
      },
      async updateFields(id, fields, userId, tx) {
        return repos.cycleRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
