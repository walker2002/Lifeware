// Drizzle Schema — Lifeware Database
// Source: docs/database-design.md
// All tables follow the Repository Pattern (R-01~R-04) and Multi-Tenancy (T-01~T-04)

import {
  pgTable, uuid, text, integer, boolean, timestamp, date,
  jsonb, real, numeric, uniqueIndex, index,
  check, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LLMConfig } from '../../usom/types/objects'
import type { EnergyCurve } from '../../usom/types/primitives'
import type { EnergyCost, ActivityLabel } from '../../usom/activity-archetype/types'

// ─── 3.1 users ─────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── 3.2 user_calibration (one row per user) ──────────────────
export const userCalibration = pgTable('user_calibration', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  afternoonStart: integer('afternoon_start').notNull().default(12),
  eveningStart: integer('evening_start').notNull().default(18),
  nightStart: integer('night_start').notNull().default(22),

  peakEnergyStart: integer('peak_energy_start').notNull().default(9),
  peakEnergyEnd: integer('peak_energy_end').notNull().default(12),
  energyConfidence: real('energy_confidence').notNull().default(0),

  chronotype: text('chronotype', { enum: ['morning_lark', 'night_owl', 'intermediate'] }).notNull().default('intermediate'),
  energySensitivity: text('energy_sensitivity', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  baselineCurve: jsonb('baseline_curve').notNull().$type<Array<{ hour: number; baseline: number }>>().default([]),

  comfortableWipLimit: integer('comfortable_wip_limit').notNull().default(5),
  sustainableDeepWorkHours: real('sustainable_deep_work_hours').notNull().default(4),

  habitRiskDays: jsonb('habit_risk_days').notNull().$type<number[]>().default([]),
  habitPreferredTimeSlots: jsonb('habit_preferred_time_slots').notNull().$type<string[]>().default([]),
  ruleOverrideHistory: jsonb('rule_override_history').notNull().$type<Record<string, unknown>>().default({}),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (table) => [
  uniqueIndex('uniq_user_calibration_user').on(table.userId),
])

// ─── 3.3 energy_logs ──────────────────────────────────────────
export const energyLogs = pgTable('energy_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: integer('level').notNull(),
  source: text('source', { enum: ['user', 'system'] }).notNull(),
  context: jsonb('context').notNull().$type<Record<string, unknown>>().default({}),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (table) => [
  check('check_energy_logs_level', sql`${table.level} >= 1 AND ${table.level} <= 10`),
  index('idx_energy_logs_user_logged').on(table.userId, table.loggedAt),
])

// ─── 4.0 cycles ───────────────────────────────────────────────
// 周期表：承载 OKR 周期元数据（annual/quarterly/monthly/semi_annual/custom）。
// objectives.cycle_id NOT NULL 外键，[022] 1C T17 已完成 period 列 DROP + SET NOT NULL。
export const cycles = pgTable('cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  cycleType: text('cycle_type', { enum: ['annual', 'quarterly', 'monthly', 'semi_annual', 'custom'] }).notNull(),
  name: text('name').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: text('status', { enum: ['draft', 'not_started', 'in_progress', 'ended', 'reviewed'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (table) => [
  check('check_cycles_period_end_after_start', sql`${table.periodEnd} > ${table.periodStart}`),
  index('idx_cycles_user_status').on(table.userId, table.status),
  index('idx_cycles_period').on(table.userId, table.periodStart, table.periodEnd),
  uniqueIndex('uq_cycles_user_period').on(table.userId, table.periodStart, table.periodEnd),
])

// ─── 4.1 objectives ───────────────────────────────────────────
export const objectives = pgTable('objectives', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['draft', 'active', 'paused', 'completed', 'discarded', 'archived'] }).notNull(),
  title: text('title').notNull(),
  description: text('description'),

  parentId: uuid('parent_id'),
  // [022] 1C T17：cycle_id SET NOT NULL，period 列已 DROP，周期信息统一由 cycles 表承载
  cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'restrict' }),

  okrType: text('okr_type').notNull().default('committed'),
  objectiveNumber: text('objective_number'),
  priority: text('priority').notNull().default('P1'),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  discardedAt: timestamp('discarded_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_objectives_user_status').on(table.userId, table.status),
  index('idx_objectives_cycle').on(table.userId, table.cycleId),
  index('idx_objectives_parent').on(table.parentId),
])

