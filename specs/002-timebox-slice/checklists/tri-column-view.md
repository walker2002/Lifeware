# Requirements Quality Checklist: 三栏时间盒视图

**Purpose**: 验证 US6 三栏时间盒视图（FR-016~FR-019）的需求完整性、清晰度、一致性，以及跨文档（spec↔plan↔tasks↔contracts）的一致性
**Created**: 2026-05-07
**Focus**: 三栏视图需求质量 + 跨文档一致性 | 桌面端 | Standard depth
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md) | [contracts/ui-layout.md](../contracts/ui-layout.md)

---

## 需求完整性 (Requirement Completeness)

- [ ] CHK001 - FR-016 要求日期导航栏"包含日期模式切换（日/周/月）和前进/后退翻页按钮"，DateNav 的交互行为在不同模式下的翻页单位是否明确定义（日±1天、周±1周、月±1月）？ [Completeness, Spec §FR-016]
- [ ] CHK002 - FR-017 描述日视图三栏、周视图和月视图，但三种视图之间的切换动画/过渡效果是否有明确要求？ [Gap, Spec §FR-017]
- [ ] CHK003 - 日视图三栏比例（30%/40%/30%）是 contracts 中定义的，spec 本身是否引用或认可了这一具体比例？ [Consistency, Spec §FR-017 vs contracts/ui-layout.md §DayView]
- [ ] CHK004 - DateNav 的日期文本格式（日模式"YYYY年M月D日"、周模式"M月D日 - M月D日"、月模式"YYYY年M月"）仅在 tasks.md T068 中描述，spec 或 contracts 是否有对应定义？ [Completeness, Gap]
- [ ] CHK005 - WeekView 和 MonthView 中时间盒事件块的点击行为是否有需求定义（如查看详情、编辑）？ [Gap, Spec §FR-017]
- [ ] CHK006 - MiniCalendar 中"有时间盒的日期显示标记点"的标记样式（颜色、大小、位置）是否有明确规范？ [Completeness, contracts/ui-layout.md §MiniCalendar]
- [ ] CHK007 - MiniCalendar 点击日期后，日视图是否应立即跳转到该日期？这一交互链路是否在需求中明确定义？ [Gap, contracts/ui-layout.md §MiniCalendar onDateSelect]
- [ ] CHK008 - 三种视图模式下，数据查询的日期范围计算逻辑（日=当天 00:00-23:59、周=周一至周日、月=1日至月末）是否在 spec 或 data-model 中有明确要求？ [Completeness, data-model.md §视图模式数据范围]

## 需求清晰度 (Requirement Clarity)

- [ ] CHK009 - FR-017 中"时间盒以状态色块形式定位在对应时段"的"状态色块"颜色映射是否可度量（planned=? running=? paused=? ended=? logged=?）？ [Clarity, Spec §FR-017]
- [ ] CHK010 - SC-008 要求"视图切换后数据在1秒内完成刷新，视图平滑过渡"，"平滑过渡"是否可客观验证？是否需要定义具体的过渡效果类型（fade/slide/instant）？ [Measurability, Spec §SC-008]
- [ ] CHK011 - FR-018 要求"默认显示当天日期的时间盒数据"，"当天"的定义是否明确（用户本地时区 vs UTC vs 服务端时区）？ [Clarity, Spec §FR-018]
- [ ] CHK012 - "周"模式下的"当周"定义是否明确（ISO 周一至周日 vs 周日至周六）？ [Clarity, Gap]

## 需求一致性 (Requirement Consistency)

- [ ] CHK013 - spec.md US6 场景 1 描述"中间为小时时间轴"，contracts/ui-layout.md DayView 描述"中列：TimeboxTimeline（小时时间轴 06:00-23:00）"，时间轴范围（06:00-23:00）是否在 spec 中有出处？ [Consistency, Spec §US6-Acceptance 1 vs contracts]
- [ ] CHK014 - plan.md Project Structure 列出要删除的组件（view-mode-toggle.tsx, today-view.tsx），tasks.md T074 也要求删除这些组件。spec.md US5 场景 1 仍提到"今日模式/日历模式切换"，是否需要更新 US5 的描述以反映三栏视图？ [Consistency, Spec §US5 vs Plan/Tasks]
- [ ] CHK015 - data-model.md DateNav 属性表包含 `mobileHidden` 字段，但 spec §FR-019 和 contracts DateNavProps 中均无此字段定义，三处描述是否一致？ [Consistency, data-model.md vs contracts vs spec]
- [ ] CHK016 - tasks.md T071 描述 WeekView"从 calendar-view.tsx 拆出"，T072 描述 MonthView 类似。但 plan.md 描述 calendar-view.tsx 为"重构为 WeekView + MonthView 的共享样式提取（或删除）"。拆分策略是否已确定？ [Consistency, tasks.md T071/T072 vs plan.md]

