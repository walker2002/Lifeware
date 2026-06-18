/**
 * @file mutation-service
 * @brief Tasks 域业务事实写入口组装（T7）
 *
 * 为 src/app/actions/tasks.ts 组装真实的 createDomainMutationService(deps)，
 * 使 tasks.ts 的字段写 / 完成任务 / 提升为主线 / 删除主线全部走业务事实写入口，
 * 消除「绕过 Nexus 直接 repo 写」的违宪代码（宪法 §III 1.11.0）。
 *
 * 依赖提供方式：
 *  - getRepository(objectType) → createTasksGenericRepo（task/thread）
 *  - getExecutor() → createFieldExecutor()（T6）
 *  - getFieldMetadata(objectType) → 从 tasks manifest field_metadata 读取
 *  - transaction(cb) → db.transaction(cb)
 *  - smExecute(proposal, eventBus, userId, tx) → createGenericStateMachine(deps).execute(...)
 *  - eventBus → 独立 EventBus 实例（字段执行器发 TaskFieldUpdated / SM 发生命周期事件）
 *
 * @see docs/usom-design.md / 宪法 §III 业务事实写入口
 */

import {
  createDomainMutationService,
  type DomainMutationService,
} from '@/nexus/domain-mutation-service'
import { createFieldExecutor } from '@/nexus/field-executor'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import { createEventBus } from '@/nexus/infrastructure/event-bus'
import { getFullManifest } from '@/domains/registry'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { USOM_ID } from '@/usom/types/primitives'

/** Tasks 域固定 ID */
const TASKS_DOMAIN_ID = 'tasks'

/**
 * 创建一个共享的事件总线。
 *
 * tasks 写入口的事件总线独立于 Orchestrator 的总线（后者随每次意图新建）。
 * 字段执行器（TaskFieldUpdated）与 SM（生命周期事件）均发布到此总线，
 * 由各自订阅者消费；本 MVP 不在此挂载订阅者，事件仅作为历史/审计记录发布。
 */
function makeEventBus(): EventBus {
  return createEventBus()
}

/**
 * 组装 Tasks 域业务事实写入口服务实例。
 *
 * 内部按需 new 各 Repository（与 intent.ts 的 getRepo 模式一致），并组装
 * GenericStateMachine 作为 execute() 路径的 smExecute 依赖。每次调用产生
 * 独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 *
 * @returns 业务事实写入口服务
 */
export function createTasksMutationService(): DomainMutationService {
  const taskRepo = new TaskRepository()
  const threadRepo = new ThreadRepository()
  const eventRepo = new SystemEventRepository()
  const eventBus = makeEventBus()

  // tasks 域 GenericRepo 映射（task / thread）
  const repos = createTasksGenericRepo({
    taskRepo: taskRepo as any,
    threadRepo: threadRepo as any,
  })

  /** 按 objectType 取得仓储适配器 */
  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) {
      throw new Error(`getRepository: 未找到 Tasks 仓储 ${objectType}`)
    }
    return repo
  }

  /** 从 tasks manifest 读取 field_metadata（全域共享，与 objectType 无关） */
  function getFieldMetadata(_domainId: string, _objectType: string): Record<string, FieldMetadata> {
    const manifest = getFullManifest(TASKS_DOMAIN_ID)
    return (manifest?.field_metadata as Record<string, FieldMetadata> | undefined) ?? {}
  }

  /** 构建 tx 版 SM.execute 闭包（按 proposal.targetObject.type 取 repo / lifecycle） */
  function smExecute(
    proposal: unknown,
    smBus: EventBus,
    userId: USOM_ID,
    tx?: DbClient,
  ) {
    const p = proposal as {
      targetObject: { type: string }
      action: string
      payload: Record<string, unknown>
      id: USOM_ID
      intentId: USOM_ID
    }
    const objectType = p.targetObject.type

    const sm = createGenericStateMachine({
      getRepository: () => getRepository(objectType),
      eventRepo,
      getLifecycle: (domainId, objType) => {
        const manifest = getFullManifest(domainId)
        const lc = manifest?.lifecycle?.[objType]
        if (!lc) throw new Error(`未找到 lifecycle: ${domainId}/${objType}`)
        return lc as any
      },
      getFieldMetadata,
      domainId: TASKS_DOMAIN_ID,
    })

    return sm.execute(p as any, smBus, userId, tx)
  }

  return createDomainMutationService({
    getRepository: (objectType: string) => getRepository(objectType),
    getExecutor: () => createFieldExecutor(),
    getFieldMetadata,
    eventBus,
    transaction: <T,>(cb: (tx: any) => Promise<T>): Promise<T> =>
      db.transaction(cb as any) as unknown as Promise<T>,
    smExecute: smExecute as any,
  })
}
