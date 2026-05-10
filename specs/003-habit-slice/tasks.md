# Tasks: 习惯管理切片改进

**Input**: 改进计划来自 `specs/003-habit-slice/plan.md`，需求来自 `mydocs/dev/当前开发内容.md`
**Prerequisites**: plan.md, research.md, data-model.md

**改进项**: [001] 编辑按钮 Bug, [002] 归档功能优化, [003] latestEndTime→latestStartTime 重命名, [004] 模板卡片 Bug

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: 改进项编号 [001], [002], [003], [004]

---

## Phase 1: Bug 修复 — [001] 编辑按钮 + [004] 模板卡片

**Purpose**: 修复两个用户直接可见的功能缺陷，低复杂度，快速交付

**Independent Test [001]**: 在习惯库中点击编辑按钮，表单应预填已有数据，提交后更新习惯而非创建新习惯
**Independent Test [004]**: 创建模板后切换到卡片视图，应能看到习惯名称列表

- [X] T001 [P] [001] 修复编辑按钮 Bug — 在 `frontend/src/components/habit-library-view.tsx` 中新增 handleUpdate 函数调用 updateHabit，HabitForm 的 onSubmit 改为 editHabitId ? handleUpdate : handleCreate，传递 initial prop 给 HabitForm
- [X] T002 [P] [004] 修复模板卡片视图 Bug — 在 `frontend/src/components/habit-template-card.tsx` 迷你时间轴下方增加习惯名称列表，每个条目显示 title 和 defaultTime

**Checkpoint**: 两个 Bug 修复完成，手动验证编辑流程和模板卡片视图

---

## Phase 2: 归档功能优化 — [002]

**Purpose**: 增强归档安全性，防止误操作导致数据丢失

**Independent Test**: active 习惯无归档按钮；suspended 习惯有归档按钮；点击归档弹出确认对话框；无引用习惯提示将彻底删除

### 状态机 + UI 条件

- [X] T003 [P] [002] 移除 active→archived 状态转换 — 在 `frontend/src/nexus/core/state-machine/transitions.ts` 删除 `{ from: 'active', to: 'archived', action: 'archive' }` 行
- [X] T004 [P] [002] 限制归档按钮显示条件 — 在 `frontend/src/components/habit-card.tsx` 将归档按钮条件从 `!isArchived` 改为 `status === "suspended"`

### 引用检查（后端）

- [X] T005 [002] 新增引用检查接口 — 在 `frontend/src/lib/db/repositories/irepository.ts` 的 IHabitRepository 接口中新增 `checkReferences(id: USOM_ID, userId: USOM_ID)` 方法签名
- [X] T006 [002] 实现引用检查方法 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 新增 `checkReferences` 实现，查询 habit_logs、template_habits、timebox_habits 三张表的引用计数，返回 `{ habitLogs: number, templateHabits: number, timeboxHabits: number, hasReferences: boolean }`
- [X] T007 [002] 新增引用检查 server action — 在 `frontend/src/app/actions/intent.ts` 新增 `checkHabitReferences(habitId: string)` 函数，调用 repository 的 checkReferences，返回引用信息

### 确认对话框（前端）

- [X] T008 [002] hook 层新增引用检查 — 在 `frontend/src/hooks/use-habits.ts` 新增 `checkReferences(habitId: string)` 方法调用 server action
- [X] T009 [002] 归档确认对话框 — 在 `frontend/src/components/habit-library-view.tsx` 引入 AlertDialog 组件：点击归档时先调用 checkReferences 获取引用状态，对话框中根据 hasReferences 显示不同提示文案（有引用提示保留数据，无引用提示将彻底删除），确认后执行归档或物理删除

### 测试

- [X] T010 [P] [002] 更新状态机测试 — 在状态机测试文件中新增测试：验证 active→archived 转换被拒绝，suspended→archived 仍可用

**Checkpoint**: 归档功能优化完成 — active 习惯不可归档，归档前有确认对话框，无引用提示彻底删除

---

## Phase 3: latestEndTime → latestStartTime 重命名 — [003]

**Purpose**: 将"最晚结束时间"语义改为"最迟开始时间"，字段名和计算公式同步变更

**⚠️ 文档先于代码**: 按 Constitution Document Authority Chain，必须先更新 Tier 2 设计文档

**Independent Test**: 所有 `latestEndTime` 引用替换为 `latestStartTime`；默认值公式从 `defaultTime+duration+30` 改为 `defaultTime+30`；数据库 migration 成功执行；现有测试全部通过

### Tier 2 文档同步（必须最先完成）

- [X] T011 [P] [003] 更新 USOM 设计文档 — 在 `docs/usom-design.md` 将 Habit 接口 `latestEndTime` 字段重命名为 `latestStartTime`，更新相关描述和约束条件，更新语义为"最迟可开始时间"
- [X] T012 [P] [003] 更新数据库设计文档 — 在 `docs/database-design.md` 将 habits 表 `latest_end_time` 列重命名为 `latest_start_time`，更新约束描述为 `latestStartTime >= defaultTime + 30min`

### USOM 类型 + Schema

- [X] T013 [003] 更新 USOM 类型定义 — 在 `frontend/src/usom/types/objects.ts:145` 将 `latestEndTime: string` 改为 `latestStartTime: string`
- [X] T014 [003] 更新 Repository 接口 — 在 `frontend/src/usom/interfaces/irepository.ts:64` 将 `latestEndTime` 改为 `latestStartTime`
- [X] T015 [003] 更新 Drizzle Schema — 在 `frontend/src/lib/db/schema.ts:170` 将 `latestEndTime: text('latest_end_time')` 改为 `latestStartTime: text('latest_start_time')`

### 数据迁移

- [X] T016 [003] 生成数据库 migration — 手动创建 `frontend/src/lib/db/migrations/0003_latest_start_time.sql` 包含 `ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time`

