/**
 * @file generic-repo-adapter
 * @brief Tasks 域 GenericRepo 适配器
 *
 * 将 ITaskRepository / IThreadRepository 适配为通用 GenericRepo 接口，
 * 使 Tasks 域可使用通用状态机（GenericStateMachine）处理所有 CRUD 和状态转换。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'
import type { DbClient } from '@/lib/db'

/**
 * Tasks 域的 GenericRepo 适配器工厂参数
 * @property taskRepo - 任务仓储实例
 * @property threadRepo - 主线仓储实例
 */
interface TasksRepoPair {
  taskRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    create(fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  threadRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    create(fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
}

/**
 * 创建 Tasks 域的 GenericRepo 映射
 * @param repos - 包含 taskRepo 和 threadRepo 的对象
 * @returns 以对象类型为键的 GenericRepo 映射表
 */
export function createTasksGenericRepo(repos: TasksRepoPair): Record<string, GenericRepo> {
  return {
    task: {
      async findById(id, userId, tx) {
        return repos.taskRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.taskRepo.save(obj, userId, tx)
      },
      async create(fields, userId, tx) {
        return repos.taskRepo.create(fields, userId, tx)
      },
      async updateStatus(id, toStatus, userId, tx) {
        return repos.taskRepo.updateStatus(id, toStatus, userId, tx)
      },
      async updateFields(id, fields, userId, tx) {
        return repos.taskRepo.updateFields(id, fields, userId, tx)
      },
    },
    thread: {
      async findById(id, userId, tx) {
        return repos.threadRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.threadRepo.save(obj, userId, tx)
      },
      async create(fields, userId, tx) {
        return repos.threadRepo.create(fields, userId, tx)
      },
      async updateStatus(id, toStatus, userId, tx) {
        return repos.threadRepo.updateStatus(id, toStatus, userId, tx)
      },
      async updateFields(id, fields, userId, tx) {
        return repos.threadRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
