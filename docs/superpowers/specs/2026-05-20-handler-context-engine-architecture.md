# Handler + Context Engine 架构改进方案

**日期**: 2026-05-20
**状态**: Draft
**参考文档**: `.specify/memory/constitution.md`、`docs/usom-design.md`
**关联需求**: `mydocs/dev/008-时间盒智能编排.md`

---

## 1. 背景与动机

### 1.1 当前架构

Lifeware Nexus 采用四层架构：USOM → Nexus（Intent Engine / Rule Engine / State Machine / Action Surface Engine）→ Domain Plugins → Bridge Layer。

Domain Plugin 遵循"四钩子、三禁止"的被动模型：

| Hook | 职责 | 是否含 AI |
|---|---|---|
| `onValidate` | 校验 intent 结构 | 否 |
| `onEvent` | 响应事件，返回指标和建议 | 否 |
| `onActionSurfaceRequest` | 返回 Action Candidate | 否 |
| `onOutboundRequest` | 声明外推意图（Phase 2） | 否 |

**Hooks = Constraint System（约束系统）**：被动响应，不生成新内容。

### 1.2 新需求：生成型操作

时间盒智能编排要求系统主动生成一组时间盒方案，这不是"校验"或"响应事件"能覆盖的。未来的 Review 自动生成复盘草稿、Career 生成季度计划也属于同类需求。

**核心矛盾**：当前架构缺少"生成型"路径。把生成逻辑塞进 hooks 会导致：
- Hook 签名膨胀（不同生成场景需要不同上下文）
- 职责混淆（约束和规划混在一起）
- AI 参与位置不清晰

### 1.3 设计原则

本方案遵循两条核心原则：

1. **Reactive Path（Hook）= Constraint System** — 被动校验、响应事件
2. **Generative Path（Handler）= Planning System** — 主动生成方案

两条路径共存于每个 Domain，互不干扰。

---

## 2. 架构总览

### 2.1 更新后的 Domain 模型

```
Domain
├── Repository         # 内部数据管理（不变）
├── Hooks              # Reactive Path（不变）
├── Handlers           # Generative Path（新增）
├── Context Providers  # 受控共享接口（新增）
└── manifest.yaml      # 扩展 generation_actions 块（新增）
```

### 2.2 更新后的 Nexus 模型

```
Nexus
├── Intent Engine      # Phase A + B：语言理解（不变）
├── Context Engine     # 数据规划（新增）
│   ├── Assembler      # 组装 GenerationRequest
│   └── Registry       # ContextCapability 注册中心
├── Rule Engine        # 确定性校验（不变）
├── State Machine      # 状态写入（不变）
├── Action Surface Engine  # 输出展示（不变）
└── Orchestrator       # 纯调度（不变）
```

### 2.3 完整执行路径

#### 普通写操作（Reactive Path）

```
用户输入 → Intent Engine (A+B) → Orchestrator
  → Hook.onValidate → Rule Engine → State Machine → EventBus → ActionSurface
```

与现有流程完全一致，无变化。

#### 生成型操作（Generative Path）

```
用户输入 "帮我安排今天"
         │
         ▼
┌─────────────────────────────┐
│  Intent Engine              │
│  Phase A: 路由               │
│    → (timebox, createSmartSchedule)
│  Phase B: 提取用户字段       │
│    → { date: "2026-05-20" } │
│  输出: StructuredIntent      │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Context Engine (Assembler) │
│  1. 读取 manifest 的        │
│     generation_actions      │
│     .createSmartSchedule    │
│     .contexts               │
│  2. 查 Context Registry     │
│  3. 验证 visibility         │
│  4. 调用 Provider.provide() │
│  5. Zod schema validate     │
│  输出: GenerationRequest    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Orchestrator               │
│  识别 generative 路径        │
│  (manifest 中有对应的        │
│   generation_actions 条目)  │
│  → 调用 Handler.handle()    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Handler (纯计算)            │
│  AI 编排算法                 │
│  输出: GenerationResult     │
│    ├── proposalSet          │
│    ├── presentation         │
│    └── warnings             │
└────────────┬────────────────┘
             │
             ▼
     Rule Engine (验证)
             │
             ▼
  Presentation Layer (Markdown)
  用户编辑 / 确认
             │
             ▼
  重新解析 → Rule Engine (二次验证)
             │
             ▼
  State Machine (批量执行)
             │
             ▼
  EventBus → ActionSurfaceEngine
```

