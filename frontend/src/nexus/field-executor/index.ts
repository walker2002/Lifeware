/**
 * @file index
 * @brief Field Executor — FactField 字段写的执行组件（业务事实写入口内部组件之一）
 *
 * 宪法 §III 业务事实写入口（1.11.0）：Field Executor 负责按 manifest
 * `field_metadata` 写 FactField 字段，并发布域配置的字段更新事件（per-domain，F-6）。
 *
 * 职责边界（与 State Machine 并列）：
 *  - 仅写「字段」，不触碰生命周期状态（状态写归 State Machine）。
 *  - 仅做**字段级校验**（按目标字段的 FieldMetadata 校验合法性，如枚举取值、
 *    数值非负、time HH:MM 格式等），**不**走 createTask/updateTask 的全量 onValidate——后者由
 *    写入口的 update() 经 Intent→Rule 链路完成。字段级校验独立、轻量、可单测。
 *  - 写入经 GenericRepo.updateFields（单条 UPDATE，禁读后写），遵循 R-01 仓储隔离。
 *
 * 两个执行入口：
 *  - `execute(id, field, value, userId, ctx)`：单字段写，向后兼容（domain-mutation-service
 *    update() 路径仍调用）。**Deprecated**，新代码请用 executeBatch。
 *  - `executeBatch(targetId, steps[], userId, ctx)`：[TD-003] T3 batch OCC——validate-all-first +
 *    single atomic repo.updateFields(dict) + post-write events。消除 per-field 多次 atomic UPDATE
 *    触发的 multi-field OCC self-conflict（Codex P0.1）。expectedOccVersion 优先用
 *    `step.expectedOccVersion`（caller 透传），fallback 用 `repo.findById` 读 current——**禁
 *    硬码 0**（timebox 域并发场景会静默失败）。
 *
 * 可注入 tx 句柄：作为写入口顶层事务的子操作时由 domainMutationService 透传，
 * 单独使用时 tx 缺省回退到 db 单例（由 repo 内部处理）。
 *
 * @see docs/usom-design.md Section 4 / 宪法 §III
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType, ValidationResult } from '@/usom/types/process'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { DbClient } from '@/lib/db'

/** Field Executor 单次执行的运行期依赖（由调用方注入） */
export interface FieldExecutorContext {
  /** 目标对象的仓储适配器（GenericRepo） */
  repo: GenericRepo
  /** 事件总线，用于发布域配置的字段更新事件 */
  eventBus: EventBus
  /** 目标对象类型（如 'task' / 'habit'），写入事件 payload */
  objectType: string
  /** 字段元数据表（取自 manifest field_metadata） */
  fieldMetadata: Record<string, FieldMetadata>
  /**
   * 字段写完成后发布的事件类型（per-domain 显式配置，F-6 参数化）。
   * tasks → 'TaskFieldUpdated'，habits → 'HabitFieldUpdated'。
   */
  fieldUpdatedEventType: SystemEventType
  /** 可选事务句柄（顶层写入口透传） */
  tx?: DbClient
}

/**
 * Batch 写单步 input。[TD-003] T3 executeBatch 入参。
 *
 * - `expectedOccVersion`：caller 主动透传的 OCC 版本号。聚合写（如 editTimeboxes 一次
 *   多字段）场景里 drawer 持有 current occVersion，必须显式传——否则并发场景会静默失败
 *   （timebox 域 timeboxes 表 + OCC 后硬码 0 必抛 ConflictError）。缺省时 executor
 *   内部 `repo.findById` 读 current（向后兼容，**有 read-then-write race window**，
 *   推荐 caller 主动传）。
 */
export interface BatchFieldStep {
  field: string
  value: unknown
  /** 可选 OCC 版本号（caller 透传时优先用，缺省回退到 repo.findById） */
  expectedOccVersion?: number
}

/**
 * HH:MM 时间格式正则（两位时:两位分，00:00–23:59）。
 *
 * 与 src/domains/habits/validation.ts 的 HH_MM_REGEX 同源——为避免 Nexus 核心层
 * 反向依赖具体 domain（Nexus 不应 import domains/habits），此处就地保留一份；
 * 待未来「公共校验工厂」切片统一抽取到共享位置。
 */
