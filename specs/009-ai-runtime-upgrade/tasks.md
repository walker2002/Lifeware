# Tasks: AI Runtime 架构升级

**Input**: Design documents from `/specs/009-ai-runtime-upgrade/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**附加要求**: 每个任务 5-15 分钟 | 包含验收测试 (Given-When-Then) | 包含文件路径

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- 每个任务包含验收测试和涉及文件路径

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 安装依赖、创建目录结构、定义核心类型

- [x] T001 安装 Vercel AI SDK 及 Provider 依赖包
  - **验收**: Given 项目 package.json 存在, When 运行 `npm install ai @ai-sdk/anthropic @ai-sdk/openai`, Then 依赖安装成功且无 peer dependency 警告
  - **文件**: `frontend/package.json`

- [x] T002 创建 AI Runtime 目录结构和核心类型文件
  - **验收**: Given 项目目录存在, When 创建目录, Then `frontend/src/nexus/ai-runtime/` 下有 `index.ts`, `types.ts`, `llm-gateway/`, `token-budget/`, `cache/`, `cnui/`, `session/`, `memory/` 子目录
  - **文件**: `frontend/src/nexus/ai-runtime/types.ts`, `frontend/src/nexus/ai-runtime/index.ts`

- [x] T003 [P] 定义 AITaskType 枚举和核心接口类型
  - **验收**: Given types.ts 文件创建, When 定义 AITaskType (intent_routing/field_extraction/content_generation/summary/cn_ui_revision), Then TypeScript 编译无错误
  - **文件**: `frontend/src/nexus/ai-runtime/types.ts`

- [x] T004 [P] 定义 AIGenerateRequest 和 AIGenerateResponse 接口
  - **验收**: Given types.ts 已有 AITaskType, When 定义 Request/Response 接口, Then 接口包含 domainId, action, systemPrompt, messages, taskType, structuredOutput 等全部字段
  - **文件**: `frontend/src/nexus/ai-runtime/types.ts`

- [x] T005 [P] 定义 AIRuntimeError 和 CNUISchemaError 错误类
  - **验收**: Given types.ts 文件, When 定义错误类, Then AIRuntimeError 包含 code('PROVIDER_UNAVAILABLE' | 'SCHEMA_VALIDATION_FAILED' | 'TIMEOUT')/provider/retryable 字段, CNUISchemaError 继承 AIRuntimeError 并包含 schemaErrors; MVP 阶段无 TOKEN_EXCEEDED 错误码（Token Budget 仅记录无硬限）
  - **文件**: `frontend/src/nexus/ai-runtime/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: LLMGateway 核心 + 默认路由 + Provider 适配 — 所有 User Story 的前置依赖

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 实现默认路由配置表
  - **验收**: Given config.ts 文件创建, When 定义 DEFAULT_ROUTING, Then 5 个 AITaskType 各有 provider + model 映射, 从 UserSettings.llmConfig 合并用户覆盖
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/config.ts`

- [x] T007 [P] 实现 OpenAI Compatible Provider Adapter（包装现有 /lib/llm/）
  - **验收**: Given 现有 `/lib/llm/config.ts` 的 createClient/resolveModel 可用, When openai-compatible.ts 调用 call(), Then 通过 createClient() 创建 client 并发起 chat.completions.create 调用, 返回 LLMResponse
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/providers/openai-compatible.ts`

- [x] T008 [P] 实现 Anthropic Provider Adapter
  - **验收**: Given @ai-sdk/anthropic 已安装, When anthropic.ts 调用 call(), Then 使用 Vercel AI SDK 的 generateText() 发起 Anthropic 调用, 返回 LLMResponse
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/providers/anthropic.ts`

- [x] T009 [P] 实现 Ollama Provider Adapter
  - **验收**: Given @ai-sdk/openai 已安装, When ollama.ts 调用 call(), Then 使用 Vercel AI SDK 的 generateText() + OpenAI 兼容接口连接 Ollama 本地服务, 返回 LLMResponse
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/providers/ollama.ts`

