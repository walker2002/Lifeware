# Research: 习惯管理切片

**Date**: 2026-05-10 | **Feature**: 003-habit-slice | **Type**: 改进计划

## 原始研究（保留）

### R1: habits 表 schema 变更策略

**Decision**: 在现有 habits 表上 ALTER 添加新字段 + 重命名已有字段，通过 Drizzle migration 实现。

**Rationale**: 现有 habits 表已定义完整（19 个字段），只需新增 4 个字段和重命名 2 个字段。ALTER 比重建表更安全，保留已有数据。

**Alternatives considered**:
- 创建新表迁移旧数据：风险高、不必要
- 仅新增字段不重命名：会造成命名不一致，增加认知负担

### R2: 引用式模板的数据模型

**Decision**: 使用 template_habits 关联表存储 habitId + 可选的 timeOverride/durationOverride。

**Rationale**: 与 timebox_tasks/timebox_habits 的 junction table 模式一致。覆盖字段用 nullable，NULL 表示继承习惯库默认值。

### R3: 跨午夜时间比较

**Decision**: 当 `latestEndTime < defaultTime` 时视为跨日。使用分钟偏移转换：将 HH:MM 转为 0~1439 的分钟数，跨日时加 1440。

### R4: 习惯模板 UI 纵向时间轴

**Decision**: 复用 timebox-timeline 纵向时间轴组件模式，按列渲染不同模板。

### R5: habits 域插件事件权重

**Decision**: 沿用 timebox 域的权重分层模式（90/80/70/50），按习惯事件重要性分配。

### R6: 习惯库 vs 模板的代码组织

**Decision**: 独立 Repository（HabitRepository、HabitTemplateRepository），同一 habits domain plugin。

---

## 改进研究（2026-05-10）

### R7: [001] 编辑按钮 Bug — 根因分析

**Bug**: 习惯库点击编辑按钮，实际执行的是创建功能而非编辑功能。

**根因定位** (`habit-library-view.tsx`):
- L32-36: `handleEdit` 设置 `editHabitId` 后打开表单，但注释写"MVP 简化：编辑时打开新建表单"
- L79-89: `HabitForm` 的 `onSubmit` 硬编码为 `handleCreate`，未根据 `editHabitId` 切换
- L79-89: 未传递 `initial` prop 给 `HabitForm`
- L10: `updateHabit` 已从 hook 解构但从未使用

**修复方案**: 在 `habit-library-view.tsx` 中：
1. 新增 `handleUpdate` 函数，调用 `updateHabit`
2. `HabitForm` 的 `onSubmit` 改为条件判断：`editHabitId ? handleUpdate : handleCreate`
3. 传递 `initial` prop：当 `editHabitId` 存在时从 habits 列表中找到对应习惯传入

**后端状态**: `use-habits.ts` 的 `updateHabit`（L84-92）和 `intent.ts` 的 server action（L621-633）均已就绪，无需修改。

**影响范围**: 1 个文件（`habit-library-view.tsx`），约 15 行改动。

### R8: [002] 归档功能优化 — 改进范围

**需求**:
- 启用状态的习惯不可归档，只能归档暂停状态的习惯
- 归档需要再三确认
- 如果习惯未被其他表引用，提示归档后会彻底删除

**现状分析**:

| 组件 | 现状 | 需改进 |
|---|---|---|
| 状态机 `transitions.ts` L47 | `active → archived` 允许 | 删除此转换 |
| `habit-card.tsx` L163 | `!isArchived` 即显示归档按钮 | 改为 `status === "suspended"` |
| 归档按钮 | 无确认对话框 | 新增 AlertDialog 确认 |
| `habit.repository.ts` L138-142 | `archive` 方法仅软状态变更 | 需增加引用检查逻辑 |

**外键引用关系**:
- `habit_logs.habitId` → CASCADE（删除习惯时级联删除打卡记录）
- `template_habits.habitId` → RESTRICT（有模板引用时阻止删除）
- `timebox_habits.habitId` → CASCADE（删除习惯时级联删除关联）