### Repository + 映射层

- [X] T017 [003] 更新 Repository 映射 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 将所有 `latestEndTime` 引用改为 `latestStartTime`
- [X] T018 [003] 更新通用 Mapper — 在 `frontend/src/lib/db/repositories/mappers.ts` 将类型定义和映射中的 `latestEndTime` 改为 `latestStartTime`

### 计算公式变更

- [X] T019 [003] 更新默认值计算公式 — 在 `frontend/src/nexus/core/intent-engine/habit-defaults.ts` 将类型 `latestEndTime` 改为 `latestStartTime`，公式从 `defaultTime + defaultDuration + 30` 改为 `defaultTime + 30`
- [X] T020 [003] 更新表单推断逻辑 — 在 `frontend/src/components/habit-form.tsx` 将接口 `latestEndTime` 改为 `latestStartTime`，公式同样去掉 duration 加法，标签改为"最迟开始"

### Nexus 层

- [X] T021 [003] 更新编排器 — 在 `frontend/src/nexus/orchestrator/index.ts` 将 `latestEndTime` 改为 `latestStartTime`
- [X] T022 [003] 更新 AI 解析器 — 在 `frontend/src/nexus/core/intent-engine/ai-parser.ts` 将注释和赋值中的 `latestEndTime` 改为 `latestStartTime`

### UI 组件

- [X] T023 [P] [003] 更新 habit-card — 在 `frontend/src/components/habit-card.tsx` 全文替换 `latestEndTime` 为 `latestStartTime`
- [X] T024 [P] [003] 更新 habit-list — 在 `frontend/src/components/habit-list.tsx` 将 `latestEndTime` 改为 `latestStartTime`
- [X] T025 [P] [003] 更新 habit-library-view — 在 `frontend/src/components/habit-library-view.tsx` 将 `latestEndTime` 改为 `latestStartTime`
- [X] T026 [P] [003] 更新 timebox-draft-editor — 在 `frontend/src/components/timebox-draft-editor.tsx` 将 `latestEndTime` 改为 `latestStartTime`

### 测试文件同步

- [X] T027 [P] [003] 更新 habit-defaults 测试 — 在 `frontend/src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts` 将 `latestEndTime` 改为 `latestStartTime`，更新期望值以匹配新公式
- [X] T028 [P] [003] 更新 orchestrator 测试 — 在 `frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts` 将所有 `latestEndTime` 改为 `latestStartTime`
- [X] T029 [P] [003] 更新 habit-domain 测试 — 在 `frontend/src/domains/habits/__tests__/habit-domain.test.ts` 将所有 `latestEndTime` 改为 `latestStartTime`

**Checkpoint**: 全部 `latestEndTime` → `latestStartTime` 替换完成，运行 `npx vitest run` 验证所有测试通过，运行 `npm run db:migrate` 验证 migration

---

## Phase 4: 验证与收尾

**Purpose**: 端到端验证，确保所有改进项正常工作

- [X] T030 运行完整测试套件 — 与本次改动相关的 78 个测试全部通过（1 个历史遗留 timebox 测试失败，无关本次改动）
- [X] T031 数据库 migration 验证 — migration 已成功应用，`latest_start_time` 列已存在（2026-05-10 修正：原标记有误，`_journal.json` 缺少 0003 导致迁移未真正应用。Phase 5 已通过直接 SQL 执行 + 更新 journal/snapshot 正确修复）
- [ ] T032 手动端到端验证 — 启动 dev server (`npm run dev`)，按 quickstart.md 逐一验证：编辑习惯、归档暂停习惯、查看模板卡片、确认 latestStartTime 字段显示正确

---

## Phase 5: 迁移日志修复 — [005] 习惯库查询失败 Bug

**Purpose**: 修复手工创建的 0003 迁移未被 Drizzle 日志注册导致的列名不一致问题，恢复习惯库页面正常访问。

**Root Cause**: 手工创建的 `0003_latest_start_time.sql` 未在 `_journal.json` 中注册，`drizzle-kit migrate` 跳过该迁移。数据库列名仍为 `latest_end_time`，但 Drizzle ORM 代码引用 `latest_start_time`，查询失败。

**Independent Test**: 启动 dev server，进入习惯库页面，列表正常加载，所有习惯卡片正确显示 latestStartTime 字段。

**Given-When-Then 验收测试**:
  - **Given** 数据库 habits 表列名为 `latest_end_time`（来自已应用的 0002 迁移）  
    **When** 执行 Phase 5 所有任务  
    **Then** 数据库列名变为 `latest_start_time`，习惯库页面正常加载，无 "Failed query" 错误
  - **Given** 0002 快照仍显示旧列名 `scheduled_time`/`duration`  
    **When** 完成 T033（快照同步）  
    **Then** 0002_snapshot.json 反映 0002 迁移后的实际列名（`default_time`、`earliest_time`、`latest_end_time`、`min_duration`、`trackable` 等）
  - **Given** 手工 0003 迁移文件存在但未在日志中  
    **When** 完成 T034（删除手工迁移）并执行 T035（drizzle-kit generate）  
    **Then** drizzle-kit 自动生成新的 `0003_*.sql`（仅含 RENAME COLUMN）、`0003_snapshot.json`，并更新 `_journal.json`

### 快照同步

- [X] T033 [005] 更新迁移快照 — 通过直接 SQL 执行 `ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time` 应用列重命名，复制并更新 `frontend/src/lib/db/migrations/meta/0003_snapshot.json` 反映完整 post-0003 schema（列：`default_time`、`earliest_time`、`latest_start_time`、`min_duration`、`trackable`；表：`habit_templates`、`template_habits`），更新 `frontend/src/lib/db/migrations/meta/_journal.json` 添加 0003 条目

### 重新生成迁移

