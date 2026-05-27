// USOM Core Objects
// Source: docs/usom-design.md Section 3

import type {
  USOM_ID, Timestamp, DateOnly, DurationMinutes, Notes, Tag,
  Priority, EnergyLevel, PeriodType, EnergyScore, EnergySource,
  Chronotype, EnergyCurvePoint, EnergySensitivity,
  ObjectiveStatus, KeyResultStatus, TaskStatus, HabitStatus,
  HabitLogStatus, TimeboxStatus, ReviewStatus, IntentionStatus,
  ProjectStatus, AISessionStatus,
} from './primitives'

// ─── 3.1 User ─────────────────────────────────────────────────
export interface User {
  id: USOM_ID
  email: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.2 UserCalibration ───────────────────────────────────────
export interface UserCalibration {
  userId: USOM_ID
  afternoonStart: number
  eveningStart: number
  nightStart: number
  peakEnergyStart: number
  peakEnergyEnd: number
  energyConfidence: number
  chronotype: Chronotype
  baselineCurve: EnergyCurvePoint[]
  sensitivity: EnergySensitivity
  lastEnergyCalibrationAt?: Timestamp
  comfortableWipLimit: number
  sustainableDeepWorkHours: number
  habitRiskDays: number[]
  habitPreferredTimeSlots: string[]
  ruleOverrideHistory: Record<string, RuleOverrideEntry>
  updatedAt: Timestamp
}

export interface RuleOverrideEntry {
  ruleKey: string
  overrideAt: Timestamp
  context: string
}

// ─── 3.3 Intention ─────────────────────────────────────────────
export interface Intention {
  id: USOM_ID
  status: IntentionStatus
  rawInput: string
  inputMode: 'natural_language' | 'template_form' | 'slash_command'
  capturedAt: Timestamp
  dissolvedAt?: Timestamp
  sourceSnapshotId?: USOM_ID
  notes?: Notes
}

// ─── 3.4 StructuredIntent ──────────────────────────────────────
export interface StructuredIntent {
  id: USOM_ID
  intentionId: USOM_ID
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
  resolvedBy: 'ai' | 'template_form'
  pathType?: 'contract' | 'generative' | 'query'
  createdAt: Timestamp
}

// ─── 3.5 Objective ────────────────────────────────────────────
export interface Objective {
  id: USOM_ID
  status: ObjectiveStatus
  title: string
  description?: string
  period: {
    type: PeriodType
    start: DateOnly
    end: DateOnly
  }
  parentId?: USOM_ID
  keyResultIds: USOM_ID[]
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  okrType: 'visionary' | 'committed'
  objectiveNumber: string
  priority: 'P0' | 'P1' | 'P2'
  discardedAt?: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

// ─── 3.6 KeyResult ────────────────────────────────────────────
export interface KeyResult {
  id: USOM_ID
  objectiveId: USOM_ID
  title: string
  description?: string
  targetValue: number
  currentValue: number
  unit: string
  progressRate: number
  status: KeyResultStatus
  dueDate?: DateOnly
  discardedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.7 Task ─────────────────────────────────────────────────
export interface Task {
  id: USOM_ID
  status: TaskStatus
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration: DurationMinutes
  actualDuration?: DurationMinutes
  keyResultId?: USOM_ID
  timeboxId?: USOM_ID
  tags: Tag[]
  dueDate?: DateOnly
  recurrence?: RecurrenceRule
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
  parentId?: USOM_ID
  projectId?: USOM_ID
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]
  startDate?: DateOnly
  endDate?: DateOnly
  notes?: Notes
}

// ─── 3.7a Project ──────────────────────────────────────────────
export interface Project {
  id: USOM_ID
  status: ProjectStatus
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  priority?: Priority
  color?: string
  tags: Tag[]
  notes?: Notes
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

// ─── 3.7b ProjectTemplate ─────────────────────────────────────
export interface ProjectTemplate {
  id: USOM_ID
  name: string
  description?: string
  priority?: Priority
  color?: string
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.7c TaskTemplate ────────────────────────────────────────
export interface TaskTemplate {
  id: USOM_ID
  projectTemplateId?: USOM_ID
  parentTemplateId?: USOM_ID
  title: string
  description?: string
  priority?: Priority
  energyRequired?: EnergyLevel
  estimatedDuration?: number
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  sortOrder: number
  createdAt: Timestamp
}

// MVP stub — type only, no business logic
export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  endDate?: DateOnly
}

// ─── 3.8 Habit ────────────────────────────────────────────────
export interface Habit {
  id: USOM_ID
  status: HabitStatus
  title: string
  description?: string
  frequency: HabitFrequency
  defaultTime: string // HH:MM
  earliestTime: string // HH:MM
  latestStartTime: string // HH:MM
  defaultDuration: DurationMinutes
  minDuration: DurationMinutes
  trackable: boolean
  startDate: DateOnly
  endDate?: DateOnly
  keyResultId?: USOM_ID
  streak: number
  longestStreak: number
  completionRate7d: number
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  suspendedAt?: Timestamp
  archivedAt?: Timestamp
  notes?: Notes
}

export interface HabitFrequency {
  type: 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[] // 0=Sunday ... 6=Saturday
}

// ─── 3.8a HabitTemplate ────────────────────────────────────────
export interface HabitTemplate {
  id: USOM_ID
  name: string
  description?: string
  icon?: string
  status: 'draft' | 'active'
  applicableDays: number[] // 0=Sunday ... 6=Saturday
  habits: TemplateHabitItem[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface TemplateHabitItem {
  habitId: USOM_ID
  sortOrder: number
  timeOverride?: string // HH:MM
  durationOverride?: DurationMinutes
}

// ─── 3.9 HabitLog ─────────────────────────────────────────────
export interface HabitLog {
  id: USOM_ID
  habitId: USOM_ID
  date: DateOnly
  status: HabitLogStatus
  actualDuration?: DurationMinutes
  note?: Notes
  loggedAt: Timestamp
  source: 'manual' | 'connector'
}

// ─── Execution Record Types ──────────────────────────────────────
export interface SimpleExecutionRecord {
  mode: 'simple'
  completionStatus: 'completed' | 'partially_completed' | 'not_completed'
  actualDuration: number
  plannedDuration: number
  deviationMinutes: number
  loggedAt: string
}

export interface DetailedExecutionRecord extends Omit<SimpleExecutionRecord, 'mode'> {
  mode: 'detailed'
  completionRating: number
  actualOutput: string
  deviationReasons?: string
  energyLevel?: number
  notes?: string
}

export type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord

// ─── 3.10 Timebox ─────────────────────────────────────────────
export interface Timebox {
  id: USOM_ID
  status: TimeboxStatus
  title: string
  startTime: Timestamp
  endTime: Timestamp
  taskIds: USOM_ID[]
  habitIds: USOM_ID[]
  isRecurring: boolean
  recurrenceRule?: RecurrenceRule
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  startedAt?: Timestamp
  overtimeAt?: Timestamp
  endedAt?: Timestamp
  loggedAt?: Timestamp
  executionRecord?: ExecutionRecord
  notes?: Notes
}

// ─── 3.11 Review ──────────────────────────────────────────────
export interface Review {
  id: USOM_ID
  status: ReviewStatus
  type: PeriodType
  periodStart: DateOnly
  periodEnd: DateOnly
  generatedBy: 'ai' | 'manual'
  sections: ReviewSection[]
  metrics: ReviewMetrics
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

export interface ReviewSection {
  key: string
  title: string
  content: string // Markdown
}

export interface ReviewMetrics {
  tasksCompleted: number
  tasksTotal: number
  habitsCompleted: number
  habitsTotal: number
  timeboxedHours: number
  focusScore?: number // 0-100
}

/** CN-UI 表面引用（嵌入 ChatMessage 用于对话内渲染） */
export interface CnuiSurfaceRef {
  cnuiSurfaceId: string
  cnuiSurfaceType: string
  domainId: string
  action: string
  dataSnapshot?: Record<string, unknown>
}

// ─── ChatMessage (embedded in AISession) ──────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Timestamp
  intentRef?: string
  cnuiSurface?: CnuiSurfaceRef
}

// ─── 3.12 AISession ──────────────────────────────────────────
export interface AISession {
  id: USOM_ID
  userId: string
  title: string
  status: AISessionStatus
  messages: ChatMessage[]
  stateSnapshot: Record<string, unknown>
  referencedObjectIds: USOM_ID[]
  createdAt: Timestamp
  updatedAt: Timestamp
  archivedAt?: Timestamp
}

export interface AISessionSummary {
  id: USOM_ID
  title: string
  status: AISessionStatus
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.13 LLMConfig (embedded in UserSettings) ────────────────
export interface LLMConfig {
  activeProvider?: string
  providers?: Record<string, {
    baseUrl?: string
    models?: {
      default?: string
      thinking?: string
      quick?: string
    }
  }>
}

// ─── 3.14 UserSettings ───────────────────────────────────────
export interface UserSettings {
  id: USOM_ID
  userId: string
  timezone: string
  llmConfig?: LLMConfig
  uiPrefs?: Record<string, unknown>
}
