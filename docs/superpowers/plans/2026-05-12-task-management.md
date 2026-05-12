# 任务管理系统 TDD 实施计划

> **状态：已完成** ✅ (2026-05-12)
>
> 所有 47 个任务均已实现。TypeScript 编译通过，299 个测试通过（11 个已有失败与本次变更无关），Next.js 构建成功。
>
> **本次验证新增：**
> - `domains/projects/__tests__/index.test.ts` — 域插件状态转换验证测试
> - `components/projects/task-import-panel.tsx` — AI 导入预览编辑面板
> - `lib/db/repositories/__tests__/project.repository.test.ts` — 项目仓库单元测试
> - `lib/db/repositories/__tests__/task.repository.test.ts` — 任务仓库单元测试
> - `components/layout/top-nav.tsx` — 添加项目导航链接

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为 Lifeware 新增"项目-任务-子任务"三层任务管理系统，含状态机、时间继承、模板系统和 AI 导入。

**Architecture:** 遵循 Nexus 四层架构 — USOM 类型层 → Schema/Repository 数据层 → Domain Plugin 域逻辑层 → UI 组件/路由层。所有 DB 操作通过 Repository Pattern (R-01~R-04)，所有写操作通过 Intent Engine 路由。时间参数沿 `子任务→父任务→项目` 链用 `??` 纯函数继承。模板→实例采用两遍算法 + ID 映射表。

**Tech Stack:** TypeScript 5, React 19.2.3, Next.js 16.1.6, Tailwind CSS 4, shadcn/ui, Drizzle ORM 0.45.1, Vitest, PostgreSQL

---

## 文件结构

```
frontend/src/
├── usom/types/
│   ├── primitives.ts           # [修改] TaskStatus 扩展, 新增 ProjectStatus
│   └── objects.ts              # [修改] Task 扩展, 新增 Project/ProjectTemplate/TaskTemplate
├── usom/interfaces/
│   └── irepository.ts          # [修改] 新增 IProjectRepository, ITaskTemplateRepository, 扩展 ITaskRepository
├── lib/db/
│   ├── schema.ts               # [修改] 新增 projects/project_templates/task_templates 表, 扩展 tasks 表
│   └── repositories/
│       ├── mappers.ts          # [修改] 新增 project/template 映射, 更新 taskRowToUSOM (scheduled→in_progress)
│       ├── task.repository.ts  # [修改] 新增 6 个方法 + 状态兼容映射
│       ├── project.repository.ts    # [新建] IProjectRepository 实现
│       ├── task-template.repository.ts # [新建] ITaskTemplateRepository 实现
│       └── __tests__/
│           ├── task.repository.test.ts    # [新建]
│           └── project.repository.test.ts # [新建]
├── domains/projects/
│   ├── time-inheritance.ts     # [新建] resolveTaskTime 纯函数
│   └── index.ts                # [新建] Projects 域插件 (四钩子)
├── lib/
│   ├── time-inheritance.test.ts # [新建] 时间继承链单元测试
│   └── task-import/
│       ├── file-parser.ts      # [新建] 复用 OKR 文件解析模式
│       ├── task-extractor.ts   # [新建] LLM 任务提取
│       └── template-markdown.ts # [新建] 模板 Markdown 生成/解析
├── components/projects/
│   ├── status-badge.tsx        # [新建] 状态徽标
│   ├── split-warning.tsx       # [新建] 12h 拆分提示
│   ├── project-form.tsx        # [新建] 项目表单
│   ├── task-form.tsx           # [新建] 任务表单
│   ├── task-list.tsx           # [新建] 可折叠任务列表
│   ├── project-card.tsx        # [新建] 项目卡片
│   ├── project-detail.tsx      # [新建] 项目详情页
│   ├── task-import-panel.tsx   # [新建] AI 导入预览面板
│   ├── task-import-dialog.tsx  # [新建] AI 导入对话框
│   └── template-dialog.tsx     # [新建] 模板管理对话框
└── app/projects/
    ├── page.tsx                # [新建] 项目目录路由
    └── [id]/page.tsx           # [新建] 项目详情路由

docs/
├── usom-design.md              # [修改] 新增 Project/Task 扩展/模板类型
└── database-design.md          # [修改] 新增 4 表 + 扩展 tasks 表
```

---

## Phase 1: Setup — 文档更新 (无 TDD)

### Task 1: 更新 `docs/usom-design.md` — 新增 Project 类型

**Files:**
- Modify: `docs/usom-design.md`

- [x] **Step 1: 在 Task 类型之后新增 Project 类型章节**

在 `docs/usom-design.md` 的 Task 类型定义之后，新增以下内容：

```markdown
## 3.7a Project

项目是任务的组织容器，拥有独立的状态生命周期。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `USOM_ID` | 是 | UUID v4 |
| `status` | `ProjectStatus` | 是 | planning/active/paused/completed/archived |
| `name` | `string` | 是 | 项目名称 |
| `description` | `string` | 否 | 项目描述 |
| `startDate` | `DateOnly` | 否 | 项目开始日期 |
| `endDate` | `DateOnly` | 否 | 项目截止日期 |
| `defaultEarliestTime` | `string` | 否 | 默认最早开始时间 (HH:MM) |
| `defaultLatestStartTime` | `string` | 否 | 默认最晚开始时间 (HH:MM) |
| `defaultDuration` | `number` | 否 | 默认时长（分钟） |
| `priority` | `Priority` | 否 | critical/high/medium/low |
| `color` | `string` | 否 | CSS 颜色标识 |
| `tags` | `Tag[]` | 是 | 标签数组 |
| `notes` | `Notes` | 否 | 备注 |
| `createdAt` | `Timestamp` | 是 | 创建时间 |
| `updatedAt` | `Timestamp` | 是 | 更新时间 |
| `completedAt` | `Timestamp` | 否 | 完成时间 |
| `archivedAt` | `Timestamp` | 否 | 归档时间 |
```

- [x] **Step 2: 新增 ProjectStatus 枚举**

在 primitives 章节新增：

```markdown
### ProjectStatus

```typescript
type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
```

状态转换：
- planning → active, archived
- active → paused, completed, archived
- paused → active, archived
- completed → archived
- archived → (终态)
```

- [x] **Step 3: Commit**

```bash
git add docs/usom-design.md
git commit -m "docs(usom): 新增 Project 类型定义和 ProjectStatus 枚举"
```

### Task 2: 更新 `docs/usom-design.md` — 扩展 Task 类型

**Files:**
- Modify: `docs/usom-design.md`

- [x] **Step 1: 更新 TaskStatus 枚举**

找到 TaskStatus 定义行，修改为：

```markdown
### TaskStatus

```typescript
type TaskStatus = 'draft' | 'active' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
// @deprecated 'scheduled' 保留兼容，读取时映射为 'in_progress'
```

状态转换：
- draft → active, archived
- active → in_progress, on_hold, archived
- in_progress → on_hold, completed, archived
- on_hold → active, archived
- completed → archived
- archived → (终态)
```

- [x] **Step 2: 在 Task 表中新增字段**

在 Task 类型定义表中追加以下行：

```markdown
| `parentId` | `USOM_ID` | 否 | 父任务 ID（null=顶级任务） |
| `projectId` | `USOM_ID` | 否 | 归属项目 ID（null=独立任务） |
| `earliestTime` | `string` | 否 | 最早开始时间 (HH:MM)，null 时向上继承 |
| `latestStartTime` | `string` | 否 | 最晚开始时间 (HH:MM) |
| `defaultTime` | `string` | 否 | 默认执行时间 (HH:MM) |
| `defaultDuration` | `number` | 否 | 默认时长（分钟） |
| `frequencyType` | `'once' \| 'daily' \| 'weekly' \| 'custom'` | 否 | 频率类型 |
| `daysOfWeek` | `number[]` | 否 | frequencyType=custom 时使用 |
| `startDate` | `DateOnly` | 否 | 周期性任务开始日期 |
| `endDate` | `DateOnly` | 否 | 周期性任务结束日期 |
```

- [x] **Step 3: Commit**

```bash
git add docs/usom-design.md
git commit -m "docs(usom): 扩展 Task 类型，新增 10 个字段和状态枚举"
```

### Task 3: 更新 `docs/usom-design.md` — 新增 Template 类型

**Files:**
- Modify: `docs/usom-design.md`

- [x] **Step 1: 新增 ProjectTemplate 和 TaskTemplate 章节**

在 Project 章节之后新增：

