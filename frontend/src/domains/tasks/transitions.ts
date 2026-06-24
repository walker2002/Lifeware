/**
 * @file transitions
 * @brief Tasks Domain 状态转换表（重构后）
 *
 * task: (none) → todo → planned → in_progress → completed → archived
 *        todo | planned | in_progress → completed（直接完成，[025] ISSUE-004：与 cascade_complete 对齐）
 *        todo | planned | in_progress | completed → deleted（软删除）
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
  // [025] ISSUE-004：complete 允许 todo/planned/in_progress → completed（与 cascade_complete 对齐，
  // 消除「todo 任务标记完成 → 非法状态转换」500）。用户在 complete-zone 填实际用时后直接完成合理。
  { from: 'todo',        to: 'completed', action: 'complete', eventType: 'TaskCompleted' },
  { from: 'planned',     to: 'completed', action: 'complete', eventType: 'TaskCompleted' },
  { from: 'in_progress', to: 'completed', action: 'complete', eventType: 'TaskCompleted' },
  { from: 'completed', to: 'archived',  action: 'archive',  eventType: 'TaskArchived' },
  { from: 'todo',        to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'planned',     to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'in_progress', to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'completed',   to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  // 级联转换（cascade_*）：父对象完成/归档/删除时子任务走此专用 action
  { from: 'todo',        to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'planned',     to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'in_progress', to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'todo',        to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'planned',     to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'in_progress', to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'completed',   to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'todo',        to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'planned',     to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'in_progress', to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'completed',   to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'archived',    to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
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
