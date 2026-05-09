// Rule Engine entry 单元测试
// TDD: 验证 createRuleEngine() 注册 timebox 规则并暴露 evaluate 方法

import { describe, it, expect } from 'vitest'
import { createRuleEngine } from '../index'
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
      startTime: new Date(Date.now() + 3600000).toISOString(),
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

// ─── 测试用例 ──────────────────────────────────────────────────

describe('createRuleEngine', () => {
  it('有效的 timebox intent → 评估通过（pass）', async () => {
    // Arrange
    const engine = createRuleEngine()
    const intent = makeIntent()
    const snapshot = makeSnapshot()

    // Act
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('pass')
    expect(result.warnings).toEqual([])
    expect(result.confirmations).toEqual([])
  })

  it('缺少必需字段的 intent → 返回 warning', async () => {
    // Arrange
    const engine = createRuleEngine()
    const intent = makeIntent({ title: undefined })
    const snapshot = makeSnapshot()

    // Act
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('时长超出范围的 intent → 返回 warning', async () => {
    // Arrange
    const engine = createRuleEngine()
    const intent = makeIntent({ duration: 500 })
    const snapshot = makeSnapshot()

    // Act
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('过去时间的 intent → 返回 warning', async () => {
    // Arrange
    const engine = createRuleEngine()
    const intent = makeIntent({
      startTime: new Date(Date.now() - 3600000).toISOString(),
    })
    const snapshot = makeSnapshot()

    // Act
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
  })

  it('多处违规 → 聚合所有 warning 消息', async () => {
    // Arrange
    const engine = createRuleEngine()
    const intent = makeIntent({
      title: '',
      duration: 500,
      startTime: new Date(Date.now() - 3600000).toISOString(),
    })
    const snapshot = makeSnapshot()

    // Act
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    // 至少 3 条 warning（字段完整性、时长范围、过去时间）
    expect(result.warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('无 deps 参数时使用基础规则集（不含 TimeOverlapRule）', async () => {
    // Arrange: 不传 deps，只有基础同步规则
    const engine = createRuleEngine()
    const intent = makeIntent()
    const snapshot = makeSnapshot()

    // Act: 应该正常工作，不会因为缺少 repo 而报错
    const result = await engine.evaluate(intent, snapshot)

    // Assert
    expect(result.severity).toBe('pass')
  })
})
