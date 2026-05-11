// USOM <-> DB Mapping Functions
// Bidirectional conversion between USOM objects and Drizzle row types.

import type { USOM_ID, Timestamp, DateOnly } from '../../../usom/types/primitives'
import type {
  User, UserCalibration, Intention, StructuredIntent,
  Objective, KeyResult, Task, Habit, HabitFrequency, HabitLog,
  Timebox, Review, ReviewSection, ReviewMetrics,
  HabitTemplate, TemplateHabitItem,
} from '../../../usom/types/objects'
import type {
  ContextSnapshot, SystemEvent, ActionSurface,
  DerivedSignals, EnergyLog,
} from '../../../usom/types/process'
import type { EnergyCurvePoint } from '../../../usom/types/primitives'

// --- Timestamp helpers -------------------------------------------
function toISO(date: Date | null | undefined): Timestamp | undefined {
  if (!date) return undefined
  return date.toISOString() as Timestamp
}

function toISOOrNull(date: Date | null | undefined): Timestamp | null {
  if (!date) return null
  return date.toISOString() as Timestamp
}

function toDate(iso: Timestamp | undefined | null): Date | null {
  if (!iso) return null
  return new Date(iso)
}

// --- User --------------------------------------------------------
type UserRow = { id: string; email: string; createdAt: Date; updatedAt: Date }

export function userRowToUSOM(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
  }
}

export function userUSOMToRow(user: User) {
  return {
    id: user.id,
    email: user.email,
  }
}

// --- Task --------------------------------------------------------
type TaskRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string; description: string | null;
  priority: string; energyRequired: string;
  estimatedDuration: number; actualDuration: number | null;
  keyResultId: string | null; timeboxId: string | null;
  dueDate: string | null;
  tags: string[]; recurrence: unknown;
  notes: string | null;
  createdAt: Date; updatedAt: Date;
  completedAt: Date | null; archivedAt: Date | null;
}

export function taskRowToUSOM(row: TaskRow): Task {
  return {
    id: row.id,
    status: row.status as Task['status'],
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as Task['priority'],
    energyRequired: row.energyRequired as Task['energyRequired'],
    estimatedDuration: row.estimatedDuration,
    actualDuration: row.actualDuration ?? undefined,
    keyResultId: row.keyResultId ?? undefined,
    timeboxId: row.timeboxId ?? undefined,
    tags: row.tags ?? [],
    dueDate: (row.dueDate as DateOnly) ?? undefined,
    recurrence: row.recurrence as Task['recurrence'],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    completedAt: toISO(row.completedAt),
    archivedAt: toISO(row.archivedAt),
    notes: row.notes ?? undefined,
  }
}

export function taskUSOMToRow(task: Task, userId: USOM_ID) {
  return {
    id: task.id,
    userId: userId,
    status: task.status,
    title: task.title,
    description: task.description ?? null,
    priority: task.priority,
    energyRequired: task.energyRequired,
    estimatedDuration: task.estimatedDuration,
    actualDuration: task.actualDuration ?? null,
    keyResultId: task.keyResultId ?? null,
    timeboxId: task.timeboxId ?? null,
    dueDate: task.dueDate ?? null,
    tags: task.tags,
    recurrence: task.recurrence ?? null,
    notes: task.notes ?? null,
    completedAt: toDate(task.completedAt),
    archivedAt: toDate(task.archivedAt),
  }
}

// --- Habit -------------------------------------------------------
type HabitRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string; description: string | null;
  frequencyType: string; defaultTime: string;
  earliestTime: string; latestStartTime: string;
  defaultDuration: number; minDuration: number;
  trackable: boolean; keyResultId: string | null;
  streak: number; longestStreak: number; completionRate7d: number;
  startDate: string; endDate: string | null;
  daysOfWeek: number[] | null; tags: string[];
  notes: string | null;
  createdAt: Date; updatedAt: Date;
  suspendedAt: Date | null; archivedAt: Date | null;
}

