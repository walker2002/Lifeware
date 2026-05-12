// USOM Shared Primitives
// Source: docs/usom-design.md Section 2

// ─── Base ID Type ──────────────────────────────────────────────
export type USOM_ID = string // UUID v4

// ─── Time Types (ISO 8601, UTC storage) ────────────────────────
export type Timestamp = string // e.g. "2026-03-19T08:00:00Z"
export type DateOnly = string // e.g. "2026-03-19"

// ─── Enum: Priority ────────────────────────────────────────────
export enum Priority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

// ─── Enum: Energy Level ───────────────────────────────────────
export enum EnergyLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

// ─── Energy Score (1-10, single dimension for MVP) ─────────────
export type EnergyScore = number // 1-10

// ─── Energy Source ─────────────────────────────────────────────
export type EnergySource = 'system' | 'user'

// ─── Energy State (embedded in ContextSnapshot) ────────────────
export interface EnergyState {
  inferredLevel: EnergyScore
  calibratedLevel: EnergyScore | null
  activeLevel: EnergyScore
  source: EnergySource
  lastCalibratedAt?: Timestamp
}

// ─── Chronotype ────────────────────────────────────────────────
export type Chronotype = 'morning_lark' | 'night_owl' | 'intermediate'

// ─── Energy Curve Point (24-hour baseline) ─────────────────────
export interface EnergyCurvePoint {
  hour: number // 0-23
  baseline: number // 1-10
}

// ─── Energy Sensitivity ────────────────────────────────────────
export type EnergySensitivity = 'high' | 'medium' | 'low'

// ─── Duration (minutes) ───────────────────────────────────────
export type DurationMinutes = number

// ─── Enum: Period Type ─────────────────────────────────────────
export enum PeriodType {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  SemiAnnual = 'semi_annual',
  Annual = 'annual',
}

// ─── Time of Day (default boundaries: 05:00 / 12:00 / 18:00 / 22:00) ──
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

// ─── Tag ───────────────────────────────────────────────────────
export type Tag = string // lowercase, max 20 chars

// ─── Notes ─────────────────────────────────────────────────────
export type Notes = string | null

// ─── Status Enums ──────────────────────────────────────────────
export type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
export type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
export type TaskStatus = 'draft' | 'active' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
/** @deprecated Use 'in_progress' instead. 'scheduled' retained for backward compatibility with existing data. */

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
export type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived'
export type HabitLogStatus = 'completed' | 'skipped' | 'partial'
export type TimeboxStatus = 'planned' | 'running' | 'overtime' | 'ended' | 'cancelled' | 'logged'
export type CompletionStatus = 'completed' | 'partially_completed' | 'not_completed'
export type ReviewStatus = 'draft' | 'in_progress' | 'completed' | 'archived'
export type IntentionStatus = 'captured' | 'clarified' | 'routed' | 'dissolved'

// ─── Domain & Action Types ─────────────────────────────────────
export type DomainId = 'tasks' | 'habits' | 'okrs' | 'timebox' | 'review' | 'projects'
export type ActionCategory = 'guide' | 'tile' | 'cue'
export type ActionType =
  | 'log_habit'
  | 'streak_milestone_hint'
  | 'habit_risk_warning'
  | 'complete_task'
  | 'start_timebox'
  | 'review_okr'
  | 'create_review'
  | 'capture_intent'
  | 'snooze'
  | 'skip'

export type USOMObjectType =
  | 'objective' | 'key_result'
  | 'task' | 'habit' | 'habit_log'
  | 'timebox' | 'review'
  | 'intention' | 'project'

// ─── External Types (MVP stub) ────────────────────────────────
export type ExternalSourceType = 'health' | 'productivity' | 'calendar' | 'communication' | 'custom'
