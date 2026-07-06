/**
 * @file transitions
 * @brief Timebox 状态转换表
 *
 * 状态流转（[023.12] T4 3 态收敛）：
 *   (none) → planned → logged
 *          → cancelled
 *   logged → planned（revert，[AM7] 前置守卫：executionRecord != null 时拒绝）
 *   cancelled → planned（revert）
 *
 * 注：start / end / overtime 已退役。running / overtime / ended 由
 * status/derive-display-status.ts 读时派生（[023.12] T3）。
 */

import type { TimeboxStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

/**
 * 状态转换定义
 */
export interface Transition<T extends string = string> {
  /** 源状态（null 表示初始创建） */
  from: T | null
  /** 目标状态 */
  to: T
  /** 动作名称 */
  action: string
  /** 系统事件类型 */
  eventType: SystemEventType
}

export const timeboxTransitions: Transition<TimeboxStatus>[] = [
  { from: null,      to: 'planned',    action: 'create', eventType: 'TimeboxCreated' },
  { from: 'planned', to: 'logged',     action: 'log',    eventType: 'TimeboxLogged' },
  { from: 'planned', to: 'cancelled',  action: 'cancel', eventType: 'TimeboxCancelled' },
  { from: 'logged',    to: 'planned', action: 'revert', eventType: 'TimeboxReverted' },
  { from: 'cancelled', to: 'planned', action: 'revert', eventType: 'TimeboxReverted' },
]

/**
 * 查找状态转换
 *
 * @param transitions - 转换列表
 * @param from - 源状态
 * @param action - 动作名称
 * @returns 匹配的转换，未找到返回 null
 */
export function findTransition<T extends string>(
  transitions: Transition<T>[],
  from: T | null,
  action: string,
): Transition<T> | null {
  return transitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}