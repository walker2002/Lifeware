/**
 * @file guard
 * @brief [022.01] Phase 3: OKR 域全面权限守卫
 *
 * 统一 Cycle/Obj/KR 的编辑与删除权限检查，以 Cycle.status 为唯一权威源。
 * 权限矩阵见设计 spec §C。
 *
 * Phase 3 全面守卫：所有 Cycle/Obj/KR 写路径均经 assertEditable 检查。
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

/**
 * 检查给定 Cycle 是否可执行指定操作（[022.01] Phase 3）。
 *
 * 与 assertEditable 的区别：checkCycleEditable 不抛错，返回 boolean；
 * 用于前置 guard 路径的「乐观检查」场景（如 server action 前置 read）。
 *
 * @param cycle - 周期对象（可为 null — 表示「周期不存在」）
 * @param operation - 待执行的操作类型
 * @returns 是否可执行；null cycle 一律返回 false
 */
export function checkCycleEditable(
  cycle: { status: Cycle['status'] } | null | undefined,
  operation: EditableOperation,
): boolean {
  if (!cycle) return false
  const allowed = ALLOWED[cycle.status]
  return allowed.has(operation)
}
