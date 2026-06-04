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

/**
 * Habits 域的 GenericRepo 适配器工厂参数
 * @property habitRepo - 习惯仓储实例
 * @property habitLogRepo - 习惯日志仓储实例
 */
interface HabitsRepoPair {
  habitRepo: {
    findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
    create(fields: Record<string, unknown>, userId: USOM_ID): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID): Promise<Record<string, unknown>>
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
      async findById(id, userId) {
        return repos.habitRepo.findById(id, userId)
      },
      async save(obj, userId) {
        await repos.habitRepo.save(obj, userId)
      },
      async create(fields, userId) {
        return repos.habitRepo.create(fields, userId)
      },
      async updateStatus(id, toStatus, userId) {
        return repos.habitRepo.updateStatus(id, toStatus, userId)
      },
    },
    habit_log: {
      async findById() {
        // HabitLog 无独立 findById，返回 null（通用 SM 不会在 cascade 中查询子日志）
        return null
      },
      async save(obj, userId) {
        await repos.habitLogRepo.save(obj, userId)
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
    },
  }
}
