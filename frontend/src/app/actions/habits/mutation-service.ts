/**
 * @file mutation-service
 * @brief Habits 域业务事实写入口组装（[018-G1] G1-F）
 *
 * 照 src/app/actions/tasks/mutation-service.ts 模板复制（autoplan 决策：
 * N=1 不抽公共工厂，待 habits 完成 N=2 再评估；P5 explicit-over-clever）。
 * 为 src/app/actions/habits（G1-H 待落地）组装真实的
 * createDomainMutationService(deps)，使 habits 字段写 / 生命周期变更
 * 全部走业务事实写入口，消除「绕过 Nexus 直接 repo 写」的违宪代码
 * （宪法 §III 1.11.0）。
 *
 * 依赖提供方式：
 *  - getRepository(objectType) → createHabitsGenericRepo（habit / habit_log）
 *  - getExecutor() → createFieldExecutor()（与 tasks 共用同一字段执行器）
 *  - getFieldMetadata(objectType) → 从 habits manifest field_metadata 读取
 *  - transaction(cb) → db.transaction(cb)
 *  - smExecute(proposal, eventBus, userId, tx) → createGenericStateMachine(deps).execute(...)
 *  - eventBus → 独立 EventBus 实例
 *
 * F-6 决策：事件类型本切片**保持硬编码 `TaskFieldUpdated`**（与 tasks 同款，
 * 字段执行器当前仅发此事件名）。本切片**仅注释标注**「事件名待公共工厂
 * 切片参数化为 HabitFieldUpdated」，不修改事件模型——用户已裁定。
 *
 * @see docs/usom-design.md / 宪法 §III 业务事实写入口
 * @see src/app/actions/tasks/mutation-service.ts（范本）
 */

import {
  createDomainMutationService,
  type DomainMutationService,
} from '@/nexus/domain-mutation-service'
import { createFieldExecutor } from '@/nexus/field-executor'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import { createEventBus } from '@/nexus/infrastructure/event-bus'
import { getFullManifest } from '@/domains/registry'
import { createHabitsGenericRepo } from '@/domains/habits/repository/generic-repo-adapter'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { USOM_ID } from '@/usom/types/primitives'

/** Habits 域固定 ID */
const HABITS_DOMAIN_ID = 'habits'

/**
 * 创建一个共享的事件总线。
 *
 * habits 写入口的事件总线独立于 Orchestrator 的总线（后者随每次意图新建）。
 * 字段执行器与 SM（生命周期事件）均发布到此总线，由各自订阅者消费；
 * 本 MVP 不在此挂载订阅者，事件仅作为历史/审计记录发布。
 *
 * 注意（F-6 决策）：字段执行器当前硬编码发 `TaskFieldUpdated` 事件名。
 * 待后续「公共工厂」切片将其参数化为 `HabitFieldUpdated`；本切片仅标注，
 * 不修改事件模型。
 */
function makeEventBus(): EventBus {
  return createEventBus()
}

/**
 * 组装 Habits 域业务事实写入口服务实例。
 *
 * 内部按需 new 各 Repository（与 intent.ts 的 getRepo 模式一致），并组装
 * GenericStateMachine 作为 execute() 路径的 smExecute 依赖。每次调用产生
 * 独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 *
 * @returns 业务事实写入口服务
 */
export function createHabitsMutationService(): DomainMutationService {
  const habitRepo = new HabitRepository()
  const habitLogRepo = new HabitLogRepository()
  const eventRepo = new SystemEventRepository()
  const eventBus = makeEventBus()

  // habits 域 GenericRepo 映射（habit / habit_log）
  const repos = createHabitsGenericRepo({
    habitRepo: habitRepo as any,
    habitLogRepo: habitLogRepo as any,
  })

  /** 按 objectType 取得仓储适配器 */
  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) {
      throw new Error(`getRepository: 未找到 Habits 仓储 ${objectType}`)
    }
    return repo
  }

  /** 从 habits manifest 读取 field_metadata（全域共享，与 objectType 无关） */
  function getFieldMetadata(_domainId: string, _objectType: string): Record<string, FieldMetadata> {
    const manifest = getFullManifest(HABITS_DOMAIN_ID)
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
      domainId: HABITS_DOMAIN_ID,
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
