# Requirements Quality Checklist: 三栏时间盒视图

**Purpose**: 验证 US6 三栏时间盒视图（FR-016~FR-019）的需求完整性、清晰度、一致性，以及跨文档（spec↔plan↔tasks↔contracts）的一致性
**Created**: 2026-05-07
**Verified**: 2026-05-07
**Focus**: 三栏视图需求质量 + 跨文档一致性 | 桌面端 | Standard depth
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md) | [contracts/ui-layout.md](../contracts/ui-layout.md)

---

## 需求完整性 (Requirement Completeness)

- [x] CHK001 - FR-016 要求日期导航栏"包含日期模式切换（日/周/月）和前进/后退翻页按钮"，DateNav 的交互行为在不同模式下的翻页单位是否明确定义（日±1天、周±1周、月±1月）？ [Completeness, Spec §FR-016]
  - **PARTIAL** — spec §FR-016 仅说"前进/后退翻页按钮，用于切换浏览的日期范围"，未定义翻页单位。research.md R16 明确定义了"日模式±1天，周模式±1周，月模式±1月"。contracts DateNavProps 的 `onNavigate(direction: 'prev' | 'next')` 也未说明单位。建议将翻页单位补充到 contracts DateNav 注释中。

- [x] CHK002 - FR-017 描述日视图三栏、周视图和月视图，但三种视图之间的切换动画/过渡效果是否有明确要求？ [Gap, Spec §FR-017]
  - **PASS (有意排除)** — 所有文档均未提及过渡动画。MVP 直接切换即可，无需额外动画开销。SC-008 的"平滑过渡"实际指无闪烁，非动画效果。

- [x] CHK003 - 日视图三栏比例（30%/40%/30%）是 contracts 中定义的，spec 本身是否引用或认可了这一具体比例？ [Consistency, Spec §FR-017 vs contracts/ui-layout.md §DayView]
  - **PASS** — spec §FR-017 定义了三栏语义（左侧列表、中间时间轴、右侧小日历），具体比例是实现层细节。contracts DayView 以 `30%/40%/30%` 量化，是 spec 的合理细化，不存在矛盾。

- [x] CHK004 - DateNav 的日期文本格式（日模式"YYYY年M月D日"、周模式"M月D日 - M月D日"、月模式"YYYY年M月"）仅在 tasks.md T068 中描述，spec 或 contracts 是否有对应定义？ [Completeness, Gap]
  - **PARTIAL** — contracts DateNav 注释仅说"当前日期/周/月文本"，无具体格式。research.md R16 也无格式定义。仅 tasks T068 有描述。建议补充到 contracts DateNav 的注释中。

- [x] CHK005 - WeekView 和 MonthView 中时间盒事件块的点击行为是否有需求定义（如查看详情、编辑）？ [Gap, Spec §FR-017]
  - **PASS (超出范围)** — MVP 仅支持 create_timebox，不支持编辑/删除（spec Assumptions 明确）。点击行为无需定义。

- [x] CHK006 - MiniCalendar 中"有时间盒的日期显示标记点"的标记样式（颜色、大小、位置）是否有明确规范？ [Completeness, contracts/ui-layout.md §MiniCalendar]
  - **PARTIAL** — contracts 仅说"有时间盒的日期显示标记点"，无样式细节。建议在 contracts 中补充：颜色使用 `primary`、尺寸 `4px` 圆点、位于日期数字下方居中。

- [x] CHK007 - MiniCalendar 点击日期后，日视图是否应立即跳转到该日期？这一交互链路是否在需求中明确定义？ [Gap, contracts/ui-layout.md §MiniCalendar onDateSelect]
  - **PARTIAL** — contracts 定义了 `onDateSelect?: (date: Date) => void` 接口，research.md R17 说"支持点击日期切换日视图的显示日期"，但 spec US6 中无对应接受场景。建议在 US6 补充一个接受场景，或在 DayView 组件中标注交互说明。

- [x] CHK008 - 三种视图模式下，数据查询的日期范围计算逻辑（日=当天 00:00-23:59、周=周一至周日、月=1日至月末）是否在 spec 或 data-model 中有明确要求？ [Completeness, data-model.md §视图模式数据范围]
  - **PASS** — data-model.md "视图模式数据范围"表格明确定义了三种模式的查询范围。research.md R18 有决策记录。spec 通过 FR-016/FR-017 间接覆盖。

