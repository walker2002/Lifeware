# Tasks: 界面重构及AI助手会话优化

**Input**: Design documents from `/specs/007-ui-refactor-ai-session/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Test Strategy**: 每个任务包含 Given-When-Then 验收测试用例描述。

**Organization**: 任务按用户故事分组，每个故事可独立实现和测试。P1 优先，P1→P2→P3 顺序执行。Phase 0R 为回溯修正（最高优先级）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1~US7）
- **[Rx]**: 回溯修正任务（2026-05-17 实测追加）
- 每个任务包含具体文件路径和预估时间

---

## Phase 0R: 回溯修正（2026-05-17 实测）⚠️ 最高优先级

**Purpose**: 修正实测发现的 5 个偏离规格问题（R1-R5），每项独立可验证。

- [X] **T055** [R1] 移除左侧面板 assistant 标签中的旧输入内容：从 `frontend/src/app/page.tsx` 的 `leftPanelContent` 中移除 `aiPanelContent` 渲染块，assistant 标签仅保留 `<SessionList />`；删除 `InputMode` 状态、`handleModeToggle` 回调和 `mode` 变量（8 min）
  > **Given** 左侧面板 assistant 标签当前包含 AI对话/表单填写模式切换和输入框，**When** 修改完成，**Then** assistant 标签仅显示 `<SessionList />` 和"新对话"按钮，不包含任何模式切换、IntentInput、IntentForm 或确认弹窗

- [X] **T056** [R2] 修复配置按钮导航：修改 `frontend/src/app/page.tsx` 中 `handleSettingsClick`，从 toggle `traceEnabled` 改为 `setMainViewState({ type: 'settings' })`；在 `renderMainContent()` 中新增 `mainViewState.type === 'settings'` 分支渲染 `<SettingsPage />`；更新 `frontend/src/components/layout/main-view-state.ts` 添加 `SettingsView` 类型（8 min）
  > **Given** 右上角设置按钮当前仅切换追踪日志面板，**When** 点击设置按钮，**Then** 主显示区切换到配置页面视图（SettingsPage），显示 LLM/时区/习惯模板/追踪日志开关等配置项

- [X] **T057** [R3] 修复 LLM 提示跳转：修改 `frontend/src/app/page.tsx` 中"前往设置"按钮的 onClick，从 `{ type: 'action', domainId: 'settings' }` 改为 `{ type: 'settings', section: 'llm' }`；`SettingsPage` 接收 `section` prop 自动定位到对应配置区域（6 min）
  > **Given** LLM 未配置时点击"前往设置"按钮无法进入配置页面，**When** 修改完成，**Then** 点击"前往设置"后主显示区切换到配置页面的 LLM 设置区域

- [X] **T058** [R4] 移除主显示区标签页：从 `frontend/src/app/page.tsx` 的 schedule 视图中移除整个标签页导航块（时间安排/习惯库/模板/OKR/项目 5 个按钮），仅保留 `<DateNav />` 和 `<DayView />`/`<WeekView />`/`<MonthView />`；移除对 `HabitLibraryView`, `HabitTemplateManager`, `OKRWorkspace`, `ProjectsView` 在 schedule 上下文中的导入（6 min）
  > **Given** schedule 视图包含 5 个不可交互的标签页，**When** 修改完成，**Then** schedule 视图仅显示 DateNav + 日历组件，无习惯库/模板/OKR/项目标签

- [X] **T059** [R5] 修复成长领域数据加载：检查并修复 `frontend/src/app/actions/intent.ts` 中 `fetchDomainActions()` server action，确保从 `domainRegistry.getAllDomainActions()` 正确返回数据；验证各 `manifest.yaml` 的 `intent_triggers` 中 `shortcut` 和 `description` 字段已填充；添加 console 诊断日志辅助排查空数据问题（10 min）
  > **Given** 成长领域标签页无数据显示，**When** 切换到成长领域标签页，**Then** 显示 4 个领域分组（习惯/OKR/任务/时间盒）及其 action 列表；若返回空数据，控制台输出诊断日志

**Checkpoint**: 所有回溯修正完成 — 启动应用验证 5 项修复

---

## Phase 0: Setup（数据层基础 — USOM 类型 + DB Schema）

**Purpose**: 新增 USOM 类型定义和数据库表，所有用户故事的基础。

- [X] **T001** [P] [US2] 在 `frontend/src/usom/types/objects.ts` 中新增 AISession、AISessionSummary、ChatMessage 类型定义（8 min）
  > **Given** 需要定义 AI 会话数据结构，**When** 查看 `objects.ts`，**Then** 文件中包含 `AISession`（id, userId, title, status, messages, stateSnapshot, referencedObjectIds, createdAt, updatedAt, archivedAt）、`AISessionSummary`（id, title, status, createdAt, updatedAt）、`ChatMessage`（role, content, timestamp, intentRef?）三个接口导出

- [X] **T002** [P] [US7] 在 `frontend/src/usom/types/objects.ts` 中新增 UserSettings、LLMConfig 类型定义（6 min）
  > **Given** 需要定义用户设置数据结构，**When** 查看 `objects.ts`，**Then** 文件中包含 `UserSettings`（id, userId, timezone, llmConfig?, uiPrefs?）和 `LLMConfig`（provider, baseUrl, apiKey, defaultModel）接口导出

- [X] **T003** [US2] 在 `frontend/src/lib/db/schema.ts` 中新增 `aiSessions` 表定义及索引（10 min）
  > **Given** 需要持久化 AI 会话，**When** 执行 `npm run db:generate`，**Then** 生成包含 `ai_sessions` 表的迁移文件，表含 id, user_id, title, status, messages(JSONB), state_snapshot(JSONB), referenced_object_ids(JSONB), created_at, updated_at, archived_at 字段，含 user_id+status 联合索引和 updated_at 降序索引

- [X] **T004** [P] [US7] 在 `frontend/src/lib/db/schema.ts` 中新增 `userSettings` 表定义（6 min）
  > **Given** 需要持久化用户设置，**When** 执行 `npm run db:generate`，**Then** 生成包含 `user_settings` 表的迁移文件，表含 id, user_id(UNIQUE), timezone, llm_config(JSONB), ui_prefs(JSONB), created_at, updated_at 字段

- [X] **T005** [US2] 执行数据库迁移并验证两表创建成功（5 min）
  > **Given** schema 变更已定义，**When** 执行 `npm run db:migrate`，**Then** PostgreSQL 中 `ai_sessions` 和 `user_settings` 表存在，`\d ai_sessions` 和 `\d user_settings` 显示正确结构

**Checkpoint**: USOM 类型和数据库基础就绪

---

## Phase 1: User Story 1 — 通过快捷方式快速触发系统功能 (Priority: P1) 🎯

**Goal**: 用户输入 `/createHabit` 等快捷方式即可直接跳转到功能界面

**Independent Test**: 在输入框中键入 `/createHabit`，系统跳转至习惯创建表单

### Implementation for US1

- [X] **T006** [US1] 在各 Domain 的 `manifest.yaml`（habits/okrs/tasks/timebox）中为 `intent_triggers` 条目增加 `shortcut` 别名字段（10 min）
  > **Given** 用户想用短格式快捷方式，**When** 编辑各 manifest.yaml 中 intent_triggers 条目添加 shortcut 字段（如 `/createHabit`、`/logHabit`），**Then** 每个 action 有全局唯一的 `/action` 短别名，长格式 `/domain:action` 保持不变

- [X] **T007** [P] [US1] 在各 Domain 的 `manifest.yaml` 中新增 `view_routes` 块（G 块），定义 action 到页面组件的映射（12 min）
  > **Given** 系统需要知道每个 action 对应哪个界面组件，**When** 在各 manifest.yaml 中添加 `view_routes` 块（如 createHabit → HabitFormPage），**Then** 每个 action 有对应的 `component` 和可选的 `params` 声明

- [X] **T008** [US1] 增强 `frontend/src/domains/registry.ts`：新增 `getActionByShortcut()` 和 `getViewRoute()` accessor 方法（10 min）
  > **Given** 需要运行时查询快捷方式和视图路由，**When** 调用 `getActionByShortcut('/createHabit')`，**Then** 返回 `{ domainId: 'habits', action: 'createHabit' }`；调用 `getViewRoute('habits', 'createHabit')` 返回对应的 ViewRoute 对象

- [X] **T009** [P] [US1] 增强 `frontend/src/domains/registry.ts`：新增 `getAllDomainActions()` 和 `getMarkdownTemplate()` accessor 方法（8 min）
  > **Given** 需要获取所有 Domain action 列表和 Markdown 模板路径，**When** 调用 `getAllDomainActions()`，**Then** 返回按 Domain 分组的 action 摘要数组；调用 `getMarkdownTemplate('habits', 'createHabit')` 返回模板路径或 undefined

- [X] **T010** [US1] 在 Registry 初始化时增加 shortcut 全局唯一性校验（10 min）
  > **Given** 多个 Domain 的 manifest 定义了相同的 shortcut，**When** Registry 初始化加载所有 manifest，**Then** 检测到重复 shortcut 时抛出 `ShortcutConflictError`（含冲突的 shortcut 和涉及的两个 Domain），系统拒绝启动；无冲突时正常完成注册

- [X] **T011** [US1] 实现 `frontend/src/nexus/core/intent-engine/shortcut-matcher.ts`：两层快捷方式匹配（12 min）
  > **Given** 用户输入以 `/` 开头，**When** 输入 `/habits:createHabit`（长格式），**Then** 返回 `{ domainId: 'habits', action: 'createHabit', confidence: 1.0 }`；当输入 `/createHabit`（短格式），**Then** 返回相同结果；当输入 `/nonexistent`，**Then** 返回 `undefined`，走自然语言路由

- [X] **T012** [US1] 在 `frontend/src/nexus/core/intent-engine/index.ts` 中集成 shortcut-matcher 为输入预处理步骤（8 min）
  > **Given** Intent Engine 处理用户输入，**When** 输入以 `/` 开头且匹配成功，**Then** 跳过 Phase A 路由，以 confidence=1.0 直接进入 Phase B；匹配失败时走正常自然语言路由

**Checkpoint**: US1 完成 — 快捷方式解析可独立工作，可测试

---

## Phase 2: User Story 2 — AI 会话持久化与历史续接 (Priority: P1)

**Goal**: 用户创建对话、跨页面保持、继续旧对话时 AI 感知状态变化

**Independent Test**: 创建新对话并发送消息，切换页面后返回，消息完整且上下文恢复

### Implementation for US2

- [X] **T013** [US2] 实现 `frontend/src/lib/db/repositories/session.repository.ts`：ISessionRepository（findById, findByUserId, create）（12 min）
  > **Given** 需要读写 AI 会话数据，**When** 调用 `findByUserId(userId)`，**Then** 返回该用户所有会话的摘要列表（按 updated_at 降序）；调用 `create(session)` 写入新会话记录，验证 `ai_sessions` 表中有对应行

- [X] **T014** [US2] 实现 `frontend/src/lib/db/repositories/session.repository.ts`：updateMessages, updateStateSnapshot, archive, restore, delete（12 min）
  > **Given** 会话需要更新消息或状态，**When** 调用 `updateMessages(id, messages)`，**Then** 数据库该行的 messages JSONB 更新，updated_at 刷新；调用 `archive(id)` 设置 status='archived' 和 archived_at 时间戳；调用 `restore(id)` 恢复为 active；调用 `delete(id)` 仅当 status='archived' 时彻底删除行

- [X] **T015** [P] [US2] 实现 `frontend/src/lib/db/repositories/session.repository.ts` 中的 DB↔USOM 映射函数（8 min）
  > **Given** Repository 需要隔离数据库行对象，**When** 从数据库查询 session 行，**Then** 返回的 AISession 对象使用 USOM 类型（ChatMessage[] 已从 JSONB 解析，Timestamp 已转换为 ISO 字符串）；写入时 USOM 对象映射回数据库行格式

- [X] **T016** [P] [US2] 在 `frontend/src/lib/db/repositories/index.ts` 中导出 session repository（5 min）
  > **Given** 其他模块需要引用 session repository，**When** import { sessionRepository } from repositories，**Then** 获取到 ISessionRepository 实例

- [X] **T017** [US2] 实现会话续接双层状态合并逻辑（12 min）
  > **Given** 用户点击旧会话，**When** 加载会话时：(1) 从 state_snapshot 加载快照；(2) 从 Repository 查询 referenced_object_ids 的当前实际状态；(3) 对比差异生成系统消息，**Then** AI 收到的上下文包含"会话创建时目标 X 处于 draft 状态，现已 active"等状态变更信息

- [X] **T018** [US2] 编写会话生命周期单元测试（10 min）
  > **Given** 需要验证会话状态转换正确性，**When** 运行单元测试，**Then** 测试覆盖：创建→active、active→archived、archived→active(恢复)、archived→deleted、active→deleted(应失败)；messages 完整读写；stateSnapshot+referencedObjectIds 更新

**Checkpoint**: US2 完成 — AI 会话持久化和续接可独立测试

---

## Phase 3: User Story 3 — 新版三栏布局与导航体验 (Priority: P2)

**Goal**: 左面板纯导航（Home + 双标签），主显示区默认时间盒，AI 对话移入主显示区

**Independent Test**: 启动应用，左侧面板含 Home、AI助手标签、成长领域标签；主显示区默认时间盒

### Implementation for US3

- [X] **T019** [US3] 重构 `frontend/src/app/page.tsx`：定义 MainViewState 联合类型和状态管理（12 min）
  > **Given** 主显示区需要支持三种视图，**When** MainViewState 为 `{ type: 'schedule', date, viewMode }`，**Then** 渲染时间盒视图；为 `{ type: 'conversation', sessionId }`，**Then** 渲染对话视图；为 `{ type: 'action', domainId, action }`，**Then** 渲染 action 表单视图。mainViewState 切换时自动保存当前对话

- [X] **T020** [US3] 重写 `frontend/src/components/shell/app-shell.tsx`：新三栏布局结构（12 min）
  > **Given** 新布局为顶栏+左面板+主显示区，**When** 页面渲染，**Then** TopNav 在顶部（含右侧设置按钮），LeftPanel 在左侧 320px 固定宽度，主显示区在右侧 flex-1。LeftPanel 包含 HomeButton 和 PanelTabs 容器

- [X] **T021** [US3] 重写 `frontend/src/components/panel/left-panel.tsx` 为纯导航面板（12 min）
  > **Given** 左侧面板不再承载对话，**When** 渲染 LeftPanel，**Then** (1) 顶部 Home 按钮（🏠 Home）固定显示；(2) 下方两个 Tab：AI助手、成长领域；(3) 点击 Home 切换到 schedule 视图并自动保存对话；(4) 点击 Tab 切换面板内容

- [X] **T022** [US3] 新增 `frontend/src/components/panel/session-list.tsx`：会话历史列表（12 min）
  > **Given** AI助手 Tab 被选中，**When** 渲染会话列表，**Then** (1) 顶部[+ 新对话]按钮；(2) 下方会话按日期分组（今天/昨天/更早），每组可收起/展开；(3) 默认全部展开；(4) 点击会话条目→主显示区进入 conversation 视图；(5) 活跃会话高亮；(6) 右键/长按显示归档/删除选项

- [X] **T023** [US3] 重写 `frontend/src/components/main/main-content.tsx`：支持 MainViewState 三种视图动态渲染（12 min）
  > **Given** mainViewState 由 page.tsx 管理，**When** type='schedule'，**Then** 渲染现有 DayView/时间盒组件；type='conversation'，**Then** 渲染 ConversationView；type='action'，**Then** 通过 getViewRoute 加载对应 Domain 页面组件

- [X] **T024** [P] [US3] 新增 `frontend/src/components/main/resizable-splitter.tsx`：可拖拽分割线组件（10 min）
  > **Given** 主显示区处于分裂视图，**When** 用户拖拽分割线，**Then** 左侧最小宽度 300px，拖拽时光标变为 col-resize，释放后左右区域按新比例分配宽度

**Checkpoint**: US3 完成 — 新布局壳就绪，可独立验证三栏结构和视图切换

---

## Phase 4: User Story 4 — 成长领域菜单导航与功能触发 (Priority: P2)

**Goal**: 左侧面板"成长领域"Tab 动态展示所有可用 action，点击加载对应界面

**Independent Test**: 打开成长领域标签，点击"创建习惯"，主显示区展示习惯创建表单

### Implementation for US4

- [X] **T025** [US4] 新增 `frontend/src/components/panel/growth-menu.tsx`：成长领域功能菜单组件（12 min）
  > **Given** 成长领域 Tab 被选中，**When** 渲染 GrowthMenu，**Then** (1) 从 `getAllDomainActions()` 动态获取所有 action；(2) 按 Domain 分组（习惯/OKR/项目与任务/时间盒），每组可收起/展开，默认全部展开；(3) 每个 action 显示名称+灰色 `/shortcut`；(4) 支持 markdown 模板的 action 旁显示 📝 图标

- [X] **T026** [US4] 实现菜单项点击→主显示区切换逻辑（8 min）
  > **Given** 用户点击某个 action（如"创建习惯"），**When** 触发点击事件，**Then** (1) 自动保存当前对话；(2) mainViewState 切换为 `{ type: 'action', domainId, action }`；(3) 主显示区通过 `getViewRoute()` 加载对应 Domain 组件

- [X] **T027** [US4] 处理菜单项点击时当前处于 conversation 视图的边缘情况（6 min）
  > **Given** 用户正在 AI 对话中，**When** 点击成长领域菜单中的 action，**Then** 系统自动保存当前对话（不丢失），主显示区切换到 action 表单视图；用户可通过左侧会话列表恢复对话

**Checkpoint**: US4 完成 — 菜单导航独立工作，可从菜单触达所有功能界面

### S2 需求补充：成长领域菜单 action 表单加载 (FR-039~FR-043)

- [X] **T060** [US4] 增强 `frontend/src/domains/registry.ts`：新增 `getRequiredFields(domainId, action)` 和 `hasRequiredFields(domainId, action)` 方法，从 manifest 运行时读取 `required_fields`（10 min）
  > **Given** 成长领域菜单 action 需要动态表单，**When** 调用 `getRequiredFields('habits', 'createHabit')`，**Then** 返回 `FieldPrompt[]`（含 name, label, type, required, options, default_value, placeholder）；调用 `hasRequiredFields('habits', 'activateHabit')` 对无 required_fields 的 action 返回 false

- [X] **T061** [P] [US4] 新增 `frontend/src/components/editor/dynamic-form.tsx`：基于 `FieldPrompt[]` 动态渲染表单组件（15 min）
  > **Given** action 有 required_fields 定义，**When** DynamicForm 接收 `FieldPrompt[]` 渲染，**Then** 每个字段按 type 映射到对应 shadcn/ui 组件（text→Input, number→Input[type=number], time→Input[type=time], date→Popover+Calendar, select→Select, toggle→Switch）；字段显示 label，required 字段标记必填；default_value 作为初始值；点击"确认"时校验所有 required 字段

- [X] **T062** [P] [US4] 新增 `frontend/src/components/editor/action-confirm.tsx`：非创建类 action 确认界面（10 min）
  > **Given** action 无 required_fields（如 activateHabit），**When** ActionConfirm 渲染，**Then** 展示操作说明（从 manifest intent_triggers 读取 description）+ 目标对象摘要卡片（名称、当前状态）+ 确认/取消按钮；点击确认构造 StructuredIntent（fields 包含 targetId）；点击取消返回上一视图

- [X] **T063** [US4] 修改 `frontend/src/app/page.tsx`：action 视图根据 `hasRequiredFields` 判断渲染 DynamicForm 或 ActionConfirm（8 min）
  > **Given** mainViewState.type='action'，**When** 加载 action 视图，**Then** 若 `hasRequiredFields(domainId, action)` 为 true，渲染 `<DynamicForm fields={getRequiredFields(domainId, action)} />`；若为 false，渲染 `<ActionConfirm domainId={domainId} action={action} />`；不再显示"Action 视图：xxx"占位文本

- [X] **T064** [US4] 泛化 `frontend/src/nexus/core/intent-engine/template-parser.ts`：新增 `parseDynamicForm(domainId, action, fields, intentionId)` 函数（10 min）
  > **Given** DynamicForm 提交的用户输入 `{ [fieldName]: value }`，**When** 调用 `parseDynamicForm`，**Then** 构造 StructuredIntent `{ targetDomain: domainId, action, fields, confidence: 1.0, resolvedBy: 'template_form' }`；保留现有 `parseTemplateForm()` 兼容性，内部可调用 `parseDynamicForm`

- [X] **T065** [US4] 修改 `frontend/src/app/actions/intent.ts`：新增通用 `submitDynamicIntent(domainId, action, fields)` Server Action（8 min）
  > **Given** 动态表单或确认界面提交，**When** 调用 `submitDynamicIntent`，**Then** 创建 Intention 记录 → 调用 `parseDynamicForm` 生成 StructuredIntent → 传入 `executePipeline` 执行；返回 `IntentSubmissionResult`

**Checkpoint**: S2 补充完成 — 所有 action 点击后展示动态表单或确认界面，提交后正确执行

---

## Phase 5: User Story 5 — AI 对话与编辑区协同工作 (Priority: P3)

**Goal**: AI 对话中触发创建意图时，主显示区分裂为对话+编辑区，用户填写确认后执行

**Independent Test**: 对话中输入"帮我创建一个每天跑步的习惯"，右侧出现表单，填写确认后执行

### Implementation for US5

- [X] **T028** [US5] 新增 `frontend/src/components/main/conversation-view.tsx`：主显示区对话视图容器（12 min）
  > **Given** mainViewState.type='conversation'，**When** 渲染 ConversationView，**Then** (1) 显示完整对话消息列表（用户/AI/系统消息）；(2) 底部输入区含文件上传按钮和模板下载按钮；(3) 支持滚动到最新消息

- [X] **T029** [US5] 修改 `frontend/src/components/main/intent-input.tsx`：集成文件上传和模板下载（10 min）
  > **Given** 对话输入区，**When** 用户点击📎按钮，**Then** 弹出文件选择器（接受 .md/.txt/.csv/.xlsx/.xls）；选择文件后提取内容注入对话上下文；当 action 支持 Markdown 模板时显示⬇下载模板按钮

- [X] **T030** [US5] 修改 `frontend/src/components/main/main-content.tsx`：实现分裂视图逻辑（12 min）
  > **Given** mainViewState.type='conversation' 且 splitWith 不为空，**When** 渲染主显示区，**Then** (1) 水平分为左（AI 对话，min 300px，默认 50%）+ 分割线 + 右（编辑区，flex-1）；(2) 右侧编辑区显示表单（splitWith.mode='form'）或 Markdown 编辑器（splitWith.mode='markdown'）

- [X] **T031** [US5] 实现 `splitWith` 状态管理：AI 解析出 StructuredIntent 时激活，确认执行后折叠（10 min）
  > **Given** AI 在对话中识别到结构化创建意图，**When** AI 返回 StructuredIntent，**Then** splitWith 设置为 `{ mode: 'form', domain, action, fields }` 或 `{ mode: 'markdown', domain, action, content }`，主显示区分裂；用户点击"确认执行"后 splitWith 置空，视图折叠，AI 在完整宽度报告结果

- [X] **T032** [US5] 实现 AI 建议→表单字段自动填充联动（8 min）
  > **Given** 右侧为表单模式且 AI 在对话中建议修改字段，**When** AI 回复包含字段更新建议（如"建议名称改为'晨跑'"），**Then** 编辑区表单对应字段自动更新，无需用户手动修改

- [X] **T033** [US5] 修改 `frontend/src/components/editor/intent-form.tsx`：适应编辑区容器布局（8 min）
  > **Given** 表单在右侧编辑区显示，**When** 渲染 IntentForm，**Then** 表单宽度自适应编辑区容器，底部[下一步→确认执行]按钮；确认时走 Intent Engine → Rule Engine → State Machine 标准链路

**Checkpoint**: US5 完成 — 对话+编辑区协同工作可独立演示

---

## Phase 6: User Story 6 — Markdown 模板批量创建 (Priority: P3)

**Goal**: 下载 Markdown 模板→离线编辑→上传→解析→确认执行

**Independent Test**: 下载时间盒模板，填写 3 个时间盒，上传后正确解析

### Implementation for US6

- [X] **T034** [US6] 在各 Domain manifest 的 `templates.markdown` 块中定义 Markdown 模板路径和字段映射（10 min）
  > **Given** 需要 Markdown 模板支持，**When** 查看 habits/manifest.yaml 的 `templates.markdown` 块，**Then** `createHabit` 等 action 定义了 `template_file`、`output_action`、`max_objects`；模板文件实际存在于 `markdown_templates/` 目录

- [X] **T035** [P] [US6] 创建 `frontend/markdown_templates/create_habit.md` 示例模板（8 min）
  > **Given** 用户需要 Markdown 模板参考，**When** 下载模板，**Then** 获得结构化的 .md 文件，包含习惯名称、描述、频率、目标值等字段的占位符

- [X] **T036** [P] [US6] 创建 `frontend/markdown_templates/timebox_plan.md` 时间盒模板（8 min）
  > **Given** 用户需要批量创建时间盒，**When** 使用时间盒模板，**Then** 模板包含日期、时间盒列表（标题、开始时间、时长、关联任务/习惯、能量级别）结构

- [X] **T037** [US6] 实现 `frontend/src/nexus/core/intent-engine/markdown-parser.ts`：Markdown → StructuredIntent 解析（12 min）
  > **Given** 用户上传了按模板填写的 .md 文件，**When** 调用 `parseMarkdownToIntent(content, domainId, action)`，(1) 加载对应 manifest 的 markdown 模板定义；(2) 按分区解析 key-value；(3) 映射为 StructuredIntent.fields，**Then** 完全成功返回 `{ status: 'success', fields }`；部分成功返回 `{ status: 'partial', fields, errors }`（含高亮位置）；完全失败返回 `{ status: 'failed', errors }`

- [X] **T038** [US6] 实现 Markdown 解析失败的降级路径（8 min）
  > **Given** Markdown 解析返回 failed 或 partial，**When** partial 时 UI 高亮问题区域供用户修正后重新解析；failed 或修正后仍失败，**Then** 降级到 template_form 路径，用户可切换到表单标签手动填写

- [X] **T039** [US6] 新增 `frontend/src/components/editor/markdown-editor.tsx`：Markdown 编辑器组件（10 min）
  > **Given** 编辑区切换到 Markdown 标签，**When** 渲染 MarkdownEditor，**Then** (1) 显示可编辑的文本区域（预填 AI 初稿或上传内容）；(2) 底部[下一步→确认执行]按钮；(3) AI 可依据对话上下文自动填充初稿

- [X] **T039a** [P] [US6] 安装 SheetJS 依赖：`cd frontend && npm install xlsx`（3 min）
  > **Given** T040 需要解析 .xlsx/.xls 文件，**When** 执行 `npm install xlsx` 并运行 `npm run build`，**Then** xlsx 包成功安装，TypeScript 编译通过（xlsx 自带类型声明）

- [X] **T040** [US6] 新增 `frontend/src/components/editor/file-uploader.tsx`：文件上传处理组件（10 min）
  > **Given** 用户上传文件，**When** 选择 .md/.txt 文件，**Then** 文本提取后注入 AI 上下文；选择 .csv 文件解析为表格后注入；选择 .xlsx/.xls 文件使用 SheetJS (xlsx) 解析为结构化数据后注入。所有格式上传后触发 AI 解析

**Checkpoint**: US6 完成 — Markdown 模板→下载→编辑→上传→解析→确认闭环可独立演示

---

## Phase 7: User Story 7 — 系统配置管理 (Priority: P3)

**Goal**: 用户配置 LLM 服务、时区偏好、习惯模板管理

**Independent Test**: 进入配置页面，修改时区为 "Asia/Tokyo"，时间盒显示使用新时区

### Implementation for US7

- [X] **T041** [P] [US7] 实现 `frontend/src/lib/crypto/encrypt.ts`：Web Crypto API 加密工具（10 min）
  > **Given** 需要客户端加密 API Key，**When** 调用 `encrypt(plainText)`，**Then** 返回 AES-GCM 加密后的密文（含 IV）；调用 `decrypt(cipherText)` 返回原始明文。使用 PBKDF2 从稳定浏览器指纹（`navigator.userAgent + screen.width + screen.height + Intl.DateTimeFormat().resolvedOptions().timeZone` 组合哈希）派生密钥，加密结果通过 `IUserSettingsRepository.upsert()` 存入 `user_settings.llm_config` JSONB；解密后的明文仅保留在内存中用于 API 调用。指纹变化时密钥不可恢复，需用户重新配置 API Key

- [X] **T042** [P] [US7] 实现 `frontend/src/lib/db/repositories/user-settings.repository.ts`：IUserSettingsRepository（8 min）
  > **Given** 需要读写用户设置，**When** 调用 `findByUserId(userId)`，**Then** 返回 UserSettings 或 null（首次使用）；调用 `upsert(settings)`，**Then** 存在则更新 timezone/llm_config/ui_prefs，不存在则创建

- [X] **T043** [US7] 新增 `frontend/src/components/settings/settings-page.tsx`：配置页面容器（10 min）
  > **Given** 用户点击右上角⚙设置按钮，**When** 渲染 SettingsPage，**Then** (1) leftPanel 不变；(2) 主显示区显示配置页面（含标题"设置"）；(3) 左侧配置导航：通用、LLM、时区、习惯模板；(4) 点击导航项切换右侧配置内容

- [X] **T044** [US7] 新增 `frontend/src/components/settings/llm-settings.tsx`：LLM 配置表单（10 min）
  > **Given** 用户进入 LLM 设置，**When** 填写服务商（openai/anthropic/custom）、BASE_URL、API_KEY、默认模型并保存，**Then** (1) API_KEY 通过 Web Crypto API 加密后存储；(2) 保存成功提示；(3) 配置错误时（密钥无效/地址不可达）显示错误提示但不崩溃

- [X] **T045** [US7] 新增 `frontend/src/components/settings/timezone-picker.tsx`：时区选择器（8 min）
  > **Given** 用户进入时区设置，**When** 从下拉列表选择时区（默认从浏览器自动检测 `Intl.DateTimeFormat().resolvedOptions().timeZone`），**Then** 保存后所有时间显示（时间盒、会话时间戳等）使用新时区

- [X] **T046** [US7] 在设置页面集成现有习惯模板管理功能（8 min）
  > **Given** 用户进入习惯模板管理，**When** 复用现有 HabitTemplateManager 组件创建/编辑/删除模板，**Then** 变更在下次创建习惯时可用

- [X] **T047** [US7] 实现 LLM 未配置时的引导状态（FR-028）（6 min）
  > **Given** 用户尚未配置任何 LLM 服务，**When** 切换到 AI助手标签页，**Then** 显示引导提示"请先配置大语言模型"和[前往设置]按钮，对话输入框隐藏；配置完成后 AI助手标签页恢复正常

**Checkpoint**: US7 完成 — 设置页面独立工作，LLM 配置/时区/模板管理可独立测试

### S1 需求补充：LLM 配置统一到 .env (FR-037/FR-038)

- [X] **T066** [P] [US7] 修改 `frontend/.env.local`：添加 `LLM_PROVIDERS` 和各提供商模型映射环境变量（8 min）
  > **Given** config.ts 中 PROVIDERS 常量需迁移到 .env，**When** 查看 .env.local，**Then** 包含 `LLM_PROVIDERS=dashscope,deepseek,openai,zhipu` 及 `LLM_DASHSCOPE_DEFAULT_MODEL=qwen-plus`、`LLM_DASHSCOPE_THINKING_MODEL=qwen3-235b-a22b`、`LLM_DASHSCOPE_QUICK_MODEL=qwen-turbo` 等每个提供商的 3 个模型变量

- [X] **T067** [US7] 重构 `frontend/src/lib/llm/config.ts`：移除 PROVIDERS 硬编码常量，改为从 `process.env` 动态构建配置（12 min）
  > **Given** PROVIDERS 常量已迁移到 .env，**When** config.ts 中不再存在硬编码的提供商对象，**Then** `getLLMConfig()` 改为调用 `buildProviderConfig(providerId)` 从 `process.env` 读取；新增 `getAvailableProviderIds()` 解析 `LLM_PROVIDERS` 逗号列表；`getLLMConfig()` 公共接口不变，内部改为从环境变量构建；缺少配置时返回合理默认值（空数组），不崩溃

- [X] **T068** [US7] 新增 `frontend/src/app/actions/llm-config.ts`：Server Action `getLLMProviders()` 暴露非敏感配置给前端（8 min）
  > **Given** 前端不能直接读取服务端环境变量，**When** 前端调用 `getLLMProviders()` Server Action，**Then** 返回 `ProviderSummary[]`（每个提供商的 id、name、models{default,thinking,quick}），不含 API 密钥；前端 LLM 设置组件使用此列表填充提供商下拉选项

- [X] **T069** [US7] 修改 `frontend/src/components/settings/llm-settings.tsx`：LLM 设置使用 `getLLMProviders()` 动态加载提供商列表（8 min）
  > **Given** LLM 设置表单需要提供商列表，**When** 组件挂载时调用 `getLLMProviders()`，**Then** 提供商下拉选项从 Server Action 动态获取，不再硬编码选项；新增提供商只需修改 .env，无需改前端代码

**Checkpoint**: S1 补充完成 — LLM 配置从 .env 动态加载，前端无硬编码提供商常量

---

## Phase 8: Integration & Polish（集成与打磨）

**Purpose**: 跨故事集成、边界情况完善、最终验证

- [X] **T048** [US1+US3] 集成快捷方式解析到主显示区输入框：输入 `/createHabit` → 主显示区切换 action 视图（10 min）
  > **Given** 用户在主显示区（任意视图）输入框输入 `/createHabit`，**When** 提交，**Then** shortcut-matcher 解析后 mainViewState 切换到 `{ type: 'action', domainId: 'habits', action: 'createHabit' }`，主显示区渲染习惯创建表单

- [X] **T049** [US2+US5] 集成会话保存到所有视图切换路径：schedule↔conversation↔action（10 min）
  > **Given** 用户在 conversation 视图有未保存消息，**When** 点击 Home 或成长领域菜单，**Then** 当前对话自动保存（messages 写入数据库）；返回会话列表后点击该会话，消息完整恢复

- [X] **T050** [US3+US4] 左侧面板集成：Home + Tab 切换 + 会话列表 + 成长菜单联动（10 min）
  > **Given** 左侧面板已实现各子组件，**When** 用户在 AI助手 Tab 点击会话→主显示区切换 conversation；在成长领域 Tab 点击 action→主显示区切换 action；点击 Home→主显示区切换 schedule，**Then** 所有切换自动保存当前状态，无数据丢失

- [X] **T051** [US5+US6] 分裂视图集成：对话 + 编辑区表单/Markdown 双标签切换（10 min）
  > **Given** 主显示区处于分裂视图，**When** 用户在右侧编辑区切换[表单]/[Markdown]标签，**Then** 表单模式显示对应 Domain 的 template_form；Markdown 模式显示编辑器（含 AI 初稿或上传内容）；确认执行→分裂视图折叠→AI 报告结果

- [X] **T052** [All] LLM 降级路径端到端验证（8 min）
  > **Given** LLM 未配置或配置无效，**When** 用户尝试使用 AI 助手，**Then** 未配置时显示引导（FR-028）；配置无效时对话发送后返回错误提示并引导检查设置或使用模板表单模式。系统不崩溃

- [X] **T052a** [US5] 实现网络中断时的离线消息队列（10 min）
  > **Given** 用户正在 AI 对话中且网络中断，**When** 用户发送消息，**Then** 消息暂存到本地队列（IndexedDB 或内存队列），UI 显示"网络不可用，消息将在恢复后发送"提示；**When** 网络恢复（`window.addEventListener('online')`），**Then** 队列中的消息按顺序发送，发送成功后从队列移除，UI 恢复常态

- [X] **T053** [All] 执行 `quickstart.md` 完整验证清单 + 性能验收基准（10 min）
  > **Given** 所有阶段实施完成，**When** 逐项执行 quickstart.md 验证清单（npm run build、registry 无冲突、表迁移成功、面板切换、状态切换无数据丢失、分裂视图拖拽、快捷方式解析、Markdown 闭环、LLM 加密、会话生命周期），**Then** 所有检查项通过。此外手动验证：(1) SC-001：快捷方式 `/createHabit` 提交到表单展示 <1 秒；(2) SC-004：AI 对话中触发创建意图到编辑区出现 <3 秒；(3) SC-006：故意创建重复 shortcut 验证系统拒绝启动

- [X] **T070** [All] S1/S2 端到端验证（10 min）
  > **Given** S1/S2 任务实施完成，**When** 验证以下场景：(1) 修改 .env.local 中 LLM_PROVIDERS 去掉一个提供商，重启后前端下拉列表不包含该提供商；(2) 修改 .env.local 添加新提供商变量，前端下拉列表包含新选项；(3) 点击每个域的创建类 action（createHabit/createTask/createObjective/createTimebox），均显示动态生成的表单（非占位文本）；(4) 点击非创建类 action（如 activateHabit），显示确认界面；(5) 动态表单填写后提交，对象创建成功；(6) SC-008：4 域创建类 action 均可加载表单；(7) SC-009：新增提供商无需改前端代码

- [X] **T054** [US2] 更新 Tier 2 文档：`docs/usom-design.md` 和 `docs/database-design.md`（10 min）
  > **Given** 新增了 USOM 对象和数据库表，**When** 查看 `docs/usom-design.md`，**Then** 文档包含 AISession（含 ChatMessage 嵌套类型、生命周期状态转换）、UserSettings（含 LLMConfig）的完整定义；查看 `docs/database-design.md`，**Then** 文档包含 `ai_sessions` 表（10 列 + 2 索引）和 `user_settings` 表（6 列）的完整 DDL 和字段说明

**Checkpoint**: 所有用户故事集成完毕，端到端验证通过

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 0R (回溯修正 R1-R5) ⚠️ 最高优先级
    ↓
Phase 0 (Setup: USOM + DB)
    ↓
Phase 1 (US1: Shortcuts) ←→ Phase 2 (US2: Sessions) [可并行]
    ↓                              ↓
Phase 3 (US3: UI Layout) ←─────────┘
    ↓
Phase 4 (US4: Growth Menu) ←── US1 + US3
    ↓
Phase 5 (US5: Split View) ←── US2 + US3 + US4
    ↓
Phase 6 (US6: Markdown) ←── US5
    ↓
Phase 7 (US7: Settings) ←── [与 US4/5/6 可部分并行]
    ↓
Phase 8 (Integration)
```

