# Feature Specification: 习惯管理切片

**Feature Branch**: `003-habit-slice`
**Created**: 2026-05-09
**Status**: Draft
**Input**: User description: "初步完成时间盒管理切片后，开始新的功能习惯管理切片，包括习惯库管理、习惯模板、每日计划生成、AI 意图解析、streak 追踪"
**Design Ref**: `docs/superpowers/specs/2026-05-09-habit-management-design.md`

## User Scenarios & Testing

### User Story 1 - 习惯库管理 (Priority: P1)

用户需要定义个人每日习惯及其占用时间。习惯分为可追踪（如运动、复盘，需要打卡和连续天数统计）和纯占时（如用餐、睡眠，只标记时间占用）。每个习惯有默认时间、时间弹性窗口（最早/最晚可安排时间）、默认时长和最小时长。

**Why this priority**: 习惯库是整个习惯管理功能的基础，没有习惯数据就无法支持模板和每日计划生成。独立可用——用户创建习惯后即可在习惯库中查看和管理。

**Independent Test**: 用户可以在习惯库视图中创建、编辑、删除、暂停/恢复习惯，列表按时间排序显示，每个习惯卡片展示完整的时间窗口和分类标记。

**Acceptance Scenarios**:

1. **Given** 用户在习惯库页面, **When** 点击"新建习惯"并填写标题"晨跑"、默认时间 07:00、默认时长 30 分钟、选择"可追踪", **Then** 系统创建习惯，自动推断 earliestTime=06:30、latestEndTime=08:00、minDuration=15，习惯出现在列表中并标记为"可追踪"
2. **Given** 用户有一个"午餐"习惯, **When** 设置 trackable=false、defaultTime=12:00、defaultDuration=45, **Then** 习惯卡片显示"仅占时"标记，无 streak 和完成率显示
3. **Given** 用户编辑"阅读"习惯的 latestEndTime 从 23:00 改为 22:00, **When** 保存, **Then** 时间窗口可视化条更新，弹性范围收窄
4. **Given** 用户暂停一个 active 习惯, **When** 在习惯库中筛选"已暂停", **Then** 暂停的习惯出现在筛选结果中
5. **Given** 用户删除一个习惯, **When** 该习惯被一个或多个模板引用, **Then** 系统提示该习惯正在模板中使用，要求用户确认删除

---

### User Story 2 - 习惯模板与每日计划 (Priority: P2)

用户可以创建每日习惯模板（如"工作日"、"休息日"），将习惯库中的习惯组装到模板中。每个模板中的习惯可以覆盖默认时间和时长。每日计划时选择模板，系统自动生成时间盒草稿，用户确认后生效。

**Why this priority**: 模板将习惯从"数据"提升为"行动"，是一键生成每日计划的关键机制。依赖 P1 的习惯库数据。

**Independent Test**: 用户创建"工作日"模板，添加 3 个习惯，点击"用模板安排今天"后看到时间轴上的时间盒草稿，调整后确认生效。

**Acceptance Scenarios**:

1. **Given** 用户有 5 个 active 习惯, **When** 创建"工作日"模板并添加"晨跑"（覆盖时间 06:30）、"午餐"、"复盘", **Then** 模板卡片显示 3 个习惯、总时长 1h30m，晨跑显示橙色"覆盖"标记
2. **Given** 用户有一个"工作日"模板, **When** 在模板对比视图中查看, **Then** 时间纵向排列，习惯按时间分布在对应行，未占用时段显示"自由时间"
3. **Given** 用户选择"用工作日模板安排今天", **When** 系统生成时间盒草稿, **Then** 当日时间轴出现 3 个 draft 状态的时间盒，每个通过 timebox_habits 关联对应习惯
4. **Given** 模板生成的时间盒草稿与已有任务时间冲突, **When** 冲突检测运行, **Then** 系统显示冲突提示，用户可选择拖拽调整、压缩时长或跳过
5. **Given** 用户调整完时间盒草稿, **When** 点击确认, **Then** 所有 draft 时间盒变为 planned 状态，习惯本身状态不变

