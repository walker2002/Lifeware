# AI Runtime 实施设计

> 基于 `mydocs/core/LW_AI_Runtime_Architecture_Design.md` V3.0 的实施设计，包含文档修正和 3-Sprint 分阶段实施计划。
>
> 编制日期：2026-05-22 | 关联文档：AI Runtime 架构设计 V3.0

---

## 1 架构文档修正

原文档经审查后发现以下问题，实施前需修正。

### 1.1 明确矛盾修正

| # | 位置 | 问题 | 修正 |
|---|------|------|------|
| 1 | Section 2.2 vs 5.2.3 | `single_round` vs `single_shot` 命名冲突 | 统一为 `single_shot`（与 SessionMode 类型定义一致） |
| 2 | Section 4.1 + 5.1.3 | Provider 列表缺少中国 Provider | 新增 DashScope / DeepSeek / Zhipu，通过 OpenAI 兼容接口适配 |
| 3 | Section 3.1.3 | Intent Engine 的 AI 调用定位不清 | 明确：Intent Engine 的 LLM 调用也通过 AI Runtime 的 LLMGateway，taskType 为 `intent_routing` / `field_extraction` |
| 4 | Section 5.1.1 | `LLMGateway.call` 签名中 provider 参数应为 provider 名称 | `call(providerName: string, request)` 由 Gateway 内部路由到对应 provider config |
| 5 | Section 10 全章 | 编号重复/错乱（10.2 两处、10.6 两处） | 重新编号：10.1 概述 → 10.2 触发场景 → 10.3 Protocol Stack → 10.4 Component Catalog → 10.5 Surface 管理 → 10.6 Event Bus → 10.7 Surface Store → 10.8 Session 整合 → 10.9 场景示例 → 10.10 Renderer |
| 6 | CnuiSurface 相关接口 | `CNUISurfaceId`/`CNUISurfaceType`/`surfaceId` 混用 | 统一命名：类型名用 `CnuiSurface`（PascalCase），字段名用 `cnuiSurfaceId`/`cnuiSurfaceType`（camelCase） |
| 7 | Section 5.1.3 | 缺少 `AITaskType` 与现有 AI 调用场景的映射 | 新增对照表，将 `ai-parser.ts` 的调用映射到 `intent_routing` 和 `field_extraction` |

### 1.2 新增内容

| # | 位置 | 内容 |
|---|------|------|
| 8 | Section 5.1 | **LLMGateway 与现有 /lib/llm/ 的关系**：LLMGateway 包装现有 `config.ts` 的 Provider 配置和 `client.ts` 的调用能力，新增 Vercel AI SDK 作为统一接口层。现有 `/lib/llm/` 逐步废弃 |
| 9 | Section 10.3 | **CN-UI Payload 的 LLM 生成机制**：Handler 的 systemPrompt 中注入 Component Catalog 描述（可用组件列表 + Props Schema），通过 `structuredOutput` 的 Zod Schema 约束输出格式 |
| 10 | Section 3.1.3 | **CN-UI 确认与现有 executeGenerativeConfirmation 的关系**：CN-UI 的 confirm 事件提取结构化数据后，复用现有 Proposal 确认流程（RuleEngine → StateMachine），不新增独立路径 |

### 1.3 关键设计决策确认

| 决策 | 结论 |
|------|------|
| AI Runtime 边界 | 所有 AI 调用的统一入口，包括 Intent Engine |
| Provider 策略 | 兼容现有中国 Provider（通义千问/DeepSeek/智谱）+ 新增 Anthropic/Ollama |
| Memory 集成 | AI Session 先行，Memory Framework L1 是 MVP 前置依赖 |
| 开发策略 | AI Runtime 与 CN-UI 并行开发 |

### 1.4 默认路由配置

```typescript
const DEFAULT_ROUTING: Record<AITaskType, ProviderRoute> = {
  intent_routing:     { provider: 'dashscope', model: 'deepseek-v4-flash' },
  field_extraction:   { provider: 'dashscope', model: 'deepseek-v4-flash' },
  content_generation: { provider: 'dashscope', model: 'glm-5.1' },
  summary:            { provider: 'dashscope', model: 'glm-5.1' },
  cn_ui_revision:     { provider: 'dashscope', model: 'glm-5.1' },
}
```

---

## 2 Sprint 1：AI Runtime 核心

**目标**：AI Runtime 成为所有 LLM 调用的唯一入口，Intent Engine 完成迁移，CN-UI 类型定义就绪。

