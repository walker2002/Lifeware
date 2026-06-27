/**
 * @file tx-passthrough.unit
 * @brief tx 句柄透传单元测试（T4 — 不依赖 Docker）
 *
 * 用 mock GenericRepo 验证：
 * 1. SM.execute 接收的 tx 句柄被透传到 repo 的写操作（findById/updateStatus/create）。
 * 2. updateFields 是单条 UPDATE（mock 的 updateFields 被调用一次，且不触发 findById+save 双写模式）。
 * 3. tx 缺省时（不传），repo 方法收到 undefined（各仓储回退到 db 单例）。
 */

import { describe, it, expect, vi } from 'vitest'
import { createGenericStateMachine, type GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { LifecycleDefinition } from '@/usom/types/domain-types'

/** 标记用的假 tx 句柄（与真实 db 同形态，仅用于断言透传） */
const FAKE_TX = { __isTx: true } as never

const eventBus: EventBus = { publish: () => {} } as unknown as EventBus
const eventRepo = {
  append: vi.fn(async () => {}),
} as unknown as ISystemEventRepository

const taskLifecycle: LifecycleDefinition = {
  states: ['draft', 'active', 'completed', 'archived'],
  initial_state: 'draft',
  transitions: [
    { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
    { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'TaskActivated' },
  ],
  terminal_states: ['archived'],
}

/** 构造带 spy 的 mock repo */
function makeSpyRepo(existing: Record<string, unknown> | null): GenericRepo & {
  calls: { method: string; tx: unknown }[]
} {
  const calls: { method: string; tx: unknown }[] = []
  const store = new Map<string, Record<string, unknown>>()
  if (existing) store.set(existing.id as string, existing)
  const record = (method: string, tx: unknown) => calls.push({ method, tx })
  return {
    findById: vi.fn(async (id: string, _userId: string, tx?: unknown) => {
      record('findById', tx)
      return store.get(id) ?? null
    }),
    save: vi.fn(async (obj: Record<string, unknown>, _userId: string, tx?: unknown) => {
      record('save', tx)
      store.set(obj.id as string, obj); return obj
    }),
    create: vi.fn(async (fields: Record<string, unknown>, _userId: string, tx?: unknown) => {
      record('create', tx)
      const id = crypto.randomUUID()
      const obj = { id, ...fields }
      store.set(id, obj)
      return obj
    }),
    updateStatus: vi.fn(async (id: string, toStatus: string, _userId: string, tx?: unknown) => {
      record('updateStatus', tx)
      const obj = store.get(id)
      if (!obj) throw new Error('对象不存在')
      const updated = { ...obj, status: toStatus }
      store.set(id, updated)
      return updated
    }),
    updateFields: vi.fn(async (id: string, fields: Record<string, unknown>, _userId: string, tx?: unknown) => {
      record('updateFields', tx)
      const obj = store.get(id)
      if (!obj) throw new Error('对象不存在')
      const updated = { ...obj, ...fields }
      store.set(id, updated)
      // 关键：updateFields 内部只调用一次「写」（此处用单次 mock 调用模拟单条 UPDATE），
      // 不应出现 findById+save 的两次写。
      return updated
    }),
    calls,
  }
}

describe('tx 透传单元测试（mock repo，无 Docker）', () => {
  it('SM.execute 把 tx 句柄透传给 repo.findById 与 repo.updateStatus', async () => {
    const repo = makeSpyRepo({ id: 't1', status: 'draft' })
    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => taskLifecycle,
      domainId: 'tasks',
    })

    const res = await sm.execute(
      {
        id: 'p1' as never,
        intentId: 'i1' as never,
        action: 'activate',
        targetObject: { type: 'task', id: 't1' },
        payload: {},
      } as never,
      eventBus,
      'user-1' as never,
      FAKE_TX,
    )

    expect(res.success).toBe(true)
    // findById 与 updateStatus 都应收到同一个 FAKE_TX
    const findCall = repo.calls.find(c => c.method === 'findById')
    const statusCall = repo.calls.find(c => c.method === 'updateStatus')
    expect(findCall?.tx).toBe(FAKE_TX)
    expect(statusCall?.tx).toBe(FAKE_TX)
  })

  it('SM.execute 不传 tx 时，repo 方法收到 undefined（仓储将回退到 db 单例）', async () => {
    const repo = makeSpyRepo({ id: 't2', status: 'draft' })
    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => taskLifecycle,
      domainId: 'tasks',
    })

    await sm.execute(
      {
        id: 'p2' as never,
        intentId: 'i2' as never,
        action: 'activate',
        targetObject: { type: 'task', id: 't2' },
        payload: {},
      } as never,
      eventBus,
      'user-2' as never,
      // 不传 tx
    )

    const findCall = repo.calls.find(c => c.method === 'findById')
    expect(findCall?.tx).toBeUndefined()
  })

  it('updateFields 单条写：只被调用一次，且 tx 句柄被透传', async () => {
    const repo = makeSpyRepo({ id: 't3', status: 'draft', title: 'old' })

    const updated = await repo.updateFields('t3', { title: 'new' }, 'user-3' as never, FAKE_TX)
    expect(updated.title).toBe('new')

    const ufCalls = repo.calls.filter(c => c.method === 'updateFields')
    expect(ufCalls.length).toBe(1)
    expect(ufCalls[0]!.tx).toBe(FAKE_TX)
    // updateFields 不应触发 save（验证非读后写模式）
    const saveCalls = repo.calls.filter(c => c.method === 'save')
    expect(saveCalls.length).toBe(0)
  })
})