---

### User Story 3 - AI 意图驱动的习惯管理 (Priority: P3)

用户可以通过 AI 助手用自然语言创建习惯、管理模板和生成每日计划。AI 一步生成完整属性并自动推断缺失值，用户只需确认。

**Why this priority**: 增强 AI 交互体验，减少手动操作。依赖 P1 和 P2 的基础设施。

**Independent Test**: 用户在 AI 助手中输入"每天早上7点运动30分钟"，AI 自动创建习惯并展示完整属性供确认。

**Acceptance Scenarios**:

1. **Given** 用户在 AI 助手中输入"每天早上7点运动30分钟", **When** AI 解析意图, **Then** 生成 createHabit 结构化意图，自动推断 trackable=true、earliestTime=06:30、latestEndTime=08:00、minDuration=15
2. **Given** 用户输入"午餐12点，1小时", **When** AI 识别到"午餐"关键词, **Then** 自动推断 trackable=false（用餐类关键词）
3. **Given** 用户输入"创建一个工作日模板", **When** AI 解析, **Then** 生成 createTemplate 意图，applicableDays=[1,2,3,4,5]
4. **Given** 用户输入"用工作日模板安排今天的计划", **When** AI 解析, **Then** 触发 applyTemplate 流程，生成时间盒草稿供确认

---

### User Story 4 - 打卡追踪与 Streak 激励 (Priority: P4)

可追踪习惯支持每日打卡，系统自动计算连续天数（streak）、最长连续天数和 7 天完成率。达到里程碑时触发激励提醒，连续跳过时触发 streak 保护警告。

**Why this priority**: streak 机制是习惯养成的核心驱动力，但可在 P1-P3 稳定后再实现。

**Independent Test**: 用户对"晨跑"习惯打卡，streak 从 6 变为 7，系统显示里程碑成就提醒。

**Acceptance Scenarios**:

1. **Given** "晨跑"习惯 streak=6, **When** 用户今日打卡, **Then** streak 变为 7，系统触发 HabitStreakMilestone 事件，展示 7 天成就激励
2. **Given** "晨跑"习惯连续 3 天跳过, **When** streak > 3, **Then** 系统提升 HabitSkipped 事件权重到 80，显示 streak 保护提醒
3. **Given** "午餐"习惯 trackable=false, **When** 查看待打卡列表, **Then** 午餐不出现在待打卡列表中

---

### Edge Cases

- 睡眠习惯跨午夜（22:00-06:00），时间比较逻辑如何处理？
- 用户删除一个被模板引用的习惯时如何处理？
- 模板内习惯的时间覆盖超出原习惯的 earliestTime~latestEndTime 范围时如何校验？
- 同一天多次应用模板，是否覆盖之前的 draft 时间盒？
- 习惯的 minDuration 压缩后仍无法安排时，系统建议取消还是跳过？
- 一个时间盒同时绑定两个习惯（如午餐+听书）时，打卡如何处理？

## Requirements

### Functional Requirements

