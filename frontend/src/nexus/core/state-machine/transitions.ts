// State Machine 转换表 — Timebox 生命周期状态机
// 状态流转: (none) → planned → running → ended → logged
// 特殊路径: running → overtime → ended（超时自动标记）
//           planned → cancelled（用户取消）

import type { TimeboxStatus, HabitStatus, ObjectiveStatus, KeyResultStatus } from '@/usom/types/primitives'
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
// suspended → active (用户恢复)
// suspended → archived (用户归档，需二次确认)

export const habitTransitions: Transition<HabitStatus>[] = [
  { from: null,        to: 'draft',     action: 'create',     eventType: 'HabitCreated' },
  { from: 'draft',     to: 'active',    action: 'activate',   eventType: 'HabitActivated' },
  { from: 'active',    to: 'suspended', action: 'suspend',    eventType: 'HabitSuspended' },
  { from: 'suspended', to: 'active',    action: 'reactivate', eventType: 'HabitActivated' },
  { from: 'suspended', to: 'archived',  action: 'archive',    eventType: 'HabitArchived' },
]

// ─── Objective 状态转换 ─────────────────────────────────────
// (null) → draft → active ⇄ paused
// draft/active/paused → discarded → archived
// active → completed → archived

export const objectiveTransitions: Transition<ObjectiveStatus>[] = [
  { from: null,       to: 'draft',     action: 'create',   eventType: 'ObjectiveCreated' },
  { from: 'draft',    to: 'active',    action: 'activate',  eventType: 'ObjectiveActivated' },
  { from: 'draft',    to: 'discarded', action: 'discard',   eventType: 'ObjectiveDiscarded' },
  { from: 'active',   to: 'paused',    action: 'pause',     eventType: 'ObjectivePaused' },
  { from: 'active',   to: 'completed', action: 'complete',  eventType: 'ObjectiveCompleted' },
  { from: 'active',   to: 'discarded', action: 'discard',   eventType: 'ObjectiveDiscarded' },
  { from: 'paused',   to: 'active',    action: 'resume',    eventType: 'ObjectiveResumed' },
  { from: 'paused',   to: 'discarded', action: 'discard',   eventType: 'ObjectiveDiscarded' },
  { from: 'completed',to: 'archived',  action: 'archive',   eventType: 'ObjectiveArchived' },
  { from: 'discarded',to: 'archived',  action: 'archive',   eventType: 'ObjectiveArchived' },
]

// ─── KeyResult 状态转换 ─────────────────────────────────────
// 联动：Objective 状态变更时 KR 同步转换
// 独立：updateProgress 不改变状态，currentValue >= targetValue 自动完成

export const keyResultTransitions: Transition<KeyResultStatus>[] = [
  { from: null,       to: 'draft',     action: 'create',   eventType: 'KeyResultUpdated' },
  { from: 'draft',    to: 'active',    action: 'activate',  eventType: 'KeyResultUpdated' },
  { from: 'draft',    to: 'discarded', action: 'discard',   eventType: 'KeyResultUpdated' },
  { from: 'active',   to: 'paused',    action: 'pause',     eventType: 'KeyResultUpdated' },
  { from: 'active',   to: 'completed', action: 'complete',  eventType: 'KeyResultCompleted' },
  { from: 'active',   to: 'discarded', action: 'discard',   eventType: 'KeyResultUpdated' },
  { from: 'paused',   to: 'active',    action: 'resume',    eventType: 'KeyResultUpdated' },
  { from: 'paused',   to: 'discarded', action: 'discard',   eventType: 'KeyResultUpdated' },
  { from: 'completed',to: 'archived',  action: 'archive',   eventType: 'KeyResultUpdated' },
  { from: 'discarded',to: 'archived',  action: 'archive',   eventType: 'KeyResultUpdated' },
]
