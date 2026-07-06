// USOM Summary Subtypes
// Source: docs/usom-design.md Section 5

import type {
  USOM_ID, DateOnly, Timestamp,
  Priority, EnergyLevel, PeriodType,
  TaskStatus,
  HabitStatus, TimeboxStatus, AppointmentStatus, IntentionStatus,
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
  /** [023] A2 OV#4：活动原型名（ActivityArchetype.l2Name），timeboxToSummary 解析后填充；最小消费方=TimeboxCard 标题行 */
  archetypeName?: string
  startedAt?: Timestamp
  overtimeAt?: Timestamp
  endedAt?: Timestamp
  loggedAt?: Timestamp
  executionRecord?: import('./objects').ExecutionRecord
}

/** 约定摘要（≤7 字段，供 /timeboxes 合并展示 + ContextSnapshot + 编辑入口用） */
export interface AppointmentSummary {
  id:        USOM_ID
  title:     string
  startTime: Timestamp
  durationMin: number
  status:    AppointmentStatus            // 直接来自 DB
  // [026] 编辑入口需要：UI 双击/编辑按钮开 EditAppointmentDrawer，复用 <AppointmentFormFields> 5 字段。
  // 原 summary 仅 4 字段，编辑前需再 fetch；扩 2 字段 → 客户端编辑零延迟、零额外往返。
  detail?:   string | null
  people?:   string[]
  /** [026.01] 编辑入口零延迟透传 archetype（与 detail/people 同性质） */
  activityArchetypeId?: USOM_ID
}

export interface ObjectiveSummary {
  id: USOM_ID
  title: string
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
  dueDate?: DateOnly
}

export interface IntentionSummary {
  id: USOM_ID
  status: IntentionStatus
  rawInput: string
  capturedAt: Timestamp
}