---

## 3. Context Provider 系统

### 3.1 核心问题

生成型操作需要跨域数据（habits、tasks、energy 等），但 Constitution VI 禁止 Domain 直接访问其他 Domain 的内部数据。Repository 是内部数据管理接口，不适合作为跨域共享通道。

### 3.2 解决方案：Context Provider

引入 **Context Provider** 作为 Domain 的受控共享接口。每个 Domain 声明自己愿意暴露的信息，通过 Provider 投影为共享格式。

**关键区分**：

| 组件 | 职责 | 消费者 |
|---|---|---|
| Repository | 管理任务数据（CRUD、事务） | Domain 内部 |
| Context Provider | 向外部提供任务信息（只读投影） | 其他 Domain 的 Handler |

### 3.3 接口定义

```typescript
// usom/types/process.ts

interface ContextProvider {
  provide(query: string, params: Record<string, unknown>): Promise<unknown>
}

interface ContextCapability {
  id: string                            // 全局唯一，如 'activeTasks'
  provider: ContextProvider
  visibility: 'private' | 'planning' | 'system'
  schema: ZodSchema                     // 输出类型校验
  description?: string
}
```

### 3.4 Provider 约束

Provider 只允许做三件事：

1. **读取** — 从本 Domain 的 Repository 获取数据
2. **投影** — 筛选/变换为对外共享格式
3. **聚合轻量信息** — 统计摘要（如完成率、连续天数）

**禁止**：planning / 决策 / 复杂计算 / 调用 AI。复杂逻辑属于 Handler 职责。

### 3.5 Visibility 控制

| 级别 | 含义 | 可被谁消费 |
|---|---|---|
| `private` | 仅 Domain 内部 | 无（预留） |
| `planning` | 规划类操作 | Handler（通过 Context Engine） |
| `system` | 系统全局 | 所有 Nexus 组件 |

MVP 阶段所有 Provider 使用 `planning` 级别。

### 3.6 Context Registry

系统级注册中心，管理所有 ContextCapability：

```typescript
// nexus/context-engine/registry.ts

const capabilities = new Map<string, ContextCapability>()

export function registerContextCapability(cap: ContextCapability): void

export function resolveContext(
  capabilityId: string,
  query: string,
  params: Record<string, unknown>,
  requiredVisibility?: string
): Promise<unknown>
```

`resolveContext` 流程：
1. 查找 capability → 不存在则报错
2. 校验 visibility 是否满足调用方要求
3. 调用 `provider.provide(query, params)`
4. Zod schema validate 返回值
5. 返回校验后的数据

### 3.7 Provider 示例

#### Tasks Domain

```typescript
// domains/tasks/providers/active-tasks-provider.ts

class ActiveTasksProvider implements ContextProvider {
  constructor(private repo: TaskRepository) {}

  async provide(query: string, params: Record<string, unknown>) {
    const { date, userId } = params
    switch (query) {
      case 'active_with_details':
        return this.repo.findActiveByDate(userId as string, date as string)
      case 'unscheduled_for_date':
        return this.repo.findUnscheduledByDate(userId as string, date as string)
      default:
        throw new Error(`Unknown query: ${query}`)
    }
  }
}
```

```typescript
// domains/tasks/providers/index.ts

registerContextCapability({
  id: 'activeTasks',
  visibility: 'planning',
  schema: ActiveTaskContextSchema,
  provider: new ActiveTasksProvider(taskRepo),
})
```

#### Habits Domain

```typescript
registerContextCapability({
  id: 'pendingHabits',
  visibility: 'planning',
  schema: PendingHabitContextSchema,
  provider: new PendingHabitsProvider(habitRepo),
})

registerContextCapability({
  id: 'habitTemplates',
  visibility: 'planning',
  schema: HabitTemplateContextSchema,
  provider: new HabitTemplatesProvider(habitTemplateRepo),
})
```

