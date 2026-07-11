# [027] activityArchetype 界面规范处理 — 设计

> **For agentic workers:** 本文档是**设计 spec**（brainstorming 产出）。实现时由 `superpowers:writing-plans` 据此生成分任务计划，再用 `superpowers:subagent-driven-development` 执行。需求来源：`mydocs/dev/027-activityArchetype界面的规范处理.md`（用户所有层，只读）。

**Goal:** 把散落各处、形态不一的「活动原型选择」界面统一为单一可复用组件（改一处全同步），让所有消费方都具备「AI 匹配 + 选择」能力并补齐缺失入口；同时增强 Timebox 模板——列表/编辑展示原型，自定义行可编辑原型，并把每行时间模型从「固定时段」重构为「带约束的可调度活动」。单 spec、分两阶段实现。

**Architecture:** Phase A = 原型选择器统一（单一 `ArchetypePicker` + `variant` prop，迁移 11 处消费方）。Phase B = Timebox 模板 `TemplateRow` JSONB 形状重构（无 DDL，仓库 lazy 自愈迁移）+ 列表/编辑器增强。Phase B 依赖 Phase A 产出的统一 `ArchetypePicker`（RowEditor 复用），故顺序执行。

**Tech Stack:** Next.js 16.1.6 / React 19.2.3 / TypeScript 5 / Drizzle ORM 0.45.1 / PostgreSQL（jsonb）。vitest + tsc 双验证；pre-push hooks（validate:manifest + validate:structure）。

---

## 1. 背景与现状审计

需求文档指出三类问题：① 原型选择各处形态不一（有的「AI 匹配 + 选择」，有的仅「选择」）；② 部分关联 Page 页面（如 `/tasks`）根本没有原型选择；③ Timebox 模板需挂原型 + 时间字段重构。

代码审计后的**完整消费方矩阵**（11 处）：

| # | 消费方 | 类型 | 现组件 | AI 匹配 | 状态 |
|---|---|---|---|---|---|
| 1 | `timebox/cnui/surfaces/AppointmentFormFields.tsx` | CNUI | `ArchetypePickerCard` | ✅ | **参照基准** |
| 2 | `timebox/components/timebox-drawer.tsx` | Page | `ArchetypePickerCard` | ✅ | OK |
| 3 | `timebox/cnui/surfaces/CreateTimebox.tsx` | CNUI | 裸 `ArchetypePicker`+label | ✅ | 待统一视觉 |
| 4 | `timebox/cnui/surfaces/EditTimeboxes.tsx` | CNUI | 裸 `ArchetypePicker`+label | ✅ | 待统一视觉 |
| 5 | `tasks/cnui/surfaces/TaskCreationCard.tsx` | CNUI | 裸 `ArchetypePicker` | ❌ | 补 AI + 统一 |
| 6 | `tasks/cnui/surfaces/TaskEditCard.tsx` | CNUI | 裸 `ArchetypePicker` | ❌ | 补 AI + 统一 |
| 7 | `habits/components/habit-form.tsx` | Page | 裸 `ArchetypePicker` | ❌ | 补 AI + 统一 |
| 8 | `habits/cnui/surfaces/HabitCreationCard.tsx` | CNUI | **无** | ❌ | **新增** |
| 9 | `tasks/components/task-create-drawer.tsx` | Page | **无** | ❌ | **新增** |
| 10 | `tasks/components/task-edit-zone.tsx` | Page inline | **无** | ❌ | **新增**（页面内编辑主入口） |
| 11 | `tasks/components/task-detail-drawer.tsx` | Page 只读 | `ArchetypePicker readOnly` | N/A | 保持只读 |

