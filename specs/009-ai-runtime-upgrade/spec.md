# Feature Specification: AI Runtime 架构升级

**Feature Branch**: `009-ai-runtime-upgrade`
**Created**: 2026-05-23
**Status**: Draft
**Input**: 拟进行一次重大 AI 架构升级，建立统一的 AI Runtime 层，使所有 LLM 调用走统一入口，实现 Session 管理、Memory 框架和 CN-UI（Conversational Natural UI）协议，分 3 个 Sprint 交付。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 统一 AI 调用入口 (Priority: P1)

作为系统开发者，所有 AI/LLM 调用（意图解析、内容生成、摘要等）必须通过 AI Runtime 的唯一入口发出，不再允许各模块直接调用 LLM SDK。这确保了调用可追踪、Token 可计量、Provider 可切换。

**Why this priority**: 这是整个架构升级的基础。没有统一入口，后续的 Session 管理、Token 预算、缓存都无从谈起。Intent Engine 的迁移是首要任务。

**Independent Test**: 可以通过验证 Intent Engine 解析结果与迁移前完全一致来独立测试。只需触发自然语言输入，验证解析输出不变即可。

**Acceptance Scenarios**:

1. **Given** 用户输入自然语言指令，**When** Intent Engine 解析意图，**Then** 调用链路为 `parseWithAI() → aiRuntime.generate({ taskType: 'intent_routing' }) → LLMGateway`，解析结果与迁移前一致
2. **Given** 系统配置了多个 Provider（通义千问/DeepSeek/智谱/Anthropic/Ollama），**When** aiRuntime.generate() 被调用，**Then** LLMGateway 根据 taskType 路由到正确的 Provider 和模型
3. **Given** 某个 Provider 不可用，**When** 调用发生，**Then** 系统可降级到后备 Provider 继续工作

---

### User Story 2 - Token 预算与响应缓存 (Priority: P2)

作为系统管理者，我需要追踪每日 AI 调用的 Token 消耗总量，并且相同请求在短时间内不应重复调用 LLM，以控制成本。

**Why this priority**: Token 预算是成本控制的基础设施，与 P1 同期实现。缓存能立即降低成本，是统一入口带来的直接收益。

**Independent Test**: 可以通过连续两次发送相同 prompt，验证第二次命中缓存且 Token 计数正确来独立测试。

**Acceptance Scenarios**:

1. **Given** 每次 AI 调用完成，**When** 响应返回，**Then** TokenBudgetManager 自动记录本次 Token 使用量（prompt tokens + completion tokens）
2. **Given** 相同的 systemPrompt + messages + taskType 组合，**When** 短时间内（TTL 内）再次调用，**Then** 直接返回缓存结果，不实际调用 LLM
3. **Given** 管理者查询某日用量，**When** 调用 getDailySummary(date)，**Then** 返回当日各 taskType 的 Token 消耗汇总

---

### User Story 3 - AI Session 多轮对话 (Priority: P2)

作为用户，当我与 AI 进行多轮交互（如反复调整时间盒计划）时，系统能记住之前的对话上下文，我可以基于上一轮结果继续修改而不必从头描述。

**Why this priority**: 多轮对话是 CN-UI 修订能力的核心依赖。用户对 AI 生成结果不满意时需要基于上下文迭代，这是实际使用的高频场景。

**Independent Test**: 可以通过创建 Session、追加消息、获取历史、归档的完整生命周期来独立测试，不需要 CN-UI 组件。

**Acceptance Scenarios**:

1. **Given** 用户发起一次 AI 生成请求，**When** 系统检测到无活跃 Session，**Then** 自动创建新 Session（状态: created → active）
2. **Given** 用户有一个活跃 Session，**When** 用户提出修改意见，**Then** 系统复用该 Session，注入历史消息作为上下文
3. **Given** 用户确认接受 AI 生成结果，**When** 确认流程完成，**Then** Session 归档（状态: active → completing → archived）
4. **Given** 用户取消 AI 交互，**When** 取消操作触发，**Then** Session 关闭（状态: active → closed）

---

### User Story 4 - CN-UI 智能卡片交互 (Priority: P3)

