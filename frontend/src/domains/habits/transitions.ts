// Habits 状态转换表 — 从 nexus/core/state-machine/transitions.ts 复制
// 状态流转: (none) → draft → active ⇄ suspended → archived
// suspended → archived（用户归档，需二次确认）

import type { HabitStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

export interface Transition<T extends string = string> {
  from: T | null
  to: T
  action: string
  eventType: SystemEventType
}

export const habitTransitions: Transition<HabitStatus>[] = [
  { from: null,        to: 'draft',     action: 'create',     eventType: 'HabitCreated' },
  { from: 'draft',     to: 'active',    action: 'activate',   eventType: 'HabitActivated' },
  { from: 'active',    to: 'suspended', action: 'suspend',    eventType: 'HabitSuspended' },
  { from: 'suspended', to: 'active',    action: 'reactivate', eventType: 'HabitActivated' },
  { from: 'suspended', to: 'archived',  action: 'archive',    eventType: 'HabitArchived' },
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
