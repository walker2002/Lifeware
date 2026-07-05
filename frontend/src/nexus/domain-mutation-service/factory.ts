/**
 * @file factory
 * @brief 域业务事实写入口公共组装工厂（G2 切片）
 *
 * 下沉 tasks/habits 两域 createXxxMutationService() 共用的六项组装
 * （getRepository/getFieldMetadata/smExecute/eventBus/transaction/getExecutor）
 * + 透传 per-domain 的 fieldUpdatedEventType（F-6）。每域工厂只保留域间差异：
 * domainId / repos / fieldUpdatedEventType / repoLabel。
 *
 * 层次归属：本工厂属 Nexus 层（组装用的是 Nexus 内部件：createFieldExecutor /
 * createGenericStateMachine / createEventBus）。每域 src/app/actions/* 只负责
 * domain repo wiring（new Repository + generic-repo-adapter），调用本工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see 宪法 §III 业务事实写入口（1.11.0）
 */
import {
  createDomainMutationService,
  type DomainMutationService,
} from './index'
import { createFieldExecutor } from '@/nexus/field-executor'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import { createEventBus } from '@/nexus/infrastructure/event-bus'
import { getFullManifest } from '@/domains/registry'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { SystemEventType } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'

/** 每域工厂入参（只关心域间差异：domainId / repos / 事件名 / 仓储标签）。 */
export interface DomainMutationServiceFactoryOptions {
  /** 域固定 ID（读 manifest / 组装 SM 用） */
  domainId: string
  /** objectType → GenericRepo 适配器映射（由各域 generic-repo-adapter 产出） */
  repos: Record<string, GenericRepo>
  /** FactField 字段写发出的事件类型（per-domain，F-6 方案 A） */
  fieldUpdatedEventType: SystemEventType
  /** 仓储缺失错误信息里的域标签，缺省取 domainId */
  repoLabel?: string
}

/**
 * 组装任一域业务事实写入口服务（下沉 tasks/habits 共用的六项组装）。
 *
 * getRepository 单参、getFieldMetadata 双参签名忽略 domainId —— 接口虽要求双参，
 * TS 协变允许少参赋多参，运行等价于原每域实现。domainId 在闭包内固定。
 *
 * @param opts - 域差异入参
 * @returns 业务事实写入口服务
 */
export function createDomainMutationServiceFactory(
  opts: DomainMutationServiceFactoryOptions,
): DomainMutationService {
  const { domainId, repos, fieldUpdatedEventType, repoLabel = domainId } = opts
  const eventRepo = new SystemEventRepository()
  const eventBus = createEventBus()

  /** 按 objectType 取得仓储适配器（domainId 在闭包固定，故单参）。 */
  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) throw new Error(`getRepository: 未找到 ${repoLabel} 仓储 ${objectType}`)
    return repo
  }

  /**
   * 从本域 manifest 读取指定 objectType 的 field_metadata（[026] T23 per-objectType 嵌套）。
   * 一级 key 为 objectType（如 task / appointment），二级 key 为字段名。
   * 缺省回退 {}（field-executor 接到空表 → 拒绝未声明字段，行为与平铺版一致）。
   *
   * @param _domainId - 域 ID（闭包固定，忽略入参）
   * @param objectType - 对象类型（task / habit / appointment / objective / key_result 等）
   */
  function getFieldMetadata(
    _domainId: string,
    objectType: string,
  ): Record<string, FieldMetadata> {
    const manifest = getFullManifest(domainId)
    // [026] T23: 嵌套读取 manifest.field_metadata[objectType]
    const nested = manifest?.field_metadata as
      | Record<string, Record<string, FieldMetadata>>
      | undefined
    return nested?.[objectType] ?? {}
  }

  /** 构建 tx 版 SM.execute 闭包（按 proposal.targetObject.type 取 repo/lifecycle）。 */
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
      getLifecycle: (d, objType) => {
        const manifest = getFullManifest(d)
        const lc = manifest?.lifecycle?.[objType]
        if (!lc) throw new Error(`未找到 lifecycle: ${d}/${objType}`)
        return lc as any
      },
      getFieldMetadata,
      domainId,
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
    fieldUpdatedEventType,
  })
}
