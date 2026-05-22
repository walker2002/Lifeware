# Research: Handler + Context Engine

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20
**Purpose**: Resolve technical unknowns and document design decisions

---

## R-001: Manifest Schema 扩展策略

**Decision**: 在现有 `ManifestSchema` 中新增可选的 `generation_actions` 块，使用 Zod optional 链。

**Rationale**: 现有 manifest-loader 已有完整的三阶段加载流程（YAML 解析 → Zod 结构校验 → 语义校验）。新增 `generation_actions` 作为可选字段不会破坏已有 manifest 的加载。Zod schema 扩展与现有模式一致。

**Alternatives considered**:
- 独立 manifest 文件（如 generation-manifest.yaml）— 增加加载复杂度，违反 manifest 单一来源原则
- 在代码中硬编码 generation 配置 — 违反 Manifest Runtime Consumption 约束

**Implementation notes**:
```typescript
// manifest-loader/schema.ts 新增
const ContextDeclarationSchema = z.object({
  id: z.string(),
  query: z.string(),
  params: z.array(z.string()).optional(),
})

const GenerationActionSchema = z.object({
  description: z.string(),
  contexts: z.array(ContextDeclarationSchema),
})

// 在 ManifestSchema 中新增可选字段
generation_actions: z.record(z.string(), GenerationActionSchema).optional(),
```

---

## R-002: Context Registry 注册时机

**Decision**: Provider 在 Domain `index.ts` 初始化时同步注册，与现有 plugin 注册流程一致。

**Rationale**: 现有 `domains/registry.ts` 在模块加载时注册所有 DomainPlugin。Provider 注册应遵循同一模式，在 Domain 初始化函数中调用 `registerContextCapability()`。Registry 使用模块级 Map 存储，与现有缓存模式一致。

**Alternatives considered**:
- 懒加载（首次请求时注册）— 增加复杂度，能力声明应在启动时可见
- 通过 manifest 声明自动注册 — Provider 需要运行时依赖注入（Repository 实例），无法从 manifest 直接构造

**Implementation notes**:
- Registry 放在 `nexus/context-engine/registry.ts`
- 使用 `Map<string, ContextCapability>` 存储
- `registerContextCapability()` 在各 Domain 的 `index.ts` 中调用

---

## R-003: Orchestrator 路径识别机制

**Decision**: Orchestrator 在 `executeIntent()` 中通过 `getFullManifest()` 读取 `generation_actions`，如果 `intent.action` 在其中找到匹配，走生成型路径。

**Rationale**: 现有 `executeIntent()` 已通过 `findDomain()` 获取 Domain plugin。只需额外检查 manifest 的 `generation_actions` 块即可确定路径。无需修改 Intent Engine 或 Rule Engine 的现有行为。

**现有代码分析** (`orchestrator/index.ts:298-330`):
```typescript
// 现有流程：
// 1. findDomain(domainId) → 获取 plugin
// 2. domain.onValidate(intent, usomSnapshot) → 校验
// 3. ruleEngine.evaluate(intent, snapshot) → 评估
// 4. 路由到域特定处理（硬编码 if/else）
```

需要做的修改：
1. 在步骤 1 之后，检查 manifest 是否有 `generation_actions[intent.action]`
2. 如果有，走 Context Engine → Handler → Rule Engine 路径
3. 如果没有，保持现有 if/else 路由逻辑不变

**关键约束**: 被动型路径代码不得修改，只在现有路由逻辑前插入生成型路径分支。

---

## R-004: 生成型路径的追踪事件集成

**Decision**: 扩展现有 `TraceComponent` 枚举，新增 `ContextEngine` 和 `Handler` 值。复用现有 `trace()` 辅助函数记录生成型路径的每个步骤。

**Rationale**: 现有 trace-logger 已有完整的 `TraceStep` 类型和 `trace()` 辅助函数。只需扩展枚举值，在生成型路径的关键节点调用 `trace()` 即可。无需新的追踪基础设施。

