/**
 * @file execution-record-persistence
 * @brief [023.13] T0 (AM1) — executionRecord 列持久化基础修复 P0 复现测试
 *
 * 问题：SM updateStatus 路径只写 {status, updatedAt}，proposal.payload['executionRecord']
 * 永远不落库。本测试验证：
 *   1) RED（无 fix）：updateFields 没有被调用以持久化 executionRecord
 *   2) GREEN（有 fix）：transition 'planned' → 'logged' 且 payload 含 executionRecord 时，
 *      repo.updateFields 收到 executionRecord 字段，且最终读回该字段非空
 */

import { describe, it, expect, vi } from 'vitest'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { LifecycleDefinition, FieldMetadata } from '@/usom/types/domain-types'
import type { ExecutionRecord } from '@/usom/types/objects'
import { createGenericStateMachine, type GenericRepo } from '../index'

// ─── Mock 仓储：模拟 updateFields 真实落库（set+回读） ──────
function makeMockRepo(existing: Record<string, unknown>): GenericRepo {
  const store = new Map<string, Record<string, unknown>>()
  store.set(existing.id as string, existing)
  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    save: vi.fn(async (obj: Record<string, unknown>) => {
      store.set(obj.id as string, obj)
      return obj
    }),
    create: vi.fn(async (fields: Record<string, unknown>) => {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const obj = { id, createdAt: now, updatedAt: now, ...fields }
      store.set(id, obj)
      return obj
    }),
    updateStatus: vi.fn(async (id: string, toStatus: string) => {
      const obj = store.get(id)
      if (!obj) throw new Error('对象不存在')
      const updated = { ...obj, status: toStatus }
      store.set(id, updated)
      return updated
    }),
    updateFields: vi.fn(async (id: string, fields: Record<string, unknown>) => {
      const obj = store.get(id)
      if (!obj) throw new Error('对象不存在')
      const updated = { ...obj, ...fields, updatedAt: new Date().toISOString() }
      store.set(id, updated)
      return updated
    }),
  }
}

const timeboxLifecycle: LifecycleDefinition = {
  states: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'],
  initial_state: 'planned',
  transitions: [
    { from: null, to: 'planned', trigger: 'intent', action: 'create', event_type: 'TimeboxCreated' },
    { from: 'planned', to: 'running', trigger: 'intent', action: 'start', event_type: 'TimeboxStarted' },
    { from: 'running', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'ended', to: 'logged', trigger: 'intent', action: 'log', event_type: 'TimeboxLogged' },
  ],
  terminal_states: ['cancelled', 'logged'],
}

const timeboxFieldMeta: Record<string, FieldMetadata> = {
  loggedAt: { type: 'lifecycle_timestamp', label: '打卡时间', required: false },
  startedAt: { type: 'lifecycle_timestamp', label: '开始时间', required: false },
  endedAt: { type: 'lifecycle_timestamp', label: '结束时间', required: false },
}