**预计周期**：2-3 周

### 2.1 LLMGateway

包装现有 `/lib/llm/`（`config.ts` + `client.ts`），不重写。

**文件结构**：

```
frontend/src/nexus/ai-runtime/
├── index.ts                    # AIRuntime 主接口，导出 createAIRuntime()
├── llm-gateway/
│   ├── index.ts                # LLMGateway 接口 + 路由逻辑
│   ├── providers/
│   │   ├── openai-compatible.ts # 包装现有 /lib/llm/client.ts（通义/DeepSeek/智谱/OpenAI）
│   │   ├── anthropic.ts        # 新增：Anthropic provider（Vercel AI SDK）
│   │   └── ollama.ts           # 新增：Ollama local provider（Vercel AI SDK）
│   └── config.ts               # 从 UserSettings 读取路由策略
├── token-budget/
│   └── index.ts                # TokenBudgetManager
├── cache/
│   └── index.ts                # ResponseCache（L1 精确匹配）
└── types.ts                    # AIRuntime / AIGenerateRequest / AIGenerateResponse 等接口
```

**Provider 适配策略**：
- 现有 4 个中国 Provider（DashScope/DeepSeek/Zhipu/OpenAI）走 OpenAI 兼容接口，统一在 `openai-compatible.ts` 中
- 新增 Anthropic 和 Ollama 通过 Vercel AI SDK 的 `generateText()` / `streamText()` 调用
- `LLMGateway.route(taskType)` 从 `UserSettings.llmConfig` 读取主模型/后备模型映射

### 2.2 AIRuntime 接口

```typescript
// Sprint 1 实现范围
interface AIRuntime {
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>
  stream(request: AIGenerateRequest): AsyncGenerator<AIStreamChunk>

  // Sprint 1 实现
  budget: TokenBudgetManager
  cache:  ResponseCache

  // Sprint 2 实现
  sessions: AISessionManager
}

interface AIGenerateRequest {
  domainId:  DomainId
  action:    string
  sessionId?: USOM_ID

  systemPrompt: string
  messages:     ChatMessage[]

  taskType:         AITaskType
  maxTokens?:       number
  temperature?:     number
  structuredOutput?: ZodSchema
  stream?:          boolean
}

interface AIGenerateResponse {
  content:    string | Record<string, unknown>
  tokenUsage: TokenUsage
  model:      string
  cached:     boolean
  sessionId?: USOM_ID
}
```

### 2.3 Intent Engine 迁移

现有 `ai-parser.ts` 直接调用 `chat()` 函数，迁移为通过 `aiRuntime.generate()` 调用：

```
Before:  parseWithAI() → chat(prompt) → OpenAI SDK
After:   parseWithAI() → aiRuntime.generate({ taskType: 'intent_routing', ... }) → LLMGateway
```

- Intent Engine 通过构造函数注入 `aiRuntime` 实例
- systemPrompt 和 Zod Schema 保持不变，只替换底层调用
- `parseMultiTask()` 和 `parseHabitWithAI()` 同样迁移

### 2.4 TokenBudgetManager + ResponseCache

- **TokenBudgetManager**：每次 `generate()` 调用后自动 `record()`，接口：`record(usage)` + `getDailySummary(date)`
- **ResponseCache**：L1 精确匹配，key = `hash(systemPrompt + messages + taskType)`，TTL 从 manifest 读取

### 2.5 CN-UI 类型定义

```typescript
// frontend/src/nexus/ai-runtime/cnui/types.ts

type CnuiBaseComponentType =
  'text-input' | 'textarea' | 'select' | 'time-picker' |
  'date-picker' | 'slider' | 'toggle' | 'button' | 'text' | 'divider'

type CnuiDomainComponentType =
  'habit-creation-card' | 'timebox-list' | 'okr-board-card' |
  'task-card' | 'energy-curve' | 'event-timeline'

type CnuiComponentType = CnuiBaseComponentType | CnuiDomainComponentType

type CnuiSurfaceStatus = 'rendering' | 'interacting' | 'completed' | 'closed'
```

### 2.6 Sprint 1 验证标准

| 验证项 | 预期结果 |
|--------|----------|
| Intent Engine 通过 LLMGateway 调用 | 解析结果与迁移前一致 |
| `aiRuntime.generate()` 调用通义千问 | 返回正确响应 |
| `aiRuntime.generate()` 调用 Anthropic | 返回正确响应 |
| TokenBudget 记录 | 每次调用后写入 TokenUsageRecord |
| Cache 命中 | 相同 prompt 二次调用命中缓存 |
| CN-UI 类型编译通过 | 前后端 import 无报错 |