export function habitRowToUSOM(row: HabitRow): Habit {
  return {
    id: row.id,
    status: row.status as Habit['status'],
    title: row.title,
    description: row.description ?? undefined,
    frequency: {
      type: row.frequencyType as HabitFrequency['type'],
      daysOfWeek: row.daysOfWeek ?? undefined,
    },
    defaultTime: row.defaultTime,
    earliestTime: row.earliestTime,
    latestStartTime: row.latestStartTime,
    defaultDuration: row.defaultDuration,
    minDuration: row.minDuration,
    trackable: row.trackable,
    startDate: row.startDate as DateOnly,
    endDate: (row.endDate as DateOnly) ?? undefined,
    keyResultId: row.keyResultId ?? undefined,
    streak: row.streak,
    longestStreak: row.longestStreak,
    completionRate7d: row.completionRate7d,
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    suspendedAt: toISO(row.suspendedAt),
    archivedAt: toISO(row.archivedAt),
    notes: row.notes ?? undefined,
  }
}

export function habitUSOMToRow(habit: Habit, userId: USOM_ID) {
  return {
    id: habit.id,
    userId: userId,
    status: habit.status,
    title: habit.title,
    description: habit.description ?? null,
    frequencyType: habit.frequency.type,
    defaultTime: habit.defaultTime,
    earliestTime: habit.earliestTime,
    latestStartTime: habit.latestStartTime,
    defaultDuration: habit.defaultDuration,
    minDuration: habit.minDuration,
    trackable: habit.trackable,
    keyResultId: habit.keyResultId ?? null,
    streak: habit.streak,
    longestStreak: habit.longestStreak,
    completionRate7d: habit.completionRate7d,
    startDate: habit.startDate,
    endDate: habit.endDate ?? null,
    daysOfWeek: habit.frequency.daysOfWeek ?? null,
    tags: habit.tags,
    notes: habit.notes ?? null,
    suspendedAt: toDate(habit.suspendedAt),
    archivedAt: toDate(habit.archivedAt),
  }
}

// --- HabitLog ----------------------------------------------------
type HabitLogRow = {
  id: string; userId: string; schemaVersion: number;
  habitId: string; date: string; status: string;
  actualDuration: number | null; note: string | null;
  loggedAt: Date; source: string;
}

export function habitLogRowToUSOM(row: HabitLogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habitId,
    date: row.date as DateOnly,
    status: row.status as HabitLog['status'],
    actualDuration: row.actualDuration ?? undefined,
    note: row.note ?? undefined,
    loggedAt: row.loggedAt.toISOString() as Timestamp,
    source: row.source as HabitLog['source'],
  }
}

export function habitLogUSOMToRow(log: HabitLog, userId: USOM_ID) {
  return {
    id: log.id,
    userId: userId,
    habitId: log.habitId,
    date: log.date,
    status: log.status,
    actualDuration: log.actualDuration ?? null,
    note: log.note ?? null,
    source: log.source,
  }
}

// --- HabitTemplate -------------------------------------------------
type HabitTemplateRow = {
  id: string; userId: string; schemaVersion: number;
  name: string; description: string | null;
  icon: string | null; status: string;
  applicableDays: number[];
  createdAt: Date; updatedAt: Date;
}

export function habitTemplateRowToUSOM(row: HabitTemplateRow, habits: TemplateHabitItem[] = []): HabitTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    status: row.status as HabitTemplate['status'],
    applicableDays: row.applicableDays ?? [],
    habits,
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
  }
}

export function habitTemplateUSOMToRow(template: HabitTemplate, userId: USOM_ID) {
  return {
    id: template.id,
    userId: userId,
    name: template.name,
    description: template.description ?? null,
    icon: template.icon ?? null,
    status: template.status,
    applicableDays: template.applicableDays,
  }
}

export function templateHabitItemToRow(
  templateId: USOM_ID,
  item: TemplateHabitItem,
) {
  return {
    templateId,
    habitId: item.habitId,
    sortOrder: item.sortOrder,
    timeOverride: item.timeOverride ?? null,
    durationOverride: item.durationOverride ?? null,
  }
}