// ─── 4.2 key_results ──────────────────────────────────────────
export const keyResults = pgTable('key_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['draft', 'active', 'paused', 'completed', 'discarded', 'archived'] }).notNull(),
  objectiveId: uuid('objective_id').notNull().references(() => objectives.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),

  targetValue: numeric('target_value', { precision: 10, scale: 2 }).notNull(),
  currentValue: numeric('current_value', { precision: 10, scale: 2 }).notNull().default('0'),
  unit: text('unit').notNull(),
  progressRate: numeric('progress_rate', { precision: 10, scale: 4 }).notNull().default('0'),

  // [024] G2：达成信心度（0-100），默认 50；由 T1 migration 0021 加列
  confidence: integer('confidence').notNull().default(50),

  dueDate: date('due_date'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  discardedAt: timestamp('discarded_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  check('check_key_results_target_positive', sql`${table.targetValue} > 0`),
  check('check_key_results_current_within_target', sql`${table.currentValue} >= 0 AND ${table.currentValue} <= ${table.targetValue}`),
  check('check_key_results_confidence_range', sql`${table.confidence} BETWEEN 0 AND 100`),
  index('idx_key_results_user_status').on(table.userId, table.status),
  index('idx_key_results_objective').on(table.objectiveId),
  index('idx_key_results_due_date').on(table.userId, table.dueDate),
])

// ─── 4.2b contributions（KR 贡献记录）─────────────────────────────
export const contributions = pgTable('contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  keyResultId: uuid('key_result_id').notNull().references(() => keyResults.id, { onDelete: 'cascade' }),
  contributorType: text('contributor_type', { enum: ['task', 'habit', 'manual'] }).notNull(),
  contributorId: uuid('contributor_id').notNull(),
  delta: numeric('delta', { precision: 10, scale: 2 }),
  weight: numeric('weight', { precision: 3, scale: 2 }).default('1.0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_contributions_kr_source').on(table.keyResultId, table.contributorType, table.contributorId),
  index('idx_contributions_kr').on(table.userId, table.keyResultId),
  index('idx_contributions_source').on(table.contributorType, table.contributorId),
])

// ─── 4.3 threads（主线）──────────────────────────────────────────
export const threads = pgTable('threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  status: text('status', { enum: ['active', 'paused', 'completed', 'archived'] }).notNull(),

  startDate: date('start_date'),
  endDate: date('end_date'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_threads_user_status').on(table.userId, table.status),
  index('idx_threads_user_start').on(table.userId, table.startDate),
])

// ─── 4.4 tasks（重构后）──────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  // 层级关联
  parentId: uuid('parent_id').references((): any => tasks.id, { onDelete: 'set null' }),
  threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'set null' }),

  // 执行轴状态
  status: text('status', { enum: ['todo', 'planned', 'in_progress', 'completed', 'archived', 'deleted'] }).notNull(),

  // 核心字段
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull(),
  energyRequired: text('energy_required', { enum: ['high', 'medium', 'low'] }).notNull(),
  estimatedDuration: integer('estimated_duration'),
  actualDuration: integer('actual_duration'),

  dueDate: date('due_date'),
  startDate: date('start_date'),
  endDate: date('end_date'),

  // 周期性（有限次）
  recurrence: jsonb('recurrence').$type<{ frequency: string; interval: number; endDate?: string }>(),

  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),

  // ── AI 维护标签 ──
  clarity: text('clarity', { enum: ['fuzzy', 'scoped', 'actionable'] }).notNull().default('fuzzy'),
  complexity: jsonb('complexity').notNull().$type<string[]>().default([]),
  decomposition: text('decomposition', { enum: ['atomic', 'splittable', 'splitting_in_progress', 'decomposed'] }),

  // ── 用户管理标签 ──
  captureMode: text('capture_mode', { enum: ['scheduled', 'ad_hoc', 'retrospective'] }).notNull().default('ad_hoc'),
  energyProfile: text('energy_profile', { enum: ['light', 'deep', 'admin', 'creative', 'reactive'] }),
  schedulingConstraint: text('scheduling_constraint', { enum: ['hard_deadline', 'soft_target', 'opportunistic', 'recurring'] }),
  tracking: text('tracking', { enum: ['none', 'check_in', 'log', 'review'] }).notNull().default('check_in'),

  // AI 辅助扩展数据
  aiTags: jsonb('ai_tags').notNull().$type<Record<string, unknown>>().default({}),

  // AI 辅助占位字段（未来功能）
  acceptanceCriteria: text('acceptance_criteria'),
  expectedOutput: text('expected_output'),
}, (table) => [
  index('idx_tasks_user_status').on(table.userId, table.status),
  index('idx_tasks_user_clarity').on(table.userId, table.clarity),
  index('idx_tasks_user_parent').on(table.userId, table.parentId),
  index('idx_tasks_user_thread').on(table.userId, table.threadId),
  index('idx_tasks_user_priority').on(table.userId, table.priority),
  index('idx_tasks_user_energy').on(table.userId, table.energyProfile),
  index('idx_tasks_user_constraint').on(table.userId, table.schedulingConstraint),
  index('idx_tasks_user_tracking').on(table.userId, table.tracking),
  index('idx_tasks_due_date').on(table.userId, table.dueDate),
  check('check_tasks_dates', sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
])

