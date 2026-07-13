/**
 * @file generic-repo-adapter
 * @brief Habits 域 GenericRepo 适配器
 *
 * 将 IHabitRepository / IHabitLogRepository 适配为通用 GenericRepo 接口，
 * 使 Habits 域可使用通用状态机（GenericStateMachine）处理 CRUD 和状态转换。
 * HabitLog 为不可变事实记录，不支持 updateStatus。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'
import type { DbClient } from '@/lib/db'

/**
 * Habits 域的 GenericRepo 适配器工厂参数
 * @property habitRepo - 习惯仓储实例
 * @property habitLogRepo - 习惯日志仓储实例
 */
interface HabitsRepoPair {
  habitRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    create(fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  habitLogRepo: {
    save(log: Record<string, unknown>, userId: USOM_ID): Promise<void>
  }
}

/**
 * 创建 Habits 域的 GenericRepo 映射
 * @param repos - 包含 habitRepo 和 habitLogRepo 的对象
 * @returns 以对象类型为键的 GenericRepo 映射表
 */
export function createHabitsGenericRepo(repos: HabitsRepoPair): Record<string, GenericRepo> {
  return {
    habit: {
      async findById(id, userId, tx) {
        return repos.habitRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.habitRepo.save(obj, userId, tx)
        return obj
      },
      async create(fields, userId, tx) {
        return repos.habitRepo.create(fields, userId, tx)
      },
      async updateStatus(id, toStatus, userId, tx) {
        return repos.habitRepo.updateStatus(id, toStatus, userId, tx)
      },
      async updateFields(id, fields, userId, _expectedOccVersion, tx) {
        // [TD-003] T2: habits 域暂未实施 OCC，_expectedOccVersion 忽略（TD-037 P6 deferred）
        return repos.habitRepo.updateFields(id, fields, userId, tx)
      },
    },
    habit_log: {
      async findById() {
        // HabitLog 无独立 findById，返回 null（通用 SM 不会在 cascade 中查询子日志）
        return null
      },
      async save(obj, userId) {
        await repos.habitLogRepo.save(obj, userId)
        return obj
      },
      async create(fields, userId) {
        // HabitLog 使用 save 创建（日志是不可变事实，无独立 create 方法）
        const id = crypto.randomUUID() as USOM_ID
        const log = { id, ...fields }
        await repos.habitLogRepo.save(log, userId)
        return log as Record<string, unknown>
      },
      async updateStatus() {
        throw new Error('HabitLog 不支持状态转换')
      },
      async updateFields() {
        // HabitLog 为不可变事实记录，不支持局部字段更新
        throw new Error('HabitLog 不支持字段更新')
      },
    },
  }
}