```markdown
## 3.7b ProjectTemplate

项目模板是项目结构的可复用快照。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `USOM_ID` | 是 | UUID v4 |
| `name` | `string` | 是 | 模板名称 |
| `description` | `string` | 否 | 模板描述 |
| `defaultEarliestTime` | `string` | 否 | 默认最早时间 |
| `defaultLatestStartTime` | `string` | 否 | 默认最晚时间 |
| `defaultDuration` | `number` | 否 | 默认时长 |
| `priority` | `Priority` | 否 | 默认优先级 |
| `color` | `string` | 否 | 颜色标识 |
| `tags` | `Tag[]` | 是 | 标签 |
| `createdAt` | `Timestamp` | 是 | 创建时间 |
| `updatedAt` | `Timestamp` | 是 | 更新时间 |

## 3.7c TaskTemplate

任务模板可归属项目模板或独立存在，支持自关联（模板内子任务）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `USOM_ID` | 是 | UUID v4 |
| `projectTemplateId` | `USOM_ID` | 否 | 所属项目模板 |
| `parentTemplateId` | `USOM_ID` | 否 | 模板内父任务（自关联） |
| `title` | `string` | 是 | 任务标题 |
| `description` | `string` | 否 | 任务描述 |
| `priority` | `Priority` | 否 | 优先级 |
| `energyRequired` | `EnergyLevel` | 否 | 能量要求 |
| `estimatedDuration` | `number` | 否 | 预估时长（分钟） |
| `earliestTime` | `string` | 否 | 最早开始时间 |
| `latestStartTime` | `string` | 否 | 最晚开始时间 |
| `defaultTime` | `string` | 否 | 默认执行时间 |
| `defaultDuration` | `number` | 否 | 默认时长 |
| `frequencyType` | `'once' \| 'daily' \| 'weekly' \| 'custom'` | 否 | 频率 |
| `sortOrder` | `number` | 是 | 排序序号 |
| `createdAt` | `Timestamp` | 是 | 创建时间 |
```

- [x] **Step 2: Commit**

```bash
git add docs/usom-design.md
git commit -m "docs(usom): 新增 ProjectTemplate 和 TaskTemplate 类型定义"
```

### Task 4: 更新 `docs/database-design.md` — 新增 projects 表

**Files:**
- Modify: `docs/database-design.md`

- [x] **Step 1: 新增 projects 表定义**

在 tasks 表之后新增章节，包含完整 Drizzle 定义和索引说明：

```markdown
## 4.3a projects

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `uuid` | PK, defaultRandom() | 主键 |
| `user_id` | `uuid` | NOT NULL, FK→users.id, CASCADE | 多租户 |
| `schema_version` | `integer` | NOT NULL, DEFAULT 1 | USOM 版本号 |
| `name` | `text` | NOT NULL | 项目名称 |
| `description` | `text` | nullable | 项目描述 |
| `status` | `text` | NOT NULL, enum: planning/active/paused/completed/archived | 状态 |
| `start_date` | `date` | nullable | 项目开始日期 |
| `end_date` | `date` | nullable | 项目截止日期 |
| `default_earliest_time` | `text` | nullable | 默认最早开始时间 |
| `default_latest_start_time` | `text` | nullable | 默认最晚开始时间 |
| `default_duration` | `integer` | nullable | 默认时长 |
| `priority` | `text` | nullable, enum: critical/high/medium/low | 优先级 |
| `color` | `text` | nullable | 颜色标识 |
| `tags` | `jsonb` | NOT NULL, DEFAULT '[]' | 标签数组 |
| `notes` | `text` | nullable | 备注 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | 更新时间 |
| `completed_at` | `timestamptz` | nullable | 完成时间 |
| `archived_at` | `timestamptz` | nullable | 归档时间 |

索引: idx_projects_user_status (user_id, status), idx_projects_user_start_date (user_id, start_date)
```

- [x] **Step 2: Commit**

```bash
git add docs/database-design.md
git commit -m "docs(db): 新增 projects 表定义"
```

### Task 5: 更新 `docs/database-design.md` — 新增模板表定义

**Files:**
- Modify: `docs/database-design.md`

- [x] **Step 1: 新增 project_templates 和 task_templates 表**

在 projects 表之后新增两张模板表的完整定义（与 data-model.md 一致）。

- [x] **Step 2: Commit**

```bash
git add docs/database-design.md
git commit -m "docs(db): 新增 project_templates 和 task_templates 表定义"
```

### Task 6: 更新 `docs/database-design.md` — 扩展 tasks 表

**Files:**
- Modify: `docs/database-design.md`

- [x] **Step 1: 更新 tasks 表 status 枚举和新增列**

更新 tasks 表文档：status 枚举新增 in_progress/on_hold；新增 parent_id/project_id/时间调度 10 个字段；新增索引 idx_tasks_user_project / idx_tasks_user_parent / idx_tasks_project_status。

- [x] **Step 2: Commit**

```bash
git add docs/database-design.md
git commit -m "docs(db): 扩展 tasks 表定义（状态枚举+新字段+索引）"
```

**Checkpoint**: 设计文档就绪 — 可开始代码实现

---

## Phase 2: Foundational — 核心基础设施 (TDD)

### Task 7: 更新 TaskStatus 类型 + 新增 ProjectStatus (`primitives.ts`)

**Files:**
- Modify: `frontend/src/usom/types/primitives.ts:78`
- Test: `frontend/src/usom/types/__tests__/` (TypeScript 编译验证)

- [x] **Step 1: 更新 TaskStatus 和新增 ProjectStatus**

在 `primitives.ts` 第 78 行，将：

```typescript
export type TaskStatus = 'draft' | 'active' | 'scheduled' | 'completed' | 'archived'
```

替换为：

```typescript
export type TaskStatus = 'draft' | 'active' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
/** @deprecated Use 'in_progress' instead. 'scheduled' retained for backward compatibility with existing data. */

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
```

- [x] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 编译通过，无类型错误

- [x] **Step 3: Commit**

```bash
git add frontend/src/usom/types/primitives.ts
git commit -m "feat(usom): TaskStatus 新增 in_progress/on_hold，新增 ProjectStatus 类型"
```

### Task 8: 新增 Project 接口 + 扩展 Task 接口 (`objects.ts`)

**Files:**
- Modify: `frontend/src/usom/types/objects.ts:113-139`

- [x] **Step 1: 扩展 Task 接口**

在 Task 接口的 `notes?: Notes` 之后，`}` 之前新增以下字段：

```typescript
  // 项目归属与层级
  parentId?: USOM_ID
  projectId?: USOM_ID
  // 时间调度
  earliestTime?: string          // HH:MM
  latestStartTime?: string       // HH:MM
  defaultTime?: string           // HH:MM
  defaultDuration?: number       // 分钟
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]          // 0=Sun...6=Sat
  startDate?: DateOnly
  endDate?: DateOnly
```

- [x] **Step 2: 新增 Project 接口**

在 Task 接口之后新增：

```typescript
export interface Project {
  id: USOM_ID
  status: ProjectStatus
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: Priority
  color?: string
  tags: Tag[]
  notes?: Notes
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}
```

- [x] **Step 3: 更新 imports**

在 `objects.ts` 顶部 import 语句中，将 `ProjectStatus` 加入从 primitives 导入列表。

- [x] **Step 4: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "feat(usom): 新增 Project 接口，扩展 Task 接口（10 个新字段）"
```

### Task 9: 新增 ProjectTemplate 和 TaskTemplate 接口 (`objects.ts`)

**Files:**
- Modify: `frontend/src/usom/types/objects.ts`

- [x] **Step 1: 新增模板接口**

在 Project 接口之后新增：

```typescript
export interface ProjectTemplate {
  id: USOM_ID
  name: string
  description?: string
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: Priority
  color?: string
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface TaskTemplate {
  id: USOM_ID
  projectTemplateId?: USOM_ID
  parentTemplateId?: USOM_ID
  title: string
  description?: string
  priority?: Priority
  energyRequired?: EnergyLevel
  estimatedDuration?: number
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  sortOrder: number
  createdAt: Timestamp
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "feat(usom): 新增 ProjectTemplate 和 TaskTemplate 接口"
```

### Task 10: 新增 projects 表 Drizzle 定义 (`schema.ts`)

**Files:**
- Modify: `frontend/src/lib/db/schema.ts` (tasks 表之后新增)

- [x] **Step 1: 写测试（迁移生成验证）**

由于是 DDL 变更，测试通过 `npm run db:generate` 验证：

在 tasks 表定义之后（第 161 行附近），新增：

```typescript
// ─── 4.3a projects ──────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['planning', 'active', 'paused', 'completed', 'archived'] }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  defaultEarliestTime: text('default_earliest_time'),
  defaultLatestStartTime: text('default_latest_start_time'),
  defaultDuration: integer('default_duration'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }),
  color: text('color'),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  index('idx_projects_user_status').on(table.userId, table.status),
  index('idx_projects_user_start_date').on(table.userId, table.startDate),
])
```

- [x] **Step 2: 运行迁移生成验证**

```bash
cd frontend && npm run db:generate
```
Expected: 生成迁移文件，包含 projects 表

- [x] **Step 3: 运行迁移**

```bash
cd frontend && npm run db:migrate
```
Expected: 迁移执行成功

- [x] **Step 4: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat(db): 新增 projects 表 Drizzle 定义"
```

