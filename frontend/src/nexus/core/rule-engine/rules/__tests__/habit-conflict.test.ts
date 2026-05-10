// Habit Conflict Rule 单元测试
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { HabitConflictRule } from '../habit-conflict'

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'habits',
    action: 'createHabit',
    fields: {
      title: '晨跑',
      defaultTime: '07:00',
      defaultDuration: 30,
      trackable: true,
    },
    confidence: 0.95,
    resolvedBy: 'ai',
    createdAt: '2026-05-09T08:00:00Z',
    ...overrides,
  }
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-001' as USOM_ID,
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    currentTimebox: undefined,
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: '2026-05-09T08:00:00Z',
    currentDate: '2026-05-09',
    dayOfWeek: 6,
    timeOfDay: 'morning' as const,
    energyState: {
      inferredLevel: 7,
      calibratedLevel: null,
      activeLevel: 7,
      source: 'system',
    },
    sourceSnapshotId: 'snapshot-001' as USOM_ID,
    ...overrides,
  }
}

describe('HabitConflictRule', () => {
  it('非 habits 域意图应返回 pass', async () => {
    const intent = makeIntent({ targetDomain: 'timebox', action: 'create_timebox' })
    const result = await HabitConflictRule.evaluate(intent, makeSnapshot() as any)
    expect(result.severity).toBe('pass')
  })

  it('createHabit 意图 defaultTime 与已有习惯重叠应返回 warning', async () => {
    const intent = makeIntent({
      fields: { title: '晨练', defaultTime: '07:00', defaultDuration: 30, trackable: true },
    })
    const snapshot = makeSnapshot({
      pendingHabits: [
        {
          id: 'habit-001' as USOM_ID,
          title: '晨跑',
          status: 'active',
          defaultTime: '07:00',
          trackable: true,
          streak: 5,
          todayLogged: false,
        },
      ],
    })
    const result = await HabitConflictRule.evaluate(intent, snapshot as any)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('重叠')
    }
  })

  it('createHabit 意图 defaultTime 不重叠应返回 pass', async () => {
    const intent = makeIntent({
      fields: { title: '午休', defaultTime: '12:00', defaultDuration: 60, trackable: false },
    })
    const snapshot = makeSnapshot({
      pendingHabits: [
        {
          id: 'habit-001' as USOM_ID,
          title: '晨跑',
          status: 'active',
          defaultTime: '07:00',
          trackable: true,
          streak: 5,
          todayLogged: false,
        },
      ],
    })
    const result = await HabitConflictRule.evaluate(intent, snapshot as any)
    expect(result.severity).toBe('pass')
  })
})
