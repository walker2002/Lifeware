# Tasks: 时间盒管理优化

**Input**: Design documents from `/specs/002-timebox-slice/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: 原有 US1-US5 (T001-T035) 已全部完成。本次为优化阶段，新增 US6-US9 对应 `mydocs/dev/001-时间盒管理优化 202605-01.md` 的需求。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 安装新依赖、创建组件目录结构

- [x] T036 安装 `react-big-calendar` 和 `date-fns` 依赖到 `frontend/package.json`
- [x] T037 [P] 创建 `frontend/src/components/timebox/` 目录，放置时间盒视图组件
- [x] T038 [P] 创建 `frontend/src/nexus/infrastructure/trace-logger/` 目录，放置追踪日志模块

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 类型定义和基础设施，所有 User Story 共享

**⚠️ CRITICAL**: 必须在 User Story 工作开始前完成

- [x] T039 创建追踪日志类型定义到 `frontend/src/nexus/infrastructure/trace-logger/trace-types.ts`：定义 TraceSession（id, startedAt, completedAt, rawInput, steps, result）、TraceStep（id, component, phase, timestamp, input, output, duration, error）、StateTransitionTrace（fromStatus, toStatus, action, eventType, proposal, event）
- [x] T040 [P] 创建追踪配置模块到 `frontend/src/lib/config/trace-config.ts`：定义 TraceConfig（enabled: boolean=false, maxSessions: 50, logToConsole: true），导出 getTraceConfig() 和 setTraceConfig() 函数
- [x] T041 [P] 在 `frontend/src/components/timebox/types.ts` 中添加 ViewMode 类型定义：`type ViewMode = 'today' | 'calendar'`

**Checkpoint**: 基础类型和配置就绪，User Story 实现可以开始

---

## Phase 3: User Story 6 — Dynamic Tile 位置调整 (Priority: P1) 🎯 MVP

**Goal**: 将 DynamicTile 从左侧 AI 面板移至 TopNav 下方、MainContent 上方的全宽 TilesBanner 区域

**Independent Test**: 创建时间盒后，TilesBanner 在 MainContent 上方显示行动提示磁贴，AI 面板中不再显示 Tiles

### Implementation for User Story 6

- [x] T042 [US6] 创建 TilesBanner 组件到 `frontend/src/components/layout/tiles-banner.tsx`（全宽横幅，接收 ActionCandidate[]，candidates 为空时不渲染，背景 surface-soft，内部 padding 12px 16px，水平滚动展示多个 Tile）
- [x] T043 [US6] 修改 `frontend/src/components/layout/app-shell.tsx`：在 TopNav 和两栏 Grid 之间插入 TilesBanner，从 AiPanel 的 props 中移除 DynamicTile 渲染，将 actionSurface.candidates 传入 TilesBanner
- [x] T044 [US6] 修改 `frontend/src/app/page.tsx`：从 AiPanel children 中移除 DynamicTile 渲染，将 actionSurface 数据传入 AppShell 的新 tilesBanner prop，AiPanel 仅保留输入区和模式切换

**Checkpoint**: 时间盒创建后，TopNav 下方的全宽横幅显示 DynamicTile，AI 面板中无 Tile

---

## Phase 4: User Story 7 — 今日模式视图 (Priority: P1)

**Goal**: MainContent 支持 Today 模式，左列显示时间盒列表（开始时间、时长、状态、标题），右列显示可视化时间轴

**Independent Test**: 切换到今日模式，左列显示时间盒列表，右列显示时间轴色块，色块位置和宽度对应时间盒的开始时间和时长

### Implementation for User Story 7

- [x] T045 [P] [US7] 创建 ViewModeToggle 组件到 `frontend/src/components/timebox/view-mode-toggle.tsx`（接收 mode 和 onModeChange，两个选项按钮：今日模式、日历模式，使用 DESIGN.md category-tab 样式，active 状态用 surface-card 背景）
- [x] T046 [P] [US7] 创建 TimeboxTimeline 组件到 `frontend/src/components/timebox/timebox-timeline.tsx`（垂直时间轴：左侧 06:00-23:00 时间刻度，右侧时间盒色块，色块位置=开始时间偏移，宽度=时长比例，颜色按状态区分 planned=hairline/running=primary/paused=warning/ended=hairline-soft/logged=success，当前时间指示线）
- [x] T047 [US7] 创建 TodayView 组件到 `frontend/src/components/timebox/today-view.tsx`（CSS Grid 两栏各 50%，左列渲染 TimeboxList，右列渲染 TimeboxTimeline，移动端折叠为单列）
- [x] T048 [US7] 修改 `frontend/src/components/timebox-card.tsx`：添加 compact 模式（compact=true 时单行显示：标题 + HH:MM-HH:MM + 时长 + 状态徽章），用于今日模式左列
- [x] T049 [US7] 修改 `frontend/src/components/timebox-list.tsx`：接受 compact prop 传递给 TimeboxCard，今日模式下使用紧凑布局（单列列表，无网格）
- [x] T050 [US7] 修改 `frontend/src/app/page.tsx`：添加 viewMode 状态（默认 'today'），在 MainContent 中渲染 ViewModeToggle + TodayView，将 timeboxes 传入 TodayView

**Checkpoint**: 页面默认显示今日模式，左列紧凑列表、右列时间轴色块，两者数据同步

---

## Phase 5: User Story 8 — 日历模式视图 (Priority: P2)

**Goal**: MainContent 支持 Calendar 模式，展示完整日历组件，时间盒显示为日历事件

**Independent Test**: 切换到日历模式，日历显示当月/当周/当日视图，时间盒以事件块形式展示在对应时间位置

### Implementation for User Story 8

- [x] T051 [US8] 创建 CalendarView 组件到 `frontend/src/components/timebox/calendar-view.tsx`（使用 react-big-calendar，将 TimeboxSummary[] 映射为 CalendarEvent[]，event.title=timebox.title, event.start/endTime，支持月/周/日视图切换，高度至少 500px，事件块使用项目设计令牌颜色）
- [x] T052 [US8] 修改 `frontend/src/app/page.tsx`：在 MainContent 中根据 viewMode 切换渲染 TodayView 或 CalendarView，ViewModeToggle 切换时保持数据同步

**Checkpoint**: 点击日历模式切换按钮，页面显示完整日历组件，已有时间盒显示为日历事件

---

## Phase 6: User Story 9 — 详细运行日志系统 (Priority: P2)

**Goal**: 设计可配置的运行追踪系统，记录 Nexus 管道各组件 I/O、状态机转换详情，通过底部可折叠面板展示

**Independent Test**: 开启追踪日志后，创建时间盒，底部面板显示完整调用链（IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine），每步可展开查看输入输出

### Implementation for User Story 9

- [x] T053 [US9] 创建 TraceLogger 核心模块到 `frontend/src/nexus/infrastructure/trace-logger/index.ts`：实现 createTraceLogger() 工厂函数，返回 { startSession(rawInput), endSession(result), traceStep(component, phase, data), getSessions(), clearSessions() }，内部维护 TraceSession[] 缓冲区，超出 maxSessions 时 FIFO 淘汰，logToConsole=true 时 console.group 输出
- [x] T054 [US9] 修改 `frontend/src/nexus/orchestrator/index.ts`：OrchestratorDeps 新增可选 onTrace 回调 `(step: TraceStep) => void`，在 execute() 各步骤前后调用 onTrace（intent-parse-start/end, rule-eval-start/end, state-machine-start/end, action-surface-start/end），不包含任何业务逻辑判断
- [x] T055 [US9] 修改 `frontend/src/app/actions/intent.ts`：当 TraceConfig.enabled 时，创建 TraceLogger 实例，将其 onTrace 回调注入 Orchestrator，execute 完成后将 TraceSession 存入可序列化结果返回前端
- [x] T056 [US9] 创建 TracePanel 组件到 `frontend/src/components/trace-panel.tsx`（底部可折叠面板，高度 300px，背景 surface-dark，文字 on-dark，显示 TraceSession 列表，每个 session 可展开查看步骤调用链，每个步骤可展开查看 input/output JSON，默认隐藏）
- [x] T057 [US9] 修改 `frontend/src/components/layout/top-nav.tsx`：添加设置按钮点击处理（onSettingsClick prop），设置弹出菜单中包含追踪日志开关（Toggle 组件，绑定 TraceConfig.enabled）
- [x] T058 [US9] 修改 `frontend/src/components/layout/app-shell.tsx`：新增 tracePanel prop（ReactNode），在布局底部条件渲染 TracePanel，通过 TopNav 的设置按钮控制显隐
- [x] T059 [US9] 修改 `frontend/src/app/page.tsx`：管理 traceVisible 状态和 traceSessions 数据，将 TracePanel 传入 AppShell 的 tracePanel prop，TopNav onSettingsClick 切换 traceVisible

**Checkpoint**: 点击设置开启追踪日志，创建时间盒后底部面板显示调用链，每步可展开，关闭设置后面板隐藏

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 响应式适配、边界处理、验证

- [x] T060 实现今日模式移动端响应式：TodayView 两栏折叠为单列（时间轴在列表下方），修改 `frontend/src/components/timebox/today-view.tsx`
- [x] T061 [P] 实现日历模式移动端适配：CalendarView 下方增加水平滚动或切换为 day 视图，修改 `frontend/src/components/timebox/calendar-view.tsx`
- [x] T062 [P] 实现 TracePanel 移动端适配：面板全宽显示，触摸拖拽调整高度，修改 `frontend/src/components/trace-panel.tsx`
- [x] T063 实现 TilesBanner 移动端响应式：Tile 横向滚动，修改 `frontend/src/components/layout/tiles-banner.tsx`
- [x] T064 [P] 添加空状态处理：今日模式无时间盒时时间轴显示空提示，日历模式无事件时显示空日历
- [x] T065 运行 quickstart.md 验证：确保完整 Setup → 使用流程 → 14 项验证清单全部通过

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 — BLOCKS 所有 User Story
- **US6 (Phase 3)**: 依赖 Phase 2 — Tiles 位置调整
- **US7 (Phase 4)**: 依赖 Phase 2 — 今日模式视图
- **US8 (Phase 5)**: 依赖 Phase 4（复用 ViewModeToggle）
- **US9 (Phase 6)**: 依赖 Phase 2 — 追踪日志系统
- **Polish (Phase 7)**: 依赖所有 User Story 完成

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: 类型 + 配置)
    ↓
Phase 3 (US6: Tiles 位置调整) ←── 可与 Phase 4/6 并行
    ↓
Phase 4 (US7: 今日模式) ←── 可与 Phase 3/6 并行
    ↓
Phase 5 (US8: 日历模式) ←── 依赖 Phase 4 的 ViewModeToggle
    ↓
Phase 6 (US9: 追踪日志) ←── 可与 Phase 3/4 并行
    ↓
Phase 7 (Polish)
```