**现有代码分析** (`trace-types.ts`):
```typescript
export type TraceComponent =
  | 'IntentEngine' | 'RuleEngine' | 'StateMachine'
  | 'EventBus' | 'ActionSurfaceEngine'
```

扩展后：
```typescript
export type TraceComponent =
  | 'IntentEngine' | 'RuleEngine' | 'StateMachine'
  | 'EventBus' | 'ActionSurfaceEngine'
  | 'ContextEngine' | 'Handler'  // 新增
```

---

## R-005: SchedulingHandler 的 AI 调用策略

**Decision**: SchedulingHandler 通过构造 prompt 调用 AI（复用现有 AI 基础设施），输入为四类来源材料的结构化 JSON，输出为 JSON 格式的 proposalSet。降级策略为基于优先级的确定性排列。

**Rationale**: 现有 `intent-engine/ai-parser.ts` 已有 AI 调用封装。Handler 可以复用类似模式：构造结构化 prompt → 调用 AI → 解析 JSON 输出 → Zod 校验。降级策略确保即使 AI 不可用也有方案输出。

**Alternatives considered**:
- 全规则引擎方案（无 AI）— 无法处理复杂的能量匹配和优先级权衡
- Agent 模式（多轮 AI 调用）— MVP 过于复杂，单次调用足够

---

## R-006: Context Provider 与 Repository 的关系

**Decision**: Provider 持有 Repository 实例的引用，通过 Repository 的只读方法获取数据，然后投影/过滤为共享格式。

**Rationale**: 现有 Repository 接口已有丰富的查询方法（如 `findByDateRange`、`findActiveByDate`）。Provider 只需调用这些只读方法并变换格式。不需要新的 Repository 方法，但可能需要为特定查询场景新增 1-2 个只读方法。

**现有 Repository 方法可用性分析**:

| Provider | 需要的数据 | 现有 Repository 方法 | 是否需要新增 |
|---|---|---|---|
| activeTasks | 当日活跃任务 | `findByStatus('active', userId)` | 可能需要按日期筛选的方法 |
| pendingHabits | 当日待打卡习惯 | `findByStatus('active', userId)` | 需要根据频率计算当日适用的习惯 |
| habitTemplates | 习惯模板列表 | `habitTemplateRepo.findAll(userId)` | 已有 |
| existingTimeboxes | 当日已有时间盒 | `findByDateRange(dayStart, dayEnd, userId)` | 已有 |
| energyProfile | 用户能量校准 | 需要查看 calibration 相关 | 可能需要新增 |

---

## R-007: 用户确认流程的 Markdown 解析

**Decision**: 复用现有 `intent-engine/markdown-parser.ts` 的解析能力。Handler 输出 Markdown 格式的编排计划，用户编辑后，Markdown Parser 将其解析为批量 `StructuredIntent`。

**Rationale**: 现有 `markdown-parser.ts` 已实现 Markdown → StructuredIntent 的解析能力。生成型路径的确认流程只需扩展此解析器以支持 proposal 格式的 Markdown。这遵循了宪法 I 中"AI Markdown workflow"的设计。

**现有代码分析**: `markdown-parser.ts` 已存在并经过测试。只需确保生成的 Markdown 格式与解析器的期望一致。

---

## R-008: Rule Engine 二次验证的扩展

**Decision**: 为生成型路径的 proposalSet 新增一个 Rule Engine 评估入口，逐个验证 proposal 的时间冲突、能量匹配等规则，返回通过/拒绝列表。

**Rationale**: 现有 Rule Engine 的 `evaluate()` 接收 `StructuredIntent + ContextSnapshot`。对于 proposalSet 的二次验证，需要一个新的评估方法或扩展现有方法以接受 `GenerationResult`。选择新增方法以保持现有接口不变。

**Implementation notes**:
- 在 `rule-engine/evaluator.ts` 中新增 `evaluateProposals()` 方法
- 输入为 `GenerationResult + ContextSnapshot`
- 输出为每个 proposal 的验证结果（pass/warning/reject + 原因）