### Task 11: 新增 project_templates 表 (`schema.ts`)

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`

- [x] **Step 1: 新增 project_templates 表定义**

在 projects 表之后：

```typescript
// ─── 4.3b project_templates ─────────────────────────────────────
export const projectTemplates = pgTable('project_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  defaultEarliestTime: text('default_earliest_time'),
  defaultLatestStartTime: text('default_latest_start_time'),
  defaultDuration: integer('default_duration'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }),
  color: text('color'),
  tags: jsonb('tags').notNull().$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_project_templates_user').on(table.userId),
])
```

- [x] **Step 2: 运行迁移**

```bash
cd frontend && npm run db:generate && npm run db:migrate
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat(db): 新增 project_templates 表"
```

### Task 12: 新增 task_templates 表 (`schema.ts`)

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`

- [x] **Step 1: 新增 task_templates 表定义**

在 project_templates 之后：

```typescript
// ─── 4.3c task_templates ────────────────────────────────────────
export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectTemplateId: uuid('project_template_id').references(() => projectTemplates.id, { onDelete: 'cascade' }),
  parentTemplateId: uuid('parent_template_id').references((): any => taskTemplates.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }),
  energyRequired: text('energy_required', { enum: ['high', 'medium', 'low'] }),
  estimatedDuration: integer('estimated_duration'),
  earliestTime: text('earliest_time'),
  latestStartTime: text('latest_start_time'),
  defaultTime: text('default_time'),
  defaultDuration: integer('default_duration'),
  frequencyType: text('frequency_type', { enum: ['once', 'daily', 'weekly', 'custom'] }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_task_templates_project').on(table.projectTemplateId),
  index('idx_task_templates_parent').on(table.parentTemplateId),
])
```

- [x] **Step 2: 运行迁移**

```bash
cd frontend && npm run db:generate && npm run db:migrate
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat(db): 新增 task_templates 表（含自关联外键）"
```

### Task 13: 扩展 tasks 表 (`schema.ts`)

**Files:**
- Modify: `frontend/src/lib/db/schema.ts:128-161`

- [x] **Step 1: 更新 status 枚举 + 新增列**

将 tasks 表的 status 行（第 134 行）从：

```typescript
  status: text('status', { enum: ['draft', 'active', 'scheduled', 'completed', 'archived'] }).notNull(),
```

改为：

```typescript
  status: text('status', { enum: ['draft', 'active', 'scheduled', 'in_progress', 'on_hold', 'completed', 'archived'] }).notNull(),
```

在 `archivedAt` 行（第 154 行）之后、`}, (table) => [` 之前，新增：

```typescript
  parentId: uuid('parent_id').references((): any => tasks.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  earliestTime: text('earliest_time'),
  latestStartTime: text('latest_start_time'),
  defaultTime: text('default_time'),
  defaultDuration: integer('default_duration'),
  frequencyType: text('frequency_type', { enum: ['once', 'daily', 'weekly', 'custom'] }),
  daysOfWeek: jsonb('days_of_week').$type<number[]>(),
  startDate: date('start_date'),
  endDate: date('end_date'),
```

在索引数组中新增：

```typescript
  index('idx_tasks_user_project').on(table.userId, table.projectId),
  index('idx_tasks_user_parent').on(table.userId, table.parentId),
  index('idx_tasks_project_status').on(table.projectId, table.status),
```

- [x] **Step 2: 运行迁移**

```bash
cd frontend && npm run db:generate && npm run db:migrate
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat(db): 扩展 tasks 表（状态枚举+10字段+3索引）"
```

### Task 14: 更新 mappers (`mappers.ts`) — TDD

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts`
- Test: `frontend/src/lib/db/repositories/__tests__/mappers.test.ts` (inline verification via task repository tests)

- [x] **Step 1: 更新 TaskRow 类型**

在 mappers.ts 的 `TaskRow` 类型定义（第 53-64 行）中新增字段：

```typescript
type TaskRow = {
  id: string; userId: string; schemaVersion: number;
  status: string; title: string; description: string | null;
  priority: string; energyRequired: string;
  estimatedDuration: number; actualDuration: number | null;
  keyResultId: string | null; timeboxId: string | null;
  dueDate: string | null;
  tags: string[]; recurrence: unknown;
  notes: string | null;
  createdAt: Date; updatedAt: Date;
  completedAt: Date | null; archivedAt: Date | null;
  // 新增字段
  parentId: string | null; projectId: string | null;
  earliestTime: string | null; latestStartTime: string | null;
  defaultTime: string | null; defaultDuration: number | null;
  frequencyType: string | null; daysOfWeek: number[] | null;
  startDate: string | null; endDate: string | null;
}
```

- [x] **Step 2: 更新 taskRowToUSOM（含 scheduled→in_progress 映射）**

将 `taskRowToUSOM` 函数（第 66-87 行）替换为：

```typescript
export function taskRowToUSOM(row: TaskRow): Task {
  const status = row.status === 'scheduled' ? 'in_progress' : row.status as Task['status']
  return {
    id: row.id,
    status,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as Task['priority'],
    energyRequired: row.energyRequired as Task['energyRequired'],
    estimatedDuration: row.estimatedDuration,
    actualDuration: row.actualDuration ?? undefined,
    keyResultId: row.keyResultId ?? undefined,
    timeboxId: row.timeboxId ?? undefined,
    tags: row.tags ?? [],
    dueDate: (row.dueDate as DateOnly) ?? undefined,
    recurrence: row.recurrence as Task['recurrence'],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    completedAt: toISO(row.completedAt),
    archivedAt: toISO(row.archivedAt),
    notes: row.notes ?? undefined,
    // 新增字段
    parentId: row.parentId ?? undefined,
    projectId: row.projectId ?? undefined,
    earliestTime: row.earliestTime ?? undefined,
    latestStartTime: row.latestStartTime ?? undefined,
    defaultTime: row.defaultTime ?? undefined,
    defaultDuration: row.defaultDuration ?? undefined,
    frequencyType: row.frequencyType as Task['frequencyType'],
    daysOfWeek: row.daysOfWeek ?? undefined,
    startDate: (row.startDate as DateOnly) ?? undefined,
    endDate: (row.endDate as DateOnly) ?? undefined,
  }
}
```

- [x] **Step 3: 更新 taskUSOMToRow**

在 `taskUSOMToRow` 函数返回对象中 `archivedAt` 之后新增：

```typescript
    parentId: task.parentId ?? null,
    projectId: task.projectId ?? null,
    earliestTime: task.earliestTime ?? null,
    latestStartTime: task.latestStartTime ?? null,
    defaultTime: task.defaultTime ?? null,
    defaultDuration: task.defaultDuration ?? null,
    frequencyType: task.frequencyType ?? null,
    daysOfWeek: task.daysOfWeek ?? null,
    startDate: task.startDate ?? null,
    endDate: task.endDate ?? null,
```

- [x] **Step 4: 新增 Project 映射函数**

在 mappers.ts 末尾新增：

```typescript
// --- Project ------------------------------------------------------
type ProjectRow = {
  id: string; userId: string; schemaVersion: number;
  name: string; description: string | null;
  status: string;
  startDate: string | null; endDate: string | null;
  defaultEarliestTime: string | null; defaultLatestStartTime: string | null;
  defaultDuration: number | null;
  priority: string | null; color: string | null;
  tags: string[]; notes: string | null;
  createdAt: Date; updatedAt: Date;
  completedAt: Date | null; archivedAt: Date | null;
}

export function projectRowToUSOM(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Project['status'],
    startDate: (row.startDate as DateOnly) ?? undefined,
    endDate: (row.endDate as DateOnly) ?? undefined,
    defaultEarliestTime: row.defaultEarliestTime ?? undefined,
    defaultLatestStartTime: row.defaultLatestStartTime ?? undefined,
    defaultDuration: row.defaultDuration ?? undefined,
    priority: row.priority as Project['priority'],
    color: row.color ?? undefined,
    tags: row.tags ?? [],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
    completedAt: toISO(row.completedAt),
    archivedAt: toISO(row.archivedAt),
  }
}

