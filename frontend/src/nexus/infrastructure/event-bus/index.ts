// Event Bus — 类型安全的观察者模式
// State Machine 发布 SystemEvent，Event Bus 同步分发给订阅者

import type { SystemEvent, SystemEventType } from '@/usom/types/process'

// ─── 类型定义 ─────────────────────────────────────────────────
type EventHandler = (event: SystemEvent) => void

interface EventBus {
  /**
   * 订阅特定事件类型
   * @returns unsubscribe 函数
   */
  subscribe(eventType: SystemEventType, handler: EventHandler): () => void

  /**
   * 发布事件，同步通知所有订阅者
   */
  publish(event: SystemEvent): void
}

// ─── 工厂函数 ─────────────────────────────────────────────────
function createEventBus(): EventBus {
  // 按事件类型分组的 handler 列表
  const handlers = new Map<SystemEventType, Set<EventHandler>>()

  return {
    subscribe(eventType: SystemEventType, handler: EventHandler): () => void {
      // 获取或创建该事件类型的 handler 集合
      let handlerSet = handlers.get(eventType)
      if (!handlerSet) {
        handlerSet = new Set<EventHandler>()
        handlers.set(eventType, handlerSet)
      }
      handlerSet.add(handler)

      // 返回 unsubscribe 函数
      return () => {
        handlerSet!.delete(handler)
      }
    },

    publish(event: SystemEvent): void {
      const handlerSet = handlers.get(event.type)
      if (!handlerSet) return

      // 同步遍历所有 handler，错误隔离：单个异常不影响其他 handler
      for (const handler of handlerSet) {
        try {
          handler(event)
        } catch (error) {
          // 错误隔离：记录日志但不中断分发
          console.error(
            `[EventBus] handler 执行异常，事件类型: ${event.type}`,
            error,
          )
        }
      }
    },
  }
}

export { createEventBus }
export type { EventBus, EventHandler }
