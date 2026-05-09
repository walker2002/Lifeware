// TimeOverlapRule 单元测试
// T027: 验证时间重叠检测规则的闭包工厂创建和区间冲突判断

import { describe, it, expect, vi } from 'vitest'
import { createTimeOverlapRule } from '../timebox-overlap'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'
import type { Timebox } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

/** 创建 mock StructuredIntent */
function makeIntent(fields?: Partial<Record<string, unknown>>): StructuredIntent {
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '测试时间盒',
      startTime: '2026-05-03T10:00:00Z',
      duration: 60,
      ...fields,
    },
    confidence: 0.9,
    resolvedBy: 'ai',
    createdAt: new Date().toISOString(),
  }
}

/** 创建 mock ContextSnapshot */
function makeSnapshot(): ContextSnapshot {
  return {
    snapshotId: 'snapshot-001',
    userId: 'user-001',
    generatedAt: new Date().toISOString(),
    generatedBy: 'state_machine',
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: new Date().toISOString(),
    currentDate: '2026-05-03',
    dayOfWeek: 6,
    timeOfDay: 'morning',
    energyState: { inferredLevel: 7, calibratedLevel: null, activeLevel: 7, source: 'system' },
  }
}

/** 创建 mock Timebox 对象 */
function makeTimebox(overrides: Partial<Timebox> = {}): Timebox {
  return {
    id: 'existing-tb-001' as USOM_ID,
    status: 'planned',
    title: '已有时间盒',
    startTime: '2026-05-03T10:00:00Z' as Timestamp,
    endTime: '2026-05-03T11:00:00Z' as Timestamp,
    taskIds: [],
    habitIds: [],
    isRecurring: false,
    tags: [],
    createdAt: '2026-05-03T08:00:00Z' as Timestamp,
    updatedAt: '2026-05-03T08:00:00Z' as Timestamp,
    ...overrides,
  }
}

/** 创建 mock ITimeboxRepository */
function createMockTimeboxRepo(timeboxes: Timebox[] = []) {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findRunning: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue(timeboxes),
    findByStatus: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── TimeOverlapRule 测试 ─────────────────────────────────────

describe('createTimeOverlapRule', () => {
  const userId = 'user-001' as USOM_ID
  const snapshot = makeSnapshot()

  it('没有已有时间盒 → pass', async () => {
    const repo = createMockTimeboxRepo([])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('pass')
  })

  it('已有时间盒与新时间盒不重叠 → pass', async () => {
    // 新时间盒: 10:00-11:00
    // 已有时间盒: 12:00-13:00（完全不相交）
    const existing = makeTimebox({
      startTime: '2026-05-03T12:00:00Z',
      endTime: '2026-05-03T13:00:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('pass')
  })

  it('已有时间盒与新时间盒完全重叠 → confirm', async () => {
    // 新时间盒: 10:00-11:00
    // 已有时间盒: 10:00-11:00（完全重叠）
    const existing = makeTimebox({
      title: '已有会议',
      startTime: '2026-05-03T10:00:00Z',
      endTime: '2026-05-03T11:00:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('confirm')
    if (result.severity === 'confirm') {
      expect(result.message).toContain('已有会议')
    }
  })

  it('已有时间盒与新时间盒部分重叠 → confirm', async () => {
    // 新时间盒: 10:00-11:00
    // 已有时间盒: 10:30-11:30（部分重叠）
    const existing = makeTimebox({
      title: '部分重叠会议',
      startTime: '2026-05-03T10:30:00Z',
      endTime: '2026-05-03T11:30:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('confirm')
    if (result.severity === 'confirm') {
      expect(result.message).toContain('部分重叠会议')
    }
  })

  it('已有时间盒被新时间盒包含 → confirm', async () => {
    // 新时间盒: 10:00-11:00
    // 已有时间盒: 10:15-10:45（被包含）
    const existing = makeTimebox({
      title: '短时间盒',
      startTime: '2026-05-03T10:15:00Z',
      endTime: '2026-05-03T10:45:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('confirm')
  })

  it('边界相接不算重叠 → pass', async () => {
    // 新时间盒: 10:00-11:00
    // 已有时间盒: 11:00-12:00（边界相接）
    const existing = makeTimebox({
      startTime: '2026-05-03T11:00:00Z',
      endTime: '2026-05-03T12:00:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('pass')
  })

  it('startTime 在已有时间盒结束前结束在已有时间盒开始后 → confirm', async () => {
    // 新时间盒: 09:30-10:30
    // 已有时间盒: 10:00-11:00（新时间盒的结束在已有时间盒内）
    const existing = makeTimebox({
      title: '已有安排',
      startTime: '2026-05-03T10:00:00Z',
      endTime: '2026-05-03T11:00:00Z',
    })
    const repo = createMockTimeboxRepo([existing])
    const rule = createTimeOverlapRule(repo, userId)

    const intent = makeIntent({
      startTime: '2026-05-03T09:30:00Z',
      duration: 60,
    })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('confirm')
    if (result.severity === 'confirm') {
      expect(result.message).toContain('已有安排')
    }
  })

  it('多个重叠时间盒 → confirm，消息包含所有标题', async () => {
    const tb1 = makeTimebox({
      id: 'tb-001' as USOM_ID,
      title: '会议A',
      startTime: '2026-05-03T10:00:00Z',
      endTime: '2026-05-03T10:30:00Z',
    })
    const tb2 = makeTimebox({
      id: 'tb-002' as USOM_ID,
      title: '会议B',
      startTime: '2026-05-03T10:30:00Z',
      endTime: '2026-05-03T11:00:00Z',
    })
    const repo = createMockTimeboxRepo([tb1, tb2])
    const rule = createTimeOverlapRule(repo, userId)

    const result = await rule.evaluate(makeIntent(), snapshot)
    expect(result.severity).toBe('confirm')
    if (result.severity === 'confirm') {
      expect(result.message).toContain('会议A')
      expect(result.message).toContain('会议B')
    }
  })

  it('缺少 startTime → pass（由 FieldCompletenessRule 负责）', async () => {
    const repo = createMockTimeboxRepo([])
    const rule = createTimeOverlapRule(repo, userId)

    const intent = makeIntent({ startTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('缺少 duration → pass（由 FieldCompletenessRule 负责）', async () => {
    const repo = createMockTimeboxRepo([])
    const rule = createTimeOverlapRule(repo, userId)

    const intent = makeIntent({ duration: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('无效的 startTime 格式 → pass（由 StartTimeInFutureRule 负责）', async () => {
    const repo = createMockTimeboxRepo([])
    const rule = createTimeOverlapRule(repo, userId)

    const intent = makeIntent({ startTime: 'not-a-date' })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('调用 findByDateRange 传入正确的日期范围', async () => {
    const repo = createMockTimeboxRepo([])
    const rule = createTimeOverlapRule(repo, userId)

    // 新时间盒: 10:00 + 60 分钟 = 11:00
    await rule.evaluate(makeIntent(), snapshot)

    expect(repo.findByDateRange).toHaveBeenCalledWith(
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T11:00:00.000Z',
      userId,
    )
  })
})
