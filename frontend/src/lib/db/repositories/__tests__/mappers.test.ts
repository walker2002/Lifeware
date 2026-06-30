/**
 * @file mappers.test
 * @brief USOM ↔ DB mapper 双向映射单元测试
 * @details [024] G2 KeyResult.confidence 字段双向映射
 *   + [023] A2 Timebox.activityArchetypeId/taskIds/habitIds 字段双向映射
 *   + [023] A3.1.2 Task/Habit.activityArchetypeId 字段双向映射
 */

import { describe, it, expect } from 'vitest'
import { keyResultRowToUSOM, keyResultUSOMToRow, timeboxRowToUSOM, timeboxUSOMToRow, taskRowToUSOM, taskUSOMToRow, habitRowToUSOM, habitUSOMToRow } from '../mappers'

// ── 极简 row fixture：仅覆盖 mapper 关心的字段，其它用 any 兜底 ─────────
const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  schemaVersion: 1,
  status: 'active',
  objectiveId: '22222222-2222-2222-2222-222222222222',
  title: 'demo KR',
  description: null,
  targetValue: '100',
  currentValue: '0',
  unit: '%',
  progressRate: '0',
  dueDate: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  discardedAt: null,
  completedAt: null,
  archivedAt: null,
}

describe('[024] KeyResult mapper confidence', () => {
  it('row→USOM 应映射 confidence', () => {
    const row = { ...baseRow, confidence: 80 }
    const u = keyResultRowToUSOM(row as any)
    expect(u.confidence).toBe(80)
  })

  it('USOM→row 应写入 confidence', () => {
    const u = {
      ...baseRow,
      confidence: 30,
    } as any
    const r = keyResultUSOMToRow(u, 'user-1')
    expect(r.confidence).toBe(30)
  })

  it('confidence 缺省时默认 50', () => {
    // 不含 confidence 字段 → 走 fallback 分支
    const row = { ...baseRow } as any
    delete row.confidence
    expect(keyResultRowToUSOM(row).confidence).toBe(50)
  })
})

// ── [023] A2: Timebox.activityArchetypeId / taskIds / habitIds 双向映射 ──
describe('timebox mapper — activityArchetypeId ([023] A2)', () => {
  const baseTimeboxRow = {
    id: 'tb-1',
    userId: 'u-1',
    schemaVersion: 1,
    status: 'planned',
    title: '写作',
    startTime: new Date('2026-06-29T09:00:00Z'),
    endTime: new Date('2026-06-29T10:00:00Z'),
    isRecurring: false,
    recurrenceRule: null,
    tags: [],
    notes: null,
    executionRecord: null,
    createdAt: new Date('2026-06-29T00:00:00Z'),
    updatedAt: new Date('2026-06-29T00:00:00Z'),
    startedAt: null,
    overtimeAt: null,
    endedAt: null,
    loggedAt: null,
    activityArchetypeId: null,
    taskIds: null,
    habitIds: null,
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const tb = timeboxRowToUSOM({ ...baseTimeboxRow, activityArchetypeId: 'arch-1' } as any)
    expect(tb.activityArchetypeId).toBe('arch-1')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const tb = timeboxRowToUSOM({ ...baseTimeboxRow, activityArchetypeId: null } as any)
    expect(tb.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const usom = {
      id: 'tb-1',
      status: 'planned',
      title: 'x',
      startTime: '2026-06-29T09:00:00Z' as any,
      endTime: '2026-06-29T10:00:00Z' as any,
      taskIds: [],
      habitIds: [],
      isRecurring: false,
      tags: [],
      createdAt: 'x' as any,
      updatedAt: 'x' as any,
    } as any
    const row = timeboxUSOMToRow(usom, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})

// ── [023] A3.1.2: Task.activityArchetypeId 双向映射 ──────────────
describe('task mapper — activityArchetypeId ([023] A3.1)', () => {
  // [R10] 极简 fixture：仅覆盖 mapper 关心的字段，其它用 as any 兜底
  const baseTaskRow = {
    id: 'task-1',
    userId: 'u-1',
    schemaVersion: 1,
    parentId: null,
    threadId: null,
    status: 'todo',
    title: 't',
    description: null,
    priority: 'medium',
    energyRequired: 'medium',
    estimatedDuration: null,
    actualDuration: null,
    dueDate: null,
    startDate: null,
    endDate: null,
    recurrence: null,
    tags: [],
    notes: null,
    createdAt: new Date('2026-06-30T00:00:00Z'),
    updatedAt: new Date('2026-06-30T00:00:00Z'),
    completedAt: null,
    archivedAt: null,
    clarity: 'clear',
    complexity: [],
    decomposition: null,
    captureMode: 'manual',
    schedulingConstraint: null,
    tracking: 'simple',
    aiTags: {},
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const t = taskRowToUSOM({ ...baseTaskRow, activityArchetypeId: 'arch-1' } as any)
    expect(t.activityArchetypeId).toBe('arch-1')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const t = taskRowToUSOM({ ...baseTaskRow, activityArchetypeId: null } as any)
    expect(t.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const usom = {
      id: 'task-1',
      status: 'todo',
      title: 't',
      priority: 'medium',
      energyRequired: 'medium',
      clarity: 'clear',
      complexity: [],
      captureMode: 'manual',
      tracking: 'simple',
      tags: [],
      aiTags: {},
      createdAt: 'x' as any,
      updatedAt: 'x' as any,
    } as any
    const row = taskUSOMToRow(usom, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})

// ── [023] A3.1.2: Habit.activityArchetypeId 双向映射 ─────────────
describe('habit mapper — activityArchetypeId ([023] A3.1)', () => {
  const baseHabitRow = {
    id: 'habit-1',
    userId: 'u-1',
    schemaVersion: 1,
    status: 'active',
    title: 'h',
    description: null,
    frequencyType: 'daily',
    defaultTime: '07:00',
    earliestTime: '06:00',
    latestStartTime: '09:00',
    defaultDuration: 30,
    minDuration: 10,
    trackable: true,
    streak: 0,
    longestStreak: 0,
    completionRate7d: 0,
    startDate: '2026-06-30',
    endDate: null,
    daysOfWeek: null,
    tags: [],
    notes: null,
    createdAt: new Date('2026-06-30T00:00:00Z'),
    updatedAt: new Date('2026-06-30T00:00:00Z'),
    suspendedAt: null,
    archivedAt: null,
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const h = habitRowToUSOM({ ...baseHabitRow, activityArchetypeId: 'arch-2' } as any)
    expect(h.activityArchetypeId).toBe('arch-2')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const h = habitRowToUSOM({ ...baseHabitRow, activityArchetypeId: null } as any)
    expect(h.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const usom = {
      id: 'habit-1',
      status: 'active',
      title: 'h',
      frequency: { type: 'daily' as const },
      defaultTime: '07:00',
      earliestTime: '06:00',
      latestStartTime: '09:00',
      defaultDuration: 30,
      minDuration: 10,
      trackable: true,
      startDate: '2026-06-30',
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: [],
      createdAt: 'x' as any,
      updatedAt: 'x' as any,
    } as any
    const row = habitUSOMToRow(usom, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})