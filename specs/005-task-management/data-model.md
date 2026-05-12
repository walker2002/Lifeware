# Data Model: 任务管理系统

**Phase 1 — 数据模型设计** | **Date**: 2026-05-12

## 概览

新增 4 张表 + 扩展 1 张表。所有表遵循 Multi-Tenancy (T-01: `user_id` FK)、Repository Pattern (R-01~R-04)、JSONB 使用规则。

```
projects ──1:N── tasks (project_id)     [任务可选归属项目]
tasks    ──1:N── tasks (parent_id)      [最多2层：任务→子任务]
project_templates ──1:N── task_templates (project_template_id)
task_templates ──自关联── task_templates (parent_template_id)
```

---

## 1. 新表: projects

项目是任务的组织容器，拥有独立的状态生命周期。

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
| `default_earliest_time` | `text` | nullable | 默认最早开始时间 (HH:MM) |
| `default_latest_start_time` | `text` | nullable | 默认最晚开始时间 (HH:MM) |
| `default_duration` | `integer` | nullable | 默认时长（分钟） |
| `priority` | `text` | nullable, enum: critical/high/medium/low | 优先级 |
| `color` | `text` | nullable | 颜色标识 (CSS color) |
| `tags` | `jsonb` | NOT NULL, DEFAULT '[]' | 标签数组 |
| `notes` | `text` | nullable | 备注 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | 更新时间 |
| `completed_at` | `timestamptz` | nullable | 完成时间 |
| `archived_at` | `timestamptz` | nullable | 归档时间 |

**索引**:
- `idx_projects_user_status` ON (`user_id`, `status`)
- `idx_projects_user_start_date` ON (`user_id`, `start_date`)

**Drizzle 定义**:

```typescript
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

**JSONB 合规**: `tags` 为元数据/配置类数组，符合 JSONB 使用规则。

---

## 2. 扩展表: tasks

在现有 tasks 表上新增项目归属、父子层级和时间调度字段。

### 现有列（不变）

`id`, `user_id`, `schema_version`, `title`, `description`, `priority`, `energy_required`, `estimated_duration`, `actual_duration`, `key_result_id`, `timebox_id`, `due_date`, `tags`, `recurrence`, `notes`, `created_at`, `updated_at`, `completed_at`, `archived_at`

### 变更: status 枚举

```diff
- status: text('status', { enum: ['draft', 'active', 'scheduled', 'completed', 'archived'] })
+ status: text('status', { enum: ['draft', 'active', 'scheduled', 'in_progress', 'on_hold', 'completed', 'archived'] })
```

> `scheduled` 保留以兼容旧数据，新写入使用 `in_progress`。详见 [research.md#r2](./research.md#r2-状态迁移兼容策略)。

### 新增列

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `parent_id` | `uuid` | nullable, FK→tasks.id, SET NULL | 父任务 ID（null=顶级任务） |
| `project_id` | `uuid` | nullable, FK→projects.id, SET NULL | 归属项目 ID（null=独立任务） |
| `earliest_time` | `text` | nullable | 最早开始时间 (HH:MM)，null 时向上继承 |
| `latest_start_time` | `text` | nullable | 最晚开始时间 (HH:MM) |
| `default_time` | `text` | nullable | 默认执行时间 (HH:MM) |
| `default_duration` | `integer` | nullable | 默认时长（分钟） |
| `frequency_type` | `text` | nullable, enum: once/daily/weekly/custom | 频率类型 |
| `days_of_week` | `jsonb` | nullable | frequency_type=custom 时使用 |
| `start_date` | `date` | nullable | 周期性任务开始日期 |
| `end_date` | `date` | nullable | 周期性任务结束日期 |

**新增索引**:
- `idx_tasks_user_project` ON (`user_id`, `project_id`)
- `idx_tasks_user_parent` ON (`user_id`, `parent_id`)
- `idx_tasks_project_status` ON (`project_id`, `status`)

**Drizzle 扩展定义**:

```typescript
// 在现有 tasks 表定义中新增的列
parentId: uuid('parent_id').references(() => tasks.id, { onDelete: 'set null' }),
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

**JSONB 合规**: `days_of_week` 为配置类数组（如 `[1,3,5]` 表示周一三五），符合规则。

**project_id 冗余策略**: 每个 task 直接带 `project_id`，不做层级推导。创建子任务时应用层继承父任务的 `project_id`。查询"某项目所有任务"只需 `WHERE project_id = X`，无需递归 CTE。

---

## 3. 新表: project_templates

项目模板是项目结构的可复用快照，不含实际日期和状态。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `uuid` | PK, defaultRandom() | 主键 |
| `user_id` | `uuid` | NOT NULL, FK→users.id, CASCADE | 多租户 |
| `name` | `text` | NOT NULL | 模板名称 |
| `description` | `text` | nullable | 模板描述 |
| `default_earliest_time` | `text` | nullable | 默认最早时间 |
| `default_latest_start_time` | `text` | nullable | 默认最晚时间 |
| `default_duration` | `integer` | nullable | 默认时长 |
| `priority` | `text` | nullable | 默认优先级 |
| `color` | `text` | nullable | 颜色标识 |
| `tags` | `jsonb` | NOT NULL, DEFAULT '[]' | 标签 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | 更新时间 |