**改进方案**:
1. 删除状态机 `active → archived` 转换规则
2. 归档按钮仅在 `suspended` 状态显示
3. 点击归档时弹出 AlertDialog 二次确认
4. 新增 `checkReferences(id, userId)` 方法检查三张引用表
5. 确认对话框根据引用状态显示不同提示：
   - 有引用："归档后习惯将进入归档状态，关联数据将保留"
   - 无引用："该习惯无关联数据，归档后将彻底删除" → 执行物理删除

**影响范围**: ~9 个文件（UI 2 + Hook 1 + Server Action 1 + Repository 1 + 接口 1 + 状态机 1 + 测试 2）

### R9: [003] latestEndTime → latestStartTime 重命名

**需求**: 将习惯的"最晚结束时间"改为"最迟开始时间"，语义更清晰。

**语义变更**: 这不仅是命名变更，还涉及计算公式变化：
- 旧公式（latestEndTime）: `defaultTime + defaultDuration + 30`（最晚结束时间 = 默认时间 + 默认时长 + 缓冲）
- 新公式（latestStartTime）: `defaultTime + 30`（最迟开始时间 = 默认时间 + 缓冲）

**影响范围**: ~75 处引用，28 个文件

| 层级 | 文件 | 改动 |
|---|---|---|
| Schema | `schema.ts` L170 | `latest_end_time` → `latest_start_time` |
| USOM 类型 | `objects.ts` L145 | `latestEndTime` → `latestStartTime` |
| USOM 原语 | `primitives.ts` | HabitStatus 相关类型 |
| 默认值计算 | `habit-defaults.ts` L36-37 | 公式从 `+duration+30` 改为 `+30` |
| Repository | `habit.repository.ts` | DB↔USOM 映射字段名 |
| Nexus | orchestrator, rule-engine | 字段引用更新 |
| UI 组件 | habit-card, habit-form, habit-library-view 等 | 显示和表单字段 |
| 设计文档 | `docs/usom-design.md`, `docs/database-design.md` | 同步更新 |
| 数据迁移 | SQL migration | `ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time` |

**执行策略**:
1. 先更新 Tier 2 文档（usom-design.md + database-design.md）
2. 更新 USOM 类型定义
3. 更新 Schema + 生成 migration
4. 更新 Repository 映射
5. 更新 Nexus 层引用
6. 更新 UI 组件
7. 更新计算公式

**风险点**: 数据迁移需要回填现有数据。现有记录的 `latest_end_time` 值是 `defaultTime + defaultDuration + 30`，重命名为 `latest_start_time` 后语义变为"最迟开始时间"，但旧值包含 duration，需要回填为 `defaultTime + 30`。

### R10: [004] 模板卡片视图 Bug — 根因分析

**Bug**: 生成模板后，模板的"卡片"视图未能有效显示习惯内容，但对比视图正常。

**根因定位** (`habit-template-card.tsx`):
- 卡片视图只用迷你时间轴色块（3px 高 `h-3`）展示习惯，不显示文字列表
- 色块使用 HTML `title` 属性（需鼠标悬停才可见）
- 当习惯条目时间接近或相同时，色块重叠为一个，视觉上无法区分
- 当 `habits` 数据加载失败时，所有条目退化到 "00:00"，完全重叠

**对比视图为何正常** (`habit-template-view.tsx`):
- 每个习惯有独立的文本标签 `{habit.title}`
- 垂直展开的时间轴布局，即使时间重叠也能看到名称

**修复方案**: 在 `habit-template-card.tsx` 的迷你时间轴下方，增加习惯名称列表（与对比视图类似），每个条目显示标题和时间。

**影响范围**: 1 个文件（`habit-template-card.tsx`），约 10-15 行新增 JSX。

---

## 改进优先级排序

