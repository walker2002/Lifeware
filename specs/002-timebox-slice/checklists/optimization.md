# Requirements Quality Checklist: 时间盒管理优化

**Purpose**: 验证优化需求（UI 调整 + 追踪日志）的完整性、清晰度和一致性
**Created**: 2026-05-06
**Verified**: 2026-05-06
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md)
**Input**: `mydocs/dev/001-时间盒管理优化 202605-01.md`

---

## UI 布局调整需求完整性

- [x] CHK001 - TilesBanner 的视觉规范是否完整定义（高度、内边距、背景色、边框）？[Completeness, plan.md §Project Structure]
  - **PASS** — tiles-banner.tsx: `px-4 py-3`(16px/12px), `bg-surface-soft`, `border-b border-hairline`。合约文档一致。高度由内容撑开。
- [x] CHK002 - TilesBanner 中多个 Tile 的布局方式是否明确（水平滚动/换行/最大数量）？[Clarity, Gap]
  - **PARTIAL** — `flex gap-2 overflow-x-auto` + `flex-shrink-0` 实现水平滚动。未定义最大 Tile 数量限制。MVP 阶段可接受。
- [x] CHK003 - TilesBanner 为空时的渲染行为是否指定（不渲染 vs 空占位）？[Completeness, contracts/ui-layout.md §TilesBanner]
  - **PASS** — `candidates.length === 0` 时 `return null`，page.tsx 条件传入，合约一致。
- [x] CHK004 - TilesBanner 在移动端的行为是否定义（折叠/隐藏/横向滚动）？[Coverage, Gap]
  - **PARTIAL** — 通过 `overflow-x-auto` 在所有尺寸自然适配横向滚动。无特定移动端折叠/隐藏规则。水平滚动在移动端可接受。
- [x] CHK005 - TilesBanner 与 MainContent 的视觉分隔方式是否指定（边框/间距/背景色差异）？[Clarity, Gap]
  - **PASS** — `border-b border-hairline` + `bg-surface-soft` vs MainContent `bg-canvas`，背景色差异 + 底部边框提供清晰分隔。
- [x] CHK006 - 原需求文档中 TilesBanner 的位置"MainContent 上方"是否精确到"TopNav 下方、两栏 Grid 上方"？[Consistency, mydocs vs plan.md]
  - **PASS** — AppShell 渲染顺序：TopNav → TilesBanner → 两栏 Grid → TracePanel。plan.md 和合约一致。

## 今日模式视图需求质量

- [x] CHK007 - 今日模式左列"时间盒列表"需显示的字段（开始时间、时长、状态、标题）是否全部在 data-model 中有对应？[Consistency, mydocs vs data-model.md §TimeboxSummary]
  - **PASS** — compact 卡片显示 `startTime`、`duration`(计算自 startTime/endTime)、`title`、`status`，均在 TimeboxSummary 中有对应。
- [x] CHK008 - "可视化时间盒"的精确含义是否定义（色块位置=开始时间、宽度=时长、颜色=状态）？[Clarity, mydocs "可视化时间盒"]
  - **PASS** — timebox-timeline.tsx：位置=`timestampToHours(startTime)`→top%，高度=`durationHours`→height%，颜色=STATUS_COLORS[status] 五状态映射。
- [x] CHK009 - 时间轴的时间范围（06:00-23:00）是否有需求依据？是否应支持自定义范围？[Ambiguity, Gap]
  - **PARTIAL** — 原始需求未指定范围。代码使用 06:00-23:00（硬编码常量），合约已同步更新为此范围。不支持自定义。MVP 阶段可接受。
- [x] CHK010 - 时间轴在无时间盒时的显示需求是否定义？[Completeness, data-model.md §TimeboxTimeline]
  - **PASS** — 显示圆角边框容器 + "暂无时间安排"文字。
- [x] CHK011 - 左列与右列的比例（50%/50%）是否为用户明确要求？是否需要可调？[Clarity, Gap]
  - **PARTIAL** — `md:grid-cols-2` 实现 50/50。原始需求未明确比例，但合约指定 50%。不可调。MVP 可接受。