---

## 3 Sprint 2：Session + Memory L1 + CN-UI 基础

**目标**：Session 管理可用，Handler 迁移到 `onGenerate`，CN-UI 基础交互跑通。

**预计周期**：2 周

**前置条件**：Sprint 1 全部验证通过

### 3.1 Memory Framework L1

```
frontend/src/nexus/memory/
├── index.ts                # MemoryFramework 接口
├── layers/
│   ├── l1-session.ts       # L1 Session Layer（Sprint 2 实现）
│   └── l2-episode.ts       # L2 Episode Layer（Sprint 3 实现）
└── types.ts
```

Sprint 2 只实现 L1：

```typescript
interface MemoryL1Session {
  recordMessage(sessionId: string, message: ChatMessage): Promise<void>
  getMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>
  onSessionArchive(sessionId: string): Promise<void>
}
```

L1 底层复用现有 `ai_sessions` 表的 `messages` 字段（JSONB），通过 `AISessionRepository` 读写。

### 3.2 AISessionManager

```typescript
interface AISessionManager {
  create(params: { domainId: string; action: string; mode: SessionMode }): Promise<AISession>
  getOrActivate(sessionId: string): Promise<AISession>
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>
  getHistory(sessionId: string): Promise<ChatMessage[]>
  archive(sessionId: string): Promise<void>
  findActive(domainId: string): Promise<AISession | undefined>
}
```

**Session 状态机**：

```
created → active → completing → archived
                 ↘ closed（用户取消）
```

**Session 与 Memory L1 的集成**：
- `appendMessage()` 内部调用 `memoryL1.recordMessage()`
- `archive()` 触发 `memoryL1.onSessionArchive()`（Sprint 3 接入 L2 摘要）

### 3.3 Handler 迁移：handle() → onGenerate()

DomainHandler 接口扩展：

```typescript
interface DomainHandler {
  onIntent(intent: StructuredIntent, ctx: HandlerContext): HandlerResult
  onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerativeResult>
}
```

**SchedulingHandler 迁移示例**：

```typescript
async onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerativeResult> {
  const materials = this.collectMaterials(request.contexts)
  const prompt = this.buildPrompt(materials, request)

  const response = await aiRuntime.generate({
    domainId: 'timebox',
    action: 'createSmartSchedule',
    taskType: 'content_generation',
    systemPrompt: TIMEBOX_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    structuredOutput: TimeboxPlanSchema,
    stream: false,
  })

  return { proposals: this.parseProposals(response.content), ... }
}
```

Orchestrator 同步修改：

```typescript
// Before
const result = await handler.handle(generationRequest)
// After
const result = await handler.onGenerate(generationRequest, this.aiRuntime)
```

### 3.4 CN-UI 基础组件

```
frontend/src/nexus/ai-runtime/cnui/
├── types.ts                # Sprint 1 已定义
├── catalog.ts              # Component Catalog（组件注册 + 查询）
├── surface-store.ts        # CnuiSurfaceStore（内存 Map）
├── event-bus.ts            # CnuiEventBus（事件路由）
└── manager.ts              # CnuiManager（生命周期管理）
```

**CnuiSurfaceStore**（MVP：内存 Map）：

```typescript
interface CnuiSurfaceData {
  surfaceType: CnuiComponentType
  sessionId: string
  dataModel: Record<string, unknown>
  status: CnuiSurfaceStatus
}
// 存储：Map<cnuiSurfaceId, CnuiSurfaceData>
```

**CnuiEventBus 事件路由**：

```
用户操作 → CnuiEvent → EventBus → CnuiManager.handleEvent()
  ├─ input_change     → 更新 dataModel，可选实时校验
  ├─ button_click(confirm) → 提取数据 → Handler → RuleEngine → StateMachine
  ├─ button_click(cancel)  → 关闭 Surface → archive Session
  └─ button_click(modify)  → 更新 dataModel → 触发新一轮 AI 生成
```

### 3.5 CN-UI Renderer 骨架（场景 A）

实现第一个 CN-UI 场景：**FieldCompletionCard**（习惯创建参数补全）。

```
frontend/src/components/cnui/
├── CnuiRenderer.tsx         # 通用渲染器，根据 surfaceType 分发
├── components/
│   ├── TextInput.tsx
│   ├── Select.tsx
│   ├── TimePicker.tsx
│   ├── Slider.tsx
│   ├── Toggle.tsx
│   └── Button.tsx
└── surfaces/
    └── HabitCreationCard.tsx  # 域组件（场景 A）
```

