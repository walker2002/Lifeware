/**
 * @file index
 * @brief domainMutationService — 业务事实写入口对外 API 面（宪法 §III，1.11.0）
 *
 * 业务事实写入口是 Nexus 中「唯一业务事实写入通道」。对外两层 API：
 *
 *  1. update(id, field, value, userId, domainId, objectType) —— 原子单字段写。
 *     按 manifest field_metadata.<field>.mutation_mode 路由：
 *       - FactField       → 直连注入的字段执行器（字段级校验 + updateFields +
 *                           域配置的字段更新事件），与 execute() 字段路径一致。
 *                           **不走** submitDynamicIntent 全量 onValidate（eng-review
 *                           TENSION-4→4A：单字段 FactField 走字段级校验）。
 *       - ContentField    → 直走 Repository.updateFields（不经全链路、不发业务事件）
 *       - PresentationField → 本地态，不落库（MVP 暂按 ContentField 之外保守拒绝/跳过）
 *       - mutation_mode 缺省 → 保守按 FactField 处理
 *
 *  2. execute(intent, userId) —— 聚合/事务写（如未来的 promoteToThread）。
 *     自己开 db.transaction(tx => …)，在事务内**直调** tx 版字段执行器与
 *     SM.execute(proposal, eventBus, userId, tx)，**不**绕 submitDynamicIntent
 *     （后者每次新建 Orchestrator，无法包跨步事务）。多步按「先字段后状态」顺序，
 *     任一步失败整体回滚。
 *
 * 事务边界：execute() 顶层持有事务；SM.execute / 字段执行器为同一事务内的子操作。
 *
 * 依赖注入：createDomainMutationService(deps) 形式。字段执行器、transaction、smExecute
 * 均为注入依赖，便于 T5 单测 mock、T7 tasks.ts 迁移时提供真实实现。submitDynamicIntent
 * 已不再被 update() 使用（见 TENSION-4→4A），保留为可选遗留依赖。
 *
 * @see docs/usom-design.md / 宪法 §III 业务事实写入口
 */

import type { USOM_ID } from '@/usom/types/primitives'
import type { ValidationResult, SystemEventType } from '@/usom/types/process'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { FieldExecutor } from '@/nexus/field-executor'
import type { DbClient } from '@/lib/db'

// ─── 注入依赖类型 ──────────────────────────────────────────────

/**
 * submitDynamicIntent 的可注入别名（遗留，不再被 update() 使用）。
 *
 * 历史背景：早期 update(FactField) 曾以薄封装调用 submitDynamicIntent 走
 * Intent→Rule→SM 全链路。eng-review TENSION-4→4A 授权改为「字段级校验」：
 * FactField 单字段写应直连字段执行器（字段级校验 + updateFields + 域配置的字段更新事件），
 * **不**走 createTask/updateTask 的全量 onValidate。submitDynamicIntent 在写入口
 * 中已无使用方，保留为可选依赖仅为兼容旧测试/未来按需复活，删除接口会波及外部引用。
 */
export type SubmitDynamicIntentFn = (
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
  confirmed?: boolean,
) => Promise<{ success: boolean; object?: unknown; error?: string }>

/**
 * 事务开启函数别名。真实实现为 db.transaction；测试注入 mock。
 * 形如 db.transaction(async tx => result)，回调内 tx 即 DbTransaction。
 */
export type TransactionFn = <T>(
  cb: (tx: DbClient) => Promise<T>,
) => Promise<T>

/**
 * tx 版 SM.execute 的可注入别名。
 *
 * 真实实现：createGenericStateMachine(deps).execute(proposal, eventBus, userId, tx)。
 * 单独抽出为依赖，避免在 execute() 内强耦合 SM 的构造细节与 lifecycle/cascade
 * 依赖，便于测试 mock，也便于 T7 按域组装真实 SM 后注入。
 */
export type SmExecuteFn = (
  proposal: unknown,
  eventBus: EventBus,
  userId: USOM_ID,
  tx?: DbClient,
) => Promise<{ success: boolean; object?: unknown; error?: string }>

