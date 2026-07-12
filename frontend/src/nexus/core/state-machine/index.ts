/**
 * @file index
 * @brief 对象生命周期状态机执行器
 *
 * 通用版：接收 LifecycleDefinition 驱动多域状态转换
 * 接收已批准的 StateProposal，执行状态转换，持久化并发布事件
 *
 * 事务管道（T4）：execute 支持可选 tx 句柄，向下透传给 repo 的写操作
 * （findById/save/create/updateStatus），使 SM 可作为写入口顶层事务的子操作。
 * 注：eventRepo.append 与 cascade 当前未纳入 tx，详见 execute 内注释。
 *
 * @see docs/usom-design.md Section 4.2.3
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { LifecycleDefinition, FieldMetadata, LifecycleTransition } from '@/usom/types/domain-types'
import type { ParentChildStatusRule, CascadeResult } from './cascade'
import type { DbClient } from '@/lib/db'

// ─── 通用 State Machine ────────────────────────────────────────

/**
 * 状态机执行结果接口
 * @property success - 是否成功
 * @property object - 操作后的对象
 * @property event - 生成的系统事件
 * @property error - 错误信息
 * @property cascadeResults - Cascade 执行结果
 */
export interface StateMachineResult {
  success: boolean
  object?: Record<string, unknown>
  event?: SystemEvent
  error?: string
  /** Cascade 执行结果 */
  cascadeResults?: CascadeResult[]
}

/**
 * 通用仓储接口
 *
 * 提供 SM 所需的最小 CRUD 能力，每个 Domain 通过
 * GenericRepoAdapter 将具体 Repository 映射到此接口。
 */
export interface GenericRepo {
  /**
   * 根据 ID 查找对象
   * @param id - 对象 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   * @returns 对象或 null
   */
  findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>

  /**
   * 保存对象（创建或全量更新）
   * @param obj - 对象数据（必须含 id 字段）
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   */
  save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>

