/**
 * @file guard
 * @brief [022.01] Phase 2: Cycle 状态权限守卫
 *
 * 统一 Cycle/Obj/KR 的编辑与删除权限检查，以 Cycle.status 为唯一权威源。
 * 权限矩阵见设计 spec §C。
 *
 * Phase 2 集成范围：deleteCycle + reviewCycle（cycle 级操作）。
 * Obj/KR 写路径接入 defer 到 Phase 3（届时 Obj/KR 自身 status 被移除）。
 */

import type { Cycle } from '@/usom/types/objects'

/** 操作类型 */
export type EditableOperation =
  | 'edit_cycle'
  | 'delete_cycle'
  | 'edit_objective'
  | 'delete_objective'
  | 'edit_kr'
  | 'delete_kr'

/** 各状态下允许的操作集合 */
const ALLOWED: Record<Cycle['status'], ReadonlySet<EditableOperation>> = {
  draft: new Set([
    'edit_cycle', 'delete_cycle',
    'edit_objective', 'delete_objective',
    'edit_kr', 'delete_kr',
  ]),
  not_started: new Set(['edit_objective', 'edit_kr']),
  in_progress: new Set(['edit_objective', 'edit_kr']),
  ended: new Set(['edit_objective', 'edit_kr']),
  reviewed: new Set(),
}

/**
 * 断言当前 Cycle 状态允许执行指定操作，否则抛错。
 *
 * @param cycle - 周期对象（至少含 status 字段）
 * @param operation - 待执行的操作类型
 * @throws Error 若 cycle 状态不允许该操作
 */
export function assertEditable(
  cycle: { status: Cycle['status'] },
  operation: EditableOperation,
): void {
  const allowed = ALLOWED[cycle.status]
  if (!allowed.has(operation)) {
    throw new Error(
      `当前周期状态为「${cycle.status}」，不允许执行「${operation}」操作`,
    )
  }
}