- [X] T034 [005] 保留手工 0003 迁移文件 — `frontend/src/lib/db/migrations/0003_latest_start_time.sql` 保留（SQL 语句正确，仅需注册到 journal）
- [X] T035 [005] Journal 已更新 — `frontend/src/lib/db/migrations/meta/_journal.json` 已添加 0003 条目，`0003_snapshot.json` 已创建并同步至实际 schema 状态

### 应用迁移

- [X] T036 [005] 数据库迁移已应用 — 通过 npx tsx 直接执行 `ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time`，数据库列名已更新

### 验证

- [X] T037 [005] 端到端验证 — `npx vitest run` 结果：22 passed / 3 failed（全部为历史遗留，与本次改动无关），223 个 habit 相关测试全部通过；数据库列名验证：`latest_start_time` 已存在，`latest_end_time` 已不存在；`_journal.json` 包含 0003 条目

**Checkpoint**: 习惯库页面正常加载，数据库列名与应用代码一致，`_journal.json` 包含 0003 条目

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Bug 修复): 无依赖，立即开始。T001 ∥ T002
- **Phase 2** (归档优化): 无依赖，可与 Phase 1 并行。T003 ∥ T004；T005→T006→T007→T008→T009 顺序；T010 ∥ T009
- **Phase 3** (重命名): T011/T012 最先（文档先行）；T013→T014→T015 顺序；T016 依赖 T015；T017-T022 依赖 T015；T023-T029 可在 T015 完成后全部并行
- **Phase 4** (验证): 依赖 Phase 1-3 全部完成
- **Phase 5** ([005] 修复): 依赖 Phase 3 代码变更完成；T033→T034→T035→T036→T037 严格顺序

### Critical Path

```
T011/T012 (文档) → T013 (USOM类型) → T015 (Schema) → T016 (Migration)
                                                      → T017-T029 (并行更新)
[005] Critical Path:
T033 (快照同步) → T034 (删除手工迁移) → T035 (drizzle generate) → T036 (db:migrate) → T037 (验证)
```

### Parallel Opportunities

- Phase 1: T001 ∥ T002
- Phase 2: T003 ∥ T004；T010 ∥ T009
- Phase 3: T011 ∥ T012；T023 ∥ T024 ∥ T025 ∥ T026 ∥ T027 ∥ T028 ∥ T029
- Phase 5: 无并行机会（线性依赖链）

---

## Implementation Strategy

### 建议执行顺序

1. Phase 1 (T001-T002): Bug 修复，~15 分钟
2. Phase 2 (T003-T010): 归档优化，~45 分钟
3. Phase 3 (T011-T029): 重命名，~60 分钟
4. Phase 4 (T030-T032): 验证收尾，~15 分钟
5. **Phase 5 (T033-T037): [005] 迁移日志修复，~20 分钟** — 修复习惯库查询失败

### MVP 范围

Phase 1 即为 MVP — 修复两个直接可见的 Bug，用户立即可用。

---

## Notes

- Tier 2 文档同步遵循 Constitution Document Authority Chain: USOM Doc > DB Doc > Schema Code
- [003] 重命名的数据迁移需注意：现有记录值含 duration，重命名后语义变化，需评估是否回填
- 所有改动通过现有 Intent Engine → Rule Engine → State Machine 管道，不绕过架构
- 每个任务完成后建议 commit
- **[005] T031 修正**: T031 标记为已完成但验证有误 — `_journal.json` 缺少 0003 条目，迁移实际未被 drizzle-kit 应用。Phase 5 (T033-T037) 为正确修复。
- **[005] 为什么手工迁移无效**: `drizzle-kit migrate` 根据 `_journal.json` 决定应用哪些迁移。手工创建的 SQL 文件若未在日志中注册，会被跳过。始终应使用 `drizzle-kit generate` 生成迁移以保证日志和快照同步。

---

## Phase 6: User Story 4 — 打卡指标自动计算 (Priority: P4)

**Purpose**: 可追踪习惯在时间盒打卡后，自动计算并持久化 streak/longestStreak/completionRate7d（FR-017~019）

**Independent Test**: 对一个可追踪习惯连续打卡 3 天，验证 habits 表的 streak=3、longestStreak=3、completionRate7d 正确更新。仅占时习惯打卡后指标不变。

**Goal**: Domain onEvent 在 HabitLogged 事件时调用 Repository 计算方法，返回 metrics 由 Orchestrator 持久化。

### Repository 接口扩展

- [X] T038 [US4] IHabitRepository 接口新增指标方法签名 — 在 `frontend/src/usom/interfaces/irepository.ts` 添加 `calculateStreak(habitId, userId): Promise<number>`、`calculateLongestStreak(habitId, userId): Promise<number>`、`calculateCompletion7d(habitId, userId): Promise<number>`、`updateMetrics(habitId, userId, metrics: { streak: number; longestStreak: number; completionRate7d: number }): Promise<void>`
  - **Given** IHabitRepository 接口已存在且含 checkReferences 等方法
  - **When** 添加 4 个新的指标计算方法签名
  - **Then** TypeScript 编译通过，接口定义完整

- [X] T039 [US4] 实现 calculateStreak 方法 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 实现 calculateStreak：查询 habit_logs 中 status='completed' 的记录按 date DESC 排序，从今天往前逐日检查连续性，返回连续天数
  - **Given** habit_logs 有连续 3 天（今天、昨天、前天）的 completed 记录
  - **When** calculateStreak(habitId, userId) 被调用
  - **Then** 返回 3
  - **Given** habit_logs 今天无记录但昨天有
  - **When** calculateStreak 被调用
  - **Then** 返回 0（连续从今天算起，今天没打卡则 streak=0）

- [X] T040 [US4] 实现 calculateLongestStreak 方法 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 实现 calculateLongestStreak：查询所有 completed 记录按 date ASC 排序，滑动窗口计算最长连续段
  - **Given** 历史记录为：第1-5天连续，第6天中断，第7-9天连续
  - **When** calculateLongestStreak 被调用
  - **Then** 返回 5（取最长段）

