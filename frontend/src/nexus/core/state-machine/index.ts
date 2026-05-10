// State Machine — 对象生命周期执行器
// 接收已批准的 StateProposal，执行状态转换，持久化并发布事件
// 支持创建（fromState=null）和已有对象的非创建转换（动态 fromState）

import type { USOM_ID, Timestamp, Tag } from '@/usom/types/primitives'
import type { Timebox } from '@/usom/types/objects'
import type { StateProposal, SystemEvent } from '@/usom/types/process'
import type { ITimeboxRepository, ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import { findTransition, timeboxTransitions } from './transitions'

export interface StateMachineResult {
  success: boolean
  object?: Timebox
  event?: SystemEvent
  error?: string
}

export interface StateMachineDeps {
  timeboxRepo: ITimeboxRepository
  eventRepo: ISystemEventRepository
}

export interface TimeboxStateMachine {
  execute(
    proposal: StateProposal,
    eventBus: EventBus,
    userId: USOM_ID,
  ): Promise<StateMachineResult>
}

export function createTimeboxStateMachine(deps: StateMachineDeps): TimeboxStateMachine {
  const { timeboxRepo, eventRepo } = deps

  return {
    async execute(proposal, eventBus, userId): Promise<StateMachineResult> {
      const now = new Date().toISOString() as Timestamp

      // 1. 确定 fromState
      //    create 动作: fromState = null（无已有对象）
      //    其余动作: 从数据库加载已有对象获取当前状态
      let fromState: Timebox['status'] | null = null
      let existingTimebox: Timebox | null = null
      const objectId = proposal.targetObject.id

      if (objectId) {
        existingTimebox = await timeboxRepo.findById(objectId, userId)
        if (!existingTimebox) {
          return { success: false, error: '时间盒不存在' }
        }
        fromState = existingTimebox.status
      }

      // 2. 查找转换规则
      const transition = findTransition(timeboxTransitions, fromState, proposal.action)
      if (!transition) {
        return {
          success: false,
          error: `非法状态转换: action="${proposal.action}", fromState="${fromState}"`,
        }
      }

      // 3. 构造目标 Timebox 对象
      let timebox: Timebox

      if (existingTimebox) {
        // 非创建：基于已有对象更新
        timebox = {
          ...existingTimebox,
          status: transition.to,
          updatedAt: now,
        }

        // 根据动作设置对应时间戳
        if (proposal.action === 'start') {
          timebox.startedAt = now
        } else if (proposal.action === 'end') {
          timebox.endedAt = now
        } else if (proposal.action === 'overtime') {
          timebox.overtimeAt = now
        } else if (proposal.action === 'log') {
          timebox.loggedAt = now
          if (proposal.payload.executionRecord) {
            timebox.executionRecord = proposal.payload.executionRecord as Timebox['executionRecord']
          }
        } else if (proposal.action === 'cancel') {
          // cancelled 只更新 status 和 updatedAt
        }
      } else {
        // 创建：从 payload 构造新对象
        const timeboxId = crypto.randomUUID() as USOM_ID
        timebox = {
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
      }

      // 4. 持久化
      await timeboxRepo.save(timebox, userId)

      // 5. 构造并持久化 SystemEvent
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
        snapshotId: '' as USOM_ID,
      }

      await eventRepo.append(event, userId)
      eventBus.publish(event)

      return { success: true, object: timebox, event }
    },
  }
}