const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * 字段级校验：仅按目标字段的 FieldMetadata 校验合法性。
 *
 * 校验项（保守、最小集）：
 *  - 字段必须存在于 fieldMetadata（未知字段拒绝，防止误写未声明字段）。
 *  - enum 类型：值必须在 options 列表内。
 *  - number 类型：必须为有限数值（NaN/Infinity 拒绝）；非负数约束（预估时长等
 *    业务字段不应为负）。
 *  - time 类型：必须为合法 HH:MM（00:00–23:59，两位时分），如 "09:30"。
 *  - 其它类型（string/date/json/boolean/...）当前不额外约束（MVP 保守放开）。
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

  // time 格式校验（HH:MM，00:00–23:59，两位时分）
  if (meta.type === 'time') {
    if (typeof value !== 'string' || !HH_MM_REGEX.test(value)) {
      return validationRejected([
        `字段 "${field}" 要求合法 HH:MM（00:00–23:59），得到 "${String(value)}"`,
      ])
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
     * 执行单个 FactField 字段写（**向后兼容保留**，新代码请用 executeBatch）。
     *
     * 流程：字段级校验 → repo.updateFields 写库 → 发 ctx.fieldUpdatedEventType 事件。
     * 任一前置校验失败立即返回 Rejected，不写库不发事件。
     *
     * 注意：此 API 仅供 domain-mutation-service.update() 单字段写路径使用；聚合写
     * （promoteToThread / 跨字段事务）必须用 executeBatch。
     *
     * @param id - 目标对象 ID
     * @param field - 字段名（须在 fieldMetadata 中声明）
     * @param value - 字段值
     * @param userId - 用户 ID（多租户 T-02）
     * @param ctx - 运行期依赖（repo/eventBus/objectType/fieldMetadata/fieldUpdatedEventType/tx?）
     * @returns ValidationResult（Passed=写成功 / Rejected=校验失败）
     */
    async execute(
      id: USOM_ID,
      field: string,
      value: unknown,
      userId: USOM_ID,
      ctx: FieldExecutorContext,
    ): Promise<ValidationResult> {
      // 单字段写路径（**向后兼容保留**）——保持与原实现等价：
      // 1) 字段级校验；2) 单 atomic repo.updateFields；3) 发 event。
      // 注：本路径仍传 `0`（legacy 语义），适配 tasks/habits/okrs 等未实施 OCC 的域。
      // **新代码（timebox 聚合写）请用 executeBatch**——它消除 0 占位符，
      // 通过 step.expectedOccVersion 或 repo.findById 读 current。
      const meta = ctx.fieldMetadata[field]
      if (!meta) {
        return validationRejected([
          `字段 "${field}" 未在 field_metadata 中声明，拒绝写入`,
        ])
      }
      const check = validateField(field, value, meta)
      if (check.kind === 'Rejected') {
        return check
      }
      // 单字段 atomic UPDATE：legacy 0 透传（non-timebox 域 GenericRepo adapter
      // 不读此值；timebox 域将在 T4 updateTimebox action 切到 executeBatch 后
      // 完全不再走本路径）。
      await ctx.repo.updateFields(id, { [field]: value }, userId, 0, ctx.tx)
      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: ctx.fieldUpdatedEventType,
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

    /**
     * Batch 写（[TD-003] T3）——validate-all-first + single atomic
     * repo.updateFields(dict) + post-write events。
     *
     * Phase 1：validate all field steps（任一 Rejected 即中止，返回 Rejected，
     *          **不**调 repo，**不**发 events）。
     * Phase 2：1 atomic repo.updateFields(targetId, { ...allFields }, userId,
     *          expectedOccVersion, tx) call。ConflictError 时 propagate（不被 catch）。
     * Phase 3：emit N FieldUpdatedEvent post-write（按 fieldSteps 顺序）。
     *
     * expectedOccVersion 解析：
     *  - 优先用 steps[0].expectedOccVersion（caller 透传——drawer 持有的 current）
     *  - fallback 用 repo.findById(targetId, userId, tx) 读 current occVersion
     *
     * **绝不可硬码 0**：timebox 域并发场景会静默失败（timeboxes 表 OCC 谓词
     * `expectedOccVersion = 0` 必 0 rows → ConflictError）。
     *
     * @param targetId - 目标对象 ID
     * @param steps - BatchFieldStep[]（caller 可选透传 expectedOccVersion）
     * @param userId - 用户 ID（多租户 T-02）
     * @param ctx - 运行期依赖
     * @returns ValidationResult（Passed=写成功 / Rejected=校验失败）
     */
    async executeBatch(
      targetId: USOM_ID,
      steps: BatchFieldStep[],
      userId: USOM_ID,
      ctx: FieldExecutorContext,
    ): Promise<ValidationResult> {
      const { repo, eventBus, objectType, fieldMetadata, fieldUpdatedEventType, tx } = ctx

      // 早退：无 field 步骤时（state-only 聚合场景，execute 路径由 caller 兜底），跳过写。
      // 不调 repo.updateFields(targetId, {})（空 dict UPDATE 在某些 PG 版本会报缺 SET 子句），
      // 也不发 events。
      if (steps.length === 0) {
        return validationPassed()
      }

      // Phase 1：validate all field steps（无写）
      // 沿用既有 ValidationResult 机制。未知字段拒绝（与单字段路径语义一致）。
      for (const step of steps) {
        const meta = fieldMetadata[step.field]
        if (!meta) {
          return validationRejected([
            `字段 "${step.field}" 未在 field_metadata 中声明，拒绝写入`,
          ])
        }
        const check = validateField(step.field, step.value, meta)
        if (check.kind === 'Rejected') {
          return check
        }
      }

      // Phase 2：1 atomic write——OCC 关掉 in single UPDATE。
      // expectedOccVersion 解析：caller 透传 > repo.findById 读 current。
      // 严禁硬码 0（timebox 域并发场景静默失败，T2 reviewer I-2）。
      const callerOccVersion = steps.find(s => s.expectedOccVersion !== undefined)?.expectedOccVersion
      let expectedOccVersion: number
      if (callerOccVersion !== undefined) {
        expectedOccVersion = callerOccVersion
      } else {
        const current = await repo.findById(targetId, userId, tx)
        if (!current) {
          // 对象不存在：抛 Error（与单字段路径抛「字段未声明」语义对齐——拒绝静默失败）。
          throw new Error(`Object ${targetId} not found (executeBatch: findById returned null)`)
        }
        // occVersion 字段在 T2 已加到 USOM Timebox type；其他域尚未加。
        // 缺失时抛错（fail-fast，避免 OCC 谓词与 undefined 0 误判）。
        const occ = (current as { occVersion?: number }).occVersion
        if (typeof occ !== 'number') {
          throw new Error(
            `Object ${targetId} 缺 occVersion 字段——caller 必须显式透传 expectedOccVersion，`
            + `或先 T2/T4 实施该域 OCC`,
          )
        }
        expectedOccVersion = occ
      }

      // 聚合所有 field step 为 dict，1 次 atomic UPDATE。
      const fieldsDict: Record<string, unknown> = {}
      for (const step of steps) {
        fieldsDict[step.field] = step.value
      }

      // 单 atomic 写。ConflictError 时直接 propagate（不被 catch）——caller
      // （domain-mutation-service.execute / updateTimebox action）负责捕获并 UX。
      await repo.updateFields(targetId, fieldsDict, userId, expectedOccVersion, tx)

      // Phase 3：emit N FieldUpdatedEvent post-write。
      // 顺序按 steps 声明顺序，事件 type 取自 ctx.fieldUpdatedEventType。
      const occurredAt = new Date().toISOString() as Timestamp
      for (const step of steps) {
        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: fieldUpdatedEventType,
          occurredAt,
          triggeredBy: 'state_machine',
          payload: {
            objectId: targetId,
            field: step.field,
            value: step.value,
            objectType,
          },
          snapshotId: '' as USOM_ID,
        }
        eventBus.publish(event)
      }

      return validationPassed()
    },
  }
}

/** Field Executor 实例类型（供依赖注入签名引用） */
export type FieldExecutor = ReturnType<typeof createFieldExecutor>
