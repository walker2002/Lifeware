# Query Path Constitution Amendment

> 为引入 Query Path（第三条路径），对 Lifeware Constitution 进行 MINOR 级修正。
> 版本：1.6.0 → 1.7.0
> 日期：2026-05-23

---

## 修正概要

| 类型 | 编号 | 原则/约束 | 修改内容 |
|------|------|----------|---------|
| 新增 | N1 | Principle IX | 三路径路由概念 |
| 扩展 | E1 | Principle I | Phase A 输出增加 pathType |
| 扩展 | E2 | Principle III | Context Engine 职责扩展至查询路径 |
| 扩展 | E3 | Principle VI | 新增 Query Track + onQuery hook |
| 扩展 | E4 | Principle VIII | AI 参与范围增加 Query Track Handler Path |
| 扩展 | E5 | Orchestrator Purity | 查询路径中 Orchestrator 的职责 |
| 扩展 | E6 | Domain Manifest Self-Description | 新增 query_actions 声明 |
| 扩展 | E7 | AI Runtime Constraints #1 | onQuery 接受 AI Runtime 注入 |
| 不变 | — | Context Provider Constraints | 查询路径复用现有 Provider 机制 |
| 不变 | — | CN-UI Protocol Constraints | 查询型 CN-UI 遵循现有声明式约束 |
| 不变 | — | Session Lifecycle | 复用现有 Session Manager |

---

## 修正 N1：新增 Principle IX — Three-Path Routing

在 Core Principles 末尾新增：

```
### IX. Three-Path Routing（三路径路由）

Nexus 处理用户意图时，根据意图性质走三条互斥路径之一：

| 路径 | 触发条件 | 修改状态 | Rule Engine | State Machine |
|------|---------|---------|-------------|---------------|
| Contract Path | actions 中的变更意图 | 是 | 是 | 是 |
| Generative Path | generation_actions | 是（需确认） | 是（验证） | 是（确认后） |
| Query Path | query_actions | 否 | 否 | 否 |

路径路由由 Orchestrator 根据 Domain manifest 声明判定。Intent Engine
Phase A 的路由输出包含 pathType 字段，Orchestrator 不做二次 AI 调用。

Query Path 的硬性约束：
1. 不经过 Rule Engine 和 State Machine
2. 不修改任何系统状态（只读不变）
3. 所有 query_actions 强制 multi_turn Session
4. 查询结果由 Orchestrator 统一记录到 Memory Framework（单一写入口）

Rationale: 三路径模型将意图处理从"一条管道处理所有情况"升级为"按意图
性质分流处理"。查询意图天然不属于合约型——它不修改状态、不产生
StateProposal、不需要用户确认执行。明确的路径分离使每条路径的约束更清晰，
避免在现有管道中打补丁。

How to apply: 新增 Domain 的查询能力只需在 manifest 中声明 query_actions，
无需修改 Nexus 核心组件。Orchestrator 路由逻辑从 manifest 动态读取。
```

---

## 修正 E1：Principle I — Phase A 输出扩展

**原文（相关段落）**：

> This is "interpretive execution" — AI MUST participate. Domain manifests provide `intent_triggers` as structured routing context. The output space is bounded: only registered Domain actions are candidates. Low confidence triggers user clarification.

**修改为**：

> This is "interpretive execution" — AI MUST participate. Domain manifests provide `intent_triggers` as structured routing context. The output space is bounded: only registered Domain actions are candidates. **Output includes `pathType`: `'contract'` | `'generative'` | `'query'`**, determined by matching against `actions`, `generation_actions`, and `query_actions` in Domain manifest. Low confidence triggers user clarification.

---

## 修正 E2：Principle III — Context Engine 职责扩展

**原文（Single-Writer 表格相关行）**：

> | Context Engine | Context assembly for generative operations; reads manifest `generation_actions`, resolves Context Capabilities, produces `GenerationRequest` |

**修改为**：