// ─── 4.4 habits ───────────────────────────────────────────────
export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['draft', 'active', 'suspended', 'archived', 'deleted'] }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  frequencyType: text('frequency_type', { enum: ['daily', 'weekly', 'custom'] }).notNull(),
  defaultTime: text('default_time').notNull(),
  earliestTime: text('earliest_time').notNull(),
  latestStartTime: text('latest_start_time').notNull(),
  defaultDuration: integer('default_duration').notNull(),
  minDuration: integer('min_duration').notNull(),
  trackable: boolean('trackable').notNull().default(true),

  streak: integer('streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  completionRate7d: real('completion_rate_7d').notNull().default(0),

  startDate: date('start_date').notNull(),
  endDate: date('end_date'),

  daysOfWeek: jsonb('days_of_week').$type<number[] | null>(),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_habits_user_status').on(table.userId, table.status),
  index('idx_habits_start_date').on(table.userId, table.startDate),
])

// ─── 4.5 habit_logs ───────────────────────────────────────────
export const habitLogs = pgTable('habit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  completionStatus: text('completion_status', { enum: ['completed', 'partially_completed', 'not_completed'] }).notNull(),
  actualDuration: integer('actual_duration'),
  plannedDuration: integer('planned_duration'),
  deviationMinutes: integer('deviation_minutes'),
  completionRating: integer('completion_rating'),
  energyLevel: integer('energy_level'),

  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['manual', 'connector', 'timebox_sync'] }).notNull().default('manual'),
}, (table) => [
  uniqueIndex('uniq_habit_logs_habit_date').on(table.habitId, table.date),
  index('idx_habit_logs_user_date').on(table.userId, table.date),
  index('idx_habit_logs_habit_id').on(table.habitId),
])

// ─── 4.5c task_execution_logs ─────────────────────────────────
export const taskExecutionLogs = pgTable('task_execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  timeboxId: uuid('timebox_id').references(() => timeboxes.id, { onDelete: 'set null' }),
  completionStatus: text('completion_status', { enum: ['completed', 'partially_completed', 'not_completed'] }).notNull(),
  actualDuration: integer('actual_duration'),
  plannedDuration: integer('planned_duration'),
  deviationMinutes: integer('deviation_minutes'),
  completionRating: integer('completion_rating'),
  actualOutput: text('actual_output'),
  deviationReasons: text('deviation_reasons'),
  energyLevel: integer('energy_level'),
  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['manual', 'timebox_sync'] }).notNull().default('manual'),
}, (table) => [
  index('idx_task_exec_logs_user_task').on(table.userId, table.taskId),
  index('idx_task_exec_logs_timebox').on(table.timeboxId),
  index('idx_task_exec_logs_user_logged').on(table.userId, table.loggedAt),
])

// ─── 4.5a habit_templates ──────────────────────────────────────
export const habitTemplates = pgTable('habit_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  status: text('status', { enum: ['draft', 'active'] }).notNull().default('draft'),
  applicableDays: jsonb('applicable_days').notNull().$type<number[]>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_habit_templates_user_status').on(table.userId, table.status),
])

// ─── 4.5b template_habits ──────────────────────────────────────
export const templateHabits = pgTable('template_habits', {
  templateId: uuid('template_id').notNull().references(() => habitTemplates.id, { onDelete: 'cascade' }),
  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
  timeOverride: text('time_override'),
  durationOverride: integer('duration_override'),
}, (table) => [
  primaryKey({ columns: [table.templateId, table.habitId] }),
])

