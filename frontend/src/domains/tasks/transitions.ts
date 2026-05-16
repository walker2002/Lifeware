// Tasks 状态转换表 — task 和 project 两个对象的状态流转
// task: (none) → draft → active → completed/archived
// project: (none) → planning → active → paused/completed
//         paused → active（恢复）

import type { TaskStatus, ProjectStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

export interface Transition<T extends string = string> {
  from: T | null
  to: T
  action: string
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

export function findTransition<T extends string>(
  transitions: Transition<T>[],
  from: T | null,
  action: string,
): Transition<T> | null {
  return transitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}