基础组件通过 shadcn/ui 实现，域组件组合基础组件。

### 3.6 Sprint 2 验证标准

| 验证项 | 预期结果 |
|--------|----------|
| Session 创建/归档 | 状态机转换正确 |
| Memory L1 消息记录 | AI 调用后消息写入 ai_sessions.messages |
| SchedulingHandler.onGenerate | 通过 aiRuntime.generate() 返回结果 |
| CnuiSurfaceStore CRUD | 创建/更新/删除正常 |
| FieldCompletionCard 渲染 | 基础组件 + 域组件在对话流中渲染 |
| Event 回传 | 用户点击确认，数据提取 → RuleEngine |

---

## 4 Sprint 3：端到端 CN-UI + 完整场景

**目标**：两个 CN-UI 场景端到端跑通，多轮对话可用，Memory L2 摘要就绪。

**预计周期**：2 周

**前置条件**：Sprint 2 全部验证通过

### 4.1 TimeboxHandler 输出 CN-UI Payload

Sprint 2 中 SchedulingHandler 已迁移到 `onGenerate`，Sprint 3 将 Markdown 输出改为 CN-UI：

```typescript
const TIMEBOX_PLAN_PROMPT = `
你是一个时间管理助手。根据用户任务、习惯和能量状态生成时间盒计划。

## 可用组件
你必须输出符合以下 schema 的 JSON：
- surfaceType: "timebox-list"
- 每个时间盒包含：title, startTime, endTime, duration, color
- 自动检测时间冲突

## 规则
- 高能量时段安排深度工作
- 习惯安排在固定时间
- 预留休息和缓冲
`
```

**manifest 扩展**：

```yaml
generation_actions:
  createSmartSchedule:
    description: "智能日程安排"
    response_mode: cnui
    cnui_surface_type: timebox-list
    session_mode: conversational
    contexts:
      - id: existingTimeboxes
        query: timeboxes_for_date
        params: [date, userId]
      # ... 其他 contexts
```

### 4.2 CnuiTimeboxList Renderer（含拖拽）

```
frontend/src/components/cnui/surfaces/
├── HabitCreationCard.tsx      # Sprint 2 已实现
└── TimeboxList.tsx            # Sprint 3 新增
```

核心能力：
- 渲染时间盒列表（卡片式，显示时间段 + 标题 + 颜色标签）
- 拖拽排序（`@dnd-kit/core` + `@dnd-kit/sortable`）
- 时间冲突实时检测（拖拽后本地计算）
- "重新生成" / "确认创建" 按钮

拖拽冲突检测流程：

```
用户拖拽 item → dnd-kit onDragEnd
  → 本地重算时间
  → 检测冲突
  → 更新 dataModel.items
  → 触发 input_change event → SurfaceStore 更新
  → 冲突时显示警告
```

### 4.3 Session 多轮对话 — request_ai_revise

用户对 CN-UI 结果不满意时（如"把下午的深度工作缩短到 1 小时"）：

```
用户输入修改意见
  → Orchestrator 识别当前有活跃 Session + 活跃 CnuiSurface
  → 走 Generative Path（session_mode: conversational）
  → Session 注入历史（含上一轮 CnuiSurface 快照）
  → Handler.onGenerate() 再次调用
  → aiRuntime.generate() 携带 sessionHistory + 用户修改意见
  → LLM 基于上下文生成修订后的 TimeboxList
  → CnuiManager.updateCnuiSurface() 原地更新（不创建新卡片）
```

**GenerationRequest 扩展**：

```typescript
interface GenerationRequest {
  intent: StructuredIntent
  sessionId?: string
  contexts: Record<string, unknown>

  reviseTarget?: {
    surfaceId: string
    previousData: Record<string, unknown>
    userInstruction: string
  }

  sessionHistory?: ChatMessage[]
  previousProposals?: ProposalSet[]
  tokenBudget: TokenBudgetInfo
}
```

**Session 历史中的 CnuiSurface 消息**：

```typescript
interface CnuiSurfaceMessage extends ChatMessage {
  role: 'assistant'
  type: 'cnui_surface'
  cnuiSurfaceId: string
  cnuiSurfaceType: string
  action: 'created' | 'updated' | 'completed' | 'cancelled'
  dataSnapshot?: Record<string, unknown>
}
```