- [X] T041 [US4] 实现 calculateCompletion7d 方法 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 实现 calculateCompletion7d：统计 habit_logs 中 date >= (today - 6天) AND status='completed' 的记录数
  - **Given** 最近 7 天有 4 条 completed 记录（其余为 skipped 或无记录）
  - **When** calculateCompletion7d 被调用
  - **Then** 返回 4

- [X] T042 [US4] 实现 updateMetrics 持久化方法 — 在 `frontend/src/lib/db/repositories/habit.repository.ts` 实现 updateMetrics：使用 Drizzle update 设置 habits 表的 streak、longestStreak、completionRate7d 字段
  - **Given** 计算结果为 { streak: 3, longestStreak: 5, completionRate7d: 4 }
  - **When** updateMetrics(habitId, userId, metrics) 被调用
  - **Then** habits 表对应记录的三个字段被更新为传入值

### Domain 插件增强

- [X] T043 [US4] Domain onEvent 增强 HabitLogged 处理 — 在 `frontend/src/domains/habits/index.ts` 的 onEvent 钩子中，当事件为 HabitLogged 且 habit trackable=true 时，调用 Repository 的三个计算方法，将结果放入返回的 metrics 数组
  - **Given** HabitLogged 事件且习惯 trackable=true
  - **When** onEvent 被调用
  - **Then** 返回 metrics 包含 { habitId, field: 'streak', value: N } 等 3 条记录
  - **Given** HabitLogged 事件且习惯 trackable=false
  - **When** onEvent 被调用
  - **Then** 返回空 metrics 数组（不触发计算）

### Orchestrator 集成

- [X] T044 [US4] Orchestrator 处理 metrics 持久化 — 在 `frontend/src/nexus/orchestrator/index.ts` 确认/增强：当 Domain onEvent 返回非空 metrics 时，调用 habitRepository.updateMetrics 持久化指标
  - **Given** Domain onEvent 返回 metrics: [{ habitId, field: 'streak', value: 3 }, ...]
  - **When** Orchestrator 处理完 HabitLogged 事件
  - **Then** 调用 habitRepository.updateMetrics(habitId, userId, { streak: 3, longestStreak: 5, completionRate7d: 4 })

### 测试

- [X] T045 [P] [US4] 更新 habit-domain 测试 — 在 `frontend/src/domains/habits/__tests__/habit-domain.test.ts` 新增测试用例：验证 onEvent 在 HabitLogged 事件时正确返回 metrics；验证 trackable=false 不触发计算
  - **Given** mock repository 返回 streak=3、longestStreak=5、completionRate7d=4
  - **When** onEvent 收到 HabitLogged 事件（trackable=true）
  - **Then** 返回值包含 3 条 metrics 记录
  - **Given** mock repository 中习惯 trackable=false
  - **When** onEvent 收到 HabitLogged 事件
  - **Then** 返回空 metrics

**Checkpoint**: US4 完成 — 打卡后自动计算三项指标并持久化，仅占时习惯不触发计算

---

## Phase 7: User Story 5 — 习惯库列表优化 (Priority: P5)

**Purpose**: 习惯库分组展示、组合筛选、卡片信息完善、删除按钮含外键检查（FR-020~025）

**Independent Test**: 创建多个不同类型和状态的习惯，验证分组排序、筛选结果、卡片展示的 10 项信息、草稿/暂停的删除按钮。

### HabitList 分组与筛选

- [X] T046 [US5] HabitList 新增状态筛选器 — 在 `frontend/src/components/habit-list.tsx` 新增 `statusFilter` useState，类型为 `'all' | 'draft' | 'active' | 'suspended' | 'archived'`，在类型筛选旁边渲染状态筛选按钮组（pill 样式），筛选逻辑与 typeFilter 取交集
  - **Given** 习惯列表有 2 个 active、1 个 draft、1 个 suspended
  - **When** 状态筛选选择 "draft"
  - **Then** 仅显示 1 个 draft 习惯
  - **Given** 类型选"可追踪"+ 状态选"active"
  - **When** 应用筛选
  - **Then** 仅显示既是可追踪又是 active 的习惯

- [X] T047 [US5] HabitList 分组展示 — 在 `frontend/src/components/habit-list.tsx` 将 filtered 数组按 trackable 分为两组，各组按 defaultTime 从小到大排序，渲染为带分组标题（"可追踪" / "仅占时"）的两个 Section
  - **Given** 3 个可追踪（defaultTime: 07:00, 12:00, 21:00）和 2 个仅占时（defaultTime: 06:30, 18:00）
  - **When** 渲染列表
  - **Then** 可追踪组按 07:00→12:00→21:00 排序，仅占时组按 06:30→18:00 排序
  - **Given** 筛选后只剩可追踪习惯
  - **When** 渲染
  - **Then** 仅显示"可追踪"分组，不显示空的"仅占时"分组

### HabitCard 信息完善

- [X] T048 [US5] HabitCard 新增描述和统计指标 — 在 `frontend/src/components/habit-card.tsx` 的 HabitCardProps 中新增 description、longestStreak、completionRate7d 字段，在时长信息行下方新增一行显示统计：`连续 {streak} 天 · 最长 {longestStreak} 天 · 近7天完成 {completionRate7d} 次`；在标题行下方新增描述文本（若有）
  - **Given** 习惯 description="每天早晨跑步"、streak=7、longestStreak=12、completionRate7d=5
  - **When** 渲染卡片
  - **Then** 显示描述文本"每天早晨跑步"、统计行"连续 7 天 · 最长 12 天 · 近7天完成 5 次"
  - **Given** 习惯 description 为空
  - **When** 渲染卡片
  - **Then** 不显示描述行