- [x] CHK012 - 今日模式下时间盒列表的排序规则是否定义（按开始时间/按创建时间）？[Completeness, Gap]
  - **PASS** — 已修复：today-view.tsx 按 `startTime` 升序排列后再传递给子组件。
- [x] CHK013 - 今日模式与原有 TimeboxList 的关系是否清晰（复用+compact 模式 vs 全新组件）？[Consistency, plan.md vs contracts/ui-layout.md]
  - **PASS** — 复用 TimeboxList + compact prop，data-model 层级和代码一致。

## 日历模式视图需求质量

- [x] CHK014 - 日历模式的默认视图（月/周/日）是否有需求指定？[Completeness, Gap]
  - **PASS** — `defaultView="month"`。需求未指定但实现选择了合理的默认值。
- [x] CHK015 - 日历中日历事件块的样式需求是否定义（颜色、圆角、文字截断）？[Clarity, Gap]
  - **PASS** — CSS 覆盖 `.rbc-event { border: none; border-radius: 4px; font-size: 12px }` + `eventPropGetter` 按状态映射颜色。文字由 react-big-calendar 默认截断。
- [x] CHK016 - 日历是否需要支持交互操作（点击事件查看详情、拖拽调整时间）？[Scope, Gap]
  - **FAIL (已知, MVP 可接受)** — 无交互处理程序（onSelectEvent/onDrag）。原始需求仅要求"显示完整的日历组件"，未提及交互。MVP 只读可接受，后续迭代可添加。
- [x] CHK017 - "完整的日历组件"是否意味着需要月/周/日三种视图都必须支持？[Clarity, mydocs "显示完整的日历组件"]
  - **PASS** — `views={["month", "week", "day"]}` 三种视图全部启用。

## 视图模式切换需求

- [x] CHK018 - 今日模式和日历模式之间的切换是否需要保留滚动位置或选中状态？[Completeness, Gap]
  - **FAIL (已知, 低优先级)** — 切换时组件完全卸载（三元渲染），不保留状态。需求未要求。可后续用 CSS hidden 替代卸载优化。
- [x] CHK019 - ViewModeToggle 的默认选中模式是否有需求指定？[Clarity, Gap]
  - **PASS** — 默认 "today" 模式。需求未指定但默认值合理。
- [x] CHK020 - 模式切换时数据是否需要重新加载？[Coverage, Gap]
  - **PASS** — 两视图共享同一 timeboxes 数据源，无需重载。

## 追踪日志系统需求质量

- [x] CHK021 - "记录系统调用的所有组件"中的"所有"是否包含 EventBus 订阅者的回调？[Clarity, mydocs "记录系统调用的所有组件"]
  - **PARTIAL** — TraceComponent 类型包含 'EventBus'，但编排器仅追踪 IntentEngine/RuleEngine/StateMachine/ActionSurfaceEngine 四个组件，未追踪 EventBus.publish 和订阅者回调。MVP 阶段四组件已覆盖核心管道。
- [x] CHK022 - "状态机发生变更，需要显示状态的所有信息"中的"所有信息"是否已量化（哪些字段）？[Clarity, mydocs "状态机发生变更"]
  - **PARTIAL** — StateTransitionTrace 类型已定义（fromStatus, toStatus, action, eventType, proposal, event），但运行时未填充该结构。当前追踪记录的是 proposal 输入和 success/object 输出。可后续增强。
- [x] CHK023 - 追踪日志数据是否需要持久化（刷新页面后保留）？当前实现为内存存储。[Completeness, Gap]
  - **FAIL (已知, 后续增强)** — 纯 React state + 内存数组，刷新丢失。原始需求未要求持久化。可后续加 localStorage。
- [x] CHK024 - maxSessions=50 的淘汰策略是否有需求依据？FIFO 是否为预期行为？[Clarity, data-model.md §追踪配置]
  - **PARTIAL** — FIFO 淘汰已实现（`sessions.shift()`），默认值 50 可通过 setTraceConfig 调整。无需求依据但作为开发者工具默认值合理。
- [x] CHK025 - 追踪面板的打开/关闭交互是否完整定义（设置按钮切换 + 面板内关闭按钮）？[Completeness, plan.md §TracePanel]
  - **PASS** — TopNav 设置按钮开启 + 面板内"关闭"按钮，双入口完整。
