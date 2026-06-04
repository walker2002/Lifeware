// Habits Domain Plugin 单元测试 — TDD 先写测试
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'habits',
      version: '1.0.0',
      name: '习惯管理',
      description: '习惯跟踪与管理',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {
        frequencyType: { type: 'enum', label: '频率类型', required: true, options: ['daily', 'weekly', 'custom'] },
      },
      list_actions: [],
      required_fields: { createHabit: [
        { name: 'title', label: '标题', type: 'text', required: true },
        { name: 'defaultTime', label: '默认时间', type: 'time', required: true },
        { name: 'defaultDuration', label: '默认时长', type: 'number', required: true },
        { name: 'trackable', label: '可追踪', type: 'toggle', required: true },
      ] },
      subscribed_events: ['HabitCreated', 'HabitActivated', 'HabitSuspended', 'HabitArchived', 'HabitLogged', 'HabitSkipped', 'HabitStreakMilestone'],
    },
  }),
}))

import type { StructuredIntent } from '@/usom/types/objects'
import type { USOMSnapshot, SystemEvent, DerivedSignals } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'
import { habitsPlugin } from '../index'

// ─── 测试辅助 ─────────────────────────────────────────────────
function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'habits',
    action: 'createHabit',
    fields: {
      title: '晨跑',
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      frequencyType: 'daily',
    },
    confidence: 0.95,
    resolvedBy: 'ai',
    createdAt: '2026-05-09T08:00:00Z',
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<USOMSnapshot> = {}): USOMSnapshot {
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
    timeOfDay: 'morning',
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

function makeEvent(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    id: 'event-001' as USOM_ID,
    type: 'HabitCreated',
    occurredAt: '2026-05-09T08:00:00Z',
    triggeredBy: 'state_machine',
    payload: { title: '晨跑' },
    snapshotId: 'snapshot-001' as USOM_ID,
    ...overrides,
  }
}

function makeSignals(overrides: Partial<DerivedSignals> = {}): DerivedSignals {
  return {
    userId: 'user-001' as USOM_ID,
    energyPattern: null,
    activeTaskCount: 0,
    avgCompletionRate7d: 0.5,
    avgCompletionRate30d: 0.5,
    habitStreaks: {},
    habitCompletionRates: {},
    timeboxAdherence7d: 0.5,
    isOvercommitted: false,
    computedAt: '2026-05-09T08:00:00Z',
    dataWindowDays: 7,
    ...overrides,
  }
}

// ─── Manifest 测试 ───────────────────────────────────────────
describe('Habits Domain Plugin — manifest', () => {
  it('manifest 的 domainId 应为 habits', () => {
    expect(habitsPlugin.manifest.domainId).toBe('habits')
  })

  it('manifest version 应为 1.0.0', () => {
    expect(habitsPlugin.manifest.version).toBe('1.0.0')
  })

  it('requiredFields 应包含 title, defaultTime, defaultDuration, trackable', () => {
    const fields = habitsPlugin.manifest.requiredFields
    expect(fields).toContain('title')
    expect(fields).toContain('defaultTime')
    expect(fields).toContain('defaultDuration')
    expect(fields).toContain('trackable')
  })

  it('subscribedEvents 应包含 HabitCreated/HabitLogged/HabitSkipped/HabitStreakMilestone', () => {
    const events = habitsPlugin.manifest.subscribedEvents
    expect(events).toContain('HabitCreated')
    expect(events).toContain('HabitLogged')
    expect(events).toContain('HabitSkipped')
    expect(events).toContain('HabitStreakMilestone')
  })
})

