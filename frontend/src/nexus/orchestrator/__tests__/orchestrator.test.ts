// Orchestrator 单元测试
// TDD: 先写测试，再写实现

import { describe, it, expect, vi } from 'vitest'
import type { StructuredIntent, Habit, HabitTemplate } from '@/usom/types/objects'
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
    action: 'create_timebox',
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
    findByStatus: vi.fn().mockResolvedValue([]),
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
    const badIntent = createMockIntent({ action: 'delete_timebox' })
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

// ─── Habit 意图分发测试 ─────────────────────────────────────────

/** 创建 mock HabitRepository */
function createMockHabitRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue([]),
    findActive: vi.fn().mockResolvedValue([]),
    findByFrequency: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (data) => ({
      id: 'habit-new-001' as USOM_ID,
      status: 'draft' as const,
      title: data.title,
      description: data.description,
      frequency: { type: data.frequencyType, daysOfWeek: data.daysOfWeek },
      defaultTime: data.defaultTime,
      earliestTime: data.earliestTime,
      latestStartTime: data.latestStartTime,
      defaultDuration: data.defaultDuration,
      minDuration: data.minDuration,
      trackable: data.trackable,
      startDate: data.startDate,
      endDate: data.endDate,
      keyResultId: data.keyResultId,
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: (data.tags ?? []).map((t: string) => t),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    update: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockImplementation(async (id, status) => ({
      id,
      status,
    })),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    checkReferences: vi.fn().mockResolvedValue({ habitLogs: 0, templateHabits: 0, timeboxHabits: 0, hasReferences: false }),
  }
}

/** 创建 createHabit 类型的 StructuredIntent */
function createHabitIntent(overrides?: Partial<StructuredIntent>): StructuredIntent {
  return {
    id: 'intent-habit-001' as USOM_ID,
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
      startDate: '2026-05-09',
    },
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: '2026-05-09T08:00:00Z',
    ...overrides,
  }
}