**关键事实：**
- `/tasks` 页面当前**完全没有编辑任务原型的入口**（detail-drawer 只读、edit-zone/create-drawer 无字段）——需求文档描述属实。
- 已有可复用内核：`ArchetypePicker`（裸版，`components/archetype/archetype-picker.tsx`）+ `ArchetypePickerCard`（带盒包装，`archetype-picker-card.tsx`）。AI 匹配走 `matchArchetypeForTitle`（`app/actions/activity-archetype.ts`，规则优先 + LLM 兜底）。
- `activity_archetypes` 表含 `isSystem`（区分系统内置/用户自定义）、多租户 `user_id`、4 维 `energyCost` + 6 维 `activityLabel`。
- 原型 FK 存在于：tasks / habits / timeboxes / appointments（**threads 无原型 FK**）。
- Timebox 模板 `timebox_templates.rows` 是 jsonb 数组，每行 `TemplateRow = { id, activityName, start, end, source, sourceId? }`，`source ∈ 'habit'|'task'|'thread'|'custom'`。**无模板级默认开始/结束时间**——需求文档说的「默认开始时间/默认结束时间」实为每行的 `start`/`end`。

---

## 2. Phase A — 原型选择器统一

### 2.1 组件统一：单一 `ArchetypePicker` + `variant` prop

合并现有两组件为**唯一消费组件**：

```
ArchetypePicker（archetype-picker.tsx，唯一面向消费方）
├─ variant='card'   → 带 bg-surface-card 盒 + <h3>「活动原型」（= AppointmentFormFields 参照样式）
├─ variant='inline' → 裸版（消费方自包 <label>，密集 CNUI 卡片用，避免「卡中卡」）
├─ enableAiMatch（默认 true）—「AI 匹配」按钮
├─ title: string — AI 匹配依据（任务标题/习惯名称）
├─ value / onChange — 3-state 语义：undefined=skip / null=clear / string=set
└─ readOnly / disabled
```

- **删除** `archetype-picker-card.tsx`，其带盒渲染并入 `variant='card'`。
- 3-state 语义（[026.02.4] TD-022 #6 沉淀）必须保留：消费方 transform + server mapper + server action 三处协调，不得塌缩回 2-state。
- 单一真相源：未来调原型选择器样式/行为只动 `archetype-picker.tsx`，11 处自动同步——这是需求「改一处全同步」的落点。

### 2.2 消费方迁移表

| 消费方 | 迁移目标 |
|---|---|
| #1 AppointmentFormFields | `<ArchetypePicker variant="card" enableAiMatch title=.../>`（参照基准，已近，仅换组件名） |
| #2 timebox-drawer | `variant="card"`（同上） |
| #3 CreateTimebox / #4 EditTimeboxes | `variant="inline"` + 保留 AI |
| #5 TaskCreationCard / #6 TaskEditCard | `variant="inline"` + **补 `enableAiMatch title={title}`** |
| #7 habit-form | `variant="inline"` + **补 `enableAiMatch title={name}`** |
| #8 HabitCreationCard | **新增** `variant="inline"` + AI |
| #9 task-create-drawer | **新增** `variant="inline"` + AI（title 接 drawer 的 title state；createTask 透传 `activityArchetypeId`） |
| #10 task-edit-zone | **新增** `variant="inline"` + AI（inline 编辑，与 title/priority/duration 同级；updateTask 透传） |
| #11 task-detail-drawer | 保持 `<ArchetypePicker readOnly />`（展示用） |

### 2.3 /tasks 页面编辑缺口

`task-edit-zone`（A 区 inline 编辑）作为**页面内编辑任务原型的主入口**；`task-create-drawer` 补创建时原型字段；`task-detail-drawer` 保持只读展示。任务原型的写库路径：`createTask` / `updateTask` server action 透传 `activityArchetypeId`（schema 已有该列，无需后端改动）。

### 2.4 AI 匹配 title 接线

`matchArchetypeForTitle(title)` 已通用（规则 + LLM 兜底），无需改逻辑。任务类传 `task.title`，习惯类传 `habit.name`。

---

## 3. Phase B — Timebox 模板增强

### 3.1 TemplateRow 数据模型变更（JSONB 形状，**无 DDL**）

`rows` 列仍是 jsonb，**无列级 schema 变更 → 不触发 drizzle snapshot 债**，仅行内对象字段变了：