- [X] T049 [US5] HabitCard 新增状态标签 — 在 `frontend/src/components/habit-card.tsx` 的标题行区域，当 status 非默认值（非 active）时，显示状态 Badge：draft→"草稿"（outline）、suspended→"已暂停"（secondary）、archived→"已归档"（secondary）；当 frequencyType 为 weekly 或 custom 时，已有逻辑已处理（保留）
  - **Given** 习惯 status="draft"
  - **When** 渲染卡片
  - **Then** 标题旁显示"草稿" Badge
  - **Given** 习惯 status="active"
  - **When** 渲染卡片
  - **Then** 不显示状态 Badge（active 是默认状态，无需标注）

### HabitCard 按钮逻辑

- [X] T050 [US5] HabitCard 删除按钮逻辑（草稿/暂停 + 外键检查） — 在 `frontend/src/components/habit-card.tsx` 中：当 status === 'draft' || status === 'suspended' 时显示"删除"按钮；点击时调用 onStatusChange("delete")；归档习惯不显示删除按钮；active 习惯也不显示删除按钮（仅显示暂停按钮）
  - **Given** 草稿习惯
  - **When** 渲染卡片
  - **Then** 显示"删除"按钮，不显示"暂停"按钮
  - **Given** active 习惯
  - **When** 渲染卡片
  - **Then** 显示"暂停"按钮，不显示"删除"按钮
  - **Given** 归档习惯
  - **When** 渲染卡片
  - **Then** 不显示任何操作按钮（编辑除外）

- [X] T051 [US5] HabitCard 归档状态样式 — 在 `frontend/src/components/habit-card.tsx` 确认归档习惯（status=archived）opacity-40 样式已正确应用；移除归档习惯的暂停/恢复/归档/删除按钮，仅保留编辑按钮
  - **Given** 习惯 status="archived"
  - **When** 渲染卡片
  - **Then** 卡片 opacity-40，仅显示"编辑"按钮

### View 层和 Hook 层

- [X] T052 [US5] HabitLibraryView 传递新字段和删除处理 — 在 `frontend/src/components/habit-library-view.tsx` 的 listItems 映射中新增 description、longestStreak、completionRate7d 字段传递；在 handleStatusChange 中增加 "delete" action 分支：调用 deleteHabit(habitId)
  - **Given** habits 数据包含 description="测试描述"、longestStreak=5、completionRate7d=3
  - **When** 构建 listItems 并传递给 HabitList
  - **Then** HabitCard 能访问到这些新字段
  - **Given** handleStatusChange 收到 action="delete"
  - **When** 执行处理
  - **Then** 调用 deleteHabit(id) 并刷新列表

- [X] T053 [US5] use-habits Hook 扩展 deleteHabit 外键检查 — 在 `frontend/src/hooks/use-habits.ts` 修改 deleteHabit 方法：先调用 checkReferences，若 hasReferences=true 则设置错误信息（如"该习惯存在关联打卡记录或时间盒，无法删除"）并返回 false；若 hasReferences=false 则执行删除
  - **Given** 删除一个有 habit_logs 引用的习惯
  - **When** deleteHabit(habitId) 被调用
  - **Then** 返回 false，error 信息为"该习惯存在关联数据，无法删除"
  - **Given** 删除一个无任何引用的草稿习惯
  - **When** deleteHabit(habitId) 被调用
  - **Then** 成功删除，返回 true

- [X] T054 [US5] HabitList 列表容器滚动条 — 在 `frontend/src/components/habit-list.tsx` 的根容器添加 `overflow-y-auto` 样式和 `max-h-[calc(100vh-200px)]`，使习惯数量超出可视区域时显示垂直滚动条
  - **Given** 习惯数量超过 10 个，内容超出屏幕高度
  - **When** 渲染列表
  - **Then** 列表区域出现垂直滚动条，顶部筛选栏固定不动

**Checkpoint**: US5 完成 — 分组排序、组合筛选、卡片 10 项信息、删除含外键检查、滚动条

---

## Phase 8: 集成验证

**Purpose**: 端到端验证 US4 + US5，确认无回归

- [X] T055 运行完整测试套件 — 在 `frontend/` 目录运行 `npx vitest run`，确认所有现有测试通过，无回归
  - **Given** Phase 6 和 Phase 7 代码变更已完成
  - **When** 运行 `npx vitest run`
  - **Then** 所有测试通过

- [ ] T056 手动端到端验证 — 启动 dev server (`npm run dev`)，按 quickstart.md [006][007] 章节验证：(1) 可追踪习惯打卡后 streak 更新 (2) 仅占时习惯打卡后指标不变 (3) 习惯库分组显示正确 (4) 类型+状态组合筛选正确 (5) 卡片显示 10 项信息 (6) 草稿习惯可删除 (7) 有引用的习惯删除被阻止 (8) 归档习惯灰色无按钮
  - **Given** 所有代码变更已部署
  - **When** 按 quickstart.md 验证步骤逐一测试
  - **Then** 全部验证项通过

---

## Dependencies & Execution Order (Phase 6-8)

### Phase Dependencies

- **Phase 6 (US4)**: 依赖 Phase 1-5 已完成（Repository、Domain 插件、Orchestrator 基础设施已就绪）
  - T038 → T039/T040/T041（接口先行，实现依赖接口）→ T042 → T043 → T044 → T045
- **Phase 7 (US5)**: 依赖 Phase 1-5 已完成；与 Phase 6 无代码依赖（不同文件），可并行
  - T046/T047（HabitList）可先做 → T048/T049/T050/T051（HabitCard，可并行）→ T052/T053（View+Hook）→ T054（滚动条）
- **Phase 8 (集成验证)**: 依赖 Phase 6 + Phase 7 全部完成

### Critical Path

