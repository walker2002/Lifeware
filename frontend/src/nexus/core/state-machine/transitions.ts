// State Machine 转换表 — Timebox 生命周期状态机
// 状态流转: (none) → planned → running → ended → logged
// 特殊路径: running → overtime → ended（超时自动标记）
//           planned → cancelled（用户取消）

import type { TimeboxStatus, HabitStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

export interface Transition<T extends string = string> {
  from: T | null
  to: T
  action: string
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

export function findTransition<T extends string>(
  transitions: Transition<T>[],
  from: T | null,
  action: string,
): Transition<T> | null {
  return transitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}

// ─── Habit 状态转换 ─────────────────────────────────────────
// draft → active (用户确认激活)
// active → suspended (用户暂停)
// active → archived (用户归档)
// suspended → active (用户恢复)
// suspended → archived (用户归档)

export const habitTransitions: Transition<HabitStatus>[] = [
  { from: null,        to: 'draft',     action: 'create',     eventType: 'HabitCreated' },
  { from: 'draft',     to: 'active',    action: 'activate',   eventType: 'HabitActivated' },
  { from: 'active',    to: 'suspended', action: 'suspend',    eventType: 'HabitSuspended' },
  { from: 'active',    to: 'archived',  action: 'archive',    eventType: 'HabitArchived' },
  { from: 'suspended', to: 'active',    action: 'reactivate', eventType: 'HabitActivated' },
  { from: 'suspended', to: 'archived',  action: 'archive',    eventType: 'HabitArchived' },
]