// ─── onValidate 测试 ─────────────────────────────────────────
describe('Habits Domain Plugin — onValidate', () => {
  it('合法的 createHabit 意图应返回 valid=true', () => {
    const result = habitsPlugin.onValidate(makeIntent(), makeSnapshot())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('缺少 title 应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        defaultTime: '07:00',
        earliestTime: '06:30',
        latestStartTime: '08:00',
        defaultDuration: 30,
        minDuration: 15,
        trackable: true,
        frequencyType: 'daily',
      },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('标题'))).toBe(true)
  })

  it('defaultTime 格式非法应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '晨跑',
        defaultTime: 'not-a-time',
        earliestTime: '06:30',
        latestStartTime: '08:00',
        defaultDuration: 30,
        minDuration: 15,
        trackable: true,
        frequencyType: 'daily',
      },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('默认时间'))).toBe(true)
  })

  it('minDuration > defaultDuration 应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '晨跑',
        defaultTime: '07:00',
        earliestTime: '06:30',
        latestStartTime: '08:00',
        defaultDuration: 15,
        minDuration: 30,
        trackable: true,
        frequencyType: 'daily',
      },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('最短时长'))).toBe(true)
  })

  it('defaultDuration <= 0 应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '晨跑',
        defaultTime: '07:00',
        earliestTime: '06:30',
        latestStartTime: '08:00',
        defaultDuration: 0,
        minDuration: 15,
        trackable: true,
        frequencyType: 'daily',
      },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('默认时长'))).toBe(true)
  })

  it('frequencyType 不合法应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '晨跑',
        defaultTime: '07:00',
        earliestTime: '06:30',
        latestStartTime: '08:00',
        defaultDuration: 30,
        minDuration: 15,
        trackable: true,
        frequencyType: 'invalid',
      },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('频率类型'))).toBe(true)
  })

  it('logHabit 意图缺少 habitId 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'logHabit',
      fields: { status: 'completed' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('habitId'))).toBe(true)
  })
})

// ─── onEvent 测试 ────────────────────────────────────────────
describe('Habits Domain Plugin — onEvent', () => {
  it('HabitCreated 事件应返回建议', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'HabitCreated', payload: { title: '晨跑' } }),
      makeSnapshot(),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].label).toContain('晨跑')
    expect(result.suggestions[0].weight).toBe(50)
  })

  it('HabitStreakMilestone 事件应返回高权重建议', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'HabitStreakMilestone', payload: { title: '晨跑', streak: 7 } }),
      makeSnapshot(),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].weight).toBe(90)
  })

  it('HabitLogged 事件应返回低权重建议', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'HabitLogged', payload: { title: '晨跑' } }),
      makeSnapshot(),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].weight).toBe(40)
  })

  it('HabitSkipped 事件 streak>3 应返回 weight=80', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'HabitSkipped', payload: { title: '晨跑', streak: 5 } }),
      makeSnapshot(),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].weight).toBe(80)
  })

  it('HabitSkipped 事件 streak<=3 应返回 weight=60', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'HabitSkipped', payload: { title: '晨跑', streak: 2 } }),
      makeSnapshot(),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].weight).toBe(60)
  })

  it('未订阅的事件应返回空结果', async () => {
    const result = await habitsPlugin.onEvent(
      makeEvent({ type: 'TaskCreated', payload: {} }),
      makeSnapshot(),
    )
    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(0)
  })
})

