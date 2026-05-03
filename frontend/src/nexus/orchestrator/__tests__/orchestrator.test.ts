// Orchestrator 单元测试
// TDD: 先写测试，再写实现

import { describe, it, expect, vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ActionSurface, ContextSnapshot } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'
import { createOrchestrator } from '../index'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

/** 创建 mock StructuredIntent */
function createMockIntent(overrides?: Partial<StructuredIntent>): StructuredIntent {
  return {
    id: 'intent-001' as USOM_ID,
    intentionId: 'intention-001' as USOM_ID,
    targetDomain: 'timebox',
    action: 'create',
    fields: {
      title: '专注工作时间',
      startTime: '2026-05-03T09:00:00Z',
      endTime: '2026-05-03T11:00:00Z',
      taskIds: [],
      habitIds: [],
      isRecurring: false,
      tags: [],
    },
    confidence: 0.95,
    resolvedBy: 'ai',
    createdAt: '2026-05-03T08:00:00Z',
    ...overrides,
  }
}

/** 创建 mock RuleEngine */
function createMockRuleEngine(result: 'pass' | 'warning' | 'confirm') {
  return {
    evaluate: vi.fn().mockResolvedValue({
      result,
      warnings: result === 'warning' ? ['时间盒接近晚餐时段'] : [],
      confirmations: result === 'confirm' ? ['该时段已有 3 个时间盒，确认要继续？'] : [],
    }),
  }
}

/** 创建 mock IntentEngine */
function createMockIntentEngine(intent?: StructuredIntent) {
  return {
    parse: vi.fn().mockResolvedValue(intent ?? createMockIntent()),
  }
}

/** 创建 mock TimeboxRepository */
function createMockTimeboxRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findRunning: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
  }
}

/** 创建 mock SystemEventRepository */
function createMockEventRepo() {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    findByUserInRange: vi.fn().mockResolvedValue([]),
    findUnprocessed: vi.fn().mockResolvedValue([]),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── 测试用例 ─────────────────────────────────────────────────

describe('createOrchestrator', () => {
  const userId = 'user-001' as USOM_ID

  it('完整管道: IntentEngine + RuleEngine 通过 → 成功创建 timebox', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert: 整体成功
    expect(result.success).toBe(true)
    expect(result.timebox).toBeDefined()
    expect(result.error).toBeUndefined()
    expect(result.needsConfirmation).toBeFalsy()

    // Assert: 返回的 timebox 关键字段
    const timebox = result.timebox!
    expect(timebox.title).toBe('专注工作时间')
    expect(timebox.status).toBe('planned')
    expect(timebox.startTime).toBe('2026-05-03T09:00:00Z')
    expect(timebox.endTime).toBe('2026-05-03T11:00:00Z')

    // Assert: IntentEngine 被调用
    expect(intentEngine.parse).toHaveBeenCalledWith(
      '明天早上9点到11点安排专注工作',
      userId,
    )

    // Assert: RuleEngine 被调用
    expect(ruleEngine.evaluate).toHaveBeenCalledTimes(1)
    expect(ruleEngine.evaluate).toHaveBeenCalledWith(mockIntent, expect.any(Object))

    // Assert: 持久化被调用（T-03: userId 由 Orchestrator 注入）
    expect(timeboxRepo.save).toHaveBeenCalledWith(timebox, userId)
    expect(eventRepo.append).toHaveBeenCalledWith(expect.any(Object), userId)
  })

  it('RuleEngine 返回 confirm → needsConfirmation=true，不创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act
    const result = await orchestrator.execute('安排时间盒', userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.confirmationMessage).toBe('该时段已有 3 个时间盒，确认要继续？')
    expect(result.timebox).toBeUndefined()

    // Assert: 没有持久化
    expect(timeboxRepo.save).not.toHaveBeenCalled()
    expect(eventRepo.append).not.toHaveBeenCalled()
  })

  it('confirm + confirmed=true → 继续创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act: 传入 confirmed=true
    const result = await orchestrator.execute('安排时间盒', userId, true)

    // Assert: 管道继续执行，成功创建 timebox
    expect(result.success).toBe(true)
    expect(result.timebox).toBeDefined()
    expect(result.needsConfirmation).toBeFalsy()

    // Assert: 持久化被调用
    expect(timeboxRepo.save).toHaveBeenCalledTimes(1)
    expect(eventRepo.append).toHaveBeenCalledTimes(1)
  })

  it('confirm + confirmed=false → needsConfirmation=true，不创建 timebox', async () => {
    // Arrange
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act: 传入 confirmed=false
    const result = await orchestrator.execute('安排时间盒', userId, false)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.timebox).toBeUndefined()
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('State Machine 失败 → 返回错误', async () => {
    // Arrange: 创建一个会导致状态机失败的 intent（action 不是 create）
    const badIntent = createMockIntent({ action: 'start' })
    const intentEngine = createMockIntentEngine(badIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act
    const result = await orchestrator.execute('开始时间盒', userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('非法状态转换')
    expect(result.timebox).toBeUndefined()

    // Assert: 没有持久化（state machine 内部在失败前不会 save）
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('IntentEngine 抛出异常 → 错误传播', async () => {
    // Arrange
    const intentEngine = {
      parse: vi.fn().mockRejectedValue(new Error('AI 服务不可用')),
    }
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
    })

    // Act & Assert
    await expect(
      orchestrator.execute('安排时间盒', userId),
    ).rejects.toThrow('AI 服务不可用')

    // Assert: 后续步骤未被调用
    expect(ruleEngine.evaluate).not.toHaveBeenCalled()
    expect(timeboxRepo.save).not.toHaveBeenCalled()
  })

  it('ActionSurfaceEngine 可用时，成功结果包含 actionSurface', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const mockActionSurface: ActionSurface = {
      id: 'surface-001' as USOM_ID,
      userId,
      snapshotId: 'snapshot-001' as USOM_ID,
      generatedAt: '2026-05-03T08:00:00Z',
      guide: [],
      tiles: [
        {
          id: 'action-001' as USOM_ID,
          sourceObjectId: 'tb-001' as USOM_ID,
          sourceObjectType: 'timebox',
          label: '进行中: 专注工作',
          actionType: 'start_timebox',
          category: 'tile',
          weight: 90,
        },
      ],
      cues: [],
    }

    const actionSurfaceEngine = {
      generate: vi.fn().mockResolvedValue(mockActionSurface),
    }

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
      actionSurfaceEngine,
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.actionSurface).toBeDefined()
    expect(result.actionSurface!.tiles).toHaveLength(1)
    expect(result.actionSurface!.tiles[0].label).toBe('进行中: 专注工作')

    // Assert: actionSurfaceEngine.generate 被正确调用
    expect(actionSurfaceEngine.generate).toHaveBeenCalledTimes(1)
  })

  it('ActionSurfaceEngine 不可用时，结果不含 actionSurface', async () => {
    // Arrange
    const mockIntent = createMockIntent()
    const intentEngine = createMockIntentEngine(mockIntent)
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine,
      ruleEngine,
      // 不传 actionSurfaceEngine
    })

    // Act
    const result = await orchestrator.execute('明天早上9点到11点安排专注工作', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.actionSurface).toBeUndefined()
  })
})
