/**
 * @file index
 * @brief 对象生命周期状态机执行器
 * 
 * 通用版：接收 LifecycleDefinition 驱动多域状态转换
 * 接收已批准的 StateProposal，执行状态转换，持久化并发布事件
 * 
 * @see docs/usom-design.md Section 4.2.3
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { LifecycleDefinition, FieldMetadata, LifecycleTransition } from '@/usom/types/domain-types'
import type { ParentChildStatusRule, CascadeResult } from './cascade'
import { findTransition, timeboxTransitions } from '@/domains/timebox/transitions'

// ─── 旧版接口（向后兼容，Phase 7 移除） ─────────────────────────
/**
 * 状态机执行结果接口
 * @property success - 是否成功
 * @property object - 操作后的对象
 * @property event - 生成的系统事件
 * @property error - 错误信息
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
 * 状态机依赖接口（旧版，向后兼容）
 * @property timeboxRepo - 时间盒仓储
 * @property eventRepo - 系统事件仓储
 */
export interface StateMachineDeps {
  timeboxRepo: { findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>; save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void> }
  eventRepo: ISystemEventRepository
}

/**
 * 时间盒状态机接口
 */
export interface TimeboxStateMachine {
  /**
   * 执行状态转换
   * @param proposal - 状态提案
   * @param eventBus - 事件总线
   * @param userId - 用户ID
   * @returns 执行结果
   */
  execute(proposal: StateProposal, eventBus: EventBus, userId: USOM_ID): Promise<StateMachineResult>
}

/**
 * 创建时间盒状态机实例（旧版，向后兼容）
 * @param deps - 依赖项
 * @returns 时间盒状态机实例
 */
export function createTimeboxStateMachine(deps: StateMachineDeps): TimeboxStateMachine {
  const { timeboxRepo, eventRepo } = deps

  return {
    /**
     * 执行时间盒状态转换
     * @param proposal - 状态提案
     * @param eventBus - 事件总线
     * @param userId - 用户ID
     * @returns 执行结果
     */
    async execute(proposal, eventBus, userId): Promise<StateMachineResult> {
      const now = new Date().toISOString() as Timestamp

      let fromState: string | null = null
      let existingObject: Record<string, unknown> | null = null
      const objectId = proposal.targetObject.id

      if (objectId) {
        existingObject = await timeboxRepo.findById(objectId, userId)
        if (!existingObject) {
          return { success: false, error: '时间盒不存在' }
        }
        fromState = existingObject.status as string
      }

      const transition = findTransition(timeboxTransitions, fromState, proposal.action)
      if (!transition) {
        return {
          success: false,
          error: `非法状态转换: action="${proposal.action}", fromState="${fromState}"`,
        }
      }

      let object: Record<string, unknown>

      if (existingObject) {
        object = {
          ...existingObject,
          status: transition.to,
          updatedAt: now,
        }

        if (proposal.action === 'start') {
          object.startedAt = now
        } else if (proposal.action === 'end') {
          object.endedAt = now
        } else if (proposal.action === 'overtime') {
          object.overtimeAt = now
        }
      } else {
        const id = crypto.randomUUID() as USOM_ID
        object = {
          id,
          status: transition.to,
          createdAt: now,
          updatedAt: now,
          ...proposal.payload,
        }
      }

      await timeboxRepo.save(object, userId)

      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: transition.eventType,
        occurredAt: now,
        triggeredBy: 'state_machine',
        payload: {
          timeboxId: object.id,
          intentId: proposal.intentId,
          proposalId: proposal.id,
          fromStatus: fromState,
          toStatus: transition.to,
        },
        snapshotId: '' as USOM_ID,
      }

      await eventRepo.append(event, userId)
      eventBus.publish(event)

      return { success: true, object, event }
    },
  }
}

// ─── 通用 State Machine ────────────────────────────────────────

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
   * @returns 对象或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>

  /**
   * 保存对象（创建或全量更新）
   * @param obj - 对象数据（必须含 id 字段）
   * @param userId - 用户 ID
   */
  save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>

  /**
   * 创建新对象，内部生成 ID，返回含 ID 的完整对象
   * @param fields - 对象字段（不含 id、createdAt、updatedAt、status）
   * @param userId - 用户 ID
   * @returns 含生成 ID 和默认字段的完整对象
   */
  create(fields: Record<string, unknown>, userId: USOM_ID): Promise<Record<string, unknown>>

  /**
   * 更新对象状态
   * @param id - 对象 ID
   * @param toStatus - 目标状态
   * @param userId - 用户 ID
   * @returns 更新后的完整对象
   */
  updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID): Promise<Record<string, unknown>>

  /**
   * 删除草稿对象（可选，仅支持草稿状态删除的 Domain）
   * @param id - 对象 ID
   * @param userId - 用户 ID
   */
  deleteDraft?(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 根据父对象 ID 查询子对象列表（用于 cascade）
   * @param parentId - 父对象 ID
   * @param userId - 用户 ID
   * @returns 子对象列表
   */
  findByParent?(parentId: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown>[]>
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
     * @returns 执行结果
     */
    async execute(
      proposal: StateProposal,
      eventBus: EventBus,
      userId: USOM_ID,
    ): Promise<StateMachineResult> {
      const now = new Date().toISOString() as Timestamp
      const objectType = proposal.targetObject.type

      // 获取该对象类型的 lifecycle
      const lifecycle = getLifecycle(objectType, objectType)
      const fieldMeta = getFieldMetadata?.(objectType, objectType)

      // 1. 确定 fromState
      let fromState: string | null = null
      let existingObject: Record<string, unknown> | null = null
      const objectId = proposal.targetObject.id

      if (objectId) {
        const repo = getRepository(objectType)
        existingObject = await repo.findById(objectId, userId)
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
        // 状态转换：使用 updateStatus
        object = await repo.updateStatus(objectId!, transition.to as string, userId)

        // 自动设置 lifecycle_timestamp 字段
        const actionTimestampMap = buildActionTimestampMap(lifecycle, fieldMeta)
        const timestampKey = actionTimestampMap[proposal.action]
        if (timestampKey && lifecycleTimestampFields.includes(timestampKey)) {
          object = { ...object, [timestampKey]: now }
          await repo.save(object, userId)
        }
      } else {
        // 创建：使用 repo.create，由 Repository 负责 ID 生成和字段映射
        object = await repo.create(proposal.payload, userId)

        // 确保 status 正确（Repository 可能不知道目标 status）
        if (object.status !== transition.to) {
          object = { ...object, status: transition.to }
          await repo.save(object, userId)
        }
      }

      // 5. 构造并持久化 SystemEvent
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