| 优先级 | 编号 | 复杂度 | 影响范围 |
|---|---|---|---|
| P1 | [001] 编辑 Bug | 低（1 文件） | 用户直接可见的功能缺陷 |
| P1 | [004] 模板卡片 Bug | 低（1 文件） | 用户直接可见的功能缺陷 |
| P2 | [002] 归档优化 | 中（~9 文件） | 安全性改进 + UX 优化 |
| P3 | [003] 重命名 latestEndTime | 高（28 文件） | 语义变更 + 数据迁移 |
| P0 | [005] 习惯库查询失败 Bug | 中（3 文件） | 迁移日志缺失，DB 列名不一致 |

---

## 改进研究（2026-05-10 第二批）

### R11: [005] 习惯库查询失败 Bug — 根因分析

**Bug**: 进入习惯库页面，数据库查询失败，错误信息 "Failed query"，SQL 中包含 `latest_start_time` 列。

**根因定位**:

| 检查项 | 状态 | 详情 |
|---|---|---|
| Schema 代码 (`schema.ts:170`) | ✅ | `latestStartTime: text('latest_start_time')` — 正确 |
| 迁移 SQL (`0003_latest_start_time.sql`) | ✅ | `ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time` — 正确 |
| Drizzle 日志 (`_journal.json`) | ❌ | 仅含 0000/0001/0002，缺少 0003 条目 |
| 快照 (`0003_snapshot.json`) | ❌ | 不存在 — 手动创建迁移未生成快照 |
| 0002 快照 (`0002_snapshot.json`) | ❌ | 仍为旧 schema（`scheduled_time`/`duration`），未反映 0002 迁移的实际变更 |

**因果链**:
1. 迁移 0003 是手工创建，未通过 `drizzle-kit generate` 生成
2. `_journal.json` 未更新（缺少 0003 条目）、无 `0003_snapshot.json`
3. `npm run db:migrate` (`drizzle-kit migrate`) 根据日志决定应用哪些迁移 — 未注册的迁移被跳过
4. 数据库实际列名仍为 `latest_end_time`（来自已应用的 0002 迁移）
5. 但 Drizzle ORM 根据当前 schema 代码生成 SQL，引用了 `latest_start_time`
6. 结果：PostgreSQL 返回 "column does not exist" 错误

**次要问题**: 0002 快照也过时了（显示 `scheduled_time`/`duration` 但 0002 迁移已将列重命名）。这会影响后续 `drizzle-kit generate` 的准确性，需一并修复。

**修复方案**:
1. 删除手工创建的 `0003_latest_start_time.sql`
2. 更新 `0002_snapshot.json` 使其反映 0002 迁移后的实际 schema（含 `default_time`、`earliest_time`、`latest_end_time`、`min_duration`、`trackable` 等）
3. 运行 `npx drizzle-kit generate` 让工具自动检测 `latest_end_time` → `latest_start_time` 的差异并生成正确的迁移（含快照+日志条目）
4. 运行 `npm run db:migrate` 应用迁移

**影响范围**: 
- 删除: `0003_latest_start_time.sql` (1 文件)
- 修改: `0002_snapshot.json` (1 文件，快照同步)
- 新增: drizzle-kit 自动生成的新迁移文件
- schema 代码、repository、UI 组件等无需变动（代码层面已正确）

---

## 改进研究（2026-05-10 第三批 — [006][007]）

### R12: [006] 打卡指标自动计算 — 技术方案

**需求**: 可追踪习惯在时间盒中打卡后，自动计算 streak、longestStreak、completionRate7d。

**现有基础**:
- `habits` 表已有 `streak`(int, default 0)、`longestStreak`(int, default 0)、`completionRate7d`(real, default 0) 三个字段
- `habit_logs` 表存储打卡记录，有 `date`、`status`（completed/skipped/partial）字段
- `domains/habits/index.ts` 的 `onEvent` 已订阅 `HabitLogged` 事件
- USOM Habit 类型已包含这三个字段

**技术决策**:

1. **Streak 算法**:
   - 查询该 habit 所有 status='completed' 的日期列表，按 DESC 排序
   - 从今天（或昨天，取决于打卡时间）开始逐日递减检查
   - 连续有记录则 streak++，中断即停止
   - 连续定义基于自然日（spec Assumption）

