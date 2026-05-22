# Data Model: Handler + Context Engine

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20
**Source**: spec.md Key Entities + architecture reference doc

---

## 新增类型（usom/types/process.ts）

### ContextProvider

```typescript
interface ContextProvider {
  provide(query: string, params: Record<string, unknown>): Promise<unknown>
}
```

职责：Domain 的受控共享接口，只读投影。

### ContextCapability

```typescript
interface ContextCapability {
  id: string                    // 全局唯一，如 'activeTasks'
  provider: ContextProvider
  visibility: 'private' | 'planning' | 'system'
  schema: ZodSchema             // 输出类型校验
  description?: string
}
```

注册信息：id + visibility + schema + provider 实例。

### DomainHandler

```typescript
interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
}
```

职责：接收 GenerationRequest，执行算法/AI，输出 GenerationResult。

### GenerationRequest

```typescript
interface GenerationRequest {
  intent: StructuredIntent
  contexts: Record<string, unknown>
}
```

Handler 输入：用户意图 + Context Engine 组装的跨域数据。

### GenerationResult

```typescript
interface GenerationResult {
  proposalSet: ProposalSet
  alternatives?: ProposalSet[]    // MVP 留空
  presentation?: PresentationPayload
  warnings?: Warning[]
}
```

Handler 输出：方案集 + 展示 + 警告。

### GeneratedProposal

```typescript
interface GeneratedProposal {
  id: string
  action: string                  // 如 'createTimebox'
  payload: Record<string, unknown>
  sourceType: 'habit' | 'task' | 'planned' | 'adhoc'
  priority: string
  energyMatch?: {
    required: string
    actual: string
    score: number                 // 0-1
  }
}
```

单个方案项，包含来源类型和能量匹配信息。

### ProposalSet

```typescript
interface ProposalSet {
  id: string
  label?: string
  proposals: GeneratedProposal[]
  tags?: string[]
}
```

方案集合，MVP 阶段只使用单个 set。

### Warning

```typescript
interface Warning {
  code: string
  message: string
  severity: 'info' | 'warn' | 'error'
  affectedProposalIds?: string[]
}
```

结构化警告。

### PresentationPayload

```typescript
interface PresentationPayload {
  type: 'markdown' | 'kanban' | 'calendar' | 'timeline' | 'mindmap'
  content: unknown                // 各类型自定义结构
}
```

展示层载体，MVP 使用 markdown。

---

## Manifest Schema 扩展

### generation_actions 块

```yaml
generation_actions:
  createSmartSchedule:
    description: "AI 生成当日时间盒编排方案"
    contexts:
      - id: habitTemplates        # 对应 ContextCapability.id
        query: templates_for_date
        params: [date]            # 从 intent.fields 取值
      - id: pendingHabits
        query: unlogged_for_date
        params: [date]
      - id: activeTasks
        query: active_with_details
        params: [date]
      - id: existingTimeboxes
        query: timeboxes_for_date
        params: [date]
      - id: energyProfile
        query: energy_profile
        params: []
```

Zod schema 扩展：
```typescript
const ContextDeclarationSchema = z.object({
  id: z.string(),
  query: z.string(),
  params: z.array(z.string()).optional(),
})

const GenerationActionSchema = z.object({
  description: z.string(),
  contexts: z.array(ContextDeclarationSchema),
})
```

---

## 数据库变更

**无新表**。追踪事件复用现有 `system_events` 表，通过 `event_type` 前缀 `generative.*` 区分。

新增 SystemEventType 枚举值：
```typescript
| 'GenerativeContextAssembled'
| 'GenerativeHandlerCompleted'
| 'GenerativeUserConfirmed'
| 'GenerativeProposalRejected'
| 'GenerativeBatchExecuted'
```

---

## 关系图

```
Domain
├── Repository (内部 CRUD)
├── Hooks (被动约束) ─── 不变
├── Handlers (主动生成) ─── 新增
│   └── implements DomainHandler
│       └── receives GenerationRequest
│           └── from Context Engine
└── Providers (受控共享) ─── 新增
    └── implements ContextProvider
        └── registers ContextCapability
            └── into Context Registry

Context Engine
├── Registry (capability 注册中心)
└── Assembler (组装 GenerationRequest)
    └── reads manifest.generation_actions
    └── resolves via Registry
    └── validates via Zod schema

Orchestrator
├── Reactive Path (不变)
│   └── Hook.onValidate → RuleEngine → StateMachine
└── Generative Path (新增)
    └── ContextEngine.assemble → Handler.handle
    └── → RuleEngine.evaluateProposals
    └── → User confirms
    └── → MarkdownParser → StateMachine (batch)
```

---

## 验证规则

| 实体 | 约束 |
|---|---|
| ContextCapability.id | 全局唯一，Registry 注册时检查 |
| ContextProvider | 只读、无 AI、无写操作 |
| DomainHandler | 不访问 Repository、不写状态、不触发事件 |
| GenerationResult.proposalSet | 至少 1 个 proposal |
| GeneratedProposal | id + action + payload + sourceType + priority 必填 |
| Warning | code + message + severity 必填 |
| generation_actions.contexts[].id | 必须匹配已注册的 ContextCapability.id |
