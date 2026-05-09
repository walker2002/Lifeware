// State Machine 转换表 — Timebox 生命周期状态机
// 状态流转: (none) → planned → running → ended → logged
// 特殊路径: running → overtime → ended（超时自动标记）
//           planned → cancelled（用户取消）

import type { TimeboxStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

export interface Transition {
  from: TimeboxStatus | null
  to: TimeboxStatus
  action: string
  eventType: SystemEventType
}

export const timeboxTransitions: Transition[] = [
  { from: null,      to: 'planned',    action: 'create',  eventType: 'TimeboxCreated' },
  { from: 'planned', to: 'running',    action: 'start',   eventType: 'TimeboxStarted' },
  { from: 'running', to: 'ended',      action: 'end',     eventType: 'TimeboxEnded' },
  { from: 'running', to: 'overtime',   action: 'overtime', eventType: 'TimeboxOvertime' },
  { from: 'overtime', to: 'ended',     action: 'end',     eventType: 'TimeboxEnded' },
  { from: 'planned', to: 'cancelled',  action: 'cancel',  eventType: 'TimeboxCancelled' },
  { from: 'ended',   to: 'logged',     action: 'log',     eventType: 'TimeboxLogged' },
]

export function findTransition(
  from: TimeboxStatus | null,
  action: string,
): Transition | null {
  return timeboxTransitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}
