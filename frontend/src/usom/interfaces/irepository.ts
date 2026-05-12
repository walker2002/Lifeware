// Repository Interfaces — Nexus data access contracts
// All methods use USOM types only (R-02). No Drizzle types exposed.
// All methods filter by userId (T-02). Nexus components do not see userId (T-03).

import type { USOM_ID, Timestamp, DateOnly, ObjectiveStatus, KeyResultStatus, Priority, EnergyLevel, ProjectStatus } from '../types/primitives'
import type {
  User, UserCalibration, Intention, StructuredIntent,
  Objective, KeyResult, Task, Habit, HabitLog, Timebox, Review,
  HabitTemplate, TemplateHabitItem,
  Project, ProjectTemplate, TaskTemplate,
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
  findByProject(projectId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findIndependent(userId: USOM_ID): Promise<Task[]>
  findAll(userId: USOM_ID): Promise<Task[]>
  findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]>
  save(task: Task, userId: USOM_ID): Promise<void>
  updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task>
  bulkCreate(tasks: CreateTaskInput[], userId: USOM_ID): Promise<Task[]>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration: number
  projectId?: USOM_ID
  parentId?: USOM_ID
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]
  startDate?: DateOnly
  endDate?: DateOnly
}

// ─── Project ─────────────────────────────────────────────────────
export interface IProjectRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Project | null>
  findByUserId(userId: USOM_ID, filters?: ProjectFilters): Promise<Project[]>
  findByStatus(status: ProjectStatus, userId: USOM_ID): Promise<Project[]>
  create(input: CreateProjectInput, userId: USOM_ID): Promise<Project>
  update(id: USOM_ID, input: UpdateProjectInput, userId: USOM_ID): Promise<Project>
  updateStatus(id: USOM_ID, status: ProjectStatus, userId: USOM_ID): Promise<Project>
  saveAsTemplate(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

export interface ProjectFilters {
  status?: ProjectStatus | ProjectStatus[]
}

export interface CreateProjectInput {
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: Priority
  color?: string
  tags?: string[]
}

export type UpdateProjectInput = Partial<CreateProjectInput>

// ─── TaskTemplate ────────────────────────────────────────────────
export interface ITaskTemplateRepository {
  findProjectTemplateById(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate | null>
  findProjectTemplates(userId: USOM_ID): Promise<ProjectTemplate[]>
  findTasksByProject(projectTemplateId: USOM_ID): Promise<TaskTemplate[]>
  saveProjectTemplate(template: ProjectTemplate, userId: USOM_ID): Promise<void>
  saveTaskTemplate(template: TaskTemplate): Promise<void>
  createFromTemplate(projectTemplateId: USOM_ID, dates: { startDate?: DateOnly; endDate?: DateOnly }, userId: USOM_ID): Promise<Project>
  deleteProjectTemplate(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Habit ─────────────────────────────────────────────────────
export interface HabitReferenceInfo {
  habitLogs: number
  templateHabits: number
  timeboxHabits: number
  hasReferences: boolean
}

export interface IHabitRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null>
  findByUserId(userId: USOM_ID, filters?: HabitFilters): Promise<Habit[]>
  findActive(userId: USOM_ID): Promise<Habit[]>
  findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]>
  create(data: CreateHabitInput, userId: USOM_ID): Promise<Habit>
  update(id: USOM_ID, data: UpdateHabitInput, userId: USOM_ID): Promise<Habit>
  updateStatus(id: USOM_ID, status: Habit['status'], userId: USOM_ID): Promise<Habit>
  save(habit: Habit, userId: USOM_ID): Promise<void>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
  checkReferences(id: USOM_ID, userId: USOM_ID): Promise<HabitReferenceInfo>
  calculateStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number>
  calculateLongestStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number>
  calculateCompletion7d(habitId: USOM_ID, userId: USOM_ID): Promise<number>
  updateMetrics(habitId: USOM_ID, userId: USOM_ID, metrics: { streak: number; longestStreak: number; completionRate7d: number }): Promise<void>
}

export interface HabitFilters {
  status?: Habit['status']
  trackable?: boolean
}

export interface CreateHabitInput {
  title: string
  description?: string
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  trackable: boolean
  frequencyType: HabitFrequency['type']
  daysOfWeek?: number[]
  startDate: DateOnly
  endDate?: DateOnly
  keyResultId?: USOM_ID
  tags?: string[]
}

export type UpdateHabitInput = Partial<CreateHabitInput>

// ─── HabitTemplate ─────────────────────────────────────────────
export interface IHabitTemplateRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<HabitTemplate | null>
  findByUserId(userId: USOM_ID): Promise<HabitTemplate[]>
  create(data: CreateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>
  update(id: USOM_ID, data: UpdateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
  addHabit(templateId: USOM_ID, habitId: USOM_ID, overrides: TemplateHabitOverrides | undefined, userId: USOM_ID): Promise<void>
  removeHabit(templateId: USOM_ID, habitId: USOM_ID, userId: USOM_ID): Promise<void>
}

export interface CreateTemplateInput {
  name: string
  description?: string
  icon?: string
  applicableDays: number[]
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>

export interface TemplateHabitOverrides {
  sortOrder?: number
  timeOverride?: string
  durationOverride?: number
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
export type ObjectiveWithKR = Objective & { keyResults: KeyResult[] }

export interface IObjectiveRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null>
  findAll(userId: USOM_ID): Promise<Objective[]>
  findActive(userId: USOM_ID): Promise<Objective[]>
  findByStatus(status: ObjectiveStatus, userId: USOM_ID): Promise<Objective[]>
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]>
  findByStatusInPeriod(status: ObjectiveStatus[], start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]>
  findWithKeyResults(id: USOM_ID, userId: USOM_ID): Promise<ObjectiveWithKR | null>
  save(objective: Objective, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── KeyResult ─────────────────────────────────────────────────
export interface IKeyResultRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null>
  findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]>
  updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID): Promise<KeyResult>
  batchUpdateStatus(objectiveId: USOM_ID, fromStatus: KeyResultStatus, toStatus: KeyResultStatus, userId: USOM_ID): Promise<void>
  deleteDraft(id: USOM_ID, userId: USOM_ID): Promise<void>
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
