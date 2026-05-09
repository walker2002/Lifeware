// Rule Engine evaluator 单元测试
// TDD: 验证规则评估逻辑和严重级别聚合

import { describe, it, expect } from 'vitest'
import { evaluateRules } from '../evaluator'
import type { Rule, RuleResult } from '../evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

function makeIntent(): StructuredIntent {
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '市场调研报告',
      startTime: new Date(Date.now() + 3600000).toISOString(),
      duration: 120,
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

// ─── 辅助函数：创建 mock 规则 ─────────────────────────────────

function createMockRule(name: string, result: RuleResult): Rule {
  return {
    name,
    evaluate: () => result,
  }
}

// ─── 测试用例 ──────────────────────────────────────────────────

describe('evaluateRules', () => {
  const intent = makeIntent()
  const snapshot = makeSnapshot()

  it('所有规则通过 → 返回 pass', async () => {
    // Arrange
    const rules: Rule[] = [
      createMockRule('规则A', { severity: 'pass' }),
      createMockRule('规则B', { severity: 'pass' }),
    ]

    // Act
    const result = await evaluateRules(rules, intent, snapshot)

    // Assert
    expect(result.severity).toBe('pass')
    expect(result.warnings).toEqual([])
    expect(result.confirmations).toEqual([])
  })

  it('一条规则返回 warning → 返回 warning 并附带消息', async () => {
    // Arrange
    const rules: Rule[] = [
      createMockRule('规则A', { severity: 'pass' }),
      createMockRule('规则B', { severity: 'warning', message: '持续时间偏长' }),
    ]

    // Act
    const result = await evaluateRules(rules, intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    expect(result.warnings).toEqual(['持续时间偏长'])
    expect(result.confirmations).toEqual([])
  })

  it('一条规则返回 confirm → 返回 confirm 并附带消息', async () => {
    // Arrange
    const rules: Rule[] = [
      createMockRule('规则A', { severity: 'pass' }),
      createMockRule('规则B', { severity: 'confirm', message: '确认创建？' }),
    ]

    // Act
    const result = await evaluateRules(rules, intent, snapshot)

    // Assert
    expect(result.severity).toBe('confirm')
    expect(result.confirmations).toEqual(['确认创建？'])
    expect(result.warnings).toEqual([])
  })

  it('多条 warning → 返回最高严重级别 warning 并附带所有消息', async () => {
    // Arrange
    const rules: Rule[] = [
      createMockRule('规则A', { severity: 'warning', message: '缺少标题' }),
      createMockRule('规则B', { severity: 'warning', message: '持续时间异常' }),
      createMockRule('规则C', { severity: 'pass' }),
    ]

    // Act
    const result = await evaluateRules(rules, intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    expect(result.warnings).toEqual(['缺少标题', '持续时间异常'])
    expect(result.confirmations).toEqual([])
  })

  it('warning + confirm → confirm 为最高严重级别', async () => {
    // Arrange
    const rules: Rule[] = [
      createMockRule('规则A', { severity: 'warning', message: '持续时间偏长' }),
      createMockRule('规则B', { severity: 'confirm', message: '该时段已有时间盒' }),
    ]

    // Act
    const result = await evaluateRules(rules, intent, snapshot)

    // Assert: confirm > warning
    expect(result.severity).toBe('confirm')
    expect(result.confirmations).toEqual(['该时段已有时间盒'])
    expect(result.warnings).toEqual(['持续时间偏长'])
  })

  it('空规则数组 → 返回 pass', async () => {
    // Act
    const result = await evaluateRules([], intent, snapshot)

    // Assert
    expect(result.severity).toBe('pass')
    expect(result.warnings).toEqual([])
    expect(result.confirmations).toEqual([])
  })

  it('支持异步规则', async () => {
    // Arrange
    const asyncRule: Rule = {
      name: 'AsyncRule',
      evaluate: async () => {
        // 模拟异步操作
        await new Promise((r) => setTimeout(r, 1))
        return { severity: 'warning', message: '异步警告' }
      },
    }

    // Act
    const result = await evaluateRules([asyncRule], intent, snapshot)

    // Assert
    expect(result.severity).toBe('warning')
    expect(result.warnings).toEqual(['异步警告'])
  })
})