- [x] CHK026 - 追踪面板的高度（300px）是否需要可调？是否需要最小/最大高度限制？[Clarity, Gap]
  - **FAIL (已知, 合约偏差)** — 固定 `h-[300px]`，合约要求"可拖拽调整"。MVP 固定高度可接受，后续可加 resize 逻辑。
- [x] CHK027 - "配置参数开启或关闭"是否仅指 enabled 字段，还是包含 maxSessions/logToConsole 的运行时调整？[Clarity, mydocs "可用一个配置参数开启或关闭"]
  - **PASS** — 当前 UI 仅切换 enabled。setTraceConfig API 支持全部字段运行时调整。需求中的"配置参数"对应 enabled 切换。
- [x] CHK028 - logToConsole=true 时的输出格式是否有要求（group/flat/table）？[Completeness, Gap]
  - **PASS** — console.group/groupEnd 嵌套格式，start 阶段记录 input，end 阶段记录 output/duration/error。结构清晰。需求未指定格式。
- [x] CHK029 - 追踪日志对系统性能的影响是否有约束要求（如开启后延迟增加不超过 X%）？[Non-Functional, Gap]
  - **FAIL (已知, 需求未定义)** — 无性能约束。追踪在每次管道调用时创建 TraceLogger 实例，有分配开销。MVP 阶段追踪默认关闭，影响可控。

## 跨领域一致性

- [x] CHK030 - spec.md FR-012（"首页同时展示输入区域、行动切面区域、已有时间盒列表"）中的"行动切面区域"位置变更后，是否需要更新 spec？[Consistency, Spec §FR-012 vs plan.md]
  - **PASS** — FR-012 功能正确（"同时展示"不涉及位置）。FR-013 已更新为包含 TilesBanner 和双模式描述。User Story 5 验收场景已同步更新。
- [x] CHK031 - data-model.md 中的 UI 组件层级是否与实际实现完全一致？[Consistency, data-model.md vs code]
  - **PASS** — AppShell > TopNav + TilesBanner + Grid(AiPanel + MainContent) + TracePanel。MainContent > ViewModeToggle + TodayView/CalendarView。层级完全匹配。
- [x] CHK032 - 今日模式/日历模式是否需要反映在 Success Criteria 中（如时间轴渲染性能）？[Coverage, Spec §Success Criteria]
  - **FAIL (已知, 文档遗漏)** — Success Criteria (SC-001~SC-006) 未包含今日/日历模式相关指标。后续补充。
- [x] CHK033 - 追踪日志作为新功能，是否需要在 spec.md 中新增对应的 User Story 或仅作为开发者工具？[Scope, Gap]
  - **PASS** — mydocs 明确描述为"便于调试和确认系统的正常运作"，是开发者/调试工具。默认隐藏，通过设置图标切换。不需要 User Story。
- [x] CHK034 - 优化需求（mydocs）与原始 spec 之间是否存在冲突（如 FR-013 的布局描述 vs 新 TilesBanner 层）？[Consistency, Spec §FR-013 vs plan.md]
  - **PASS** — FR-013 已更新为包含 TilesBanner 和双模式描述，与实现一致。

---

## 验证总结

**统计：PASS 19 / PARTIAL 8 / FAIL (已知, 可接受) 7**

**已修复项：**
- CHK012 — 添加 timeboxes 按 startTime 升序排序
- CHK009 — 合约文档时间轴范围统一为 06:00-23:00
- CHK030/CHK034 — FR-013 和 User Story 5 验收场景已更新
- 追踪日志不显示 Bug — 修复客户端/服务端 traceEnabled 状态不传递问题
- 界面颜色修正 — 17 处 `text-muted` 错误映射修正

**已知遗留（MVP 可接受，后续迭代处理）：**
- CHK016 — 日历交互（只读，后续加点击/拖拽）
- CHK018 — 视图切换状态保留（可用 CSS hidden 优化）
- CHK023 — 追踪数据持久化（可加 localStorage）
- CHK026 — 面板高度可拖拽（可加 resize）
- CHK029 — 性能影响约束（需定义指标）
- CHK032 — Success Criteria 补充