describe('createOrchestrator — Habit 意图分发', () => {
  const userId = 'user-001' as USOM_ID

  it('createHabit 意图 → 调用 HabitRepository.create 并返回 habit 对象', async () => {
    // Arrange
    const habitIntent = createHabitIntent()
    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const habitRepo = createMockHabitRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
    })

    // Act
    const result = await orchestrator.executeHabitIntent(habitIntent, userId)

    // Assert: 成功
    expect(result.success).toBe(true)
    expect(result.habit).toBeDefined()
    expect(result.habit!.title).toBe('晨跑')
    expect(result.habit!.status).toBe('draft')
    expect(result.habit!.trackable).toBe(true)

    // Assert: HabitRepository.create 被调用
    expect(habitRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '晨跑', defaultTime: '07:00', trackable: true }),
      userId,
    )

    // Assert: SystemEvent 被记录
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HabitCreated' }),
      userId,
    )
  })

  it('createHabit + RuleEngine confirm → needsConfirmation=true', async () => {
    // Arrange
    const habitIntent = createHabitIntent()
    const ruleEngine = createMockRuleEngine('confirm')
    const timeboxRepo = createMockTimeboxRepo()
    const habitRepo = createMockHabitRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
    })

    // Act
    const result = await orchestrator.executeHabitIntent(habitIntent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(habitRepo.create).not.toHaveBeenCalled()
    expect(eventRepo.append).not.toHaveBeenCalled()
  })

  it('activateHabit 意图 → 加载习惯并更新状态为 active', async () => {
    // Arrange
    const existingHabit: Habit = {
      id: 'habit-001' as USOM_ID,
      status: 'draft',
      title: '晨跑',
      frequency: { type: 'daily' },
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      startDate: '2026-05-09',
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: [],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(existingHabit)
    habitRepo.updateStatus.mockImplementation(async (id, status) => ({
      ...existingHabit,
      status,
      updatedAt: new Date().toISOString(),
    }))

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
    })

    const activateIntent: StructuredIntent = {
      id: 'intent-activate-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'activateHabit',
      fields: { habitId: 'habit-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeHabitIntent(activateIntent, userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.habit).toBeDefined()
    expect(result.habit!.status).toBe('active')
    expect(habitRepo.findById).toHaveBeenCalledWith('habit-001', userId)
    expect(habitRepo.updateStatus).toHaveBeenCalledWith('habit-001', 'active', userId)
    expect(eventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HabitActivated' }),
      userId,
    )
  })

  it('习惯不存在 → 返回错误', async () => {
    // Arrange
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(null)

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
    })

    const intent: StructuredIntent = {
      id: 'intent-suspend-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'suspendHabit',
      fields: { habitId: 'habit-nonexist' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeHabitIntent(intent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
    expect(habitRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('非法状态转换 → 返回错误', async () => {
    // Arrange: status=archived 习惯不能 suspend
    const archivedHabit: Habit = {
      id: 'habit-001' as USOM_ID,
      status: 'archived',
      title: '晨跑',
      frequency: { type: 'daily' },
      defaultTime: '07:00',
      earliestTime: '06:30',
      latestStartTime: '08:00',
      defaultDuration: 30,
      minDuration: 15,
      trackable: true,
      startDate: '2026-05-09',
      streak: 0,
      longestStreak: 0,
      completionRate7d: 0,
      tags: [],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockResolvedValue(archivedHabit)

    const ruleEngine = createMockRuleEngine('pass')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
    })

    const intent: StructuredIntent = {
      id: 'intent-suspend-001' as USOM_ID,
      intentionId: 'intention-001' as USOM_ID,
      targetDomain: 'habits',
      action: 'suspendHabit',
      fields: { habitId: 'habit-001' },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: '2026-05-09T09:00:00Z',
    }

    // Act
    const result = await orchestrator.executeHabitIntent(intent, userId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('非法状态转换')
  })
})

// ─── Apply Template 测试 ─────────────────────────────────────────

/** 创建 mock HabitTemplateRepository */
function createMockTemplateRepo(templates: HabitTemplate[] = []) {
  const templateMap = new Map(templates.map(t => [t.id, t]))

  return {
    findById: vi.fn().mockImplementation(async (id: string) => templateMap.get(id) ?? null),
    findByUserId: vi.fn().mockResolvedValue(templates),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    addHabit: vi.fn().mockResolvedValue(undefined),
    removeHabit: vi.fn().mockResolvedValue(undefined),
  }
}

describe('createOrchestrator — applyTemplate', () => {
  const userId = 'user-001' as USOM_ID

  const mockTemplate: HabitTemplate = {
    id: 'tpl-workday' as USOM_ID,
    name: '工作日',
    status: 'active',
    applicableDays: [1, 2, 3, 4, 5],
    habits: [
      { habitId: 'habit-run' as USOM_ID, sortOrder: 1, timeOverride: '06:30' },
      { habitId: 'habit-lunch' as USOM_ID, sortOrder: 2 },
      { habitId: 'habit-review' as USOM_ID, sortOrder: 3 },
    ],
    createdAt: '2026-05-09T08:00:00Z',
    updatedAt: '2026-05-09T08:00:00Z',
  }

  it('applyTemplate → 为每个习惯生成 draft 时间盒', async () => {
    // Arrange
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'habit-run') return {
        id: 'habit-run' as USOM_ID, status: 'active', title: '晨跑',
        frequency: { type: 'daily' }, defaultTime: '07:00', earliestTime: '06:00',
        latestStartTime: '09:00', defaultDuration: 30, minDuration: 15,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      if (id === 'habit-lunch') return {
        id: 'habit-lunch' as USOM_ID, status: 'active', title: '午餐',
        frequency: { type: 'daily' }, defaultTime: '12:00', earliestTime: '11:30',
        latestStartTime: '13:30', defaultDuration: 60, minDuration: 30,
        trackable: false, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      if (id === 'habit-review') return {
        id: 'habit-review' as USOM_ID, status: 'active', title: '复盘',
        frequency: { type: 'daily' }, defaultTime: '22:00', earliestTime: '21:30',
        latestStartTime: '23:00', defaultDuration: 15, minDuration: 10,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      return null
    })

    const templateRepo = createMockTemplateRepo([mockTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()
    const ruleEngine = createMockRuleEngine('pass')

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine,
      habitRepo,
      templateRepo,
    })

    // Act: 2026-05-09 是周六(6)，工作日模板 applicableDays=[1,2,3,4,5]
    // 为了测试方便，让模板包含周六
    const saturdayTemplate = { ...mockTemplate, applicableDays: [1, 2, 3, 4, 5, 6] }
    templateRepo.findById.mockResolvedValue(saturdayTemplate)

    const result = await orchestrator.applyTemplate('tpl-workday', '2026-05-09', userId)

    // Assert
    expect(result.success).toBe(true)
    expect(result.generatedTimeboxes).toBeDefined()
    expect(result.generatedTimeboxes!.length).toBe(3)
    expect(result.generatedTimeboxes![0].title).toBe('晨跑')
    expect(result.generatedTimeboxes![0].status).toBe('planned')
    // 晨跑有 timeOverride=06:30，应该使用覆盖值
    expect(result.generatedTimeboxes![0].startTime).toContain('06:30')
    expect(result.generatedTimeboxes![1].title).toBe('午餐')
    expect(result.generatedTimeboxes![2].title).toBe('复盘')

    // 时间盒通过 habitIds 关联对应习惯
    expect(result.generatedTimeboxes![0].habitIds).toContain('habit-run')

    // 持久化被调用
    expect(timeboxRepo.save).toHaveBeenCalledTimes(3)
    expect(eventRepo.append).toHaveBeenCalled()
  })

  it('模板不存在 → 返回错误', async () => {
    const templateRepo = createMockTemplateRepo([])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()
    const habitRepo = createMockHabitRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      habitRepo,
      templateRepo,
    })

    const result = await orchestrator.applyTemplate('tpl-nonexist', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('templateRepo 未配置 → 返回错误', async () => {
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
    })

    const result = await orchestrator.applyTemplate('tpl-001', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('未配置')
  })

  it('同一天重复应用同一模板 → 拒绝', async () => {
    const habitRepo = createMockHabitRepo()
    const templateRepo = createMockTemplateRepo([mockTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    // 模拟当天已有时间盒覆盖了模板中所有习惯
    timeboxRepo.findByDateRange.mockResolvedValue([
      {
        id: 'tb-existing' as USOM_ID,
        status: 'planned',
        title: '晨跑',
        startTime: '2026-05-09T06:30:00Z',
        endTime: '2026-05-09T07:00:00Z',
        taskIds: [],
        habitIds: ['habit-run', 'habit-lunch', 'habit-review'],
        isRecurring: false,
        tags: [],
        createdAt: '2026-05-09T08:00:00Z',
        updatedAt: '2026-05-09T08:00:00Z',
      },
    ])

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      habitRepo,
      templateRepo,
    })

    const result = await orchestrator.applyTemplate('tpl-workday', '2026-05-09', userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('已使用该模板')
  })

  it('applyTemplate 生成的时间盒使用本地时区偏移（+08:00），不是 UTC（Z）', async () => {
    // Bug [010]: 习惯的 HH:MM 是本地时间，拼接时不应使用 Z（UTC）后缀
    // 例如 "07:30" 本地时间拼接 Z 变成 UTC 07:30 = 本地 15:30（UTC+8 错位）
    // 应该拼接 +08:00 使 07:30 保持为本地 07:30
    const habitRepo = createMockHabitRepo()
    habitRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'habit-run') return {
        id: 'habit-run' as USOM_ID, status: 'active', title: '晨跑',
        frequency: { type: 'daily' }, defaultTime: '07:30', earliestTime: '07:00',
        latestStartTime: '08:00', defaultDuration: 30, minDuration: 15,
        trackable: true, startDate: '2026-05-09', streak: 0, longestStreak: 0,
        completionRate7d: 0, tags: [], createdAt: '2026-05-09T08:00:00Z', updatedAt: '2026-05-09T08:00:00Z',
      }
      return null
    })

    const singleHabitTemplate: HabitTemplate = {
      id: 'tpl-tz-test' as USOM_ID,
      name: '时区测试',
      status: 'active',
      applicableDays: [1, 2, 3, 4, 5, 6],
      habits: [
        { habitId: 'habit-run' as USOM_ID, sortOrder: 1 },
      ],
      createdAt: '2026-05-09T08:00:00Z',
      updatedAt: '2026-05-09T08:00:00Z',
    }

    const templateRepo = createMockTemplateRepo([singleHabitTemplate])
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: createMockIntentEngine(),
      ruleEngine: createMockRuleEngine('pass'),
      habitRepo,
      templateRepo,
    })

    const result = await orchestrator.applyTemplate('tpl-tz-test', '2026-05-09', userId)

    expect(result.success).toBe(true)
    expect(result.generatedTimeboxes).toBeDefined()
    expect(result.generatedTimeboxes!.length).toBe(1)

    const tb = result.generatedTimeboxes![0]
    // 时间盒的开始时间必须使用 +08:00 后缀（本地时区），不能是 Z（UTC）
    expect(tb.startTime).toBe('2026-05-09T07:30:00+08:00')
    expect(tb.endTime).toBe('2026-05-09T08:00:00+08:00')
    // 绝对不能是 Z 后缀（会导致 UTC+8 时区错位 8 小时）
    expect(tb.startTime).not.toContain('T07:30:00Z')
    expect(tb.endTime).not.toContain('T08:00:00Z')
  })
})
