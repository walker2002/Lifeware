# Tasks: 时间盒执行记录

**Input**: Design documents from `/specs/002-timebox-slice/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 无自动化测试要求，以 quickstart.md 验证清单为准。

**Organization**: 任务按用户故事分组，支持独立实现和验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 用户故事标签（US7-US11）
- 所有路径相对于 `frontend/src/`

---

## Phase 1: Setup（Schema & 类型基础设施）

**Purpose**: 数据层和类型层的共享变更，所有用户故事的前置条件。

- [x] T001 修改 timeboxStatusEnum：移除 `paused`，新增 `overtime`、`cancelled`，在 `lib/db/schema.ts`
- [x] T002 [P] 新增 `overtime_at` timestamptz 字段和 `execution_record` jsonb 字段到 timeboxes 表，在 `lib/db/schema.ts`
- [x] T003 [P] 新增 ExecutionRecord 类型（SimpleExecutionRecord、DetailedExecutionRecord、CompletionStatus），在 `usom/types/objects.ts`
- [x] T004 [P] 更新 Timebox 接口：status 联合类型改为 6 状态，新增 overtimeAt、executionRecord 字段，在 `usom/types/objects.ts`
- [x] T005 [P] 更新 TimeboxSummary 接口：新增 startedAt、endedAt、overtimeAt 可选字段，在 `usom/types/summaries.ts`
- [x] T006 生成并应用数据库 migration（`npm run db:generate && npm run db:migrate`）

---

## Phase 2: Foundational（状态机 + 仓库 + Server Action 管道）

**Purpose**: 核心管道重构，使状态机支持非 create 动作。所有 US 的阻塞前置。

**⚠️ CRITICAL**: 无此前置，所有用户故事无法开始。

- [x] T007 重构状态机 transitions.ts：移除 paused 相关转移（running→paused、paused→running），新增 overtime（running→overtime）和 cancel（planned→cancelled）转移，在 `nexus/core/state-machine/transitions.ts`
- [x] T008 重构状态机 executor：从硬编码 `fromState = null` 改为动态查找——通过 `timeboxRepo.findById(proposal.objectId)` 获取当前状态，create 动作保持 null 特殊处理，在 `nexus/core/state-machine/index.ts`
- [x] T009 更新 StateProposal 类型以包含 objectId 字段（非 create 动作必需），在 `nexus/core/state-machine/index.ts` 或相关类型文件
- [x] T010 扩展编排器 execute() 方法：支持传入 objectId + action（非 rawInput 路径），路由到正确的 StateMachine action，在 `nexus/orchestrator/index.ts`
- [x] T011 新增 TimeboxRepository.findByStatus(status, userId) 方法，用于查找指定状态的时间盒（如 ended、running），在 `lib/db/repositories/timebox.repository.ts`
- [x] T012 更新 TimeboxRepository.save() 方法：支持 overtimeAt、executionRecord 字段的持久化，在 `lib/db/repositories/timebox.repository.ts`
- [x] T013 更新 TimeboxRepository.archive() 方法：接受 executionRecord 参数，写入 execution_record JSONB 并设置 loggedAt，在 `lib/db/repositories/timebox.repository.ts`
- [x] T014 新增 `transitionTimebox(timeboxId, action, executionRecord?, confirmed?)` Server Action：查找当前状态 → 构造 StructuredIntent → 调用编排器管道 → 返回 TransitionResult，在 `app/actions/intent.ts`
- [x] T015 更新 TimeboxRepository 的 DB↔USOM 映射函数：包含 overtime_at、execution_record 字段的双向转换，在 `lib/db/repositories/timebox.repository.ts`
- [x] T016 新增 DelayedStartRule：start 动作时如果 start_time 已过超过 30 分钟返回 warning，在 `nexus/core/rule-engine/rules/timebox.ts`
- [x] T017 更新 Domain Plugin onEvent 钩子：处理 TimeboxStarted（含 trigger: manual/auto）、TimeboxOvertime、TimeboxCancelled 事件，生成对应 action surface 建议，在 `domains/timebox/index.ts`
- [x] T018 更新 Domain Plugin onActionSurfaceRequest 钩子：新增 overtime 状态的优先级处理（weight 85，橙色超时提醒），在 `domains/timebox/index.ts`

**Checkpoint**: 管道就绪——状态机支持全部 7 个转移，可通过 Server Action 触发

---

## Phase 3: US7 - 手动执行时间盒（卡片按钮） (Priority: P1) 🎯 MVP

**Goal**: 用户通过时间盒卡片上的按钮手动开始/结束时间盒，running 状态显示实时计时器和进度条。

**Independent Test**: 创建一个 planned 时间盒 → 点击"开始"→ 卡片显示绿色计时器 → 点击"结束"→ 卡片变为 ended 状态。

### Implementation for US7

- [x] T019 [US7] 增强 TimeboxCard 组件：根据 status 显示对应操作按钮（planned→"开始"/"取消"、running→"结束"、overtime→"确认结束"、ended→"记录"、logged→"查看记录"），在 `components/timebox-card.tsx`
- [x] T020 [US7] 新增 running 状态的实时计时器：使用 useEffect + setInterval 每秒更新已用时间，计算并显示进度条（elapsed / planned duration），在 `components/timebox-card.tsx`
- [x] T021 [US7] 新增 overtime 状态的超时计时器：红色样式显示超出 end_time 的时长，在 `components/timebox-card.tsx`
- [x] T022 [US7] 新增 cancelled 状态的删除线样式和 logged 状态的勾选标记，在 `components/timebox-card.tsx`
- [x] T023 [US7] 更新 STATUS_STYLES 映射：新增 overtime（橙色/红色）、cancelled（浅灰删除线）、更新 running（绿色）的 badge 样式，在 `components/timebox-card.tsx`
- [x] T024 [US7] 接入 transitionTimebox Server Action：卡片按钮点击调用对应 action（start/end/cancel），处理 warnings 和 needsConfirmation，刷新时间盒列表，在 `app/page.tsx` 和 `components/timebox-card.tsx`
- [x] T025 [US7] 新增确认对话框：结束 running 时间盒和取消 planned 时间盒前弹出确认，使用 shadcn AlertDialog，在 `app/page.tsx`

**Checkpoint**: 用户可通过卡片按钮完成 planned→running→ended 的手动执行流程

---

## Phase 4: US8 - 执行记录（简单/详细模式） (Priority: P1)

**Goal**: ended 状态的时间盒可被记录，支持简单打勾（选完成度）和详细复盘（评分+产出+原因）两种模式。

**Independent Test**: 结束一个时间盒 → 点击"记录"→ 弹出对话框 → 选简单模式打勾确认 → 时间盒变为 logged。

### Implementation for US8

- [x] T026 [US8] 新增 ExecutionLogDialog 组件：简单模式（三个完成度按钮 + 确认）和详细模式（可展开，含评分/产出/原因/能量/备注），使用 shadcn Dialog，在 `components/execution-log-dialog.tsx`
- [x] T027 [US8] ExecutionLogDialog 自动计算：根据 startedAt 和 endedAt 计算 actualDuration，与 plannedDuration 对比显示偏差分钟数，在 `components/execution-log-dialog.tsx`
- [x] T028 [US8] ExecutionLogDialog 提交逻辑：构造 ExecutionRecord 对象，调用 transitionTimebox(id, 'log', executionRecord)，在 `components/execution-log-dialog.tsx`
- [x] T029 [US8] 接入 ExecutionLogDialog 到页面：ended 状态卡片点击"记录"按钮时打开对话框，logged 状态卡片点击"查看记录"时展示只读详情，在 `app/page.tsx`
- [x] T030 [US8] 更新 TimeboxSummary 类型以包含 executionRecord 字段（供 UI 显示完成度标记），在 `lib/db/repositories/timebox.repository.ts` 的 toSummary 映射中

**Checkpoint**: 用户可对 ended 时间盒进行简单或详细的执行记录

---

## Phase 5: US9 - 自动触发（auto-start + auto-overtime） (Priority: P2)

**Goal**: 到达 start_time 时自动将 planned→running，到达 end_time 时自动将 running→overtime。

**Independent Test**: 创建一个 start_time 设为 1 分钟后的时间盒 → 等待 → 系统自动开始 → 到达 end_time 后自动变为 overtime。

### Implementation for US9

- [x] T031 [US9] 新增 useAutoTrigger Hook：接收 timeboxes 列表，每 60 秒检查 planned/running 状态的时间盒是否满足自动触发条件，页面加载时立即检查一次，在 `hooks/use-auto-trigger.ts`
- [x] T032 [US9] useAutoTrigger 检测逻辑：条件 1（`status === 'planned' && startTime <= now`）调用 transitionTimebox(id, 'start')，条件 2（`status === 'running' && endTime <= now`）调用 transitionTimebox(id, 'overtime')，在 `hooks/use-auto-trigger.ts`
- [x] T033 [US9] 集成 useAutoTrigger 到主页：在 page.tsx 中调用 Hook，传入当前时间盒列表和 transitionTimebox 回调，在 `app/page.tsx`
- [x] T034 [US9] 状态机 executor 处理自动触发的 overtime 动作：设置 overtimeAt 时间戳，在 `nexus/core/state-machine/index.ts`

**Checkpoint**: 时间盒可自动开始和自动超时标记

---

## Phase 6: US10 - 自然语言执行指令 (Priority: P2)

**Goal**: 用户可通过 AI 输入框输入"开始做市场调研"、"结束了"等自然语言触发时间盒执行操作。

**Independent Test**: 创建一个 planned 时间盒 → 在 AI 输入框输入"开始做市场调研"→ 时间盒自动开始。

### Implementation for US10

- [x] T035 [US10] 扩展 AI parser system prompt：增加执行意图的动作映射（start_timebox、end_timebox、cancel_timebox、log_timebox），包含 target 字段说明（title/current/index），在 `nexus/core/intent-engine/ai-parser.ts`
- [x] T036 [US10] 新增 target 匹配后处理逻辑：根据 parsed target.title 模糊匹配时间盒标题，target.current 匹配 running 状态，target.index 按序号匹配，将匹配结果注入 StructuredIntent.fields.objectId，在 `app/actions/intent.ts`
- [x] T037 [US10] 新增 submitExecutionIntent Server Action：接收 rawInput → 创建 Intention → AI 解析执行意图 → target 匹配 → 调用编排器管道 → 返回 ExecutionIntentResult，在 `app/actions/intent.ts`
- [x] T038 [US10] 更新 intent-input.tsx：检测解析结果中的执行意图动作，路由到 submitExecutionIntent 而非 submitIntent，在 `components/intent-input.tsx`

**Checkpoint**: 用户可通过自然语言控制时间盒的执行状态

---

## Phase 7: US11 - 取消时间盒 (Priority: P2)

**Goal**: planned 状态的时间盒可通过卡片按钮或自然语言取消。

**Independent Test**: 创建一个 planned 时间盒 → 点击"取消"→ 确认 → 时间盒变为 cancelled 状态，显示删除线。

### Implementation for US11

- [x] T039 [US11] 新增取消确认对话框：planned 卡片点击"取消"时弹出 AlertDialog 确认，确认后调用 transitionTimebox(id, 'cancel')，在 `app/page.tsx`
- [x] T040 [US11] 自然语言取消支持：AI parser 识别"取消XX"意图，target 匹配 planned 状态的时间盒，在 `nexus/core/intent-engine/ai-parser.ts`（已由 T035 覆盖 prompt 扩展，此处确认 target 匹配逻辑覆盖 cancel）
- [x] T041 [US11] cancelled 状态在时间轴和列表中的展示：灰色删除线样式，不参与时间重叠检测，在 `components/timebox-card.tsx` 和 `components/timebox/timebox-timeline.tsx`

**Checkpoint**: 用户可通过卡片按钮或自然语言取消 planned 时间盒

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的优化和完善。

- [x] T042 更新 quickstart.md 验证清单：确保 18 项验证均可通过
- [x] T043 更新 trace-logger 以覆盖执行管道的新 trace points（transitionTimebox、useAutoTrigger）
- [x] T044 响应式适配：验证执行按钮和 ExecutionLogDialog 在移动端宽度下的布局
- [x] T045 状态颜色一致性：确保 TimeboxCard、TimeboxTimeline、WeekView、MonthView 中各状态颜色统一
- [x] T046 回归验证：确保原有创建流程（自然语言/表单）不受影响

---

## Phase 9: US12 - 主内容区全宽模式 (Priority: P2)

**Goal**: 主内容区始终占据全宽，AI 面板改为浮动覆盖模式（类似 Notion 侧边栏），支持收起/展开，状态持久化。

**Independent Test**: 打开系统首页 → 主内容区全宽展示三栏时间盒视图 → 点击 TopNav 菜单按钮展开 AI 面板 → 面板浮在主内容区上方、主内容区宽度不变 → 点击遮罩或关闭按钮收起面板 → 刷新后面板状态保持。

### Implementation for US12

- [x] T047 [US12] 新增 usePanelState Hook：管理 isOpen 状态 + localStorage 持久化（key: `lw-ai-panel-open`），默认收起，提供 open/close/toggle 方法，在 `hooks/use-panel-state.ts`
- [x] T048 [US12] 重构 app-shell.tsx 桌面端布局：移除 CSS Grid 两栏 `grid-cols-[320px_1fr]`，MainContent 改为 `w-full`，AiPanel 改为 `fixed` 定位浮动覆盖（`z-30`，左侧 320px，滑入滑出动画 `transition-transform`），展开时显示半透明遮罩层（`bg-black/20`），在 `components/layout/app-shell.tsx`
- [x] T049 [US12] 更新 TopNav：桌面端显示菜单按钮（复用移动端 `onMenuClick`），作为 AI 面板的展开入口，在 `components/layout/top-nav.tsx`
- [x] T050 [US12] 面板收起交互：点击遮罩层收起面板 + 面板顶部添加关闭按钮，在 `components/layout/app-shell.tsx`
- [x] T051 [US12] 更新 quickstart.md 验证清单：新增 US12 相关验证项（全宽模式、面板展开/收起、状态持久化），在 `specs/002-timebox-slice/quickstart.md`

**Checkpoint**: 主内容区始终全宽，AI 面板浮动可收起/展开，刷新后状态保持

> **注意**: Phase 9 (T047-T051) 已实现浮动覆盖模式。Phase 10 将其回滚为可收起侧边栏模式。

---

## Phase 10: US12 修订 — AI 面板可收起模式 (Priority: P2)

**Goal**: 将 AI 面板从浮动覆盖模式改为可收起侧边栏模式：展开时主内容区自动收缩让位，收起时主内容区拉伸至全宽。默认展开，状态持久化。

**Independent Test**: 打开系统首页 → 面板默认展开在左侧 → 点击菜单按钮收起 → 主内容区平滑拉伸至全宽 → 再次点击展开 → 主内容区收缩让位 → 刷新后面板状态保持。

### Implementation for US12 (revised)

- [x] T052 [US12] 回滚 usePanelState Hook：初始值从 `false`（收起）改为 `true`（展开），即 `localStorage.getItem(STORAGE_KEY) !== "false"`，在 `hooks/use-panel-state.ts`
- [x] T053 [US12] 重构 app-shell.tsx 桌面端布局：回滚浮动覆盖（absolute + 遮罩 + 关闭按钮），改为 Flexbox 可收起侧边栏——面板 `w-[320px]` + `transition-all duration-300`，收起时 `w-0 overflow-hidden border-r-0`，主内容区 `flex-1` 自动填充，移除遮罩层 `bg-black/20` 和面板关闭按钮 `X`，保留移动端 Sheet 抽屉，在 `components/layout/app-shell.tsx`
- [x] T054 [P] [US12] 更新 TopNav 菜单按钮：从 `open()` 改为 `toggle()`，aria-label 改为"切换 AI 面板"，在 `components/layout/top-nav.tsx`
- [x] T055 [P] [US12] 验证日/周/月视图自适应面板宽度：确保面板收起/展开时 DayView/WeekView/MonthView 充分利用可用宽度，卡片和日历格子无溢出或截断，日视图三栏比例在宽屏下合理分配，在 `components/timebox/day-view.tsx`, `week-view.tsx`, `month-view.tsx`
- [x] T056 [US12] 更新 contracts/ui-layout.md：修订布局结构图（可收起侧边栏模式，默认展开），更新 AiPanel 组件合约（面板宽度过渡动画，收起时隐藏），在 `specs/002-timebox-slice/contracts/ui-layout.md`

**Checkpoint**: AI 面板默认展开，收起后主内容区全宽，动画平滑，状态持久化

---

## Phase 11: US13 — 时间盒卡片信息增强 (Priority: P2)

**Goal**: 时间盒卡片改为两行布局，增加完成状态图标、时间范围、note 预览；根据评分/能量进行颜色编码；note hover tooltip 展示完整内容。

**Independent Test**: 创建多个不同状态和评分的时间盒 → 在日视图列表中观察卡片两行布局 → 完成图标正确（实心/半实心/空心/不显示）→ 评分≠3 有颜色边框 → hover note 显示 tooltip。

### Implementation for US13

- [x] T057 [P] [US13] 新增颜色编码工具函数 `getCardBorderColor(record?: ExecutionRecord): string`：根据 rating/energyLevel 返回对应 Tailwind `border-l-*` 类名，优先级 rating > energyLevel，默认 `border-l-transparent`，在 `lib/color-coding.ts`（新文件）
- [x] T058 [US13] 重构 TimeboxCard 为两行布局：卡片容器改为 `flex flex-col`，第一行 `flex items-center gap-2` 包含 CompletionIcon（实心✓/半实心◐/空心○/无） + 时间范围 HH:mm-HH:mm + 标题 truncate + StatusBadge + 操作按钮，第二行（条件渲染，note 非空）包含 NoteIcon + note 单行截断（换行→空格），Radix Tooltip 包裹展示完整 note（`whitespace-pre-wrap`），左侧边框应用 `getCardBorderColor()`，紧凑模式同样适配，在 `components/timebox-card.tsx`
- [x] T059 [P] [US13] 更新 TimeboxTimeline 色块颜色编码：时间轴时间盒色块应用 `getCardBorderColor()` 颜色（通过 border 或 background 淡色变体），在 `components/timebox/timebox-timeline.tsx`
- [x] T060 [P] [US13] 更新 WeekView 事件块颜色编码：周日历事件块应用相同颜色规则，在 `components/timebox/week-view.tsx`
- [x] T061 [P] [US13] 更新 MonthView 事件块颜色编码：月日历事件块应用相同颜色规则，在 `components/timebox/month-view.tsx`
- [x] T062 [US13] 更新 ExecutionLogDialog 查看模式：只读展示时显示对应颜色指示条（与卡片颜色编码一致），在 `components/execution-log-dialog.tsx`

**Checkpoint**: 卡片两行信息展示，颜色编码在列表/时间轴/周/月视图统一生效，note tooltip 可用

---

## Phase 12: US14 — 多任务批量识别 (Priority: P2)

**Goal**: 用户可在单次输入中描述多个时间盒任务，AI 语义拆分后逐个独立通过 Nexus 管道创建。

**Independent Test**: 输入"上午10:30-11:30 开会；11:30-12:30 做周总结" → 系统识别 2 个任务 → 创建 2 个 planned 状态的时间盒 → 页面显示 2 张卡片。

### Implementation for US14

- [x] T063 [US14] 扩展 AI parser system prompt：新增多任务拆分指令，输出格式扩展为 `{ "tasks": [{ "title": "...", "startTime": "...", "duration": ..., "confidence": ..., "incomplete": false }, ...] }`，识别语义分段（时间关键词、分隔符、时间段描述），在 `nexus/core/intent-engine/ai-parser.ts`
- [x] T064 [US14] 新增 `parseMultiTask(rawInput: string): Promise<StructuredIntent[]>` 函数：调用 LLM 解析 → 验证 tasks 数组 → 过滤 `incomplete: true` 的任务 → 每个任务构造独立 StructuredIntent → 返回数组，在 `nexus/core/intent-engine/ai-parser.ts`
- [x] T065 [US14] 新增 `submitBatchIntent(rawInput: string): Promise<BatchIntentResult>` Server Action：调用 parseMultiTask → 遍历 intents → 逐个调用 orchestrator.execute() → 收集成功/失败结果 → 返回 `{ results: BatchItemResult[] }`，全失败时返回整体错误不创建任何时间盒，在 `app/actions/intent.ts`
- [x] T066 [US14] 更新 page.tsx 集成批量意图：检测 `parseMultiTask` 返回多个 intent 时调用 `submitBatchIntent` 而非 `submitIntent`，展示批量结果（成功卡片 + 失败提示"第N个任务'XXX'信息不完整"），在 `app/page.tsx`
- [x] T067 [US14] 更新 contracts/intent-submission.md：新增 `submitBatchIntent` 接口定义和批量数据流说明，在 `specs/002-timebox-slice/contracts/intent-submission.md`

**Checkpoint**: 单次输入多任务 → AI 拆分 → 逐个创建 → 结果汇总展示

---

## Phase 13: Polish & Verification

**Purpose**: 跨改进的验证和文档更新。

- [x] T068 更新 quickstart.md 验证清单：确保 35 项验证均可追踪（创建3+执行8+取消3+记录4+侧边栏6+卡片6+批量5），在 `specs/002-timebox-slice/quickstart.md`
- [x] T069 [P] 回归验证：确保 US12 布局回滚不影响已有功能——自然语言创建、表单创建、手动执行（开始/结束/取消）、执行记录（简单/详细）、自动触发、自然语言执行指令，在 `app/page.tsx`
- [ ] T070 端到端验证：按 quickstart.md 验证清单 1-35 逐项检查，修复发现问题

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 完成 — 阻塞所有用户故事
- **US7 手动执行 (Phase 3)**: 依赖 Phase 2 — MVP 核心路径
- **US8 执行记录 (Phase 4)**: 依赖 Phase 2 + US7（需要 ended 状态的时间盒）
- **US9 自动触发 (Phase 5)**: 依赖 Phase 2 — 可与 US7/US8 并行
- **US10 自然语言 (Phase 6)**: 依赖 Phase 2 — 可与 US7/US8/US9 并行
- **US11 取消 (Phase 7)**: 依赖 Phase 2 + US7（卡片按钮框架）— 最小增量
- **Polish (Phase 8)**: 依赖全部用户故事完成
- **US12 全宽模式 (Phase 9)**: 无业务依赖 — 纯 UI 布局调整（已被 Phase 10 取代）
- **US12 修订 (Phase 10)**: 依赖 Phase 9（回滚其布局代码）— 可与 US13/US14 并行
- **US13 卡片增强 (Phase 11)**: 无业务依赖 — 纯 UI 组件修改，可与 US12/US14 并行
- **US14 批量识别 (Phase 12)**: 依赖 Phase 2（Nexus 管道）— 可与 US12/US13 并行
- **Polish & Verify (Phase 13)**: 依赖 Phase 10-12 全部完成

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)
    ↓ ↓ ↓ ↓
   US7  US9  US10  (可并行)
    ↓
   US8  US11 (可并行)
    ↓
Phase 8 (Polish)

Phase 10 (US12 修订) ─┐
Phase 11 (US13 卡片)  ├─ 可并行（不同文件集）
Phase 12 (US14 批量)  ─┘
    ↓
Phase 13 (Polish & Verify)
    ↓
Phase 14 (US12 全宽修正) → 修复 MainContent max-w 遗留问题
```

