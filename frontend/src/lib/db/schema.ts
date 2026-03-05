import { pgTable, serial, text, boolean, timestamp, integer, uuid, jsonb } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';

// USOM Layer - Unified Semantic & Object Model
// These tables define the core objects according to the architecture

// Task Object
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'), // draft, active, scheduled, completed, archived
  priority: text('priority').notNull().default('medium'), // low, medium, high, urgent
  estimatedTime: integer('estimated_time'), // in minutes
  actualTime: integer('actual_time'), // in minutes
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  context: jsonb('context').$type<Record<string, any>>(), // USOM ContextSnapshot
});

// Habit Object
export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'), // draft, active, suspended, archived
  frequency: text('frequency').notNull(), // daily, weekly, monthly, custom
  timeHint: text('time_hint'), // e.g., "morning", "evening"
  duration: integer('duration'), // in minutes
  streak: integer('streak').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  startDate: timestamp('start_date'),
  context: jsonb('context').$type<Record<string, any>>(),
});

// TimeBox Object
export const timeboxes = pgTable('timeboxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planned'), // planned, running, paused, ended, logged
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  duration: integer('duration').notNull(), // in minutes
  taskId: uuid('task_id'),
  habitId: uuid('habit_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  actualStartTime: timestamp('actual_start_time'),
  actualEndTime: timestamp('actual_end_time'),
  context: jsonb('context').$type<Record<string, any>>(),
});

// OKR Object
export const okrs = pgTable('okrs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  period: text('period').notNull(), // e.g., "2026-Q1", "monthly"
  status: text('status').notNull().default('draft'), // draft, active, completed, archived
  progress: integer('progress').default(0), // 0-100 percentage
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  dueDate: timestamp('due_date'),
  context: jsonb('context').$type<Record<string, any>>(),
});

// KeyResult Object (belongs to OKR)
export const keyResults = pgTable('key_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  okrId: uuid('okr_id').notNull().references(() => okrs.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'), // draft, active, completed, archived
  progress: integer('progress').default(0), // 0-100 percentage
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  context: jsonb('context').$type<Record<string, any>>(),
});

// Review Object
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // daily, weekly, monthly, custom
  period: text('period').notNull(), // e.g., "2026-03-05", "2026-W10"
  summary: text('summary'),
  insights: text('insights'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  context: jsonb('context').$type<Record<string, any>>(),
});

// USOM ContextSnapshot - unified read-only snapshot
export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull().default(1),
  data: jsonb('data').notNull().$type<Record<string, any>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// System Events for Event Bus
export const systemEvents = pgTable('system_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // e.g., "TaskCreated", "HabitLogged", "TimeBoxStarted"
  payload: jsonb('payload').notNull().$type<Record<string, any>>(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  processed: boolean('processed').default(false),
});

// Memory Framework - Layered Memory
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  layer: text('layer').notNull(), // L1_session, L2_episode, L3_procedural, L4_semantic, L5_core
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  tags: text('tags').array(),
});

// Derived Signals for Memory Framework
export const derivedSignals = pgTable('derived_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // e.g., "energy_pattern", "habit_streak"
  value: jsonb('value').notNull().$type<Record<string, any>>(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  confidence: number('confidence'), // 0-1
});

// Action Surface for Action Surface Engine
export const actionSurfaces = pgTable('action_surfaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // guide, tile, cue
  category: text('category').notNull(), // e.g., "task", "habit", "okr"
  title: text('title').notNull(),
  description: text('description'),
  weight: integer('weight').default(100), // for sorting
  context: jsonb('context').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
});

// Relations
export const tasksRelations = {
  timeboxes: tasks.timeboxes,
  okrs: tasks.okrs,
};

export const okrsRelations = {
  keyResults: okrs.keyResults,
};

export const timeboxesRelations = {
  task: timeboxes.task,
  habit: timeboxes.habit,
};

// Indexes for performance
export const indexes = {
  tasks_status_idx: 'tasks_status_idx',
  habits_status_idx: 'habits_status_idx',
  timeboxes_status_idx: 'timeboxes_status_idx',
  okrs_status_idx: 'okrs_status_idx',
  keyResults_okrId_idx: 'key_results_okr_id_idx',
};