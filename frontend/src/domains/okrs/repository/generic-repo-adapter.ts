/**
 * @file generic-repo-adapter
 * @brief OKRs 域 GenericRepo 适配器
 *
 * 将 IObjectiveRepository / IKeyResultRepository 适配为通用 GenericRepo 接口，
 * 使 OKRs 域可使用通用状态机（GenericStateMachine）处理所有 CRUD 和状态转换。
 * KeyResult adapter 额外支持 findByParent（cascade）和 deleteDraft。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * OKRs 域的 GenericRepo 适配器工厂参数
 * @property objectiveRepo - 目标仓储实例
 * @property keyResultRepo - 关键结果仓储实例
 */
interface OkrsRepoPair {
  objectiveRepo: {
    findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
  }
  keyResultRepo: {
    findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
    findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown>[]>
    deleteDraft(id: USOM_ID, userId: USOM_ID): Promise<void>
    updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID): Promise<Record<string, unknown>>
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
      async findById(id, userId) {
        return repos.objectiveRepo.findById(id, userId)
      },
      async save(obj, userId) {
        await repos.objectiveRepo.save(obj, userId)
      },
      async create(fields, _userId) {
        // Objective 创建由 ObjectiveRepository.save 处理 ID 生成
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const objective = {
          id,
          status: 'draft',
          title: fields.title ?? '',
          description: fields.description,
          okrType: fields.okrType ?? 'committed',
          priority: fields.priority ?? 'P1',
          tags: fields.tags ?? [],
          period: {
            type: fields.periodType ?? 'quarterly',
            start: fields.periodStart ?? '',
            end: fields.periodEnd ?? '',
          },
          keyResultIds: [] as string[],
          objectiveNumber: '',
          createdAt: now,
          updatedAt: now,
        }
        return objective
      },
      async updateStatus(id, toStatus, userId) {
        const existing = await repos.objectiveRepo.findById(id, userId)
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
        await repos.objectiveRepo.save(updated, userId)
        return updated
      },
    },
    key_result: {
      async findById(id, userId) {
        return repos.keyResultRepo.findById(id, userId)
      },
      async save(obj, userId) {
        await repos.keyResultRepo.save(obj, userId)
      },
      async create(fields, _userId) {
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
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        }
        return kr
      },
      async updateStatus(id, toStatus, userId) {
        const existing = await repos.keyResultRepo.findById(id, userId)
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
        await repos.keyResultRepo.save(updated, userId)
        return updated
      },
      async findByParent(parentId, userId) {
        return repos.keyResultRepo.findByObjective(parentId, userId)
      },
      async deleteDraft(id, userId) {
        await repos.keyResultRepo.deleteDraft(id, userId)
      },
    },
  }
}
