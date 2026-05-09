# Tasks: 习惯管理切片

**Input**: Design documents from `/specs/003-habit-slice/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 每个任务包含 Given-When-Then 验收测试描述。

**Organization**: 按用户故事分组，每个故事可独立实现和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1, US2, US3, US4）
- 包含精确文件路径

## Path Conventions

- **项目结构**: `frontend/src/` 为源码根目录
- **数据库**: `frontend/src/lib/db/`
- **USOM**: `frontend/src/usom/`
- **域插件**: `frontend/src/domains/`
- **Nexus**: `frontend/src/nexus/`
- **UI 组件**: `frontend/src/components/`

---

## Phase 1: Setup (Schema & USOM 基础)

**Purpose**: 数据库 schema 变更和 USOM 类型扩展，所有后续任务的基础。

- [x] T001 扩展 habits 表 schema：新增 trackable/earliestTime/latestEndTime/minDuration 字段，重命名 scheduledTime→defaultTime、duration→defaultDuration，在 `frontend/src/lib/db/schema.ts`

  **验收**: Given 现有 habits 表有 scheduledTime/duration 字段, When 运行 db:generate 生成 migration, Then 生成包含 ALTER TABLE 的新 migration 文件，字段类型和默认值符合 data-model.md 定义

- [x] T002 [P] 新增 habit_templates 表 schema 定义，在 `frontend/src/lib/db/schema.ts`

  **验收**: Given schema.ts 文件, When 添加 habitTemplates 和 templateHabits 表定义, Then 包含 id/userId/name/description/icon/status/applicableDays/createdAt/updatedAt 字段，templateHabits 包含联合主键 (templateId, habitId) 和 timeOverride/durationOverride/sortOrder 字段

- [x] T003 [P] 扩展 USOM Habit 接口：新增 trackable/earliestTime/latestEndTime/minDuration 字段，重命名 scheduledTime→defaultTime、duration→defaultDuration，在 `frontend/src/usom/types/objects.ts`

  **验收**: Given 现有 Habit 接口有 scheduledTime/duration, When 修改接口, Then defaultTime/defaultDuration 替换旧字段，新增 4 个字段类型正确（trackable: boolean, 其余 string/DurationMinutes）

- [x] T004 [P] 新增 USOM HabitTemplate 和 TemplateHabitItem 接口定义，在 `frontend/src/usom/types/objects.ts`

  **验收**: Given objects.ts 文件, When 添加新接口, Then HabitTemplate 包含 id/name/description/icon/status/applicableDays/habits 数组，TemplateHabitItem 包含 habitId/sortOrder/timeOverride?/durationOverride?

- [x] T005 [P] 扩展 HabitSummary 接口：新增 trackable 和 defaultTime 字段（替换 scheduledTime），在 `frontend/src/usom/types/summaries.ts`

  **验收**: Given HabitSummary 接口, When 修改, Then 包含 trackable: boolean 和 defaultTime: string 字段

- [x] T006 生成并验证 Drizzle migration，运行 `npm run db:generate` 和 `npm run db:migrate`

  **验收**: Given schema.ts 已更新, When 运行 db:generate, Then 生成 0002_habit_enhancements.sql 文件；When 运行 db:migrate, Then 数据库表结构更新成功，现有数据保留且新字段按公式回填（earliestTime = defaultTime - 30min, latestEndTime = defaultTime + defaultDuration + 30min, minDuration = floor(defaultDuration * 0.5 / 5) * 5, trackable = true）。注意：data-model.md 中 Migration SQL 的回填值需与此公式一致，非简单赋值

---

## Phase 2: Foundational (Repository & Mappers)

**Purpose**: 数据访问层和映射逻辑，所有域插件和 UI 的前置依赖。

**⚠️ CRITICAL**: US1-US4 的实现均依赖此阶段完成。

- [x] T007 扩展 Habit DB↔USOM mapper：新增 trackable/earliestTime/latestEndTime/minDuration 映射，更新 defaultTime/defaultDuration 字段名，在 `frontend/src/lib/db/repositories/mappers.ts`

  **验收**: Given DB 行包含 default_time/earliest_time/latest_end_time/min_duration/trackable 字段, When 调用 toUSOMHabit mapper, Then 返回的 USOM Habit 对象字段名和类型正确；反向映射 toDBHabit 也正确

- [x] T008 实现 HabitRepository：findById/findByUserId/create/update/updateStatus/delete 方法，在 `frontend/src/lib/db/repositories/habit.repository.ts`

  **验收**:
  - Given 空 habits 表, When 调用 create({title:"晨跑",defaultTime:"07:00",defaultDuration:30,trackable:true,...}, userId), Then 返回完整 Habit 对象含 id 和所有字段
  - Given 已有 2 条习惯记录, When 调用 findByUserId(userId), Then 返回 2 条记录
  - Given 习惯 status=active, When 调用 updateStatus(id,"suspended",userId), Then 返回 status=suspended 且 suspendedAt 非空

- [x] T009 [P] 实现 HabitTemplateRepository：findById/findByUserId/create/update/delete/addHabit/removeHabit 方法，在 `frontend/src/lib/db/repositories/habit-template.repository.ts`

  **验收**:
  - Given 空表, When 调用 create({name:"工作日",applicableDays:[1,2,3,4,5]}, userId), Then 返回完整 HabitTemplate
  - Given 模板已创建, When 调用 addHabit(templateId, habitId, {timeOverride:"06:30"}, userId), Then templateHabits 包含新关联
  - Given 模板有 2 个习惯, When 调用 removeHabit(templateId, habitId, userId), Then 剩余 1 个习惯

- [x] T010 [P] 实现 HabitLogRepository：findByHabitAndDate/findByUserAndDate/save 方法，在 `frontend/src/lib/db/repositories/habit-log.repository.ts`

  **验收**: Given habitId 和 date, When 调用 save({habitId,date:"2026-05-09",status:"completed",actualDuration:28}, userId), Then 记录保存成功；When 再次 findByHabitAndDate(habitId,"2026-05-09",userId), Then 返回该记录

- [x] T011 更新 repositories/index.ts 导出新增的 Repository，在 `frontend/src/lib/db/repositories/index.ts`

  **验收**: Given index.ts 文件, When 添加导出, Then HabitRepository/HabitTemplateRepository/HabitLogRepository 均正确导出

---

## Phase 3: User Story 1 - 习惯库管理 (Priority: P1) 🎯 MVP

**Goal**: 用户可以在 UI 中创建、编辑、删除、暂停/恢复习惯，查看习惯库列表。

**Independent Test**: 打开习惯库页面，创建一个可追踪习惯和一个纯占时习惯，确认列表显示正确。

### Implementation for User Story 1

- [x] T012 [P] [US1] 创建 habits 域插件 manifest.yaml，声明 domainId/version/requiredFields/subscribedEvents，在 `frontend/src/domains/habits/manifest.yaml`

  **验收**: Given manifest.yaml 文件, When 检查内容, Then domainId="habits", subscribedEvents 包含 7 种事件类型（HabitCreated/HabitActivated/HabitSuspended/HabitArchived/HabitLogged/HabitSkipped/HabitStreakMilestone）

- [x] T013 [US1] 实现 habits 域插件骨架：onValidate 钩子（createHabit/logHabit 验证），在 `frontend/src/domains/habits/index.ts`

  **验收**:
  - Given createHabit 意图缺少 title, When 调用 onValidate, Then 返回 {valid:false, errors:["title 必填"]}
  - Given createHabit 意图 minDuration > defaultDuration, When 调用 onValidate, Then 返回验证失败
  - Given logHabit 意图 habitId 的 trackable=false, When 调用 onValidate, Then 返回验证失败
  - Given 合法的 createHabit 意图, When 调用 onValidate, Then 返回 {valid:true, errors:[]}

- [x] T014 [US1] 扩展 State Machine transitions：添加 habit 相关的状态转换（draft→active→suspended→archived），在 `frontend/src/nexus/core/state-machine/transitions.ts`

  **验收**: Given 习惯 status=draft, When 执行 activate 转换, Then status 变为 active；Given status=suspended, When 执行 reactivate, Then status 变为 active

- [x] T015 [US1] 扩展 Orchestrator：添加 habit 类型意图的分发逻辑（createHabit/updateHabit/logHabit），在 `frontend/src/nexus/orchestrator/index.ts`

  **验收**: Given createHabit 结构化意图, When Orchestrator 处理, Then 调用 HabitRepository.create 并触发 State Machine 转换和 HabitCreated 事件

- [x] T016 [P] [US1] 创建习惯卡片组件 habit-card.tsx：显示图标/标题/分类标记（可追踪/仅占时）/时间窗口条/streak/时长信息，在 `frontend/src/components/habit-card.tsx`

  **验收**: Given {title:"晨跑",trackable:true,defaultTime:"07:00",earliestTime:"06:00",latestEndTime:"09:00",defaultDuration:30,minDuration:15,streak:12} 的 Habit 对象, When 渲染组件, Then 显示"可追踪"标记、streak=12、时间窗口条(06:00~07:00~09:00)

- [x] T017 [P] [US1] 创建习惯库列表组件 habit-list.tsx：顶部操作栏/筛选标签/习惯卡片列表，在 `frontend/src/components/habit-list.tsx`

  **验收**: Given 3 个习惯（2 trackable + 1 non-trackable）, When 渲染列表, Then 显示"3 个习惯"计数和筛选标签；When 点击"仅占时"筛选, Then 只显示 1 个习惯

- [x] T018 [US1] 创建习惯表单组件 habit-form.tsx：新建/编辑习惯的表单，包含 title/defaultTime/earliestTime/latestEndTime/defaultDuration/minDuration/trackable/frequencyType 字段，在 `frontend/src/components/habit-form.tsx`

  **验收**:
  - Given 空表单, When 填写 title="午餐"、defaultTime="12:00"、defaultDuration=45、取消 trackable 勾选, Then 提交数据包含 trackable=false
  - Given 已填 defaultTime=07:00、defaultDuration=30, When 未手动填写 earliestTime/latestEndTime/minDuration, Then 提交时自动补全 earliestTime="06:30"、latestEndTime="08:00"、minDuration=15

- [x] T019 [US1] 创建习惯数据 hook use-habits.ts：封装 HabitRepository 调用和本地状态管理，在 `frontend/src/hooks/use-habits.ts`

  **验收**: Given hook 已挂载, When 调用 createHabit({...}), Then 自动刷新习惯列表；When 调用 deleteHabit(id), Then 列表移除该习惯

- [x] T020 [US1] 扩展 intent.ts Server Actions：添加 habit 相关的 Server Action（submitHabitIntent/deleteHabit/updateHabitStatus），在 `frontend/src/app/actions/intent.ts`

  **验收**: Given 客户端调用 submitHabitIntent({type:"createHabit",title:"晨跑",...}), When Server Action 执行, Then 通过 Orchestrator 处理意图并返回结果

- [x] T021 [US1] 在主页面添加习惯库视图路由/入口，在 `frontend/src/app/page.tsx`

  **验收**: Given 应用运行, When 导航到习惯库视图, Then 显示 habit-list 组件，包含新建按钮和筛选标签

**Checkpoint**: 用户可以在 UI 中完整管理习惯（创建、编辑、删除、暂停/恢复、筛选查看）。

---

## Phase 4: User Story 2 - 习惯模板与每日计划 (Priority: P2)

**Goal**: 用户可以创建/编辑习惯模板，通过模板一键生成每日时间盒计划，调整冲突后确认生效。

**Independent Test**: 创建"工作日"模板，添加 3 个习惯，点击"用模板安排今天"，确认时间轴出现 draft 时间盒。

### Implementation for User Story 2

- [x] T022 [P] [US2] 扩展 habits 域插件 onValidate：添加 createTemplate/addHabitToTemplate/removeHabitFromTemplate/applyTemplate 验证逻辑，在 `frontend/src/domains/habits/index.ts`

  **验收**:
  - Given createTemplate 意图 applicableDays 为空数组, When 调用 onValidate, Then 返回验证失败
  - Given addHabitToTemplate 意图 timeOverride 超出习惯 earliestTime~latestEndTime, When 调用 onValidate, Then 返回验证失败
  - Given applyTemplate 意图当日星期不在 applicableDays 中, When 调用 onValidate, Then 返回验证失败

- [x] T023 [P] [US2] 实现模板生成逻辑 applyTemplate：遍历 TemplateHabit 生成 draft 时间盒 + timebox_habits 关联，在 `frontend/src/nexus/orchestrator/index.ts`

  **验收**: Given 工作日模板含 3 个习惯（晨跑 timeOverride=06:30, 午餐, 复盘）, When 执行 applyTemplate, Then 生成 3 个 draft 时间盒，每个通过 timebox_habits 关联到对应习惯

- [x] T024 [US2] 实现模板应用幂等性检查：同一天对同一模板重复调用 applyTemplate 时，拒绝并提示"今日已使用该模板生成计划"，在 `frontend/src/nexus/orchestrator/index.ts`

  **验收**:
  - Given 今日已用"工作日"模板生成了时间盒草稿, When 再次调用 applyTemplate(同一模板, 同一日期), Then 返回错误提示"今日已使用该模板生成计划，如需调整请直接编辑时间盒"
  - Given 今日已用"工作日"模板, When 调用 applyTemplate("休息日"模板, 同一日期), Then 正常生成（不同模板允许）

- [x] T026 [US2] 注册习惯冲突规则到 Rule Engine，在 `frontend/src/nexus/core/rule-engine/index.ts`

  **验收**: Given Rule Engine 已初始化, When 习惯相关意图经过规则检查, Then habit-conflict 规则被正确调用

- [x] T027 [P] [US2] 创建模板卡片组件 habit-template-card.tsx：显示模板名称/适用日/习惯数/迷你时间轴，在 `frontend/src/components/habit-template-card.tsx`

  **验收**: Given 工作日模板含 3 个习惯总计 90min, When 渲染组件, Then 显示名称"工作日"、适用日"周一至周五"、迷你时间轴含 3 个色块

- [x] T028 [US2] 创建模板对比视图组件 habit-template-view.tsx：纵向时间轴 + 横向模板列，显示习惯块和覆盖标记，在 `frontend/src/components/habit-template-view.tsx`

  **验收**:
  - Given 工作日和休息日两个模板, When 渲染对比视图, Then 左侧为时间刻度，两列分别为两个模板
  - Given 工作日模板中晨跑 timeOverride=06:30, When 渲染, Then 该习惯块显示橙色"覆盖: +30min"标记
  - Given 09:00-12:00 无习惯, When 渲染, Then 显示"— 自由时间 —"

- [x] T029 [US2] 创建时间盒草稿调整组件：支持拖拽调整时间（earliestTime~latestEndTime 范围内）、压缩时长（不低于 minDuration）、跳过习惯（移除该时间盒），在 `frontend/src/components/timebox-draft-editor.tsx`

  **验收**:
  - Given draft 时间盒对应习惯 earliestTime=06:00/latestEndTime=09:00, When 拖拽到 08:00, Then 时间更新成功
  - Given draft 时间盒对应习惯 minDuration=15, When 压缩时长到 10, Then 拒绝并提示"低于最小时长 15 分钟"
  - Given 用户点击"跳过", When 确认, Then 移除该 draft 时间盒和 timebox_habits 关联

- [x] T030 [US2] 创建模板表单组件（新建/编辑模板，添加/移除习惯，设置覆盖值），在 `frontend/src/components/habit-template-form.tsx`

  **验收**: Given 用户选择"晨跑"习惯添加到模板, When 设置 timeOverride=06:30, Then 表单提交数据包含 {habitId, timeOverride:"06:30"}

- [x] T031 [US2] 扩展 Server Actions：添加模板相关 Server Action（submitTemplateIntent/addHabitToTemplate/removeHabitFromTemplate/applyTemplate），在 `frontend/src/app/actions/intent.ts`

  **验收**: Given 客户端调用 applyTemplate({templateId,date:"2026-05-09"}), When Server Action 执行, Then 返回 ApplyTemplateResult 含 generatedTimeboxes 和 conflicts

- [x] T032 [US2] 在主页面添加模板管理视图入口，在 `frontend/src/app/page.tsx`

  **验收**: Given 应用运行, When 切换到模板视图, Then 显示 habit-template-view 组件；When 点击"用模板安排今天", Then 时间盒视图出现 draft 时间盒

**Checkpoint**: 用户可以创建模板、通过模板一键生成每日时间盒计划、查看冲突、调整并确认。同一天重复应用同一模板会被拒绝。

---

## Phase 5: User Story 3 - AI 意图驱动的习惯管理 (Priority: P3)

**Goal**: 用户可以通过自然语言创建习惯、管理模板和生成每日计划。

**Independent Test**: 在 AI 助手中输入"每天早上7点运动30分钟"，确认 AI 正确解析并创建习惯。

### Implementation for User Story 3

- [x] T033 [US3] 扩展 AI Parser habit 类型意图解析模板：支持 createHabit/createTemplate/addHabitToTemplate/applyTemplate 解析，在 `frontend/src/nexus/core/intent-engine/ai-parser.ts`

  **验收**:
  - Given 输入"每天早上7点运动30分钟", When AI 解析, Then 生成 {type:"createHabit", title:"运动", defaultTime:"07:00", defaultDuration:30, trackable:true, frequencyType:"daily"}
  - Given 输入"午餐12点，1小时", When AI 解析, Then trackable=false（用餐关键词）
  - Given 输入"工作日晚上10点复盘15分钟", When AI 解析, Then frequencyType:"weekly", daysOfWeek:[1,2,3,4,5]

- [x] T034 [US3] 实现 AI 自动推断默认值逻辑：earliestTime/latestEndTime/minDuration 的计算函数，在 `frontend/src/nexus/core/intent-engine/ai-parser.ts`

  **验收**:
  - Given defaultTime="07:00", defaultDuration=30, When 推断, Then earliestTime="06:30", latestEndTime="08:00", minDuration=15
  - Given defaultTime="12:00", defaultDuration=60, When 推断, Then minDuration=floor(60*0.5/5)*5=30
  - Given 标题含"午餐"/"晚餐"/"睡眠"关键词, When 推断, Then trackable=false

- [x] T035 [US3] 添加模板相关 AI 意图解析：createTemplate/addHabitToTemplate/applyTemplate，在 `frontend/src/nexus/core/intent-engine/ai-parser.ts`

  **验收**:
  - Given 输入"创建一个工作日模板", When 解析, Then {type:"createTemplate", name:"工作日", applicableDays:[1,2,3,4,5]}
  - Given 输入"把运动加到工作日模板，时间改成6点半", When 解析, Then {type:"addHabitToTemplate", templateName:"工作日", habitTitle:"运动", timeOverride:"06:30"}
  - Given 输入"用工作日模板安排今天的计划", When 解析, Then {type:"applyTemplate", templateName:"工作日", date:"today"}

**Checkpoint**: 用户可以通过 AI 自然语言完成习惯创建、模板管理和每日计划生成。

---

## Phase 6: User Story 4 - 打卡追踪与 Streak 激励 (Priority: P4)

**Goal**: 可追踪习惯支持打卡，系统自动计算 streak 并提供里程碑激励和跳过警告。

**Independent Test**: 对"晨跑"连续打卡 7 天，确认 streak 从 0 增长到 7 并触发里程碑提醒。

### Implementation for User Story 4

- [x] T036 [US4] 扩展 habits 域插件 onEvent：实现 HabitLogged/HabitSkipped/HabitStreakMilestone 事件处理，在 `frontend/src/domains/habits/index.ts`

  **验收**:
  - Given HabitLogged 事件, When streak=6, Then 返回 {suggestions:[{weight:40, ...}]} (静默更新)
  - Given HabitSkipped 事件且 streak=5, When onEvent 处理, Then 返回 {suggestions:[{weight:80, text:"streak 保护提醒"}]}
  - Given HabitStreakMilestone(streak=7) 事件, When onEvent 处理, Then 返回 {suggestions:[{weight:90, text:"7天连续成就"}]}

- [x] T037 [US4] 扩展 habits 域插件 onActionSurfaceRequest：返回 log_habit/streak_milestone_hint/habit_risk_warning 候选，在 `frontend/src/domains/habits/index.ts`

  **验收**:
  - Given 有 2 个待打卡的 trackable 习惯, When onActionSurfaceRequest 调用, Then 返回 2 个 log_habit ActionCandidate (weight=70)
  - Given streak=6（距 7 天里程碑 1 天）, When onActionSurfaceRequest 调用, Then 返回 streak_milestone_hint (weight=85)

- [x] T038 [US4] 实现 streak 计算逻辑：打卡时自动更新 streak/longestStreak/completionRate7d，在 `frontend/src/lib/db/repositories/habit.repository.ts`

  **验收**:
  - Given 昨日已打卡且 streak=5, When 今日打卡, Then streak 更新为 6, longestStreak=max(6, longestStreak)
  - Given 昨日未打卡且 streak=3, When 今日打卡, Then streak 重置为 1
  - Given 近 7 天打卡 5 次, When 计算 completionRate7d, Then 值为 5/7≈0.71

- [x] T039 [US4] 创建打卡 UI 组件：今日打卡视图，显示待打卡习惯列表和打卡/跳过按钮，在 `frontend/src/components/habit-checkin.tsx`

  **验收**:
  - Given 有 3 个 trackable 习惯（2 个未打卡、1 个已打卡）, When 渲染组件, Then 显示 2 个待打卡项和 1 个已完成标记
  - Given 用户点击"完成"打卡按钮, When 提交, Then 习惯标记为已打卡，streak 更新

- [x] T040 [US4] 扩展 habit-card.tsx：trackable 习惯显示打卡按钮和 streak 徽章，在 `frontend/src/components/habit-card.tsx`

  **验收**: Given trackable=true 且 streak=12 的习惯, When 渲染卡片, Then 显示 streak=12 徽章和今日打卡状态

**Checkpoint**: 可追踪习惯支持完整打卡流程，streak 自动计算，里程碑激励和跳过警告正常工作。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的改进和最终验证。

- [x] T041 [P] 验证跨午夜时间比较逻辑：确认睡眠习惯(22:00-06:00)在冲突检测和时间轴渲染中正确处理，在 `frontend/src/lib/db/repositories/mappers.ts` 和 `frontend/src/components/habit-template-view.tsx`

  **验收**: Given 睡眠习惯 earliestTime=22:00, latestEndTime=06:00, When 执行时间比较, Then 22:00 < 06:00+1440 成立；When 渲染时间轴, Then 睡眠块跨越午夜正确显示

- [x] T042 [P] 验证习惯删除级联：删除被模板引用的习惯时，系统正确处理 RESTRICT 约束，在 `frontend/src/lib/db/schema.ts` 和 `frontend/src/app/actions/intent.ts`

  **验收**: Given 习惯被"工作日"模板引用, When 尝试删除习惯, Then 系统提示"该习惯正在模板'工作日'中使用"并阻止删除（RESTRICT）

- [x] T043 验证端到端数据一致性：创建习惯→添加到模板→生成每日计划→确认生效→打卡，全链路数据正确无误，在 `frontend/src/`

  **验收**: Given 创建"晨跑"习惯(defaultTime=07:00, trackable=true) → 添加到"工作日"模板(timeOverride=06:30) → 用模板生成今日计划, When 全流程执行, Then 时间盒 startTime=06:30（使用覆盖值）、timebox_habits 关联正确、打卡后 streak=1、HabitLog 记录的 actualDuration 正确

- [x] T044 运行 quickstart.md 中的所有验证步骤，确认端到端功能正常，在 `frontend/src/`

  **验收**: Given quickstart.md Phase 1~3 的所有步骤, When 逐一执行, Then 全部验证通过

- [ ] T045 推送到远程仓库并推送 main 分支

  **验收**: Given 所有任务完成, When git push, Then 代码成功推送到 Gitee 远程仓库

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 — 阻塞所有 User Story
- **US1 (Phase 3)**: 依赖 Phase 2 — MVP 核心功能
- **US2 (Phase 4)**: 依赖 Phase 3（需要习惯数据）— 模板基于习惯库
- **US3 (Phase 5)**: 依赖 Phase 3（需要 Intent Engine 集成点）— AI 增强
- **US4 (Phase 6)**: 依赖 Phase 3（需要打卡 UI）— Streak 激励
- **Polish (Phase 7)**: 依赖全部 User Story 完成

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Repo/Mapper) → US1 (习惯库) ─┬→ US2 (模板)
                                                          ├→ US3 (AI)
                                                          └→ US4 (Streak)
```

