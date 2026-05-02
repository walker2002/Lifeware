// USOM Summary Subtypes
// Source: docs/usom-design.md Section 5

import type {
  USOM_ID, DateOnly, Timestamp,
  Priority, EnergyLevel, PeriodType,
  ObjectiveStatus, KeyResultStatus, TaskStatus,
  HabitStatus, TimeboxStatus, IntentionStatus,
} from './primitives'

export interface TaskSummary {
  id: USOM_ID
  title: string
  status: TaskStatus
  priority: Priority
  energyRequired: EnergyLevel
  dueDate?: DateOnly
  keyResultId?: USOM_ID
}

export interface HabitSummary {
  id: USOM_ID
  title: string
  status: HabitStatus
  scheduledTime: string // HH:MM
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
}

export interface ObjectiveSummary {
  id: USOM_ID
  title: string
  status: ObjectiveStatus
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
