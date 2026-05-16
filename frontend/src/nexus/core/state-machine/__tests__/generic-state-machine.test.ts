// Generic State Machine 测试 — TDD 先写测试
// 验证通用 SM 能正确执行多域状态转换
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { LifecycleDefinition, FieldMetadata } from '@/usom/types/domain-types'
import { createGenericStateMachine, type GenericRepo } from '../index'

// ─── 通用 Mock Repository ──────────────────────────────────────
function makeMockRepo(existing?: Record<string, unknown> | null): GenericRepo {
  return {
    findById: vi.fn<(id: string, userId: string) => Promise<Record<string, unknown> | null>>().mockResolvedValue(existing ?? null),
    save: vi.fn<(obj: Record<string, unknown>, userId: string) => Promise<void>>().mockResolvedValue(undefined),
  }
}

// ─── Lifecycle 定义 ─────────────────────────────────────────────
const timeboxLifecycle: LifecycleDefinition = {
  states: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'],
  initial_state: 'planned',
  transitions: [
    { from: null, to: 'planned', trigger: 'intent', action: 'create', event_type: 'TimeboxCreated' },
    { from: 'planned', to: 'running', trigger: 'intent', action: 'start', event_type: 'TimeboxStarted' },
    { from: 'running', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'running', to: 'overtime', trigger: 'time', action: 'overtime', event_type: 'TimeboxOvertime' },
    { from: 'overtime', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'planned', to: 'cancelled', trigger: 'intent', action: 'cancel', event_type: 'TimeboxCancelled' },
    { from: 'ended', to: 'logged', trigger: 'intent', action: 'log', event_type: 'TimeboxLogged' },
  ],
  terminal_states: ['cancelled', 'logged'],
}

const habitLifecycle: LifecycleDefinition = {
  states: ['draft', 'active', 'suspended', 'archived'],
  initial_state: 'draft',
  transitions: [
    { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'HabitCreated' },
    { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'HabitActivated' },
    { from: 'active', to: 'suspended', trigger: 'intent', action: 'suspend', event_type: 'HabitSuspended' },
    { from: 'suspended', to: 'active', trigger: 'intent', action: 'reactivate', event_type: 'HabitActivated' },
    { from: 'suspended', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'HabitArchived' },
  ],
  terminal_states: ['archived'],
}

const objectiveLifecycle: LifecycleDefinition = {
  states: ['draft', 'active', 'paused', 'completed', 'discarded', 'archived'],
  initial_state: 'draft',
  transitions: [
    { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'ObjectiveCreated' },
    { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'ObjectiveActivated' },
    { from: 'active', to: 'paused', trigger: 'intent', action: 'pause', event_type: 'ObjectivePaused' },
    { from: 'paused', to: 'active', trigger: 'intent', action: 'resume', event_type: 'ObjectiveResumed' },
    { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'ObjectiveCompleted' },
  ],
  terminal_states: ['completed', 'archived'],
}