## 接受标准质量 (Acceptance Criteria Quality)

- [ ] CHK017 - US6 场景 2-3 描述周/月视图的切换，但未提及切换后数据是否应自动刷新。fetchTimeboxSummariesByRange 的调用时机是否需要在接受标准中体现？ [Acceptance Criteria, Spec §US6]
- [ ] CHK018 - US6 场景 4-6 描述翻页行为，但未定义翻页后视图的滚动位置（是否回到顶部？保持当前位置？）。这一行为是否有隐含约定？ [Gap, Spec §US6-Acceptance 4-6]
- [ ] CHK019 - SC-007 要求"默认显示当天日视图"，但未定义"当天"跨越午夜后的行为（如用户在 23:59 创建了时间盒，0:01 查看时是否仍显示前一天？） [Edge Case, Spec §SC-007]

## 跨文档覆盖 (Cross-Document Coverage)

- [ ] CHK020 - contracts/ui-layout.md 定义了 DayViewProps、WeekViewProps、MonthViewProps，但 data-model.md 的 UI 组件层级仅列出组件名称，未重复接口定义。两处的 props 签名是否对齐（特别是 currentDate 类型、timeboxes 类型）？ [Consistency, contracts vs data-model]
- [ ] CHK021 - research.md R18 决定新增日期范围查询，tasks.md T067 实现此功能。plan.md 中未提到对 Repository 层的修改需求，fetchTimeboxSummariesByRange 是否涉及 Repository 层变更？如果涉及，是否违反 Constitution V (Repository Isolation)？ [Traceability, research.md R18 vs plan.md]
- [ ] CHK022 - plan.md Constitution Check 表中"V. Repository Isolation"标注为 PASS 且"不修改 Repository 层"。如果 T067 扩展了查询接口，是否需要重新评估此 Check 项？ [Consistency, plan.md §Constitution Check]
- [ ] CHK023 - tasks.md Phase 9 的并行机会列出"T068, T069, T071, T072 可并行"，但 T070 (DayView) 依赖 T069 (MiniCalendar)。DayView 还依赖 TimeboxTimeline（已完成）和 TimeboxList（已完成），这些已有依赖是否在任务描述中明确标注？ [Traceability, tasks.md]

## 边界与空状态 (Edge Cases & Empty States)

- [ ] CHK024 - 当选中日期没有时间盒时，DayView 三栏应如何展示？是否需要空状态提示？仅在 tasks.md T076 中提及，spec 中是否有对应要求？ [Coverage, Gap]
- [ ] CHK025 - 周视图/月视图中，跨日时间盒（如 22:00-01:00）的显示规则是否定义？react-big-calendar 的默认行为是否符合项目需求？ [Edge Case, Gap]
- [ ] CHK026 - MiniCalendar 的月份切换（如点击下月日期）是否在需求范围内？如果支持，是否需要新增翻页机制？ [Scope Boundary, Gap]
- [ ] CHK027 - DateNav 中用户快速连续点击翻页按钮时的防抖/节流行为是否有需求定义？ [Edge Case, Gap]

## 术语一致性 (Terminology Consistency)

- [ ] CHK028 - "DateViewMode"（types.ts/tasks.md）vs "DateViewMode"（plan.md）vs "DateViewMode"（contracts）— 类型名称是否在所有文档中统一？ [Consistency, Terminology]
- [ ] CHK029 - spec 使用"日/周/月"描述模式，tasks/plan 使用 "day/week/month" 代码值，contracts 使用 `DateViewMode = 'day' | 'week' | 'month'`。中英文映射是否有一致对应？ [Consistency, Terminology]
- [ ] CHK030 - "MiniCalendar" vs "小日历" vs "月历小日历" — 同一组件在不同文档中的称呼是否统一？ [Consistency, Terminology]

---

## Summary

| Category | Count |
|---|---|
| Requirement Completeness | 8 |
| Requirement Clarity | 4 |
| Requirement Consistency | 4 |
| Acceptance Criteria Quality | 3 |
| Cross-Document Coverage | 4 |
| Edge Cases & Empty States | 4 |
| Terminology Consistency | 3 |
| **Total** | **30** |

**Focus**: 三栏视图需求质量 + 跨文档一致性
**Depth**: Standard
**Scope**: Desktop only