- **Phase 10 (US12)**: 依赖 Phase 9 已完成——回滚 T047-T050 的浮动覆盖代码，改为可收起侧边栏
- **Phase 11 (US13)**: 无依赖，纯 UI 组件修改，独立可测
- **Phase 12 (US14)**: 仅依赖 Foundational 管道（Phase 2），独立可测

### Within Each User Story

- 工具函数先于 UI 组件
- 核心组件先于联动组件（如 TimeboxCard 先于 Timeline/WeekView/MonthView）
- Server Action 先于页面集成
- 合约文档可与实现并行

### Parallel Opportunities

**Phase 10 内并行**: T054 (TopNav) 可与 T055 (视图自适应) 并行

**Phase 11 内并行**: T057 (color-coding) 独立；T059 (Timeline)、T060 (WeekView)、T061 (MonthView) 可并行

**Phase 12 内并行**: T063 (AI prompt) 和 T067 (contracts) 可并行

**跨 Phase 并行**: Phase 10、11、12 可完全并行开发（不同文件集、无相互依赖）

---

## Parallel Example: Phase 11

```bash
# 并行执行颜色编码联动组件（不同文件）:
Task T059: "更新 TimeboxTimeline 色块颜色编码"
Task T060: "更新 WeekView 事件块颜色编码"
Task T061: "更新 MonthView 事件块颜色编码"
```