// ─── 4.6 timeboxes ────────────────────────────────────────────
export const timeboxes = pgTable('timeboxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'] }).notNull(),
  title: text('title').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false),

  recurrenceRule: jsonb('recurrence_rule').$type<{ frequency: string; interval: number; endDate?: string }>(),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),

  // [023] A2: 关联 Activity Archetype（nullable，ON DELETE SET NULL）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),
  // [023] A2 OV#P1-#2: USOM 类型已声明 taskIds/habitIds，DB 列补齐（D7 LinkPicker 数据落库依赖）
  taskIds: uuid('task_ids').array().notNull().default([]),  // 软关联，无 FK 外键
  habitIds: uuid('habit_ids').array().notNull().default([]), // 软关联，无 FK 外键

  executionRecord: jsonb('execution_record').$type<Record<string, unknown>>(),

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  overtimeAt: timestamp('overtime_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  loggedAt: timestamp('logged_at', { withTimezone: true }),
}, (table) => [
  check('check_timeboxes_end_after_start', sql`${table.endTime} > ${table.startTime}`),
  index('idx_timeboxes_user_status').on(table.userId, table.status),
  index('idx_timeboxes_user_start').on(table.userId, table.startTime),
  index('idx_timeboxes_user_end').on(table.userId, table.endTime),
])

// ─── 4.7 reviews ──────────────────────────────────────────────
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['draft', 'in_progress', 'completed', 'archived'] }).notNull(),
  type: text('type', { enum: ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'] }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  generatedBy: text('generated_by', { enum: ['ai', 'manual'] }).notNull(),

  sections: jsonb('sections').notNull().$type<Array<{ key: string; title: string; content: string }>>().default([]),
  metrics: jsonb('metrics').notNull().$type<{
    tasksCompleted: number; tasksTotal: number;
    habitsCompleted: number; habitsTotal: number;
    timeboxedHours: number; focusScore?: number;
  }>().default({
    tasksCompleted: 0, tasksTotal: 0,
    habitsCompleted: 0, habitsTotal: 0,
    timeboxedHours: 0,
  }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_reviews_user_status').on(table.userId, table.status),
  index('idx_reviews_user_period').on(table.userId, table.periodStart, table.periodEnd),
  index('idx_reviews_user_type').on(table.userId, table.type),
])

// ─── 5.1 timebox_tasks (junction) ─────────────────────────────
export const timeboxTasks = pgTable('timebox_tasks', {
  timeboxId: uuid('timebox_id').notNull().references(() => timeboxes.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.timeboxId, table.taskId] }),
  index('idx_timebox_tasks_task').on(table.taskId),
])

// ─── 5.2 timebox_habits (junction) ────────────────────────────
export const timeboxHabits = pgTable('timebox_habits', {
  timeboxId: uuid('timebox_id').notNull().references(() => timeboxes.id, { onDelete: 'cascade' }),
  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.timeboxId, table.habitId] }),
  index('idx_timebox_habits_habit').on(table.habitId),
])

// ─── 6.1 intentions ───────────────────────────────────────────
export const intentions = pgTable('intentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  status: text('status', { enum: ['captured', 'clarified', 'routed', 'dissolved'] }).notNull(),
  rawInput: text('raw_input').notNull(),
  inputMode: text('input_mode', { enum: ['natural_language', 'template_form', 'slash_command'] }).notNull(),
  sourceSnapshotId: uuid('source_snapshot_id'),

  notes: text('notes'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  dissolvedAt: timestamp('dissolved_at', { withTimezone: true }),
}, (table) => [
  index('idx_intentions_user_status').on(table.userId, table.status),
  index('idx_intentions_captured_at').on(table.userId, table.capturedAt),
])