### Parallel Opportunities

- T037, T038 可并行（不同目录）
- T040, T041 可并行（不同文件）
- T045, T046 可并行（不同组件文件）
- T051 可与 T053 并行（日历组件 vs 追踪模块，无依赖）
- US6(Phase 3) 与 US7(Phase 4) 与 US9(Phase 6) 可并行
- T060-T064 可并行（不同文件）

---

## Parallel Example: US7 (今日模式)

```bash
# 并行创建独立组件:
T045: ViewModeToggle → frontend/src/components/timebox/view-mode-toggle.tsx
T046: TimeboxTimeline → frontend/src/components/timebox/timebox-timeline.tsx

# 顺序执行（有依赖）:
T047: TodayView → 依赖 T045, T046
T048: TimeboxCard compact → 独立修改
T049: TimeboxList compact → 依赖 T048
T050: page.tsx 接入 → 依赖 T047, T049
```

## Parallel Example: US9 (追踪日志)

```bash
# 并行创建独立模块:
T053: TraceLogger 核心模块 → frontend/src/nexus/infrastructure/trace-logger/index.ts
T056: TracePanel 组件 → frontend/src/components/trace-panel.tsx

# 顺序执行（有依赖）:
T054: Orchestrator 接入 → 依赖 T053
T055: Server Action 接入 → 依赖 T054
T057: TopNav 设置 → 独立
T058: AppShell 接入 → 依赖 T056
T059: page.tsx 整合 → 依赖 T055, T058
```

---

## Implementation Strategy

### MVP First (Phase 1-4)

1. Phase 1: Setup — 安装依赖 + 创建目录
2. Phase 2: Foundational — 类型定义 + 配置
3. Phase 3: US6 — Tiles 位置调整（最快可见的界面变化）
4. Phase 4: US7 — 今日模式视图
5. **STOP and VALIDATE**: 切换今日模式，验证列表+时间轴双栏显示
6. 这是可演示的优化 MVP

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. + US6 → Tiles 上移（界面更清晰）
3. + US7 → 今日模式双栏视图（核心优化）
4. + US8 → 日历模式（视图增强）
5. + US9 → 追踪日志（调试能力）
6. + Polish → 移动端 + 边界处理

---

## Notes

- 所有文件路径相对于项目根目录
- T001-T035 已在之前的迭代中全部完成，本次为 T036+ 的优化任务
- 所有 Constitution 约束已验证通过（见 plan.md Constitution Check）
- react-big-calendar 需要额外的 CSS 导入（在 CalendarView 中处理）
- 追踪日志默认关闭，不引入性能开销
- 每个 Phase 完成后应提交 git commit
