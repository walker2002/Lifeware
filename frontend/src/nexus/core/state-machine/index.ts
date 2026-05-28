// State Machine — 对象生命周期执行器
// 通用版：接收 LifecycleDefinition 驱动多域状态转换
// 接收已批准的 StateProposal，执行状态转换，持久化并发布事件

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { LifecycleDefinition, FieldMetadata, LifecycleTransition } from '@/usom/types/domain-types'
import { findTransition, timeboxTransitions } from '@/domains/timebox/transitions'

// ─── 旧版接口（向后兼容，Phase 7 移除） ─────────────────────────
export interface StateMachineResult {
  success: boolean
  object?: Record<string, unknown>
  event?: SystemEvent
  error?: string
}

export interface StateMachineDeps {
  timeboxRepo: { findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>; save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void> }
  eventRepo: ISystemEventRepository
}

export interface TimeboxStateMachine {
  execute(proposal: StateProposal, eventBus: EventBus, userId: USOM_ID): Promise<StateMachineResult>
}

export function createTimeboxStateMachine(deps: StateMachineDeps): TimeboxStateMachine {
  const { timeboxRepo, eventRepo } = deps

  return {
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

export interface GenericRepo {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
  save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
}

export interface GenericStateMachineDeps {
  getRepository: (objectType: string) => GenericRepo
  eventRepo: ISystemEventRepository
  getLifecycle: (domainId: string, objectType: string) => LifecycleDefinition
  getFieldMetadata?: (domainId: string, objectType: string) => Record<string, FieldMetadata>
}

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

function getLifecycleTimestampFields(
  fieldMeta: Record<string, FieldMetadata> | undefined,
): string[] {
  if (!fieldMeta) return []
  return Object.entries(fieldMeta)
    .filter(([, meta]) => meta.type === 'lifecycle_timestamp')
    .map(([fieldName]) => fieldName)
}

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

export function createGenericStateMachine(deps: GenericStateMachineDeps) {
  const { getRepository, eventRepo, getLifecycle, getFieldMetadata } = deps

  return {
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

      // 3. 构造目标对象
      let object: Record<string, unknown>
      const lifecycleTimestampFields = getLifecycleTimestampFields(fieldMeta)

      if (existingObject) {
        object = {
          ...existingObject,
          status: transition.to,
          updatedAt: now,
        }

        // 自动设置 lifecycle_timestamp 字段
        const actionTimestampMap = buildActionTimestampMap(lifecycle, fieldMeta)
        const timestampKey = actionTimestampMap[proposal.action]
        if (timestampKey && lifecycleTimestampFields.includes(timestampKey)) {
          object[timestampKey] = now
        }
      } else {
        // 创建：从 payload 构造新对象
        const id = crypto.randomUUID() as USOM_ID
        object = {
          id,
          status: transition.to,
          createdAt: now,
          updatedAt: now,
          ...proposal.payload,
        }

        // 初始化 lifecycle_timestamp 字段为 undefined（后续转换时设置）
        for (const field of lifecycleTimestampFields) {
          if (!(field in object)) {
            object[field] = undefined
          }
        }
      }

      // 4. 持久化
      const repo = getRepository(objectType)
      await repo.save(object, userId)

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

      return { success: true, object, event }
    },
  }
}
