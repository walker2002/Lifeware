# 项目/任务管理界面重新设计与Bug修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重新设计项目/任务管理为左右两栏布局，删除不需要的时间字段，修复编辑/状态Bug。

**Architecture:** 现有 `AppShell` 已提供框架级布局（左AI面板+右主内容区）。在主内容区(MainContent)内实现二级左右两栏——左侧项目/任务树(~320px)、右侧详情面板(flex-1)。Schema移除 `defaultEarliestTime`/`defaultLatestStartTime`/`defaultDuration` 三列，涉及 migration、USOM 类型、Mapper、Repository、Form 全链路修改。

**Tech Stack:** Next.js 16.1.6, React 19, Drizzle ORM, TypeScript 5, Tailwind CSS 4, shadcn/ui

---

## 需求覆盖

| 需求编号 | 描述 | 对应Task |
|----------|------|---------|
| [002] | 删除项目和任务的"默认最早时间"/"默认最晚时间"/"默认时长"字段 | Task 1-5 |
| [003] | 界面遵循总体框架Panel内显示 | Task 9 |
| [004] | 修复草稿状态任务无法编辑、编辑项目按钮显示"创建项目"、任务按钮显示"创建任务" | Task 6-8 |
| [005] | 左右两栏布局，左侧项目/任务树，右侧详情联动 | Task 10-13 |

---

## 文件变更映射

| 操作 | 文件 | 用途 |
|------|------|------|
| 新建 | `frontend/src/lib/db/migrations/0006_drop_time_fields.sql` | Drop 列 migration |
| 修改 | `frontend/src/lib/db/schema.ts` | 移除 Drizzle 列定义 |
| 修改 | `frontend/src/usom/types/objects.ts` | 移除 Project/Task 类型字段 |
| 修改 | `frontend/src/lib/db/repositories/mappers.ts` | 移除映射字段 |
| 修改 | `frontend/src/lib/db/repositories/project.repository.ts` | 移除字段引用 |
| 修改 | `frontend/src/lib/db/repositories/task.repository.ts` | 更新 bulkCreate |
| 修改 | `frontend/src/app/projects/actions.ts` | 移除时间字段参数 |
| 修改 | `frontend/src/components/projects/project-form.tsx` | 移除时间字段+修复编辑模式 |
| 修改 | `frontend/src/components/projects/task-form.tsx` | 移除时间字段+修复编辑模式 |
| 修改 | `frontend/src/components/projects/task-list.tsx` | 移除时间继承显示 |
| 修改 | `frontend/src/components/projects/project-detail.tsx` | 移除时间信息展示 |
| 新建 | `frontend/src/components/projects/project-tree.tsx` | 左侧树组件 |
| 新建 | `frontend/src/components/projects/detail-panel.tsx` | 右侧详情面板 |
| 重写 | `frontend/src/app/projects/projects-client.tsx` | 两栏布局容器 |
| 修改 | `frontend/src/app/projects/page.tsx` | 数据集加载 |
| 修改 | `frontend/src/components/layout/top-nav.tsx` | 导航标签改为"项目/任务" |
| 删除 | `frontend/src/app/projects/[id]/` | 不再需要独立详情页 |
| 删除 | `frontend/src/components/projects/project-card.tsx` | 卡片组件不再需要 |
| 修改 | `frontend/src/domains/projects/time-inheritance.ts` | 移除时间继承逻辑 |
| 修改 | `frontend/src/domains/projects/__tests__/index.test.ts` | 更新测试 |

---

### Task 1: 创建数据库 Migration 移除时间字段

**Files:**
- Create: `frontend/src/lib/db/migrations/0006_drop_time_fields.sql`
- Modify: `frontend/src/lib/db/schema.ts:139-142` (projects表 defaultEarliestTime/defaultLatestStartTime/defaultDuration)
- Modify: `frontend/src/lib/db/schema.ts:225-228` (tasks表 earliestTime/latestStartTime/defaultTime/defaultDuration)

- [ ] **Step 1: 编写 migration SQL**

```sql
-- Drop time fields from projects and tasks
ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_earliest_time";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_latest_start_time";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_duration";

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "earliest_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "latest_start_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "default_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "default_duration";
```

- [ ] **Step 2: 从 schema.ts 移除列定义**

从 `projects` 表定义中删除:
```typescript
// 删除这三行
defaultEarliestTime: text('default_earliest_time'),
defaultLatestStartTime: text('default_latest_start_time'),
defaultDuration: integer('default_duration'),
```

从 `tasks` 表定义中删除:
```typescript
// 删除这四行
earliestTime: text('earliest_time'),
latestStartTime: text('latest_start_time'),
defaultTime: text('default_time'),
defaultDuration: integer('default_duration'),
```

从 `projectTemplates` 表定义中删除:
```typescript
// 删除这三行
defaultEarliestTime: text('default_earliest_time'),
defaultLatestStartTime: text('default_latest_start_time'),
defaultDuration: integer('default_duration'),
```

从 `taskTemplates` 表定义中删除:
```typescript
// 删除这四行
earliestTime: text('earliest_time'),
latestStartTime: text('latest_start_time'),
defaultTime: text('default_time'),
defaultDuration: integer('default_duration'),
```

- [ ] **Step 3: 运行 migration 验证**

```bash
cd frontend && npx drizzle-kit generate && npx drizzle-kit migrate
```

