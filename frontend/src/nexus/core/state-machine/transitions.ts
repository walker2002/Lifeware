// State Machine 转换表 — Timebox 生命周期状态机
// 采用 Map 结构的 FSM，key 为 (fromState, action)，value 为转换定义

import type { TimeboxStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

// ─── 转换定义 ─────────────────────────────────────────────────
export interface Transition {
  /** 起始状态，null 表示从无到有（创建） */
  from: TimeboxStatus | null
  /** 目标状态 */
  to: TimeboxStatus
  /** 触发动作 */
  action: string
  /** 转换完成后发布的事件类型 */
  eventType: SystemEventType
}

// ─── Timebox 转换表 ────────────────────────────────────────────
// 状态流转: (none) → planned → running ⇄ paused → ended → logged
// 特殊路径: planned → ended（时间触发，跳过 start）
export const timeboxTransitions: Transition[] = [
  { from: null,      to: 'planned', action: 'create', eventType: 'TimeboxCreated' },
  { from: 'planned', to: 'running', action: 'start',  eventType: 'TimeboxStarted' },
  { from: 'running', to: 'paused',  action: 'pause',  eventType: 'TimeboxPaused' },
  { from: 'paused',  to: 'running', action: 'resume', eventType: 'TimeboxStarted' },
  { from: 'running', to: 'ended',   action: 'end',    eventType: 'TimeboxEnded' },
  { from: 'planned', to: 'ended',   action: 'end',    eventType: 'TimeboxEnded' },
  { from: 'ended',   to: 'logged',  action: 'log',    eventType: 'TimeboxLogged' },
]

// ─── 转换查找 ─────────────────────────────────────────────────
// 根据 (fromState, action) 查找匹配的转换规则
export function findTransition(
  from: TimeboxStatus | null,
  action: string,
): Transition | null {
  return timeboxTransitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}