2. **LongestStreak 算法**:
   - 遍历全部 completed 记录，按日期排序
   - 滑动窗口找最长连续段
   - 与当前 longestStreak 取 max

3. **CompletionRate7d 算法**:
   - 统计 habit_logs 中 date >= (today - 6) AND status='completed' 的记录数
   - 存储为绝对次数（非百分比）

4. **持久化策略**:
   - Domain `onEvent` 返回 metrics 对象 `{ streak, longestStreak, completionRate7d }`
   - Orchestrator 接收后调用 Repository `updateMetrics` 写入 habits 表
   - 遵循原则 VI（Domain 不直接写状态）

5. **计算时机**: 仅在 HabitLogged 事件（status=completed）时触发，skipped/partial 不触发重新计算

**Alternatives considered**:
- 实时计算（每次查询时算）：性能差，不满足 FR-018
- 异步队列：过度设计，MVP 阶段打卡频率低

### R13: [007] 习惯库列表优化 — UI 方案

**需求**: 分组展示、组合筛选、卡片信息完善、删除按钮。

**现有代码分析**:

| 组件 | 现状 | 改进点 |
|------|------|--------|
| `habit-list.tsx` | 线性列表，仅有类型筛选 | 增加分组、状态筛选 |
| `habit-card.tsx` | 展示标题、标签、时间窗口、时长、按钮 | 增加 description、状态标签、频率、连续天数等 |
| `habit-library-view.tsx` | listItems 缺少 description、longestStreak、completionRate7d | 扩展映射字段 |
| `use-habits.ts` | deleteHabit 直接删除 | 增加外键检查 |

**技术决策**:

1. **分组实现**: HabitList 组件内部将 filtered 数组按 trackable 分组，渲染两个 Section，每个 Section 有标题和卡片列表
2. **组合筛选**: 两个独立 useState（typeFilter, statusFilter），过滤时取交集
3. **删除流程**:
   - 复用已有的 `checkReferences` 方法（返回 HabitReferenceInfo）
   - HabitCard 根据状态渲染不同按钮：draft/suspended → 删除按钮；active → 暂停按钮；suspended → 恢复+归档按钮；archived → 无按钮
   - 删除前调用 checkReferences，hasReferences=true 时弹出 AlertDialog 提示无法删除
4. **滚动条**: 列表容器设置 `overflow-y-auto`，max-height 根据父容器计算

**Alternatives considered**:
- 虚拟列表（react-virtualized）：习惯数量 < 100，不需要
- 服务端排序：习惯数量小，客户端排序足够

---

## 改进研究（2026-05-10 第四批 — [008][009]）

### R14: [008] 卡片布局与交互优化 — 技术方案

**需求**: 卡片固定宽度网格布局、响应式自适应、无激活按钮、删除确认对话框。

**现有代码分析**:

| 组件 | 现状 | 改进点 |
|------|------|--------|
| `habit-list.tsx` | 分组容器为 `flex flex-col gap-3`（线性排列） | 改为 CSS Grid 网格布局 |
| `habit-card.tsx` | Card 组件无宽度约束 | 由 Grid 的 minmax 控制列宽 |
| `habit-library-view.tsx` | 有归档确认 AlertDialog，无删除确认 | 新增删除确认 AlertDialog |

**技术决策**:

