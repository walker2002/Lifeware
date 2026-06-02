/**
 * @file transitions
 * @brief Timebox 状态转换表
 * 
 * 状态流转: (none) → planned → running → ended → logged
 * 特殊路径: running → overtime → ended（超时自动标记）
 *          planned → cancelled（用户取消）
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
  { from: null,      to: 'planned',    action: 'create',  eventType: 'TimeboxCreated' },
  { from: 'planned', to: 'running',    action: 'start',   eventType: 'TimeboxStarted' },
  { from: 'running', to: 'ended',      action: 'end',     eventType: 'TimeboxEnded' },
  { from: 'running', to: 'overtime',   action: 'overtime', eventType: 'TimeboxOvertime' },
  { from: 'overtime', to: 'ended',     action: 'end',     eventType: 'TimeboxEnded' },
  { from: 'planned', to: 'cancelled',  action: 'cancel',  eventType: 'TimeboxCancelled' },
  { from: 'ended',   to: 'logged',     action: 'log',     eventType: 'TimeboxLogged' },
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