## Parallel Example: Cross-Phase

```bash
# Phase 10, 11, 12 可同时开工:
Phase 10: "US12 修订 — 回滚浮动覆盖为可收起侧边栏"
Phase 11: "US13 卡片增强 — 两行布局 + 颜色编码"
Phase 12: "US14 批量识别 — 多任务 AI 拆分"
```

## Implementation Strategy

### MVP First (US7 Only)

1. Complete Phase 1: Setup（Schema + 类型变更）
2. Complete Phase 2: Foundational（状态机重构 + 管道）
3. Complete Phase 3: US7（手动执行按钮）
4. **STOP and VALIDATE**: 创建时间盒 → 手动开始 → 手动结束
5. 可演示 MVP

### Incremental Delivery

1. Setup + Foundational → 管道就绪
2. + US7 → 手动执行可用（MVP!）
3. + US8 → 执行记录可用
4. + US9 → 自动触发可用
5. + US10 → 自然语言执行可用
6. + US11 → 取消功能可用
7. + Polish → 完整体验

### 本次改进交付（Phase 10-14）

1. Phase 10: US12 修订 → 可收起侧边栏，默认展开
2. Phase 11: US13 → 卡片两行布局 + 颜色编码
3. Phase 12: US14 → 多任务批量识别
4. Phase 13: Polish → 全量验证
5. Phase 14: US12 全宽修正 → 移除 MainContent max-w 限制