- **US2** 依赖 US1（模板引用习惯库中的习惯）
- **US3** 依赖 US1（AI 解析需要 Intent Engine 集成点）
- **US4** 依赖 US1（打卡基于习惯库的 trackable 属性）
- **US3 和 US4 可并行**（不同文件）

### Parallel Opportunities

- T001/T002/T003/T004/T005 可并行（不同文件）
- T007/T008 完成后 T009/T010/T011 可并行
- T016/T017/T018 可并行（不同 UI 组件）
- T031/T032/T033 可并行（同一文件但独立功能，建议顺序执行）
- US3 和 US4 可并行开发

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T011)
3. Complete Phase 3: User Story 1 (T012-T021)
4. **STOP and VALIDATE**: 习惯库 CRUD + UI 完整可用
5. 推送并验证

### Incremental Delivery

1. Setup + Foundational → 数据层就绪
2. US1 → 习惯库独立可用（MVP）
3. US2 → 模板和每日计划
4. US3 → AI 自然语言增强
5. US4 → 打卡和 Streak 激励

---

## Notes

- 共 45 个任务，预估总工时 6-9 小时
- MVP（Phase 1-3）约 21 个任务，预估 3-4 小时
- 每个 User Story 完成后可独立演示
- US2/US3/US4 的 UI 任务建议在 US1 的 UI 验证通过后再开始
- F1 修复：T006 验收标准明确要求 migration 回填使用计算公式（非简单赋值）
- F2 修复：T024 新增模板应用幂等性检查（同天同模板拒绝重复生成）
- F3 修复：T043 新增端到端数据一致性验证任务（习惯→模板→时间盒→打卡全链路）
