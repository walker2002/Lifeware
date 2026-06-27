/**
 * @file generic-repo-adapter
 * @brief Timebox 域 GenericRepo 适配器
 *
 * 将 ITimeboxRepository 适配为通用 GenericRepo 接口，
 * 使 Timebox 域可使用通用状态机（GenericStateMachine）处理所有状态转换。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'
import type { DbClient } from '@/lib/db'

/**
 * Timebox 域的 GenericRepo 适配器工厂参数
 * @property timeboxRepo - 时间盒仓储实例
 */
interface TimeboxRepoPair {
  timeboxRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
}

/**
 * 创建 Timebox 域的 GenericRepo 映射
 * @param repos - 包含 timeboxRepo 的对象
 * @returns 以对象类型为键的 GenericRepo 映射表
 */
export function createTimeboxGenericRepo(repos: TimeboxRepoPair): Record<string, GenericRepo> {
  return {
    timebox: {
      async findById(id, userId, tx) {
        return repos.timeboxRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.timeboxRepo.save(obj, userId, tx)
        return obj
      },
      async create(fields, userId, tx) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const obj = { id, ...fields, createdAt: now, updatedAt: now }
        await repos.timeboxRepo.save(obj, userId, tx)
        return obj
        return obj
      },
      async updateStatus(id, toStatus, userId, tx) {
        const existing = await repos.timeboxRepo.findById(id, userId, tx)
        if (!existing) throw new Error('时间盒不存在')
        const now = new Date().toISOString()
        const updated = { ...existing, status: toStatus, updatedAt: now }
        await repos.timeboxRepo.save(updated, userId, tx)
        return updated
      },
      async updateFields(id, fields, userId, tx) {
        return repos.timeboxRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
