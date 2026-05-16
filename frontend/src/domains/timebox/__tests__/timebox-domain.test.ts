// Timebox Domain Plugin 单元测试 — TDD 先写测试
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOMSnapshot, SystemEvent, DerivedSignals } from '@/usom/types/process'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { USOM_ID } from '@/usom/types/primitives'
import { timeboxPlugin } from '../index'

// ─── 测试辅助：构造 StructuredIntent ─────────────────────────
function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '专注写作',
      startTime: '2026-05-03T09:00:00Z',
      duration: 60,
    },
    confidence: 0.95,
    resolvedBy: 'ai',
    createdAt: '2026-05-03T08:00:00Z',
    ...overrides,
  }
}

// ─── 测试辅助：构造 USOMSnapshot ─────────────────────────────
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
    currentTime: '2026-05-03T08:00:00Z',
    currentDate: '2026-05-03',
    dayOfWeek: 0,
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

// ─── 测试辅助：构造 TimeboxSummary ───────────────────────────
function makeTimeboxSummary(overrides: Partial<TimeboxSummary> = {}): TimeboxSummary {
  return {
    id: 'timebox-001' as USOM_ID,
    title: '专注写作',
    status: 'planned',
    startTime: '2026-05-03T09:00:00Z',
    endTime: '2026-05-03T10:00:00Z',
    taskIds: [],
    habitIds: [],
    ...overrides,
  }
}

// ─── 测试辅助：构造 SystemEvent ──────────────────────────────
function makeEvent(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    id: 'event-001' as USOM_ID,
    type: 'TimeboxCreated',
    occurredAt: '2026-05-03T08:00:00Z',
    triggeredBy: 'state_machine',
    payload: { title: '专注写作' },
    snapshotId: 'snapshot-001' as USOM_ID,
    ...overrides,
  }
}

// ─── 测试辅助：构造 DerivedSignals ───────────────────────────
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
    computedAt: '2026-05-03T08:00:00Z',
    dataWindowDays: 7,
    ...overrides,
  }
}

// ─── onValidate 测试 ─────────────────────────────────────────
describe('Timebox Domain Plugin — onValidate', () => {
  it('合法的 create_timebox intent 应返回 valid=true', () => {
    const intent = makeIntent()
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('缺少 title 应返回 valid=false，错误信息包含 title', () => {
    const intent = makeIntent({
      fields: {
        startTime: '2026-05-03T09:00:00Z',
        duration: 60,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('title'))).toBe(true)
  })

  it('title 为空字符串应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '',
        startTime: '2026-05-03T09:00:00Z',
        duration: 60,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('title'))).toBe(true)
  })

  it('缺少 startTime 应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '专注写作',
        duration: 60,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('startTime'))).toBe(true)
  })

  it('startTime 格式非法应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '专注写作',
        startTime: 'not-a-date',
        duration: 60,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('startTime'))).toBe(true)
  })

  it('duration 为 0 应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '专注写作',
        startTime: '2026-05-03T09:00:00Z',
        duration: 0,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('duration'))).toBe(true)
  })

  it('duration 超过 480 分钟应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '专注写作',
        startTime: '2026-05-03T09:00:00Z',
        duration: 500,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('duration'))).toBe(true)
  })

  it('duration 小于 5 分钟应返回 valid=false', () => {
    const intent = makeIntent({
      fields: {
        title: '专注写作',
        startTime: '2026-05-03T09:00:00Z',
        duration: 3,
      },
    })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onValidate(intent, snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('duration'))).toBe(true)
  })
})

// ─── onEvent 测试 ────────────────────────────────────────────
describe('Timebox Domain Plugin — onEvent', () => {
  it('TimeboxCreated 应返回 tile 类型的建议', () => {
    const event = makeEvent({ type: 'TimeboxCreated', payload: { title: '专注写作' } })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onEvent(event, snapshot)

    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].label).toContain('专注写作')
    expect(result.suggestions[0].weight).toBeGreaterThan(0)
  })

  it('TimeboxStarted 应返回 cue 类型的建议', () => {
    const event = makeEvent({ type: 'TimeboxStarted', payload: { title: '专注写作' } })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onEvent(event, snapshot)

    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].label).toContain('专注写作')
  })

  it('TimeboxEnded 应返回 cue 类型的建议（提示记录执行结果）', () => {
    const event = makeEvent({ type: 'TimeboxEnded', payload: { title: '专注写作' } })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onEvent(event, snapshot)

    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].label).toContain('记录')
  })

  it('TimeboxLogged 应返回 tile 类型的建议', () => {
    const event = makeEvent({ type: 'TimeboxLogged', payload: { title: '专注写作' } })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onEvent(event, snapshot)

    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].label).toContain('专注写作')
  })

  it('未订阅的事件应返回空结果', () => {
    const event = makeEvent({ type: 'TaskCreated', payload: {} })
    const snapshot = makeSnapshot()

    const result = timeboxPlugin.onEvent(event, snapshot)

    expect(result.metrics).toHaveLength(0)
    expect(result.suggestions).toHaveLength(0)
  })
})