作为用户，当 AI 生成时间盒计划或习惯创建建议时，我看到的不是纯文本，而是可交互的结构化卡片（时间盒列表可拖拽调整、习惯参数可填写修改），确认后一键写入系统。

**Why this priority**: CN-UI 是用户体验的质的飞跃，但依赖 P1（统一入口）和 P2（Session 管理）完成后才能实现。先在习惯创建场景验证基础能力，再扩展到时间盒场景。

**Independent Test**: 可以通过 FieldCompletionCard（习惯创建）场景独立测试：AI 生成参数建议 → 用户在卡片中调整 → 确认后创建习惯。

**Acceptance Scenarios**:

1. **Given** 用户输入"帮我创建一个每天跑步的习惯"，**When** AI 生成参数补全建议，**Then** 系统渲染 FieldCompletionCard，包含时间选择、频率等可交互字段
2. **Given** 时间盒计划已生成为 CN-UI 卡片，**When** 用户拖拽调整时间块，**Then** 系统实时检测时间冲突并显示警告
3. **Given** CN-UI 卡片中的数据已调整完毕，**When** 用户点击"确认"，**Then** 系统提取结构化数据，通过现有确认流程写入，不新增独立确认路径
4. **Given** 用户对 CN-UI 卡片结果不满意，**When** 用户输入"把下午深度工作缩短到1小时"，**Then** 卡片原地更新（不创建新卡片），保留用户已修改的部分

---

### User Story 5 - Memory 摘要沉淀 (Priority: P3)

作为用户，当我完成一次 AI 辅助规划后，系统能自动生成摘要并记录到 Memory 中，未来同类场景可以参考历史经验。

**Why this priority**: Memory L2 是长期价值的基础，但 MVP 阶段 Session 内的消息记录（L1）已足够支撑多轮对话。L2 摘要是锦上添花。

**Independent Test**: 可以通过创建一个 Session、完成交互、归档后，验证 memory_episodes 表中是否生成了摘要记录来独立测试。

**Acceptance Scenarios**:

1. **Given** AI Session 归档时，**When** archive() 被调用，**Then** 系统收集全部消息和交互记录，调用 LLM 生成一句话摘要
2. **Given** Session 包含 CnuiSurface 交互，**When** 摘要生成，**Then** 记录包含 proposal 数量、修订次数、是否最终被接受等结构化字段

---

### Edge Cases

- Provider 全部不可用时（网络故障），系统如何优雅降级？→ 返回明确的错误提示，建议用户稍后重试
- Token 预算超限时，系统如何处理？→ MVP 阶段仅记录用量并提醒用户（无硬限），后续迭代可配置软限制
- Session 在长时间无活动后如何处理？→ 超时自动归档，用户下次交互创建新 Session
- CN-UI 卡片中用户输入无效数据时如何处理？→ 前端实时校验，阻止提交无效数据
- 缓存数据与实际数据不一致时（如用户设置变更了 Prompt）？→ 通过 TTL 控制过期，关键配置变更时主动清除缓存

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须提供统一的 AI 调用入口（AIRuntime），所有 LLM 调用必须通过此入口发出，不允许模块直接调用 LLM SDK
- **FR-002**: 系统必须支持多 Provider 路由，包括 DashScope（通义千问）、DeepSeek、智谱（GLM）、Anthropic 和 Ollama（本地模型）
- **FR-003**: 系统必须根据 AI 任务类型（intent_routing / field_extraction / content_generation / summary / cn_ui_revision）自动路由到对应的 Provider 和模型
- **FR-004**: 系统必须将现有 Intent Engine（ai-parser.ts）的 LLM 调用迁移到通过 AIRuntime 发出，taskType 为 intent_routing 和 field_extraction
- **FR-005**: 系统必须在每次 AI 调用后自动记录 Token 使用量，支持按日期和任务类型查询汇总
- **FR-006**: 系统必须对相同输入（systemPrompt + messages + taskType）实现 L1 精确匹配缓存，在 TTL 内直接返回缓存结果
- **FR-007**: 系统必须实现 AI Session 生命周期管理（created → active → completing → archived / closed），支持创建、追加消息、获取历史、归档操作
- **FR-008**: 系统必须在 AI Session 中实现 Memory L1（消息记录层），复用现有 ai_sessions 表的 messages 字段
- **FR-009**: 系统必须将 DomainHandler 接口扩展为支持 onGenerate()，通过注入的 AIRuntime 进行 AI 调用
- **FR-010**: 系统必须实现 CN-UI 协议的基础组件类型系统，包含基础组件（text-input / select / time-picker 等）和域组件（habit-creation-card / timebox-list 等）
- **FR-011**: 系统必须实现 CnuiSurface 数据管理、事件路由和生命周期管理
- **FR-012**: 系统必须实现 CN-UI 确认路径：确认事件提取结构化数据后，复用现有确认流程写入，不新增独立确认路径
- **FR-013**: 系统必须支持 CN-UI 多轮修订：用户对已生成的 CN-UI 结果提出修改意见时，系统复用活跃 Session 并原地更新 Surface
- **FR-014**: 系统必须在 Session 归档时实现 Memory L2 摘要沉淀，将 AI 交互关键内容摘要写入持久化存储
- **FR-015**: 系统必须支持通过用户配置管理 Provider 路由策略（主模型/后备模型映射）

