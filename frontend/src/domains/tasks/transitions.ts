/**
 * @file transitions
 * @brief Tasks 状态转换表
 * 
 * task: (none) → draft → active → completed/archived
 * project: (none) → planning → active → paused/completed
 *         paused → active（恢复）
 */

import type { TaskStatus, ProjectStatus } from '@/usom/types/primitives'
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

export const taskTransitions: Transition<TaskStatus>[] = [
  { from: null,      to: 'draft',     action: 'create',   eventType: 'TaskCreated' },
  { from: 'draft',   to: 'active',    action: 'activate',  eventType: 'TaskActivated' },
  { from: 'active',  to: 'completed', action: 'complete',  eventType: 'TaskCompleted' },
  { from: 'active',  to: 'archived',  action: 'archive',   eventType: 'TaskArchived' },
]

export const projectTransitions: Transition<ProjectStatus>[] = [
  { from: null,       to: 'planning',  action: 'create',   eventType: 'ProjectCreated' },
  { from: 'planning', to: 'active',    action: 'activate',  eventType: 'ProjectActivated' },
  { from: 'active',   to: 'paused',    action: 'pause',     eventType: 'ProjectPaused' },
  { from: 'paused',   to: 'active',    action: 'resume',    eventType: 'ProjectResumed' },
  { from: 'active',   to: 'completed', action: 'complete',  eventType: 'ProjectCompleted' },
  { from: 'completed', to: 'archived', action: 'archive',   eventType: 'ProjectArchived' },
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