- [x] T010 实现 LLMGateway 核心路由逻辑
  - **验收**: Given 3 个 Provider Adapter 和 config.ts 已就绪, When LLMGateway.route(taskType) 被调用, Then 返回对应 ProviderRoute; When LLMGateway.call() 被调用, Then 路由到正确 Provider 并返回响应
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/index.ts`

- [x] T011 实现 createAIRuntime() 工厂函数
  - **验收**: Given LLMGateway 已实现, When createAIRuntime() 被调用, Then 返回 AIRuntime 实例, gateway 属性可用, generate() 方法可调用, TypeScript 类型正确
  - **文件**: `frontend/src/nexus/ai-runtime/index.ts`

**Checkpoint**: Foundation ready — `createAIRuntime()` 可创建实例, `generate()` 可路由到 Provider 并返回响应

---

## Phase 3: User Story 1 - 统一 AI 调用入口 (Priority: P1) 🎯 MVP

**Goal**: 所有 LLM 调用通过 AIRuntime 唯一入口发出, Intent Engine 完成迁移

**Independent Test**: 触发自然语言输入, 验证 Intent Engine 解析结果与迁移前一致

### Implementation for User Story 1

- [x] T012 [US1] 迁移 Intent Engine parseWithAI() — 替换 chat() 为 aiRuntime.generate()
  - **验收**: Given ai-parser.ts 现有 parseWithAI() 使用 chat(), When 注入 aiRuntime 并替换为 aiRuntime.generate({ taskType: 'intent_routing', ... }), Then 相同输入解析结果与迁移前完全一致
  - **文件**: `frontend/src/nexus/core/intent-engine/ai-parser.ts`

- [x] T013 [P] [US1] 迁移 Intent Engine parseMultiTask() — 替换 chat() 为 aiRuntime.generate()
  - **验收**: Given parseMultiTask() 使用 chat(), When 替换为 aiRuntime.generate({ taskType: 'field_extraction', ... }), Then 相同输入解析结果不变
  - **文件**: `frontend/src/nexus/core/intent-engine/ai-parser.ts`

- [x] T014 [P] [US1] 迁移 Intent Engine parseHabitWithAI() — 替换 chat() 为 aiRuntime.generate()
  - **验收**: Given parseHabitWithAI() 使用 chat(), When 替换为 aiRuntime.generate({ taskType: 'field_extraction', ... }), Then 习惯解析结果（含自动补全默认值）不变
  - **文件**: `frontend/src/nexus/core/intent-engine/ai-parser.ts`

- [x] T015 [US1] 实现 LLMGateway 降级/后备 Provider 逻辑
  - **验收**: Given Provider 路由配置了 fallback, When 主 Provider 调用失败(超时/错误), Then LLMGateway 自动尝试后备 Provider; When 后备也失败, Then 抛出 AIRuntimeError(retryable: true)
  - **文件**: `frontend/src/nexus/ai-runtime/llm-gateway/index.ts`

- [x] T016 [US1] 验证 Intent Engine 端到端回归 — 相同输入相同输出
  - **验收**: Given AIRuntime 已集成, When 在 dev 环境输入"今天下午2点到5点安排深度工作时间盒", Then Intent Engine 解析输出与迁移前完全一致（action, fields, confidence）; Given structuredOutput 替换了原有 extractJSON(), When LLM 返回 JSON 在 markdown code block 内, Then structuredOutput 仍能正确解析（验证 Zod 解析行为与原 extractJSON 一致）
  - **文件**: `frontend/src/nexus/core/intent-engine/ai-parser.ts`

**Checkpoint**: User Story 1 完成 — Intent Engine 通过 AIRuntime 调用, 解析结果回归一致, Provider 可切换/降级

---

## Phase 4: User Story 2 - Token 预算与响应缓存 (Priority: P2)

**Goal**: 每次 AI 调用自动记录 Token 消耗, 相同请求命中缓存

**Independent Test**: 连续两次相同 prompt, 验证第二次命中缓存, Token 计数正确

### Implementation for User Story 2

- [x] T017 [US2] 实现 TokenBudgetManager — record() 和 getDailySummary()
  - **验收**: Given TokenBudgetManager 创建, When record(usage, meta) 被调用, Then 内存中存储 TokenUsageRecord; When getDailySummary(date) 被调用, Then 返回当日各 taskType 汇总
  - **文件**: `frontend/src/nexus/ai-runtime/token-budget/index.ts`

- [x] T018 [P] [US2] 实现 ResponseCache — L1 精确匹配缓存
  - **验收**: Given ResponseCache 创建, When set(key, response, ttl) 被调用, Then 缓存存储成功; When get(key) 在 TTL 内调用, Then 返回缓存响应且 cached=true; When TTL 过期后 get(), Then 返回 undefined
  - **文件**: `frontend/src/nexus/ai-runtime/cache/index.ts`

- [x] T019 [P] [US2] 实现 ResponseCache.generateKey() — 哈希 key 生成
  - **验收**: Given AIGenerateRequest 包含 systemPrompt + messages + taskType, When generateKey() 被调用, Then 返回稳定的 SHA-256 哈希字符串; 相同输入始终产生相同 key
  - **文件**: `frontend/src/nexus/ai-runtime/cache/index.ts`

- [x] T020 [US2] 集成 TokenBudget + Cache 到 AIRuntime.generate() 流程
  - **验收**: Given AIRuntime.generate() 被调用, When 缓存未命中, Then 调用 LLMGateway 后自动 record() Token 使用量并 set() 缓存; When 缓存命中, Then 直接返回缓存响应且不调用 LLMGateway 也不 record()
  - **文件**: `frontend/src/nexus/ai-runtime/index.ts`

- [x] T021 [US2] 验证缓存命中 + Token 计数端到端
  - **验收**: Given AIRuntime 集成完成, When 连续两次调用相同 prompt, Then 第二次响应的 cached=true, 响应时间 <100ms; When 调用 getDailySummary(), Then 显示 1 次调用的 Token 消耗（缓存命中不计入）
  - **文件**: `frontend/src/nexus/ai-runtime/index.ts`

**Checkpoint**: User Story 2 完成 — Token 预算自动记录, 缓存命中跳过 LLM 调用

---

## Phase 5: User Story 3 - AI Session 多轮对话 (Priority: P2)

**Goal**: Session 生命周期管理可用, Memory L1 消息记录, Handler 迁移到 onGenerate

**Independent Test**: 创建 Session → 追加消息 → 获取历史 → 归档完整生命周期

### Implementation for User Story 3

- [x] T022 [US3] 扩展 ai_sessions 表 — 新增 domain_id, action, session_mode 列和状态 enum
  - **验收**: Given 现有 ai_sessions 表, When 运行 Drizzle migration, Then 新增 domain_id(text), action(text), session_mode(text default 'single_shot') 列; status enum 扩展为包含 created/completing/closed
  - **文件**: `frontend/src/lib/db/schema.ts`, `frontend/src/lib/db/migrations/` (new migration)

- [x] T023 [US3] 实现 Memory L1 Session Layer — recordMessage/getMessages/onSessionArchive
  - **验收**: Given MemoryL1Session 创建, When recordMessage() 被调用, Then 通过 AISessionRepository.updateMessages() 写入 ai_sessions.messages; When getMessages() 被调用, Then 返回按时间排序的消息列表
  - **文件**: `frontend/src/nexus/ai-runtime/memory/layers/l1-session.ts`

- [x] T024 [P] [US3] 实现 Memory Framework 入口接口
  - **验收**: Given memory/index.ts 创建, When 定义 MemoryFramework 接口, Then 持有 l1(MemoryL1Session) 和 l2(MemoryL2Episode, Sprint 3 实现) 实例
  - **文件**: `frontend/src/nexus/ai-runtime/memory/index.ts`, `frontend/src/nexus/ai-runtime/memory/types.ts`

- [x] T025 [US3] 实现 AISessionManager — 完整状态机生命周期
  - **验收**: Given AISessionManager 创建, When create() → 状态为 created; When 追加首条消息 → 状态变 active; When archive() → 状态变 completing → archived; When 取消 → 状态变 closed; 状态转换不合法时抛出错误
  - **文件**: `frontend/src/nexus/ai-runtime/session/index.ts`

- [x] T026 [US3] 扩展 DomainHandler 接口 — 新增可选 onGenerate() 方法
  - **验收**: Given DomainHandler 接口定义, When 新增 onGenerate?(request, aiRuntime), Then 现有实现 DomainHandler 的 Domain 不需修改（可选方法）; TypeScript 编译无错误
  - **文件**: `frontend/src/domains/plugin-factory.ts` 或 DomainHandler 定义所在文件

- [x] T026b [P] [US3] 扩展 GenerationRequest 接口 — 添加 Session 和修订支持字段
  - **验收**: Given GenerationRequest 在 usom/types/process.ts 定义, When 新增 sessionId/sessionHistory/reviseTarget/previousProposals/tokenBudget 字段, Then TypeScript 编译无错误; 现有调用方（不含新字段）不报错（所有新字段可选）
  - **文件**: `frontend/src/usom/types/process.ts`

- [x] T027 [US3] 迁移 SchedulingHandler — 实现 onGenerate()
  - **验收**: Given SchedulingHandler 现有 handle() 方法, When 实现 onGenerate(request, aiRuntime), Then 通过 aiRuntime.generate({ taskType: 'content_generation' }) 调用, 返回 GenerativeResult; 原有 handle() 保留不删
  - **文件**: `frontend/src/domains/timebox/handlers/scheduling-handler.ts`

- [x] T028 [US3] 修改 Orchestrator — 注入 aiRuntime 到 Handler 的 onGenerate
  - **验收**: Given Orchestrator 的 Generative Path 分支, When handler.onGenerate 存在, Then 调用 handler.onGenerate(request, aiRuntime); When 不存在, Then 降级到 handler.handle(request); Orchestrator 不直接调用 aiRuntime.generate()
  - **文件**: `frontend/src/nexus/orchestrator/index.ts`

- [x] T028b [US3] 修改 Context Engine assembler — 支持 GenerationRequest 扩展字段
  - **验收**: Given Context Engine assembler 组装 GenerationRequest, When manifest 声明 generation_actions, Then assembler 注入 sessionId/sessionHistory/reviseTarget/previousProposals/tokenBudget 等扩展字段到 GenerationRequest
  - **文件**: `frontend/src/nexus/context-engine/assembler.ts`

- [x] T029 [US3] 验证 Session 生命周期 + Handler onGenerate 端到端
  - **验收**: Given 系统运行, When 用户输入"生成今日时间盒计划", Then Session 自动创建(active) → Handler.onGenerate 调用 → 生成结果返回; When 用户确认, Then Session 归档(archived)
  - **文件**: `frontend/src/nexus/ai-runtime/session/index.ts`, `frontend/src/nexus/orchestrator/index.ts`

**Checkpoint**: User Story 3 完成 — Session 管理可用, Handler 通过 onGenerate + aiRuntime 调用 AI

---

## Phase 6: User Story 4 - CN-UI 智能卡片交互 (Priority: P3)

**Goal**: CN-UI 基础协议实现, FieldCompletionCard 和 TimeboxList 渲染, 确认路径集成

**Independent Test**: AI 生成建议 → 用户在卡片中调整 → 确认后数据通过 RuleEngine 写入

### Implementation for User Story 4

- [x] T030 [US4] 定义 CN-UI 核心类型 — CnuiComponentType / CnuiSurfaceStatus / CnuiEvent / CnuiSurfaceMessage
  - **验收**: Given cnui/types.ts 创建, When 定义 CnuiBaseComponentType(10个) + CnuiDomainComponentType(6个) + CnuiSurfaceStatus(4个) + CnuiEvent + CnuiSurfaceMessage(扩展 ChatMessage 含 cnuiSurfaceId/cnuiSurfaceType/action/dataSnapshot), Then TypeScript 编译无错误
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/types.ts`