// ─── 6.2 structured_intents ───────────────────────────────────
export const structuredIntents = pgTable('structured_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  intentionId: uuid('intention_id').notNull().references(() => intentions.id, { onDelete: 'cascade' }),
  targetDomain: text('target_domain').notNull(),
  action: text('action').notNull(),
  fields: jsonb('fields').notNull().$type<Record<string, unknown>>().default({}),
  confidence: real('confidence').notNull(),
  resolvedBy: text('resolved_by', { enum: ['ai', 'template_form'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_structured_intents_user').on(table.userId),
  index('idx_structured_intents_intention').on(table.intentionId),
])

// ─── 6.3 state_proposals (MVP optional) ───────────────────────
export const stateProposals = pgTable('state_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  intentId: uuid('intent_id').notNull().references(() => structuredIntents.id, { onDelete: 'cascade' }),
  targetObjectType: text('target_object_type').notNull(),
  targetObjectId: uuid('target_object_id'),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
  approvedBy: text('approved_by').notNull().default('rule_engine'),
}, (table) => [
  index('idx_state_proposals_user').on(table.userId),
  index('idx_state_proposals_intent').on(table.intentId),
])

// ─── 7.1 context_snapshots ────────────────────────────────────
export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generatedBy: text('generated_by').notNull().default('state_machine'),

  currentTime: timestamp('current_time', { withTimezone: true }).notNull(),
  currentDate: date('current_date').notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  timeOfDay: text('time_of_day', { enum: ['morning', 'afternoon', 'evening', 'night'] }).notNull(),
  energyState: jsonb('energy_state').notNull().$type<Record<string, unknown>>().default({}),

  activeObjectives: jsonb('active_objectives').notNull().$type<unknown[]>().default([]),
  activeKeyResults: jsonb('active_key_results').notNull().$type<unknown[]>().default([]),
  activeTasks: jsonb('active_tasks').notNull().$type<unknown[]>().default([]),
  pendingHabits: jsonb('pending_habits').notNull().$type<unknown[]>().default([]),
  currentTimebox: jsonb('current_timebox').$type<unknown>(),
  upcomingTimeboxes: jsonb('upcoming_timeboxes').notNull().$type<unknown[]>().default([]),
  pendingIntentions: jsonb('pending_intentions').notNull().$type<unknown[]>().default([]),
}, (table) => [
  check('check_context_snapshots_day_of_week', sql`${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6`),
  index('idx_context_snapshots_user_generated').on(table.userId, table.generatedAt),
  index('idx_context_snapshots_user_date').on(table.userId, table.currentDate),
])

// ─── 7.2 system_events (append-only) ──────────────────────────
export const systemEvents = pgTable('system_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  type: text('type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  triggeredBy: text('triggered_by', { enum: ['state_machine', 'time_trigger', 'template_apply', 'context_engine', 'handler'] }).notNull(),
  snapshotId: uuid('snapshot_id').references(() => contextSnapshots.id, { onDelete: 'set null' }),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),

  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  index('idx_system_events_user_occurred').on(table.userId, table.occurredAt),
  index('idx_system_events_user_type').on(table.userId, table.type),
  index('idx_system_events_unprocessed').on(table.userId, table.processed),
])

// ─── 7.3 action_surfaces ──────────────────────────────────────
export const actionSurfaces = pgTable('action_surfaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  snapshotId: uuid('snapshot_id').notNull().references(() => contextSnapshots.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),

  guide: jsonb('guide').notNull().$type<unknown[]>().default([]),
  tiles: jsonb('tiles').notNull().$type<unknown[]>().default([]),
  cues: jsonb('cues').notNull().$type<unknown[]>().default([]),
}, (table) => [
  index('idx_action_surfaces_user').on(table.userId),
  index('idx_action_surfaces_snapshot').on(table.snapshotId),
  index('idx_action_surfaces_generated').on(table.userId, table.generatedAt),
])

// ─── 7.4 derived_signals (one row per user) ───────────────────
export const derivedSignals = pgTable('derived_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // R19 修订：类型复用 `EnergyCurve & { confidence: number }`，与 process.ts:67 同源。
  // 运行时 jsonb 形状不变 `{peakHours, lowHours, confidence}`（A0.1 base 一致），无迁移。
  // 类型用 EnergyCurve 引用而非内联形状——drizzle `$type<>` 与 EnergyCurve 兼容
  // （EnergyCurve interface 不带 readonly 字段，R7 修订）。
  energyPattern: jsonb('energy_pattern').$type<(EnergyCurve & { confidence: number }) | null>(),

  activeTaskCount: integer('active_task_count').notNull().default(0),
  avgCompletionRate7d: real('avg_completion_rate_7d').notNull().default(0),
  avgCompletionRate30d: real('avg_completion_rate_30d').notNull().default(0),

  habitStreaks: jsonb('habit_streaks').notNull().$type<Record<string, number>>().default({}),
  habitCompletionRates: jsonb('habit_completion_rates').notNull().$type<Record<string, number>>().default({}),

  timeboxAdherence7d: real('timebox_adherence_7d').notNull().default(0),
  isOvercommitted: boolean('is_overcommitted').notNull().default(false),

  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  dataWindowDays: integer('data_window_days').notNull().default(30),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (table) => [
  uniqueIndex('uniq_derived_signals_user').on(table.userId),
])