// ─── onActionSurfaceRequest 测试 ─────────────────────────────
describe('Habits Domain Plugin — onActionSurfaceRequest', () => {
  it('没有待打卡习惯时应返回空 actions', () => {
    const result = habitsPlugin.onActionSurfaceRequest(makeSnapshot(), makeSignals())
    expect(result.actions).toHaveLength(0)
    expect(result.weight).toBe(0)
  })

  it('有 2 个待打卡 trackable 习惯时应返回 2 个 log_habit 候选', () => {
    const snapshot = makeSnapshot({
      pendingHabits: [
        { id: 'h1' as USOM_ID, title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, todayLogged: false },
        { id: 'h2' as USOM_ID, title: '冥想', status: 'active', defaultTime: '08:00', trackable: true, streak: 2, todayLogged: false },
      ],
    })
    const result = habitsPlugin.onActionSurfaceRequest(snapshot, makeSignals())
    expect(result.actions.length).toBeGreaterThanOrEqual(2)
    expect(result.actions.filter(a => a.actionType === 'log_habit').length).toBe(2)
    expect(result.actions[0].weight).toBe(70)
  })

  it('streak=6 距 7 天里程碑 1 天应返回 streak_milestone_hint', () => {
    const snapshot = makeSnapshot({
      pendingHabits: [
        { id: 'h1' as USOM_ID, title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 6, todayLogged: false },
      ],
    })
    const signals = makeSignals({
      habitStreaks: { 'h1': 6 },
    })
    const result = habitsPlugin.onActionSurfaceRequest(snapshot, signals)
    const milestone = result.actions.find(a => a.actionType === 'streak_milestone_hint')
    expect(milestone).toBeDefined()
    expect(milestone!.weight).toBe(85)
  })

  it('已打卡习惯不生成 log_habit 候选', () => {
    const snapshot = makeSnapshot({
      pendingHabits: [
        { id: 'h1' as USOM_ID, title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, todayLogged: true },
      ],
    })
    const result = habitsPlugin.onActionSurfaceRequest(snapshot, makeSignals())
    expect(result.actions.filter(a => a.actionType === 'log_habit')).toHaveLength(0)
  })

  it('onOutboundRequest 应为 undefined', () => {
    expect(habitsPlugin.onOutboundRequest).toBeUndefined()
  })
})

// ─── Template onValidate 测试 ────────────────────────────────────
describe('Habits Domain Plugin — onValidate (template)', () => {
  it('createTemplate 意图 applicableDays 为空应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'createTemplate',
      fields: { name: '工作日', applicableDays: [] },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('applicableDays'))).toBe(true)
  })

  it('createTemplate 意图 name 为空应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'createTemplate',
      fields: { name: '', applicableDays: [1, 2, 3, 4, 5] },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('name'))).toBe(true)
  })

  it('合法 createTemplate 意图应返回 valid=true', () => {
    const intent = makeIntent({
      action: 'createTemplate',
      fields: { name: '工作日', applicableDays: [1, 2, 3, 4, 5] },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(true)
  })

  it('addHabitToTemplate 意图缺少 templateId 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'addHabitToTemplate',
      fields: { habitId: 'habit-001', timeOverride: '06:30' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('templateId'))).toBe(true)
  })

  it('addHabitToTemplate 意图缺少 habitId 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'addHabitToTemplate',
      fields: { templateId: 'tpl-001', timeOverride: '06:30' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('habitId'))).toBe(true)
  })

  it('addHabitToTemplate 意图 timeOverride 格式非法应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'addHabitToTemplate',
      fields: { templateId: 'tpl-001', habitId: 'habit-001', timeOverride: 'invalid' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('timeOverride'))).toBe(true)
  })

  it('合法 addHabitToTemplate 意图应返回 valid=true', () => {
    const intent = makeIntent({
      action: 'addHabitToTemplate',
      fields: { templateId: 'tpl-001', habitId: 'habit-001', timeOverride: '06:30' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(true)
  })

  it('removeHabitFromTemplate 意图缺少 templateId/habitId 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'removeHabitFromTemplate',
      fields: {},
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
  })

  it('合法 removeHabitFromTemplate 意图应返回 valid=true', () => {
    const intent = makeIntent({
      action: 'removeHabitFromTemplate',
      fields: { templateId: 'tpl-001', habitId: 'habit-001' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(true)
  })

  it('applyTemplate 意图缺少 templateId 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'applyTemplate',
      fields: { date: '2026-05-09' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('templateId'))).toBe(true)
  })

  it('applyTemplate 意图缺少 date 应返回 valid=false', () => {
    const intent = makeIntent({
      action: 'applyTemplate',
      fields: { templateId: 'tpl-001' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('date'))).toBe(true)
  })

  it('合法 applyTemplate 意图应返回 valid=true', () => {
    const intent = makeIntent({
      action: 'applyTemplate',
      fields: { templateId: 'tpl-001', date: '2026-05-09' },
    })
    const result = habitsPlugin.onValidate(intent, makeSnapshot())
    expect(result.valid).toBe(true)
  })
})
