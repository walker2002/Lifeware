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
  intentTriggers?: IntentTriggerInfo[]
  viewRoutes?: Record<string, ViewRouteInfo>
}

export interface IntentTriggerInfo {
  action: string
  shortcut?: string
  description: string
}

export interface ViewRouteInfo {
  component: string
  params?: Record<string, unknown>
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
  | 'ProjectCreated' | 'ProjectActivated' | 'ProjectPaused' | 'ProjectResumed'
  | 'ProjectCompleted' | 'ProjectArchived'
  | 'GenerativeContextAssembled' | 'GenerativeHandlerCompleted'
  | 'GenerativeUserConfirmed' | 'GenerativeProposalRejected' | 'GenerativeBatchExecuted'

export interface SystemEvent {
  id: USOM_ID
  type: SystemEventType
  occurredAt: Timestamp
  triggeredBy: 'state_machine' | 'time_trigger' | 'template_apply' | 'context_engine' | 'handler'
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

// ─── 4.9 Context Provider (Generative Path) ──────────────────

export interface ContextProvider {
  provide(query: string, params: Record<string, unknown>): Promise<unknown>
}

export interface ContextCapability {
  id: string
  provider: ContextProvider
  visibility: 'private' | 'planning' | 'system'
  schema: import('zod').ZodSchema
  description?: string
}

// ─── 4.10 Domain Handler (Generative Path) ────────────────────

export interface GenerationRequest {
  intent: StructuredIntent
  contexts: Record<string, unknown>
  sessionId?: string
  sessionHistory?: Array<{ role: string; content: string }>
  reviseTarget?: string
  previousProposals?: GeneratedProposal[]
  tokenBudget?: { totalTokens: number; remainingTokens: number }
}

export interface GeneratedProposal {
  id: string
  action: string
  payload: Record<string, unknown>
  sourceType: 'habit' | 'task' | 'planned' | 'adhoc'
  priority: string
  energyMatch?: {
    required: string
    actual: string
    score: number
  }
}

export interface ProposalSet {
  id: string
  label?: string
  proposals: GeneratedProposal[]
  tags?: string[]
}

export interface Warning {
  code: string
  message: string
  severity: 'info' | 'warn' | 'error'
  affectedProposalIds?: string[]
}

export interface PresentationPayload {
  type: 'markdown' | 'kanban' | 'calendar' | 'timeline' | 'mindmap'
  content: unknown
}

export interface GenerationResult {
  proposalSet: ProposalSet
  alternatives?: ProposalSet[]
  presentation?: PresentationPayload
  warnings?: Warning[]
}

export interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
  onGenerate?(request: GenerationRequest, aiRuntime: import('@/nexus/ai-runtime').AIRuntime): Promise<GenerationResult>
  onQuery?(context: QueryContext, aiRuntime: import('@/nexus/ai-runtime').AIRuntime): Promise<QueryResult>
}

// ─── CN-UI Surface Payload（Query Path 输出用）──────────

export interface CNUISurfacePayload {
  surfaceType: string
  components: Array<{
    type: string
    props: Record<string, unknown>
  }>
  actions: Array<{
    type: string
    label: string
  }>
}

// ─── Query Path 类型 ───────────────────────────────────

/** 查询上下文 — Context Engine 产出，注入到 Handler.onQuery */
export interface QueryContext {
  intent: import('./objects').StructuredIntent
  contexts: Record<string, unknown>
  sessionId?: string
  sessionContext?: SessionQueryContext
}

/** 同 Session 中的历史查询上下文 */
export interface SessionQueryContext {
  priorQueries: PriorQueryEntry[]
}

export interface PriorQueryEntry {
  action: string
  resultSummary: {
    count: number
    objectIds: string[]
    keyMetrics: Record<string, unknown>
  }
  answerText?: string
  cnuiSurfaceType?: string
  timestamp: string
  relevance: number
}

/** 查询结果 — Handler.onQuery 或 Shortcut Path 的输出 */
export type QueryResult =
  | { type: 'text'; content: string }
  | { type: 'cnui'; payload: CNUISurfacePayload }
