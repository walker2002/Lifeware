// State Machine — 对象生命周期执行器
// 接收已批准的 StateProposal，执行状态转换，持久化并发布事件

import type { USOM_ID, Timestamp, Tag } from '@/usom/types/primitives'
import type { Timebox } from '@/usom/types/objects'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { ITimeboxRepository, ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import { findTransition } from './transitions'

// ─── 结果类型 ─────────────────────────────────────────────────
export interface StateMachineResult {
  success: boolean
  /** 状态变更后的对象 */
  object?: Timebox
  /** 发布的 SystemEvent */
  event?: SystemEvent
  /** 失败时的错误信息 */
  error?: string
}

// ─── 依赖接口 ─────────────────────────────────────────────────
export interface StateMachineDeps {
  timeboxRepo: ITimeboxRepository
  eventRepo: ISystemEventRepository
}

// ─── State Machine 接口 ──────────────────────────────────────
export interface TimeboxStateMachine {
  execute(
    proposal: StateProposal,
    eventBus: EventBus,
    userId: USOM_ID,
  ): Promise<StateMachineResult>
}

// ─── 工厂函数 ─────────────────────────────────────────────────
export function createTimeboxStateMachine(deps: StateMachineDeps): TimeboxStateMachine {
  const { timeboxRepo, eventRepo } = deps

  return {
    async execute(proposal, eventBus, userId): Promise<StateMachineResult> {
      // 1. 查找转换规则
      //    创建时 fromState = null（没有已有对象）
      //    其余操作需要从 proposal.targetObject.id 加载当前对象获取 fromState
      const fromState = null // MVP 阶段仅支持 create
      const transition = findTransition(fromState, proposal.action)

      if (!transition) {
        return {
          success: false,
          error: `非法状态转换: action="${proposal.action}", fromState=null`,
        }
      }

      // 2. 从 proposal.payload 构造新的 Timebox 对象
      const now = new Date().toISOString() as Timestamp
      const timeboxId = crypto.randomUUID() as USOM_ID

      const timebox: Timebox = {
        id: timeboxId,
        status: transition.to,
        title: proposal.payload.title as string,
        startTime: proposal.payload.startTime as Timestamp,
        endTime: proposal.payload.endTime as Timestamp,
        taskIds: (proposal.payload.taskIds as USOM_ID[]) ?? [],
        habitIds: (proposal.payload.habitIds as USOM_ID[]) ?? [],
        isRecurring: (proposal.payload.isRecurring as boolean) ?? false,
        recurrenceRule: proposal.payload.recurrenceRule as Timebox['recurrenceRule'],
        tags: (proposal.payload.tags as Tag[]) ?? [],
        createdAt: now,
        updatedAt: now,
      }

      // 3. 持久化 Timebox（R-01 Repository Pattern）
      await timeboxRepo.save(timebox, userId)

      // 4. 构造 SystemEvent
      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: transition.eventType,
        occurredAt: now,
        triggeredBy: 'state_machine',
        payload: {
          timeboxId: timebox.id,
          intentId: proposal.intentId,
          proposalId: proposal.id,
          fromStatus: fromState,
          toStatus: transition.to,
        },
        snapshotId: '' as USOM_ID, // MVP: 暂无 context_snapshot 记录
      }

      // 5. 持久化事件
      await eventRepo.append(event, userId)

      // 6. 发布事件到 EventBus
      eventBus.publish(event)

      // 7. 返回结果
      return {
        success: true,
        object: timebox,
        event,
      }
    },
  }
}