/**
 * 写入口运行期依赖（全部注入，便于测试与跨域组装）。
 */
export interface DomainMutationServiceDeps {
  /** 按 objectType 取得仓储适配器 */
  getRepository: (objectType: string, domainId: string) => GenericRepo
  /** 取得字段执行器（T6 真实实现 / 测试 mock） */
  getExecutor: () => FieldExecutor
  /** 按 domainId+objectType 取得 field_metadata（取自 manifest） */
  getFieldMetadata: (domainId: string, objectType: string) => Record<string, FieldMetadata>
  /** 单字段写路径用的 submitDynamicIntent（遗留，update() 已不使用；保留兼容） */
  submitDynamicIntent?: SubmitDynamicIntentFn
  /**
   * FactField 字段写完成发布的事件类型（per-domain 显式配置，F-6）。
   * tasks → 'TaskFieldUpdated'，habits → 'HabitFieldUpdated'。
   * 透传进 FieldExecutorContext.fieldUpdatedEventType。
   */
  fieldUpdatedEventType: SystemEventType
  /** 事件总线（execute 路径透传给 SM） */
  eventBus: EventBus
  /** db.transaction 别名（execute 路径用）；缺省时不开启顶层事务 */
  transaction?: TransactionFn
  /** tx 版 SM.execute 别名（execute 路径用） */
  smExecute?: SmExecuteFn
}

// ─── 结果类型 ──────────────────────────────────────────────────

/** 单字段写结果 */
export interface MutationResult {
  success: boolean
  /** 更新后的对象（execute 路径为最后一步 state 步骤产出；可能为 undefined） */
  object?: unknown
  /**
   * execute 路径：按步骤 tag 收集的中间产物（仅 state 步骤带 tag 的产出）。
   * update 路径不填充。供调用方获取中间步骤对象（如新建主线）。
   */
  objects?: Record<string, unknown>
  error?: string
}

/** 聚合写 execute() 的一步 */
export interface MutationStep {
  /** 步骤类型：field=字段写（先），state=状态转换（后，含 create） */
  kind: 'field' | 'state'
  /** field 步骤：字段名 */
  field?: string
  /** field 步骤：字段值 */
  value?: unknown
  /** state 步骤：状态动作（如 create/plan/start/complete/delete） */
  action?: string
  /** state 步骤：附加 payload（create 步骤的初始字段亦放此） */
  payload?: Record<string, unknown>
  /**
   * 步骤级目标对象 ID 覆盖。缺省用 intent.targetId。
   * 用于跨对象聚合（如 promoteToThread：建主线、迁子任务 threadId、软删原任务
   * 分属不同对象），使多对象写在同一顶层事务内原子完成。
   * create 步骤可置为 undefined（SM create 路径从 null 创建）。
   */
  targetId?: USOM_ID
  /**
   * 标记本 state 步骤为「创建新对象」（SM create 路径）。
   *
   * 背景（BUG-001）：仅靠 `step.targetId ?? intent.targetId` 无法区分「create 步骤
   * 显式 targetId=undefined（期望 SM 从 null 创建新对象）」与「步骤未设 targetId（期望
   * 回退 intent.targetId）」——`??` 对两者一视同仁回退到 intent.targetId，导致
   * promoteToThread 第一步 create thread 的 proposal.targetObject.id 被回退为原 task id，
   * SM 在 thread 表 findById → null → "对象不存在"，整条聚合回滚。
   *
   * 修复：create 步骤显式置 `create: true`，execute() 据此令 stepTargetId 保持
   * undefined（不回退 intent.targetId），SM.execute 检测 objectId 为 falsy 走 create 路径。
   */
  create?: boolean
  /** 步骤级对象类型覆盖（跨对象聚合时，建主线=thread、删任务=task）。缺省用 intent.objectType */
  objectType?: string
  /**
   * field 步骤：取值来源标记。为 true 时忽略 value，改用最近一次 state 步骤产出的
   * 对象 ID（lastObject.id）作为字段值。用于跨对象依赖（如 promoteToThread：
   * 先 create 主线，再用新主线 ID 作为子任务 threadId 字段值）。
   */
  valueFromLastObject?: boolean
  /**
   * 步骤标签。state 步骤产出对象会以 tag 为键收集到 execute() 结果的 objects 表中，
   * 供调用方获取中间步骤产物（如 promoteToThread 取新建主线的对象）。
   */
  tag?: string
}