1. **网格布局**: 使用 CSS Grid `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
   - `auto-fill` 自动填充列数，宽屏多列、窄屏少列
   - `minmax(280px, 1fr)` 确保最小宽度 280px，最大均分剩余空间
   - 两个分组（"可追踪" / "仅占时"）各自独立使用 Grid

2. **响应式策略**: 纯 CSS 方案，无需 JS 监听窗口宽度
   - Tailwind 类: `grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3`

3. **激活按钮**: 检查当前 `habit-card.tsx` 按钮逻辑 — 草稿习惯当前显示 [编辑][删除]，已无激活按钮。确认无遗漏即可。

4. **删除确认**: 复用 `habit-library-view.tsx` 已有的归档确认 AlertDialog 模式
   - 新增 `deleteConfirm` 状态（`{ id: string; title: string } | null`）
   - `handleStatusChange` 中 "delete" 分支设置 `deleteConfirm` 而非直接删除
   - AlertDialog 文案："确定要删除该习惯吗？此操作不可撤销"

**Alternatives considered**:
- Flexbox wrap：列宽不稳定，最后一行可能拉伸卡片。Grid 更适合固定宽度场景
- Masonry 布局：实现复杂，习惯卡片高度差异不大，不需要瀑布流
- JS 监听 resize：过度工程，CSS Grid auto-fill 已满足需求

### R15: [009] 模板编辑与删除 — 技术方案

**需求**: 模板支持编辑、删除（含确认），新建模板自动填充活跃习惯。

**现有代码分析**:

| 层级 | 现状 | 缺失 |
|------|------|------|
| Repository (`habit-template.repository.ts`) | 完整 CRUD：create/findById/findByUserId/update/delete/addHabit/removeHabit | ✅ 无缺失 |
| Server Actions (`intent.ts`) | 有 createTemplate/getTemplates/addHabitToTemplate/removeHabitFromTemplate/applyTemplate | ❌ 缺 updateTemplate、deleteTemplate |
| Hook | 无模板专用 Hook（模板操作散落在各组件中） | ❌ 需新建 `use-templates.ts` |
| UI - 卡片 (`habit-template-card.tsx`) | 有 onEdit 回调和编辑按钮 | ❌ 缺 onDelete 回调和删除按钮 |
| UI - 表单 (`habit-template-form.tsx`) | 有 initial prop 支持 | ❌ 缺自动填充活跃习惯逻辑 |
| UI - 管理 (`habit-template-manager.tsx`) | 展示模板列表 | ❌ 缺编辑模式切换、删除确认 |

**技术决策**:

1. **Server Actions 补全**: 在 `intent.ts` 新增两个 action：
   - `updateTemplate(id, data)`: 调用 `templateRepo.update(id, data, userId)`
   - `deleteTemplate(id)`: 调用 `templateRepo.delete(id, userId)`

2. **useTemplates Hook**: 新建 `frontend/src/hooks/use-templates.ts`
   - 参考 `use-habits.ts` 模式：useState 管理 templates 数组、isLoading、error
   - 导出: templates, isLoading, error, refresh, createTemplate, updateTemplate, deleteTemplate, addHabitToTemplate, removeHabitFromTemplate, applyTemplate
   - 所有 mutation 成功后调用 `refresh()` 同步本地状态

3. **模板卡片删除按钮**: `habit-template-card.tsx` 新增 `onDelete` prop 和删除按钮（ghost variant）
   - 由 manager 层处理 onDelete 回调（弹出确认对话框）

4. **删除确认对话框**: 在 `habit-template-manager.tsx` 新增 `deleteConfirm` 状态和 AlertDialog
   - 文案："确定要删除该模板吗？此操作不可撤销"
   - 确认后调用 `useTemplates().deleteTemplate(id)`

5. **自动填充活跃习惯**: 在 `habit-template-form.tsx` 中
   - 当 `!initial`（新建模式）时，从 `useHabits().habits` 中筛选 `status === "active"`
   - 按 `defaultTime` 排序后自动填入习惯列表
   - 每个习惯的 `timeOverride` = 习惯的 `defaultTime`
   - 当 `initial` 存在时（编辑模式），使用 initial 数据，不自动填充

**Alternatives considered**:
- 在 server action 中自动填充：需要额外查询，增加服务端复杂度。前端直接用已加载的 habits 数据更简单
- 单独的"自动填充"按钮：Spec 要求自动填充，无需用户手动触发

---

## 改进优先级排序（更新版）

| 优先级 | 编号 | 复杂度 | 影响范围 | 状态 |
|---|---|---|---|---|
| P1 | [001] 编辑 Bug | 低（1 文件） | 功能缺陷 | ✅ 完成 |
| P1 | [004] 模板卡片 Bug | 低（1 文件） | 功能缺陷 | ✅ 完成 |
| P2 | [002] 归档优化 | 中（~9 文件） | 安全性改进 | ✅ 完成 |
| P3 | [003] 重命名 latestEndTime | 高（28 文件） | 语义变更 | ✅ 完成 |
| P0 | [005] 迁移日志 Bug | 中（3 文件） | 页面不可用 | ✅ 完成 |
| P4 | [006] 指标计算 | 中（~8 文件） | 核心功能 | ✅ 完成 |
| P5 | [007] 列表优化 | 中（~5 文件） | UI 改善 | ✅ 完成 |
| P6 | [008] 卡片布局优化 | 低（3 文件） | UI 紧凑化 | ✅ 完成 |
| P7 | [009] 模板编辑删除 | 中（5 文件） | 功能补全 | ✅ 完成 |
| P0 | [010] 时区错位 Bug | 低（1 文件） | 数据正确性 | ⬜ 待实施 |

---

## 改进研究（2026-05-10 第五批 — [010]）

### R16: [010] "用习惯模板安排今天"时区错位 — 根因分析

**Bug**: 模板中设置的时间是本地时区（如 07:30），生成时间盒时存储为 UTC 时间，导致 07:30 变成 15:30（偏移 8 小时 = UTC+8）。

**根因定位**:

`frontend/src/nexus/orchestrator/index.ts` 第 472-473 行：

```typescript
startTime: `${date}T${startTime}:00Z` as Timestamp,
endTime: `${date}T${endTime}:00Z` as Timestamp,
```

- `startTime` 变量来自习惯的 `defaultTime` 或模板的 `timeOverride`，格式为 `"HH:MM"`（如 `"07:30"`），代表**用户本地时间**
- 拼接时使用字面量 `Z` 后缀，声明为 UTC 时间
- 结果：`"07:30"` (本地) → `"2026-05-10T07:30:00Z"` (UTC) → PostgreSQL `timestamptz` → 前端显示为本地 15:30

**时间流转路径**:

```
habits.default_time (text "07:30") → template_habits.time_override (text "07:30")
  → Orchestrator.applyTemplate() 读取 "07:30"（本地时间含义）
  → 拼接 `${date}T07:30:00Z`（错误标记为 UTC）
  → mappers.ts toDate() → JavaScript Date 对象
  → Drizzle → PostgreSQL timestamp with time zone
  → 前端显示 15:30（本地时区解读）