### User Story Dependencies

| User Story | 依赖 |
|---|---|
| **回溯修正 (R1-R5)** | 无前置依赖，最高优先级 |
| US1 (Shortcuts) | Phase 0 |
| US2 (Sessions) | Phase 0 |
| US3 (UI Layout) | Phase 0, US1 (registry) |
| US4 (Growth Menu) | US1 (registry) + US3 (UI shell) |
| US5 (Split View) | US2 (sessions) + US3 (UI shell) + US4 (menu nav) |
| US6 (Markdown) | US5 (split view) |
| US7 (Settings) | Phase 0 (UserSettings DB), 与 US4/5/6 可并行 |
| **S1 (LLM .env)** | US7 (Settings page) |
| **S2 (Dynamic Forms)** | US1 (Registry) + US3 (UI shell) + US4 (Growth Menu) |

### Parallel Opportunities

- **Phase 0R 内**: T055∥T056∥T057∥T058∥T059（5 个修正独立，不同逻辑区域）
- **Phase 0 内**: T001∥T002, T003∥T004
- **Phase 1+2**: US1 和 US2 可完全并行（不同文件、不同 Repository）
- **Phase 6 内**: T039a 可在 US6 任何任务前执行（独立依赖安装）
- **Phase 7**: US7 与 US4/US5/US6 可部分并行（US7 仅依赖 Phase 0）
- **Phase 1 内**: T007∥T006（不同 manifest 文件）, T009∥T008（同 registry 文件但不同函数）
- **S2 任务内**: T061∥T062（不同文件：DynamicForm ∥ ActionConfirm），T066∥T067（.env 和 config.ts 可并行修改）
- **S1 和 S2**: T060~T065（S2）与 T066~T069（S1）可并行执行（不同文件区域）

