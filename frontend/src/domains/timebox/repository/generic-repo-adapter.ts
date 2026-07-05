/**
 * @file generic-repo-adapter
 * @brief Timebox 域 GenericRepo 适配器
 *
 * 将 ITimeboxRepository / IAppointmentRepository 适配为通用 GenericRepo 接口，
 * 使 Timebox 域（含 [026] 约定）可使用通用状态机（GenericStateMachine）处理所有状态转换。
 *
 * [026] 决议 A：adapter 接受 timeboxRepo + appointmentRepo，map 加 appointment 键。
 * updateStatus 按 status 分派到 cancel / markInProgress / markExpired。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'
import type { DbClient } from '@/lib/db'

/**
 * Timebox 域 GenericRepo 适配器工厂参数。
 * @property timeboxRepo - 时间盒仓储实例
 * @property appointmentRepo - 约定仓储实例（[026] D2 reversal）
 */
interface TimeboxRepoPair {
  timeboxRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  appointmentRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    cancel(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>
    markInProgress(id: USOM_ID, userId: USOM_ID, at: Date, tx?: DbClient): Promise<void>
    markExpired(id: USOM_ID, userId: USOM_ID, at: Date, tx?: DbClient): Promise<void>
  }
}

/**
 * 创建 Timebox 域的 GenericRepo 映射
 * @param repos - 包含 timeboxRepo 与 appointmentRepo 的对象
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
    // [026] D2 reversal: 约定独立 GenericRepo 键，updateStatus 完整支持 5 态（4 active + completed 占位）
    appointment: {
      async findById(id, userId, tx) {
        return repos.appointmentRepo.findById(id, userId, tx)
      },
      async save(obj, userId, tx) {
        await repos.appointmentRepo.save(obj, userId, tx)
        return obj
      },
      async create(fields, userId, tx) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        // [026] D2 reversal: 5 态存储，create 时 status=scheduled（DB default），时间戳全 null
        const obj = {
          id, ...fields, status: 'scheduled',
          inProgressAt: null, expiredAt: null, completedAt: null, cancelledAt: null,
          createdAt: now, updatedAt: now,
        }
        await repos.appointmentRepo.save(obj, userId, tx)
        return obj
      },
      async updateStatus(id, toStatus, userId, tx) {
        const existing = await repos.appointmentRepo.findById(id, userId, tx)
        if (!existing) throw new Error('约定不存在')
        const now = new Date()
        // [026] D2 reversal: status transition + 对应时间戳同时盖
        if (toStatus === 'cancelled') {
          await repos.appointmentRepo.cancel(id, userId, tx)
        } else if (toStatus === 'in_progress') {
          await repos.appointmentRepo.markInProgress(id, userId, now, tx)
        } else if (toStatus === 'expired') {
          await repos.appointmentRepo.markExpired(id, userId, now, tx)
        } else if (toStatus === 'scheduled' || toStatus === 'completed') {
          // scheduled：理论上不可回到 scheduled（终态不可逆），但 SM 守卫应在此之前拒绝
          // completed：[027] 实现；这里仅占位
          throw new Error(`appointment updateStatus 暂不支持 → ${toStatus}（[027] 加 completed 路径）`)
        } else {
          throw new Error(`未知的 appointment 状态: ${toStatus}`)
        }
        return await repos.appointmentRepo.findById(id, userId, tx) ?? existing
      },
      async updateFields(id, fields, userId, tx) {
        return repos.appointmentRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
