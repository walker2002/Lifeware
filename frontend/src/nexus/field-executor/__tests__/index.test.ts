/**
 * @file index.test
 * @brief Field Executor（FactField 字段执行器）单元测试
 *
 * 覆盖 DoD：
 *  - updateFields 被调用（单次，字段值透传）
 *  - TaskFieldUpdated 事件被 publish（payload 含 field/value/objectId/objectType）
 *  - 非法枚举值（如 priority='invalid'）→ 返回 kind==='Rejected'
 *  - 字段级校验独立于全量 onValidate（不调用任何 onValidate）
 */
import { describe, it, expect, vi } from 'vitest'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { FieldMetadata } from '@/usom/types/domain-types'
import { createFieldExecutor } from '../index'

// 构造一份与 tasks manifest field_metadata 等价的字段元数据
const FIELD_META: Record<string, FieldMetadata> = {
  priority: {
    type: 'enum',
    label: '优先级',
    required: false,
    options: ['critical', 'high', 'medium', 'low'],
    mutation_mode: 'FactField',
  },
  estimatedDuration: {
    type: 'number',
    label: '预估时长',
    required: false,
    mutation_mode: 'FactField',
  },
  threadId: {
    type: 'string',
    label: '主线',
    required: false,
    mutation_mode: 'FactField',
  },
}

function makeRepo(overrides: Partial<GenericRepo> = {}): GenericRepo {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'task-1', status: 'active' }),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
    updateFields: vi.fn().mockResolvedValue({ id: 'task-1', priority: 'high' }),
    ...overrides,
  } as GenericRepo
}

function makeEventBus(): { bus: EventBus; published: any[] } {
  const published: any[] = []
  const bus: EventBus = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    publish: vi.fn((e) => published.push(e)),
  }
  return { bus, published }
}

describe('Field Executor — FactField 字段写', () => {
  it('调用 repo.updateFields 写字段（单次，透传字段值与 userId）', async () => {
    const repo = makeRepo()
    const { bus } = makeEventBus()
    const executor = createFieldExecutor()

    const result = await executor.execute('task-1', 'priority', 'high', 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
    })

    expect(result.kind).toBe('Passed')
    expect(repo.updateFields).toHaveBeenCalledTimes(1)
    expect(repo.updateFields).toHaveBeenCalledWith(
      'task-1',
      { priority: 'high' },
      'user-1',
      undefined,
    )
  })

  it('发 TaskFieldUpdated 事件（payload 含 objectId/field/value/objectType）', async () => {
    const repo = makeRepo()
    const { bus, published } = makeEventBus()
    const executor = createFieldExecutor()

    await executor.execute('task-1', 'priority', 'high', 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
    })

    expect(published).toHaveLength(1)
    const evt = published[0]
    expect(evt.type).toBe('TaskFieldUpdated')
    expect(evt.payload).toMatchObject({
      objectId: 'task-1',
      field: 'priority',
      value: 'high',
      objectType: 'task',
    })
    expect(typeof evt.id).toBe('string')
    expect(typeof evt.occurredAt).toBe('string')
    expect(evt.triggeredBy).toBe('state_machine')
  })

  it('非法枚举值（priority=invalid）→ 返回 Rejected，不写库不发事件', async () => {
    const repo = makeRepo()
    const { bus, published } = makeEventBus()
    const executor = createFieldExecutor()

    const result = await executor.execute('task-1', 'priority', 'invalid', 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
    })

    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors.length).toBeGreaterThan(0)
    }
    expect(repo.updateFields).not.toHaveBeenCalled()
    expect(published).toHaveLength(0)
  })

  it('number 字段越界（负时长）→ 返回 Rejected', async () => {
    const repo = makeRepo()
    const { bus } = makeEventBus()
    const executor = createFieldExecutor()

    const result = await executor.execute('task-1', 'estimatedDuration', -10, 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
    })

    expect(result.kind).toBe('Rejected')
    expect(repo.updateFields).not.toHaveBeenCalled()
  })

  it('字段级校验独立于全量 onValidate（不调用任何 onValidate/createTask/updateTask）', async () => {
    const repo = makeRepo()
    const { bus } = makeEventBus()
    const onValidateSpy = vi.fn()
    const executor = createFieldExecutor()

    await executor.execute('task-1', 'priority', 'high', 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
      // 即便外部传入 onValidate 钩子，字段执行器也不应触发
      onValidate: onValidateSpy,
    } as any)

    expect(onValidateSpy).not.toHaveBeenCalled()
  })

  it('透传 tx 句柄给 repo.updateFields', async () => {
    const repo = makeRepo()
    const { bus } = makeEventBus()
    const executor = createFieldExecutor()
    const fakeTx = { __isTx: true } as any

    await executor.execute('task-1', 'priority', 'high', 'user-1', {
      repo,
      eventBus: bus,
      objectType: 'task',
      fieldMetadata: FIELD_META,
      tx: fakeTx,
    } as any)

    expect(repo.updateFields).toHaveBeenCalledWith(
      'task-1',
      { priority: 'high' },
      'user-1',
      fakeTx,
    )
  })
})
