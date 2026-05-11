// USOM Process Objects
// Source: docs/usom-design.md Section 4

import type {
  USOM_ID, Timestamp, DateOnly, Tag, Notes,
  EnergyState, TimeOfDay, PeriodType,
  IntentionStatus, ObjectiveStatus, KeyResultStatus,
  TaskStatus, HabitStatus, TimeboxStatus,
  DomainId, ActionCategory, ActionType, USOMObjectType, ExternalSourceType,
} from './primitives'
import type { StructuredIntent } from './objects'

// ─── Summary Types (imported from summaries.ts) ────────────────
import type {
  TaskSummary, HabitSummary, TimeboxSummary,
  ObjectiveSummary, KeyResultSummary, IntentionSummary,
} from './summaries'

// ─── 4.1 ContextSnapshot ──────────────────────────────────────
export interface ContextSnapshot {
  snapshotId: USOM_ID
  userId: USOM_ID
  generatedAt: Timestamp
  generatedBy: 'state_machine'

  activeObjectives: ObjectiveSummary[]
  activeKeyResults: KeyResultSummary[]
  activeTasks: TaskSummary[]
  pendingHabits: HabitSummary[]
  currentTimebox?: TimeboxSummary
  upcomingTimeboxes: TimeboxSummary[]
  pendingIntentions: IntentionSummary[]

  currentTime: Timestamp
  currentDate: DateOnly
  dayOfWeek: number
  timeOfDay: TimeOfDay

  energyState: EnergyState
}

// ─── 4.2 USOMSnapshot (Domain read-only view) ──────────────────
export type USOMSnapshot = Readonly<{
  userId: USOM_ID

  activeObjectives: ReadonlyArray<Readonly<ObjectiveSummary>>
  activeKeyResults: ReadonlyArray<Readonly<KeyResultSummary>>
  activeTasks: ReadonlyArray<Readonly<TaskSummary>>
  pendingHabits: ReadonlyArray<Readonly<HabitSummary>>
  currentTimebox?: Readonly<TimeboxSummary>
  upcomingTimeboxes: ReadonlyArray<Readonly<TimeboxSummary>>
  pendingIntentions: ReadonlyArray<Readonly<IntentionSummary>>

  currentTime: Timestamp
  currentDate: DateOnly
  dayOfWeek: number
  timeOfDay: TimeOfDay

  energyState: Readonly<EnergyState>

  readonly sourceSnapshotId: USOM_ID
}>

// ─── 4.3 DerivedSignals ───────────────────────────────────────
export interface DerivedSignals {
  userId: USOM_ID
  energyPattern: {
    peakHours: number[]
    lowHours: number[]
    confidence: number
  } | null
  activeTaskCount: number
  avgCompletionRate7d: number
  avgCompletionRate30d: number
  habitStreaks: Record<USOM_ID, number>
  habitCompletionRates: Record<USOM_ID, number>
  timeboxAdherence7d: number
  isOvercommitted: boolean
  computedAt: Timestamp
  dataWindowDays: number
}

// ─── 4.4 Domain Plugin Four-Hook Signature ────────────────────
export interface DomainPlugin {
  manifest: DomainManifest

  onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): { valid: boolean; errors: string[] }

  onEvent(
    event: SystemEvent,
    snapshot: USOMSnapshot,
  ): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }

  onActionSurfaceRequest(
    snapshot: USOMSnapshot,
    signals: Readonly<DerivedSignals>,
  ): { actions: ActionCandidate[]; category: ActionCategory; weight: number }

  onOutboundRequest?(
    trigger: SystemEvent,
    snapshot: USOMSnapshot,
  ): { connector: string; payload: ExternalPayload; condition?: string }
}

export interface DomainManifest {
  domainId: DomainId
  version: string
  requiredFields: string[]
  subscribedEvents: SystemEventType[]
}

export interface MetricUpdate {
  metricKey: string
  value: number
  unit?: string
}

export interface ActionSurfaceSuggestion {
  actionType: ActionType
  label: string
  weight: number
}

// ─── 4.5 StateProposal ────────────────────────────────────────
export interface StateProposal {
  id: USOM_ID
  intentId: USOM_ID
  targetObject: {
    type: USOMObjectType
    id?: USOM_ID
  }
  action: string
  payload: Record<string, unknown>
  approvedAt: Timestamp
  approvedBy: 'rule_engine'
}

// ─── 4.6 SystemEvent ──────────────────────────────────────────
export type SystemEventType =
  | 'TaskCreated' | 'TaskActivated' | 'TaskScheduled' | 'TaskCompleted' | 'TaskArchived'
  | 'HabitCreated' | 'HabitActivated' | 'HabitSuspended' | 'HabitArchived'
  | 'HabitLogged' | 'HabitSkipped' | 'HabitStreakMilestone'
  | 'TimeboxCreated' | 'TimeboxStarted' | 'TimeboxOvertime' | 'TimeboxEnded' | 'TimeboxCancelled' | 'TimeboxLogged'
  | 'ObjectiveCreated' | 'ObjectiveActivated' | 'ObjectivePaused' | 'ObjectiveResumed'
  | 'ObjectiveCompleted' | 'ObjectiveDiscarded' | 'ObjectiveArchived'
  | 'KeyResultUpdated' | 'KeyResultCompleted' | 'KeyResultProgressUpdated'
  | 'ReviewCreated' | 'ReviewCompleted'
  | 'IntentionCaptured' | 'IntentionDissolved'

export interface SystemEvent {
  id: USOM_ID
  type: SystemEventType
  occurredAt: Timestamp
  triggeredBy: 'state_machine' | 'time_trigger' | 'template_apply'
  payload: Record<string, unknown>
  snapshotId: USOM_ID
}

// ─── 4.7 ActionCandidate ──────────────────────────────────────
export interface ActionCandidate {
  id: USOM_ID
  sourceObjectId: USOM_ID
  sourceObjectType: USOMObjectType
  label: string
  subLabel?: string
  actionType: ActionType
  targetRoute?: string
  category: ActionCategory
  weight: number
  expiresAt?: Timestamp
}

// ─── 4.8 ExternalEvent (MVP stub) ─────────────────────────────
export interface ExternalEvent {
  id: USOM_ID
  source: string
  sourceType: ExternalSourceType
  rawPayload: Record<string, unknown>
  mappedTo: SystemEventType
  receivedAt: Timestamp
  processedAt?: Timestamp
}

// ─── External Payload (for onOutboundRequest) ──────────────────
export interface ExternalPayload {
  [key: string]: unknown
}

// ─── Action Surface Snapshot (for persistence) ─────────────────
export interface ActionSurface {
  id: USOM_ID
  userId: USOM_ID
  snapshotId: USOM_ID
  generatedAt: Timestamp
  guide: ActionCandidate[]
  tiles: ActionCandidate[]
  cues: ActionCandidate[]
}

// ─── Energy Log (for energy_logs table) ────────────────────────
export interface EnergyLog {
  id: USOM_ID
  userId: USOM_ID
  level: number // 1-10
  source: 'user' | 'system'
  context: Record<string, unknown>
  loggedAt: Timestamp
}