### 4.4 Memory L2 摘要沉淀

Session 归档时，将关键内容摘要写入 L2（Episode Layer）：

```typescript
interface MemoryL2Episode {
  record(episode: EpisodeRecord): Promise<void>
}

interface EpisodeRecord {
  type: 'ai_session_summary'
  sessionId: string
  domainId: string
  action: string
  summary: string              // LLM 生成的一句话摘要
  proposalCount: number
  reviseCount: number
  finalAccepted: boolean
  timestamp: Timestamp
}
```

**摘要生成时机**：`AISessionManager.archive()` 调用时：
1. 收集 Session 全部消息 + CnuiSurface 交互记录
2. 调用 `aiRuntime.generate({ taskType: 'summary', ... })` 生成摘要
3. 写入 L2（新建 `memory_episodes` 表，与 `derived_signals` 职责分离）

### 4.5 Orchestrator CN-UI 确认路径

复用现有 `executeGenerativeConfirmation()`，扩展确认来源：

```
CN-UI confirm event
  → CnuiManager 提取 dataModel 为结构化数据
  → 构造 PrebuiltIntent（批量，如 8 个 timebox）
  → 复用 executeGenerativeConfirmation() 或 execute() 走 Reactive Path
```

所有状态变更仍走 Intent → RuleEngine → StateMachine，CN-UI 只是数据采集和展示层。

### 4.6 完整执行链路（时间盒场景）

```
用户："生成今日时间盒计划"
  → Intent Engine（LLMGateway, taskType=intent_routing）
  → 识别为 timebox.createSmartSchedule
  → Orchestrator 检测 generation_actions + response_mode=cnui
  → SessionManager.create({ mode: 'conversational' })
  → ContextEngine.assembleContext() → 5 个 Provider
  → Handler.onGenerate(request, aiRuntime)
  →   aiRuntime.generate({ taskType: content_generation, structuredOutput })
  →   LLMGateway 路由到 glm-5.1
  →   返回 TimeboxList JSON
  → CnuiManager.createCnuiSurface({ type: 'timebox-list', data: ... })
  → TokenBudget.record()
  → MemoryL1.recordMessage()
  → 返回前端：CnuiPayload + SessionId

用户：拖拽调整时间
  → 本地：dnd-kit 更新顺序 + 冲突检测
  → CnuiEvent(type: input_change) → SurfaceStore 更新

用户："把下午深度工作缩短到1小时"
  → SessionManager.getOrActivate() → 复用活跃 Session
  → 注入 sessionHistory + reviseTarget
  → Handler.onGenerate() 修订生成
  → CnuiManager.updateCnuiSurface() 原地更新

用户：点击"确认创建"
  → CnuiEvent(type: button_click, action: confirm)
  → CnuiManager 提取 dataModel
  → 构造批量 PrebuiltIntent（8 个 timebox）
  → executeGenerativeConfirmation() → RuleEngine → StateMachine
  → SessionManager.archive()
  → MemoryL2 摘要沉淀
```

### 4.7 Sprint 3 验证标准

| 验证项 | 预期结果 |
|--------|----------|
| TimeboxHandler CN-UI 输出 | 返回 timebox-list CnuiPayload，schema 校验通过 |
| TimeboxList 渲染 + 拖拽 | 时间盒可拖拽，冲突检测实时显示 |
| 多轮修订 | 用户提修改意见，Surface 原地更新 |
| 批量确认 | 点击确认，timebox 通过 StateMachine 创建 |
| Memory L2 摘要 | Session 归档后，episode 记录包含摘要 |
| 完整链路 | 从用户输入到 timebox 写入数据库，全链路无断点 |

---

## 5 实施总览

```
Sprint 1（~2-3 周）
  AI Runtime 核心：LLMGateway + AIRuntime + TokenBudget + Cache
  Intent Engine 迁移
  CN-UI 类型定义
  验证：所有 LLM 调用走统一入口

Sprint 2（~2 周）  [依赖 Sprint 1]
  Memory L1 + SessionManager
  Handler onGenerate 迁移
  CN-UI 基础：Store + EventBus + Manager + Renderer 骨架
  验证：FieldCompletionCard（习惯创建）端到端

Sprint 3（~2 周）  [依赖 Sprint 2]
  TimeboxList CN-UI（含拖拽）
  多轮修订（request_ai_revise）
  Memory L2 摘要
  Orchestrator CN-UI 确认路径
  验证：时间盒生成 → 调整 → 确认 全链路
```