**索引**:
- `idx_project_templates_user` ON (`user_id`)

```typescript
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

---

## 4. 新表: task_templates

任务模板可归属项目模板或独立存在，支持自关联（模板内子任务）。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `uuid` | PK, defaultRandom() | 主键 |
| `project_template_id` | `uuid` | nullable, FK→project_templates.id, CASCADE | 所属项目模板 |
| `parent_template_id` | `uuid` | nullable, FK→task_templates.id, SET NULL | 模板内父任务 |
| `title` | `text` | NOT NULL | 任务标题 |
| `description` | `text` | nullable | 任务描述 |
| `priority` | `text` | nullable | 优先级 |
| `energy_required` | `text` | nullable | 能量要求 |
| `estimated_duration` | `integer` | nullable | 预估时长（分钟） |
| `earliest_time` | `text` | nullable | 最早开始时间 |
| `latest_start_time` | `text` | nullable | 最晚开始时间 |
| `default_time` | `text` | nullable | 默认执行时间 |
| `default_duration` | `integer` | nullable | 默认时长 |
| `frequency_type` | `text` | nullable | 频率 |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | 排序序号 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_task_templates_project` ON (`project_template_id`)
- `idx_task_templates_parent` ON (`parent_template_id`)

```typescript
export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectTemplateId: uuid('project_template_id').references(() => projectTemplates.id, { onDelete: 'cascade' }),
  parentTemplateId: uuid('parent_template_id').references(() => taskTemplates.id, { onDelete: 'set null' }),
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

---

## 5. 状态转换图

### Project 状态

```
planning ──→ active ──→ completed ──→ archived
                ↓
              paused ──→ active
```

| 当前状态 | 允许的目标状态 |
|---|---|
| `planning` | `active`, `archived` |
| `active` | `paused`, `completed`, `archived` |
| `paused` | `active`, `archived` |
| `completed` | `archived` |
| `archived` | (终态) |

### Task 状态

```
draft ──→ active ──→ in_progress ──→ completed ──→ archived
                ↓
             on_hold ──→ active
```

| 当前状态 | 允许的目标状态 |
|---|---|
| `draft` | `active`, `archived` |
| `active` | `in_progress`, `on_hold`, `archived` |
| `in_progress` | `on_hold`, `completed`, `archived` |
| `on_hold` | `active`, `archived` |
| `completed` | `archived` |
| `archived` | (终态) |

---

## 6. USOM 类型变更

### 新增: Project

```typescript
export interface Project {
  id: USOM_ID
  status: ProjectStatus
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  defaultEarliestTime?: string    // HH:MM
  defaultLatestStartTime?: string // HH:MM
  defaultDuration?: number        // 分钟
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

### 扩展: Task（新增字段）

```typescript
// 在现有 Task 接口上新增:
parentId?: USOM_ID
projectId?: USOM_ID
earliestTime?: string
latestStartTime?: string
defaultTime?: string
defaultDuration?: number
frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
daysOfWeek?: number[]
startDate?: DateOnly
endDate?: DateOnly
```

### 新增枚举

```typescript
type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
// TaskStatus 变更:
// 旧: 'draft' | 'active' | 'scheduled' | 'completed' | 'archived'
// 新: 'draft' | 'active' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
// scheduled 保留兼容，标记 @deprecated
```

### 新增: ProjectTemplate, TaskTemplate

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

---

## 7. Repository 接口扩展

### 新增: IProjectRepository

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

### 扩展: ITaskRepository（新增方法）

```typescript
// 在现有 ITaskRepository 上新增:
findByProject(projectId: USOM_ID, userId: USOM_ID): Promise<Task[]>
findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]>
findIndependent(userId: USOM_ID): Promise<Task[]>          // projectId = null
findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]>
updateStatus(id: USOM_ID, status: TaskStatus, userId: USOM_ID): Promise<Task>
bulkCreate(tasks: CreateTaskInput[], userId: USOM_ID): Promise<Task[]>  // 模板实例化
```

### 新增: ITaskTemplateRepository

```typescript
export interface ITaskTemplateRepository {
  findProjectTemplateById(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate | null>
  findProjectTemplates(userId: USOM_ID): Promise<ProjectTemplate[]>
  findTasksByProject(projectTemplateId: USOM_ID): Promise<TaskTemplate[]>
  saveProjectTemplate(template: ProjectTemplate, userId: USOM_ID): Promise<void>
  saveTaskTemplate(template: TaskTemplate): Promise<void>  // 无 userId（通过 project_template_id 关联）
  createFromTemplate(projectTemplateId: USOM_ID, dates: { startDate?: DateOnly; endDate?: DateOnly }, userId: USOM_ID): Promise<Project>
  deleteProjectTemplate(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

---

## 8. 12 小时拆分提示

纯 UI 层逻辑，不涉及数据库。触发条件：`estimatedDuration > 720`（分钟）。显示黄色提示："⚠ 预估时长超过 12 小时，建议拆分为子任务"。不阻塞保存操作。
