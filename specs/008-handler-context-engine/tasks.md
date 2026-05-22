# Tasks: Handler + Context Engine

**Input**: Design documents from `specs/008-handler-context-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Estimate**: 每个任务 5-15 分钟
**Format**: 每个任务包含文件路径 + Given-When-Then 验收测试

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1-US6）
- 验收: `Given-When-Then` 格式描述

---

## Phase 1: Setup（类型与基础设施）

**Purpose**: 新增所有接口类型定义，扩展 manifest schema 和追踪类型

- [x] T001 在 `frontend/src/usom/types/process.ts` 中新增 ContextProvider、ContextCapability、DomainHandler、GenerationRequest、GenerationResult、GeneratedProposal、ProposalSet、Warning、PresentationPayload 九个接口定义
  - 验收: **Given** process.ts 已更新，**When** 导入 GenerationRequest 和 GenerationResult，**Then** TypeScript 编译通过且所有字段类型正确

- [x] T002 [P] 在 `frontend/src/domains/manifest-loader/schema.ts` 中新增 ContextDeclarationSchema 和 GenerationActionSchema，并在 ManifestSchema 中新增可选字段 `generation_actions`
  - 验收: **Given** schema.ts 已更新，**When** 解析包含 generation_actions 块的 YAML，**Then** Zod safeParse 通过且 generation_actions 被正确解析

- [x] T003 [P] 在 `frontend/src/nexus/infrastructure/trace-logger/trace-types.ts` 的 TraceComponent 类型中新增 `'ContextEngine' | 'Handler'` 两个枚举值
  - 验收: **Given** trace-types.ts 已更新，**When** 调用 trace(onTrace, 'ContextEngine', 'start', {...})，**Then** TypeScript 类型检查通过

- [x] T004 [P] 在 `frontend/src/usom/types/process.ts` 的 SystemEventType 中新增五个生成型事件类型：`'GenerativeContextAssembled' | 'GenerativeHandlerCompleted' | 'GenerativeUserConfirmed' | 'GenerativeProposalRejected' | 'GenerativeBatchExecuted'`
  - 验收: **Given** process.ts 已更新，**When** 创建 type 为 'GenerativeContextAssembled' 的 SystemEvent，**Then** TypeScript 类型检查通过

---

## Phase 2: Foundational（Registry + Handler 查找）

**Purpose**: Context Registry 核心和 Handler 查找机制，所有 US 的前置依赖

**⚠️ CRITICAL**: US1-US6 的实现均依赖此阶段完成

- [x] T005 创建 `frontend/src/nexus/context-engine/types.ts`，从 process.ts 重新导出 ContextProvider、ContextCapability 等类型，并定义 Registry 专用的辅助类型
  - 验收: **Given** types.ts 已创建，**When** 从该文件导入 ContextProvider，**Then** 类型与 process.ts 中定义一致

- [x] T006 实现 `frontend/src/nexus/context-engine/registry.ts`：registerContextCapability(cap)、resolveContext(id, query, params, visibility?)、getRegisteredCapabilities() 三个函数。resolveContext 包含 visibility 校验和 Zod schema 验证
  - 验收: **Given** 一个 ContextCapability 已注册，**When** 调用 resolveContext 查询该 capability，**Then** 返回 Provider.provide() 的结果且通过 Zod schema 校验；**Given** 未注册的 id，**When** resolveContext，**Then** 抛出明确的错误信息

- [x] T007 编写 `frontend/src/nexus/context-engine/__tests__/registry.test.ts`：测试注册、查询、schema 校验失败、visibility 校验、重复 id 注册、并发调用安全性
  - 验收: **Given** registry.ts 已实现，**When** 运行 registry.test.ts，**Then** 所有测试通过（注册成功、查询返回数据、schema 不匹配报错、visibility 不满足报错）

- [x] T008 在 `frontend/src/domains/registry.ts` 中新增 `findHandler(domainId, action)` 函数，通过各 Domain 的 handlers 导出查找对应的 DomainHandler
  - 验收: **Given** timebox 已注册 schedulingHandler，**When** 调用 findHandler('timebox', 'createSmartSchedule')，**Then** 返回对应的 SchedulingHandler 实例；**When** 调用 findHandler('timebox', 'unknown')，**Then** 返回 undefined

- [x] T009 在 `frontend/src/nexus/context-engine/index.ts` 中创建 barrel export，导出 assembleContext、registerContextCapability、resolveContext、getRegisteredCapabilities
  - 验收: **Given** index.ts 已创建，**When** 从 '@/nexus/context-engine' 导入，**Then** 所有公开 API 可正常导入

---

## Phase 3: User Story 1 — Context Engine 数据组装 (P1)

**Goal**: Assembler 根据 manifest 声明从 Registry 收集数据，组装 GenerationRequest

**Independent Test**: 构造 StructuredIntent + mock manifest，验证 Assembler 输出完整 GenerationRequest

- [x] T010 [US1] 实现 `frontend/src/nexus/context-engine/assembler.ts`：assembleContext(intent, manifest) 遍历 manifest.generation_actions[action].contexts，提取 params 从 intent.fields 映射，调用 resolveContext() 收集数据，返回 GenerationRequest
  - 验收: **Given** manifest 声明 createSmartSchedule 需要 5 个 contexts，**When** assembleContext 收到 createSmartSchedule 意图，**Then** 返回包含 5 个 context 数据的 GenerationRequest；**Given** 某个 capability id 不存在，**When** assembleContext，**Then** 抛出明确错误指出缺失的 id

- [x] T011 [US1] 编写 `frontend/src/nexus/context-engine/__tests__/assembler.test.ts`：正常组装（5 contexts）、缺失 capability 报错、schema 校验失败、params 映射正确性、空 contexts 列表
  - 验收: **Given** assembler.ts 已实现，**When** 运行 assembler.test.ts，**Then** 所有 5 个测试场景通过

---

## Phase 4: User Story 2 — Context Provider 受控共享 (P2)

**Goal**: 5 个 Provider 实现并在 Registry 中注册

**Independent Test**: 逐一调用 resolveContext()，验证每个 capability 返回正确数据格式

- [x] T012 [P] [US2] 实现 `frontend/src/domains/timebox/providers/timebox-provider.ts`：TimeboxProvider 持有 ITimeboxRepository 引用，provide() 支持 timeboxes_for_date 查询（参数 date）
  - 验收: **Given** 当天有 2 个已有时间盒，**When** resolveContext('existingTimeboxes', 'timeboxes_for_date', {date: '2026-05-20'})，**Then** 返回包含 2 个时间盒摘要的数组且通过 Zod schema 校验

- [x] T013 [P] [US2] 实现 `frontend/src/domains/tasks/providers/active-tasks-provider.ts`：ActiveTasksProvider 持有 ITaskRepository 引用，provide() 支持 active_with_details 查询（参数 date）
  - 验收: **Given** 用户有 3 个活跃任务，**When** resolveContext('activeTasks', 'active_with_details', {date: '2026-05-20'})，**Then** 返回包含 3 个任务详情的数组，每个任务包含 id、title、priority、energyRequired

- [x] T014 [P] [US2] 实现 `frontend/src/domains/habits/providers/pending-habits-provider.ts`：PendingHabitsProvider 持有 IHabitRepository 引用，provide() 支持 unlogged_for_date 查询（参数 date）
  - 验收: **Given** 用户有 2 个当日待打卡习惯，**When** resolveContext('pendingHabits', 'unlogged_for_date', {date: '2026-05-20'})，**Then** 返回包含 2 个习惯摘要的数组

- [x] T015 [P] [US2] 实现 `frontend/src/domains/habits/providers/habit-templates-provider.ts`：HabitTemplatesProvider 持有 IHabitTemplateRepository 引用，provide() 支持 templates_for_date 查询（参数 date）
  - 验收: **Given** 用户有 1 个包含 3 个习惯的模板，**When** resolveContext('habitTemplates', 'templates_for_date', {date: '2026-05-20'})，**Then** 返回模板及其习惯列表

- [x] T016 [P] [US2] 实现 `frontend/src/domains/timebox/providers/energy-profile-provider.ts`：EnergyProfileProvider 持有 calibration Repository 引用（从现有 user_calibration 表读取），provide() 支持 energy_profile 查询（无参数），返回用户校准的峰值/低谷时段。注册到 T017 的统一注册步骤中
  - 验收: **Given** 用户已校准能量曲线（上午高峰、下午低谷），**When** resolveContext('energyProfile', 'energy_profile', {})，**Then** 返回包含 peakHours 和 lowHours 的能量档案

- [x] T017 [US2] 在各 Domain 的 index.ts 中注册 Provider：timebox/index.ts 注册 existingTimeboxes、tasks/index.ts 注册 activeTasks、habits/index.ts 注册 pendingHabits + habitTemplates。创建各 providers/index.ts barrel export
  - 验收: **Given** 所有 Domain 已初始化，**When** 调用 getRegisteredCapabilities()，**Then** 返回包含 5 个 capability id 的数组：['existingTimeboxes', 'activeTasks', 'pendingHabits', 'habitTemplates', 'energyProfile']

---

## Phase 5: User Story 3 — Handler 生成型操作 (P3)

**Goal**: SchedulingHandler 接收 GenerationRequest，输出 GenerationResult

**Independent Test**: 构造 mock GenerationRequest，验证 Handler 输出结构合规

- [x] T018 [US3] 创建 `frontend/src/domains/timebox/handlers/scheduling-handler.ts`：SchedulingHandler 实现 DomainHandler.handle()，包含 collectMaterials()、generateProposals()（AI 调用 + 降级逻辑）、detectConflicts()、renderMarkdown() 四个私有方法。AI 调用失败时降级为按优先级排列
  - 验收: **Given** GenerationRequest 包含 5 个 contexts（3 个任务 + 2 个习惯），**When** handler.handle(request)，**Then** 返回 GenerationResult 包含 proposalSet（至少 3 个 proposal）+ markdown presentation + 无冲突的 proposals 占比 100%；**Given** AI 调用失败，**When** handler.handle(request)，**Then** 返回基于优先级排列的降级方案

- [x] T019 [US3] 创建 `frontend/src/domains/timebox/handlers/index.ts`：导出 timeboxHandlers 映射（createSmartSchedule → SchedulingHandler, adjustRemainingSchedule → SchedulingHandler）
  - 验收: **Given** handlers/index.ts 已创建，**When** 导入 timeboxHandlers，**Then** 包含 createSmartSchedule 和 adjustRemainingSchedule 两个 key，值为 DomainHandler 实例

- [x] T020 [US3] 在 `frontend/src/domains/timebox/index.ts` 中导入 handlers 并导出，确保 findHandler() 能通过 registry.ts 找到
  - 验收: **Given** timebox/index.ts 已更新，**When** 调用 findHandler('timebox', 'createSmartSchedule')，**Then** 返回 SchedulingHandler 实例

- [x] T021 [US3] 编写 `frontend/src/domains/timebox/__tests__/scheduling-handler.test.ts`：正常生成、能量不匹配时 warning、已有时间盒不冲突、AI 降级、空输入材料
  - 验收: **Given** SchedulingHandler 已实现，**When** 运行 scheduling-handler.test.ts，**Then** 5 个测试场景全部通过

---

## Phase 6: User Story 6 — Manifest 声明式配置 (P6)

**Goal**: timebox manifest.yaml 新增 generation_actions 块和对应 intent_triggers

**Independent Test**: 加载 timebox manifest，验证 generation_actions 正确解析

- [x] T022 [P] [US6] 在 `frontend/src/domains/timebox/manifest.yaml` 的 intent_triggers 中新增 createSmartSchedule 和 adjustRemainingSchedule 两个 action（含 shortcut、description、examples、keywords）
  - 验收: **Given** manifest.yaml 已更新，**When** 加载 timebox manifest，**Then** intent_triggers 包含 createSmartSchedule 和 adjustRemainingSchedule；**When** 通过 registry 查询 shortcut，**Then** 正确路由到 timebox 域

- [x] T023 [US6] 在 `frontend/src/domains/timebox/manifest.yaml` 末尾新增 generation_actions 块，声明 createSmartSchedule（5 个 contexts）和 adjustRemainingSchedule（4 个 contexts）的完整配置
  - 验收: **Given** manifest.yaml 包含 generation_actions，**When** loadDomainManifest('timebox')，**Then** ManifestSchema.safeParse 通过且 generation_actions.createSmartSchedule.contexts 包含 5 项；**When** manifest 语义校验，**Then** 无错误

---

## Phase 7: User Story 4 — Orchestrator 路径识别与调度 (P4)

**Goal**: Orchestrator 区分生成型/被动型路径，调度生成型流程

**Independent Test**: 发送生成型 intent 走新路径，发送普通 intent 走现有路径

- [x] T024 [US4] 在 `frontend/src/nexus/orchestrator/index.ts` 的 executeIntent() 中，在现有 Domain validation 之后、RuleEngine 评估之前，插入路径识别逻辑：通过 getFullManifest() 检查 intent.action 是否在 generation_actions 中。如果是，调用 assembleContext() → findHandler() → handler.handle()，调用 ruleEngine.evaluateProposals() 对 Handler 输出执行首次验证，返回生成型结果。Handler 异常时捕获并记录完整错误上下文（{intentId, failedAt: 'Handler.handle', completedSteps: ['ContextEngine']}）到 system_events
  - 验收: **Given** intent.action 为 createSmartSchedule 且 manifest 有对应 generation_actions，**When** executeIntent()，**Then** 走 ContextEngine → Handler → 首次验证路径返回 GenerationResult；**Given** intent.action 为 createTimebox（普通操作），**When** executeIntent()，**Then** 走现有被动型路径，行为完全不变；**Given** Handler 抛出异常，**When** executeIntent()，**Then** 返回用户友好错误信息，system_events 中包含 {intentId, failedAt, completedSteps} 错误上下文

- [x] T025 [US4] 在 `frontend/src/nexus/orchestrator/index.ts` 生成型路径中插入 trace() 调用：ContextEngine start/end、Handler start/end（含 duration 计算）。同时发送 GenerativeContextAssembled（ContextEngine 完成后）和 GenerativeHandlerCompleted（Handler 完成后）system_events 事件
  - 验收: **Given** onTrace 回调已配置，**When** executeIntent() 执行生成型路径，**Then** onTrace 被调用至少 4 次（ContextEngine start/end + Handler start/end），每次包含正确的 component 和 phase；**Given** eventRepo 已配置，**When** ContextEngine 组装完成，**Then** system_events 中包含 GenerativeContextAssembled 事件（含 contextCount + duration）

- [x] T026 [US4] 在 `frontend/src/nexus/orchestrator/index.ts` 的 OrchestratorResult 类型中新增 generativeResult?: GenerationResult 字段，用于携带生成型路径的完整结果
  - 验收: **Given** OrchestratorResult 已扩展，**When** 生成型路径成功返回，**Then** result.generativeResult 包含 proposalSet 和 presentation

- [x] T027 [US4] 编写 `frontend/src/nexus/orchestrator/__tests__/orchestrator-generative.test.ts`：生成型路径识别、被动型路径不受影响、Handler 异常时错误返回、trace 事件完整性
  - 验收: **Given** orchestrator 已扩展，**When** 运行 orchestrator-generative.test.ts，**Then** 4 个测试场景全部通过；**When** 运行现有 orchestrator.test.ts，**Then** 所有测试仍然通过（被动型路径零影响）

---

## Phase 8: User Story 5 — 方案确认与执行流程 (P5)

**Goal**: 生成型结果的 Markdown 展示、用户确认后重解析和批量执行

**Independent Test**: 模拟 GenerationResult → Markdown → 确认 → 批量 intent → 执行

- [x] T028 [US5] 在 `frontend/src/nexus/core/rule-engine/evaluator.ts` 中新增 evaluateProposals(generationResult, snapshot) 方法，逐个验证 proposal 的时间冲突和能量匹配，返回每个 proposal 的 pass/warning/reject 结果及具体原因（违反规则 ID、冲突对象 ID、冲突时段）。被 reject 的 proposal 发送 GenerativeProposalRejected 事件
  - 验收: **Given** proposalSet 包含 3 个 proposal（1 个有时间冲突），**When** evaluateProposals()，**Then** 返回 3 个结果：2 个 pass + 1 个 reject（含冲突原因：时间重叠 + 冲突 timebox ID + 时段描述）；**Given** 二次验证 5 个无冲突 proposal，**When** evaluateProposals()，**Then** 在 200ms 内完成（不含外部 IO）

- [x] T029 [US5] 在 `frontend/src/nexus/core/rule-engine/index.ts` 中暴露 evaluateProposals()，扩展 RuleEngine 接口
  - 验收: **Given** RuleEngine 接口已扩展，**When** 通过 deps.ruleEngine.evaluateProposals() 调用，**Then** TypeScript 编译通过且返回正确结果

- [x] T030 [US5] 在 `frontend/src/nexus/orchestrator/index.ts` 中新增 executeGenerativeConfirmation(intentId, acceptedProposals, userId) 方法：将 accepted proposals 转换为批量 StructuredIntent（每个 intent.fields 包含 sourceProposalId = proposal.id）→ 逐个 executeIntent（Reactive Path）→ 收集执行结果 → 发送 GenerativeUserConfirmed + GenerativeBatchExecuted 事件
  - 验收: **Given** 用户确认了 3 个 proposals，**When** executeGenerativeConfirmation()，**Then** 生成 3 个 StructuredIntent，每个的 fields.sourceProposalId 对应原始 proposal.id，逐个通过 Reactive Path 执行；**When** 查询 system_events，**Then** 包含 GenerativeUserConfirmed 事件（含 acceptedProposals 列表）

- [x] T031 [US5] 在 `frontend/src/nexus/orchestrator/index.ts` 的 executeGenerativeConfirmation 中为每个关键步骤（重解析、二次验证、批量执行）插入 trace() 调用和 GenerativeXxx 事件发送
  - 验收: **Given** onTrace 回调已配置，**When** 完整执行确认流程，**Then** trace 包含 Confirmation、ReParse、SecondValidation、BatchExecution 四个步骤；**When** 查询 system_events，**Then** 包含 GenerativeUserConfirmed 和 GenerativeBatchExecuted 事件

---

## Phase 9: Polish & Cross-Cutting

**Purpose**: 文档同步、宪法验证、全局测试

- [x] T032 [P] 更新 `docs/usom-design.md`，在 Section 4 中新增 ContextProvider、ContextCapability、DomainHandler、GenerationRequest、GenerationResult 等 USOM Process 类型定义
  - 验收: **Given** usom-design.md 已更新，**When** 查找 GenerationResult 定义，**Then** 包含完整字段描述与 process.ts 一致

- [x] T033 [P] 在 `frontend/src/domains/manifest-loader/validator.ts` 中新增 generation_actions 的语义校验：contexts 中的 id 必须在 Registry 中有对应 capability（延迟校验，加载时仅检查结构完整性）
  - 验收: **Given** manifest 包含 generation_actions 引用了不存在的 capability id，**When** 运行语义校验，**Then** 返回带有 fieldPath 的错误信息

- [x] T034 运行 `cd frontend && npm run build` 确认编译通过；运行所有测试 `npx vitest run` 确认零回归；手动验证被动型路径（createTimebox intent）正常工作；验证生成型路径 proposal 回溯：通过 sourceProposalId 查找 proposal 的完整链路（生成 → 确认 → 执行）
  - 验收: **Given** 所有代码已实现，**When** npm run build，**Then** 零编译错误；**When** vitest run，**Then** 所有测试通过（包括现有测试）；**When** 发送 createTimebox intent，**Then** 被动型路径行为与修改前完全一致；**Given** 一个 proposal 已执行完成，**When** 通过 sourceProposalId 回溯，**Then** 可找到对应的 GenerativeHandlerCompleted + GenerativeUserConfirmed + 最终执行事件

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 — 阻塞所有 US
- **Phase 3 (US1 Assembler)**: 依赖 Phase 2（Registry）
- **Phase 4 (US2 Providers)**: 依赖 Phase 2（Registry）+ Phase 3（Assembler 需要 Provider 数据）
- **Phase 5 (US3 Handler)**: 依赖 Phase 3 + Phase 4（Handler 需要 GenerationRequest）
- **Phase 6 (US6 Manifest)**: 依赖 Phase 1（schema 扩展），可与 Phase 3-5 并行
- **Phase 7 (US4 Orchestrator)**: 依赖 Phase 3 + 4 + 5（所有组件就位）
- **Phase 8 (US5 Confirmation)**: 依赖 Phase 7（需要 Orchestrator 集成完成）
- **Phase 9 (Polish)**: 依赖所有 US 完成

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: Registry + findHandler)
    ↓
Phase 6 (US6 Manifest) ─┐
Phase 3 (US1 Assembler) ─┤
    ↓                    ↓
Phase 4 (US2 Providers) ─┤
    ↓                    │
Phase 5 (US3 Handler)  ──┘
    ↓
Phase 7 (US4 Orchestrator)
    ↓
Phase 8 (US5 Confirmation)
    ↓
Phase 9 (Polish)
```