---

## Implementation Strategy

### Regression Fix First (Phase 0R)

1. Phase 0R: T055-T059 回溯修正 → **验证 5 项修复**
2. 启动应用逐项验证：左侧面板清洁、设置按钮路由、LLM 跳转、标签页移除、成长领域数据

### MVP First (US1 + US2)

1. Phase 0: USOM types + DB tables → **Foundation ready**
2. Phase 1 (US1): Shortcuts + Registry → 快捷方式独立可用
3. Phase 2 (US2): Sessions + Repository → 会话持久化独立可用
4. **STOP & VALIDATE**: US1 和 US2 独立测试通过

### Incremental Assembly

5. Phase 3 (US3): UI Layout shell → 新布局可见
6. Phase 4 (US4): Growth Menu → 菜单可导航
7. Phase 5 (US5): Split View → 对话+编辑区协作
8. Phase 6 (US6): Markdown Workflow → 模板闭环
9. Phase 7 (US7): Settings → 配置管理
10. Phase 8: Integration → 全链路验证

---

## Notes

- [P] 标记任务可并行（不同文件，无读写依赖）
- [US*] 标签映射到具体用户故事以便追踪
- 每个任务预估 5–15 分钟
- 每个 Checkpoint 后可独立验证该用户故事
- 文件路径基于当前 `frontend/src/` 代码库实际结构