#### Timebox Domain

```typescript
registerContextCapability({
  id: 'existingTimeboxes',
  visibility: 'planning',
  schema: TimeboxContextSchema,
  provider: new TimeboxProvider(timeboxRepo),
})
```

#### Calibration

```typescript
registerContextCapability({
  id: 'energyProfile',
  visibility: 'planning',
  schema: EnergyProfileSchema,
  provider: new EnergyProfileProvider(calibrationRepo),
})
```

### 3.8 未来扩展

Provider 的数据来源不限于 Repository。未来可扩展：

- Memory 系统（行为模式、偏好）
- Vector DB（语义检索）
- AI Summary（上下文摘要）
- External Calendar（外部日历）
- HealthKit（健康数据）
- Cached Projection（预计算缓存）

只需实现 `ContextProvider` 接口并注册即可。

---

## 4. Handler 系统

### 4.1 设计理念

Handler 是 Domain 的**主动计算单元**，负责生成型操作：

- 接收 Context Engine 组装的完整数据
- 执行算法和/或 AI 调用
- 输出结构化的 proposal 和 presentation

Handler **不**做：
- 数据获取（由 Context Engine 完成）
- 状态写入（由 State Machine 完成）
- UI 渲染（由 Presentation Layer 完成）

### 4.2 接口定义

```typescript
// usom/types/process.ts

interface GenerationRequest {
  intent: StructuredIntent              // 用户参数
  contexts: Record<string, unknown>     // Context Engine 组装的系统数据
}

interface Warning {
  code: string
  message: string
  severity: 'info' | 'warn' | 'error'
  affectedProposalIds?: string[]
}

interface GeneratedProposal {
  id: string
  action: string                        // 如 'createTimebox'
  payload: Record<string, unknown>      // proposal 具体内容
  sourceType: 'habit' | 'task' | 'planned' | 'adhoc'
  priority: string                      // 用户定义的优先级
  energyMatch?: {
    required: string                    // 如 'high'
    actual: string                      // 如 'medium'
    score: number                       // 0-1
  }
}

interface ProposalSet {
  id: string
  label?: string                        // 如 "高强度工作日"
  proposals: GeneratedProposal[]
  tags?: string[]
}

interface PresentationPayload {
  type: 'markdown' | 'kanban' | 'calendar' | 'timeline' | 'mindmap'
  content: unknown                      // 各类型自定义结构
}

interface GenerationResult {
  proposalSet: ProposalSet              // MVP: 单个 set
  alternatives?: ProposalSet[]          // 预留：多方案选择
  presentation?: PresentationPayload
  warnings?: Warning[]
}

interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
}
```

### 4.3 设计决策说明

#### ProposalSet（而非 flat array）

proposals 使用 `ProposalSet` 而非 `GeneratedProposal[]`，为以下场景预留：

- Alternative Plans（"方案A 高强度 / 方案B 恢复日"）
- Fallback Plans（主方案不可行时的备选）
- Partial Acceptance（用户只确认部分 proposal）
- Conditional Branches（条件分支）

MVP 阶段只填充单个 `proposalSet`，`alternatives` 留空。

#### Presentation 解耦

`presentation` 是可选字段，与 proposal 解耦：

- Markdown 只是 MVP 阶段的 presentation 格式
- 未来可扩展 kanban、calendar、timeline、mindmap 等
- Handler 的核心输出是 `proposalSet`（结构化数据），不是 `markdown`（展示格式）

#### Warning 结构化

`Warning` 包含 `code`、`severity`、`affectedProposalIds`，支持：
- Rule Engine 在二次验证时附加结构化警告
- UI 按严重级别渲染（info / warn / error）
- 定位具体 proposal 的能量匹配问题

### 4.4 Handler 实现（SchedulingHandler 示例）