- **FR-001**: 系统 MUST 支持创建习惯，包含标题、描述、默认时间、时间弹性窗口（earliestTime/latestEndTime）、默认时长、最小时长、是否可追踪、频率类型
- **FR-002**: 系统 MUST 为习惯提供 `trackable` 属性，可追踪习惯支持打卡和 streak 统计，纯占时习惯仅标记时间占用
- **FR-003**: 系统 MUST 支持习惯的时间弹性窗口：每个习惯有 defaultTime（默认时间锚点）、earliestTime（最早可安排）、latestEndTime（最晚须结束）
- **FR-004**: 系统 MUST 支持习惯时长压缩：每个习惯有 defaultDuration（默认时长）和 minDuration（最小时长），压缩不低于 minDuration
- **FR-005**: 系统 MUST 支持习惯的完整生命周期：draft → active → suspended → archived，及对应的状态转换
- **FR-006**: 系统 MUST 支持创建习惯模板，模板引用习惯库中的习惯（外键关联），可选择性覆盖时间和时长
- **FR-007**: 系统 MUST 支持模板的适用日设置（applicableDays），指定模板适用于星期几
- **FR-008**: 系统 MUST 支持通过模板一键生成每日时间盒计划：遍历模板中的习惯，在当日时间轴创建 draft 时间盒，通过 timebox_habits 关联
- **FR-009**: 系统 MUST 在模板生成时间盒时进行冲突检测，包括习惯之间、习惯与已有任务/时间盒之间的时间重叠
- **FR-010**: 系统 MUST 允许用户在确认前调整时间盒草稿：拖拽调整时间、压缩时长、跳过某个习惯
- **FR-011**: 系统 MUST 支持 AI 自然语言创建习惯，一步生成完整属性并自动推断缺失值（earliestTime、latestEndTime、minDuration、trackable）
- **FR-012**: 系统 MUST 支持 AI 自然语言管理模板（创建模板、添加习惯到模板、用模板安排计划）
- **FR-013**: 系统 MUST 对可追踪习惯支持打卡，记录 completed/skipped/partial 状态和实际耗时
- **FR-014**: 系统 MUST 自动计算可追踪习惯的 streak（连续天数）、最长 streak 和 7 天完成率
- **FR-015**: 系统 MUST 在 streak 达到里程碑（7/14/30 天）时触发激励事件，在连续跳过超过阈值时触发保护警告
- **FR-016**: 系统处理跨午夜习惯时，当 latestEndTime < earliestTime 视为跨日（如睡眠 22:00-06:00）

### Key Entities

- **Habit（习惯）**: 核心实体，包含标题、时间模型（defaultTime/earliestTime/latestEndTime）、时长模型（defaultDuration/minDuration）、trackable 分类、频率、生命周期状态、streak 统计数据
- **HabitTemplate（习惯模板）**: 场景化的习惯编排方案，包含名称、适用日、引用的习惯列表
- **TemplateHabit（模板习惯关联）**: 模板与习惯的引用关系，支持时间和时长的选择性覆盖
- **HabitLog（打卡记录）**: 可追踪习惯的每日打卡数据，包含状态、实际耗时、备注

## Success Criteria

### Measurable Outcomes

- **SC-001**: 用户能在 30 秒内通过 UI 创建一个新习惯，系统自动补全所有时间弹性参数
- **SC-002**: 用户能在 10 秒内通过 AI 助手创建一个新习惯，只需一句自然语言描述并确认
- **SC-003**: 用户能在 5 秒内通过模板一键生成每日时间盒计划，冲突项少于 20% 的日常场景无需手动调整
- **SC-004**: 习惯库中的习惯能正确反映到模板视图和每日时间盒中，数据一致性 100%
- **SC-005**: 可追踪习惯的 streak 计算准确率 100%，里程碑提醒在打卡后即时触发
- **SC-006**: 模板视图与时间盒 timeline 方向一致（纵向时间轴），用户在两个视图间切换无认知负担

## Assumptions

- 现有时间盒管理系统已完成（002-timebox-slice），习惯通过 timebox_habits junction table 关联时间盒
- 现有数据库 schema 中 habits 表已定义，需要扩展字段和重命名部分字段
- 现有 USOM 类型中 Habit/HabitLog/HabitSummary 已定义，需要扩展
- habits domain 插件目录已存在但为空，需要实现四钩子接口
- 冲突仲裁矩阵中习惯相关规则（C-03 ~ C-07）已在方法论文档中定义，需要实现
- AI 意图解析基于现有 ai-parser.ts 框架扩展
- MVP 阶段仅 Web 端，移动端后续迭代
- Phase 1 先实现习惯库基础，Phase 2 实现模板和每日计划，Phase 3 实现 AI 和 streak