- [x] T031 [P] [US4] 实现 Component Catalog — 组件注册和查询
  - **验收**: Given catalog.ts 创建, When register({ type: 'text-input', propsSchema, isBase: true }) 被调用, Then 组件注册成功; When get('text-input') 被调用, Then 返回注册信息; When get('unknown') 被调用, Then 返回 undefined
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/catalog.ts`

- [x] T032 [P] [US4] 实现 CnuiSurfaceStore — 内存 Map CRUD
  - **验收**: Given SurfaceStore 创建, When create({ cnuiSurfaceId, surfaceType, sessionId, dataModel }) → 存储成功; When update(id, { dataModel }) → 更新成功; When get(id) → 返回 CnuiSurfaceData; When delete(id) → 返回后 get() 返回 undefined
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/surface-store.ts`

- [x] T033 [P] [US4] 实现 CnuiEventBus — emit/on 事件路由
  - **验收**: Given EventBus 创建, When on(handler) 注册监听, Then 返回 unsubscribe 函数; When emit(event) 触发, Then handler 收到事件; When 调用 unsubscribe 后 emit(), Then handler 不再收到
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/event-bus.ts`

- [x] T034 [US4] 实现 CnuiManager — 生命周期管理 + 事件处理
  - **验收**: Given CnuiManager 持有 SurfaceStore + EventBus, When createCnuiSurface() → 返回 cnuiSurfaceId 且 SurfaceStore 有记录(status: rendering); When handleEvent(input_change) → SurfaceStore 更新 dataModel; When handleEvent(button_click: confirm) → 提取数据触发确认流程
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/manager.ts`

