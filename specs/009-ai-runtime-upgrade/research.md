# Research: AI Runtime 架构升级

**Branch**: `009-ai-runtime-upgrade` | **Date**: 2026-05-23

## R1: Vercel AI SDK 集成策略

**Decision**: 使用 Vercel AI SDK 的 `generateText()` / `streamText()` 作为 Anthropic 和 Ollama 的调用接口；现有 OpenAI-compatible providers 继续使用现有 OpenAI SDK 客户端。

**Rationale**: 现有 `/lib/llm/` 已使用 OpenAI SDK 与 4 个中国 Provider 通信（均兼容 OpenAI API）。引入 Vercel AI SDK 仅用于新增的 Anthropic 和 Ollama provider，避免同时重写现有 provider 适配逻辑。两个 SDK 共存不冲突：OpenAI SDK 处理 OpenAI-compatible providers，Vercel AI SDK 处理 Anthropic/Ollama。

**Alternatives considered**:
- 全部迁移到 Vercel AI SDK → 工作量大，现有 OpenAI-compatible 逻辑稳定，重写风险高
- 全部保留 OpenAI SDK → Anthropic 和 Ollama 需要自己实现适配层，不如 Vercel AI SDK 成熟

**依赖**: `ai` npm package + `@ai-sdk/anthropic` + `@ai-sdk/openai`（Ollama 通过 OpenAI 兼容接口）

## R2: 现有 /lib/llm/ 包装方式

**Decision**: LLMGateway 的 `openai-compatible.ts` 直接 import 现有 `config.ts` 的 `createClient()` 和 `resolveModel()`，在 Gateway 层添加路由逻辑。不重写现有代码。

**Rationale**: 现有 `/lib/llm/config.ts` 已实现了：环境变量配置、用户偏好合并、模型解析、client 创建。这些功能成熟稳定，直接包装比重写风险更低。LLMGateway 增加的是：(1) 按 taskType 路由 (2) Token 使用量追踪 (3) 缓存 (4) 重试/降级。

**Alternatives considered**:
- 重写 `/lib/llm/` → 高风险，现有逻辑包含很多边界处理
- 完全不包装 → 违反统一入口原则

**代码路径**: `nexus/ai-runtime/llm-gateway/providers/openai-compatible.ts` 调用 `lib/llm/config.ts::createClient()`

## R3: 路由策略配置来源

**Decision**: 默认路由表硬编码在 `llm-gateway/config.ts` 中（参考实施设计的 DEFAULT_ROUTING），用户可通过 `user_settings.llm_config` JSONB 字段覆盖。

**Rationale**: MVP 阶段用户自定义路由是低优先级需求。默认路由表覆盖所有 5 个 taskType，足以启动。`user_settings` 表和 `llmConfig` 字段已存在，后续扩展只需添加 UI 配置页面。

**默认路由**:
```
intent_routing     → dashscope / deepseek-v4-flash
field_extraction   → dashscope / deepseek-v4-flash
content_generation → dashscope / glm-5.1
summary            → dashscope / glm-5.1
cn_ui_revision     → dashscope / glm-5.1
```

**Alternatives considered**:
- 全部从 DB 读取 → MVP 阶段增加不必要的复杂度
- 全部从环境变量读取 → 不支持用户级覆盖

## R4: ai_sessions 表状态扩展

**Decision**: 现有 `ai_sessions.status` enum 为 `['active', 'archived', 'deleted']`。Session 状态机需要 `created → active → completing → archived / closed`。采用在 status 字段中扩展 enum 值的方式，新增 `created`、`completing`、`closed` 状态。

**Rationale**: 现有 `status` 是 text enum，扩展只需 ALTER TYPE 添加新值。Session Repository 已有完整的 CRUD 操作，只需扩展状态转换方法。这是对现有结构的自然扩展。

**Migration**: 新增 Drizzle migration 添加 enum 值。

**Alternatives considered**:
- 新建独立表 → 数据分散，与现有 AISessionRepository 不兼容
- 使用 stateSnapshot JSONB 跟踪状态 → 不利于索引和查询

## R5: memory_episodes 表设计

**Decision**: 新建 `memory_episodes` 表，与 `derived_signals` 职责分离。`derived_signals` 存储系统计算的用户状态信号（聚合指标），`memory_episodes` 存储 AI 交互的语义摘要。

