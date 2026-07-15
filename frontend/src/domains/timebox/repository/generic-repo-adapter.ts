/**
 * @file generic-repo-adapter
 * @brief Timebox 域 GenericRepo 适配器
 *
 * 将 ITimeboxRepository / IAppointmentRepository 适配为通用 GenericRepo 接口，
 * 使 Timebox 域（含 [026] 约定）可使用通用状态机（GenericStateMachine）处理所有状态转换。
 *
 * [023.12] T5: appointment 收敛到 3 态（scheduled / cancelled / completed）。
 * in_progress / expired 不持久化——读时由 derive-display-status.ts 派生。
 * adapter updateStatus 派发到 cancel / complete / revert 三条路径。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'
import type { DbClient } from '@/lib/db'
import { resolveLogicalDayLabel } from '@/lib/logical-day/resolver'
import { LogicalDayRepository } from './logical-day'
import { getEffectiveTimezone } from '@/lib/timezone-config'

/**
 * [029] 解析 logical_day_id 归属（D2 瓶口注入点）。
 * 显式 fields.logicalDayLabel > fields.date；否则按 startTime(user_tz) 派生。
 * 显式在场时短路 tz DB 读。无 startTime 返回 null。
 */
export async function resolveLogicalDayIdForCreate(
  fields: Record<string, unknown>,
  userId: USOM_ID,
  startTime: string | undefined,
  tx: DbClient,
): Promise<USOM_ID | null> {
  if (!startTime) return null
  const explicit = (fields.logicalDayLabel as string | undefined) || (fields.date as string | undefined)
  let label: string
  if (explicit && explicit.length > 0) {
    label = explicit
  } else {
    const tz = await getEffectiveTimezone(userId)
    label = resolveLogicalDayLabel({ startTime: startTime as any, explicitLabel: null, tz })
  }
  const ld = await new LogicalDayRepository().findOrCreateByDate(label as any, userId, tx)
  return ld.id
}

/**
 * Timebox 域 GenericRepo 适配器工厂参数。
 * @property timeboxRepo - 时间盒仓储实例
 * @property appointmentRepo - 约定仓储实例（[023.12] T5 3 态收敛）
 *
 * [TD-003] T2: timeboxRepo.updateFields 多 `expectedOccVersion: number` 必填参数；
 * appointmentRepo.updateFields 保持 4 参（Appointment 暂未实施 OCC，TD-037 P6 deferred）。
 */
interface TimeboxRepoPair {
  timeboxRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, expectedOccVersion: number, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
  }
  appointmentRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    cancel(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>
    complete(id: USOM_ID, userId: USOM_ID, at: Date, tx?: DbClient): Promise<void>
    revert(id: USOM_ID, userId: USOM_ID, at: Date, tx?: DbClient): Promise<void>
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
        const logicalDayId = await resolveLogicalDayIdForCreate(fields, userId, fields.startTime as string, tx)
        // 剥离临时字段（logicalDayLabel 是注入用的，date 是 CNUI HH:MM→ISO 用的，都非 DB 列）
        const { logicalDayLabel: _lbl, date: _date, ...rest } = fields as any
        const obj = { id, ...rest, logicalDayId: logicalDayId ?? null, createdAt: now, updatedAt: now }
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
      async updateFields(id, fields, userId, expectedOccVersion, tx) {
        // [TD-003] T3：消除硬码 0 占位符。GenericRepo 接口把 expectedOccVersion
        // 标为可选（兼容 habits/tasks/okrs adapter），但 timebox 域 OCC 已实装——
        // undefined 时 **throw**（fail-fast），不再静默回退到 0。caller 必须
        // 主动透传：field-executor.executeBatch 会用 step.expectedOccVersion 或
        // repo.findById 读 current 兜底（详见 [TD-003] T3 executor 注释）。
        if (typeof expectedOccVersion !== 'number') {
          throw new Error(
            `timebox GenericRepo.updateFields 必须传 expectedOccVersion: number，`
            + `收到 ${typeof expectedOccVersion}。caller 路径走 field-executor.executeBatch 或显式传值`,
          )
        }
        return repos.timeboxRepo.updateFields(id, fields, userId, expectedOccVersion, tx)
      },
    },
    // [023.12] T5: 约定独立 GenericRepo 键，updateStatus 派发到 3 态路径
    // （cancel / complete / revert）。in_progress / expired 不再持久化——读时派生。
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
        const logicalDayId = await resolveLogicalDayIdForCreate(fields, userId, fields.startTime as string, tx)
        // 剥离临时字段
        const { logicalDayLabel: _lbl, date: _date, ...rest } = fields as any
        // [023.12] T5: create 时 status=scheduled（DB default），completedAt/cancelledAt 全 null
        // （inProgressAt/expiredAt 列 T1b drop；这里不引用）
        const obj = {
          id, ...rest, logicalDayId: logicalDayId ?? null,
          status: 'scheduled',
          completedAt: null, cancelledAt: null,
          createdAt: now, updatedAt: now,
        }
        await repos.appointmentRepo.save(obj, userId, tx)
        return obj
      },
      async updateStatus(id, toStatus, userId, tx) {
        const existing = await repos.appointmentRepo.findById(id, userId, tx)
        if (!existing) throw new Error('约定不存在')
        const now = new Date()
        // [023.12] T5: 3 态派发。SM 已在调用方做合法性校验（manifest lifecycle 锁死
        // 合法 from→to），此处仅负责「state step 写库」。
        if (toStatus === 'cancelled') {
          await repos.appointmentRepo.cancel(id, userId, tx)
        } else if (toStatus === 'completed') {
          await repos.appointmentRepo.complete(id, userId, now, tx)
        } else if (toStatus === 'scheduled') {
          // revert：{cancelled, completed} → scheduled
          await repos.appointmentRepo.revert(id, userId, now, tx)
        } else {
          throw new Error(`未知的 appointment 状态: ${toStatus}（[023.12] T5 收敛到 3 态）`)
        }
        return await repos.appointmentRepo.findById(id, userId, tx) ?? existing
      },
      async updateFields(id, fields, userId, _expectedOccVersion, tx) {
        // [TD-003] T2: appointment 域暂未实施 OCC，_expectedOccVersion 忽略（TD-037 P6 deferred）
        return repos.appointmentRepo.updateFields(id, fields, userId, tx)
      },
    },
  }
}