- [x] T035 [US4] 注册 CN-UI 基础组件到 Catalog (text-input, select, time-picker 等)
  - **验收**: Given Catalog 已实现, When 注册全部 10 个基础组件 + 6 个域组件, Then catalog.list() 返回 16 个类型; 每个组件有对应的 Zod propsSchema
  - **文件**: `frontend/src/nexus/ai-runtime/cnui/catalog.ts`

- [x] T036 [P] [US4] 实现 CN-UI 基础 UI 组件 — TextInput
  - **验收**: Given TextInput.tsx 创建, When 渲染并传入 props, Then 显示文本输入框; When 输入值变化, Then 触发 onChange 回调
  - **文件**: `frontend/src/components/cnui/components/TextInput.tsx`

- [x] T037a [P] [US4] 实现 CN-UI 基础 UI 组件 — Select + TimePicker
  - **验收**: Given 2 个组件文件创建, When 各自渲染, Then Select 显示下拉选择器且 onChange 触发; TimePicker 显示时间选择器且值变更触发回调
  - **文件**: `frontend/src/components/cnui/components/Select.tsx`, `frontend/src/components/cnui/components/TimePicker.tsx`

- [x] T037b [P] [US4] 实现 CN-UI 基础 UI 组件 — Slider + Toggle + Button
  - **验收**: Given 3 个组件文件创建, When 各自渲染, Then Slider 显示滑块且值变更触发回调; Toggle 显示开关且切换触发回调; Button 显示按钮且点击触发回调
  - **文件**: `frontend/src/components/cnui/components/Slider.tsx`, `frontend/src/components/cnui/components/Toggle.tsx`, `frontend/src/components/cnui/components/Button.tsx`