// ─── onActionSurfaceRequest 测试 ─────────────────────────────
describe('Timebox Domain Plugin — onActionSurfaceRequest', () => {
  it('有 planned 时间盒且距 startTime < 15min 应返回 cue 候选', () => {
    // currentTime = 08:55, startTime = 09:00 → 距离 5 分钟 < 15 分钟
    const snapshot = makeSnapshot({
      currentTime: '2026-05-03T08:55:00Z',
      upcomingTimeboxes: [
        makeTimeboxSummary({
          status: 'planned',
          startTime: '2026-05-03T09:00:00Z',
          endTime: '2026-05-03T10:00:00Z',
          title: '专注写作',
        }),
      ],
    })
    const signals = makeSignals()

    const result = timeboxPlugin.onActionSurfaceRequest(snapshot, signals)

    expect(result.actions.length).toBeGreaterThanOrEqual(1)
    expect(result.actions.some(a => a.label.includes('专注写作'))).toBe(true)
    // 主要应返回 cue 类别（upcoming planned timebox）
    expect(result.category).toBe('cue')
    expect(result.weight).toBe(80)
  })

  it('有 running 时间盒应返回 tile 候选', () => {
    const snapshot = makeSnapshot({
      currentTime: '2026-05-03T09:30:00Z',
      currentTimebox: makeTimeboxSummary({
        id: 'timebox-running' as USOM_ID,
        status: 'running',
        startTime: '2026-05-03T09:00:00Z',
        endTime: '2026-05-03T10:00:00Z',
        title: '专注写作',
      }),
    })
    const signals = makeSignals()

    const result = timeboxPlugin.onActionSurfaceRequest(snapshot, signals)

    expect(result.actions.length).toBeGreaterThanOrEqual(1)
    expect(result.actions.some(a => a.label.includes('专注写作'))).toBe(true)
    // running timebox 应有最高权重
    expect(result.category).toBe('tile')
    expect(result.weight).toBe(90)
  })

  it('有 ended 时间盒应返回 cue 候选（提示记录）', () => {
    // 用 upcomingTimeboxes 中 status=ended 的条目模拟
    // 但 USOMSnapshot 没有直接的 endedTimeboxes 字段
    // 根据 snapshot 结构，ended timebox 会出现在 currentTimebox 为 ended 状态
    const snapshot = makeSnapshot({
      currentTime: '2026-05-03T10:05:00Z',
      currentTimebox: makeTimeboxSummary({
        id: 'timebox-ended' as USOM_ID,
        status: 'ended',
        startTime: '2026-05-03T09:00:00Z',
        endTime: '2026-05-03T10:00:00Z',
        title: '专注写作',
      }),
    })
    const signals = makeSignals()

    const result = timeboxPlugin.onActionSurfaceRequest(snapshot, signals)

    expect(result.actions.length).toBeGreaterThanOrEqual(1)
    expect(result.actions.some(a => a.label.includes('记录'))).toBe(true)
    expect(result.category).toBe('cue')
    expect(result.weight).toBe(70)
  })

  it('没有任何相关时间盒时应返回空 actions', () => {
    const snapshot = makeSnapshot({
      currentTime: '2026-05-03T08:00:00Z',
      upcomingTimeboxes: [],
    })
    const signals = makeSignals()

    const result = timeboxPlugin.onActionSurfaceRequest(snapshot, signals)

    expect(result.actions).toHaveLength(0)
  })
})

// ─── Manifest 测试 ───────────────────────────────────────────
describe('Timebox Domain Plugin — manifest', () => {
  it('manifest 的 domainId 应为 timebox', () => {
    expect(timeboxPlugin.manifest.domainId).toBe('timebox')
  })

  it('manifest 应包含正确的事件订阅列表', () => {
    const events = timeboxPlugin.manifest.subscribedEvents
    expect(events).toContain('TimeboxCreated')
    expect(events).toContain('TimeboxStarted')
    expect(events).toContain('TimeboxOvertime')
    expect(events).toContain('TimeboxEnded')
    expect(events).toContain('TimeboxLogged')
  })

  it('onOutboundRequest 应返回 undefined', () => {
    const event = makeEvent()
    const snapshot = makeSnapshot()

    // MVP 不实现 onOutboundRequest
    expect(timeboxPlugin.onOutboundRequest).toBeUndefined()
  })
})