```ts
// 改前
interface TemplateRow {
  id: string
  activityName: string
  start: string          // HH:MM
  end: string            // HH:MM
  source: TemplateRowSource
  sourceId?: string
}

// 改后
interface TemplateRow {
  id: string
  activityName: string
  defaultStart: string           // HH:MM（原 start 改名）
  defaultDuration: number        // 分钟（替代 end）
  earliestStart?: string | null  // HH:MM，可选约束   ← 新增
  latestStart?: string | null    // HH:MM，可选约束   ← 新增
  shortestDuration?: number | null // 分钟，可选约束   ← 新增
  activityArchetypeId?: string | null                // ← 新增
  source: TemplateRowSource
  sourceId?: string
}
```

类型定义在 `lib/db/schema.ts`（`TemplateRow` interface）+ USOM 对应类型同步。

### 3.2 迁移策略：仓库 lazy 自愈 + 可选 prod 回填

- **仓库 mapper 自愈**（主路径）：`mapRowFromDb(raw)` 识别旧形状（有 `start`/`end`、无 `defaultStart`）→ 现场转换 `defaultStart = start`、`defaultDuration = 分钟差(end, start)`；`mapRowToDb(row)` 永远写新形状。随用户编辑自然收敛，零迁移文件、零 DDL、绕开 snapshot 债。
- **可选 prod 回填 SQL**（纯 DML，幂等）：给用户在 prod 用 psql 跑一次，`WHERE rows::text LIKE '%"start"%'` 守护，保持数据整洁。dev 库可不管（自愈覆盖）。
- 新约束字段 + `activityArchetypeId` 旧数据置 `null`。

### 3.3 列表展示（TemplateCard）

每行从 `{start}–{end}：{activityName}` 改为：
```
{defaultStart} · {defaultDuration}分钟 · {activityName} · [原型标签 | 来源徽章]
```
- **custom 行**：显示 `row.activityArchetypeId` 解析出的原型标签。`getArchetypes()` 一次拉全量建 `Map<id, label>`（label = `l2Name`），列表级共享。
- **来源行**：列表显示来源徽章（习惯/任务/主线），原型**留到编辑抽屉**解析只读展示（列表保持廉价，不额外拉来源对象）。

### 3.4 编辑抽屉 RowEditor — 重排为多行卡片 + 行为分叉

单行横排塞不下 6 字段，改为多行卡片：

```
┌─ RowEditor ──────────────────────────────────────────┐
│ [来源] [活动名称/来源对象]                   [删除]   │
│ 活动原型: <ArchetypePicker variant=inline>           │
│ 默认开始 [HH:MM]   默认时长 [分钟]                   │
│ 最早开始 [HH:MM]   最迟开始 [HH:MM]   最短时长 [分钟] │
└──────────────────────────────────────────────────────┘
```

**行为按来源分叉**（落实需求「来源行豁免编辑但仍显示」）：
- **custom 行**：原型可编辑（`ArchetypePicker` + AI 匹配），5 个时间字段全部可编辑。
- **habit/task/thread 行**：原型**只读展示**（habit/task 从来源对象取 `activityArchetypeId`，thread 无原型则空）；时间字段**只读展示**来源锁定值；约束字段只读空。
- `fetchSubscriptionSources`（`app/actions/timebox-templates.ts`）扩展：返回的 habits/tasks 项补带 `activityArchetypeId`（threads 无）。

### 3.5 校验（纯函数 `validateTemplateRow`，client 复用）

- `defaultDuration > 0`
- `earliestStart ≤ defaultStart ≤ latestStart`（存在时）
- `shortestDuration ≤ defaultDuration`（存在时）
- HH:MM 格式合法

抽为 `domains/timebox/lib/template-row-helpers.ts` 纯函数，RowEditor onBlur 调用 + 单测覆盖。

---

## 4. Cross-cutting

### 4.1 文档同步（Tier 2 强制，先于代码）

- `docs/database-design.md`：`timebox_templates.rows` 的 `TemplateRow` 字段表更新（去 start/end、加 defaultStart/defaultDuration/3 约束/activityArchetypeId）。
- `docs/usom-design.md`：对应 USOM 类型同步。
- `CHANGELOG.md`：加 `[027]` 段（Phase A + Phase B 改动清单 + 决策 + 验证）。
- `manifest.md`：Phase A/B 均无新 CNUI surface（见 4.3），仅加版本入口指针。