- [x] T038 [US4] 实现 CnuiRenderer 通用渲染器 — 根据 surfaceType 分发
  - **验收**: Given CnuiRenderer.tsx 创建, When 传入 { surfaceType: 'habit-creation-card', dataModel }, Then 渲染对应的域组件; When surfaceType 未注册, Then 显示错误提示而非崩溃
  - **文件**: `frontend/src/components/cnui/CnuiRenderer.tsx`

- [x] T039 [US4] 实现 FieldCompletionCard 域组件 — 习惯创建参数补全卡片
  - **验收**: Given HabitCreationCard.tsx 创建, When 传入 dataModel(包含 name/frequency/time/suggestions), Then 渲染可交互卡片; When 用户修改字段, Then dataModel 更新; When 点击确认, Then 触发 confirm 事件
  - **文件**: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

- [x] T040 [US4] 扩展 timebox manifest — 添加 cnui 扩展字段
  - **验收**: Given timebox manifest.yaml, When 添加 generation_actions.createSmartSchedule.response_mode=cnui 和 cnui_surface_type=timebox-list, Then manifest 加载无错误
  - **文件**: `frontend/src/domains/timebox/manifest.yaml`

- [x] T040b [P] [US4] 扩展 habits manifest — 添加 cnui 扩展字段（FieldCompletionCard 场景）
  - **验收**: Given habits manifest.yaml, When 添加 generation_actions.createHabit.response_mode=cnui 和 cnui_surface_type=habit-creation-card, Then manifest 加载无错误; Context Engine 可读取 generation_actions
  - **文件**: `frontend/src/domains/habits/manifest.yaml`