```typescript
// domains/timebox/handlers/scheduling-handler.ts

interface SchedulingContexts {
  habitTemplates: HabitTemplateSummary[]
  pendingHabits: HabitSummary[]
  activeTasks: TaskDetail[]
  existingTimeboxes: TimeboxSummary[]
  energyProfile: EnergyProfile
}

export class SchedulingHandler implements DomainHandler {
  async handle(request: GenerationRequest): Promise<GenerationResult> {
    const contexts = request.contexts as unknown as SchedulingContexts
    const { date } = request.intent.fields

    // 1. 收集四类来源材料
    const materials = this.collectMaterials(contexts)

    // 2. AI 编排（优先级 + 能量匹配 + 冲突检测）
    const proposals = await this.generateProposals(materials, date as string)

    // 3. 冲突检测与 warning 生成
    const warnings = this.detectConflicts(proposals, contexts.energyProfile)

    // 4. 生成 Markdown presentation
    const markdown = this.renderMarkdown(proposals, warnings)

    return {
      proposalSet: {
        id: generateId(),
        proposals,
        label: `${date} 智能编排方案`,
      },
      presentation: {
        type: 'markdown',
        content: markdown,
      },
      warnings,
    }
  }

  private collectMaterials(contexts: SchedulingContexts) { /* ... */ }
  private async generateProposals(materials, date) { /* AI call */ }
  private detectConflicts(proposals, energyProfile) { /* ... */ }
  private renderMarkdown(proposals, warnings) { /* ... */ }
}
```

### 4.5 Handler 注册

```typescript
// domains/timebox/handlers/index.ts

export const timeboxHandlers: Record<string, DomainHandler> = {
  createSmartSchedule: new SchedulingHandler(),
  adjustRemainingSchedule: new SchedulingHandler(),
}
```

```typescript
// domains/registry.ts — 扩展

import { timeboxHandlers } from './timebox/handlers'
// ...

export function findHandler(domainId: string, action: string): DomainHandler | undefined {
  const handlerMap: Record<string, Record<string, DomainHandler>> = {
    timebox: timeboxHandlers,
    // habits: habitsHandlers,    // 未来
    // review: reviewHandlers,    // 未来
  }
  return handlerMap[domainId]?.[action]
}
```

---

## 5. Context Engine

### 5.1 设计理念

Context Engine 是 Nexus 的新增组件，专门负责**数据规划**。

**为什么独立于 Intent Engine**：

| 维度 | Intent Engine | Context Engine |
|---|---|---|
| 核心职责 | 语言理解 | 数据规划 |
| 输入 | 用户原始输入 | StructuredIntent + manifest 声明 |
| 输出 | StructuredIntent | GenerationRequest |
| 技术重心 | NLP / AI prompt | 数据聚合 / schema 校验 |
| 长期演化 | 更强语言理解、多模态 | Memory、向量检索、外部数据源 |

区分"解析意图"和"组装上下文"两种职责，因为它们的长期演化方向完全不同。

### 5.2 Assembler 流程

```typescript
// nexus/context-engine/assembler.ts

export async function assembleContext(
  intent: StructuredIntent,
  manifest: DomainManifest
): Promise<GenerationRequest> {
  // 1. 查找 action 对应的 generation_actions 声明
  const actionConfig = manifest.generation_actions?.[intent.action]
  if (!actionConfig) {
    throw new Error(`No generation_actions for ${intent.action}`)
  }

  // 2. 遍历 contexts 声明，收集每项
  const contexts: Record<string, unknown> = {}
  for (const ctx of actionConfig.contexts) {
    // 3. 从 intent.fields 提取 params
    const params = extractParams(ctx.params ?? [], intent.fields)

    // 4. 通过 Registry 获取数据（含 visibility 校验 + schema validate）
    contexts[ctx.id] = await resolveContext(ctx.id, ctx.query, params)
  }

  return { intent, contexts }
}
```

---

## 6. Manifest 扩展

### 6.1 新增 `generation_actions` 块