  /**
   * 创建新对象，内部生成 ID，返回含 ID 的完整对象
   * @param fields - 对象字段（不含 id、createdAt、updatedAt、status）
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   * @returns 含生成 ID 和默认字段的完整对象
   */
  create(fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>

  /**
   * 更新对象状态（[022.01] Phase 3：可选 —— Objective/KeyResult 无 status 字段，
   * 仅保留 Cycle/Task/Habit/Thread 等仍持有 status 的对象实现此方法）。
   * @param id - 对象 ID
   * @param toStatus - 目标状态
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   * @returns 更新后的完整对象
   */
  updateStatus?(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>

  /**
   * 局部字段更新（FactField 字段写的统一通道）。
   *
   * 单条 UPDATE，**禁止读后写**（消除 N+1）：直接以 `update().set(fields).where(id 且 userId)`
   * 一次完成，不先 findById。多租户 T-02：where 子句必含 userId 过滤。
   *
   * [TD-003] T2：OCC 乐观并发控制扩展（timebox 域生效，其余域暂接受参数但
   * 不强制 WHERE 谓词）。expectedOccVersion 用于仓储层 OCC 谓词：
   * - timebox 域：WHERE 加 occ_version = expectedOccVersion；0 rows → ConflictError
   * - 其他域：参数透传，运行时未强制（TD-037 P6 deferred）
   *
   * 参数顺序说明：expectedOccVersion 放在 tx **之前**（timebox 域 OCC 必填位置），
   * 与 ITimeboxRepository.updateFields 5 参位置一致。Optional 是为了不破坏 tasks/
   * habits/okrs 等非 timebox 域 adapter 当前 4 参调用（adapter 内默认 0 → 不强制）。
   *
   * @param id - 对象 ID
   * @param fields - 待更新字段（驼峰键，与 schema 列属性名一致）
   * @param userId - 用户 ID
   * @param expectedOccVersion - caller 认为的当前 occ_version（timebox 必填；其余域可选，默认 0）
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   * @returns 更新后的完整对象（更新后回读一次以返回最新 USOM 对象）
   */
  updateFields(
    id: USOM_ID,
    fields: Record<string, unknown>,
    userId: USOM_ID,
    expectedOccVersion?: number,
    tx?: DbClient,
  ): Promise<Record<string, unknown>>

  /**
   * 删除草稿对象（可选，仅支持草稿状态删除的 Domain）
   * @param id - 对象 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   */
  deleteDraft?(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>

  /**
   * 根据父对象 ID 查询子对象列表（用于 cascade）
   * @param parentId - 父对象 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄（缺省回退到 db 单例）
   * @returns 子对象列表
   */
  findByParent?(parentId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>[]>
}

/**
 * 通用状态机依赖接口
 * @property getRepository - 获取仓储的函数
 * @property eventRepo - 系统事件仓储
 * @property getLifecycle - 获取生命周期定义的函数
 * @property getFieldMetadata - 获取字段元数据的函数（可选）
 */
export interface GenericStateMachineDeps {
  getRepository: (objectType: string) => GenericRepo
  eventRepo: ISystemEventRepository
  getLifecycle: (domainId: string, objectType: string) => LifecycleDefinition
  getFieldMetadata?: (domainId: string, objectType: string) => Record<string, FieldMetadata>
  /** 获取 cascade 规则（可选，从 manifest cascade_rules 读取） */
  getCascadeRules?: (domainId: string) => ParentChildStatusRule[]
  /** 域 ID（用于 cascade 规则查找） */
  domainId?: string
}

/**
 * 查找生命周期转换规则
 * @param lifecycle - 生命周期定义
 * @param fromState - 当前状态
 * @param action - 动作
 * @returns 转换规则或undefined
 */
function findLifecycleTransition(
  lifecycle: LifecycleDefinition,
  fromState: string | null,
  action: string,
): LifecycleTransition | undefined {
  return lifecycle.transitions.find(t => {
    const fromMatch = t.from === null
      ? fromState === null
      : Array.isArray(t.from)
        ? t.from.includes(fromState!)
        : t.from === fromState
    return fromMatch && t.action === action
  })
}

/**
 * 获取生命周期时间戳字段列表
 * @param fieldMeta - 字段元数据
 * @returns 时间戳字段名列表
 */
function getLifecycleTimestampFields(
  fieldMeta: Record<string, FieldMetadata> | undefined,
): string[] {
  if (!fieldMeta) return []
  return Object.entries(fieldMeta)
    .filter(([, meta]) => meta.type === 'lifecycle_timestamp')
    .map(([fieldName]) => fieldName)
}

/**
 * 构建动作-时间戳映射
 * @param lifecycle - 生命周期定义
 * @param fieldMeta - 字段元数据
 * @returns 动作到时间戳字段的映射
 */
function buildActionTimestampMap(
  lifecycle: LifecycleDefinition,
  fieldMeta: Record<string, FieldMetadata> | undefined,
): Record<string, string> {
  const timestampFields = new Set(getLifecycleTimestampFields(fieldMeta))
  if (timestampFields.size === 0) return {}

  const map: Record<string, string> = {}
  for (const t of lifecycle.transitions) {
    const candidates = [`${t.action}edAt`, `${t.action}At`, `${t.action}dAt`]
    for (const candidate of candidates) {
      if (timestampFields.has(candidate)) {
        map[t.action] = candidate
        break
      }
    }
  }
  return map
}

/**
 * 创建通用状态机实例
 * @param deps - 依赖项
 * @returns 通用状态机实例
 */
export function createGenericStateMachine(deps: GenericStateMachineDeps) {
  const { getRepository, eventRepo, getLifecycle, getFieldMetadata } = deps

  return {
    /**
     * 执行状态转换
     * @param proposal - 状态提案
     * @param eventBus - 事件总线
     * @param userId - 用户ID
     * @param tx - 可选事务句柄；由写入口（domainMutationService）顶层持有并透传，
     *             使 SM 与字段执行器作为同一事务内的子操作。缺省（undefined）时
     *             repo 各方法回退到 db 单例，保持向后兼容。
     * @returns 执行结果
     */
    async execute(
      proposal: StateProposal,
      eventBus: EventBus,
      userId: USOM_ID,
      tx?: DbClient,
    ): Promise<StateMachineResult> {
      const now = new Date().toISOString() as Timestamp
      const objectType = proposal.targetObject.type
      // domainId 与 objectType 可能不同（如 tasks 域下的 thread 对象），
      // 使用 deps.domainId（由 Orchestrator 传入）作为 domain 参数
      const domainId = deps.domainId ?? objectType

      // 获取该对象类型的 lifecycle
      const lifecycle = getLifecycle(domainId, objectType)
      const fieldMeta = getFieldMetadata?.(domainId, objectType)

      // 1. 确定 fromState
      let fromState: string | null = null
      let existingObject: Record<string, unknown> | null = null
      const objectId = proposal.targetObject.id

      if (objectId) {
        const repo = getRepository(objectType)
        existingObject = await repo.findById(objectId, userId, tx)
        if (!existingObject) {
          return { success: false, error: '对象不存在' }
        }
        fromState = existingObject.status as string

        // 检查 terminal state
        if (lifecycle.terminal_states.includes(fromState)) {
          return { success: false, error: `非法转换: 当前状态 "${fromState}" 为终态` }
        }
      }

      // 2. 查找转换规则
      const transition = findLifecycleTransition(lifecycle, fromState, proposal.action)
      if (!transition) {
        return {
          success: false,
          error: `非法状态转换: action="${proposal.action}", fromState="${fromState}"`,
        }
      }

      // 3. 构造目标对象并持久化
      let object: Record<string, unknown>
      const lifecycleTimestampFields = getLifecycleTimestampFields(fieldMeta)
      const repo = getRepository(objectType)

      if (existingObject) {
        // 状态转换：使用 updateStatus（透传 tx）。[022.01] Phase 3：Objective/KeyResult
        // 无 status 字段，GenericRepo.updateStatus 为可选；缺失则降级为 save() 全量回写。
        if (typeof repo.updateStatus === 'function') {
          object = await repo.updateStatus(objectId!, transition.to as string, userId, tx)
        } else {
          object = { ...existingObject, status: transition.to, updatedAt: now }
          await repo.save(object, userId, tx)
        }

        // 自动设置 lifecycle_timestamp 字段
        const actionTimestampMap = buildActionTimestampMap(lifecycle, fieldMeta)
        const timestampKey = actionTimestampMap[proposal.action]
        if (timestampKey && lifecycleTimestampFields.includes(timestampKey)) {
          object = { ...object, [timestampKey]: now }
          await repo.save(object, userId, tx)
        }

        // [023.13] T0 AM1 — executionRecord 列持久化基础修复 (P0)
        // 问题：updateStatus 只写 {status, updatedAt}，proposal.payload['executionRecord']
        //   永不入库，导致 ExecutionLogged 事件触发后 timeboxes.execution_record 列恒为 null。
        //   修复：log 类 transition 携带 executionRecord 时，updateStatus 之后立即用
        //   updateFields 单 UPDATE 写一列（沿用 lifecycle_timestamp 后写范式，同 tx 原子）。
        //   守卫：AM3 兼容 — executionRecord 为 undefined 时跳过本分支（T5 显式 null 清空走
        //   updateFields 单独路径）；executionRecord 类型断言避免 TS 联合过严。
        const executionRecord = proposal.payload['executionRecord']
        if (executionRecord !== undefined && transition.to === 'logged') {
          // [TD-003] whole-branch review I-4：防御性 re-read 替换 `?? 0` 回退。
          // 原逻辑从 `object` 读 occVersion，但 updateStatus 路径不保证 occ_version
          // 已 +1（timebox generic adapter 的 updateStatus 走 save()，不动 occVersion）。
          // ?? 0 会让 updateFields 的 WHERE occ_version=0 必 0 rows → 抛 ConflictError，
          // 阻断合法 logged transition。
          // 修复：从 repo 重新 findById 拿最新 occVersion（同一 tx 内 READ COMMITTED
          // 一致性，T2 updateFields 后已被同一事务读到的版本应仍是 current）。
          const reRead = await repo.findById(objectId!, userId, tx)
          const currentOccVersion = (reRead as { occVersion?: number } | null)?.occVersion ?? -1
          if (currentOccVersion < 0) {
            // 行已不存在（极小窗口：updateStatus 与 findById 之间被删），抛错
            throw new Error(`[TD-003 I-4] Timebox ${objectId} 找不到，logged transition 失败`)
          }
          object = await repo.updateFields(
            objectId!,
            { executionRecord },
            userId,
            currentOccVersion,
            tx,
          )
        }
      } else {
        // 创建：注入目标 status，由 Repository 一次写入（透传 tx）
        const createPayload = { ...proposal.payload, status: transition.to }
        object = await repo.create(createPayload, userId, tx)
      }

      // 5. 构造并持久化 SystemEvent
      // 注：eventRepo.append 当前未纳入 tx（ISystemEventRepository 接口未定义 tx 参数，
      // 改造会波及实现与所有调用方，超出 T4 范围）。事件为 append-only，
      // 即使后续步骤回滚，已写入的事件不影响数据正确性（事件只是历史记录）。
      // T5/T9 若需「事件随状态一起回滚」，应给 ISystemEventRepository.append 增加可选 tx。
      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: transition.event_type as SystemEvent['type'],
        occurredAt: now,
        triggeredBy: 'state_machine',
        payload: {
          objectId: object.id,
          intentId: proposal.intentId,
          proposalId: proposal.id,
          fromStatus: fromState,
          toStatus: transition.to,
        },
        snapshotId: '' as USOM_ID,
      }

      await eventRepo.append(event, userId)
      eventBus.publish(event)

      // 6. 如果涉及执行记录，发射通用 ExecutionLogged 事件
      if (transition.event_type === 'TimeboxLogged' || transition.event_type === 'HabitLogged') {
        const executionRecord = proposal.payload['executionRecord'] as Record<string, unknown> | undefined
        if (executionRecord) {
          const sourceType = objectType === 'timebox' ? 'timebox' : objectType === 'habit_log' ? 'habit' : 'task'
          const executionLoggedEvent: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'ExecutionLogged' as SystemEvent['type'],
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: {
              sourceType,
              targetType: objectType,
              targetId: object.id,
              executionRecord,
              originalEventType: transition.event_type,
            },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(executionLoggedEvent, userId)
          eventBus.publish(executionLoggedEvent)
        }
      }

      // 6. Cascade 处理
      let cascadeResults: CascadeResult[] = []
      if (deps.getCascadeRules && deps.domainId) {
        const cascadeRules = deps.getCascadeRules(deps.domainId)
        for (const rule of cascadeRules) {
          const { executeCascade } = await import('./cascade')
          const cascadeResult = await executeCascade({
            rule,
            parentObjectType: objectType,
            parentAction: proposal.action,
            parentId: object.id as USOM_ID,
            userId,
            getRepo: (_domainId: string, objType: string) => deps.getRepository(objType),
          })
          cascadeResults.push(...cascadeResult)
        }
      }

      return { success: true, object, event, cascadeResults }
    },
  }
}