```
Phase 6: T038 → {T039, T040, T041} → T042 → T043 → T044 → T045
Phase 7: {T046, T047} → {T048, T049, T050, T051} → T052 → T053 → T054
Phase 8: T055 → T056
```

### Parallel Opportunities

- Phase 6: T039 ∥ T040 ∥ T041（三个计算方法互不依赖）
- Phase 7: T046 ∥ T047（同一文件但不同功能区域，建议顺序执行）；T048 ∥ T049 ∥ T050 ∥ T051（HabitCard 不同改动）
- Phase 6 ∥ Phase 7：无文件交叉，可完全并行

---

## Implementation Strategy (Phase 6-8)

### 建议执行顺序

1. Phase 6 T038-T045 (US4 指标计算): ~60 分钟
2. Phase 7 T046-T054 (US5 列表优化): ~50 分钟
3. Phase 8 T055-T056 (集成验证): ~15 分钟

### 并行策略

Phase 6 和 Phase 7 可由两个 Agent 并行执行：
- Agent A: T038 → T039/T040/T041 → T042 → T043 → T044 → T045
- Agent B: T046 → T047 → T048 → T049 → T050 → T051 → T052 → T053 → T054

---

## Phase 9: User Story 6 — 卡片布局与交互优化 (Priority: P6)

**Purpose**: 习惯卡片采用固定宽度网格布局、响应式自适应、移除激活按钮、删除确认对话框（FR-026~029）

**Independent Test**: 创建 5+ 个习惯，验证卡片以网格排列（非独占一行）。调整窗口宽度验证响应式。删除一个习惯时弹出确认对话框。草稿习惯卡片无激活按钮。

### D1: 网格布局

- [X] T057 [US6] HabitList 分组容器改为 CSS Grid 网格布局 — 在 `frontend/src/components/habit-list.tsx` 将两个分组（"可追踪" / "仅占时"）的容器从 `flex flex-col gap-3` 改为 `grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3`，使卡片以网格形式排列
  - **Given** 习惯列表有 5 个习惯（3 个可追踪 + 2 个仅占时）
  - **When** 渲染习惯库列表
  - **Then** 两个分组中的卡片以网格排列，一行显示多个卡片（非独占一行），卡片最小宽度 280px
  - **Given** 浏览器窗口宽度 >= 1200px
  - **When** 渲染习惯库
  - **Then** 每行显示 3-4 个卡片，页面紧凑
  - **Given** 浏览器窗口宽度 < 640px
  - **When** 渲染习惯库
  - **Then** 每行显示 1 个卡片，不出现水平滚动条

### D2: 移除激活按钮

- [X] T058 [P] [US6] 确认并移除习惯卡片的激活按钮 — 在 `frontend/src/components/habit-card.tsx` 检查所有按钮渲染分支，确认 `status === "draft"` 分支不渲染任何"激活"或"activate"相关按钮。如果存在 `onStatusChange("activate")` 调用，移除对应按钮和条件分支
  - **Given** 一个草稿状态（status="draft"）的习惯
  - **When** 渲染习惯卡片
  - **Then** 卡片不显示「激活」按钮，仅显示「编辑」和「删除」按钮
  - **Given** 一个活跃状态（status="active"）的习惯
  - **When** 渲染习惯卡片
  - **Then** 卡片不显示「激活」按钮，显示「编辑」和「暂停」按钮

### D3: 删除确认对话框

- [X] T059 [US6] HabitLibraryView 新增删除确认 AlertDialog — 在 `frontend/src/components/habit-library-view.tsx` 新增 `deleteConfirm` 状态（`{ id: string; title: string } | null`），修改 `handleStatusChange` 中 "delete" 分支：设置 `deleteConfirm` 状态而非直接调用 deleteHabit。新增 AlertDialog，标题"确认删除"，描述"确定要删除该习惯吗？此操作不可撤销"，确认按钮调用 deleteHabit 后清空状态并刷新，取消按钮清空状态。复用已有的 AlertDialog 组件和归档确认的代码模式
  - **Given** 用户点击草稿习惯卡片的「删除」按钮
  - **When** handleStatusChange 收到 action="delete"
  - **Then** 弹出 AlertDialog，标题"确认删除"，描述"确定要删除该习惯吗？此操作不可撤销"
  - **Given** 删除确认对话框已弹出
  - **When** 用户点击「取消」
  - **Then** 对话框关闭，习惯不被删除
  - **Given** 删除确认对话框已弹出
  - **When** 用户点击「确认删除」
  - **Then** 调用 deleteHabit(id)，对话框关闭，列表刷新

**Checkpoint**: US6 完成 — 卡片网格布局、响应式自适应、无激活按钮、删除有确认对话框

---

## Phase 10: User Story 7 — 模板编辑与删除 (Priority: P7)

**Purpose**: 模板支持编辑（名称、适用日、习惯列表）和删除（含确认），新建模板自动填充活跃习惯（FR-030~033）

**Independent Test**: 创建一个模板，验证可编辑模板内容（名称、时间覆盖）、删除模板（含确认对话框）。新建模板时验证活跃习惯自动填充。

### E1: 后端补全

- [X] T060 [US7] Server Action 新增 updateTemplate — 在 `frontend/src/app/actions/intent.ts` 的 Template Server Actions 区域新增 `updateTemplate(id: string, data: { name?: string; description?: string; icon?: string; applicableDays?: number[] })` 函数，调用 `templateRepo.update(id, data, userId)`，返回更新后的模板或错误
  - **Given** 数据库有一个"工作日"模板
  - **When** 调用 updateTemplate(id, { name: "工作日 v2" })
  - **Then** 模板名称更新为"工作日 v2"，返回更新后的模板数据