export function templateHabitRowToItem(row: { habitId: string; sortOrder: number; timeOverride: string | null; durationOverride: number | null }): TemplateHabitItem {
  return {
    habitId: row.habitId,
    sortOrder: row.sortOrder,
    timeOverride: row.timeOverride ?? undefined,
    durationOverride: row.durationOverride ?? undefined,
  }
}

// --- Timebox (taskIds/habitIds injected by repository via junction queries) ---
type TimeboxRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string;
  startTime: Date; endTime: Date;
  isRecurring: boolean; recurrenceRule: unknown;
  tags: string[]; notes: string | null;
  executionRecord: Record<string, unknown> | null;
  createdAt: Date; updatedAt: Date;
  startedAt: Date | null; overtimeAt: Date | null;
  endedAt: Date | null; loggedAt: Date | null;
}

export function timeboxRowToUSOM(row: TimeboxRow, taskIds: USOM_ID[] = [], habitIds: USOM_ID[] = []): Timebox {
  return {
    id: row.id,
    status: row.status as Timebox['status'],
    title: row.title,
    startTime: row.startTime.toISOString() as Timestamp,
    endTime: row.endTime.toISOString() as Timestamp,
    taskIds,
    habitIds,
    isRecurring: row.isRecurring,
    recurrenceRule: row.recurrenceRule as Timebox['recurrenceRule'],
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    startedAt: toISO(row.startedAt),
    overtimeAt: toISO(row.overtimeAt),
    endedAt: toISO(row.endedAt),
    loggedAt: toISO(row.loggedAt),
    executionRecord: row.executionRecord as unknown as Timebox['executionRecord'] ?? undefined,
    notes: row.notes ?? undefined,
  }
}

export function timeboxUSOMToRow(timebox: Timebox, userId: USOM_ID) {
  return {
    id: timebox.id,
    userId: userId,
    status: timebox.status,
    title: timebox.title,
    startTime: toDate(timebox.startTime)!,
    endTime: toDate(timebox.endTime)!,
    isRecurring: timebox.isRecurring,
    recurrenceRule: timebox.recurrenceRule ?? null,
    tags: timebox.tags,
    notes: timebox.notes ?? null,
    executionRecord: timebox.executionRecord as unknown as Record<string, unknown> | null ?? null,
    startedAt: toDate(timebox.startedAt),
    overtimeAt: toDate(timebox.overtimeAt),
    endedAt: toDate(timebox.endedAt),
    loggedAt: toDate(timebox.loggedAt),
  }
}

// --- Objective (keyResultIds injected by repository) -------------
type ObjectiveRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string; description: string | null;
  periodType: string; periodStart: string; periodEnd: string;
  parentId: string | null; okrType: string; tags: string[];
  objectiveNumber: string | null; priority: string;
  createdAt: Date; updatedAt: Date;
  discardedAt: Date | null; completedAt: Date | null; archivedAt: Date | null;
}

export function objectiveRowToUSOM(row: ObjectiveRow, keyResultIds: USOM_ID[] = []): Objective {
  return {
    id: row.id,
    status: row.status as Objective['status'],
    title: row.title,
    description: row.description ?? undefined,
    period: {
      type: row.periodType as Objective['period']['type'],
      start: row.periodStart as DateOnly,
      end: row.periodEnd as DateOnly,
    },
    parentId: row.parentId ?? undefined,
    keyResultIds,
    okrType: row.okrType as 'visionary' | 'committed',
    objectiveNumber: row.objectiveNumber ?? '',
    priority: row.priority as Objective['priority'],
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    discardedAt: toISO(row.discardedAt),
    completedAt: toISO(row.completedAt),
    archivedAt: toISO(row.archivedAt),
  }
}

export function objectiveUSOMToRow(objective: Objective, userId: USOM_ID) {
  return {
    id: objective.id,
    userId: userId,
    status: objective.status,
    title: objective.title,
    description: objective.description ?? null,
    periodType: objective.period.type,
    periodStart: objective.period.start,
    periodEnd: objective.period.end,
    parentId: objective.parentId ?? null,
    okrType: objective.okrType,
    objectiveNumber: objective.objectiveNumber || null,
    priority: objective.priority,
    tags: objective.tags,
    discardedAt: toDate(objective.discardedAt),
    completedAt: toDate(objective.completedAt),
    archivedAt: toDate(objective.archivedAt),
  }
}

