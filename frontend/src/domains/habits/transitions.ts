/**
 * @file transitions
 * @brief Habits 状态转换表
 * 
 * 状态流转: (none) → draft → active ⇄ suspended → archived
 * suspended → archived（用户归档，需二次确认）
 */

import type { HabitStatus } from '@/usom/types/primitives'
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

export const habitTransitions: Transition<HabitStatus>[] = [
  { from: null,        to: 'draft',     action: 'create',     eventType: 'HabitCreated' },
  { from: 'draft',     to: 'active',    action: 'activate',   eventType: 'HabitActivated' },
  { from: 'active',    to: 'suspended', action: 'suspend',    eventType: 'HabitSuspended' },
  { from: 'suspended', to: 'active',    action: 'reactivate', eventType: 'HabitActivated' },
  { from: 'suspended', to: 'archived',  action: 'archive',    eventType: 'HabitArchived' },
  { from: 'draft',     to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
  { from: 'active',    to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
  { from: 'suspended', to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
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
