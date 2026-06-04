/**
 * @file generic-repo-adapter
 * @brief Timebox 域 GenericRepo 适配器
 *
 * 将 ITimeboxRepository 适配为通用 GenericRepo 接口，
 * 使 Timebox 域可使用通用状态机（GenericStateMachine）处理所有状态转换。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * Timebox 域的 GenericRepo 适配器工厂参数
 * @property timeboxRepo - 时间盒仓储实例
 */
interface TimeboxRepoPair {
  timeboxRepo: {
    findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
    updateStatus?(id: USOM_ID, toStatus: string, userId: USOM_ID): Promise<Record<string, unknown>>
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
      async findById(id, userId) {
        return repos.timeboxRepo.findById(id, userId)
      },
      async save(obj, userId) {
        await repos.timeboxRepo.save(obj, userId)
      },
      async create(fields, userId) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const obj = { id, ...fields, createdAt: now, updatedAt: now }
        await repos.timeboxRepo.save(obj, userId)
        return obj
      },
      async updateStatus(id, toStatus, userId) {
        const existing = await repos.timeboxRepo.findById(id, userId)
        if (!existing) throw new Error('时间盒不存在')
        const now = new Date().toISOString()
        const updated = { ...existing, status: toStatus, updatedAt: now }
        await repos.timeboxRepo.save(updated, userId)
        return updated
      },
    },
  }
}
