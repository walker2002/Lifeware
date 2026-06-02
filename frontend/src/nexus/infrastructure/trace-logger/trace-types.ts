/**
 * @file trace-types
 * @brief 追踪日志类型定义
 * 
 * 记录 Nexus 管道各组件的输入/输出和状态机转换详情
 */

import type { Timestamp } from '@/usom/types/primitives'
import type { TimeboxStatus } from '@/usom/types/primitives'

// ─── 追踪步骤阶段 ─────────────────────────────────────────────

/** 追踪阶段：开始或结束 */
export type TracePhase = 'start' | 'end'

// ─── 组件名称 ─────────────────────────────────────────────────

/** 追踪组件名 */
export type TraceComponent =
  | 'IntentEngine'
  | 'RuleEngine'
  | 'StateMachine'
  | 'EventBus'
  | 'ActionSurfaceEngine'
  | 'ContextEngine'
  | 'Handler'

// ─── 追踪步骤 ─────────────────────────────────────────────────

/** 追踪步骤 */
export interface TraceStep {
  /** 步骤序号 */
  id: number
  /** 组件名称 */
  component: TraceComponent
  /** 阶段：start/end */
  phase: TracePhase
  /** 时间戳 */
  timestamp: Timestamp
  /** 输入数据 */
  input: Record<string, unknown>
  /** 输出数据（phase='end' 时有值） */
  output?: Record<string, unknown>
  /** 耗时(ms)（phase='end' 时有值） */
  duration?: number
  /** 错误信息 */
  error?: string
}

// ─── 状态转换追踪 ─────────────────────────────────────────────

export interface StateTransitionTrace {
  /** 转换前状态 */
  fromStatus: TimeboxStatus | null
  /** 转换后状态 */
  toStatus: TimeboxStatus
  /** 触发动作 */
  action: string
  /** 生成的事件类型 */
  eventType: string
}

// ─── 追踪会话 ─────────────────────────────────────────────────

export type TraceSessionResult = 'success' | 'error'

export interface TraceSession {
  /** 会话 ID */
  id: string
  /** 开始时间 */
  startedAt: Timestamp
  /** 结束时间 */
  completedAt?: Timestamp
  /** 用户原始输入 */
  rawInput: string
  /** 调用链步骤列表 */
  steps: TraceStep[]
  /** 最终结果 */
  result?: TraceSessionResult
}