- [x] T041 [US4] 实现 CN-UI 确认路径 — 复用现有 executeGenerativeConfirmation
  - **验收**: Given CnuiManager 提取 dataModel 为结构化数据, When confirm 事件触发, Then 构造 PrebuiltIntent → 走 executeGenerativeConfirmation() → RuleEngine → StateMachine, 不新增独立路径
  - **文件**: `frontend/src/nexus/orchestrator/index.ts`, `frontend/src/nexus/ai-runtime/cnui/manager.ts`

- [x] T042 [US4] 验证 FieldCompletionCard 端到端 — 习惯创建完整链路
  - **验收**: Given 系统运行, When 用户输入"帮我创建每天跑步的习惯", Then AI 生成 HabitCreationCard → 用户调整参数 → 点击确认 → habit 写入数据库
  - **文件**: 端到端验证，涉及 `ai-parser.ts` → `orchestrator/index.ts` → `scheduling-handler.ts` → `CnuiRenderer.tsx` → `HabitCreationCard.tsx`

- [x] T043 [US4] 实现 TimeboxList 域组件 — 时间盒列表渲染（无拖拽）
  - **验收**: Given TimeboxList.tsx 创建, When 传入 dataModel(包含 items[] 每项有 title/startTime/endTime/color), Then 渲染卡片式时间盒列表; 显示时间段 + 标题 + 颜色标签
  - **文件**: `frontend/src/components/cnui/surfaces/TimeboxList.tsx`

- [x] T044 [US4] 安装 @dnd-kit 依赖
  - **验收**: Given package.json 存在, When 运行 `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`, Then 安装成功
  - **文件**: `frontend/package.json`

- [x] T045 [US4] 实现 TimeboxList 拖拽排序 + 时间冲突检测
  - **验收**: Given TimeboxList 渲染完成, When 用户拖拽时间块到新位置, Then 本地重算时间; When 检测到时间重叠, Then 显示冲突警告; When 拖拽结束, Then 更新 dataModel 并触发 input_change 事件
  - **文件**: `frontend/src/components/cnui/surfaces/TimeboxList.tsx`

- [x] T046 [US4] 实现 CN-UI 多轮修订 — reviseTarget + Session 历史注入
  - **验收**: Given 用户有活跃 Session 和活跃 CnuiSurface, When 用户输入"把下午深度工作缩短到1小时", Then Orchestrator 注入 reviseTarget + sessionHistory; Handler.onGenerate() 修订生成; CnuiManager.updateCnuiSurface() 原地更新（不创建新卡片）
  - **文件**: `frontend/src/nexus/orchestrator/index.ts`, `frontend/src/nexus/ai-runtime/cnui/manager.ts`

- [x] T047 [US4] 验证 TimeboxList 端到端 — 生成→拖拽→修订→确认完整链路
  - **验收**: Given 系统运行, When 用户输入"生成今日时间盒计划", Then 渲染 TimeboxList; When 拖拽调整 → 无冲突; When 输入修改意见 → 卡片原地更新; When 点击确认 → 8 个 timebox 通过 StateMachine 创建
  - **文件**: 端到端验证

**Checkpoint**: User Story 4 完成 — CN-UI 两个场景端到端跑通, 多轮修订可用

---

## Phase 7: User Story 5 - Memory 摘要沉淀 (Priority: P3)

**Goal**: Session 归档时自动生成摘要, 写入 memory_episodes 表

**Independent Test**: 创建 Session → 归档 → 验证 memory_episodes 表有摘要记录

### Implementation for User Story 5

- [x] T048 [US5] 新建 memory_episodes 表 — Drizzle schema + migration
  - **验收**: Given schema.ts 已有表定义, When 新增 memoryEpisodes 表, Then 包含 id/userId/sessionId/domainId/action/episodeType/summary/metadata/createdAt 字段, 有 user_id+created_at 和 session_id 索引
  - **文件**: `frontend/src/lib/db/schema.ts`, `frontend/src/lib/db/migrations/` (new migration)