**建议顺序**: Phase 10 → Phase 11 → Phase 12 → Phase 13 → Phase 14（Phase 14 修复 Phase 10 遗留的宽度问题）

---

## Phase 14: US12 全宽修正 — MainContent 宽度约束移除 (Priority: P2)

**Goal**: 修复 `MainContent` 中的 `max-w-[960px]` 硬限制，让日/周/月视图真正撑满可用宽度。根因见 `research.md` R-010。

**Independent Test**: 打开系统首页 → AI 面板展开时，日视图三栏均匀填满主内容区宽度（无两侧大片空白）→ 面板收起时，视图延伸至全宽 → 卡片内容不再拥挤。

### Implementation for US12 (full-width fix)

- [x] T071 [P] [US12] 移除 MainContent 宽度约束：`mx-auto max-w-[960px]` → `w-full`，在 `components/layout/main-content.tsx`
- [x] T072 [P] [US12] DayView grid 容器添加 `w-full`，确保三栏填满可用宽度，在 `components/timebox/day-view.tsx`
- [x] T073 [P] [US12] WeekView 日历容器添加 `w-full`，确保日历填满可用宽度，在 `components/timebox/week-view.tsx`
- [x] T074 [P] [US12] MonthView 日历容器添加 `w-full`，确保日历填满可用宽度，在 `components/timebox/month-view.tsx`
- [x] T075 [P] [US12] 主内容包装器添加 `w-full`，确保页面容器填满 MainContent，在 `app/page.tsx`
- [x] T076 [US12] 更新 quickstart.md 验证清单：新增全宽模式验证项（面板展开/收起时视图是否填满），在 `specs/002-timebox-slice/quickstart.md`
- [ ] T077 [US12] 浏览器验证：面板展开时三栏无两侧空白、面板收起时视图全宽、周/月视图填满、无布局溢出或截断

**Checkpoint**: 主内容区真正全宽，日/周/月视图撑满可用空间，卡片内容不再拥挤

### Parallel Opportunities

T071–T075 全部可并行执行（5 个不同文件，无相互依赖）。

### Implementation Strategy

1. T071–T075 并行执行（纯 CSS 变更）
2. T076 更新文档
3. T077 浏览器验证

### Notes

- [P] tasks = 不同文件，无依赖
- [Story] label 追溯到具体用户故事
- 每个用户故事独立可测试
- 每完成一个 task 或逻辑组后提交
- 在任意 checkpoint 可独立验证
- Phase 10 回滚 Phase 9 的布局代码，注意 git 历史可参考 T047 之前的 app-shell.tsx