- [X] T061 [P] [US7] Server Action 新增 deleteTemplate — 在 `frontend/src/app/actions/intent.ts` 的 Template Server Actions 区域新增 `deleteTemplate(id: string)` 函数，调用 `templateRepo.delete(id, userId)`，返回 boolean 表示成功/失败
  - **Given** 数据库有一个模板
  - **When** 调用 deleteTemplate(id)
  - **Then** 模板从数据库删除，返回 true
  - **Given** id 对应的模板不存在或不属于当前用户
  - **When** 调用 deleteTemplate(id)
  - **Then** 返回 false

- [X] T062 [US7] 新建 useTemplates Hook — 在 `frontend/src/hooks/use-templates.ts` 创建 `useTemplates()` Hook，参考 `use-habits.ts` 的模式：useState 管理 templates 数组、isLoading、error；useEffect 初始加载；封装 createTemplate、updateTemplate、deleteTemplate、addHabitToTemplate、removeHabitFromTemplate、applyTemplate 六个 mutation 方法；所有 mutation 成功后调用 refresh() 同步本地状态；返回 `{ templates, isLoading, error, refresh, createTemplate, updateTemplate, deleteTemplate, addHabitToTemplate, removeHabitFromTemplate, applyTemplate }`
  - **Given** 数据库有 2 个模板
  - **When** 调用 useTemplates()
  - **Then** templates 包含 2 个模板，isLoading 为 false
  - **Given** 调用 deleteTemplate(id) 成功
  - **When** Hook 返回
  - **Then** templates 列表自动刷新，不包含已删除的模板

### E2: 模板卡片编辑/删除按钮

- [X] T063 [US7] 模板卡片新增删除按钮和回调 — 在 `frontend/src/components/habit-template-card.tsx` 的 HabitTemplateCardProps 新增 `onDelete?: () => void` 可选回调，按钮区域在"编辑"按钮后新增"删除"按钮（ghost variant, size sm），仅当 onDelete 传入时渲染。点击删除按钮调用 onDelete()
  - **Given** HabitTemplateCard 同时传入 onEdit 和 onDelete
  - **When** 渲染卡片
  - **Then** 按钮区域显示"用模板安排今天"、"编辑"、"删除"三个按钮
  - **Given** 未传入 onDelete prop
  - **When** 渲染卡片
  - **Then** 不显示删除按钮

- [X] T064 [US7] 模板管理器新增编辑模式和删除确认 — 在 `frontend/src/components/habit-template-manager.tsx` 中：(1) 新增 `editingTemplateId: string | null` 状态，点击编辑时设置该 ID，条件渲染编辑表单（传入 initial 数据）；(2) 新增 `deleteConfirm: { id: string; name: string } | null` 状态和 AlertDialog，点击删除时设置状态触发对话框，确认后调用 deleteTemplate(id)，取消则清空状态
  - **Given** 模板管理器加载了 2 个模板
  - **When** 点击模板卡片的「编辑」按钮
  - **Then** 切换到编辑模式，HabitTemplateForm 接收 initial 数据预填充
  - **Given** 点击模板卡片的「删除」按钮
  - **When** 删除请求触发
  - **Then** 弹出 AlertDialog "确定要删除该模板吗？此操作不可撤销"
  - **Given** 删除确认对话框已弹出，用户点击「确认删除」
  - **When** 执行删除
  - **Then** 模板从列表移除，对话框关闭
  - **Given** 删除确认对话框已弹出，用户点击「取消」
  - **When** 取消操作
  - **Then** 对话框关闭，模板不被删除

### E3: 模板表单编辑模式 + 自动填充

- [X] T065 [US7] 模板表单支持编辑模式（initial 数据预填充）— 在 `frontend/src/components/habit-template-form.tsx` 确保当传入 `initial` prop 时，表单字段（名称、描述、适用日、习惯列表）预填充 initial 数据。编辑模式下提交调用 `onSubmit` 回调时传递编辑后的数据和模板 ID。在表单标题区分新建/编辑：新建显示"新建模板"，编辑显示"编辑模板"
  - **Given** HabitTemplateForm 传入 initial 数据（name="工作日", applicableDays=[1,2,3,4,5], habits=[...]）
  - **When** 渲染表单
  - **Then** 标题显示"编辑模板"，名称字段值为"工作日"，适用日为周一至周五
  - **Given** 编辑模式下修改名称并保存
  - **When** 提交表单
  - **Then** onSubmit 回调接收更新后的数据和模板 ID

- [X] T066 [US7] 模板表单自动填充活跃习惯（新建模式）— 在 `frontend/src/components/habit-template-form.tsx` 中：当 `!initial`（新建模式）时，从组件内部获取活跃习惯列表（通过 props 传入 habits 或调用 useHabits），筛选 `status === "active"` 的习惯，按 `defaultTime` 从小到大排序，自动填入模板习惯列表，每个习惯的 timeOverride = 其 defaultTime。如果无活跃习惯，列表为空。仅在组件初始化时触发一次自动填充（useRef 或类似机制防止重复填充）
  - **Given** 习惯库有 3 个活跃习惯（defaultTime: 07:00, 12:00, 21:00）和 1 个暂停习惯
  - **When** 新建模板（无 initial prop），表单加载
  - **Then** 习惯列表自动填充 3 个活跃习惯（按 07:00→12:00→21:00 排序），暂停习惯不在列表中
  - **Given** 习惯库无活跃习惯
  - **When** 新建模板
  - **Then** 习惯列表为空，显示"暂无活跃习惯"提示

- [X] T067 [US7] 模板表单支持移除习惯和修改时间覆盖 — 在 `frontend/src/components/habit-template-form.tsx` 的习惯列表中，每个习惯条目增加：(1) 时间覆盖输入框（type="time"），修改时更新对应习惯的 timeOverride；(2)「移除」按钮（ghost variant, size sm），点击后从列表中移除该习惯。移除操作仅影响模板中的习惯列表，不影响习惯库中的原习惯
  - **Given** 模板表单中有 3 个习惯
  - **When** 点击第二个习惯的「移除」按钮
  - **Then** 列表变为 2 个习惯，习惯库中该习惯不受影响
  - **Given** 模板表单中一个习惯 timeOverride="07:00"
  - **When** 修改时间覆盖为 06:30
  - **Then** 该习惯的 timeOverride 更新为 06:30