const taskLifecycle: LifecycleDefinition = {
  states: ['draft', 'active', 'completed', 'archived'],
  initial_state: 'draft',
  transitions: [
    { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
    { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'TaskActivated' },
    { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
    { from: 'active', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'TaskArchived' },
  ],
  terminal_states: ['archived'],
}

// ─── Timebox field_metadata (含 lifecycle_timestamp) ─────────────
const timeboxFieldMeta: Record<string, FieldMetadata> = {
  startedAt: { type: 'lifecycle_timestamp', label: '开始时间', required: false },
  endedAt: { type: 'lifecycle_timestamp', label: '结束时间', required: false },
  overtimeAt: { type: 'lifecycle_timestamp', label: '超时时间', required: false },
}

// ─── 通用测试辅助 ──────────────────────────────────────────────
function makeProposal(overrides: Partial<StateProposal> = {}): StateProposal {
  return {
    id: 'proposal-001' as USOM_ID,
    intentId: 'intent-001' as USOM_ID,
    targetObject: { type: 'timebox' },
    action: 'create',
    payload: { title: '测试对象' },
    approvedAt: '2026-05-15T08:00:00Z' as Timestamp,
    approvedBy: 'rule_engine',
    ...overrides,
  }
}

function makeEventRepo() {
  const events: SystemEvent[] = []
  return {
    repo: {
      append: vi.fn(async (e: SystemEvent) => { events.push(e) }),
      findByUserInRange: vi.fn().mockResolvedValue([]),
      findUnprocessed: vi.fn().mockResolvedValue([]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
    } as ISystemEventRepository,
    events,
  }
}

function makeEventBus() {
  const published: SystemEvent[] = []
  return {
    bus: {
      subscribe: vi.fn().mockReturnValue(() => {}),
      publish: vi.fn((e: SystemEvent) => { published.push(e) }),
    } as EventBus,
    published,
  }
}

const userId = 'user-001' as USOM_ID

// ─── 测试：Timebox 域 ──────────────────────────────────────────
describe('Generic SM — Timebox 创建和状态转换', () => {
  it('create timebox 应返回 status=planned 和 TimeboxCreated 事件', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo, events } = makeEventRepo()
    const { bus, published } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const result = await sm.execute(makeProposal(), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('planned')
    expect(result.object!.title).toBe('测试对象')
    expect(result.event!.type).toBe('TimeboxCreated')
    expect(published).toHaveLength(1)
  })

  it('start (planned→running) 应设置 startedAt 时间戳', async () => {
    const existing = { id: 'tb-001', status: 'planned', title: '测试' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'timebox', id: 'tb-001' as USOM_ID },
      action: 'start',
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('running')
    expect(result.object!.startedAt).toBeTruthy()
  })

  it('overtime (running→overtime) 应设置 overtimeAt 时间戳', async () => {
    const existing = { id: 'tb-001', status: 'running', title: '测试', startedAt: '2026-05-15T09:00:00Z' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'timebox', id: 'tb-001' as USOM_ID },
      action: 'overtime',
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('overtime')
    expect(result.object!.overtimeAt).toBeTruthy()
  })

  it('end from overtime (overtime→ended) 应设置 endedAt', async () => {
    const existing = { id: 'tb-001', status: 'overtime', title: '测试', overtimeAt: '2026-05-15T10:00:00Z' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'timebox', id: 'tb-001' as USOM_ID },
      action: 'end',
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('ended')
    expect(result.object!.endedAt).toBeTruthy()
  })
})

// ─── 测试：Habit 域 ────────────────────────────────────────────
describe('Generic SM — Habit draft→active 转换', () => {
  it('create habit 应返回 status=draft', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => habitLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'habit' },
      action: 'create',
      payload: { title: '每日冥想' },
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('draft')
    expect(result.event!.type).toBe('HabitCreated')
  })

  it('activate (draft→active) 应正确转换', async () => {
    const existing = { id: 'h-001', status: 'draft', title: '冥想' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => habitLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'habit', id: 'h-001' as USOM_ID },
      action: 'activate',
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('active')
    expect(result.event!.type).toBe('HabitActivated')
  })
})

// ─── 测试：Objective 域 ────────────────────────────────────────
describe('Generic SM — Objective create 转换', () => {
  it('create objective 应返回 status=draft', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => objectiveLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'objective' },
      action: 'create',
      payload: { title: '学习 TypeScript' },
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('draft')
    expect(result.event!.type).toBe('ObjectiveCreated')
  })
})

// ─── 测试：非法转换被拒绝 ──────────────────────────────────────
describe('Generic SM — 非法转换', () => {
  it('非法 action 应返回错误', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
    })

    const result = await sm.execute(makeProposal({ action: 'destroy' }), bus, userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('destroy')
  })

  it('从 terminal_state 发起转换应返回错误', async () => {
    const existing = { id: 'tb-001', status: 'logged', title: '已记录' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'timebox', id: 'tb-001' as USOM_ID },
      action: 'start',
    }), bus, userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('非法')
  })

  it('不存在的对象应返回错误', async () => {
    const repo = makeMockRepo(null)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'timebox', id: 'nonexistent' as USOM_ID },
      action: 'start',
    }), bus, userId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })
})

// ─── 测试：create 路径 spread intent.fields ─────────────────────
describe('Generic SM — create 路径 payload spread', () => {
  it('create 时 payload 字段应直接 spread 到对象', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => taskLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'task' },
      action: 'create',
      payload: { title: '写文档', description: 'API 文档', priority: 'high' },
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.title).toBe('写文档')
    expect(result.object!.description).toBe('API 文档')
    expect(result.object!.priority).toBe('high')
    expect(result.object!.status).toBe('draft')
    expect(result.object!.id).toBeTruthy()
    expect(result.object!.createdAt).toBeTruthy()
  })
})