function makeEventRepo() {
  return {
    repo: {
      append: vi.fn(async () => {}),
      findByUserInRange: vi.fn().mockResolvedValue([]),
      findByIntent: vi.fn().mockResolvedValue([]),
      findUnprocessed: vi.fn().mockResolvedValue([]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
    } as ISystemEventRepository,
  }
}

function makeEventBus() {
  return {
    bus: {
      subscribe: vi.fn().mockReturnValue(() => {}),
      publish: vi.fn(),
    } as EventBus,
  }
}

const userId = 'user-001' as USOM_ID

// 复用 AM1 模板：基础 ExecutionRecord（simple 模式，SimpleExecutionRecord 不含 notes）
const sampleExecutionRecord: ExecutionRecord = {
  mode: 'simple',
  completionStatus: 'completed',
  actualDuration: 60,
  plannedDuration: 60,
  deviationMinutes: 0,
  sourceType: 'timebox',
  loggedAt: '2026-07-07T08:00:00Z' as Timestamp,
}

describe('[023.13] T0 AM1 — executionRecord 持久化基础修复', () => {
  it('transition log 携带 executionRecord 时，repo.updateFields 应被调用以写入 executionRecord 列', async () => {
    const existing = { id: 'tb-001', status: 'ended', title: '写作' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const proposal: StateProposal = {
      id: 'proposal-log-001' as USOM_ID,
      intentId: 'intent-log-001' as USOM_ID,
      targetObject: { type: 'timebox', id: 'tb-001' as USOM_ID },
      action: 'log',
      payload: { executionRecord: sampleExecutionRecord },
      approvedAt: '2026-07-07T08:00:00Z' as Timestamp,
      approvedBy: 'rule_engine',
    }

    const result = await sm.execute(proposal, bus, userId)

    // 转换成功
    expect(result.success).toBe(true)
    expect(result.object?.status).toBe('logged')

    // [核心断言] updateFields 必被调用，字段含 executionRecord
    const updateFieldsMock = repo.updateFields as ReturnType<typeof vi.fn>
    expect(updateFieldsMock).toHaveBeenCalled()
    // 检查至少一次调用含 executionRecord
    const calledWithExecutionRecord = updateFieldsMock.mock.calls.some(
      (call) => call[1] && typeof call[1] === 'object' && 'executionRecord' in (call[1] as Record<string, unknown>),
    )
    expect(calledWithExecutionRecord).toBe(true)
  })

  it('transition log 完成后，findById 读回的 object 含 executionRecord（非 null）', async () => {
    const existing = { id: 'tb-002', status: 'ended', title: '阅读' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const proposal: StateProposal = {
      id: 'proposal-log-002' as USOM_ID,
      intentId: 'intent-log-002' as USOM_ID,
      targetObject: { type: 'timebox', id: 'tb-002' as USOM_ID },
      action: 'log',
      payload: { executionRecord: sampleExecutionRecord },
      approvedAt: '2026-07-07T08:00:00Z' as Timestamp,
      approvedBy: 'rule_engine',
    }

    const result = await sm.execute(proposal, bus, userId)
    expect(result.success).toBe(true)

    // 模拟 client 端读回：findById 应返回含 executionRecord 的对象
    const found = await repo.findById('tb-002' as USOM_ID, userId)
    expect(found).not.toBeNull()
    expect(found?.executionRecord).toBeDefined()
    expect(found?.executionRecord).toMatchObject({
      mode: 'simple',
      completionStatus: 'completed',
      actualDuration: 60,
      plannedDuration: 60,
      sourceType: 'timebox',
    })
  })

  it('transition 无 executionRecord 时（如 start/end），updateFields 不被强制调用', async () => {
    // 守护：executionRecord 分支只在 payload 携带时才写入，避免无意义写
    const existing = { id: 'tb-003', status: 'planned', title: '冥想' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => timeboxLifecycle,
      getFieldMetadata: () => timeboxFieldMeta,
    })

    const proposal: StateProposal = {
      id: 'proposal-start-001' as USOM_ID,
      intentId: 'intent-start-001' as USOM_ID,
      targetObject: { type: 'timebox', id: 'tb-003' as USOM_ID },
      action: 'start',
      payload: {}, // 无 executionRecord
      approvedAt: '2026-07-07T08:00:00Z' as Timestamp,
      approvedBy: 'rule_engine',
    }

    const result = await sm.execute(proposal, bus, userId)
    expect(result.success).toBe(true)

    // updateFields 不应被以 executionRecord 字段调用
    const updateFieldsMock = repo.updateFields as ReturnType<typeof vi.fn>
    const calledWithExecutionRecord = updateFieldsMock.mock.calls.some(
      (call) => call[1] && typeof call[1] === 'object' && 'executionRecord' in (call[1] as Record<string, unknown>),
    )
    expect(calledWithExecutionRecord).toBe(false)
  })
})
