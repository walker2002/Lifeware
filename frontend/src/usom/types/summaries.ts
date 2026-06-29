// USOM Summary Subtypes
// Source: docs/usom-design.md Section 5

import type {
  USOM_ID, DateOnly, Timestamp,
  Priority, EnergyLevel, PeriodType,
  ObjectiveStatus, KeyResultStatus, TaskStatus,
  HabitStatus, TimeboxStatus, IntentionStatus,
  ClarityLevel, DecompositionLevel,
} from './primitives'

export interface TaskSummary {
  id: USOM_ID
  title: string
  status: TaskStatus
  priority: Priority
  energyRequired: EnergyLevel
  dueDate?: DateOnly
  keyResultId?: USOM_ID
  /** 认知清晰度 */
  clarity?: ClarityLevel
  /** 拆分建议状态 */
  decomposition?: DecompositionLevel
}

export interface HabitSummary {
  id: USOM_ID
  title: string
  status: HabitStatus
  defaultTime: string // HH:MM
  trackable: boolean
  streak: number
  todayLogged: boolean
}

export interface TimeboxSummary {
  id: USOM_ID
  title: string
  status: TimeboxStatus
  startTime: Timestamp
  endTime: Timestamp
  taskIds: USOM_ID[]
  habitIds: USOM_ID[]
  startedAt?: Timestamp
  overtimeAt?: Timestamp
  endedAt?: Timestamp
  loggedAt?: Timestamp
  executionRecord?: import('./objects').ExecutionRecord
  /** [023] A2 OV#4 死字段最小消费方：活动原型名（来自 ActivityArchetype.l2Name） */
  archetypeName?: string
}

export interface ObjectiveSummary {
  id: USOM_ID
  title: string
  status: ObjectiveStatus
  /** 权威周期归属，指向 Cycle */
  cycleId: USOM_ID
  /** 派生只读：由 Cycle 填充 */
  period: { type: PeriodType; start: DateOnly; end: DateOnly }
  keyResultIds: USOM_ID[]
}

export interface KeyResultSummary {
  id: USOM_ID
  objectiveId: USOM_ID
  title: string
  progressRate: number
  status: KeyResultStatus
  dueDate?: DateOnly
}

export interface IntentionSummary {
  id: USOM_ID
  status: IntentionStatus
  rawInput: string
  capturedAt: Timestamp
}