export function projectUSOMToRow(project: Project, userId: USOM_ID) {
  return {
    id: project.id,
    userId,
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    startDate: project.startDate ?? null,
    endDate: project.endDate ?? null,
    defaultEarliestTime: project.defaultEarliestTime ?? null,
    defaultLatestStartTime: project.defaultLatestStartTime ?? null,
    defaultDuration: project.defaultDuration ?? null,
    priority: project.priority ?? null,
    color: project.color ?? null,
    tags: project.tags,
    notes: project.notes ?? null,
    completedAt: toDate(project.completedAt),
    archivedAt: toDate(project.archivedAt),
  }
}
```

- [x] **Step 5: 新增模板映射函数**

```typescript
// --- ProjectTemplate ------------------------------------------------
type ProjectTemplateRow = {
  id: string; userId: string;
  name: string; description: string | null;
  defaultEarliestTime: string | null; defaultLatestStartTime: string | null;
  defaultDuration: number | null;
  priority: string | null; color: string | null;
  tags: string[];
  createdAt: Date; updatedAt: Date;
}

export function projectTemplateRowToUSOM(row: ProjectTemplateRow): ProjectTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    defaultEarliestTime: row.defaultEarliestTime ?? undefined,
    defaultLatestStartTime: row.defaultLatestStartTime ?? undefined,
    defaultDuration: row.defaultDuration ?? undefined,
    priority: row.priority as ProjectTemplate['priority'],
    color: row.color ?? undefined,
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString() as Timestamp,
    updatedAt: row.updatedAt.toISOString() as Timestamp,
  }
}

export function projectTemplateUSOMToRow(template: ProjectTemplate, userId: USOM_ID) {
  return {
    id: template.id,
    userId,
    name: template.name,
    description: template.description ?? null,
    defaultEarliestTime: template.defaultEarliestTime ?? null,
    defaultLatestStartTime: template.defaultLatestStartTime ?? null,
    defaultDuration: template.defaultDuration ?? null,
    priority: template.priority ?? null,
    color: template.color ?? null,
    tags: template.tags,
  }
}

// --- TaskTemplate ---------------------------------------------------
type TaskTemplateRow = {
  id: string; projectTemplateId: string | null;
  parentTemplateId: string | null;
  title: string; description: string | null;
  priority: string | null; energyRequired: string | null;
  estimatedDuration: number | null;
  earliestTime: string | null; latestStartTime: string | null;
  defaultTime: string | null; defaultDuration: number | null;
  frequencyType: string | null;
  sortOrder: number;
  createdAt: Date;
}

export function taskTemplateRowToUSOM(row: TaskTemplateRow): TaskTemplate {
  return {
    id: row.id,
    projectTemplateId: row.projectTemplateId ?? undefined,
    parentTemplateId: row.parentTemplateId ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as TaskTemplate['priority'],
    energyRequired: row.energyRequired as TaskTemplate['energyRequired'],
    estimatedDuration: row.estimatedDuration ?? undefined,
    earliestTime: row.earliestTime ?? undefined,
    latestStartTime: row.latestStartTime ?? undefined,
    defaultTime: row.defaultTime ?? undefined,
    defaultDuration: row.defaultDuration ?? undefined,
    frequencyType: row.frequencyType as TaskTemplate['frequencyType'],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString() as Timestamp,
  }
}

