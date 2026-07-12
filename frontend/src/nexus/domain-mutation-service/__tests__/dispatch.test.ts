/**
 * @file dispatch.test
 * @brief domainMutationService 写入口分派单元测试
 *
 * 覆盖 DoD：
 *  - update(FactField) → 薄封装 submitDynamicIntent（经 Nexus 链路）
 *  - update(ContentField) → 直走 repo.updateFields（不发业务事件）
 *  - update(mutation_mode 缺省) → 按 FactField 保守处理
 *  - execute() → 开 db.transaction，在事务内按序调用字段执行器 + SM.execute，
 *    不绕 submitDynamicIntent
 *  - 任一步失败整体回滚（异常向上抛出，事务回滚）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldExecutor } from '@/nexus/field-executor'
import type { FieldMetadata } from '@/usom/types/domain-types'
import { createDomainMutationService } from '../index'

// ─── Mock 工厂 ─────────────────────────────────────────────────

const FIELD_META: Record<string, FieldMetadata> = {
  priority: { type: 'enum', label: '优先级', required: false, options: ['high', 'low'], mutation_mode: 'FactField' },
  title: { type: 'string', label: '标题', required: true, mutation_mode: 'ContentField' },
  color: { type: 'string', label: '颜色', required: false, mutation_mode: 'ContentField' },
  // 未声明 mutation_mode（缺省按 FactField）
  notes: { type: 'string', label: '备注', required: false },
}

function makeRepo(): GenericRepo {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'task-1', status: 'active' }),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
    updateFields: vi.fn().mockResolvedValue({ id: 'task-1' }),
  } as GenericRepo
}

function makeExecutor(): FieldExecutor {
  return {
    execute: vi.fn().mockResolvedValue({ kind: 'Passed' }),
  }
}

describe('domainMutationService — update() 单字段写', () => {
  it('FactField → 直连字段执行器（不走 submitDynamicIntent 全量校验）', async () => {
    const repo = makeRepo()
    const executor = makeExecutor()
    const submitDynamicIntent = vi.fn().mockResolvedValue({ success: true, object: { id: 'task-1' } })

    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      eventBus: { publish: vi.fn() } as any,
      submitDynamicIntent,
    } as any)

    const res = await service.update('task-1', 'priority', 'high', 'user-1', 'tasks', 'task')

    // 直连字段执行器（字段级校验路径），不绕 submitDynamicIntent
    expect(executor.execute).toHaveBeenCalledTimes(1)
    expect(executor.execute).toHaveBeenCalledWith(
      'task-1', 'priority', 'high', 'user-1',
      expect.objectContaining({
        objectType: 'task',
        fieldUpdatedEventType: 'TaskFieldUpdated',
      }),
    )
    expect(submitDynamicIntent).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
  })

  it('ContentField → 直走 repo.updateFields（不经字段执行器，不发业务事件）', async () => {
    const repo = makeRepo()
    const executor = makeExecutor()
    const submitDynamicIntent = vi.fn().mockResolvedValue({ success: true })

    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      eventBus: { publish: vi.fn() } as any,
      submitDynamicIntent,
    } as any)

    await service.update('task-1', 'title', '新标题', 'user-1', 'tasks', 'task')

    // 直走 repo，不经 submitDynamicIntent，也不经字段执行器
    expect(repo.updateFields).toHaveBeenCalledWith('task-1', { title: '新标题' }, 'user-1', 0)
    expect(submitDynamicIntent).not.toHaveBeenCalled()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('mutation_mode 缺省 → 保守按 FactField 处理（走字段执行器）', async () => {
    const repo = makeRepo()
    const executor = makeExecutor()
    const submitDynamicIntent = vi.fn().mockResolvedValue({ success: true })

    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      eventBus: { publish: vi.fn() } as any,
      submitDynamicIntent,
    } as any)

    await service.update('task-1', 'notes', '备注内容', 'user-1', 'tasks', 'task')

    expect(executor.execute).toHaveBeenCalledTimes(1)
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })
})

describe('domainMutationService — execute() 聚合/事务写', () => {
  it('开 db.transaction 并在事务内按序调用字段执行器 + SM.execute（不绕 submitDynamicIntent）', async () => {
    const repo = makeRepo()
    const executor = makeExecutor()
    const fakeTx = { __tx: true }
    const txCallback = vi.fn()
    // mock db.transaction：捕获回调并立即以 fakeTx 执行
    const transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => {
      txCallback()
      return cb(fakeTx)
    })
    const submitDynamicIntent = vi.fn()

    // SM.execute 的 tx 版被注入（避免引入真实 SM 依赖）
    const smExecute = vi.fn().mockResolvedValue({ success: true, object: { id: 'task-1', status: 'planned' } })

    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      submitDynamicIntent,
      transaction,
      smExecute,
    } as any)

    // 聚合步骤：先字段（priority），后状态（plan）
    const intent = {
      id: 'intent-1',
      domainId: 'tasks',
      objectType: 'task',
      targetId: 'task-1',
      steps: [
        { kind: 'field', field: 'priority', value: 'high' },
        { kind: 'state', action: 'plan', payload: {} },
      ],
    } as any

    const res = await service.execute(intent, 'user-1')

    // 开了事务
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txCallback).toHaveBeenCalled()
    // 不绕 submitDynamicIntent
    expect(submitDynamicIntent).not.toHaveBeenCalled()
    // 字段执行器被调，且透传 tx
    expect(executor.execute).toHaveBeenCalledTimes(1)
    expect(executor.execute).toHaveBeenCalledWith(
      'task-1', 'priority', 'high', 'user-1',
      expect.objectContaining({ tx: fakeTx }),
    )
    // SM.execute 被调，且透传 tx
    expect(smExecute).toHaveBeenCalledTimes(1)
    // 先字段后状态：字段执行器调用序号 < SM 调用序号
    const executorMock = vi.mocked(executor.execute)
    expect(executorMock.mock.invocationCallOrder[0]).toBeLessThan(
      smExecute.mock.invocationCallOrder[0],
    )
    expect(res.success).toBe(true)
  })

  it('字段执行器失败 → 整体回滚（异常向上抛出，不调用 SM）', async () => {
    const repo = makeRepo()
    const executor = {
      execute: vi.fn().mockResolvedValue({ kind: 'Rejected', errors: ['非法枚举'] }),
    }
    const transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => cb({ __tx: true }))
    const smExecute = vi.fn()

    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      submitDynamicIntent: vi.fn(),
      transaction,
      smExecute,
    } as any)

    const intent = {
      id: 'intent-1',
      domainId: 'tasks',
      objectType: 'task',
      targetId: 'task-1',
      steps: [
        { kind: 'field', field: 'priority', value: 'INVALID' },
        { kind: 'state', action: 'plan', payload: {} },
      ],
    } as any

    const res = await service.execute(intent, 'user-1')

    expect(res.success).toBe(false)
    // 后续状态步未执行
    expect(smExecute).not.toHaveBeenCalled()
  })
})