## 需求清晰度 (Requirement Clarity)

- [x] CHK009 - FR-017 中"时间盒以状态色块形式定位在对应时段"的"状态色块"颜色映射是否可度量（planned=? running=? paused=? ended=? logged=?）？ [Clarity, Spec §FR-017]
  - **PASS** — contracts TimeboxTimeline 明确定义了颜色映射：planned=hairline, running=primary, paused=warning, ended=hairline-soft, logged=success。DayView 复用 TimeboxTimeline，颜色一致。

- [x] CHK010 - SC-008 要求"视图切换后数据在1秒内完成刷新，视图平滑过渡"，"平滑过渡"是否可客观验证？是否需要定义具体的过渡效果类型（fade/slide/instant）？ [Measurability, Spec §SC-008]
  - **PARTIAL** — "1秒内刷新"可度量，"平滑过渡"不可度量。实际意图是"视图切换无白屏闪烁"（React 状态切换自然实现）。建议将 SC-008 改为"视图切换后数据在1秒内完成渲染，无明显闪烁或布局跳动"。

- [x] CHK011 - FR-018 要求"默认显示当天日期的时间盒数据"，"当天"的定义是否明确（用户本地时区 vs UTC vs 服务端时区）？ [Clarity, Spec §FR-018]
  - **PARTIAL** — 未显式声明时区。隐含为用户本地时区（前端 `new Date()` 生成 currentDate，Server Action 接收日期范围参数）。建议在 spec Assumptions 中补充"日期计算基于用户浏览器本地时区"。

- [x] CHK012 - "周"模式下的"当周"定义是否明确（ISO 周一至周日 vs 周日至周六）？ [Clarity, Gap]
  - **PASS** — data-model.md "视图模式数据范围"明确写"当周周一 00:00 至周日 23:59"，采用 ISO 标准（周一开始）。

## 需求一致性 (Requirement Consistency)

- [x] CHK013 - spec.md US6 场景 1 描述"中间为小时时间轴"，contracts/ui-layout.md DayView 描述"中列：TimeboxTimeline（小时时间轴 06:00-23:00）"，时间轴范围（06:00-23:00）是否在 spec 中有出处？ [Consistency, Spec §US6-Acceptance 1 vs contracts]
  - **PASS** — spec 描述语义（"小时时间轴"），contracts 细化为具体范围（06:00-23:00）。这是合理的关注点分离，contracts 是 spec 的量化补充。

- [x] CHK014 - plan.md Project Structure 列出要删除的组件（view-mode-toggle.tsx, today-view.tsx），tasks.md T074 也要求删除这些组件。spec.md US5 场景 1 仍提到"今日模式/日历模式切换"，是否需要更新 US5 的描述以反映三栏视图？ [Consistency, Spec §US5 vs Plan/Tasks]
  - **FAIL** — spec §US5 场景 1 描述"今日模式/日历模式切换"，这与三栏视图架构矛盾。US5 场景 1 应更新为描述三栏视图布局。**建议修改 spec.md US5 Acceptance Scenario 1**。

- [x] CHK015 - data-model.md DateNav 属性表包含 `mobileHidden` 字段，但 spec §FR-019 和 contracts DateNavProps 中均无此字段定义，三处描述是否一致？ [Consistency, data-model.md vs contracts vs spec]
  - **PARTIAL** — spec §FR-019 有要求（"隐藏'周'"），data-model 有 `mobileHidden` 字段，但 contracts DateNavProps 缺少此字段。建议在 contracts DateNavProps 中补充注释"移动端隐藏'周'按钮"。

- [x] CHK016 - tasks.md T071 描述 WeekView"从 calendar-view.tsx 拆出"，T072 描述 MonthView 类似。但 plan.md 描述 calendar-view.tsx 为"重构为 WeekView + MonthView 的共享样式提取（或删除）"。拆分策略是否已确定？ [Consistency, tasks.md T071/T072 vs plan.md]
  - **PARTIAL** — T071/T072 说"从 calendar-view.tsx 拆出"，T074 说"共享样式提取（或删除）"，plan 说"重构：拆分"。三者意图一致（拆分 calendar-view 为独立组件），但措辞不统一。实际实现时建议：T071/T072 创建新文件，T074 删除 calendar-view.tsx。建议将 T074 明确为"删除 calendar-view.tsx"。