// --- KeyResult ---------------------------------------------------
type KeyResultRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; objectiveId: string;
  title: string; description: string | null;
  targetValue: string; currentValue: string;
  unit: string; progressRate: string;
  dueDate: string | null;
  createdAt: Date; updatedAt: Date;
  discardedAt: Date | null; completedAt: Date | null; archivedAt: Date | null;
}

export function keyResultRowToUSOM(row: KeyResultRow): KeyResult {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    title: row.title,
    description: row.description ?? undefined,
    targetValue: Number(row.targetValue),
    currentValue: Number(row.currentValue),
    unit: row.unit,
    progressRate: Number(row.progressRate),
    status: row.status as KeyResult['status'],
    dueDate: (row.dueDate as DateOnly) ?? undefined,
    discardedAt: toISO(row.discardedAt),
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
  }
}

export function keyResultUSOMToRow(kr: KeyResult, userId: USOM_ID) {
  return {
    id: kr.id,
    userId: userId,
    status: kr.status,
    objectiveId: kr.objectiveId,
    title: kr.title,
    description: kr.description ?? null,
    targetValue: String(kr.targetValue),
    currentValue: String(kr.currentValue),
    unit: kr.unit,
    progressRate: String(kr.progressRate),
    dueDate: kr.dueDate ?? null,
    discardedAt: toDate(kr.discardedAt),
  }
}

// --- Intention ---------------------------------------------------
type IntentionRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; rawInput: string; inputMode: string;
  sourceSnapshotId: string | null; notes: string | null;
  capturedAt: Date; dissolvedAt: Date | null;
}

export function intentionRowToUSOM(row: IntentionRow): Intention {
  return {
    id: row.id,
    status: row.status as Intention['status'],
    rawInput: row.rawInput,
    inputMode: row.inputMode as Intention['inputMode'],
    capturedAt: row.capturedAt.toISOString() as Timestamp,
    dissolvedAt: toISO(row.dissolvedAt),
    sourceSnapshotId: row.sourceSnapshotId ?? undefined,
    notes: row.notes ?? undefined,
  }
}

export function intentionUSOMToRow(intention: Intention, userId: USOM_ID) {
  return {
    id: intention.id,
    userId: userId,
    status: intention.status,
    rawInput: intention.rawInput,
    inputMode: intention.inputMode,
    sourceSnapshotId: intention.sourceSnapshotId ?? null,
    notes: intention.notes ?? null,
    dissolvedAt: toDate(intention.dissolvedAt),
  }
}

// --- StructuredIntent --------------------------------------------
type StructuredIntentRow = {
  id: string; userId: string; schemaVersion: number;
  intentionId: string; targetDomain: string; action: string;
  fields: Record<string, unknown>; confidence: number;
  resolvedBy: string; createdAt: Date;
}

export function structuredIntentRowToUSOM(row: StructuredIntentRow): StructuredIntent {
  return {
    id: row.id,
    intentionId: row.intentionId,
    targetDomain: row.targetDomain,
    action: row.action,
    fields: row.fields,
    confidence: row.confidence,
    resolvedBy: row.resolvedBy as StructuredIntent['resolvedBy'],
    createdAt: row.createdAt.toISOString() as Timestamp,
  }
}

export function structuredIntentUSOMToRow(si: StructuredIntent, userId: USOM_ID) {
  return {
    id: si.id,
    userId: userId,
    intentionId: si.intentionId,
    targetDomain: si.targetDomain,
    action: si.action,
    fields: si.fields,
    confidence: si.confidence,
    resolvedBy: si.resolvedBy,
  }
}

// --- Review ------------------------------------------------------
type ReviewRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; type: string;
  periodStart: string; periodEnd: string;
  generatedBy: string;
  sections: ReviewSection[]; metrics: ReviewMetrics;
  createdAt: Date; updatedAt: Date;
  completedAt: Date | null; archivedAt: Date | null;
}