> | Context Engine | Context assembly for **all paths requiring assembled context data**; reads manifest `generation_actions` **and `query_actions`**, resolves Context Capabilities, produces `GenerationRequest` **or `QueryContext`** |

---

## 修正 E3：Principle VI — 新增 Query Track

在 Generative Track — Handlers 段落之后、Context Providers 段落之前，新增：

```
#### Query Track — Handlers (Query System, read-only)

Domain-defined computational units for read-only data queries.
Query Path 内部根据查询复杂度分为两条子路径：

1. **Shortcut Path**（简单展示型查询）：
   适用于数据直接来自 Context Provider、无需 LLM 加工、只需 CN-UI 展示
   的场景。Orchestrator 委托 Context Engine 获取数据后，执行声明式的
   数据到 CN-UI 模板映射（template-based formatting）。这是格式化操作，
   不是业务逻辑。不经过 Handler。

2. **Handler Path**（复杂分析型查询）：
   适用于需要 LLM 生成自然语言回答或数据需加工后输出的场景。
   Handler entry point: `onQuery(context: QueryContext, aiRuntime: AIRuntime)`。
   AI Runtime 以依赖注入方式传入，与 onGenerate 共享同一注入模式。

**Shortcut Path vs Handler Path 判定**：
- response_mode === 'cnui' 且 Domain 未实现 onQuery handler → Shortcut Path
- response_mode === 'text' 或 Domain 实现了 onQuery handler → Handler Path

**Handler constraints (onQuery)**:
- Handlers MAY call AI via injected `aiRuntime`（与 onGenerate 一致）
- Handlers MUST NOT modify any state（Query Path 只读不变约束）
- Handlers MUST NOT access repositories directly — all data arrives
  via `QueryContext.contexts` assembled by Context Engine（与 onGenerate 一致）
- Handler output is `QueryResult`（type: 'text' | 'cnui'），never StateProposal
- Handlers MUST NOT trigger events directly（与 onGenerate 一致）

**Shortcut Path constraints**:
- Orchestrator 的 CN-UI 组装是声明式模板填充，MUST NOT 包含：
  条件分支决策、数据聚合计算、LLM 调用、状态写入
- CN-UI 组件只能使用 Component Catalog 中注册的只读展示型组件
```

在 Manifest Declarations 段落中，在 generation_actions 引用之后新增：

```
For Domains with query capabilities, manifests MAY include a
`query_actions` block declaring query entry points and their required
Context Provider dependencies (see Architecture Constraints >
Domain Manifest Self-Description).
```

---

## 修正 E4：Principle VIII — AI 参与范围扩展

**原文（第一段）**：

> AI handles ambiguity; rules handle certainty. AI participates in Intent Engine Phase A (routing classification) and Phase B (field extraction), Presentation (report generation), Domain Plugin Handlers (generative planning within Domain scope).

**修改为**：

> AI handles ambiguity; rules handle certainty. AI participates in Intent Engine Phase A (routing classification) and Phase B (field extraction), Presentation (report generation), Domain Plugin Handlers (generative planning within Domain scope), **and Query Track Handler Path (analytical query processing via onQuery)**.

在"Streaming boundary"段落之后新增：

```
**Query Path boundary**: Shortcut Path 不调用 AI。Handler Path 的 onQuery
遵循与 onGenerate 相同的 AI 参与规则：AI Runtime 通过依赖注入传入，
Handler 决定调用策略。onQuery 的 AI 输出是只读的回答文本或 CN-UI 展示，
不产生 StateProposal。
```

---

## 修正 E5：Orchestrator Purity — 查询路径职责

在现有"For generative operations"段落后新增：

```
For query operations, the Orchestrator identifies the correct path by
checking whether the action exists in the Domain manifest's
`query_actions` block. If present, it:
1. Delegates data assembly to Context Engine（same as generative path）
2. For Shortcut Path:
   - Orchestrator performs declarative data-to-CNUI template mapping.
     This is formatting (data → UI template), not business logic.
   - Orchestrator MUST NOT make conditional decisions, perform data
     aggregation, or call AI during this mapping.
3. For Handler Path:
   - Delegates to handler.onQuery() with injected aiRuntime,
     same injection pattern as generative path
4. Records query result summary to Session via Memory Framework
   (遵循 Single-Writer 原则，Orchestrator 调用 Memory Framework API)

Query Path 不经过 Rule Engine 和 State Machine。
```