## 接受标准质量 (Acceptance Criteria Quality)

- [x] CHK017 - US6 场景 2-3 描述周/月视图的切换，但未提及切换后数据是否应自动刷新。fetchTimeboxSummariesByRange 的调用时机是否需要在接受标准中体现？ [Acceptance Criteria, Spec §US6]
  - **PARTIAL** — 接受场景描述了视图切换后的展示效果，隐含数据已加载。tasks T073 明确了"根据 dateMode 计算日期范围调用 Server Action"。建议在 US6 场景 2-3 补充"数据同步更新"的预期。

- [x] CHK018 - US6 场景 4-6 描述翻页行为，但未定义翻页后视图的滚动位置（是否回到顶部？保持当前位置？）。这一行为是否有隐含约定？ [Gap, Spec §US6-Acceptance 4-6]
  - **PASS (隐含行为)** — React 重新渲染自然回到初始滚动位置，无需显式要求。如果内容超出视口，这是合理默认行为。

- [x] CHK019 - SC-007 要求"默认显示当天日视图"，但未定义"当天"跨越午夜后的行为（如用户在 23:59 创建了时间盒，0:01 查看时是否仍显示前一天？） [Edge Case, Spec §SC-007]
  - **PASS (超出范围)** — MVP 不需要自动刷新日期。"当天"在页面加载时确定，跨午夜后用户刷新页面即可。这是一个后续优化点，不影响 MVP。

## 跨文档覆盖 (Cross-Document Coverage)

- [x] CHK020 - contracts/ui-layout.md 定义了 DayViewProps、WeekViewProps、MonthViewProps，但 data-model.md 的 UI 组件层级仅列出组件名称，未重复接口定义。两处的 props 签名是否对齐（特别是 currentDate 类型、timeboxes 类型）？ [Consistency, contracts vs data-model]
  - **PASS** — contracts 是 props 的权威定义，data-model 是概要描述（组件层级+简短说明）。两者不矛盾，`currentDate: Date` 和 `timeboxes: TimeboxSummary[]` 在 contracts 中类型明确。

- [x] CHK021 - research.md R18 决定新增日期范围查询，tasks.md T067 实现此功能。plan.md 中未提到对 Repository 层的修改需求，fetchTimeboxSummariesByRange 是否涉及 Repository 层变更？如果涉及，是否违反 Constitution V (Repository Isolation)？ [Traceability, research.md R18 vs plan.md]
  - **PASS** — T067 修改 `intent.ts`（Server Action），将日期范围参数传递给现有 Repository 查询方法。不修改 Repository 层本身，仅扩展参数。不违反 Constitution V。

- [x] CHK022 - plan.md Constitution Check 表中"V. Repository Isolation"标注为 PASS 且"不修改 Repository 层"。如果 T067 扩展了查询接口，是否需要重新评估此 Check 项？ [Consistency, plan.md §Constitution Check]
  - **PASS** — T067 仅在 Server Action 层增加日期范围参数，传给现有 Repository 的 `getTimeboxes` 方法（或类似）。Repository 层接口不变，Constitution Check 仍然有效。

- [x] CHK023 - tasks.md Phase 9 的并行机会列出"T068, T069, T071, T072 可并行"，但 T070 (DayView) 依赖 T069 (MiniCalendar)。DayView 还依赖 TimeboxTimeline（已完成）和 TimeboxList（已完成），这些已有依赖是否在任务描述中明确标注？ [Traceability, tasks.md]
  - **PASS** — tasks.md "Parallel Example: US6 三栏视图"中明确标注了依赖：`T070: DayView → 依赖 T069 (MiniCalendar)`，已完成组件（TimeboxTimeline、TimeboxList）因其状态为 completed 不需要重复标注。

## 边界与空状态 (Edge Cases & Empty States)

- [x] CHK024 - 当选中日期没有时间盒时，DayView 三栏应如何展示？是否需要空状态提示？仅在 tasks.md T076 中提及，spec 中是否有对应要求？ [Coverage, Gap]
  - **PARTIAL** — tasks T076 明确要求"日视图无时间盒时列表和时间轴显示空提示"。spec 和 contracts 均未定义空状态。建议在 contracts DayView 中补充空状态说明。