export function reviewRowToUSOM(row: ReviewRow): Review {
  return {
    id: row.id,
    status: row.status as Review['status'],
    type: row.type as Review['type'],
    periodStart: row.periodStart as DateOnly,
    periodEnd: row.periodEnd as DateOnly,
    generatedBy: row.generatedBy as Review['generatedBy'],
    sections: row.sections ?? [],
    metrics: row.metrics ?? {} as ReviewMetrics,
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    completedAt: toISO(row.completedAt),
    archivedAt: toISO(row.archivedAt),
  }
}

export function reviewUSOMToRow(review: Review, userId: USOM_ID) {
  return {
    id: review.id,
    userId: userId,
    status: review.status,
    type: review.type,
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    generatedBy: review.generatedBy,
    sections: review.sections,
    metrics: review.metrics,
    completedAt: toDate(review.completedAt),
    archivedAt: toDate(review.archivedAt),
  }
}

// --- UserCalibration ---------------------------------------------
type UserCalibrationRow = {
  id: string; userId: string;
  afternoonStart: number; eveningStart: number; nightStart: number;
  peakEnergyStart: number; peakEnergyEnd: number; energyConfidence: number;
  chronotype: string; energySensitivity: string;
  baselineCurve: EnergyCurvePoint[];
  comfortableWipLimit: number; sustainableDeepWorkHours: number;
  habitRiskDays: number[]; habitPreferredTimeSlots: string[];
  ruleOverrideHistory: Record<string, unknown>;
  updatedAt: Date; schemaVersion: number;
}

export function userCalibrationRowToUSOM(row: UserCalibrationRow): UserCalibration {
  return {
    userId: row.userId,
    afternoonStart: row.afternoonStart,
    eveningStart: row.eveningStart,
    nightStart: row.nightStart,
    peakEnergyStart: row.peakEnergyStart,
    peakEnergyEnd: row.peakEnergyEnd,
    energyConfidence: row.energyConfidence,
    chronotype: row.chronotype as UserCalibration['chronotype'],
    baselineCurve: row.baselineCurve ?? [],
    sensitivity: row.energySensitivity as UserCalibration['sensitivity'],
    comfortableWipLimit: row.comfortableWipLimit,
    sustainableDeepWorkHours: row.sustainableDeepWorkHours,
    habitRiskDays: row.habitRiskDays ?? [],
    habitPreferredTimeSlots: row.habitPreferredTimeSlots ?? [],
    ruleOverrideHistory: (row.ruleOverrideHistory ?? {}) as Record<string, { ruleKey: string; overrideAt: string; context: string }>,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
  }
}

export function userCalibrationUSOMToRow(cal: UserCalibration) {
  return {
    userId: cal.userId,
    afternoonStart: cal.afternoonStart,
    eveningStart: cal.eveningStart,
    nightStart: cal.nightStart,
    peakEnergyStart: cal.peakEnergyStart,
    peakEnergyEnd: cal.peakEnergyEnd,
    energyConfidence: cal.energyConfidence,
    chronotype: cal.chronotype,
    energySensitivity: cal.sensitivity,
    baselineCurve: cal.baselineCurve,
    comfortableWipLimit: cal.comfortableWipLimit,
    sustainableDeepWorkHours: cal.sustainableDeepWorkHours,
    habitRiskDays: cal.habitRiskDays,
    habitPreferredTimeSlots: cal.habitPreferredTimeSlots,
    ruleOverrideHistory: cal.ruleOverrideHistory,
  }
}

// --- SystemEvent -------------------------------------------------
type SystemEventRow = {
  id: string; userId: string; schemaVersion: number;
  type: string; occurredAt: Date; triggeredBy: string;
  snapshotId: string | null; payload: Record<string, unknown>;
  processed: boolean; processedAt: Date | null;
}