### 4.2 测试

- `ArchetypePicker` variant（card/inline）渲染 + AI 匹配调用 + readOnly 测试。
- 各迁移消费方冒烟（字段存在、AI prop 传递）。
- Phase B：`validateTemplateRow` 纯函数全分支；`mapRowFromDb` 旧/新形状双路径；RowEditor custom-vs-source 行为分叉。
- vitest baseline=head 零新增失败；tsc 零新增错误（双验证，见 [[feedback_vitest-pitfalls]]）。

### 4.3 Manifest / CNUI 注册

- **无新 CNUI surface**：HabitCreationCard 已注册，加字段不改注册；task-create-drawer / task-edit-zone 是 Page 表单非 CNUI；其余是改既有 surface 字段。**规避 [[project-cnui-surface-dual-registration]] 四注册陷阱**。
- 无 intent_trigger 新增。

### 4.4 分阶段 / PR 策略

- **Phase A 先**（独立、低风险、纯 UI 组件统一 + 补字段），独立分支 `feat/027-a-archetype-unify` → 单独 ship + 提 PR。
- **Phase B 后**（JSONB 形状变更 + 迁移 + 编辑器重构），从 Phase A 合并后的 main 切 `feat/027-b-template-enhance`（依赖 Phase A 的统一 `ArchetypePicker`，RowEditor 复用）。
- 两个阶段 = 两个分支 = 两个 PR，便于独立 review 与回滚。跨分支合并由用户在 gitee 网页确认（[[feedback_no-self-merge]]）。

---

## 5. 决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 范围界定 | 单 spec 全做，分阶段实现 | 主题 cohesive（原型界面规范），高风险 schema 变更隔离到 Phase B |
| 统一机制 | 方案 A：单一组件 + `variant` prop | 真正「改一处全同步」，card 作 appointment 参照、inline 顾及密集表单密度 |
| Phase B 时间模型 | 替换 `end`→`defaultDuration`，加 3 约束字段；custom 可编辑、来源行豁免编辑但显示 | 落实需求 3.2；模板行从固定时段升级为带约束可调度活动 |
| 迁移路径 | 仓库 lazy 自愈 + 可选 SQL 回填 | 无 DDL 绕开 snapshot 债；自愈零风险收敛 |
| 列表原型展示 | custom 行显示原型标签、来源行显示来源徽章 | 列表保持廉价，原型解析留到编辑抽屉 |
| /tasks 编辑入口 | task-edit-zone 作主入口，detail-drawer 保持只读 | 页面内 inline 编辑最自然；detail-drawer 职责为展示 |

## 6. 不在 scope

- `activity_archetypes` 表结构、USOM archetype 本体、AI 匹配算法（均复用现状，不改）。
- threads 加原型 FK（threads 当前无原型，保持）。
- Timebox 模板「来源行列表内解析原型」（留到编辑抽屉，避免列表 N+1）。
- 生产部署（本任务到 ship-ready + push 为止；`/ship + /land-and-deploy + /canary` 视用户需要另启）。

## 7. 验收标准

- 11 处原型消费方全部使用单一 `ArchetypePicker`（`variant` 区分视觉），`archetype-picker-card.tsx` 删除；grep 确认零旧引用。
- 所有可编辑消费方具备「AI 匹配 + 选择」；`/tasks` 页面可创建 + inline 编辑任务原型。
- Timebox 模板列表显示原型（custom 行）/来源徽章；编辑抽屉 custom 行可编辑原型 + 5 时间字段，来源行只读显示。
- `TemplateRow` 新形状落地；`mapRowFromDb` 双路径单测通过；`validateTemplateRow` 纯函数单测通过。
- Tier 2 文档（database-design / usom-design）+ CHANGELOG 同步。
- vitest baseline=head 零新增 / tsc 零新增 / pre-push hooks 全过。