**Rationale**: 宪章 Principle III 明确 Memory Framework 持有 Memory 写权限。两个表的消费者不同、写入时机不同、数据形态不同。混在一起会增加耦合。

**表结构**:
```
memory_episodes:
  id: uuid PK
  user_id: uuid FK → users
  session_id: uuid FK → ai_sessions
  domain_id: text
  action: text
  episode_type: text (default: 'ai_session_summary')
  summary: text
  metadata: jsonb (proposal_count, revise_count, final_accepted 等)
  created_at: timestamptz
```

**Alternatives considered**:
- 复用 derived_signals → 职责不同，违反单一职责
- 纯 JSONB 存储 → 不利于查询和索引

## R6: CN-UI Component Catalog 实现方式

**Decision**: 使用 TypeScript Map + Zod Schema 注册组件。每个组件类型注册时提供：(1) surfaceType 名称 (2) Props Zod Schema (3) 渲染器引用。

**Rationale**: 宪章 CN-UI Protocol §2 要求白名单校验。Zod Schema 同时用于：(1) 注册校验 (2) LLM 输出校验 (3) 前端渲染 props 校验。Map 结构简单，MVP 阶段足够。

**Alternatives considered**:
- 装饰器注册 → TypeScript 装饰器在 Next.js 中需要额外配置
- 配置文件注册 → 增加构建时依赖，不够灵活

## R7: Handler onGenerate 迁移策略

**Decision**: `DomainHandler` 接口新增 `onGenerate` 可选方法。现有 `handle()` 方法保持不变作为过渡。Orchestrator 优先调用 `onGenerate()`，不存在时降级到 `handle()`。

**Rationale**: 4 个 Domain 中只有 timebox 和 habits 有 generative 能力。okrs 和 tasks 不需要立即迁移。渐进式迁移降低风险，保证现有功能不受影响。

**Alternatives considered**:
- 直接替换 handle() → 风险高，影响所有 Domain
- 新建独立 Handler 类 → 增加不必要的类层次

## R8: Orchestrator 修改范围

**Decision**: Orchestrator 的 `executeIntent()` 方法中 Generative Path 分支已有雏形（调用 `handler.handle()`）。修改点：(1) 创建 AIRuntime 实例 (2) 将 `handler.handle(request)` 改为 `handler.onGenerate(request, aiRuntime)` (3) 添加 session 管理逻辑。

**Rationale**: 现有 Orchestrator 已有 Generative Path 分支，修改范围可控。关键约束：Orchestrator 不直接调用 `aiRuntime.generate()`，仅作为依赖注入者。

**Alternatives considered**:
- 在 Orchestrator 外部包装 → 违反 Orchestrator 作为唯一调度器的定位
- 新建独立的 GenerativeOrchestrator → 过度设计

## R9: Intent Engine 迁移细节

**Decision**: `ai-parser.ts` 中的 `parseWithAI()`、`parseMultiTask()`、`parseHabitWithAI()` 三个函数通过构造函数注入 `aiRuntime` 实例。调用链从 `chat(prompt) → OpenAI SDK` 改为 `aiRuntime.generate({ taskType, systemPrompt, messages, structuredOutput }) → LLMGateway`。

**Rationale**: 三个函数都调用 `/lib/llm/client.ts::chat()`。迁移步骤清晰：(1) 将 `chat()` 调用替换为 `aiRuntime.generate()` (2) 将 system prompt 提取为 systemPrompt 参数 (3) 将 JSON 解析替换为 structuredOutput Zod 校验。systemPrompt 和 Zod Schema 保持不变。

**风险点**: 现有 `extractJSON()` 从 markdown code block 中提取 JSON，迁移后 structuredOutput 可能直接返回解析后的对象，需验证行为一致性。

## R10: @dnd-kit 拖拽库选型

**Decision**: 使用 `@dnd-kit/core` + `@dnd-kit/sortable` 实现 TimeboxList 的拖拽排序。

**Rationale**: @dnd-kit 是 React 生态最成熟的拖拽库之一，支持排序、碰撞检测、键盘操作。与 shadcn/ui 生态兼容良好（shadcn/ui 官方拖拽示例使用 @dnd-kit）。

**Alternatives considered**:
- react-beautiful-dnd → 已停止维护
- 原生 HTML5 Drag & Drop → 触摸设备支持差，无障碍性不足
