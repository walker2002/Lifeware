# Data Model: Domain 全面合规重构

**Date**: 2026-05-15
**Feature**: 006-domain-compliance-refactor

## Entity Changes

本次重构不修改数据库 schema 或 USOM 类型定义。所有变更是代码级别的重组和架构调整。

## Key Interfaces (新增或变更)

### DomainManifest (manifest.yaml 的 TypeScript 类型)

```typescript
interface DomainManifest {
  id: string
  version: string
  name: string
  description: string

  // 区块 A: intent_triggers (含 view_routes)
  intent_triggers: IntentTrigger[]

  // 区块 B: lifecycle
  lifecycle: Record<string, LifecycleDefinition>

  // 区块 C: field_metadata
  field_metadata: Record<string, FieldMetadata>

  // 区块 D: list_actions
  list_actions: ListAction[]

  // 区块 E: required_fields + templates
  required_fields: Record<string, FieldPrompt[]>
  templates?: { form: Record<string, FormField[]> }

  // 区块 F: subscribed_events
  subscribed_events: string[]
}

interface LifecycleDefinition {
  states: string[]
  initial_state: string
  transitions: LifecycleTransition[]
  terminal_states: string[]
}

interface LifecycleTransition {
  from: string | string[] | null
  to: string
  trigger: 'intent' | 'time'
  action: string    // 对应 StructuredIntent.action
  event_type: string // 对应 SystemEventType
}
```

### DomainPlugin (更新)

```typescript
interface DomainPlugin {
  manifest: DomainManifest
  hooks: {
    onValidate: (intent: StructuredIntent, snapshot: USOMSnapshot) => ValidationResult
    onEvent: (event: SystemEvent, snapshot: USOMSnapshot) => EventResult
    onActionSurfaceRequest: (snapshot: USOMSnapshot, signals: DerivedSignals) => ActionSurfaceResult
    onOutboundRequest: (trigger: SystemEvent, snapshot: USOMSnapshot) => OutboundResult | null
  }
  // Phase 2 后不再需要 transitions 属性（从 manifest.lifecycle 读取）
}
```

### GenericStateMachine (新增)

```typescript
interface GenericStateMachineDeps {
  getRepository(objectType: string): IRepository
  eventRepo: ISystemEventRepository
  getLifecycle(domainId: string, objectType: string): LifecycleDefinition
}

interface GenericStateMachine {
  execute(
    proposal: StateProposal,
    eventBus: EventBus,
    userId: USOM_ID,
    domainPlugin: DomainPlugin,
  ): Promise<StateMachineResult>
}
```

### Orchestrator (重构后)

```typescript
interface Orchestrator {
  eventBus: EventBus

  // 统一入口（替代 execute/executeHabitIntent/executeOKRIntent）
  executeIntent(
    intent: StructuredIntent,
    userId: USOM_ID,
    confirmed?: boolean,
  ): Promise<OrchestratorResult>

  // 保留：模板应用（timebox 专属，但通过 executeIntent 也可实现）
  applyTemplate(templateId: USOM_ID, date: string, userId: USOM_ID): Promise<ApplyTemplateResult>
}
```

## File Mapping (搬迁对照)

### Repository 搬迁

| 原路径 | 目标路径 |
|--------|---------|
| `lib/db/repositories/timebox.repository.ts` | `domains/timebox/repository.ts` |
| `lib/db/repositories/habit.repository.ts` | `domains/habits/repository/habit.ts` |
| `lib/db/repositories/habit-log.repository.ts` | `domains/habits/repository/habit-log.ts` |
| `lib/db/repositories/habit-template.repository.ts` | `domains/habits/repository/habit-template.ts` |
| `lib/db/repositories/objective.repository.ts` | `domains/okrs/repository/objective.ts` |
| `lib/db/repositories/key-result.repository.ts` | `domains/okrs/repository/key-result.ts` |
| `lib/db/repositories/task.repository.ts` | `domains/tasks/repository/task.ts` |
| `lib/db/repositories/project.repository.ts` | `domains/tasks/repository/project.ts` |
| `lib/db/repositories/task-template.repository.ts` | `domains/tasks/repository/task-template.ts` |

### Nexus 删除文件

| 文件 | 理由 |
|------|------|
| `nexus/core/state-machine/transitions.ts` | 转换表下沉到域目录 |
| `nexus/core/intent-engine/habit-defaults.ts` | 习惯默认值移到域目录 |

### Nexus 重大修改文件

| 文件 | 变更 |
|------|------|
| `nexus/core/state-machine/index.ts` | 从 timebox 专用改为通用 |
| `nexus/orchestrator/index.ts` | 删除域专属方法，统一 executeIntent |
| `app/actions/intent.ts` | 对接新 Orchestrator 入口 |
| `app/actions/okr.ts` | 对接新 Orchestrator 入口 |
| `app/projects/actions.ts` | 从直接 repo 调用改为 PrebuiltIntent |
