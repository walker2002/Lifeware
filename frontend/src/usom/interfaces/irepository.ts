// Repository Interfaces — Nexus data access contracts
// All methods use USOM types only (R-02). No Drizzle types exposed.
// All methods filter by userId (T-02). Nexus components do not see userId (T-03).

import type { USOM_ID, Timestamp, DateOnly } from '../types/primitives'
import type {
  User, UserCalibration, Intention, StructuredIntent,
  Objective, KeyResult, Task, Habit, HabitLog, Timebox, Review,
} from '../types/objects'
import type {
  ContextSnapshot, SystemEvent, ActionSurface, DerivedSignals, EnergyLog,
} from '../types/process'
import type { HabitFrequency } from '../types/objects'

// ─── User ──────────────────────────────────────────────────────
export interface IUserRepository {
  findById(id: USOM_ID): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  save(user: User): Promise<void>
}

// ─── UserCalibration ──────────────────────────────────────────
export interface IUserCalibrationRepository {
  findByUserId(userId: USOM_ID): Promise<UserCalibration | null>
  save(calibration: UserCalibration): Promise<void>
  initializeDefaults(userId: USOM_ID): Promise<UserCalibration>
}

// ─── Task ──────────────────────────────────────────────────────
export interface ITaskRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null>
  findByStatus(status: Task['status'], userId: USOM_ID): Promise<Task[]>
  findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findActive(userId: USOM_ID): Promise<Task[]>
  save(task: Task, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Habit ─────────────────────────────────────────────────────
export interface IHabitRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null>
  findActive(userId: USOM_ID): Promise<Habit[]>
  findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]>
  save(habit: Habit, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── HabitLog (immutable fact records) ─────────────────────────
export interface IHabitLogRepository {
  findByHabitAndDate(habitId: USOM_ID, date: DateOnly, userId: USOM_ID): Promise<HabitLog | null>
  findByUserAndDate(date: DateOnly, userId: USOM_ID): Promise<HabitLog[]>
  findByHabit(habitId: USOM_ID, userId: USOM_ID): Promise<HabitLog[]>
  save(log: HabitLog, userId: USOM_ID): Promise<void>
}

// ─── Timebox ───────────────────────────────────────────────────
export interface ITimeboxRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Timebox | null>
  findRunning(userId: USOM_ID): Promise<Timebox[]>
  findByStatus(status: string, userId: USOM_ID): Promise<Timebox[]>
  findUpcoming(userId: USOM_ID, withinHours?: number): Promise<Timebox[]>
  findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID): Promise<Timebox[]>
  save(timebox: Timebox, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID, executionRecord?: import('../types/objects').ExecutionRecord): Promise<void>
}

// ─── Objective ─────────────────────────────────────────────────
export interface IObjectiveRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null>
  findActive(userId: USOM_ID): Promise<Objective[]>
  save(objective: Objective, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── KeyResult ─────────────────────────────────────────────────
export interface IKeyResultRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null>
  findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]>
  save(keyResult: KeyResult, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Intention ─────────────────────────────────────────────────
export interface IIntentionRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Intention | null>
  findByStatus(status: Intention['status'], userId: USOM_ID): Promise<Intention[]>
  save(intention: Intention, userId: USOM_ID): Promise<void>
  dissolve(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── StructuredIntent ──────────────────────────────────────────
export interface IStructuredIntentRepository {
  findByIntention(intentionId: USOM_ID, userId: USOM_ID): Promise<StructuredIntent | null>
  save(structuredIntent: StructuredIntent, userId: USOM_ID): Promise<void>
}

// ─── Review ────────────────────────────────────────────────────
export interface IReviewRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Review | null>
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Review[]>
  findByType(type: Review['type'], userId: USOM_ID): Promise<Review[]>
  save(review: Review, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── SystemEvent (append-only) ─────────────────────────────────
export interface ISystemEventRepository {
  append(event: SystemEvent, userId: USOM_ID): Promise<void>
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<SystemEvent[]>
  findUnprocessed(userId: USOM_ID): Promise<SystemEvent[]>
  markProcessed(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── ContextSnapshot ───────────────────────────────────────────
export interface IContextSnapshotRepository {
  findLatest(userId: USOM_ID): Promise<ContextSnapshot | null>
  save(snapshot: ContextSnapshot, userId: USOM_ID): Promise<void>
}

// ─── ActionSurface ─────────────────────────────────────────────
export interface IActionSurfaceRepository {
  findLatest(userId: USOM_ID): Promise<ActionSurface | null>
  save(surface: ActionSurface, userId: USOM_ID): Promise<void>
}

// ─── DerivedSignals (one row per user) ─────────────────────────
export interface IDerivedSignalsRepository {
  findByUser(userId: USOM_ID): Promise<DerivedSignals | null>
  upsert(signals: DerivedSignals, userId: USOM_ID): Promise<void>
}

// ─── EnergyLog ─────────────────────────────────────────────────
export interface IEnergyLogRepository {
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<EnergyLog[]>
  save(log: EnergyLog, userId: USOM_ID): Promise<void>
}