export function systemEventRowToUSOM(row: SystemEventRow): SystemEvent {
  return {
    id: row.id,
    type: row.type as SystemEvent['type'],
    occurredAt: row.occurredAt.toISOString() as Timestamp,
    triggeredBy: row.triggeredBy as SystemEvent['triggeredBy'],
    payload: row.payload,
    snapshotId: row.snapshotId ?? ('' as USOM_ID),
  }
}

export function systemEventUSOMToRow(event: SystemEvent, userId: USOM_ID) {
  return {
    userId: userId,
    type: event.type,
    triggeredBy: event.triggeredBy,
    snapshotId: event.snapshotId || null,
    payload: event.payload,
  }
}

// --- ContextSnapshot ---------------------------------------------
export function contextSnapshotToRow(snapshot: ContextSnapshot, userId: USOM_ID) {
  return {
    userId: userId,
    generatedBy: snapshot.generatedBy,
    currentTime: new Date(snapshot.currentTime),
    currentDate: snapshot.currentDate,
    dayOfWeek: snapshot.dayOfWeek,
    timeOfDay: snapshot.timeOfDay,
    energyState: snapshot.energyState as unknown as Record<string, unknown>,
    activeObjectives: snapshot.activeObjectives as unknown[],
    activeKeyResults: snapshot.activeKeyResults as unknown[],
    activeTasks: snapshot.activeTasks as unknown[],
    pendingHabits: snapshot.pendingHabits as unknown[],
    currentTimebox: snapshot.currentTimebox as unknown ?? null,
    upcomingTimeboxes: snapshot.upcomingTimeboxes as unknown[],
    pendingIntentions: snapshot.pendingIntentions as unknown[],
  }
}

// --- DerivedSignals ----------------------------------------------
type DerivedSignalsRow = {
  id: string; userId: string;
  energyPattern: { peakHours: number[]; lowHours: number[]; confidence: number } | null;
  activeTaskCount: number; avgCompletionRate7d: number; avgCompletionRate30d: number;
  habitStreaks: Record<string, number>; habitCompletionRates: Record<string, number>;
  timeboxAdherence7d: number; isOvercommitted: boolean;
  computedAt: Date; dataWindowDays: number; schemaVersion: number;
}

export function derivedSignalsRowToUSOM(row: DerivedSignalsRow): DerivedSignals {
  return {
    userId: row.userId,
    energyPattern: row.energyPattern,
    activeTaskCount: row.activeTaskCount,
    avgCompletionRate7d: row.avgCompletionRate7d,
    avgCompletionRate30d: row.avgCompletionRate30d,
    habitStreaks: row.habitStreaks ?? {},
    habitCompletionRates: row.habitCompletionRates ?? {},
    timeboxAdherence7d: row.timeboxAdherence7d,
    isOvercommitted: row.isOvercommitted,
    computedAt: row.computedAt.toISOString() as Timestamp,
    dataWindowDays: row.dataWindowDays,
  }
}

export function derivedSignalsUSOMToRow(signals: DerivedSignals, userId: USOM_ID) {
  return {
    userId: userId,
    energyPattern: signals.energyPattern,
    activeTaskCount: signals.activeTaskCount,
    avgCompletionRate7d: signals.avgCompletionRate7d,
    avgCompletionRate30d: signals.avgCompletionRate30d,
    habitStreaks: signals.habitStreaks,
    habitCompletionRates: signals.habitCompletionRates,
    timeboxAdherence7d: signals.timeboxAdherence7d,
    isOvercommitted: signals.isOvercommitted,
    dataWindowDays: signals.dataWindowDays,
  }
}

// --- ActionSurface -----------------------------------------------
export function actionSurfaceToRow(surface: ActionSurface, userId: USOM_ID) {
  return {
    userId: userId,
    snapshotId: surface.snapshotId,
    guide: surface.guide as unknown[],
    tiles: surface.tiles as unknown[],
    cues: surface.cues as unknown[],
  }
}

// --- EnergyLog ---------------------------------------------------
export function energyLogToRow(log: EnergyLog, userId: USOM_ID) {
  return {
    userId: userId,
    level: log.level,
    source: log.source,
    context: log.context,
  }
}
