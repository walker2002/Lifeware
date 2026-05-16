// OKRs 状态转换表 — 从 nexus/core/state-machine/transitions.ts 复制
// Objective: (null) → draft → active ⇄ paused
//            draft/active/paused → discarded → archived
//            active → completed → archived
// KeyResult: 联动 Objective 状态变更时 KR 同步转换
//            独立 updateProgress 不改变状态

import type { ObjectiveStatus, KeyResultStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

export interface Transition<T extends string = string> {
  from: T | null
  to: T
  action: string
  eventType: SystemEventType
}

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

export function findTransition<T extends string>(
  transitions: Transition<T>[],
  from: T | null,
  action: string,
): Transition<T> | null {
  return transitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}