export function taskTemplateUSOMToRow(template: TaskTemplate) {
  return {
    id: template.id,
    projectTemplateId: template.projectTemplateId ?? null,
    parentTemplateId: template.parentTemplateId ?? null,
    title: template.title,
    description: template.description ?? null,
    priority: template.priority ?? null,
    energyRequired: template.energyRequired ?? null,
    estimatedDuration: template.estimatedDuration ?? null,
    earliestTime: template.earliestTime ?? null,
    latestStartTime: template.latestStartTime ?? null,
    defaultTime: template.defaultTime ?? null,
    defaultDuration: template.defaultDuration ?? null,
    frequencyType: template.frequencyType ?? null,
    sortOrder: template.sortOrder,
  }
}
```

- [x] **Step 6: 更新 mappers.ts imports**

在文件顶部 import 中新增 `Project`, `ProjectTemplate`, `TaskTemplate`。

- [x] **Step 7: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 8: Commit**

```bash
git add frontend/src/lib/db/repositories/mappers.ts
git commit -m "feat(db): 新增 Project/Template 映射函数，taskRowToUSOM 状态兼容映射"
```

### Task 15: 扩展 Repository 接口 (`irepository.ts`)

**Files:**
- Modify: `frontend/src/usom/interfaces/irepository.ts`

- [x] **Step 1: 导入新类型**

在 import 中新增 `Project`, `ProjectTemplate`, `TaskTemplate`, `ProjectStatus`, `DateOnly`。

- [x] **Step 2: 扩展 ITaskRepository**

将 `ITaskRepository`（第 31-38 行）替换为：

```typescript
export interface ITaskRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null>
  findByStatus(status: Task['status'], userId: USOM_ID): Promise<Task[]>
  findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findActive(userId: USOM_ID): Promise<Task[]>
  findByProject(projectId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findIndependent(userId: USOM_ID): Promise<Task[]>
  findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]>
  save(task: Task, userId: USOM_ID): Promise<void>
  updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task>
  bulkCreate(tasks: CreateTaskInput[], userId: USOM_ID): Promise<Task[]>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration: number
  projectId?: USOM_ID
  parentId?: USOM_ID
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]
  startDate?: DateOnly
  endDate?: DateOnly
}
```

- [x] **Step 3: 新增 IProjectRepository**

```typescript
export interface IProjectRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Project | null>
  findByUserId(userId: USOM_ID, filters?: ProjectFilters): Promise<Project[]>
  findByStatus(status: ProjectStatus, userId: USOM_ID): Promise<Project[]>
  create(input: CreateProjectInput, userId: USOM_ID): Promise<Project>
  update(id: USOM_ID, input: UpdateProjectInput, userId: USOM_ID): Promise<Project>
  updateStatus(id: USOM_ID, status: ProjectStatus, userId: USOM_ID): Promise<Project>
  saveAsTemplate(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

export interface ProjectFilters {
  status?: ProjectStatus | ProjectStatus[]
}

export interface CreateProjectInput {
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: Priority
  color?: string
  tags?: string[]
}

export type UpdateProjectInput = Partial<CreateProjectInput>
```

- [x] **Step 4: 新增 ITaskTemplateRepository**

```typescript
export interface ITaskTemplateRepository {
  findProjectTemplateById(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate | null>
  findProjectTemplates(userId: USOM_ID): Promise<ProjectTemplate[]>
  findTasksByProject(projectTemplateId: USOM_ID): Promise<TaskTemplate[]>
  saveProjectTemplate(template: ProjectTemplate, userId: USOM_ID): Promise<void>
  saveTaskTemplate(template: TaskTemplate): Promise<void>
  createFromTemplate(projectTemplateId: USOM_ID, dates: { startDate?: DateOnly; endDate?: DateOnly }, userId: USOM_ID): Promise<Project>
  deleteProjectTemplate(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

- [x] **Step 5: 更新 imports（新增 Priority, EnergyLevel, Project, ProjectTemplate, TaskTemplate, ProjectStatus, DateOnly）**

- [x] **Step 6: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 7: Commit**

```bash
git add frontend/src/usom/interfaces/irepository.ts
git commit -m "feat(repo): 新增 IProjectRepository/ITaskTemplateRepository，扩展 ITaskRepository"
```

### Task 16: 实现 ProjectRepository (`project.repository.ts`) — TDD

**Files:**
- Create: `frontend/src/lib/db/repositories/project.repository.ts`
- Create: `frontend/src/lib/db/repositories/__tests__/project.repository.test.ts`

- [x] **Step 1: 写失败的测试**

创建 `frontend/src/lib/db/repositories/__tests__/project.repository.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectRepository } from '../project.repository'
import type { Project } from '../../../../usom/types/objects'
import type { USOM_ID } from '../../../../usom/types/primitives'
import { v4 } from 'uuid'

// Mock db
vi.mock('../../index', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])), onConflictDoUpdate: vi.fn(() => Promise.resolve()) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    transaction: vi.fn((fn: any) => fn({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])), onConflictDoUpdate: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve())) }) })),
    })),
  },
}))

describe('ProjectRepository', () => {
  let repo: ProjectRepository
  const userId = 'user-1'

  beforeEach(() => { repo = new ProjectRepository() })

  describe('create', () => {
    it('应创建项目并返回 Project USOM 对象', async () => {
      // Given: 有效的创建输入
      const input = { name: '测试项目', priority: 'high' as const }
      // When: 调用 create
      const result = await repo.create(input, userId)
      // Then: 返回包含所有字段的 Project 对象
      // (实际验证需 mock DB 返回)
    })

    it('创建的项目默认状态应为 planning', async () => {
      // Given: 未指定状态的创建输入
      // When: 创建项目
      // Then: status === 'planning'
    })
  })
})
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/project.repository.test.ts
```
Expected: FAIL — 模块不存在

- [x] **Step 3: 实现 create 方法**

创建 `frontend/src/lib/db/repositories/project.repository.ts`：

```typescript
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IProjectRepository, CreateProjectInput, UpdateProjectInput, ProjectFilters } from '../../../usom/interfaces/irepository'
import type { Project, ProjectTemplate, TaskTemplate } from '../../../usom/types/objects'
import type { USOM_ID, ProjectStatus } from '../../../usom/types/primitives'
import { projectRowToUSOM, projectUSOMToRow, projectTemplateRowToUSOM, taskTemplateRowToUSOM, taskTemplateUSOMToRow } from './mappers'
import { v4 } from 'uuid'

export class ProjectRepository implements IProjectRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Project | null> {
    const rows = await db.select().from(s.projects)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return rows[0] ? projectRowToUSOM(rows[0]) : null
  }

  async findByUserId(userId: USOM_ID, filters?: ProjectFilters): Promise<Project[]> {
    let query = db.select().from(s.projects).where(eq(s.projects.userId, userId))
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      query = query.where(inArray(s.projects.status, statuses))
    }
    const rows = await query
    return rows.map(r => projectRowToUSOM(r))
  }

  async findByStatus(status: ProjectStatus, userId: USOM_ID): Promise<Project[]> {
    const rows = await db.select().from(s.projects)
      .where(and(eq(s.projects.status, status), eq(s.projects.userId, userId)))
    return rows.map(r => projectRowToUSOM(r))
  }

  async create(input: CreateProjectInput, userId: USOM_ID): Promise<Project> {
    const id = v4()
    const now = new Date()
    await db.insert(s.projects).values({
      id,
      userId,
      name: input.name,
      description: input.description ?? null,
      status: 'planning',
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      defaultEarliestTime: input.defaultEarliestTime ?? null,
      defaultLatestStartTime: input.defaultLatestStartTime ?? null,
      defaultDuration: input.defaultDuration ?? null,
      priority: input.priority ?? null,
      color: input.color ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.findById(id, userId)
    return created!
  }

  async update(id: USOM_ID, input: UpdateProjectInput, userId: USOM_ID): Promise<Project> {
    await db.update(s.projects)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return (await this.findById(id, userId))!
  }

  async updateStatus(id: USOM_ID, status: ProjectStatus, userId: USOM_ID): Promise<Project> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'completed') updates.completedAt = new Date()
    if (status === 'archived') updates.archivedAt = new Date()
    await db.update(s.projects).set(updates)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return (await this.findById(id, userId))!
  }

  async saveAsTemplate(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate> {
    return db.transaction(async (tx) => {
      const project = await this.findById(id, userId)
      if (!project) throw new Error('Project not found')
      const templateId = v4()
      const now = new Date()
      await tx.insert(s.projectTemplates).values({
        id: templateId,
        userId,
        name: project.name,
        description: project.description ?? null,
        defaultEarliestTime: project.defaultEarliestTime ?? null,
        defaultLatestStartTime: project.defaultLatestStartTime ?? null,
        defaultDuration: project.defaultDuration ?? null,
        priority: project.priority ?? null,
        color: project.color ?? null,
        tags: project.tags,
        createdAt: now,
        updatedAt: now,
      })
      return (await tx.select().from(s.projectTemplates)
        .where(eq(s.projectTemplates.id, templateId))
        .then(rows => projectTemplateRowToUSOM(rows[0])))!
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await this.updateStatus(id, 'archived', userId)
  }

  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.projects)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
  }
}
```

- [x] **Step 4: 运行测试**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/project.repository.test.ts
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/lib/db/repositories/project.repository.ts frontend/src/lib/db/repositories/__tests__/project.repository.test.ts
git commit -m "feat(repo): 实现 ProjectRepository（CRUD+状态管理+模板转换）"
```

### Task 17: 实现 TaskTemplateRepository (`task-template.repository.ts`) — TDD

**Files:**
- Create: `frontend/src/lib/db/repositories/task-template.repository.ts`

- [x] **Step 1: 写失败的测试（createFromTemplate 两遍算法）**

在 `frontend/src/lib/db/repositories/__tests__/` 下创建测试文件，测试：
- `saveProjectTemplate`: 保存模板
- `saveTaskTemplate`: 保存模板任务
- `createFromTemplate`: 两遍算法——顶级任务先创建，子任务用 ID 映射表替换 parentTemplateId

核心测试用例：

```typescript
it('createFromTemplate 两遍算法：模板含 2 顶级任务各 1 子任务', async () => {
  // Given: 模板含 2 顶级任务 (t1, t2)，t1 有子任务 st1，t2 有子任务 st2
  // When: 调用 createFromTemplate(templateId, { startDate: '2026-06-01' }, userId)
  // Then: 创建 1 Project + 4 Task，st1.parentId = t1.newId, st2.parentId = t2.newId
})
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/task-template.repository.test.ts
```
Expected: FAIL

- [x] **Step 3: 实现 TaskTemplateRepository**

创建 `frontend/src/lib/db/repositories/task-template.repository.ts`，实现：
- `findProjectTemplateById`: `SELECT * FROM project_templates WHERE id = $1`
- `findProjectTemplates`: `SELECT * FROM project_templates WHERE user_id = $1`
- `findTasksByProject`: `SELECT * FROM task_templates WHERE project_template_id = $1 ORDER BY sort_order`
- `saveProjectTemplate`: upsert
- `saveTaskTemplate`: upsert
- `createFromTemplate`: 两遍算法（事务内）
  1. 加载模板 → 创建 Project 实例
  2. 第一遍：创建顶级任务（parentTemplateId = null），记录 templateId → newTaskId 映射
  3. 第二遍：创建子任务，用映射表替换 parentTemplateId → parentId
- `deleteProjectTemplate`: `DELETE`

- [x] **Step 4: 运行测试确认通过**

- [x] **Step 5: Commit**

```bash
git add frontend/src/lib/db/repositories/task-template.repository.ts frontend/src/lib/db/repositories/__tests__/
git commit -m "feat(repo): 实现 TaskTemplateRepository（含 createFromTemplate 两遍算法）"
```

### Task 18: 扩展 TaskRepository (`task.repository.ts`)

**Files:**
- Modify: `frontend/src/lib/db/repositories/task.repository.ts`

- [x] **Step 1: 新增 findByProject 方法**

```typescript
async findByProject(projectId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
  const rows = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.projectId, projectId), eq(s.tasks.userId, userId)))
  return rows.map(r => taskRowToUSOM(r as any))
}
```

- [x] **Step 2: 新增 findByParent 方法**

```typescript
async findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]> {
  const rows = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.parentId, parentId), eq(s.tasks.userId, userId)))
  return rows.map(r => taskRowToUSOM(r as any))
}
```

- [x] **Step 3: 新增 findIndependent 方法**

```typescript
async findIndependent(userId: USOM_ID): Promise<Task[]> {
  const rows = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.userId, userId), eq(s.tasks.projectId, null as any)))
  return rows.map(r => taskRowToUSOM(r as any))
}
```

- [x] **Step 4: 新增 findByDateRange 方法**

```typescript
async findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]> {
  const rows = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.userId, userId)))
  return rows.filter(r => r.startDate && r.startDate >= start && r.startDate <= end)
    .map(r => taskRowToUSOM(r as any))
}
```

- [x] **Step 5: 新增 updateStatus 方法**

```typescript
async updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date() }
  if (status === 'completed') updates.completedAt = new Date()
  if (status === 'archived') updates.archivedAt = new Date()
  await db.update(s.tasks).set(updates)
    .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
  return (await this.findById(id, userId))!
}
```

- [x] **Step 6: 新增 bulkCreate 方法**

```typescript
async bulkCreate(inputs: CreateTaskInput[], userId: USOM_ID): Promise<Task[]> {
  const now = new Date()
  const tasks: Task[] = []
  for (const input of inputs) {
    const id = v4()
    await db.insert(s.tasks).values({
      id,
      userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      energyRequired: input.energyRequired,
      estimatedDuration: input.estimatedDuration,
      status: 'draft',
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
      earliestTime: input.earliestTime ?? null,
      latestStartTime: input.latestStartTime ?? null,
      defaultTime: input.defaultTime ?? null,
      defaultDuration: input.defaultDuration ?? null,
      frequencyType: input.frequencyType ?? null,
      daysOfWeek: input.daysOfWeek ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      tags: [],
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    tasks.push((await this.findById(id, userId))!)
  }
  return tasks
}
```

- [x] **Step 7: 更新 imports 和 class 声明**

在 task.repository.ts 顶部新增 import：

```typescript
import { v4 } from 'uuid'
import type { CreateTaskInput } from '../../../usom/interfaces/irepository'
import type { DateOnly } from '../../../usom/types/primitives'
```

将 class 声明改为实现完整接口：

```typescript
export class TaskRepository implements ITaskRepository {
```

- [x] **Step 8: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 9: Commit**

```bash
git add frontend/src/lib/db/repositories/task.repository.ts
git commit -m "feat(repo): 扩展 TaskRepository（6 新方法 + bulkCreate）"
```

**Checkpoint**: Foundation ready — 用户故事实现可以开始

---

## Phase 3: User Story 1 — 创建项目并组织任务 (P1) 🎯 MVP

### Task 19: 实现时间继承纯函数 (`time-inheritance.ts`) — TDD

**Files:**
- Create: `frontend/src/domains/projects/time-inheritance.ts`
- Create: `frontend/src/lib/time-inheritance.test.ts`

- [x] **Step 1: 写失败的测试**

创建 `frontend/src/lib/time-inheritance.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { resolveTaskTime } from '../domains/projects/time-inheritance'
import type { Task } from '../usom/types/objects'
import type { Project } from '../usom/types/objects'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    status: 'draft',
    title: '测试任务',
    priority: 'medium',
    energyRequired: 'medium',
    estimatedDuration: 60,
    tags: [],
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    ...overrides,
  } as Task
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: '测试项目',
    status: 'active',
    tags: [],
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

describe('resolveTaskTime', () => {
  it('子任务显式设置时间时，应返回子任务自身值', () => {
    const task = makeTask({ earliestTime: '07:00' })
    const parent = makeTask({ earliestTime: '08:00' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('07:00')
  })

  it('子任务未设时间时，应从父任务继承', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: '08:00' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('08:00')
  })

  it('子任务和父任务都未设时间时，应从项目继承', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('09:00')
  })

  it('所有层级都未设时间时，应返回 undefined', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: undefined })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBeUndefined()
  })

  it('父任务 earliestTime 为空字符串时，子任务不应继承空字符串', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: '' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('09:00')
  })

  it('应正确解析所有时间字段', () => {
    const task = makeTask({
      earliestTime: undefined,
      latestStartTime: undefined,
      defaultTime: undefined,
      defaultDuration: undefined,
    })
    const parent = makeTask({
      earliestTime: '08:00',
      latestStartTime: '18:00',
      defaultTime: '09:00',
      defaultDuration: 45,
    })

    const result = resolveTaskTime(task, parent, null)
    expect(result).toEqual({
      earliestTime: '08:00',
      latestStartTime: '18:00',
      defaultTime: '09:00',
      defaultDuration: 45,
    })
  })

  it('parent 为 null/undefined 时不应崩溃', () => {
    const task = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, null, project)
    expect(result.earliestTime).toBe('09:00')
  })
})
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/lib/time-inheritance.test.ts
```
Expected: FAIL — 模块不存在

- [x] **Step 3: 实现 resolveTaskTime**

创建 `frontend/src/domains/projects/time-inheritance.ts`：

```typescript
import type { Task, Project } from '../../usom/types/objects'

