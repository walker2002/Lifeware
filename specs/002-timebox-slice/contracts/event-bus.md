# Event Bus Contract

**Feature**: 001-align-foundation (Timebox 切片)
**Date**: 2026-05-03

## 概述

事件总线是 Nexus 基础设施层的进程内消息分发机制。State Machine 执行状态变更后发布 SystemEvent，Event Bus 将事件分发给订阅者。

## 接口定义

```typescript
// frontend/src/nexus/infrastructure/event-bus/index.ts

import type { SystemEvent, SystemEventType } from '@/usom/types/process'

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

function createEventBus(): EventBus
```

## 使用方

| 发布者 | 事件类型 | 说明 |
|---|---|---|
| State Machine | `TimeboxCreated` | 时间盒创建后 |
| State Machine | `TimeboxStarted` | 时间盒开始执行 |
| State Machine | `TimeboxEnded` | 时间盒到期 |
| State Machine | `TimeboxLogged` | 用户记录执行结果 |

| 订阅者 | 行为 | 说明 |
|---|---|---|
| Domain.onEvent | 各 Domain 处理事件 | 返回 metrics + suggestions |
| Action Surface Engine | 触发重新生成 | 更新 Action Surface |

## 行为约束

1. **同步分发**: publish() 在所有 handler 执行完毕后才返回（MVP 简化）
2. **错误隔离**: 单个 handler 异常不影响其他 handler，记录错误日志
3. **不写状态**: EventBus 不修改任何数据，只做分发
4. **无持久化**: 事件持久化由 State Machine 通过 SystemEventRepository.append() 完成

## MVP 订阅注册

```typescript
// 编排器初始化时注册订阅
eventBus.subscribe('TimeboxCreated', (event) => {
  // 通知 Action Surface Engine 重新生成
  actionSurfaceEngine.refresh(snapshot, signals)
})

eventBus.subscribe('TimeboxEnded', (event) => {
  // 生成 "请记录执行结果" 提示
  actionSurfaceEngine.refresh(snapshot, signals)
})
```
