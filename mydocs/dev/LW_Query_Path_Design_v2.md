# Query Path（查询路径）改进方案 V2

> 为 Lifeware AI 对话中的查询意图设计独立路径，与现有 Contract Path / Generative Path 兼容共存。
> 核心洞察：**查询不是终点，而是对话的起点。**
>
> 版本：V2.0 | 2026-05-23

---

## 目录

- [1 背景与需求](#1-背景与需求)
  - [1.1 核心洞察](#11-核心洞察)
  - [1.2 现有三类意图形式](#12-现有三类意图形式)
  - [1.3 query_actions 与 view_route 的边界](#13-query_actions-与-view_route-的边界)
- [2 架构定位](#2-架构定位)
  - [2.1 核心设计原则](#21-核心设计原则)
  - [2.2 Query Session 概览](#22-query-session-概览)
- [3 三条路径总览](#3-三条路径总览)
- [4 Query Path 详细设计](#4-query-path-详细设计)
  - [4.1 路径识别](#41-路径识别)
  - [4.2 Query Session 生命周期](#42-query-session-生命周期)
  - [4.3 双轨查询机制](#43-双轨查询机制)
  - [4.4 查询型 CN-UI 与生成型 CN-UI 的区别](#44-查询型-cn-ui-与生成型-cn-ui-的区别)
  - [4.5 Handler 接口扩展](#45-handler-接口扩展)
  - [4.6 查询上下文的注入机制](#46-查询上下文的注入机制)
  - [4.7 与 Memory Framework 的对接](#47-与-memory-framework-的对接)
  - [4.8 后续意图的路由](#48-后续意图的路由)
- [5 与三条路径的衔接](#5-与三条路径的衔接)
- [6 关键设计决策](#6-关键设计决策)
- [7 与现有架构的兼容性](#7-与现有架构的兼容性)
- [8 实施计划](#8-实施计划)
  - [8.1 MVP 阶段](#81-mvp-阶段)
  - [8.2 MVP+ 阶段](#82-mvp阶段)
  - [8.3 扩展阶段](#83-扩展阶段)
- [9 教练式对话的分阶段实现](#9-教练式对话的分阶段实现)

---

## 1 背景与需求

### 1.1 核心洞察

> **查询不是终点，而是对话的起点。**

用户在查询后几乎必然会有后续行为：追问原因、寻求建议、基于查询结果做决策。这本质上就是"教练式对话"的雏形。

**用户行为模式**：

```
用户: "看看我的习惯列表"                    ← Query Path
AI:  [渲染 CN-UI 习惯列表，5个习惯]

用户: "为什么冥想 streak 这么低？"           ← 同 Session 追问
AI:  "你的冥想 streak 是8天，比跑步的23天低。
      可能原因是时间设在21:00太晚，建议调整到晨间..."

用户: "帮我调整一下"                         ← 意图转换
AI:  [CN-UI 编辑卡片，用户修改时间]

用户: "再看看调整后的列表"                   ← 再次查询
AI:  [更新后的习惯列表]

用户: "好的，谢谢"                           ← 明确结束
AI:  [Session 关闭]
```

**关键观察**：
- 查询 → 追问 → 操作 → 再查询 → 结束，这是一个自然的对话流
- 每个环节都依赖之前的上下文（"为什么**冥想** streak 低"依赖查询结果知道有冥想这个习惯）
- 如果每次查询后 Session 关闭，用户体验会严重割裂

### 1.2 现有三类意图形式

总体设计文档第 330 行已定义 AI 意图驱动的三类形式：

1. **具体行动信息输入/修改**（变更操作）→ Contract Path
2. **综合信息查询和统计**（只读查询）→ **本文档设计的 Query Path**
3. **教练式指导**（深度交流）→ **未来版本设计，本文档不覆盖**

第 354 行的"合约型链路"（Rule Engine → State Machine）仅适用于变更类意图。查询意图天然不属于合约型——它不修改状态、不产生 StateProposal、不需要用户确认执行。

### 1.3 query_actions 与 view_route 的边界

**核心区分原则**：

| 维度 | `view_route`（已有） | `query_actions`（新增） |
|------|---------------------|------------------------|
| **用户意图** | "打开习惯管理页面" "进入设置" | "看看我的习惯" "今天有哪些任务" |
| **体验目标** | 进入完整功能页面，可深度操作 | 在对话中快速获取信息，不离开对话 |
| **交互模式** | 页面导航，离开 AI 对话上下文 | 对话内输出（文字或 CN-UI Surface） |
| **输出形式** | 路由到独立页面（`/habits`） | 文字回答或 CN-UI 只读展示 |
| **编辑能力** | 完整 CRUD | 只读（纯展示） |
| **后续交互** | 用户在独立页面操作 | 用户继续在同一对话中交流 |

**判断规则（Intent Engine AI 路由提示词中必须包含）**：

```
用户表达"查看/看看/查一下..."时：

- 如果用户意图是"进入某个功能模块的完整页面" → view_route
  例："打开习惯管理" "进入时间盒页面" " habit 设置"

- 如果用户意图是"在对话中获取数据快照" → query_actions
  例："看看我的习惯" "今天有哪些任务" "这周跑了几次"

- 模糊情况（如"看看习惯"）：
  默认走 query_actions（对话内快速展示），
  用户可后续说"打开详细页面"再切换到 view_route
```

**Domain manifest 中的区分示例**：

```yaml
# domains/habits/manifest.yaml

intent_triggers:
  # view_route：导航到独立页面
  - action: view_list
    type: view_route
    description: "用户想进入习惯管理的完整页面"
    route: "/habits"
    examples:
      - "打开习惯管理"
      - "进入习惯页面"

  # query_actions：对话内查询
  - action: list_active_habits
    type: query_action
    description: "用户在对话中查看习惯列表"
    response_mode: cnui
    cnui_surface: habit-list-card
    context_capabilities:
      - active_habits
    examples:
      - "看看我的习惯"
      - "有哪些习惯"

  - action: habit_statistics
    type: query_action
    description: "查询习惯完成情况统计"
    response_mode: text
    context_capabilities:
      - habit_logs
      - habit_streaks
    examples:
      - "习惯统计"
      - "跑步坚持多久了"
```

---

## 2 架构定位

Query Path 是 Nexus 中的**第三条路径**，与 Contract Path、Generative Path 并列，由 Orchestrator 根据意图类型自动路由。

### 2.1 核心设计原则

1. **只读不变**：Query Path 承诺不修改任何系统状态
2. **链路最短**：绕过 Rule Engine 和 State Machine，直接返回结果
3. **上下文可续**：查询结果沉淀到 Memory L1，支持后续对话引用
4. **复用现有组件**：复用 Intent Engine、Context Engine、Handler、AI Runtime，不新增独立组件
5. **Query 默认 multi_turn**：所有 `query_actions` 强制 `multi_turn`，不设 `single_round` 选项（详见 4.2 节）

### 2.2 Query Session 概览

Query Path 的关键创新：**查询不是一次性的，而是一个 Session 的起点**。

```
用户: "看看我的习惯"
  |
  v
Query Path 执行 → 返回 CN-UI 习惯列表
  |
  v
Session 保持 active ←── 关键：不关闭
  |
  +-- 用户: "为什么冥想 streak 这么低？"  ← 同 Session 追问
  +-- 用户: "帮我调整冥想时间"             ← 意图切换到 Contract Path
  +-- 用户: "再看看习惯列表"               ← 再次查询
  +-- 用户: "好的谢谢"                     ← 结束意图，Session 关闭
```

Query Session 的特征：
- 查询完成后 **Session 保持 active**，等待后续对话
- 后续用户的每一轮输入仍走完整的 Intent Engine → 三条路径
- 查询结果作为 "对话种子" 存入 Session，后续所有对话自动继承
- Session 在超时、导航离开或用户明确结束时关闭

---

## 3 三条路径总览

```
用户输入（自然语言）
  |
  v
Intent Engine -- 路由识别（阶段 A）
  |
  +-- 变更意图（create/update/delete）───> Contract Path
  |       |
  |       v  Rule Engine（onValidate）
  |       v  State Machine（状态变更）
  |       v  Event Bus → Memory → Action Surface
  |
  +-- 生成意图（"帮我安排""生成总结"）──> Generative Path
  |       |
  |       v  Context Engine → Handler.onGenerate()
  |       v  Rule Engine（验证生成的 proposal）
  |       v  用户确认 → State Machine 执行
  |
  +-- 查询意图（"查一下""看看""统计"）──> Query Path（新增）
          |
          +-- 创建 Query Session（强制 multi_turn）
          +-- 简单展示型查询 ──> Shortcut Path（Orchestrator → Context Provider → CN-UI）
          +-- 复杂分析型查询 ──> Handler.onQuery() → 文字回答
          v
          Orchestrator 记录查询摘要到 Session
          Session 保持 active
          （无 Rule Engine / State Machine）
```

| 维度 | Contract Path | Generative Path | **Query Path（新增）** |
|------|--------------|-----------------|----------------------|
| 目的 | 执行变更 | 生成新内容 | **查询现有数据** |
| 修改状态 | 是 | 是（需确认） | **否（只读）** |
| Rule Engine | 经过 | 经过 | **不经过** |
| State Machine | 经过 | 经过（确认后） | **不经过** |
| 用户确认 | 需要 | 需要 | **不需要** |
| Session 模式 | single_round / multi_turn | single_round / multi_turn | **强制 multi_turn** |
| Handler hook | `onIntent` | `onGenerate` | **`onQuery`（可选）** |
| 查询子路径 | — | — | **Shortcut Path + Handler Path** |
| manifest 声明 | `actions` | `generation_actions` | **`query_actions`** |

---

## 4 Query Path 详细设计

### 4.1 路径识别

Orchestrator 在 Intent Engine 路由后，根据 Domain manifest 判断路径：

```typescript
// Orchestrator 路径选择

class Orchestrator {
  async route(structuredIntent: StructuredIntent): Promise<PathType> {
    const manifest = this.domainRegistry.getManifest(structuredIntent.targetDomain)
    const action = structuredIntent.action
    
    // 1. 查 query_actions
    if (manifest.query_actions?.find(qa => qa.action === action)) {
      return 'query'
    }
    
    // 2. 查 generation_actions
    if (manifest.generation_actions?.find(ga => ga.action === action)) {
      return 'generative'
    }
    
    // 3. 默认 Contract Path
    return 'contract'
  }
}
```

### 4.2 Query Session 生命周期

#### 创建与查询

```
用户输入查询意图
  |
  v
Intent Engine 路由: targetDomain='habits', action='list_active_habits'
  |
  v
Orchestrator 识别: query_actions → Query Path
  |
  v
SessionManager.createSession({
    mode: 'multi_turn',           ← 强制 multi_turn
    domainId: 'habits',
    action: 'list_active_habits',
    contextSeed: { ... }          ← 初始上下文（从 Context Engine 获取）
})
  |
  v
Query Path 执行 → 返回查询结果
  |
  v
Orchestrator 记录 query_result 到 Session
  |
  v
返回结果给用户，Session 保持 active ← 关键：不关闭
```

**Domain manifest 声明**：

```yaml
query_actions:
  - action: list_active_habits
    description: "查询习惯列表"
    response_mode: cnui
    cnui_surface: habit-list-card
    context_capabilities:
      - active_habits
    # 注意：不声明 session_mode，强制默认为 multi_turn
```

**关键决策**：`query_actions` 不设置 `session_mode` 字段，系统强制默认为 `multi_turn`。这是 Query Path 的设计约束，不允许 `single_round`。

#### 后续对话阶段

Session 保持 active 期间，用户的每一轮输入都走完整的意图处理流程：

```
Session: active
  |
  +-- 用户输入: "为什么冥想 streak 这么低？"
  |     |
  |     v Intent Engine 路由（带查询上下文 sessionQueries）
  |     v 可能路由到: habits.query_insight（另一条 query_action）
  |     v Query Path 执行，读取 Session 中的 query_result 作为上下文
  |     v 返回回答
  |     Session: active（仍不关闭）
  |
  +-- 用户输入: "帮我调整冥想时间"
  |     |
  |     v Intent Engine 路由
  |     v 路由到: habits.update_habit（contract action）
  |     v Contract Path → CN-UI 编辑卡片 → 用户修改 → 确认
  |     v State Machine 执行更新
  |     v 更新后的数据自动刷新 Session 上下文
  |     Session: active
  |
  +-- 用户输入: "再看看习惯列表"
  |     |
  |     v Intent Engine 路由
  |     v 路由到: habits.list_active_habits（query_action）
  |     v Query Path 执行，返回最新数据
  |     v 新的 query_result 替换旧的存入 Session
  |     Session: active
```

#### 关闭条件

Query Session 在以下任一条件满足时关闭：

| 关闭条件 | 示例 | 检测方式 |
|---------|------|---------|
| **用户明确结束** | "好的" "谢谢" "关闭" "结束" | Intent Engine 识别到结束意图（confidence > 0.8） |
| **导航离开对话** | "打开习惯管理页面"（view_route） | Orchestrator 识别到 view_route，关闭当前 Session |
| **超时** | 5 分钟无用户输入 | SessionManager 定时检查 |
| **意图跨 Domain 且无关联** | 查询习惯后说"帮我设置一个闹钟"（跳到时钟 Domain） | Orchestrator 判断新意图与原 Session Domain 无关 |

**注意**：同 Domain 内的意图转换不关闭 Session（如查询习惯后创建习惯）。跨 Domain 但有关联也不关闭（如查询 OKR 后创建关联任务）。

### 4.3 双轨查询机制

Query Path 内部根据查询复杂度分为两条子路径：

#### A. Shortcut Path（简单展示型查询）

适用于：数据直接来自 Context Provider，无需 LLM 加工，只需 CN-UI 展示。

**谁调用谁**：Orchestrator 直接调用 Context Provider → CN-UI 组装，**不经过 Handler**。

```
用户: "看看我的习惯列表"
  |
  v
Orchestrator 识别: query_actions → Query Path
  |
  v
Context Engine.assemble(intent, manifest.query_actions)
  |   读取 context_capabilities: active_habits
  |   调用 Context Provider → Repository.findByStatus('active')
  |
  v
Orchestrator 收到数据: [习惯1, 习惯2, 习惯3]
  |
  v
Orchestrator 直接组装 CNUIPayload（只读展示型）
  |   surfaceType: 'habit-list-card'
  |   components: [list items]
  |   actions: [{ dismiss }]
  |
  v
返回客户端渲染
  |
  v
Orchestrator 记录 query_result 到 Session（Session 保持 active）
```

**为什么不需要 Handler**：
- 逻辑只有"查数据库 → 包装为 CN-UI"，无业务编排
- 与 Generative Path 不同，不需要 LLM 生成内容
- 避免每个简单查询都要写一个 Handler 类

**Shortcut Path 适用条件**：
- `response_mode === 'cnui'`
- `context_capabilities` 声明的数据可直接展示，无需 LLM 加工
- 不需要自然语言总结或分析

#### B. Handler Path（复杂分析型查询）

适用于：需要 LLM 生成自然语言回答，或数据需要 Handler 加工后输出。

**谁调用谁**：Orchestrator → Handler.onQuery() → Handler 内部调用 AI Runtime。

```
用户: "我这周的跑步数据怎么样？"
  |
  v
Orchestrator 识别: query_actions → Query Path
  |
  v
Context Engine.assemble(intent, manifest.query_actions)
  |   读取 context_capabilities: habit_logs, habit_streaks
  |
  v
Handler.onQuery(queryContext)
  |   1. 从 contexts 获取原始数据
  |   2. 调用 aiRuntime.generateText() 让 LLM 生成分析回答
  |   3. 返回文字回答
  |
  v
直接返回文字给客户端
  |
  v
Orchestrator 记录 query_result 到 Session（Session 保持 active）
```

**为什么需要 Handler**：
- 需要 LLM 生成自然语言分析（"你这周跑步3次，比上周减少1次..."）
- 需要 Handler 做数据加工（聚合、计算指标、对比趋势）
- Handler 可以控制 prompt 和输出质量

**Handler Path 适用条件**：
- `response_mode === 'text'`（需要 LLM 生成文字回答）
- 或 `response_mode === 'cnui'` 但数据需要 Handler 加工后才能展示

### 4.4 查询型 CN-UI 与生成型 CN-UI 的区别

| 维度 | 生成型 CN-UI（Generative Path） | 查询型 CN-UI（Query Path） |
|------|------------------------------|--------------------------|
| 目的 | 让用户编辑/确认生成结果 | 让用户查看现有数据 |
| 组件状态 | 可编辑（input、select 等） | 只读展示（text、badge 等） |
| 操作按钮 | confirm + cancel | dismiss（可选） |
| 数据流向 | 用户填写 → 确认 → State Machine 写入 | 只读展示，无数据流出 |
| 后续对话 | 确认后进入执行链路 | 关闭后继续在同一 Session 对话 |
| Surface 来源 | Handler 生成（LLM 参与） | Orchestrator 直接组装（Shortcut Path）或 Handler 组装（Handler Path） |

### 4.5 Handler 接口扩展

```typescript
// types/handler.ts

interface DomainHandler {
  // ── 合约型路径（变更操作）────
  onIntent(structuredIntent: StructuredIntent): Promise<HandlerResult>
  
  // ── 生成型路径（AI 生成方案）───
  onGenerate?(request: GenerationRequest): Promise<GenerationResult>
  
  // ── 查询路径（可选，仅复杂分析型查询需要）───
  onQuery?(context: QueryContext): Promise<QueryResult>
  
  // ── 其他 hooks ──────────────
  onEvent(event: DomainEvent): Promise<DomainAdvice>
  onValidate(proposal: StateProposal): Promise<ValidationResult>
  onActionSurfaceRequest(snapshot: ContextSnapshot): Promise<ActionCandidate[]>
}

// ── QueryContext ──
interface QueryContext {
  intent: StructuredIntent
  contexts: Record<string, unknown>
  sessionId?: string
  sessionContext?: SessionContext    // 同 Session 中的历史查询上下文
  filters?: Record<string, unknown>
}

// ── QueryResult ──
// 注意：不返回 rawData。完整对象在需要时由 Context Provider 重新查询。
interface QueryResult {
  type: 'text' | 'cnui'
  content?: string
  payload?: CNUIPayload
}
```

### 4.6 查询上下文的注入机制

#### 查询结果存入 Session

Query Path 完成后，Orchestrator 将查询结果以特殊消息格式存入 Session：

```typescript
// Session 消息中的 query_result 记录

interface QueryResultMessage {
  role: 'assistant'
  type: 'query_result'
  queryAction: string         // 如 'list_active_habits'
  queryDomain: string         // 如 'habits'
  responseMode: 'text' | 'cnui'
  resultSummary: {
    count: number             // 结果数量
    objectIds: string[]       // 对象 ID 列表（需要时重新查询）
    keyMetrics: Record<string, unknown>  // 关键指标
  }
  answerText?: string         // 文字查询的回答文本
  cnuiSurfaceType?: string    // CN-UI 查询的 surface 类型
  timestamp: string           // 用于上下文衰减计算
}
```

**存入时机**：Query Path 返回结果后，由 Orchestrator 立即存入 Session。存入的是摘要（ID + 指标），不是完整对象。

#### 上下文注入流程

后续对话中，查询上下文如何被使用：

```
用户输入: "为什么冥想 streak 这么低？"
  |
  v
Context Engine.assemble(structuredIntent, session)
  |
  +-- 读取 manifest 中的 context_capabilities
  +-- 调用 Context Provider 获取数据
  +-- 读取 Session 历史中的 query_result 消息
  +-- 将 query_result 注入 contexts 的 session_context 字段
  |
  v
Handler 收到 GenerationRequest
  {
    intent: { ... },
    contexts: {
      active_habits: [...],           // 常规上下文
      session_context: {               // 查询上下文（自动注入）
        priorQueries: [
          {
            action: 'list_active_habits',
            resultSummary: { count: 5, objectIds: [...] },
            answerText: '你有5个习惯...',
            timestamp: '2026-05-23T10:00:00Z',
            relevance: 1.0              // 衰减系数
          }
        ]
      }
    }
  }
  |
  v
Handler 可以基于 session_context.priorQueries 回答追问
```

**关键设计**：`session_context` 是 Context Engine 自动注入的，Handler 不需要额外逻辑。只需要在 prompt 中引用 `session_context.priorQueries` 即可。

#### 上下文衰减策略

Session 中的 query_result 不是永久有效的，需要衰减：

| 时间 | 衰减策略 | 说明 |
|------|---------|------|
| 0-5 分钟 | 100% 权重 | 刚查询的结果，用户很可能追问 |
| 5-15 分钟 | 80% 权重 | 仍然高度相关 |
| 15-30 分钟 | 50% 权重 | 可能已过时，用户可能已做操作 |
| 30 分钟+ | 20% 权重 | 仅保留 ID 列表，关键指标降级 |
| 新查询覆盖 | 替换旧结果 | 同 action 的新查询替换旧结果 |

**衰减的实现方式**：不是删除旧数据，而是在 prompt 中调整引用权重。Context Engine 在组装 `session_context` 时，根据时间戳计算衰减系数。

```typescript
// Context Engine 组装 session_context 时的衰减逻辑

function assembleSessionContext(sessionMessages: SessionMessage[]): SessionContext {
  const queryResults = sessionMessages
    .filter(m => m.type === 'query_result')
    .map(m => ({
      ...m,
      relevance: calculateRelevance(m.timestamp)  // 基于时间的衰减系数
    }))
  
  return {
    priorQueries: queryResults.sort((a, b) => b.relevance - a.relevance)
  }
}

function calculateRelevance(timestamp: string): number {
  const minutes = (Date.now() - new Date(timestamp).getTime()) / 60000
  if (minutes < 5) return 1.0
  if (minutes < 15) return 0.8
  if (minutes < 30) return 0.5
  return 0.2
}
```

### 4.7 与 Memory Framework 的对接

**写入路径（单一写入口原则）**：

根据总体设计文档第 617-622 行的约束，任何组件不得直接写 Memory Framework。Query Path 的记录方式：

**Orchestrator 显式调用 Memory Framework API 记录**（方案 1，MVP 推荐）：

```typescript
// Orchestrator 在 Query Path 完成后记录

class Orchestrator {
  async executeQueryPath(structuredIntent: StructuredIntent, session: AISession) {
    // ... 执行查询，获取结果 ...
    
    // 由 Orchestrator 调用 Memory Framework 的显式记录 API
    // 注意：只存摘要，不存完整对象
    await this.memoryFramework.record({
      type: 'query_result',
      sessionId: session.id,
      domain: structuredIntent.targetDomain,
      action: structuredIntent.action,
      resultSummary: {
        objectIds: habits.map(h => h.id),
        count: habits.length,
        keyMetrics: {
          maxStreak: Math.max(...habits.map(h => h.streak)),
          avgCompletionRate: calculateAvg(habits)
        }
      },
      answerText: result.type === 'text' ? result.content : undefined,
      cnuiSurfaceType: result.type === 'cnui' ? result.payload?.surfaceType : undefined
    })
  }
}
```

**为什么只存摘要，不存完整对象**：

| 维度 | 存完整对象 | 存摘要（推荐） |
|------|-----------|--------------|
| L1 体积 | 膨胀（大量业务对象） | 精简（ID + 指标） |
| L1 → L2 摘要 | 摘要器需处理结构化数据 | 摘要器处理纯对话文本 |
| 数据一致性 | 可能过期（对象后续被修改） | 始终一致（需要时重新查询） |
| 隐私合规 | 原始文字/敏感数据可能泄漏 | 摘要更安全 |
| 后续对话引用 | 直接用缓存数据 | 通过 objectIds 重新查询最新数据 |

**后续对话引用机制**：

```
用户: "看看我的习惯列表"                    ← Query Path，记录摘要到 L1
AI:  [渲染 CN-UI 习惯列表]
用户: "为什么冥想的 streak 这么低？"         ← 同 Session 继续对话
AI:  [从 L1 读取 query_result 摘要]
      [通过 objectIds 重新查询最新数据]
      "根据刚才的查询，你的冥想 streak 是8天...
       （数据来源已刷新，反映最新状态）"
```

### 4.8 后续意图的路由

Query Session 中用户的后续输入，**完全走正常的意图路由流程**，不特殊处理。但有一个关键增强：

**Intent Engine 路由时，Session 中的 query_result 作为附加上下文传入**。

```typescript
// Intent Engine 的两阶段处理

class IntentEngine {
  async process(userInput: string, session?: AISession): Promise<IntentResolution> {
    // 阶段 A：路由判断
    // 传入的上下文包括：
    // 1. 所有 Domain 的 intent_triggers（已有）
    // 2. Session 中的 query_result 摘要（新增）
    
    const routingContext = this.buildRoutingContext(session)
    
    const routeResult = await this.aiRoute(userInput, routingContext)
    
    // 如果有活跃的 query_result，AI 更容易理解追问
    // 例：用户说"为什么冥想 streak 这么低？"
    // AI 看到 query_result 中有 habits 列表，知道"冥想"是其中一个习惯
    // 路由到 habits.query_insight 而不是 habits.create_habit
    
    return routeResult
  }
  
  private buildRoutingContext(session?: AISession): RoutingContext {
    const baseContext = this.domainRegistry.getAllTriggers()
    
    if (session) {
      const queryResults = session.messages
        .filter(m => m.type === 'query_result')
        .map(m => ({
          domain: m.queryDomain,
          action: m.queryAction,
          summary: m.resultSummary
        }))
      
      return {
        ...baseContext,
        sessionQueries: queryResults  // 注入查询上下文
      }
    }
    
    return baseContext
  }
}
```

**路由示例**：

```
Session 中有 query_result: list_active_habits（5个习惯，包含冥想）

用户: "为什么冥想 streak 这么低？"
  → Intent Engine 看到 sessionQueries 中有 habits 数据
  → 理解"冥想"是当前查询上下文中的一个习惯
  → 路由到 habits.query_insight（追问类 query_action）
  → 不是 habits.create_habit（创建新习惯）

用户: "帮我创建一个提醒"
  → Intent Engine 看到"创建"是变更操作
  → 但上下文是 habits 查询
  → 路由到 habits.create_reminder（contract action）
  → 自动关联到冥想习惯
```

---

## 5 与三条路径的衔接

Query Session 中，用户的后续意图可以走任意一条路径：

```
Query Session (active)
  |
  +-- 用户: "为什么..."（追问）
  |     → Intent Engine → query_actions.match
  |     → Query Path (Shortcut 或 Handler)
  |     → 返回回答，Session active
  |
  +-- 用户: "帮我调整..."（修改）
  |     → Intent Engine → actions.match
  |     → Contract Path → CN-UI → Rule Engine → State Machine
  |     → 执行完成，Session active
  |
  +-- 用户: "帮我生成..."（生成）
  |     → Intent Engine → generation_actions.match
  |     → Generative Path → Handler.onGenerate → CN-UI → 确认 → State Machine
  |     → 执行完成，Session active
  |
  +-- 用户: "结束"
        → Intent Engine → end_session
        → SessionManager.closeSession
        → Memory Framework 归档
```

**关键：所有路径共享同一个 Session，共享 query_result 上下文。**

---

## 6 关键设计决策

### 决策 1：query_actions 强制 conversational

`query_actions` 不设置 `session_mode` 字段，系统强制默认为 `conversational`。这是 Query Path 的设计约束，不允许 `single_round`。

### 决策 2：Context Engine 不复用 assemble()

删除 V1 中的 `assembleQuery()` 提议。Query Path 直接复用现有的 `Context Engine.assemble()`，逻辑完全相同——读取 manifest 中的 `context_capabilities`，调用对应 Provider。Orchestrator 传入 `query_actions` 中的声明即可。

### 决策 3：命名统一为 response_mode

与 `generation_actions` 保持一致，`query_actions` 也使用 `response_mode: text | cnui`：

```yaml
query_actions:
  - action: list_active_habits
    response_mode: cnui     # 统一用 response_mode，不用 outputType
    cnui_surface: habit-list-card
```

### 决策 4：onQuery 可选，Shortcut Path 不需要 Handler

简单展示型查询（Shortcut Path）完全不需要 Handler 介入，Orchestrator 直接组装结果。只有复杂分析型查询（Handler Path）才需要实现 `onQuery`。这避免了"每个 Domain 都要写 Handler 才能支持查询"的负担。

### 决策 5：Memory 写入由 Orchestrator 负责

Handler 不直接调用 Memory Framework。查询完成后，由 Orchestrator 统一调用 `memoryFramework.record()` 记录查询摘要。这符合总体设计文档"单一写入口"原则。

---

## 7 与现有架构的兼容性

### 7.1 需要修改的内容

| 组件 | 修改内容 | 工作量 |
|------|---------|--------|
| **Intent Engine** | AI 路由提示词增加 view_route vs query_actions 区分规则 + sessionQueries 上下文注入 | 0.5 天 |
| **Orchestrator** | 新增路径选择逻辑 + Shortcut Path 组装 + Memory 记录 + Session 关闭条件判断 | 1 天 |
| **Context Engine** | `assemble()` 注入 `session_context.priorQueries` | 0.5 天 |
| **SessionManager** | Query Session 超时检查 + query_result 替换逻辑 | 0.5 天 |
| **Domain Handler** | 新增可选 `onQuery` hook（仅复杂查询 Domain 需要） | 按 Domain |
| **Domain manifest** | 新增 `query_actions` 声明 | 按 Domain |
| **Memory Framework** | 无修改（Orchestrator 调用现有 record API） | 0 天 |

### 7.2 不需要修改的内容

| 组件 | 理由 |
|------|------|
| **Rule Engine** | Query Path 不经过，不涉及 StateProposal 校验 |
| **State Machine** | Query Path 不经过，不涉及状态变更 |
| **Event Bus** | Orchestrator 直接调用 Memory Framework API，不经过 Event Bus |
| **AI Runtime** | Shortcut Path 不调用 AI；Handler Path 复用现有 generateText() |
| **CN-UI Renderer** | 复用现有渲染能力（查询型 Surface 只是 actions 不同） |

### 7.3 设计约束

**Query Path 的硬性约束**：

```
✓ 正确：Shortcut Path 由 Orchestrator 直接组装 CN-UI
✓ 正确：Handler Path 的 onQuery 只调用 Repository 查询 + AI Runtime 生成文字
✓ 正确：查询结果由 Orchestrator 调用 memoryFramework.record() 记录
✓ 正确：Memory 中只存摘要（ID 列表 + 关键指标），不存完整对象
✓ 正确：query_actions 强制 multi_turn，Session 查询后不关闭

✗ 禁止：Shortcut Path 调用 Handler.onQuery
✗ 禁止：Handler.onQuery 直接调用 State Machine 写入状态
✗ 禁止：Handler.onQuery 绕过 Repository 直接操作数据库
✗ 禁止：Handler.onQuery 直接调用 memoryFramework.record()
✗ 禁止：Query Path 返回后被 Orchestrator 错误路由到 Rule Engine
```

---

## 8 实施计划

### 8.1 MVP 阶段

| 任务 | 工作量 | 说明 |
|------|--------|------|
| Intent Engine 路由提示词更新 | 0.5 天 | view_route vs query_actions 区分 |
| Orchestrator 路径选择 + Shortcut Path + Session 管理 | 1 天 | query_actions 检查 + 直接组装 CN-UI + Session 创建/保持/关闭 |
| Context Engine session_context 注入 | 0.5 天 | priorQueries 自动注入 |
| SessionManager Query Session 超时/替换 | 0.5 天 | 超时检查 + query_result 替换 |
| habits Domain：2 个 query_actions | 0.5 天 | 1 个 Shortcut Path（list）+ 1 个 Handler Path（statistics） |
| **总计** | **3 天** | — |

### 8.2 MVP+ 阶段

- 扩展更多 Domain 的 query_actions
- 查询结果缓存优化（相同查询结果复用）

### 8.3 扩展阶段

- 教练式对话完整设计（引用历史查询、多轮上下文连贯性）

---

## 9 教练式对话的分阶段实现

本文档不覆盖教练式对话的完整设计，但 Query Path 的 Session 机制为教练式对话奠定了基础设施。分三阶段渐进实现：

### 阶段一：简单对话模式（当前 / MVP）

**能力**：用户在查询后可以继续对话，AI 基于查询结果回答问题。

**实现方式**：
- Query Session 的 `multi_turn` 模式
- query_result 存入 Session 作为上下文
- Intent Engine 路由时注入查询上下文
- Handler 在 prompt 中引用 `session_context.priorQueries`

**示例**：

```
用户: "看看我的习惯"
AI:  [CN-UI 习惯列表]

用户: "冥想 streak 为什么这么低"
AI:  "你的冥想 streak 是8天。相比跑步的23天确实偏低。
      可能原因：时间设在21:00太晚，容易被其他事情打断。
      建议：尝试调整到晨间，或者缩短到10分钟降低阻力。"
      ← 基于 query_result 中的数据 + LLM 知识生成回答
```

**不是教练式**：AI 只是被动回答，不主动提问、不引导反思。

### 阶段二：上下文增强对话（MVP+）

**能力**：AI 能更智能地利用查询上下文，主动关联相关数据。

**新增能力**：
- **数据关联**：查询习惯后，AI 自动关联能量数据（"你的冥想 streak 低，可能是因为晨间能量不足"）
- **趋势对比**：自动对比历史数据（"比上周下降了3天"）
- **建议触发**：基于规则触发建议（streak < 10 时自动建议调整）

### 阶段三：完整教练模式（扩展）

**能力**：AI 作为教练，主动引导用户思考、设定目标、追踪进度。

**新增能力**：
- **主动提问**："你上次说想坚持冥想，这周进展如何？"
- **深度分析**：结合多个 Domain 的数据给出综合分析
- **目标对齐**：将查询结果与 OKR 对齐，给出战略建议
- **情感支持**：识别用户情绪，给予鼓励或调整建议

**实现方式**：独立的 Coaching Engine（未来设计），复用 Query Session 的上下文基础设施。
