/**
 * @file factory.test
 * @brief 公共工厂 createDomainMutationServiceFactory 单测（G2）
 *
 * 验证公共工厂产出的 service：
 *  - getRepository 按 objectType 路由；未知 objectType 抛带 repoLabel 的错
 *  - getFieldMetadata 读对 manifest（mock registry，不耦合真实 manifest 内容）
 *  - fieldUpdatedEventType 透传进 deps（通过拦截字段执行器 ctx 验证）
 *  - update(ContentField) 直走 repo.updateFields
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenericRepo } from '@/nexus/core/state-machine'

// ─── Mock registry（返回受控 manifest：priority=FactField / title=ContentField）
// [026] T23 per-objectType 嵌套：field_metadata.task.{priority,title}
vi.mock('@/domains/registry', () => ({
  getFullManifest: () => ({
    field_metadata: {
      task: {
        priority: { type: 'enum', label: '优先级', required: false, options: ['high', 'low'], mutation_mode: 'FactField' },
        title: { type: 'string', label: '标题', required: true, mutation_mode: 'ContentField' },
      },
    },
    lifecycle: { task: { initial: 'todo', states: {} } },
  }),
}))

// ─── Mock 字段执行器（拦截 FactField 路径，观察 ctx.fieldUpdatedEventType） ──
const executorExecuteMock = vi.fn()
vi.mock('@/nexus/field-executor', () => ({
  createFieldExecutor: () => ({ execute: executorExecuteMock }),
}))

// ─── Mock SystemEventRepository / db（避免触达 DB；update() 路径不触 SM） ──
vi.mock('@/lib/db/repositories/system-event.repository', () => ({
  SystemEventRepository: vi.fn(function (this: any) {
    return {}
  }),
}))
vi.mock('@/lib/db', () => ({ db: {} }))

import { createDomainMutationServiceFactory } from '../factory'

/** 构造一个最简 GenericRepo 桩。 */
function makeRepo(): GenericRepo {
  return {
    findById: vi.fn().mockResolvedValue({ id: 't-1' }),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
    updateFields: vi.fn().mockResolvedValue({ id: 't-1' }),
  } as GenericRepo
}

describe('G2 createDomainMutationServiceFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executorExecuteMock.mockResolvedValue({ kind: 'Passed' })
  })

  it('fieldUpdatedEventType 透传进字段执行器 ctx（tasks → TaskFieldUpdated）', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
      repoLabel: 'Tasks',
    })

    // priority 在 mock manifest 标为 FactField
    const res = await service.update('t-1', 'priority', 'high', 'u-1', 'tasks', 'task')

    expect(res.success).toBe(true)
    expect(executorExecuteMock).toHaveBeenCalledTimes(1)
    const ctx = executorExecuteMock.mock.calls[0][4]
    expect(ctx.fieldUpdatedEventType).toBe('TaskFieldUpdated')
  })

  it('getRepository 未知 objectType 抛带 repoLabel 的错', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
      repoLabel: 'Tasks',
    })

    await expect(
      service.update('t-1', 'title', 'x', 'u-1', 'tasks', 'unknown-type'),
    ).rejects.toThrow(/未找到 Tasks 仓储 unknown-type/)
  })

  it('update(ContentField) 直走 repo.updateFields', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
    })

    // title 在 mock manifest 标为 ContentField
    const res = await service.update('t-1', 'title', '新标题', 'u-1', 'tasks', 'task')

    expect(res.success).toBe(true)
    expect(repo.updateFields).toHaveBeenCalledWith('t-1', { title: '新标题' }, 'u-1', 0)
    expect(executorExecuteMock).not.toHaveBeenCalled()
  })
})
