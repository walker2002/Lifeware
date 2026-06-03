/**
 * @file transitions
 * @brief Tasks Domain 状态转换表（重构后）
 *
 * task: (none) → todo → planned → in_progress → completed → archived
 * thread: (none) → active → paused → completed → archived
 */

import type { TaskStatus, ThreadStatus } from '../../usom/types/primitives'

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
  eventType: string
}

// ─── Task 状态转换 ───────────────────────────────────────────────

/** 任务状态转换表 */
export const taskTransitions: Transition<TaskStatus>[] = [
  { from: null,      to: 'todo',        action: 'create',   eventType: 'TaskCreated' },
  { from: 'todo',    to: 'planned',     action: 'plan',     eventType: 'TaskPlanned' },
  { from: 'planned', to: 'in_progress', action: 'start',    eventType: 'TaskStarted' },
  { from: 'todo',    to: 'in_progress', action: 'start',    eventType: 'TaskStarted' },
  { from: 'in_progress', to: 'completed', action: 'complete', eventType: 'TaskCompleted' },
  { from: 'completed', to: 'archived',  action: 'archive',  eventType: 'TaskArchived' },
]

// ─── Thread 状态转换 ─────────────────────────────────────────────

/** 主线状态转换表 */
export const threadTransitions: Transition<ThreadStatus>[] = [
  { from: null,      to: 'active',    action: 'create',   eventType: 'ThreadCreated' },
  { from: 'active',  to: 'paused',    action: 'pause',    eventType: 'ThreadPaused' },
  { from: 'paused',  to: 'active',    action: 'resume',   eventType: 'ThreadResumed' },
  { from: 'active',  to: 'completed', action: 'complete', eventType: 'ThreadCompleted' },
  { from: 'completed', to: 'archived', action: 'archive', eventType: 'ThreadArchived' },
]

// ─── 查找状态转换 ────────────────────────────────────────────────

/**
 * 查找状态转换
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
