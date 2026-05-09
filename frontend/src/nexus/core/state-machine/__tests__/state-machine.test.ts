// State Machine 单元测试 — TDD 先写测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { Timebox } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import type { ITimeboxRepository, ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import { createTimeboxStateMachine } from '../index'
import { findTransition, timeboxTransitions } from '../transitions'

// 测试辅助：封装 timebox 专用的 findTransition
const findTimeboxTransition = (from: string | null, action: string) =>
  findTransition(timeboxTransitions, from as any, action)

// ─── 测试辅助：构造 StateProposal ─────────────────────────────
function makeCreateProposal(overrides: Partial<StateProposal> = {}): StateProposal {
  return {
    id: 'proposal-001',
    intentId: 'intent-001',
    targetObject: { type: 'timebox' },
    action: 'create',
    payload: {
      title: '专注写作',
      startTime: '2026-05-03T09:00:00Z',
      endTime: '2026-05-03T10:00:00Z',
      taskIds: ['task-001'],
      habitIds: [],
      isRecurring: false,
      tags: ['写作'],
    },
    approvedAt: '2026-05-03T08:55:00Z',
    approvedBy: 'rule_engine',
    ...overrides,
  }
}

// ─── 测试辅助：构造 Mock 仓库 ─────────────────────────────────
function makeMockRepos() {
  const savedTimeboxes: Timebox[] = []
  const savedEvents: SystemEvent[] = []

  const timeboxRepo: ITimeboxRepository = {
    findById: vi.fn().mockResolvedValue(null),
    findRunning: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    save: vi.fn(async (timebox: Timebox) => {
      savedTimeboxes.push(timebox)
    }),
    archive: vi.fn().mockResolvedValue(undefined),
  }

  const eventRepo: ISystemEventRepository = {
    append: vi.fn(async (event: SystemEvent) => {
      savedEvents.push(event)
    }),
    findByUserInRange: vi.fn().mockResolvedValue([]),
    findUnprocessed: vi.fn().mockResolvedValue([]),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  }

  return { timeboxRepo, eventRepo, savedTimeboxes, savedEvents }
}

// ─── 测试辅助：构造 Mock EventBus ─────────────────────────────
function makeMockEventBus() {
  const publishedEvents: SystemEvent[] = []
  const eventBus: EventBus = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    publish: vi.fn((event: SystemEvent) => {
      publishedEvents.push(event)
    }),
  }
  return { eventBus, publishedEvents }
}

// ─── 测试 ──────────────────────────────────────────────────────
describe('State Machine — transitions 表', () => {
  // 5. 查找合法转换
  it('create → null → planned 应存在', () => {
    const t = findTimeboxTransition(null, 'create')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('planned')
    expect(t!.eventType).toBe('TimeboxCreated')
  })

  it('start → planned → running 应存在', () => {
    const t = findTimeboxTransition('planned', 'start')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('running')
    expect(t!.eventType).toBe('TimeboxStarted')
  })

  it('overtime → running → overtime 应存在', () => {
    const t = findTimeboxTransition('running', 'overtime')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('overtime')
    expect(t!.eventType).toBe('TimeboxOvertime')
  })

  it('end → overtime → ended 应存在', () => {
    const t = findTimeboxTransition('overtime', 'end')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('ended')
    expect(t!.eventType).toBe('TimeboxEnded')
  })

  it('end → running → ended 应存在', () => {
    const t = findTimeboxTransition('running', 'end')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('ended')
    expect(t!.eventType).toBe('TimeboxEnded')
  })

  it('end → planned → ended 应存在（跳过 start）', () => {
    const t = findTimeboxTransition('planned', 'end')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('ended')
    expect(t!.eventType).toBe('TimeboxEnded')
  })

  it('log → ended → logged 应存在', () => {
    const t = findTimeboxTransition('ended', 'log')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('logged')
    expect(t!.eventType).toBe('TimeboxLogged')
  })

  // 5. 拒绝非法转换
  it('非法转换应返回 null', () => {
    expect(findTimeboxTransition('logged', 'create')).toBeNull()
    expect(findTimeboxTransition('planned', 'overtime')).toBeNull()
    expect(findTimeboxTransition('ended', 'start')).toBeNull()
  })

  it('转换表应包含 7 条规则', () => {
    expect(timeboxTransitions).toHaveLength(7)
  })
})