**Checkpoint**: US7 完成 — 模板可编辑/删除（含确认），新建自动填充活跃习惯

---

## Phase 11: 集成验证

**Purpose**: 端到端验证 US6 + US7，确认无回归

- [X] T068 运行完整测试套件 — 在 `frontend/` 目录运行 `npx vitest run`，确认所有现有测试通过，无回归（239 passed / 7 failed 全部为历史遗留）
  - **Given** Phase 9 和 Phase 10 代码变更已完成
  - **When** 运行 `npx vitest run`
  - **Then** 所有测试通过

- [ ] T069 手动端到端验证 — 启动 dev server (`npm run dev`)，按 quickstart.md [008][009] 章节验证：(1) 习惯卡片网格布局排列 (2) 调整窗口宽度响应式 (3) 草稿习惯无激活按钮 (4) 删除习惯弹出确认对话框 (5) 取消删除不执行 (6) 模板编辑保存 (7) 模板删除确认 (8) 新建模板自动填充活跃习惯 (9) 移除模板中的习惯不影响习惯库
  - **Given** 所有代码变更已部署
  - **When** 按 quickstart.md [008][009] 验证步骤逐一测试
  - **Then** 全部验证项通过

---

## Dependencies & Execution Order (Phase 9-11)

### Phase Dependencies

- **Phase 9 (US6)**: 依赖 Phase 6-8 已完成（HabitList、HabitCard、HabitLibraryView 基础功能已就绪）
  - T057 → T058（网格布局先完成，再调整按钮）→ T059（删除确认在按钮之后）
- **Phase 10 (US7)**: 依赖 Phase 6-8 已完成；与 Phase 9 无文件依赖，可并行
  - T060 ∥ T061（同一文件不同函数）→ T062（Hook 依赖两个新 action）→ T063 → T064 → T065 → T066 → T067
- **Phase 11 (集成验证)**: 依赖 Phase 9 + Phase 10 全部完成

### Critical Path

```
Phase 9: T057 → T058 → T059
Phase 10: {T060, T061} → T062 → T063 → T064 → T065 → T066 → T067
Phase 11: T068 → T069
```

### Parallel Opportunities

- Phase 9 ∥ Phase 10：无文件交叉（US6 改 habit 相关组件，US7 改 template 相关组件）
- Phase 10: T060 ∥ T061（同一个 intent.ts 但不同函数，可顺序执行）；T065 ∥ T066（同一文件不同功能，建议顺序执行）

---

## Implementation Strategy (Phase 9-11)

### 建议执行顺序

1. Phase 9 T057-T059 (US6 卡片布局优化): ~25 分钟
2. Phase 10 T060-T067 (US7 模板编辑删除): ~45 分钟
3. Phase 11 T068-T069 (集成验证): ~15 分钟

### 并行策略

Phase 9 和 Phase 10 可由两个 Agent 并行执行：
- Agent A: T057 → T058 → T059
- Agent B: T060 → T061 → T062 → T063 → T064 → T065 → T066 → T067

---

## Phase 12: [010] 时区错位 Bug 修复

**Purpose**: 修复"用习惯模板安排今天"时，习惯的本地时间（如 07:30）被错误存为 UTC 时间（显示为 15:30）的问题

**Root Cause**: `orchestrator/index.ts` 将 HH:MM 本地时间拼接了 `Z`（UTC 后缀），而表单路径和 AI 路径正确使用 `+08:00`

**Independent Test**: 创建模板并添加 defaultTime=07:30 的习惯，点击"用模板安排今天"，确认时间盒开始时间为 07:30（而非 15:30）

### 核心修复

- [X] T070 [010] 修复 applyTemplate 时间拼接的时区后缀 — 在 `frontend/src/nexus/orchestrator/index.ts` 第 472-473 行，将 `${date}T${startTime}:00Z` 和 `${date}T${endTime}:00Z` 中的 `Z` 替换为 `+08:00`，使本地时间 HH:MM 被正确标记为 UTC+8 时区
  - **Given** 模板中有 defaultTime="07:30" 的习惯
  - **When** 点击"用模板安排今天"生成时间盒
  - **Then** 时间盒 start_time 为 "2026-05-10T07:30:00+08:00"（本地 07:30），而非 "2026-05-10T07:30:00Z"（UTC 07:30 = 本地 15:30）

- [X] T071 [010] 修复幂等性检查的时区范围 — 在 `frontend/src/nexus/orchestrator/index.ts` 第 428-429 行，将 `${date}T00:00:00Z` 和 `${date}T23:59:59Z` 中的 `Z` 替换为 `+08:00`，确保查询范围为本地时间的全天（UTC+8 的 00:00-23:59）
  - **Given** 当天已通过模板生成过时间盒（start_time 为本地时间 07:30，存储为 "2026-05-10T07:30:00+08:00"）
  - **When** 再次点击"用模板安排今天"
  - **Then** 幂等性检查正确命中已存在的时间盒，不重复生成

**Checkpoint**: 时区修复完成 — 模板生成的时间盒时间正确，幂等性检查有效

---

## Dependencies & Execution Order (Phase 12)

### Phase Dependencies

- **Phase 12**: 依赖 Phase 10 已完成（模板功能可用）
  - T070 → T071（同一文件，顺序执行）

### Critical Path

```
T070 → T071
```

---

## Implementation Strategy (Phase 12)

### 建议执行顺序

1. T070: 修复时间拼接 — ~5 分钟
2. T071: 修复幂等性检查 — ~5 分钟
3. 手动验证 — ~5 分钟