### Key Entities

- **AIRuntime**: 统一 AI 调用入口，封装 generate 和 stream 方法，持有 TokenBudgetManager、ResponseCache、AISessionManager 实例
- **LLMGateway**: Provider 路由层，根据 taskType 将请求分发到对应的 Provider Adapter
- **Provider Adapter**: 各 LLM Provider 的适配器，统一调用接口
- **AI Session**: 一次完整的 AI 交互会话，包含状态机（created/active/completing/archived/closed）和消息历史
- **TokenBudgetRecord**: 每次调用的 Token 使用量记录，按任务类型和时间戳追踪
- **ResponseCache**: 缓存条目，基于请求内容哈希，包含 TTL 和缓存内容
- **CnuiSurface**: 一次 CN-UI 交互实例，包含 surfaceType、sessionId、dataModel、status
- **CnuiEvent**: 用户交互事件（input_change / button_click），携带 surfaceId 和事件数据
- **MemoryEpisode**: Session 归档时生成的摘要记录，包含交互统计和结论
- **GenerationRequest**: Handler 生成请求的输入，包含意图、Session 上下文、修订目标等

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 所有 LLM 调用（包括 Intent Engine）100% 通过 AIRuntime 统一入口发出，代码中无直接 LLM SDK 调用
- **SC-002**: Intent Engine 迁移后，对相同自然语言输入的解析结果与迁移前完全一致（回归测试通过率 100%）
- **SC-003**: 系统支持至少 3 个不同的 LLM Provider 之间无缝切换，切换过程无需修改业务逻辑代码
- **SC-004**: 相同请求在缓存 TTL 内二次调用，响应时间降低 90% 以上（跳过实际 LLM 调用）
- **SC-005**: AI Session 支持至少 5 轮连续对话，每轮上下文完整保留，用户无需重复描述
- **SC-006**: CN-UI 习惯创建场景（FieldCompletionCard）端到端跑通：从自然语言输入到习惯写入数据库全链路无断点
- **SC-007**: CN-UI 时间盒场景（TimeboxList）端到端跑通：生成 → 拖拽调整 → 冲突检测 → 确认创建全链路无断点
- **SC-008**: Session 归档后，Memory 摘要记录自动生成，包含完整的结构化信息（proposal 数量、修订次数等）

## Assumptions

- 现有 LLM 调用模块将被 AIRuntime 包装而非重写，逐步废弃
- 中国 Provider 统一走 OpenAI 兼容接口适配
- CN-UI 基础组件通过现有 UI 组件库实现，域组件组合基础组件
- Memory L1 底层复用现有 ai_sessions 表的 messages 字段，不新建表
- Memory L2 需新建持久化存储，与现有信号表职责分离
- SurfaceStore MVP 阶段使用内存存储，不做持久化
- Session 超时归档策略采用合理默认值，用户可后续配置
- AIRuntime 通过构造函数注入到 DomainHandler，Orchestrator 不直接调用 AI