### Parallel Opportunities

- T002 + T003 + T004（schema 扩展、trace 类型、事件类型，不同文件）
- T012 + T013 + T014 + T015 + T016（5 个 Provider，不同文件不同域）
- T022 + T023（manifest 的 intent_triggers 和 generation_actions，同一文件但可顺序执行）
- T032 + T033（文档更新和校验器，不同文件）

---

## Parallel Example: Phase 4 (US2 Providers)

```bash
# 5 个 Provider 可完全并行：
Task T012: "frontend/src/domains/timebox/providers/timebox-provider.ts"
Task T013: "frontend/src/domains/tasks/providers/active-tasks-provider.ts"
Task T014: "frontend/src/domains/habits/providers/pending-habits-provider.ts"
Task T015: "frontend/src/domains/habits/providers/habit-templates-provider.ts"
Task T016: "frontend/src/domains/timebox/providers/energy-profile-provider.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US6 + US3)

1. Phase 1 + 2: 类型 + Registry（~40 min）
2. Phase 3 + 6: Assembler + Manifest（~30 min）
3. Phase 4: 5 个 Provider（~50 min，可并行）
4. Phase 5: SchedulingHandler（~30 min）
5. **STOP & VALIDATE**: 测试完整生成型路径（Context Engine → Handler 输出 GenerationResult）

### Incremental Delivery

1. Setup + Foundational → 类型安全的基础
2. + US1 + US6 → Context Engine 可组装数据
3. + US2 → 5 个 Provider 注册并返回数据
4. + US3 → SchedulingHandler 生成编排方案（MVP 可演示）
5. + US4 → Orchestrator 自动路由
6. + US5 → 用户确认 + 批量执行闭环
7. + Polish → 文档同步 + 全量验证

---

## Notes

- 每个任务 5-15 分钟，适合单次 LLM 调用完成
- 文件路径使用 frontend/src/ 前缀，对应项目 frontend/ 目录
- 被动型路径零影响：每个 Phase 完成后运行现有测试确认无回归
- US6 (Manifest) 建议与 US1 并行完成，确保 Assembler 有 manifest 可消费
- T034 是最终门控：build + 全量测试 + 手动验证被动型路径