```yaml
# domains/timebox/manifest.yaml

generation_actions:
  createSmartSchedule:
    description: "AI 生成当日时间盒编排方案"
    contexts:
      - id: habitTemplates
        query: templates_for_date
        params: [date]                # 从 intent.fields 取值
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

  adjustRemainingSchedule:
    description: "增量调整剩余时段"
    contexts:
      - id: remainingTimeboxes
        query: remaining_from
        params: [date, fromTime]      # fromTime = 当前时间
      - id: unscheduledTasks
        query: unscheduled_for_date
        params: [date]
      - id: unloggedHabits
        query: unlogged_for_date
        params: [date]
      - id: energyProfile
        query: energy_profile
        params: []
```

### 6.2 设计要点

- `contexts[].id` 对应 Context Registry 中注册的 capability id
- `contexts[].query` 传递给 Provider.provide() 的 query 参数
- 参数来源统一从 `intent.fields` 中提取（由 Context Engine 负责映射）
- Orchestrator 通过检查 action 是否在 `generation_actions` 中来识别 generative 路径

---

## 7. Orchestrator 行为变更

### 7.1 路径识别

```typescript
// 伪代码
async processIntent(intent: StructuredIntent) {
  const manifest = findDomain(intent.targetDomain).manifest

  if (manifest.generation_actions?.[intent.action]) {
    // Generative Path
    const request = await assembleContext(intent, manifest)
    const handler = findHandler(intent.targetDomain, intent.action)
    const result = await handler.handle(request)

    // Rule Engine 验证
    const ruleResult = await ruleEngine.validate(result.proposalSet)

    // 组装 presentation 给用户
    return { type: 'generative', result, ruleResult }
  } else {
    // Reactive Path（现有流程，不变）
    const plugin = findDomain(intent.targetDomain)
    const validation = plugin.onValidate(intent, snapshot)
    // ... 现有逻辑
  }
}
```

### 7.2 约束确认

Orchestrator 仍然只做调度：
- 不做数据组装（委托 Context Engine）
- 不做计算（委托 Handler）
- 不做校验（委托 Rule Engine）
- 只做路径识别和组件协调

---

## 8. 目录结构

### 8.1 Domain（以 timebox 为例）

```
domains/timebox/
  ├── hooks.ts                    # Reactive Path（不变）
  ├── handlers/                   # Generative Path（新增）
  │   ├── scheduling-handler.ts
  │   └── index.ts
  ├── providers/                  # Context 共享（新增）
  │   ├── timebox-provider.ts
  │   └── index.ts
  ├── components/                 # UI 组件（不变）
  ├── repository.ts               # 内部数据（不变）
  ├── manifest.yaml               # 扩展 generation_actions
  ├── transitions.ts              # 生命周期（不变）
  └── index.ts                    # 注册 plugin + handlers + providers
```

### 8.2 Nexus

```
nexus/
  ├── core/
  │   ├── intent-engine/          # Phase A + B（不变）
  │   ├── rule-engine/            # 不变
  │   ├── state-machine/          # 不变
  │   └── action-surface-engine/  # 不变
  ├── context-engine/             # 新增
  │   ├── assembler.ts
  │   ├── registry.ts
  │   └── types.ts
  └── orchestrator/               # 扩展路径识别逻辑
```

### 8.3 USOM 类型

```
usom/types/
  ├── process.ts                  # 扩展：ContextProvider, DomainHandler,
  │                               #        GenerationRequest, GenerationResult 等
  ├── objects.ts                  # 不变
  └── primitives.ts               # 不变
```

---

## 9. 宪法修订摘要

本次架构改进需要 MINOR 修宪（新增能力，不修改/删除现有原则）。

| 条款 | 修订内容 |
|---|---|
| Principle III（四大组件） | Intent Engine 保留，新增 Context Engine 为第五大写入组件 |
| Principle VI（Domain Plugin） | 扩展为双轨模型：Hooks（约束系统）+ Handlers（规划系统）+ Providers（受控共享） |
| Principle VIII（AI/Rule 边界） | 明确 AI 可参与 Handler（Domain Plugin 范畴内） |
| Architecture Constraints | 新增 Context Provider 约束（只读、投影、轻量聚合） |
| Orchestrator Purity | 不变——仍然只做路径识别和组件协调 |

