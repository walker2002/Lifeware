/**
 * @file index
 * @brief Field Executor — FactField 字段写的执行组件（业务事实写入口内部组件之一）
 *
 * 宪法 §III 业务事实写入口（1.11.0）：Field Executor 负责按 manifest
 * `field_metadata` 写单个 FactField 字段，并发布通用 `TaskFieldUpdated` 事件。
 *
 * 职责边界（与 State Machine 并列）：
 *  - 仅写「字段」，不触碰生命周期状态（状态写归 State Machine）。
 *  - 仅做**字段级校验**（按目标字段的 FieldMetadata 校验合法性，如枚举取值、
 *    数值非负等），**不**走 createTask/updateTask 的全量 onValidate——后者由
 *    写入口的 update() 经 Intent→Rule 链路完成。字段级校验独立、轻量、可单测。
 *  - 写入经 GenericRepo.updateFields（单条 UPDATE，禁读后写），遵循 R-01 仓储隔离。
 *
 * 可注入 tx 句柄：作为写入口顶层事务的子操作时由 domainMutationService 透传，
 * 单独使用时 tx 缺省回退到 db 单例（由 repo 内部处理）。
 *
 * @see docs/usom-design.md Section 4 / 宪法 §III
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, ValidationResult } from '@/usom/types/process'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { DbClient } from '@/lib/db'

/** Field Executor 单次执行的运行期依赖（由调用方注入） */
export interface FieldExecutorContext {
  /** 目标对象的仓储适配器（GenericRepo） */
  repo: GenericRepo
  /** 事件总线，用于发布 TaskFieldUpdated */
  eventBus: EventBus
  /** 目标对象类型（如 'task'），写入事件 payload */
  objectType: string
  /** 字段元数据表（取自 manifest field_metadata） */
  fieldMetadata: Record<string, FieldMetadata>
  /** 可选事务句柄（顶层写入口透传） */
  tx?: DbClient
}

/**
 * 字段级校验：仅按目标字段的 FieldMetadata 校验合法性。
 *
 * 校验项（保守、最小集）：
 *  - 字段必须存在于 fieldMetadata（未知字段拒绝，防止误写未声明字段）。
 *  - enum 类型：值必须在 options 列表内。
 *  - number 类型：必须为有限数值（NaN/Infinity 拒绝）；非负数约束（预估时长等
 *    业务字段不应为负）。
 *  - 其它类型（string/date/...）当前不额外约束（MVP 保守放开）。
 *
 * 不走 onValidate：本函数是字段级快校验，与全量意图校验正交。
 *
 * @returns ValidationResult（Passed | Rejected）
 */
function validateField(
  field: string,
  value: unknown,
  meta: FieldMetadata,
): ValidationResult {
  // enum 取值校验
  if (meta.type === 'enum') {
    const options = meta.options ?? []
    if (!options.includes(value as string)) {
      return validationRejected([
        `字段 "${field}" 的值 "${String(value)}" 不在合法枚举内：[${options.join(', ')}]`,
      ])
    }
  }

  // number 合法性校验
  if (meta.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return validationRejected([`字段 "${field}" 要求 number，得到 ${typeof value}`])
    }
    if (value < 0) {
      return validationRejected([`字段 "${field}" 不允许为负数：${value}`])
    }
  }

  return validationPassed()
}

/**
 * 创建字段执行器实例。
 *
 * 采用工厂函数形式，便于 T6 提供真实实现、T5 单测注入 mock。
 * 当前实现无内部状态，工厂保持稳定签名以利未来扩展（如统一的校验规则注入）。
 */
export function createFieldExecutor() {
  return {
    /**
     * 执行单个 FactField 字段写。
     *
     * 流程：字段级校验 → repo.updateFields 写库 → 发 TaskFieldUpdated 事件。
     * 任一前置校验失败立即返回 Rejected，不写库不发事件。
     *
     * @param id - 目标对象 ID
     * @param field - 字段名（须在 fieldMetadata 中声明）
     * @param value - 字段值
     * @param userId - 用户 ID（多租户 T-02）
     * @param ctx - 运行期依赖（repo/eventBus/objectType/fieldMetadata/tx?）
     * @returns ValidationResult（Passed=写成功 / Rejected=校验失败）
     */
    async execute(
      id: USOM_ID,
      field: string,
      value: unknown,
      userId: USOM_ID,
      ctx: FieldExecutorContext,
    ): Promise<ValidationResult> {
      const meta = ctx.fieldMetadata[field]
      if (!meta) {
        return validationRejected([
          `字段 "${field}" 未在 field_metadata 中声明，拒绝写入`,
        ])
      }

      // 字段级校验（独立于全量 onValidate）
      const check = validateField(field, value, meta)
      if (check.kind === 'Rejected') {
        return check
      }

      // 写库：单条 UPDATE，透传 tx（顶层事务子操作时）
      await ctx.repo.updateFields(id, { [field]: value }, userId, ctx.tx)

      // 发通用 TaskFieldUpdated 事件
      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: 'TaskFieldUpdated',
        occurredAt: new Date().toISOString() as Timestamp,
        triggeredBy: 'state_machine',
        payload: {
          objectId: id,
          field,
          value,
          objectType: ctx.objectType,
        },
        snapshotId: '' as USOM_ID,
      }
      ctx.eventBus.publish(event)

      return validationPassed()
    },
  }
}

/** Field Executor 实例类型（供依赖注入签名引用） */
export type FieldExecutor = ReturnType<typeof createFieldExecutor>