- [x] CHK025 - 周视图/月视图中，跨日时间盒（如 22:00-01:00）的显示规则是否定义？react-big-calendar 的默认行为是否符合项目需求？ [Edge Case, Gap]
  - **PASS (超出范围)** — MVP 时间盒时长上限 480 分钟（8小时），且开始时间必须在当前之后（spec Edge Cases），跨日场景不太可能在 MVP 中出现。react-big-calendar 默认处理跨日事件，无需额外配置。

- [x] CHK026 - MiniCalendar 的月份切换（如点击下月日期）是否在需求范围内？如果支持，是否需要新增翻页机制？ [Scope Boundary, Gap]
  - **PASS (有意排除)** — contracts 定义"显示当月日历网格"，无月份切换。research.md R17 也未提及。月份切换由 DateNav 的翻页功能负责，MiniCalendar 保持简单。

- [x] CHK027 - DateNav 中用户快速连续点击翻页按钮时的防抖/节流行为是否有需求定义？ [Edge Case, Gap]
  - **PASS (实现细节)** — MVP 不需要防抖。React 的状态更新机制自然会批处理连续点击，Server Action 调用使用最后传入的日期范围。如需优化可在 Polish 阶段处理。

## 术语一致性 (Terminology Consistency)

- [x] CHK028 - "DateViewMode"（types.ts/tasks.md）vs "DateViewMode"（plan.md）vs "DateViewMode"（contracts）— 类型名称是否在所有文档中统一？ [Consistency, Terminology]
  - **PASS** — 所有文档统一使用 `DateViewMode`，值统一为 `'day' | 'week' | 'month'`。

- [x] CHK029 - spec 使用"日/周/月"描述模式，tasks/plan 使用 "day/week/month" 代码值，contracts 使用 `DateViewMode = 'day' | 'week' | 'month'`。中英文映射是否有一致对应？ [Consistency, Terminology]
  - **PASS** — 日=day, 周=week, 月=month，映射清晰一致，无歧义。

- [x] CHK030 - "MiniCalendar" vs "小日历" vs "月历小日历" — 同一组件在不同文档中的称呼是否统一？ [Consistency, Terminology]
  - **PASS** — 英文组件名统一为 `MiniCalendar`。中文描述有"小日历""月历小日历"两种，但均指向同一组件，不影响实现。contracts 和 tasks 使用统一的英文命名即可。

---

## Verification Summary

| Status | Count | Items |
|---|---|---|
| PASS | 19 | CHK002, CHK003, CHK005, CHK008, CHK009, CHK012, CHK013, CHK018, CHK019, CHK020, CHK021, CHK022, CHK023, CHK025, CHK026, CHK027, CHK028, CHK029, CHK030 |
| PARTIAL | 10 | CHK001, CHK004, CHK006, CHK007, CHK010, CHK011, CHK015, CHK016, CHK017, CHK024 |
| FAIL | 1 | CHK014 |

## 待修复项 (Action Items)

### 必须修复 (FAIL)

1. **CHK014**: 更新 spec.md US5 Acceptance Scenario 1，将"今日模式/日历模式切换"改为三栏视图描述

### 建议改进 (PARTIAL — 可在实现时同步处理)

2. **CHK001**: 在 contracts DateNavProps 注释中补充翻页单位说明（日±1天、周±1周、月±1月）
3. **CHK004**: 在 contracts DateNavProps 注释中补充日期文本格式定义
4. **CHK006**: 在 contracts MiniCalendar 补充标记点样式（颜色=primary、尺寸=4px、位置=日期下方居中）
5. **CHK007**: 在 spec US6 补充 MiniCalendar 点击日期切换场景，或在 DayView 组件注释中标注
6. **CHK010**: 将 SC-008 "平滑过渡"改为可度量表述："视图切换后数据在1秒内完成渲染，无明显闪烁或布局跳动"
7. **CHK011**: 在 spec Assumptions 补充"日期计算基于用户浏览器本地时区"
8. **CHK015**: 在 contracts DateNavProps 补充移动端隐藏"周"按钮的注释
9. **CHK016**: 将 tasks T074 明确为"删除 calendar-view.tsx"，消除"或删除"歧义
10. **CHK017**: 在 US6 场景 2-3 补充"数据同步更新"预期
11. **CHK024**: 在 contracts DayView 补充空状态说明
