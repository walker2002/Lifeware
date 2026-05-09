// Event Bus 单元测试 — TDD 先写测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'
import { createEventBus } from '../index'

// ─── 测试辅助：构造 SystemEvent ─────────────────────────────
function makeEvent(overrides: Partial<SystemEvent> & { type: SystemEventType }): SystemEvent {
  return {
    id: 'evt-001',
    occurredAt: new Date().toISOString(),
    triggeredBy: 'state_machine',
    payload: {},
    snapshotId: 'snap-001',
    ...overrides,
  }
}

describe('EventBus', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. 订阅事件类型 → 发布时 handler 被调用
  it('订阅后发布事件应调用对应 handler', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const event = makeEvent({ type: 'TimeboxCreated' })

    bus.subscribe('TimeboxCreated', handler)
    bus.publish(event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  // 2. 同一事件类型的多个 handler 都被调用
  it('同一事件类型的多个 handler 都应被调用', () => {
    const bus = createEventBus()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const event = makeEvent({ type: 'TimeboxStarted' })

    bus.subscribe('TimeboxStarted', handler1)
    bus.subscribe('TimeboxStarted', handler2)
    bus.publish(event)

    expect(handler1).toHaveBeenCalledOnce()
    expect(handler2).toHaveBeenCalledOnce()
  })

  // 3. 不同事件类型 → 只调用匹配的 handler
  it('只调用匹配事件类型的 handler', () => {
    const bus = createEventBus()
    const createdHandler = vi.fn()
    const endedHandler = vi.fn()

    bus.subscribe('TimeboxCreated', createdHandler)
    bus.subscribe('TimeboxEnded', endedHandler)

    bus.publish(makeEvent({ type: 'TimeboxCreated' }))

    expect(createdHandler).toHaveBeenCalledOnce()
    expect(endedHandler).not.toHaveBeenCalled()
  })

  // 4. 取消订阅 → handler 不再被调用
  it('取消订阅后 handler 不再被调用', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const event = makeEvent({ type: 'TimeboxOvertime' })

    const unsubscribe = bus.subscribe('TimeboxOvertime', handler)
    unsubscribe()
    bus.publish(event)

    expect(handler).not.toHaveBeenCalled()
  })

  // 5. Handler 抛出异常 → 其他 handler 仍被调用（错误隔离）
  it('handler 抛出异常时其他 handler 仍被调用', () => {
    const bus = createEventBus()
    const errorHandler = vi.fn(() => {
      throw new Error('handler 故意抛出异常')
    })
    const normalHandler = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    bus.subscribe('TimeboxEnded', errorHandler)
    bus.subscribe('TimeboxEnded', normalHandler)

    // 不应抛出异常
    expect(() => {
      bus.publish(makeEvent({ type: 'TimeboxEnded' }))
    }).not.toThrow()

    expect(errorHandler).toHaveBeenCalledOnce()
    expect(normalHandler).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  // 6. publish() 同步返回 — 所有 handler 执行完毕后才返回
  it('publish 同步执行所有 handler 后才返回', () => {
    const bus = createEventBus()
    const callOrder: number[] = []

    bus.subscribe('TimeboxLogged', () => { callOrder.push(1) })
    bus.subscribe('TimeboxLogged', () => { callOrder.push(2) })

    bus.publish(makeEvent({ type: 'TimeboxLogged' }))

    // publish 返回后 callOrder 应已完整填充
    expect(callOrder).toEqual([1, 2])
  })
})