```

**对比正确路径**:

- **表单创建时间盒** (`template-parser.ts` 第 27 行): `toISO8601()` 追加 `+08:00` 后缀 → 正确
- **AI 解析创建** (`ai-parser.ts` 第 24 行): AI 返回带 `+08:00` 的 ISO 时间 → 正确
- 只有 `applyTemplate` 路径错误使用了 `Z` 后缀

**附加问题**: 同函数第 428-429 行的幂等性检查也使用 `Z` 后缀：

```typescript
const dayStart = `${date}T00:00:00Z` as Timestamp
const dayEnd = `${date}T23:59:59Z` as Timestamp
```

这导致查询范围是 UTC 00:00-23:59 而非本地时间范围，在 UTC+8 时区下实际覆盖本地 08:00 到次日 07:59，可能使幂等性检查失效。

**修复方案**:

1. **MVP 方案（硬编码 +08:00）**: 将第 472-473 行的 `Z` 改为 `+08:00`，与 `template-parser.ts` 保持一致
2. **同时修复幂等性检查**: 第 428-429 行也改为 `+08:00`
3. **长期方案（Phase 2）**: 从前端传入用户时区偏移量，server action 接收并使用

**影响范围**: 1 个文件（`orchestrator/index.ts`），3 处改动（2 处时间拼接 + 1 处幂等性查询范围）

**Alternatives considered**:
- 动态获取服务器时区 (`new Date().getTimezoneOffset()`)：服务器可能部署在不同时区，不可靠
- 从前端传入时区：正确但复杂度更高，MVP 先硬编码 +08:00