- [x] T049 [P] [US5] 实现 EpisodeRepository — 摘要记录持久化
  - **验收**: Given episode.repository.ts 创建, When record(episode) 被调用, Then 写入 memory_episodes 表; When findBySessionId() 被调用, Then 返回对应的 episode 记录
  - **文件**: `frontend/src/lib/db/repositories/episode.repository.ts`, `frontend/src/lib/db/repositories/index.ts`

- [x] T050 [US5] 实现 Memory L2 Episode Layer — 摘要生成 + 持久化
  - **验收**: Given MemoryL2Episode 创建, When record(episode) 被调用, Then 通过 AIRuntime.generate({ taskType: 'summary' }) 生成一句话摘要; 写入 memory_episodes 表
  - **文件**: `frontend/src/nexus/ai-runtime/memory/layers/l2-episode.ts`

- [x] T051 [US5] 集成 Memory L2 到 AISessionManager.archive() 流程
  - **验收**: Given archive() 被调用, When Session 状态变为 completing, Then 收集全部消息 + CnuiSurface 交互记录 → 调用 MemoryL2.record() → 状态变为 archived; summary 包含 proposalCount/reviseCount/finalAccepted
  - **文件**: `frontend/src/nexus/ai-runtime/session/index.ts`

- [x] T052 [US5] 验证 Memory 摘要端到端 — Session 归档后 episode 记录完整
  - **验收**: Given 完整 AI Session 交互完成, When archive() 被调用, Then memory_episodes 表新增记录, summary 字段包含有意义的一句话摘要, metadata 包含 proposalCount ≥ 1
  - **文件**: 端到端验证

**Checkpoint**: User Story 5 完成 — Session 归档自动生成摘要, Memory L2 持久化可用

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 清理、文档同步、最终验证

- [x] T053 移除 /lib/llm/client.ts 的直接调用引用 — 确认无遗漏
  - **验收**: Given 全部迁移完成, When 全局搜索 `from '.*lib/llm/client'` 或 `import.*chat.*from`, Then 除 ai-runtime 内部外无其他文件引用 /lib/llm/ 的 chat() 函数
  - **文件**: 全项目搜索

- [x] T054 [P] 更新 docs/usom-design.md — 新增 AISession/CNUISurface 等类型
  - **验收**: Given USOM 文档存在, When 新增 AISession 扩展字段、CnuiSurface、MemoryEpisode 类型定义, Then 文档与代码一致
  - **文件**: `docs/usom-design.md`

- [x] T055 [P] 更新 docs/database-design.md — 新增 memory_episodes 表和 ai_sessions 扩展
  - **验收**: Given 数据库文档存在, When 新增 memory_episodes 表结构和 ai_sessions 扩展列, Then 文档与 Drizzle schema 一致
  - **文件**: `docs/database-design.md`

- [x] T056 更新 CLAUDE.md — AI Runtime 架构说明
  - **验收**: Given CLAUDE.md 已有 Nexus 架构描述, When 更新 AI Runtime 为 Nexus 第七组件, Then 描述 AIRuntime 定位（统一 AI 基础设施, 依赖注入到 Handler）
  - **文件**: `CLAUDE.md`

- [x] T057 运行 quickstart.md 验证 — 全链路端到端
  - **验收**: Given quickstart.md 的 3 个 Sprint 验证步骤, When 依次执行, Then Sprint 1-3 验证全部通过
  - **文件**: `specs/009-ai-runtime-upgrade/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 — BLOCKS 所有 User Story
- **US1 (Phase 3)**: 依赖 Phase 2 — MVP 核心
- **US2 (Phase 4)**: 依赖 Phase 2 — 可与 US1 部分并行
- **US3 (Phase 5)**: 依赖 Phase 2 + US1（Intent Engine 已迁移）— Session 管理
- **US4 (Phase 6)**: 依赖 Phase 2 + US3（Session 可用）— CN-UI 需要 Session
- **US5 (Phase 7)**: 依赖 Phase 2 + US3（Session archive 可用）
- **Polish (Phase 8)**: 依赖全部 User Story 完成

### User Story Dependencies

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational: LLMGateway + AIRuntime)
  ↓
Phase 3 (US1: 统一入口 + Intent Engine 迁移) 🎯 MVP
  ↓
Phase 4 (US2: Token + Cache) ← 可与 Phase 3 部分并行
  ↓
Phase 5 (US3: Session + Memory L1 + Handler 迁移)
  ↓
Phase 6 (US4: CN-UI 智能卡片)
  ↓
Phase 7 (US5: Memory L2 摘要) ← 可与 Phase 6 部分并行
  ↓
Phase 8 (Polish)
```