---

## 修正 E6：Domain Manifest Self-Description — 新增 query_actions

在 `generation_actions` 相关段落之后新增：

```
For Domains with query capabilities, manifests MAY declare a fourth
structured field:

| Field | Consumer | Purpose |
|---|---|---|
| `query_actions` | Context Engine + Orchestrator + AI Runtime | Query entry points and their required Context Provider dependencies |

The `query_actions` block maps each query action to:
- `response_mode`: `'text'` | `'cnui'`
- `cnui_surface`: CNUISurface type identifier (when response_mode is cnui)
- `context_capabilities`: which Context Capabilities to resolve
- `session_mode`: forced to `'multi_turn'` (Query Path design constraint,
  not configurable)

All `query_actions` are implicitly `multi_turn`. No `single_shot` option.
This is a design constraint of Query Path, reflecting the principle that
queries are conversation starters, not endpoints.

Adding a new Domain's query capabilities MUST NOT require modifying Nexus
components — only registering new `query_actions` declarations in manifest.
```

---

## 修正 E7：AI Runtime Constraints — 第 1 条扩展

**原文**：

> 1. **Dependency injection, not middleware**: AI Runtime is injected into Handler's `onGenerate` hook as a parameter. Orchestrator does not call AI Runtime directly. AI Runtime is invisible to Reactive Path (onIntent hooks).

**修改为**：

> 1. **Dependency injection, not middleware**: AI Runtime is injected into Handler's `onGenerate` **and `onQuery`** hooks as a parameter. Orchestrator does not call AI Runtime directly. AI Runtime is invisible to Reactive Path (onIntent hooks) **and Shortcut Path (Orchestrator direct formatting)**.

---

## 不变项说明

以下约束无需修改，Query Path 自然兼容：

| 约束 | 说明 |
|------|------|
| **Context Provider Constraints** | Query Path 复用现有 Provider 机制。Provider 的"只读投影 + 无复杂计算"天然适合查询场景 |
| **CN-UI Protocol Constraints** | 查询型 CN-UI 遵循现有声明式约束。区别仅在组件状态为只读展示 |
| **Session Lifecycle** | Query Session 复用现有 AISessionManager，扩展查询结果存储能力 |
| **Repository Interface Isolation (V)** | Query Path 通过 Context Provider 获取数据，不直接调用 Repository |
| **Bridge Layer Readiness (VII)** | Query Path 的 Nexus 方法签名不依赖 HTTP 上下文 |

---

## Sync Impact Report

- **Version**: 1.6.0 → 1.7.0
- **Rationale**: MINOR — 引入三路径路由概念，新增 Principle IX，扩展 Handler 接口和 Context Engine 职责。无原则被删除或重定义。
- **Modified principles**:
  - I (Intent-Driven) → Phase A 输出增加 pathType
  - III (Single-Writer) → Context Engine 职责扩展
  - VI (Domain Plugin) → 新增 Query Track + onQuery hook
  - VIII (AI/Rule Boundary) → AI 参与范围增加 Query Track
- **Added principles**:
  - IX (Three-Path Routing) — 新增
- **Modified architecture constraints**:
  - Orchestrator Purity → 新增查询路径职责
  - Domain Manifest Self-Description → 新增 query_actions 声明
  - AI Runtime Constraints #1 → onQuery 接受注入
- **Templates requiring updates**: 无
- **Follow-up documents requiring updates**:
  - `docs/usom-design.md` — 新增 QueryContext, QueryResult 类型
  - `mydocs/core/LW_overall_总体设计_*.md` — 更新 Nexus 三路径路由图
  - `mydocs/core/LW_domain_注册指南_*.md` — 新增 query_actions 声明步骤