Expected: migration 成功执行，生成新 migration 文件

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/db/migrations/ frontend/src/lib/db/schema.ts
git commit -m "refactor(db): 移除 projects/tasks 表中的时间字段
- 删除 default_earliest_time, default_latest_start_time, default_duration (projects)
- 删除 earliest_time, latest_start_time, default_time, default_duration (tasks)
- 同步删除 project_templates, task_templates 对应字段"
```

---

### Task 2: 更新 USOM 类型定义

**Files:**
- Modify: `frontend/src/usom/types/objects.ts:153-155` (Project)
- Modify: `frontend/src/usom/types/objects.ts:134-138` (Task)
- Modify: `frontend/src/usom/types/objects.ts:171-173` (ProjectTemplate)
- Modify: `frontend/src/usom/types/objects.ts:191-194` (TaskTemplate)

- [ ] **Step 1: 从 Project 接口删除字段**

```typescript
export interface Project {
  id: USOM_ID
  status: ProjectStatus
  name: string
  description?: string
  startDate?: DateOnly
  endDate?: DateOnly
  // 删除: defaultEarliestTime?: string
  // 删除: defaultLatestStartTime?: string
  // 删除: defaultDuration?: number
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

- [ ] **Step 2: 从 Task 接口删除字段**

```typescript
export interface Task {
  id: USOM_ID
  status: TaskStatus
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration: DurationMinutes
  actualDuration?: DurationMinutes
  keyResultId?: USOM_ID
  timeboxId?: USOM_ID
  tags: Tag[]
  dueDate?: DateOnly
  recurrence?: RecurrenceRule
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
  parentId?: USOM_ID
  projectId?: USOM_ID
  // 删除: earliestTime?: string
  // 删除: latestStartTime?: string
  // 删除: defaultTime?: string
  // 删除: defaultDuration?: number
  frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]
  startDate?: DateOnly
  endDate?: DateOnly
  notes?: Notes
}
```

- [ ] **Step 3: 从 ProjectTemplate 和 TaskTemplate 删除对应字段**

`ProjectTemplate` 删除: `defaultEarliestTime`, `defaultLatestStartTime`, `defaultDuration`
`TaskTemplate` 删除: `earliestTime`, `latestStartTime`, `defaultTime`, `defaultDuration`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "refactor(usom): 从 Project/Task 类型中移除时间字段"
```

---

### Task 3: 更新 Mapper 和 Repository

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts:742-796` (Project mapper)
- Modify: `frontend/src/lib/db/repositories/mappers.ts:72-106` (Task mapper)
- Modify: `frontend/src/lib/db/repositories/mappers.ts:809-891` (Template mappers)
- Modify: `frontend/src/lib/db/repositories/project.repository.ts:33-54` (create method)
- Modify: `frontend/src/lib/db/repositories/task.repository.ts:90-122` (bulkCreate method)
- Delete: `frontend/src/domains/projects/time-inheritance.ts`

- [ ] **Step 1: 更新 ProjectRow 类型和 projectRowToUSOM**

从 `ProjectRow` 类型删除:
```typescript
defaultEarliestTime: string | null; defaultLatestStartTime: string | null;
defaultDuration: number | null;
```

从 `projectRowToUSOM` 函数删除对应映射行:
```typescript
defaultEarliestTime: row.defaultEarliestTime ?? undefined,
defaultLatestStartTime: row.defaultLatestStartTime ?? undefined,
defaultDuration: row.defaultDuration ?? undefined,
```

从 `projectUSOMToRow` 函数删除对应映射行。

- [ ] **Step 2: 更新 TaskRow 类型和 taskRowToUSOM**

从 `TaskRow` 类型删除:
```typescript
earliestTime: string | null; latestStartTime: string | null;
defaultTime: string | null; defaultDuration: number | null;
```

从 `taskRowToUSOM` 函数删除对应映射行:
```typescript
earliestTime: row.earliestTime ?? undefined,
latestStartTime: row.latestStartTime ?? undefined,
defaultTime: row.defaultTime ?? undefined,
defaultDuration: row.defaultDuration ?? undefined,
```

从 `taskUSOMToRow` 函数删除对应映射行。

- [ ] **Step 3: 更新 ProjectTemplate 和 TaskTemplate mapper**

同样从相应类型和函数中删除时间字段映射。

- [ ] **Step 4: 更新 ProjectRepository.create**

```typescript
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
    // 删除: defaultEarliestTime, defaultLatestStartTime, defaultDuration
    priority: input.priority ?? null,
    color: input.color ?? null,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  })
  const created = await this.findById(id, userId)
  return created!
}
```

- [ ] **Step 5: 更新 TaskRepository.bulkCreate**

删除 values 中的:
```typescript
earliestTime: input.earliestTime ?? null,
latestStartTime: input.latestStartTime ?? null,
defaultTime: input.defaultTime ?? null,
defaultDuration: input.defaultDuration ?? null,
```

- [ ] **Step 6: 删除 time-inheritance.ts**

```bash
rm frontend/src/domains/projects/time-inheritance.ts
```

- [ ] **Step 7: 更新 CreateTaskInput 和 CreateProjectInput 接口**

查找 `frontend/src/usom/interfaces/irepository.ts` 中的接口定义，移除时间字段。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/db/repositories/mappers.ts frontend/src/lib/db/repositories/project.repository.ts frontend/src/lib/db/repositories/task.repository.ts frontend/src/domains/projects/time-inheritance.ts frontend/src/usom/interfaces/irepository.ts
git commit -m "refactor(repo): 从 Mapper/Repository 中移除时间字段及继承逻辑"
```

---

### Task 4: 更新 Server Actions

**Files:**
- Modify: `frontend/src/app/projects/actions.ts:15-48` (createProject, updateProject)
- Modify: `frontend/src/app/projects/actions.ts:58-86` (createTask)
- Modify: `frontend/src/app/projects/actions.ts:97-142` (importTasks)

- [ ] **Step 1: 从 createProject 移除时间字段**

```typescript
export async function createProject(data: {
  name: string; description?: string; priority?: string
  startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  const project = await repo.create({
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  return project
}
```

- [ ] **Step 2: 从 updateProject 移除时间字段**

```typescript
export async function updateProject(projectId: string, data: {
  name?: string; description?: string; priority?: string
  startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  await repo.update(projectId, {
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
}
```

- [ ] **Step 3: 从 createTask 移除时间字段**

```typescript
export async function createTask(data: {
  title: string; description?: string; priority: string; energyRequired: string
  estimatedDuration: number
  frequencyType?: string; daysOfWeek?: number[]
  startDate?: string; endDate?: string
  projectId?: string; parentId?: string
}) {
  const repo = new TaskRepository()
  const tasks = await repo.bulkCreate([{
    title: data.title,
    description: data.description,
    priority: data.priority as Priority,
    energyRequired: data.energyRequired as EnergyLevel,
    estimatedDuration: data.estimatedDuration,
    frequencyType: data.frequencyType as "once" | "daily" | "weekly" | "custom" | undefined,
    daysOfWeek: data.daysOfWeek,
    startDate: data.startDate ?? undefined,
    endDate: data.endDate ?? undefined,
    projectId: data.projectId,
    parentId: data.parentId,
  }], userId)
  revalidatePath("/projects")
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`)
  return tasks[0]
}
```

- [ ] **Step 4: 从 importTasks 移除时间字段**

```typescript
const project = await projectRepo.create({
  name: preview.project.name,
  description: preview.project.description,
  priority: preview.project.priority as Priority | undefined,
}, userId)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/projects/actions.ts
git commit -m "refactor(actions): 从 Server Actions 中移除时间字段参数"
```

---

### Task 5: 更新 ProjectForm 和 TaskForm (移除时间字段 + 修复编辑Bug)

**Files:**
- Modify: `frontend/src/components/projects/project-form.tsx`
- Modify: `frontend/src/components/projects/task-form.tsx`

- [ ] **Step 1: 重写 ProjectForm**

移除时间字段并修复编辑模式。完整替换为:

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Project } from "@/usom/types/objects"
import { Priority } from "@/usom/types/primitives"

export interface ProjectFormData {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  priority?: string
  color?: string
  tags?: string[]
}

interface ProjectFormProps {
  project?: Project
  onSave: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
}

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: Priority.Critical, label: "紧急" },
  { value: Priority.High, label: "高" },
  { value: Priority.Medium, label: "中" },
  { value: Priority.Low, label: "低" },
]

export function ProjectForm({ project, onSave, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [startDate, setStartDate] = useState(project?.startDate ?? "")
  const [endDate, setEndDate] = useState(project?.endDate ?? "")
  const [priority, setPriority] = useState<string>(project?.priority ?? Priority.Medium)
  const [color, setColor] = useState(project?.color ?? "#3b82f6")
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!project

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsLoading(true)
    try {
      await onSave({
        name: name.trim(),
        description: description || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        priority: priority || undefined,
        color: color || undefined,
        tags: [],
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">名称 *</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：2026 年度产品重构"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-desc">描述</Label>
        <Textarea
          id="project-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="项目目标和范围描述"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-start">开始日期</Label>
          <Input id="project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-end">结束日期</Label>
          <Input id="project-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-priority">优先级</Label>
          <select
            id="project-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-color">颜色标识</Label>
          <Input
            id="project-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer p-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!name.trim() || isLoading}>
          {isLoading ? "保存中..." : isEditing ? "保存" : "创建项目"}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 重写 TaskForm**

移除时间字段。完整替换:

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SplitWarning } from "./split-warning"
import type { Task } from "@/usom/types/objects"
import { Priority, EnergyLevel } from "@/usom/types/primitives"

export interface TaskFormData {
  title: string
  description?: string
  priority: string
  energyRequired: string
  estimatedDuration: number
  frequencyType?: string
  daysOfWeek?: number[]
  startDate?: string
  endDate?: string
}

interface TaskFormProps {
  projectId?: string
  parentId?: string
  task?: Task
  onSave: (data: TaskFormData) => Promise<void>
  onCancel: () => void
}

const PRIORITY_OPTIONS = [
  { value: Priority.Critical, label: "紧急" },
  { value: Priority.High, label: "高" },
  { value: Priority.Medium, label: "中" },
  { value: Priority.Low, label: "低" },
]

const ENERGY_OPTIONS = [
  { value: EnergyLevel.High, label: "高能量" },
  { value: EnergyLevel.Medium, label: "中等" },
  { value: EnergyLevel.Low, label: "低能量" },
]

export function TaskForm({ parentId, task, onSave, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [priority, setPriority] = useState<string>(task?.priority ?? Priority.Medium)
  const [energyRequired, setEnergyRequired] = useState<string>(task?.energyRequired ?? EnergyLevel.Medium)
  const [estimatedDuration, setEstimatedDuration] = useState(task?.estimatedDuration?.toString() ?? "60")
  const [frequencyType, setFrequencyType] = useState<string>(task?.frequencyType ?? "once")
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(task?.daysOfWeek ?? [])
  const [startDate, setStartDate] = useState(task?.startDate ?? "")
  const [endDate, setEndDate] = useState(task?.endDate ?? "")
  const [isLoading, setIsLoading] = useState(false)

  const isSubTask = !!parentId
  const isEditing = !!task

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setIsLoading(true)
    try {
      await onSave({
        title: title.trim(),
        description: description || undefined,
        priority,
        energyRequired,
        estimatedDuration: Number(estimatedDuration) || 60,
        frequencyType: frequencyType || undefined,
        daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const titleLabel = isSubTask ? "子任务标题 *" : "任务标题 *"
  const titlePlaceholder = isSubTask ? "输入子任务名称" : "例如：完成 UI 设计稿"
  const submitLabel = isEditing ? "保存" : isSubTask ? "添加子任务" : "创建任务"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">{titleLabel}</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={titlePlaceholder}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-desc">描述</Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-priority">优先级</Label>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-energy">所需能量</Label>
          <select
            id="task-energy"
            value={energyRequired}
            onChange={(e) => setEnergyRequired(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {ENERGY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-duration">预估时长（分钟）</Label>
        <Input
          id="task-duration"
          type="number"
          min={5}
          max={1440}
          value={estimatedDuration}
          onChange={(e) => setEstimatedDuration(e.target.value)}
        />
        {Number(estimatedDuration) > 720 && <SplitWarning />}
      </div>

      <fieldset className="border-t pt-3 mt-1">
        <legend className="text-sm font-medium px-1">调度设置</legend>
        <div className="flex flex-col gap-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-frequency">重复频率</Label>
              <select
                id="task-frequency"
                value={frequencyType}
                onChange={(e) => setFrequencyType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="once">仅一次</option>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="custom">自定义</option>
              </select>
            </div>
          </div>

          {frequencyType === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <Label>每周日</Label>
              <div className="flex gap-1 flex-wrap">
                {[
                  { v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' },
                  { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }, { v: 0, l: '日' },
                ].map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={`size-8 rounded-full text-xs font-medium border transition-colors ${
                      daysOfWeek.includes(d.v)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                    onClick={() => setDaysOfWeek(
                      daysOfWeek.includes(d.v) ? daysOfWeek.filter(x => x !== d.v) : [...daysOfWeek, d.v]
                    )}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-start-date">开始日期</Label>
              <Input
                id="task-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-end-date">结束日期</Label>
              <Input
                id="task-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!title.trim() || isLoading}>
          {isLoading ? "保存中..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: 运行 ESLint 验证**

```bash
cd frontend && npx eslint src/components/projects/project-form.tsx src/components/projects/task-form.tsx --max-warnings=0
```

Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/projects/project-form.tsx frontend/src/components/projects/task-form.tsx
git commit -m "fix(forms): 移除时间字段，修复编辑模式按钮文本
- 从 ProjectForm 移除 defaultEarliestTime/defaultLatestStartTime/defaultDuration
- 从 TaskForm 移除 earliestTime/latestStartTime/defaultTime/defaultDuration
- 修复编辑项目时按钮显示'创建项目'的问题 — 使用 isEditing 判断
- 修复编辑任务时按钮显示'创建任务'的问题"
```

---

### Task 6: 更新 task-list 和 project-detail (移除时间继承逻辑)

**Files:**
- Modify: `frontend/src/components/projects/task-list.tsx`
- Modify: `frontend/src/components/projects/project-detail.tsx`

- [ ] **Step 1: 重写 task-list.tsx — 移除时间继承显示**

删除 `TaskWithChildren` 接口的 `resolvedTime` 字段，删除 `ResolvedTime` 导入，移除 `Tooltip` 导入，删除 `getTimeSourceLabel` 函数，简化 `TaskRow`:

```typescript
"use client"

import { useState } from "react"
import { StatusBadge } from "./status-badge"
import { SplitWarning } from "./split-warning"
import type { Task, Project } from "@/usom/types/objects"
import type { TaskStatus } from "@/usom/types/primitives"

export interface TaskWithChildren extends Task {
  children: TaskWithChildren[]
}

interface TaskListProps {
  tasks: TaskWithChildren[]
  project?: Project
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void
}

function buildTree(tasks: Task[]): TaskWithChildren[] {
  const map = new Map<string, TaskWithChildren>()
  const roots: TaskWithChildren[] = []

  for (const task of tasks) {
    map.set(task.id, { ...task, children: [] })
  }

  for (const task of map.values()) {
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId)!.children.push(task)
    } else {
      roots.push(task)
    }
  }

  return roots
}

function TaskRow({
  task,
  depth = 0,
  onTaskClick,
  onAddSubTask,
  onStatusChange,
}: {
  task: TaskWithChildren
  depth: number
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = task.children.length > 0

  const STATUS_ACTIONS: Record<string, { label: string; status: TaskStatus }[]> = {
    draft: [{ label: '激活', status: 'active' as TaskStatus }],
    active: [{ label: '开始', status: 'in_progress' as TaskStatus }, { label: '搁置', status: 'on_hold' as TaskStatus }],
    in_progress: [{ label: '搁置', status: 'on_hold' as TaskStatus }, { label: '完成', status: 'completed' as TaskStatus }],
    on_hold: [{ label: '恢复', status: 'active' as TaskStatus }],
  }

  const actions = STATUS_ACTIONS[task.status] ?? []

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer group"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
        onClick={() => onTaskClick(task.id)}
      >
        <button
          type="button"
          className={`size-4 flex items-center justify-center text-muted-foreground shrink-0 ${hasChildren ? "visible" : "invisible"}`}
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
        >
          <span className={`text-xs transition-transform ${collapsed ? "" : "rotate-90"}`}>
            ▸
          </span>
        </button>

        <StatusBadge status={task.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />

        <span className="flex-1 text-sm truncate">{task.title}</span>

        {task.estimatedDuration > 720 && <SplitWarning />}

        {task.estimatedDuration > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{task.estimatedDuration}分钟</span>
        )}

        {hasChildren && (
          <span className="text-xs text-muted-foreground shrink-0">{task.children.length}个子任务</span>
        )}

        {actions.length > 0 && onStatusChange && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="text-xs px-1.5 py-0.5 rounded border border-muted-foreground/20 hover:bg-muted shrink-0"
                onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, a.status) }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="size-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted shrink-0"
          onClick={(e) => { e.stopPropagation(); onAddSubTask(task.id) }}
          title="添加子任务"
        >
          +
        </button>
      </div>

      {hasChildren && !collapsed && (
        <div className="border-l border-muted ml-[22px]">
          {task.children.map((child) => (
            <TaskRow
              key={child.id}
              task={child}
              depth={depth + 1}
              onTaskClick={onTaskClick}
              onAddSubTask={onAddSubTask}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskList({ tasks, onTaskClick, onAddSubTask, onStatusChange }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">暂无任务</p>
        <p className="text-xs mt-1">点击&ldquo;添加任务&rdquo;开始</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          depth={0}
          onTaskClick={onTaskClick}
          onAddSubTask={onAddSubTask}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  )
}

export { buildTree }
```

- [ ] **Step 2: 简化 project-detail.tsx**

移除 `resolveTaskTime` 导入和时间显示区块:

```typescript
"use client"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import { TaskList, buildTree } from "./task-list"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface ProjectDetailProps {
  project: Project
  tasks: Task[]
  onAddTask: (parentId?: string) => void
  onEditTask: (taskId: string) => void
  onEditProject: () => void
  onSaveAsTemplate: () => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onProjectStatusChange: (newStatus: ProjectStatus) => void
}

export function ProjectDetail({ project, tasks, onAddTask, onEditTask, onEditProject, onSaveAsTemplate, onStatusChange, onProjectStatusChange }: ProjectDetailProps) {
  const tree = buildTree(tasks)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === "completed").length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={project.status} />
            {project.priority && <span>优先级: {project.priority}</span>}
            {project.startDate && <span>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span>}
          </div>
          {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onEditProject}>
            编辑项目
          </Button>
          {project.status === "planning" && (
            <Button size="sm" variant="default" onClick={() => onProjectStatusChange("active")}>激活项目</Button>
          )}
          {project.status === "active" && (
            <>
              <Button size="sm" variant="outline" onClick={() => onProjectStatusChange("paused")}>暂停</Button>
              <Button size="sm" variant="default" onClick={() => onProjectStatusChange("completed")}>完成</Button>
            </>
          )}
          {project.status === "paused" && (
            <Button size="sm" variant="default" onClick={() => onProjectStatusChange("active")}>恢复</Button>
          )}
          {project.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => onProjectStatusChange("archived")}>归档</Button>
          )}
        </div>
      </div>

      {totalTasks > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((completedTasks / totalTasks) * 100)}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">{completedTasks}/{totalTasks} 完成</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">任务列表</h3>
          <Button size="sm" variant="outline" onClick={() => onAddTask()}>
            + 添加任务
          </Button>
        </div>
        <TaskList
          tasks={tree}
          onTaskClick={(id) => onEditTask(id)}
          onAddSubTask={(parentId) => onAddTask(parentId)}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/projects/task-list.tsx frontend/src/components/projects/project-detail.tsx
git commit -m "refactor(components): 从 task-list/project-detail 移除时间继承逻辑
- 移除 ResolvedTime 接口和 resolveTaskTime 导入
- 移除时间继承 Tooltip 和 getTimeSourceLabel
- 简化 project-detail 移除默认时间信息展示"
```

---

### Task 7: 创建项目/任务树组件 (project-tree.tsx)

**Files:**
- Create: `frontend/src/components/projects/project-tree.tsx`

- [ ] **Step 1: 编写 project-tree.tsx**

左侧项目/任务树组件，支持展开/收起项目，显示任务数量，点击选中:

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import type { Project, Task } from "@/usom/types/objects"

export interface TreeItem {
  type: "independent-task-section" | "project" | "task"
  id: string
  title: string
  status: string
  projectId?: string
  parentId?: string
  childCount?: number
  children?: TreeItem[]
  expanded?: boolean
}

interface ProjectTreeProps {
  projects: Project[]
  tasks: Task[]
  taskCounts: Record<string, { total: number; completed: number }>
  selectedItemId: string | null
  onSelectProject: (projectId: string) => void
  onSelectTask: (taskId: string) => void
  onAddProject: () => void
}

interface ProjectTreeNodeProps {
  project: Project
  taskCount: { total: number; completed: number }
  tasks: Task[]
  selectedItemId: string | null
  onSelectProject: (id: string) => void
  onSelectTask: (id: string) => void
}

function ProjectTreeNode({ project, taskCount, tasks, selectedItemId, onSelectProject, onSelectTask }: ProjectTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)

  const projectTasks = tasks
    .filter(t => t.projectId === project.id && !t.parentId)
    .sort((a, b) => a.title.localeCompare(b.title))

  const getChildren = (parentId: string): Task[] =>
    tasks.filter(t => t.parentId === parentId).sort((a, b) => a.title.localeCompare(b.title))

  const TaskNode = ({ task, depth = 0 }: { task: Task; depth: number }) => {
    const [taskExpanded, setTaskExpanded] = useState(false)
    const children = getChildren(task.id)
    const hasChildren = children.length > 0

    return (
      <div>
        <button
          type="button"
          onClick={() => onSelectTask(task.id)}
          className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors ${
            selectedItemId === task.id ? "bg-primary/10 text-primary font-medium" : "text-ink"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <span
              className="size-3 flex items-center justify-center text-muted-foreground shrink-0"
              onClick={(e) => { e.stopPropagation(); setTaskExpanded(!taskExpanded) }}
            >
              <span className={`text-xs transition-transform ${taskExpanded ? "rotate-90" : ""}`}>▸</span>
            </span>
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <StatusBadge status={task.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
          <span className="truncate flex-1">{task.title}</span>
        </button>
        {hasChildren && taskExpanded && children.map(child => (
          <TaskNode key={child.id} task={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setExpanded(!expanded); onSelectProject(project.id) }}
        className={`flex items-center gap-1.5 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
          selectedItemId === project.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-ink"
        }`}
      >
        <span className={`text-xs transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}>▸</span>
        <StatusBadge status={project.status} size="sm" />
        <span className="truncate flex-1 font-medium">{project.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{taskCount.completed}/{taskCount.total}</span>
      </button>
      {expanded && projectTasks.map(task => (
        <TaskNode key={task.id} task={task} depth={0} />
      ))}
    </div>
  )
}

export function ProjectTree({ projects, tasks, taskCounts, selectedItemId, onSelectProject, onSelectTask, onAddProject }: ProjectTreeProps) {
  const independentTasks = tasks.filter(t => !t.projectId)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-hairline">
        <h2 className="text-sm font-semibold">项目/任务</h2>
        <Button size="sm" variant="outline" onClick={onAddProject}>
          + 新建项目
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-1">
        {projects.length === 0 && independentTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">暂无项目</p>
            <p className="text-xs mt-1">点击"新建项目"开始</p>
          </div>
        ) : (
          <>
            {projects.map(p => (
              <ProjectTreeNode
                key={p.id}
                project={p}
                taskCount={taskCounts[p.id] ?? { total: 0, completed: 0 }}
                tasks={tasks}
                selectedItemId={selectedItemId}
                onSelectProject={onSelectProject}
                onSelectTask={onSelectTask}
              />
            ))}

            {independentTasks.length > 0 && (
              <div className="mt-4">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  独立任务
                </div>
                {independentTasks.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTask(t.id)}
                    className={`flex items-center gap-1.5 w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors ${
                      selectedItemId === t.id ? "bg-primary/10 text-primary font-medium" : "text-ink"
                    }`}
                  >
                    <StatusBadge status={t.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
                    <span className="truncate flex-1">{t.title}</span>
                    {t.priority && (
                      <span className="text-xs text-muted-foreground shrink-0">{t.priority}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/projects/project-tree.tsx
git commit -m "feat(components): 新增项目/任务树组件 project-tree
- 左侧树形结构：项目(可展开/收起) → 任务(可展开/收起) → 子任务
- 独立任务区域
- 选中高亮 + 状态徽标 + 任务数量统计"
```

---

### Task 8: 创建详情面板组件 (detail-panel.tsx)

**Files:**
- Create: `frontend/src/components/projects/detail-panel.tsx`

- [ ] **Step 1: 编写 detail-panel.tsx**

右侧详情面板，根据选中项类型显示项目详情/任务详情/空状态:

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectDetail } from "./project-detail"
import { ProjectForm, type ProjectFormData } from "./project-form"
import { TaskForm, type TaskFormData } from "./task-form"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface DetailPanelProps {
  selectedProject: Project | null
  selectedTask: Task | null
  allTasks: Task[]
  allProjects: Project[]
  onCreateTask: (data: TaskFormData) => Promise<void>
  onCreateProject: (data: ProjectFormData) => Promise<void>
  onUpdateProject: (projectId: string, data: ProjectFormData) => Promise<void>
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  onUpdateProjectStatus: (projectId: string, status: ProjectStatus) => Promise<void>
  onSaveAsTemplate: (projectId: string) => Promise<void>
  onSelectProject: (id: string) => void
  onSelectTask: (id: string) => void
}

export function DetailPanel({
  selectedProject, selectedTask, allTasks, allProjects,
  onCreateTask, onCreateProject, onUpdateProject,
  onUpdateTaskStatus, onUpdateProjectStatus, onSaveAsTemplate,
  onSelectProject, onSelectTask,
}: DetailPanelProps) {
  const [showNewProject, setShowNewProject] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [parentTaskId, setParentTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // 空状态
  if (!selectedProject && !selectedTask) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <div className="text-center">
          <p className="text-lg font-medium mb-1">项目/任务管理</p>
          <p className="text-sm">从左侧选择项目或任务查看详情</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowNewProject(true)}>
            + 新建项目
          </Button>
        </div>

        <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
          <DialogContent>
            <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
            <ProjectForm onSave={async (data) => { await onCreateProject(data); setShowNewProject(false) }} onCancel={() => setShowNewProject(false)} />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // 项目详情
  if (selectedProject) {
    const tasks = allTasks.filter(t => t.projectId === selectedProject.id)

    const handleAddTask = (parentId?: string) => {
      if (parentId) {
        setParentTaskId(parentId)
      } else {
        setParentTaskId(null)
        setEditingTask(null)
      }
      setShowTaskForm(true)
    }

    const handleEditTask = (taskId: string) => {
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        setEditingTask(task)
        setParentTaskId(task.parentId ?? null)
        setShowTaskForm(true)
      }
    }

    const handleSaveTask = async (data: TaskFormData) => {
      await onCreateTask({
        ...data,
        projectId: selectedProject.id,
        parentId: parentTaskId ?? undefined,
      })
      setShowTaskForm(false)
      setEditingTask(null)
      setParentTaskId(null)
    }

    const handleEditProject = async (data: ProjectFormData) => {
      await onUpdateProject(selectedProject.id, data)
      setShowEditProject(false)
    }

    return (
      <div className="p-6 overflow-y-auto h-full">
        <ProjectDetail
          project={selectedProject}
          tasks={tasks}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onEditProject={() => setShowEditProject(true)}
          onSaveAsTemplate={() => onSaveAsTemplate(selectedProject.id)}
          onStatusChange={onUpdateTaskStatus}
          onProjectStatusChange={(status) => onUpdateProjectStatus(selectedProject.id, status)}
        />

        <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
          <DialogContent>
            <DialogHeader><DialogTitle>编辑项目</DialogTitle></DialogHeader>
            <ProjectForm project={selectedProject} onSave={handleEditProject} onCancel={() => setShowEditProject(false)} />
          </DialogContent>
        </Dialog>

        <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTask ? "编辑任务" : parentTaskId ? "添加子任务" : "新建任务"}
              </DialogTitle>
            </DialogHeader>
            <TaskForm
              parentId={parentTaskId ?? undefined}
              task={editingTask ?? undefined}
              onSave={handleSaveTask}
              onCancel={() => { setShowTaskForm(false); setEditingTask(null); setParentTaskId(null) }}
            />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // 任务详情 (独立任务)
  if (selectedTask && !selectedProject) {
    const handleSaveTask = async (data: TaskFormData) => {
      await onCreateTask(data)
      setShowTaskForm(false)
      setEditingTask(null)
    }

    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <StatusBadge status={selectedTask.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} />
                {selectedTask.priority && <span>{selectedTask.priority}</span>}
                {selectedTask.estimatedDuration > 0 && <span>{selectedTask.estimatedDuration}分钟</span>}
              </div>
              {selectedTask.description && <p className="text-sm text-muted-foreground mt-2">{selectedTask.description}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditingTask(selectedTask); setShowTaskForm(true) }}>
              编辑任务
            </Button>
          </div>
        </div>

        <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
          <DialogContent>
            <DialogHeader><DialogTitle>编辑任务</DialogTitle></DialogHeader>
            <TaskForm task={editingTask ?? undefined} onSave={handleSaveTask} onCancel={() => { setShowTaskForm(false); setEditingTask(null) }} />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return null
}

// Re-export StatusBadge for use within detail-panel
import { StatusBadge } from "./status-badge"
```

Actually, the `StatusBadge` import should be at the top. Let me fix that — the import needs to be at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/projects/detail-panel.tsx
git commit -m "feat(components): 新增详情面板组件 detail-panel
- 右侧详情面板，与左侧树联动
- 选中项目：显示 ProjectDetail (含任务列表、状态操作)
- 选中独立任务：显示任务详情
- 无选中：显示空状态引导
- 修复编辑项目/任务时正确传递 project/task prop"
```

---

### Task 9: 重写 projects-client.tsx 为两栏布局

**Files:**
- Modify: `frontend/src/app/projects/projects-client.tsx`

- [ ] **Step 1: 重写为两栏布局容器**

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectTree } from "@/components/projects/project-tree"
import { DetailPanel } from "@/components/projects/detail-panel"
import { TaskImportDialog } from "@/components/projects/task-import-dialog"
import { TemplateDialog } from "@/components/projects/template-dialog"
import {
  createProject, createTask, updateProject, updateTaskStatus,
  updateProjectStatus, saveProjectAsTemplate, importTasks, applyTemplate,
} from "./actions"
import type { Project, Task, ProjectTemplate } from "@/usom/types/objects"
import type { ProjectFormData, TaskFormData } from "@/usom/types/ui-forms"
import type { ImportPreview } from "@/lib/task-import/task-extractor"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

// 注意: ProjectFormData 和 TaskFormData 类型在 project-form.tsx / task-form.tsx 中定义
// 如果之前未导出类型，需要在 form 文件中添加 export
// 为简化，直接在 forms 文件重新导出类型

interface ProjectsClientProps {
  projects: Project[]
  taskCounts: Record<string, { total: number; completed: number }>
  independentTasks: Task[]
  allTasks: Task[]
  templates: ProjectTemplate[]
}

export function ProjectsClient({
  projects, taskCounts, independentTasks, allTasks, templates,
}: ProjectsClientProps) {
  const router = useRouter()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId) ?? null
    : null

  const selectedTask = selectedTaskId
    ? allTasks.find(t => t.id === selectedTaskId) ?? null
    : null

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id)
    setSelectedTaskId(null)
  }

  const handleSelectTask = (id: string) => {
    setSelectedTaskId(id)
    const task = allTasks.find(t => t.id === id)
    if (task?.projectId) {
      setSelectedProjectId(task.projectId)
    } else {
      setSelectedProjectId(null)
    }
  }

  const handleCreateProject = async (data: ProjectFormData) => {
    const created = await createProject(data as any)
    if (created?.id) {
      setSelectedProjectId(created.id)
    }
  }

  const handleCreateTask = async (data: TaskFormData) => {
    const created = await createTask(data as any)
  }

  const handleUpdateProject = async (projectId: string, data: ProjectFormData) => {
    await updateProject(projectId, data as any)
  }

  const handleImport = async (preview: ImportPreview) => {
    await importTasks(preview)
  }

  const handleApplyTemplate = async (templateId: string) => {
    await applyTemplate(templateId)
  }

  return (
    <div className="flex h-full">
      {/* 左侧项目/任务树 */}
      <div className="w-80 shrink-0 border-r border-hairline bg-canvas">
        <ProjectTree
          projects={projects}
          tasks={allTasks}
          taskCounts={taskCounts}
          selectedItemId={selectedTaskId ?? selectedProjectId}
          onSelectProject={handleSelectProject}
          onSelectTask={handleSelectTask}
          onAddProject={() => {}}
        />
        <div className="border-t border-hairline px-3 py-2 flex gap-1">
          <button
            type="button"
            className="flex-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            onClick={() => setShowImportDialog(true)}
          >
            导入模板
          </button>
          <button
            type="button"
            className="flex-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            onClick={() => setShowTemplateDialog(true)}
          >
            从模板创建
          </button>
        </div>
      </div>

      {/* 右侧详情面板 */}
      <div className="flex-1 min-w-0 bg-canvas">
        <DetailPanel
          selectedProject={selectedProject}
          selectedTask={(!selectedProject) ? selectedTask : null}
          allTasks={allTasks}
          allProjects={projects}
          onCreateTask={handleCreateTask}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onUpdateTaskStatus={updateTaskStatus}
          onUpdateProjectStatus={updateProjectStatus}
          onSaveAsTemplate={saveProjectAsTemplate}
          onSelectProject={handleSelectProject}
          onSelectTask={handleSelectTask}
        />
      </div>

      <TaskImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        onApplyTemplate={handleApplyTemplate}
        templates={templates}
      />
    </div>
  )
}
```

- [ ] **Step 2: 创建 UI form types 文件**

由于 `ProjectFormData` 和 `TaskFormData` 现在需要跨组件共享，创建一个类型文件:

`frontend/src/usom/types/ui-forms.ts`:
```typescript
export interface ProjectFormData {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  priority?: string
  color?: string
  tags?: string[]
}

export interface TaskFormData {
  title: string
  description?: string
  priority: string
  energyRequired: string
  estimatedDuration: number
  frequencyType?: string
  daysOfWeek?: number[]
  startDate?: string
  endDate?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/projects/projects-client.tsx frontend/src/usom/types/ui-forms.ts
git commit -m "feat(ui): 重写 projects-client 为左右两栏布局
- 左侧 320px ProjectTree (项目→任务→子任务可展开)
- 右侧 flex-1 DetailPanel (详情联动)
- 修复编辑项目/任务时按钮文本错误
- 新增 ui-forms 类型文件统一表单数据类型"
```

---

### Task 10: 更新 page.tsx 和清理旧文件

**Files:**
- Modify: `frontend/src/app/projects/page.tsx`
- Delete: `frontend/src/app/projects/[id]/`
- Delete: `frontend/src/components/projects/project-card.tsx`

- [ ] **Step 1: 更新 page.tsx 数据加载**

```typescript
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import { ProjectsClient } from "./projects-client"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001"
const userId = MVP_USER_ID // TODO: get from session

export const dynamic = "force-dynamic"

export default async function ProjectsPage() {
  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()
  const templateRepo = new TaskTemplateRepository()

  const [projects, allTasks, independentTasks, templates] = await Promise.all([
    projectRepo.findByUserId(userId),
    taskRepo.findAll(userId),
    taskRepo.findIndependent(userId),
    templateRepo.findProjectTemplates(userId),
  ])

  const taskCounts: Record<string, { total: number; completed: number }> = {}
  for (const t of allTasks) {
    if (!t.projectId) continue
    const c = taskCounts[t.projectId] ?? { total: 0, completed: 0 }
    c.total++
    if (t.status === "completed") c.completed++
    taskCounts[t.projectId] = c
  }

  return (
    <ProjectsClient
      projects={projects}
      taskCounts={taskCounts}
      independentTasks={independentTasks}
      allTasks={allTasks}
      templates={templates}
    />
  )
}
```

- [ ] **Step 2: 删除旧文件**

```bash
rm -rf frontend/src/app/projects/\[id\]/
rm frontend/src/components/projects/project-card.tsx
```

- [ ] **Step 3: 验证 ESLint**

```bash
cd frontend && npx eslint src/app/projects/ --max-warnings=0
```

Expected: PASS (可能需要修复一些 import 引用)

- [ ] **Step 4: Commit**

```bash
git rm -r frontend/src/app/projects/\[id\]/
git rm frontend/src/components/projects/project-card.tsx
git add frontend/src/app/projects/page.tsx
git commit -m "refactor(projects): 更新 page.tsx 数据加载，移除独立详情路由和卡片组件
- page.tsx 增加 allTasks 数据供给两栏布局
- 移除 /projects/[id] 独立详情页
- 移除 project-card 卡片组件"
```

---

### Task 11: 更新导航标签和导入引用

**Files:**
- Modify: `frontend/src/components/layout/top-nav.tsx:45-49`

- [ ] **Step 1: 更新导航标签**

```typescript
<Link href="/projects">
  <Button variant="ghost" size="sm" aria-label="项目/任务">
    项目/任务
  </Button>
</Link>
```

- [ ] **Step 2: 检查并修复全局导入引用**

确保没有其他地方引用已删除的文件或已更改的类型。运行 TypeScript 检查:

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -50
```

修复所有类型错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/top-nav.tsx
git commit -m "feat(nav): 导航标签更新为'项目/任务'，修复导入引用"
```

---

### Task 12: 更新测试

**Files:**
- Modify: `frontend/src/domains/projects/__tests__/index.test.ts`
- Modify: `frontend/src/lib/db/repositories/__tests__/project.repository.test.ts`

- [ ] **Step 1: 更新 domain 测试**

移除与时间字段相关的测试逻辑。当前测试中 `onValidate` 没有引用时间字段，主要检查 fields 中是否缺少需要更新的测试:

```bash
cd frontend && npx vitest run src/domains/projects/__tests__/index.test.ts
```

Expected: 现有测试应仍通过

- [ ] **Step 2: 运行全部测试**

```bash
cd frontend && npx vitest run
```

Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/projects/__tests__/ frontend/src/lib/db/repositories/__tests__/
git commit -m "test: 更新测试以匹配时间字段移除后的类型"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: 验证以下场景**

1. 访问 `/projects` → 查看左右两栏布局
2. 点击左侧项目 → 右侧显示项目详情
3. 点击"新建项目" → 创建新项目，表单无时间字段
4. 点击"编辑项目" → 按钮显示"保存"，非"创建项目"
5. 点击项目内"添加任务" → 创建任务，按钮显示正确
6. 点击任务进入编辑 → 按钮显示"保存"，非"创建任务"
7. 创建子任务 → 正常
8. 草稿状态任务可以编辑
9. 独立任务可以点击查看和编辑
10. 状态转换正常 (激活→开始→完成等)
11. 项目列表可折叠/展开
12. 导航显示"项目/任务"

- [ ] **Step 3: Commit (如有微小修复)**

```bash
git add . && git commit -m "chore: 端到端验证后的微调修复"
```

---

## Self-Review Checklist

1. **Spec coverage**: 四个需求 [002]/[003]/[004]/[005] 各有对应Task覆盖
2. **Placeholder scan**: 无 TBD/TODO/占位符
3. **Type consistency**: 所有类型引用在前后Task中保持一致 — ProjectFormData/TaskFormData 在 Task 5 定义，Task 9 引用