/** 聚合写 execute() 的输入意图 */
export interface AggregateIntent {
  id: USOM_ID
  domainId: string
  objectType: string
  /** 目标对象 ID（聚合写的对象） */
  targetId: USOM_ID
  /** 有序步骤；服务按声明序执行，失败整体回滚 */
  steps: MutationStep[]
}

// ─── 工厂 ──────────────────────────────────────────────────────

/**
 * 创建业务事实写入口服务实例。
 *
 * @param deps - 运行期依赖（全部注入）
 */
export function createDomainMutationService(deps: DomainMutationServiceDeps) {
  const {
    getRepository,
    getExecutor,
    getFieldMetadata,
    fieldUpdatedEventType,
    eventBus,
    transaction,
    smExecute,
  } = deps

  /**
   * 解析目标字段的写入分类。缺省（未声明 mutation_mode）按 FactField 保守处理。
   */
  function resolveMutationMode(
    domainId: string,
    objectType: string,
    field: string,
  ): 'FactField' | 'ContentField' | 'PresentationField' {
    const meta = getFieldMetadata(domainId, objectType)?.[field]
    return meta?.mutation_mode ?? 'FactField'
  }

  return {
    /**
     * 单字段写（原子）。
     *
     * 按 mutation_mode 路由：
     *  - FactField → 直连注入的字段执行器（字段级校验 + updateFields +
     *    ctx.fieldUpdatedEventType 事件）。**不**走 submitDynamicIntent 全量 onValidate
     *    （eng-review TENSION-4→4A：单字段 FactField 走字段级校验）。
     *  - ContentField → 直走 Repository.updateFields（单条 UPDATE，不发业务事件）。
     *  - PresentationField → 本地态，不落库；返回成功但 object 为 undefined。
     *
     * @param id - 目标对象 ID
     * @param field - 字段名
     * @param value - 字段值
     * @param userId - 用户 ID（T-02）
     * @param domainId - 域 ID
     * @param objectType - 对象类型
     */
    async update(
      id: USOM_ID,
      field: string,
      value: unknown,
      userId: USOM_ID,
      domainId: string,
      objectType: string,
    ): Promise<MutationResult> {
      const mode = resolveMutationMode(domainId, objectType, field)
      const repo = getRepository(objectType, domainId)
      const fieldMetadata = getFieldMetadata(domainId, objectType)

      // FactField：直连字段执行器（字段级校验 + updateFields + 域配置的字段更新事件）
      if (mode === 'FactField') {
        const executor = getExecutor()
        try {
          const result: ValidationResult = await executor.execute(
            id,
            field,
            value,
            userId,
            {
              repo,
              eventBus,
              objectType,
              fieldMetadata,
              fieldUpdatedEventType,
              // update() 单字段写为原子单元，不开顶层事务（与 execute() 聚合路径不同）
              tx: undefined,
            },
          )
          if (result.kind === 'Rejected') {
            return { success: false, error: (result as any).errors?.join('; ') ?? '字段写入失败' }
          }
          return { success: true }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : '字段写入异常',
          }
        }
      }

      // PresentationField：本地态，不落库
      if (mode === 'PresentationField') {
        return { success: true }
      }

      // ContentField：直走仓储（不经全链路、不发业务事件）
      try {
        const object = await repo.updateFields(id, { [field]: value }, userId)
        return { success: true, object }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : '字段写入异常',
        }
      }
    },

    /**
     * 聚合/事务写。
     *
     * 自己开 db.transaction(tx => …)，在事务内按声明顺序执行步骤：
     *  - field 步骤 → 注入的字段执行器（透传 tx），含字段级校验
     *  - state 步骤 → 注入的 smExecute(proposal, eventBus, userId, tx)
     *
     * 步骤级 objectType / targetId 可覆盖（缺省取 intent 的），支持跨对象聚合
     * （如 promoteToThread：建主线、迁子任务 threadId、软删原任务分属不同对象）。
     * 同一对象的「先字段后状态」由调用方按声明顺序保证；跨对象的依赖顺序（如先
     * create 取得新 ID 再写子任务）同样由调用方组织。
     *
     * 任一步返回失败/抛异常即停止后续步骤，事务随回调抛出而整体回滚。
     * 不绕 submitDynamicIntent（其内部每次新建 Orchestrator，无法包跨步事务）。
     *
     * @param intent - 聚合写意图
     * @param userId - 用户 ID（T-02）
     */
    async execute(
      intent: AggregateIntent,
      userId: USOM_ID,
    ): Promise<MutationResult> {
      if (!transaction || !smExecute) {
        return {
          success: false,
          error: 'execute() 需注入 transaction 与 smExecute 依赖',
        }
      }

      const { domainId, steps } = intent

      try {
        return await transaction(async (tx) => {
          let lastObject: unknown
          const objects: Record<string, unknown> = {}
          for (const step of steps) {
            const stepObjectType = step.objectType ?? intent.objectType
            const fieldMetadata = getFieldMetadata(domainId, stepObjectType)
            const repo = getRepository(stepObjectType, domainId)

            // 字段写步骤
            if (step.kind === 'field') {
              const stepTargetId = step.targetId ?? intent.targetId
              // valueFromLastObject：取最近一次 state 步骤产出对象的 ID（跨对象依赖）
              const stepValue = step.valueFromLastObject
                ? (lastObject as { id?: USOM_ID } | undefined)?.id
                : step.value
              const executor = getExecutor()
              const result: ValidationResult = await executor.execute(
                stepTargetId,
                step.field!,
                stepValue,
                userId,
                {
                  repo,
                  eventBus,
                  objectType: stepObjectType,
                  fieldMetadata,
                  fieldUpdatedEventType,
                  tx,
                },
              )
              if (result.kind === 'Rejected') {
                throw new FieldMutationError((result as any).errors?.join('; ') ?? '字段写入失败')
              }
              continue
            }

            // 状态写步骤。
            // create 步骤（create:true）：保持 targetId 为 undefined，不回退 intent.targetId，
            // 使 SM.execute 检测 objectId 为 falsy 走 create 路径（修复 BUG-001）。
            // 非 create 步骤：缺省回退 intent.targetId（或用显式 targetId）。
            const stepTargetId = step.create === true ? undefined : (step.targetId ?? intent.targetId)
            const proposal = {
              id: crypto.randomUUID(),
              intentId: intent.id,
              targetObject: { type: stepObjectType, id: stepTargetId },
              action: step.action!,
              payload: step.payload ?? {},
              approvedAt: new Date().toISOString(),
              approvedBy: 'rule_engine',
            }
            const res = await smExecute(proposal, eventBus, userId, tx)
            if (!res.success) {
              throw new StateMutationError(res.error ?? '状态转换失败')
            }
            lastObject = res.object
            if (step.tag) objects[step.tag] = res.object
          }

          return { success: true, object: lastObject, objects }
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : '聚合写异常'
        return { success: false, error: message }
      }
    },
  }
}

/** 字段写失败（execute 内部用以触发事务回滚） */
class FieldMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldMutationError'
  }
}

/** 状态写失败（execute 内部用以触发事务回滚） */
class StateMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateMutationError'
  }
}

/** 写入口服务类型（供依赖注入签名引用） */
export type DomainMutationService = ReturnType<typeof createDomainMutationService>

// 重新导出构造器，便于调用方按需直接产出 ValidationResult
export { validationPassed, validationRejected }