### Parallel Opportunities

```text
Phase 1: T003, T004, T005 (类型定义) 可并行
Phase 2: T007, T008, T009 (三个 Provider Adapter) 可并行
Phase 4: T018, T019 (Cache 实现) 可并行
Phase 5: T024, T026b (Memory 入口 + GenerationRequest 扩展) 可并行
Phase 6: T031, T032, T033 (Catalog/Store/EventBus) 可并行
Phase 6: T036, T037a, T037b (UI 组件) 可并行
Phase 6: T040, T040b (manifest 扩展) 可并行
Phase 8: T054, T055 (文档更新) 可并行
```

---

## Parallel Example: Phase 2 (Foundational)

```text
# 并行组 1: Provider Adapters (不同文件, 无依赖)
Task T007: "OpenAI Compatible Provider → openai-compatible.ts"
Task T008: "Anthropic Provider → anthropic.ts"
Task T009: "Ollama Provider → ollama.ts"

# 串行: 等 Provider 完成
Task T010: "LLMGateway 核心路由 → index.ts"
Task T011: "createAIRuntime() 工厂 → index.ts"
```

## Parallel Example: Phase 6 (CN-UI)

```text
# 并行组 1: CN-UI 核心模块 (不同文件, 无依赖)
Task T031: "Component Catalog → catalog.ts"
Task T032: "Surface Store → surface-store.ts"
Task T033: "Event Bus → event-bus.ts"

# 并行组 2: 基础 UI 组件 (不同文件, 无依赖)
Task T036: "TextInput → TextInput.tsx"
Task T037a: "Select + TimePicker → 2 files"
Task T037b: "Slider + Toggle + Button → 3 files"
```

---

## Implementation Strategy

### MVP First (Phase 1-3: US1 Only)

1. Complete Phase 1: Setup (~30 min)
2. Complete Phase 2: Foundational (~1-2 hours)
3. Complete Phase 3: User Story 1 (~1 hour)
4. **STOP and VALIDATE**: Intent Engine 解析结果回归一致
5. MVP 交付: 所有 LLM 调用走统一入口

### Incremental Delivery

1. Setup + Foundational → 基础设施就绪
2. Add US1 → 统一入口可用 → **MVP!**
3. Add US2 → Token 追踪 + 缓存
4. Add US3 → Session 多轮对话
5. Add US4 → CN-UI 智能卡片
6. Add US5 → Memory 摘要沉淀

---

## Task Summary

| Phase | User Story | Tasks | 预计总时间 |
|-------|-----------|-------|-----------|
| Phase 1 | Setup | T001-T005 (5) | ~40 min |
| Phase 2 | Foundational | T006-T011 (6) | ~1.5 hours |
| Phase 3 | US1: 统一入口 (P1) | T012-T016 (5) | ~1 hour |
| Phase 4 | US2: Token+Cache (P2) | T017-T021 (5) | ~1 hour |
| Phase 5 | US3: Session (P2) | T022-T029 + T026b + T028b (10) | ~2.5 hours |
| Phase 6 | US4: CN-UI (P3) | T030-T047 + T037b + T040b (20) | ~4.5 hours |
| Phase 7 | US5: Memory L2 (P3) | T048-T052 (5) | ~1 hour |
| Phase 8 | Polish | T053-T057 (5) | ~1 hour |
| **Total** | | **61 tasks** | **~13 hours** |

**Suggested MVP scope**: Phase 1-3 (US1, 16 tasks, ~3 hours)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 每个任务 5-15 分钟，包含 Given-When-Then 验收测试
- 每完成一个 Phase 执行 Checkpoint 验证
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