describe('State Machine — execute', () => {
  const userId = 'user-001' as USOM_ID
  // 1. 从 proposal 创建 timebox → 返回 planned timebox + TimeboxCreated event
  it('创建 timebox 后应返回 status=planned 的对象及 TimeboxCreated 事件', async () => {
    const { timeboxRepo, eventRepo, savedTimeboxes, savedEvents } = makeMockRepos()
    const { eventBus } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })
    const proposal = makeCreateProposal()

    const result = await sm.execute(proposal, eventBus, userId)

    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect(result.object!.status).toBe('planned')
    expect(result.object!.title).toBe('专注写作')
    expect(result.event).toBeDefined()
    expect(result.event!.type).toBe('TimeboxCreated')
    expect(result.error).toBeUndefined()
  })

  // 2. 非法 action → 返回错误
  it('非法 action 应返回错误', async () => {
    const { timeboxRepo, eventRepo } = makeMockRepos()
    const { eventBus } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })

    const proposal = makeCreateProposal({ action: 'destroy' })
    const result = await sm.execute(proposal, eventBus, userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('destroy')
    expect(result.object).toBeUndefined()
    expect(result.event).toBeUndefined()
  })

  // 3. 创建 timebox 时 payload 中的字段应正确填充
  it('创建的 timebox 应正确填充 payload 中的字段', async () => {
    const { timeboxRepo, eventRepo, savedTimeboxes } = makeMockRepos()
    const { eventBus } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })
    const proposal = makeCreateProposal()

    const result = await sm.execute(proposal, eventBus, userId)

    const timebox = result.object!
    expect(timebox.title).toBe('专注写作')
    expect(timebox.startTime).toBe('2026-05-03T09:00:00Z')
    expect(timebox.endTime).toBe('2026-05-03T10:00:00Z')
    expect(timebox.taskIds).toEqual(['task-001'])
    expect(timebox.habitIds).toEqual([])
    expect(timebox.isRecurring).toBe(false)
    expect(timebox.tags).toEqual(['写作'])
    expect(timebox.status).toBe('planned')
    // 创建时不应有 startedAt/overtimeAt/endedAt/loggedAt
    expect(timebox.startedAt).toBeUndefined()
    expect(timebox.overtimeAt).toBeUndefined()
    expect(timebox.endedAt).toBeUndefined()
    expect(timebox.loggedAt).toBeUndefined()
    // id 和时间戳应被自动生成
    expect(timebox.id).toBeTruthy()
    expect(timebox.createdAt).toBeTruthy()
    expect(timebox.updatedAt).toBeTruthy()
  })

  // 4. 创建后事件应发布到 EventBus
  it('创建后应将事件发布到 EventBus', async () => {
    const { timeboxRepo, eventRepo } = makeMockRepos()
    const { eventBus, publishedEvents } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })
    const proposal = makeCreateProposal()

    const result = await sm.execute(proposal, eventBus, userId)

    expect(eventBus.publish).toHaveBeenCalledOnce()
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0].type).toBe('TimeboxCreated')
    expect(publishedEvents[0].payload.timeboxId).toBe(result.object!.id)
    expect(publishedEvents[0].triggeredBy).toBe('state_machine')
  })

  // 验证仓库 save 被调用
  it('创建后应调用 timeboxRepo.save 持久化', async () => {
    const { timeboxRepo, eventRepo, savedTimeboxes } = makeMockRepos()
    const { eventBus } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })
    const proposal = makeCreateProposal()

    await sm.execute(proposal, eventBus, userId)

    expect(timeboxRepo.save).toHaveBeenCalledOnce()
    expect(savedTimeboxes).toHaveLength(1)
    expect(savedTimeboxes[0].status).toBe('planned')
  })

  // 验证 systemEventRepo.append 被调用
  it('创建后应调用 eventRepo.append 持久化事件', async () => {
    const { timeboxRepo, eventRepo, savedEvents } = makeMockRepos()
    const { eventBus } = makeMockEventBus()
    const sm = createTimeboxStateMachine({ timeboxRepo, eventRepo })
    const proposal = makeCreateProposal()

    await sm.execute(proposal, eventBus, userId)

    expect(eventRepo.append).toHaveBeenCalledOnce()
    expect(savedEvents).toHaveLength(1)
    expect(savedEvents[0].type).toBe('TimeboxCreated')
  })
})