// ─── 8.1 ai_sessions ─────────────────────────────────────────
export const aiSessions = pgTable('ai_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  title: text('title').notNull().default('新对话'),
  status: text('status', { enum: ['created', 'active', 'completing', 'archived', 'deleted', 'closed'] }).notNull().default('created'),
  domainId: text('domain_id'),
  action: text('action'),
  sessionMode: text('session_mode').notNull().default('single_shot'),

  messages: jsonb('messages').notNull().$type<Array<{ role: string; content: string; timestamp: string; intentRef?: string }>>().default([]),
  stateSnapshot: jsonb('state_snapshot').notNull().$type<Record<string, unknown>>().default({}),
  referencedObjectIds: jsonb('referenced_object_ids').notNull().$type<string[]>().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_ai_sessions_user_status').on(table.userId, table.status),
  index('idx_ai_sessions_updated').on(table.userId, table.updatedAt),
])

// ─── 8.1b l1_messages (Memory Framework L1) ─────────────────
export const l1Messages = pgTable('l1_messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:     text('content').notNull(),
  intentRef:   text('intent_ref'),
  cnuiSurface: jsonb('cnui_surface').$type<Record<string, unknown>>(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_l1_messages_session').on(table.sessionId, table.createdAt),
  index('idx_l1_messages_user').on(table.userId),
  index('idx_l1_messages_cleanup').on(table.deletedAt, table.createdAt),
])

// ─── 8.2 user_settings (one row per user) ─────────────────────
export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  llmConfig: jsonb('llm_config').$type<LLMConfig>(),
  uiPrefs: jsonb('ui_prefs').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_user_settings_user').on(table.userId),
])

// ─── 8.3 memory_episodes ──────────────────────────────────────
export const memoryEpisodes = pgTable('memory_episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => aiSessions.id, { onDelete: 'set null' }),
  domainId: text('domain_id'),
  action: text('action'),
  episodeType: text('episode_type').notNull().default('session_summary'),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_memory_episodes_user_created').on(table.userId, table.createdAt),
  index('idx_memory_episodes_session').on(table.sessionId),
])

// ─── 7.5 user_activities (用户行为埋点) ──────────────────────────
export const userActivities = pgTable('user_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  activityType: text('activity_type', {
    enum: ['intent_execute', 'menu_click', 'page_navigate', 'cnui_action']
  }).notNull(),

  source: text('source', {
    enum: ['ai_assistant', 'growth_menu', 'shortcut', 'page_route', 'cnui_surface']
  }).notNull(),

  targetDomain: text('target_domain'),
  targetAction: text('target_action'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_activities_user_time').on(table.userId, table.createdAt),
  index('idx_user_activities_type').on(table.userId, table.activityType, table.createdAt),
])

// ─── 7.6 activity_archetypes (Activity Archetype 跨域共享本体) ──
export const activityArchetypes = pgTable('activity_archetypes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  l1Category: text('l1_category').notNull(),
  l2Name: text('l2_name').notNull(),
  energyCost: jsonb('energy_cost').$type<EnergyCost>().notNull(),
  activityLabel: jsonb('activity_label').$type<ActivityLabel>().notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_activity_archetypes_user_l1').on(table.userId, table.l1Category),
  index('idx_activity_archetypes_user_system').on(table.userId, table.isSystem),
])

// ─── 7.7 user_audit_log (配置变更审计日志，OQ-7) ──────────────
export const userAuditLog = pgTable('user_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id').notNull(),
  action: text('action', { enum: ['create', 'update', 'delete'] }).notNull(),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
  newValues: jsonb('new_values').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_audit_log_user_table').on(table.userId, table.tableName, table.createdAt.desc()),
  index('idx_user_audit_log_user_time').on(table.userId, table.createdAt.desc()),
])