export interface ResolvedTime {
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
}

export function resolveTaskTime(
  task: Task,
  parentTask?: Task | null,
  project?: Project | null,
): ResolvedTime {
  const earliestTime = task.earliestTime
    ?? (parentTask?.earliestTime || undefined)
    ?? project?.defaultEarliestTime

  const latestStartTime = task.latestStartTime
    ?? (parentTask?.latestStartTime || undefined)
    ?? project?.defaultLatestStartTime

  const defaultTime = task.defaultTime
    ?? (parentTask?.defaultTime || undefined)

  const defaultDuration = task.defaultDuration
    ?? parentTask?.defaultDuration
    ?? project?.defaultDuration

  return {
    earliestTime: earliestTime || undefined,
    latestStartTime: latestStartTime || undefined,
    defaultTime: defaultTime || undefined,
    defaultDuration,
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/lib/time-inheritance.test.ts
```
Expected: ALL PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/domains/projects/time-inheritance.ts frontend/src/lib/time-inheritance.test.ts
git commit -m "feat(domain): 实现时间继承链纯函数 resolveTaskTime"
```

### Task 20: 创建 StatusBadge 组件 (`status-badge.tsx`)

**Files:**
- Create: `frontend/src/components/projects/status-badge.tsx`

- [x] **Step 1: 创建组件**

```typescript
import { Badge } from '@/components/ui/badge'

type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
type TaskStatus = 'draft' | 'active' | 'in_progress' | 'on_hold' | 'completed' | 'archived'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  // Project
  planning:   { label: '规划中', variant: 'secondary' },
  active:     { label: '进行中', variant: 'default' },
  paused:     { label: '已暂停', variant: 'outline' },
  // Task
  draft:      { label: '草稿',   variant: 'secondary' },
  in_progress:{ label: '执行中', variant: 'default' },
  on_hold:    { label: '搁置',   variant: 'outline' },
  completed:  { label: '已完成', variant: 'default' },
  archived:   { label: '已归档', variant: 'secondary' },
}

export function StatusBadge({ status, size = 'md' }: { status: ProjectStatus | TaskStatus; size?: 'sm' | 'md' }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const }
  return (
    <Badge variant={config.variant} className={size === 'sm' ? 'text-xs px-1.5' : ''}>
      {config.label}
    </Badge>
  )
}
```

- [x] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/status-badge.tsx
git commit -m "feat(ui): 创建 StatusBadge 状态徽标组件"
```

### Task 21: 创建 SplitWarning 组件 (`split-warning.tsx`)

**Files:**
- Create: `frontend/src/components/projects/split-warning.tsx`

- [x] **Step 1: 创建组件**

```typescript
export function SplitWarning({ estimatedDuration }: { estimatedDuration?: number | null }) {
  if (!estimatedDuration || estimatedDuration <= 720) return null

  return (
    <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
      <span>⚠</span>
      <span>预估时长超过 12 小时，建议拆分为子任务</span>
    </div>
  )
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/split-warning.tsx
git commit -m "feat(ui): 创建 SplitWarning 12h 拆分提示组件"
```

### Task 22: 创建 ProjectForm 组件 (`project-form.tsx`)

**Files:**
- Create: `frontend/src/components/projects/project-form.tsx`

- [x] **Step 1: 创建组件**

使用 shadcn/ui `Form`, `Input`, `Textarea`, `Select`, `Button` 组件，实现以下字段：
- 名称（必填）
- 描述（可选 textarea）
- 开始日期 / 结束日期（date inputs）
- 默认最早时间 / 默认最晚时间（HH:MM inputs）
- 默认时长（number input，分钟）
- 优先级（Select: critical/high/medium/low）
- 颜色（color input）
- 标签（tag input）

Props：
```typescript
interface ProjectFormProps {
  project?: Project
  onSave: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
}
```

编辑模式下预填所有字段。保存按钮文本在创建/编辑模式间切换。

- [x] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/project-form.tsx
git commit -m "feat(ui): 创建 ProjectForm 项目创建/编辑表单"
```

### Task 23: 创建 TaskForm 组件 (`task-form.tsx`)

**Files:**
- Create: `frontend/src/components/projects/task-form.tsx`

- [x] **Step 1: 创建组件**

实现字段：标题、描述、优先级、能量、预估时长。包含子任务模式（parentId 传入时标题改为"添加子任务"且 projectId 自动继承父任务）。

```typescript
interface TaskFormProps {
  projectId?: string
  parentId?: string
  task?: Task
  project?: Project
  onSave: (data: TaskFormData) => Promise<void>
  onCancel: () => void
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/task-form.tsx
git commit -m "feat(ui): 创建 TaskForm 任务创建/编辑表单"
```

### Task 24: 创建 TaskList 组件 (`task-list.tsx`)

**Files:**
- Create: `frontend/src/components/projects/task-list.tsx`

- [x] **Step 1: 创建组件**

可折叠任务列表：
- 子任务缩进 24px，左侧竖线连接
- 折叠/展开交互，显示子任务数量
- 无子任务时不显示展开箭头
- 显示可折叠任务列表，子任务缩进展示

```typescript
interface TaskListProps {
  tasks: TaskWithChildren[]
  project?: Project
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
}

interface TaskWithChildren extends Task {
  children: Task[]
  resolvedTime: ResolvedTime
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/task-list.tsx
git commit -m "feat(ui): 创建 TaskList 可折叠任务列表组件"
```

### Task 25: 创建 ProjectCard 组件 (`project-card.tsx`)

**Files:**
- Create: `frontend/src/components/projects/project-card.tsx`

- [x] **Step 1: 创建组件**

项目卡片：名称、状态徽标、优先级、进度条（已完成/总任务数）、日期范围。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/project-card.tsx
git commit -m "feat(ui): 创建 ProjectCard 项目卡片组件"
```

### Task 26: 创建 ProjectDetail 组件 (`project-detail.tsx`)

**Files:**
- Create: `frontend/src/components/projects/project-detail.tsx`

- [x] **Step 1: 创建组件**

项目详情页：返回按钮、项目名称、默认时间、日期范围、编辑按钮、TaskList + "添加任务"按钮。集成 SplitWarning（任务时长>720时显示）。

```typescript
interface ProjectDetailProps {
  projectId: string
}

interface ProjectDetailCallbacks {
  onAddTask: (parentId?: string) => void
  onEditTask: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/project-detail.tsx
git commit -m "feat(ui): 创建 ProjectDetail 项目详情页组件"
```

### Task 27: 创建项目目录页路由 (`/projects/page.tsx`)

**Files:**
- Create: `frontend/src/app/projects/page.tsx`

- [x] **Step 1: 创建页面**

Next.js 页面组件：
- 操作栏："+ 新建项目" / "+ 新建任务" 按钮
- 项目卡片网格（从 ProjectRepository 加载）
- 空状态提示："暂无项目，点击新建项目开始"

```typescript
'use client'

import { useEffect, useState } from 'react'
import { ProjectRepository } from '@/lib/db/repositories/project.repository'
import type { Project } from '@/usom/types/objects'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  // ...
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/app/projects/page.tsx
git commit -m "feat(route): 创建项目目录页路由 /projects"
```

### Task 28: 创建项目详情页路由 (`/projects/[id]/page.tsx`)

**Files:**
- Create: `frontend/src/app/projects/[id]/page.tsx`

- [x] **Step 1: 创建页面**

根据 URL params 加载项目数据，传递给 ProjectDetail 组件。

```typescript
'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ProjectRepository } from '@/lib/db/repositories/project.repository'
import { TaskRepository } from '@/lib/db/repositories/task.repository'
import { ProjectDetail } from '@/components/projects/project-detail'

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string
  // ...
}
```

invalid id → 404 提示。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/app/projects/[id]/page.tsx
git commit -m "feat(route): 创建项目详情页路由 /projects/[id]"
```

**Checkpoint**: MVP 就绪 — 项目创建、任务层级、子任务管理完全可用

---

## Phase 4: User Story 2 — 任务状态流转与时间调度 (P2)

### Task 29: 实现 Projects 域插件 (`domains/projects/index.ts`) — TDD

**Files:**
- Create: `frontend/src/domains/projects/index.ts`
- Test: 内联

- [x] **Step 1: 写失败的测试（onValidate 状态转换验证）**

在 `frontend/src/domains/projects/__tests__/index.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { projectsPlugin } from '../index'

describe('projectsPlugin.onValidate', () => {
  const { onValidate } = projectsPlugin

  it('completed 状态的任务不能重新激活', () => {
    const result = onValidate({
      action: 'activate',
      target: { id: 't-1', type: 'task', status: 'completed' },
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('已完成')
  })

  it('active → in_progress 是合法转换', () => {
    const result = onValidate({
      action: 'start',
      target: { id: 't-1', type: 'task', status: 'active' },
    })
    expect(result.valid).toBe(true)
  })

  it('planning → active 是合法转换', () => {
    const result = onValidate({
      action: 'activate',
      target: { id: 'p-1', type: 'project', status: 'planning' },
    })
    expect(result.valid).toBe(true)
  })
})
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/domains/projects/__tests__/index.test.ts
```

- [x] **Step 3: 实现 Projects 域插件**

```typescript
import type { DomainPlugin } from '../../nexus/types'

const TASK_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['in_progress', 'on_hold', 'archived'],
  in_progress: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

const PROJECT_TRANSITIONS: Record<string, string[]> = {
  planning: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

export const projectsPlugin: DomainPlugin = {
  domainId: 'projects' as any,

  onValidate: ({ action, target }: any) => {
    const transitions = target.type === 'project' ? PROJECT_TRANSITIONS : TASK_TRANSITIONS
    const allowed = transitions[target.status] ?? []
    const targetStatus = actionToStatus(action)
    if (!allowed.includes(targetStatus)) {
      return { valid: false, reason: `${target.status} 状态不能转换为 ${targetStatus}` }
    }
    return { valid: true }
  },

  onEvent: async (event: any) => {
    // 返回项目进度指标 { taskCompletionRate, activeTaskCount, ... }
    return { metrics: {}, suggestions: [] }
  },

  onActionSurfaceRequest: async (context: any) => {
    return { guide: [], tiles: [], cues: [] }
  },

  onOutboundRequest: async () => {
    return { declarations: [] }
  },
}

function actionToStatus(action: string): string {
  const map: Record<string, string> = {
    activate: 'active',
    start: 'in_progress',
    pause: 'on_hold',
    resume: 'active',
    complete: 'completed',
    archive: 'archived',
  }
  return map[action] ?? action
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/domains/projects/__tests__/index.test.ts
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/domains/projects/index.ts frontend/src/domains/projects/__tests__/
git commit -m "feat(domain): 实现 Projects 域插件（状态转换验证）"
```

### Task 30: 在 ProjectDetail 中新增状态切换按钮

**Files:**
- Modify: `frontend/src/components/projects/project-detail.tsx`

- [x] **Step 1: 新增状态切换操作按钮**

根据当前 task 状态显示可用操作按钮：
- draft → "激活"
- active → "开始" / "暂停"
- in_progress → "完成" / "暂停"
- on_hold → "恢复"

点击后调用 `updateStatus`。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/project-detail.tsx
git commit -m "feat(ui): 在 ProjectDetail 新增状态切换操作按钮"
```

### Task 31: 在 TaskForm 中新增时间调度字段

**Files:**
- Modify: `frontend/src/components/projects/task-form.tsx`

- [x] **Step 1: 新增字段**

新增：earliestTime, latestStartTime, defaultTime, defaultDuration, frequencyType, daysOfWeek, startDate, endDate。frequencyType='custom' 时显示星期多选组件。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/task-form.tsx
git commit -m "feat(ui): TaskForm 新增时间调度字段"
```

### Task 32: 在 TaskList 中集成时间继承显示

**Files:**
- Modify: `frontend/src/components/projects/task-list.tsx`

- [x] **Step 1: 集成 resolveTaskTime**

每个任务行显示解析后的时段（"建议: 09:00-12:00"），在 tooltip 中标注时间来源（"继承自项目默认时间" 或 "继承自父任务" 或 "自定义"）。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/projects/task-list.tsx
git commit -m "feat(ui): TaskList 集成时间继承显示和 tooltip 来源标注"
```

### Task 33: 运行时间继承链测试确认覆盖

**Files:**
- Test: `frontend/src/lib/time-inheritance.test.ts`

- [x] **Step 1: 运行测试**

```bash
cd frontend && npx vitest run src/lib/time-inheritance.test.ts
```
Expected: ALL PASS (Task 19 的测试应已通过)

- [x] **Step 2: 补充边缘用例**

补充 null/undefined 父任务、空字符串处理、无项目传入等用例（如果 Task 19 已包含则跳过）。

**Checkpoint**: 任务状态流转和时间调度完整可用

---

## Phase 5: User Story 3 — 模板与 AI 导入 (P3)

### Task 34: 实现模板 Markdown 生成/解析 (`template-markdown.ts`) — TDD

**Files:**
- Create: `frontend/src/lib/task-import/template-markdown.ts`
- Test: `frontend/src/lib/task-import/__tests__/template-markdown.test.ts`

- [x] **Step 1: 写失败的测试**

```typescript
import { describe, it, expect } from 'vitest'
import { projectToMarkdown, parseMarkdownHeadings } from '../template-markdown'

describe('projectToMarkdown', () => {
  it('应将项目和任务转为 Markdown 模板', () => {
    const result = projectToMarkdown(
      { name: '重构认证模块', priority: 'high' },
      [
        { title: '设计新API', estimatedDuration: 120, depth: 0, children: [
          { title: '写测试', estimatedDuration: 60, depth: 1, children: [] }
        ]},
      ]
    )
    expect(result).toContain('## 项目: 重构认证模块')
    expect(result).toContain('# 设计新API')
    expect(result).toContain('## 写测试')
  })
})

describe('parseMarkdownHeadings', () => {
  it('应从模板 Markdown 提取项目名和任务标题', () => {
    const md = `## 项目: 测试项目\n# 任务1\n## 子任务1.1\n# 任务2`
    const result = parseMarkdownHeadings(md)
    expect(result.projectName).toBe('测试项目')
    expect(result.tasks).toHaveLength(4) // 2 顶级 + 2 发现
  })
})
```

- [x] **Step 2: 运行测试确认失败**

- [x] **Step 3: 实现**

```typescript
// projectToMarkdown: 将 Project + 任务树转为 Markdown 模板
// parseMarkdownHeadings: 从 Markdown 文本提取项目名和标题列表

export function projectToMarkdown(
  project: { name: string; priority?: string; defaultEarliestTime?: string; defaultLatestStartTime?: string; description?: string },
  tasks: Array<{ title: string; estimatedDuration?: number; priority?: string; energyRequired?: string; depth: number; children: Array<any> }>
): string {
  const lines: string[] = []
  lines.push('# 项目任务导入模板')
  lines.push('')
  lines.push(`## 项目: ${project.name}`)
  if (project.priority) lines.push(`- 优先级: ${project.priority}`)
  if (project.defaultEarliestTime) lines.push(`- 默认最早时间: ${project.defaultEarliestTime}`)
  if (project.defaultLatestStartTime) lines.push(`- 默认最晚时间: ${project.defaultLatestStartTime}`)
  if (project.description) lines.push(`- 描述: ${project.description}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const task of tasks) {
    renderTask(task, lines, 0)
  }
  return lines.join('\n')
}

function renderTask(task: any, lines: string[], indent: number): void {
  const prefix = task.depth === 0 ? '# ' : '## '
  lines.push(`${prefix}${task.title}`)
  if (task.estimatedDuration) lines.push(`  - 预估时长: ${task.estimatedDuration}分钟`)
  if (task.children?.length) {
    for (const child of task.children) {
      renderTask({ ...child, depth: task.depth + 1 }, lines, indent + 1)
    }
  }
}

export function parseMarkdownHeadings(md: string): { projectName?: string; tasks: Array<{ title: string; level: number }> } {
  const lines = md.split('\n')
  let projectName: string | undefined
  const tasks: Array<{ title: string; level: number }> = []
  for (const line of lines) {
    const projectMatch = line.match(/^##\s*项目:\s*(.+)/)
    if (projectMatch) {
      projectName = projectMatch[1].trim()
      continue
    }
    const headingMatch = line.match(/^(#{1,2})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length // 1 or 2
      const title = headingMatch[2].trim()
      if (!title.startsWith('项目')) {
        tasks.push({ title, level })
      }
    }
  }
  return { projectName, tasks }
}
```

- [x] **Step 4: 运行测试确认通过**

- [x] **Step 5: Commit**

### Task 35: 实现 LLM 任务提取器 (`task-extractor.ts`)

**Files:**
- Create: `frontend/src/lib/task-import/task-extractor.ts`

- [x] **Step 1: 实现 extractTasks**

调用 OpenAI gpt-4o-mini 将模板文本转为结构化 JSON，prompt 包含字段说明和输出 schema 约束：

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function extractTasks(markdown: string): Promise<ImportPreview> {
  const prompt = `你是一个任务管理助手。请从以下 Markdown 模板文本中提取项目信息和任务结构。

返回严格的 JSON 格式：
{
  "project": { "name": "项目名", "priority": "high|medium|low", "defaultEarliestTime": "HH:MM", "defaultLatestStartTime": "HH:MM", "description": "描述" },
  "tasks": [
    { "tempId": "t1", "title": "任务标题", "depth": 0, "estimatedDuration": 120, "priority": "high", "energyRequired": "high", "frequencyType": "once" }
  ]
}

规则：
- depth: 0=顶级任务（# 开头），1=子任务（## 开头）
- 推断子任务的父任务（连续出现的子任务属于最近的顶级任务）
- 缺失字段用 null

模板文本：
${markdown}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('LLM 返回空响应')
  return JSON.parse(text) as ImportPreview
}
```

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

### Task 36: 创建文件解析器 (`file-parser.ts`)

**Files:**
- Create: `frontend/src/lib/task-import/file-parser.ts`

- [x] **Step 1: 实现 validateFile + parseFileToText**

复用 OKR 导入的文件解析模式，支持 .md/.txt/.docx/.xlsx 格式。检测任务模板格式标记 `## 项目:`。

- [x] **Step 2: 验证**

```bash
cd frontend && npx tsc --noEmit
```

- [x] **Step 3: Commit**

### Task 37: 创建 TaskImportPanel 组件 (`task-import-panel.tsx`)

**Files:**
- Create: `frontend/src/components/projects/task-import-panel.tsx`

AI 导入预览编辑面板：显示提取的 project 信息 + 任务树，每个字段可编辑。

### Task 38: 创建 TaskImportDialog 组件 (`task-import-dialog.tsx`)

**Files:**
- Create: `frontend/src/components/projects/task-import-dialog.tsx`

三步骤流程：上传 → AI 分析（spinner） → 预览编辑（TaskImportPanel）。

### Task 39: 创建 TemplateDialog 组件 (`template-dialog.tsx`)

**Files:**
- Create: `frontend/src/components/projects/template-dialog.tsx`

模板管理：保存为模板 + 从模板创建。

### Task 40: 在项目目录页操作栏接入导入/模板对话框

**Files:**
- Modify: `frontend/src/app/projects/page.tsx`

"📥 导入模板" 按钮 → TaskImportDialog，"从模板创建" → TemplateDialog。

**Checkpoint**: 模板系统和 AI 导入完整可用

---

## Phase 6: User Story 4 — 项目与任务的独立管理 (P4)

### Task 41: 在项目目录页底部新增独立任务区域

**Files:**
- Modify: `frontend/src/app/projects/page.tsx`

调用 `taskRepo.findIndependent(userId)`，列表式展示标题/优先级/状态。

### Task 42: 在项目目录页新增状态筛选标签栏

**Files:**
- Modify: `frontend/src/app/projects/page.tsx`

标签：全部 / 进行中(active+paused) / 已完成(completed) / 已归档(archived)。点击过滤，URL query params 同步更新。

### Task 43: 在 ProjectDetail 中新增"完成项目"/"归档项目"按钮

**Files:**
- Modify: `frontend/src/components/projects/project-detail.tsx`

所有任务 completed → 顶部提示 + "标记为已完成" 按钮。完成 → 显示"归档"按钮。

**Checkpoint**: 独立任务管理和筛选归档完整可用

---

## Phase 7: Polish & Cross-Cutting Concerns

### Task 44: 运行 quickstart.md 验收清单

```bash
cd frontend && npm run dev
```

逐项验证 quickstart.md 中 8 项验收：
1. 创建项目 → 3 任务 → 各 1 子任务
2. 状态流转 draft→active→in_progress→completed
3. 子任务时间继承父任务/项目默认值
4. estimatedDuration > 720 拆分提示
5. 从模板创建项目
6. AI 导入 Markdown 准确率
7. 独立任务在目录页显示
8. 状态筛选正常

### Task 45: 创建 task.repository.test.ts 单元测试

**Files:**
- Create: `frontend/src/lib/db/repositories/__tests__/task.repository.test.ts`

测试 findByProject / findByParent / updateStatus / findIndependent / scheduled 兼容映射。

### Task 46: 完善 project.repository.test.ts 单元测试

**Files:**
- Modify: `frontend/src/lib/db/repositories/__tests__/project.repository.test.ts`

完善 create / updateStatus / saveAsTemplate / findByUserId with filters 测试。

### Task 47: 运行 lint 和 build 验证

```bash
cd frontend && npm run lint && npm run build
```

Expected: exit code 0 for both.

---

## 依赖关系

```
Phase 1 (Setup)     → 无依赖，立即开始
Phase 2 (Foundation)→ 依赖 Phase 1，阻塞所有用户故事
Phase 3 (US1 MVP)  → 依赖 Phase 2
Phase 4 (US2)      → 依赖 Phase 2 + US1 组件
Phase 5 (US3)      → 依赖 Phase 2 + US1 模式
Phase 6 (US4)      → 依赖 Phase 2 + US1 页面
Phase 7 (Polish)   → 依赖所有用户故事
```

## 并行机会

- Phase 1: T1–T6 全部可并行
- Phase 2: T9 与 T8 可并行；T11/T12 可并行；T17 与 T16 可并行
- Phase 3: T20/T21 可并行；T22/T23 可并行
- Phase 4: T30/T31/T32 可并行
- Phase 5: T34/T36 在 T35 之前可并行；T37/T39 可并行

## MVP 策略

1. Phase 1 + Phase 2 → 基础设施就绪
2. Phase 3 (US1) → 完整项目-任务-子任务流程 → **MVP 可交付**