### 具体修订文本（待确认）

**Principle III 修订**：从"四个组件"变为"五个组件"，新增：

> Context Engine: System context assembly for generative operations. Reads manifest `generation_actions` declarations, resolves Context Capabilities through the Registry, validates with Zod schemas, and produces `GenerationRequest` for Handler consumption.

**Principle VI 修订**：从"四钩子、三禁止"变为双轨模型：

> Domain plugins operate under a dual-track model:
>
> **Reactive Track (Hooks)**: Four hooks with three prohibitions (unchanged).
>
> **Generative Track (Handlers)**: Domain-defined computational units that receive `GenerationRequest` from Context Engine and produce `GenerationResult`. Handlers MAY call AI. Handlers MUST NOT access repositories, write state, or trigger events directly.
>
> **Context Providers**: Controlled sharing interface. Each Domain declares `ContextCapability` entries in the Registry. Providers are limited to read, project, and lightweight aggregate operations.

---

## 10. 首个用例：时间盒智能编排

### 10.1 编排策略

本方案讨论中确定的核心编排策略：

| 维度 | 决策 |
|---|---|
| AI 参与度 | 全自动生成方案，用户确认或微调 |
| 优先级模型 | 用户在每个 habit/task 上定义优先级标签（P0–P3）；同级别内按已规划 > 习惯模板 > 日常任务 > 临时追加 排序 |
| 能量匹配 | 软建议：AI 尽量匹配能量曲线，不匹配时标注警告，用户可覆盖 |
| 触发方式 | 手动触发（AI 对话或按钮），支持当日动态增量调整 |
| 输出形式 | 先生成 Markdown 计划文件，用户编辑确认后解析为批量 timebox intents |

### 10.2 四类来源材料

| 来源 | Context Provider | 数据内容 |
|---|---|---|
| 习惯模板 | `habitTemplates` | 模板 + 模板中的习惯列表 + 时段/时长覆盖 |
| 日常任务 | `activeTasks` | 活跃任务 + 优先级 + 能量需求 + 预估时长 |
| 已规划事务 | `existingTimeboxes` | 当天已有的时间盒（不可动） |
| 临时追加 | 同 `activeTasks`（新任务即时入库） | — |
| 能量曲线 | `energyProfile` | 用户校准的峰值/低谷时段 |

### 10.3 增量调整

当用户在已确认的时间盒计划中临时追加任务时：

1. 新任务通过 Reactive Path 正常入库
2. 触发 `adjustRemainingSchedule` action
3. Context Engine 只采集 `fromTime` 之后的剩余材料
4. SchedulingHandler 只重排受影响时段，已完成/进行中的时间盒不动
5. 结果写入同一个 Markdown 文件（或新建增量片段），用户确认后执行

---

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Context Provider 数据过时（用户确认时数据已变化） | Rule Engine 二次验证捕获冲突；MVP 可接受，后续加时间戳校验 |
| Handler AI 调用失败 | 降级为基于规则的简单编排（按优先级顺序排列），保证有方案输出 |
| Provider 职责膨胀（复杂计算混入） | Code Review 强制检查 Provider 逻辑复杂度；Zod schema 约束输出格式 |
| Manifest generation_actions 膨胀 | 每个 action 的 contexts 列表控制在 8 项以内；定期 review 必要性 |

---

## 12. 实施范围

### MVP 范围

1. Context Engine 核心（Assembler + Registry）
2. 5 个 Context Provider（habitTemplates, pendingHabits, activeTasks, existingTimeboxes, energyProfile）
3. SchedulingHandler（createSmartSchedule + adjustRemainingSchedule）
4. Orchestrator 路径识别扩展
5. 宪法 MINOR 修订
6. manifest.yaml 扩展（generation_actions 块 + intent_triggers 新 action）

### 后续迭代

- 更多 Context Provider（derivedSignals, habitStreaks, taskHistory）
- Proposal alternatives（多方案选择）
- 更多 presentation 类型（calendar view）
- Review Domain Handler（generate_review_draft）
- OKR Domain Handler（generate_quarterly_plan）
