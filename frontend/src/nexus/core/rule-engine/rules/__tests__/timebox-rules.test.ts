// Timebox 基础规则单元测试
// TDD: 验证 FieldCompletenessRule / DurationRangeRule / StartTimeInFutureRule

import { describe, it, expect } from 'vitest'
import {
  FieldCompletenessRule,
  DurationRangeRule,
  StartTimeInFutureRule,
} from '../timebox'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

function makeIntent(fields?: Partial<Record<string, unknown>>): StructuredIntent {
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '市场调研报告',
      startTime: new Date(Date.now() + 3600000).toISOString(), // 1 小时后
      duration: 120,
      ...fields,
    },
    confidence: 0.9,
    resolvedBy: 'ai',
    createdAt: new Date().toISOString(),
  }
}

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

// ─── FieldCompletenessRule 测试 ────────────────────────────────

describe('FieldCompletenessRule', () => {
  const rule = FieldCompletenessRule
  const snapshot = makeSnapshot()

  it('所有必需字段存在 → pass', async () => {
    const intent = makeIntent()
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('缺少 title → warning', async () => {
    const intent = makeIntent({ title: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('title')
    }
  })

  it('缺少 startTime → warning', async () => {
    const intent = makeIntent({ startTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('startTime')
    }
  })

  it('缺少 duration → warning', async () => {
    const intent = makeIntent({ duration: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('duration')
    }
  })

  it('title 为空字符串 → warning', async () => {
    const intent = makeIntent({ title: '' })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })

  it('多个字段缺失 → warning 列出所有缺失字段', async () => {
    const intent = makeIntent({ title: undefined, duration: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('title')
      expect(result.message).toContain('duration')
    }
  })
})

// ─── DurationRangeRule 测试 ────────────────────────────────────

describe('DurationRangeRule', () => {
  const rule = DurationRangeRule
  const snapshot = makeSnapshot()

  it('有效时长 120 分钟 → pass', async () => {
    const intent = makeIntent({ duration: 120 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('时长下界 5 分钟 → pass', async () => {
    const intent = makeIntent({ duration: 5 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('时长上界 480 分钟 → pass', async () => {
    const intent = makeIntent({ duration: 480 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('duration=0 → warning', async () => {
    const intent = makeIntent({ duration: 0 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('duration')
    }
  })

  it('duration=500 → warning（超过 480 分钟上限）', async () => {
    const intent = makeIntent({ duration: 500 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('duration')
    }
  })

  it('duration=-10 → warning（负值）', async () => {
    const intent = makeIntent({ duration: -10 })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })

  it('duration 为非数字 → warning', async () => {
    const intent = makeIntent({ duration: 'abc' })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })
})

// ─── StartTimeInFutureRule 测试 ────────────────────────────────

describe('StartTimeInFutureRule', () => {
  const rule = StartTimeInFutureRule
  const snapshot = makeSnapshot()

  it('未来时间 → pass', async () => {
    const intent = makeIntent({
      startTime: new Date(Date.now() + 3600000).toISOString(),
    })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('过去时间 → warning', async () => {
    const intent = makeIntent({
      startTime: new Date(Date.now() - 3600000).toISOString(),
    })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('startTime')
    }
  })

  it('无效的 startTime 格式 → warning', async () => {
    const intent = makeIntent({ startTime: 'not-a-date' })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })

  it('startTime 缺失 → pass（由 FieldCompletenessRule 负责）', async () => {
    const intent = makeIntent({ startTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })
})
