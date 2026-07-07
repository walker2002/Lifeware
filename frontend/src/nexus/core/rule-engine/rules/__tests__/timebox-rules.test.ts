// Timebox 基础规则单元测试
// TDD: 验证 FieldCompletenessRule / EndTimeAfterStartRule / StartTimeInFutureRule
// [023] A2 QA hot-fix: 替代 DurationRangeRule（duration 字段已撤销）

import { describe, it, expect } from 'vitest'
import {
  FieldCompletenessRule,
  EndTimeAfterStartRule,
  StartTimeInFutureRule,
} from '../timebox'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

function makeIntent(fields?: Partial<Record<string, unknown>>): StructuredIntent {
  const startTime = new Date(Date.now() + 3600000).toISOString() // 1 小时后
  const endTime = new Date(Date.now() + 5400000).toISOString() // 1.5 小时后（endTime > startTime）
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '市场调研报告',
      startTime,
      endTime,
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

  it('缺少 endTime → warning（[023] A2 后改 endTime 替代 duration）', async () => {
    const intent = makeIntent({ endTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('endTime')
    }
  })

  it('title 为空字符串 → warning', async () => {
    const intent = makeIntent({ title: '' })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })

  it('多个字段缺失 → warning 列出所有缺失字段', async () => {
    const intent = makeIntent({ title: undefined, endTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('title')
      expect(result.message).toContain('endTime')
    }
  })
})

// ─── EndTimeAfterStartRule 测试（[023] A2 替代 DurationRangeRule）────

describe('EndTimeAfterStartRule', () => {
  const rule = EndTimeAfterStartRule
  const snapshot = makeSnapshot()

  it('endTime > startTime → pass', async () => {
    const intent = makeIntent()
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('endTime === startTime → warning', async () => {
    const start = new Date(Date.now() + 3600000).toISOString()
    const intent = makeIntent({ startTime: start, endTime: start })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toContain('endTime')
    }
  })

  it('endTime < startTime → warning', async () => {
    const start = new Date(Date.now() + 3600000).toISOString()
    const end = new Date(Date.now() + 1800000).toISOString() // 30 min 后（早于 start）
    const intent = makeIntent({ startTime: start, endTime: end })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
  })

  it('持续时间 > 8 小时 → warning（建议拆分）', async () => {
    const start = new Date(Date.now() + 3600000).toISOString()
    const end = new Date(Date.now() + 3600000 + 9 * 3600000).toISOString() // 9 小时后
    const intent = makeIntent({ startTime: start, endTime: end })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toMatch(/8 小时|拆分/)
    }
  })

  it('startTime 缺失 → pass（由 FieldCompletenessRule 负责）', async () => {
    const intent = makeIntent({ startTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
  })

  it('endTime 缺失 → pass（由 FieldCompletenessRule 负责）', async () => {
    const intent = makeIntent({ endTime: undefined })
    const result = await rule.evaluate(intent, snapshot)
    expect(result.severity).toBe('pass')
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

// [023.03] QA regression: status transition actions skip FieldCompletenessRule
// [023.13] A1 / AM2：状态转换 action 改为从 manifest.lifecycle 派生——断言集合实际成员
// （logTimebox/cancelTimebox/revertTimebox + appointment 类），不再依赖死成员
// startTimebox/endTimebox/overtimeTimebox（[023.12] 已废）
describe('FieldCompletenessRule — 状态转换 action 跳过字段检查', () => {
  const transitionActions = [
    'logTimebox', 'cancelTimebox', 'revertTimebox',
    'cancelAppointment', 'completeAppointment', 'revertAppointment',
  ]

  for (const action of transitionActions) {
    it(`${action} 仅有 objectId 字段应当 pass（字段从 DB 加载）`, async () => {
      const result = await FieldCompletenessRule.evaluate(
        {
          action,
          targetDomain: 'timebox',
          fields: { objectId: 'test-id' },
          rawInput: '',
          domain: 'timebox',
          objectType: 'timebox',
        } as any,
        {} as any
      )
      expect(result.severity).toBe('pass')
    })
  }
})
