# Contract: Domain Handler

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20

## Interface

```typescript
// usom/types/process.ts

interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
}

interface GenerationRequest {
  intent: StructuredIntent
  contexts: Record<string, unknown>
}

interface GenerationResult {
  proposalSet: ProposalSet
  alternatives?: ProposalSet[]
  presentation?: PresentationPayload
  warnings?: Warning[]
}
```

## Behavioral Contract

| 规则 | 约束 |
|---|---|
| 无 Repository 访问 | Handler MUST NOT 直接访问 Repository |
| 无状态写入 | Handler MUST NOT 写入状态或触发事件 |
| AI 可选 | Handler MAY 调用 AI |
| 降级保障 | AI 调用失败时 MUST 有基于规则的降级方案 |
| 纯计算 | 输入 GenerationRequest → 输出 GenerationResult，无副作用 |
| Schema 合规 | proposalSet 中每个 proposal MUST 包含 id, action, payload, sourceType, priority |

## Handler 注册

```typescript
// domains/timebox/handlers/index.ts
export const timeboxHandlers: Record<string, DomainHandler> = {
  createSmartSchedule: new SchedulingHandler(),
  adjustRemainingSchedule: new SchedulingHandler(),
}

// domains/registry.ts 扩展
function findHandler(domainId: string, action: string): DomainHandler | undefined
```

## SchedulingHandler 特定契约

| 输入 | 说明 |
|---|---|
| contexts.habitTemplates | 习惯模板 + 模板中的习惯列表 |
| contexts.pendingHabits | 当日待打卡习惯 |
| contexts.activeTasks | 活跃任务 + 优先级 + 能量需求 |
| contexts.existingTimeboxes | 当天已有时间盒（不可动） |
| contexts.energyProfile | 用户校准的峰值/低谷时段 |

| 输出 | 说明 |
|---|---|
| proposalSet | 编排方案，每个 proposal 包含时间、来源、能量匹配 |
| presentation (markdown) | 可读的编排计划 |
| warnings | 能量不匹配、时间冲突等警告 |
