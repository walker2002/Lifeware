# Fix: Client Components Cannot Import Database Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve `Module not found: Can't resolve 'fs'` error caused by `"use client"` components importing database repositories that depend on Node.js `postgres` → `fs`.

**Architecture:** The fix follows Next.js App Router patterns: (1) Server Components fetch initial data and pass as props to Client Components, (2) Server Actions (`"use server"`) wrap all write operations, (3) Client Components handle UI state and call Server Actions. No database code is imported in client bundles.

**Tech Stack:** Next.js 16 App Router, Server Actions, TypeScript, Drizzle ORM

---

## Root Cause

4 files marked `"use client"` import repository classes that transitively import `postgres` (a Node.js database driver requiring `fs`):

```
page.tsx ("use client")
  → TaskTemplateRepository
    → db/index.ts
      → drizzle-orm/postgres-js
        → postgres
          → fs  ← not available in browser
```

**Affected files:**
- `frontend/src/app/projects/page.tsx` (imports ProjectRepository, TaskRepository, TaskTemplateRepository)
- `frontend/src/app/projects/[id]/page.tsx` (imports ProjectRepository, TaskRepository)
- `frontend/src/components/projects/project-detail.tsx` (imports ProjectRepository, TaskRepository)
- `frontend/src/components/projects/template-dialog.tsx` (imports TaskTemplateRepository)

---

## File Structure

```
frontend/src/app/projects/
├── actions.ts              ← NEW: Server Actions for all CRUD mutations
├── page.tsx                ← REWRITE: Server Component, fetches data, renders client
├── projects-client.tsx      ← NEW: Client Component, receives data as props
├── [id]/
│   ├── page.tsx            ← REWRITE: Server Component
│   └── detail-client.tsx   ← NEW: Client Component
frontend/src/components/projects/
├── project-detail.tsx      ← MODIFY: Remove repo imports, accept data+callbacks
├── template-dialog.tsx      ← MODIFY: Remove repo import, accept props for templates
frontend/src/app/page.tsx   ← MODIFY: Change nav label "项目" → "项目/任务"
```

---

## Tasks

### Task 1: Create Server Actions

**Files:**
- Create: `frontend/src/app/projects/actions.ts`

**What:** All repository write operations wrapped as Server Actions. Functions use `"use server"` and call repositories directly (server-side only, never bundled for browser).

- [ ] **Step 1: Create the Server Actions file**

```typescript
"use server"

import { revalidatePath } from "next/cache"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import type { Priority, EnergyLevel, ProjectStatus, TaskStatus } from "@/usom/types/primitives"
import type { ImportPreview } from "@/lib/task-import/task-extractor"

const userId = "current-user" // TODO: get from session

// ─── Project ────────────────────────────────────────────────

export async function createProject(data: {
  name: string; description?: string; priority?: string
  defaultEarliestTime?: string; defaultLatestStartTime?: string
  defaultDuration?: number; startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  const project = await repo.create({
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  return project
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const repo = new ProjectRepository()
  await repo.updateStatus(projectId, status, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProject(projectId: string, data: {
  name?: string; description?: string; priority?: string
  defaultEarliestTime?: string; defaultLatestStartTime?: string
  defaultDuration?: number; startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  await repo.update(projectId, {
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
}

export async function saveProjectAsTemplate(projectId: string) {
  const repo = new ProjectRepository()
  await repo.saveAsTemplate(projectId, userId)
  revalidatePath("/projects")
}

// ─── Task ───────────────────────────────────────────────────

export async function createTask(data: {
  title: string; description?: string; priority: string; energyRequired: string
  estimatedDuration: number; earliestTime?: string; latestStartTime?: string
  defaultTime?: string; defaultDuration?: number
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
    earliestTime: data.earliestTime,
    latestStartTime: data.latestStartTime,
    defaultTime: data.defaultTime,
    defaultDuration: data.defaultDuration,
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

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const repo = new TaskRepository()
  await repo.updateStatus(taskId, status, userId)
  revalidatePath("/projects")
}

// ─── Import ─────────────────────────────────────────────────

export async function importTasks(preview: ImportPreview) {
  if (!preview.project) return

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  const project = await projectRepo.create({
    name: preview.project.name,
    description: preview.project.description,
    priority: preview.project.priority as Priority | undefined,
    defaultEarliestTime: preview.project.defaultEarliestTime,
    defaultLatestStartTime: preview.project.defaultLatestStartTime,
  }, userId)

  if (preview.tasks.length > 0) {
    const idMap = new Map<string, string>()

    for (const t of preview.tasks.filter(t => t.depth === 0)) {
      const created = await taskRepo.bulkCreate([{
        title: t.title,
        priority: (t.priority ?? "medium") as Priority,
        energyRequired: (t.energyRequired ?? "medium") as EnergyLevel,
        estimatedDuration: t.estimatedDuration ?? 60,
        projectId: project.id,
      }], userId)
      if (created[0]) idMap.set(t.tempId, created[0].id)
    }

    const childTasks = preview.tasks.filter(t => t.depth > 0 && t.parentTempId)
    if (childTasks.length > 0) {
      await taskRepo.bulkCreate(
        childTasks.map(t => ({
          title: t.title,
          priority: (t.priority ?? "medium") as Priority,
          energyRequired: (t.energyRequired ?? "medium") as EnergyLevel,
          estimatedDuration: t.estimatedDuration ?? 60,
          projectId: project.id,
          parentId: idMap.get(t.parentTempId!) ?? undefined,
        })),
        userId
      )
    }
  }

  revalidatePath("/projects")
}

// ─── Template ───────────────────────────────────────────────

export async function applyTemplate(templateId: string) {
  const repo = new TaskTemplateRepository()
  await repo.createFromTemplate(templateId, {}, userId)
  revalidatePath("/projects")
}
```

- [ ] **Step 2: Verify the actions file compiles**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep "actions.ts"`
Expected: No output (no errors in this file)

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/app/projects/actions.ts
git commit -m "feat: add server actions for project operations"
```

---

### Task 2: Refactor Projects Listing Page

**Files:**
- Create: `frontend/src/app/projects/projects-client.tsx`
- Modify: `frontend/src/app/projects/page.tsx`

**What:** Split `page.tsx` into a Server Component (fetches data) + Client Component (UI). The Server Component loads projects, tasks, and templates using repositories; passes them as serializable props to the Client Component.

- [ ] **Step 1: Create the Client Component**

File: `frontend/src/app/projects/projects-client.tsx`

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import { TaskImportDialog } from "@/components/projects/task-import-dialog"
import { TemplateDialog } from "@/components/projects/template-dialog"
import { StatusBadge } from "@/components/projects/status-badge"
import { createProject, createTask, importTasks, applyTemplate } from "./actions"
import type { Project, Task, ProjectTemplate } from "@/usom/types/objects"
import type { ImportPreview } from "@/lib/task-import/task-extractor"

const STATUS_FILTERS = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "planning", label: "规划中" },
  { key: "paused", label: "已暂停" },
  { key: "completed", label: "已完成" },
  { key: "archived", label: "已归档" },
]

interface ProjectsClientProps {
  projects: Project[]
  taskCounts: Record<string, { total: number; completed: number }>
  independentTasks: Task[]
  templates: ProjectTemplate[]
}

export function ProjectsClient({ projects, taskCounts, independentTasks, templates }: ProjectsClientProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState("all")
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const filteredProjects = statusFilter === "all"
    ? projects
    : projects.filter(p => p.status === statusFilter)

  const handleCreateProject = async (data: ProjectFormData) => {
    await createProject(data)
    setShowProjectForm(false)
  }

  const handleCreateTask = async (data: TaskFormData) => {
    await createTask(data)
    setShowTaskForm(false)
  }

  const handleImport = async (preview: ImportPreview) => {
    await importTasks(preview)
  }

  const handleApplyTemplate = async (templateId: string) => {
    await applyTemplate(templateId)
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">项目目录</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowImportDialog(true)}>
            导入模板
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowTemplateDialog(true)}>
            从模板创建
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTaskForm(true)}>
            + 新建任务
          </Button>
          <Button size="sm" onClick={() => setShowProjectForm(true)}>
            + 新建项目
          </Button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1 opacity-70">{projects.filter(p => p.status === f.key).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 项目列表 */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">暂无项目</p>
          <p className="text-xs mt-1">点击&ldquo;新建项目&rdquo;开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => {
            const counts = taskCounts[p.id]
            return (
              <ProjectCard
                key={p.id}
                project={p}
                taskCount={counts?.total ?? 0}
                completedTaskCount={counts?.completed ?? 0}
                onClick={() => router.push(`/projects/${p.id}`)}
              />
            )
          })}
        </div>
      )}

      {/* 独立任务区域 */}
      {independentTasks.length > 0 && (
        <div className="flex flex-col gap-3 mt-4">
          <h2 className="text-sm font-medium text-muted-foreground">独立任务（未关联项目）</h2>
          <div className="flex flex-col gap-1">
            {independentTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50">
                <StatusBadge status={t.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
                <span className="flex-1 text-sm truncate">{t.title}</span>
                {t.priority && (
                  <Badge variant="secondary" className="text-xs">{t.priority}</Badge>
                )}
                {t.estimatedDuration > 0 && (
                  <span className="text-xs text-muted-foreground">{t.estimatedDuration}分钟</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 对话框 */}
      <Dialog open={showProjectForm} onOpenChange={setShowProjectForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
          <ProjectForm onSave={handleCreateProject} onCancel={() => setShowProjectForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建独立任务</DialogTitle></DialogHeader>
          <TaskForm onSave={handleCreateTask} onCancel={() => setShowTaskForm(false)} />
        </DialogContent>
      </Dialog>

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

- [ ] **Step 2: Rewrite page.tsx as Server Component**

File: `frontend/src/app/projects/page.tsx`

```typescript
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import { ProjectsClient } from "./projects-client"

const userId = "current-user" // TODO: get from session

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

  // 按项目分组统计任务数量
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
      templates={templates}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep -E "projects/(page|projects-client)"`
Expected: No output

- [ ] **Step 4: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/app/projects/page.tsx frontend/src/app/projects/projects-client.tsx
git commit -m "fix: refactor projects page to server/client split"
```

---

### Task 3: Update TemplateDialog to Accept Props

**Files:**
- Modify: `frontend/src/components/projects/template-dialog.tsx`

**What:** Remove `TaskTemplateRepository` import and `useEffect` data loading. Instead, accept `templates` and `applying` state as props.

- [ ] **Step 1: Rewrite TemplateDialog**

File: `frontend/src/components/projects/template-dialog.tsx`

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ProjectTemplate } from "@/usom/types/objects"

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyTemplate: (templateId: string) => Promise<void>
  onSaveCurrentAsTemplate?: () => Promise<void>
  templates: ProjectTemplate[]
  loading?: boolean
}

export function TemplateDialog({ open, onOpenChange, onApplyTemplate, onSaveCurrentAsTemplate, templates, loading = false }: TemplateDialogProps) {
  const [applying, setApplying] = useState<string | null>(null)

  const handleApply = async (templateId: string) => {
    setApplying(templateId)
    try {
      await onApplyTemplate(templateId)
      onOpenChange(false)
    } finally {
      setApplying(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从模板创建项目</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">加载中...</p>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">暂无保存的模板</p>
            {onSaveCurrentAsTemplate && (
              <Button variant="outline" size="sm" onClick={onSaveCurrentAsTemplate}>
                保存当前项目为模板
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applying === t.id}
                  onClick={() => handleApply(t.id)}
                >
                  {applying === t.id ? "创建中..." : "使用"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep "template-dialog"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/components/projects/template-dialog.tsx
git commit -m "fix: refactor TemplateDialog to accept props instead of importing repo"
```

---

### Task 4: Refactor ProjectDetail — Remove Repo Imports

**Files:**
- Modify: `frontend/src/components/projects/project-detail.tsx`

**What:** Remove the `useEffect` data loading that uses `ProjectRepository`/`TaskRepository`. Accept `project` and `tasks` as props from the parent Server Component.

- [ ] **Step 1: Rewrite ProjectDetail**

File: `frontend/src/components/projects/project-detail.tsx`

```typescript
"use client"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import { TaskList, buildTree } from "./task-list"
import { resolveTaskTime } from "@/domains/projects/time-inheritance"
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
  // 计算时间继承
  const parentMap = new Map<string, Task>()
  for (const t of tasks) parentMap.set(t.id, t)

  const resolvedTimes = new Map<string, ReturnType<typeof resolveTaskTime>>()
  for (const t of tasks) {
    const parent = t.parentId ? parentMap.get(t.parentId) : null
    resolvedTimes.set(t.id, resolveTaskTime(t, parent, project))
  }

  const tree = buildTree(tasks, resolvedTimes)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === "completed").length

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* 标题区 */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={project.status} />
            {project.priority && <span>优先级: {project.priority}</span>}
            {project.startDate && <span>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span>}
          </div>
          {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={onEditProject}>
            编辑项目
          </Button>
          <Button variant="ghost" size="sm" onClick={onSaveAsTemplate}>
            保存为模板
          </Button>
        </div>
      </div>

      {/* 默认时间信息 */}
      {(project.defaultEarliestTime || project.defaultLatestStartTime || project.defaultDuration) && (
        <div className="flex gap-4 text-xs text-muted-foreground bg-muted/30 rounded-md px-4 py-2">
          {project.defaultEarliestTime && <span>默认最早: {project.defaultEarliestTime}</span>}
          {project.defaultLatestStartTime && <span>默认最晚: {project.defaultLatestStartTime}</span>}
          {project.defaultDuration && <span>默认时长: {project.defaultDuration}分钟</span>}
        </div>
      )}

      {/* 进度 */}
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

      {/* 任务列表 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">任务列表</h2>
          <Button size="sm" variant="outline" onClick={() => onAddTask()}>
            + 添加任务
          </Button>
        </div>
        <TaskList
          tasks={tree}
          project={project}
          onTaskClick={(id) => onEditTask(id)}
          onAddSubTask={(parentId) => onAddTask(parentId)}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep "project-detail"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/components/projects/project-detail.tsx
git commit -m "fix: refactor ProjectDetail to accept data as props"
```

---

### Task 5: Refactor Project Detail Page

**Files:**
- Create: `frontend/src/app/projects/[id]/detail-client.tsx`
- Modify: `frontend/src/app/projects/[id]/page.tsx`

**What:** Split `[id]/page.tsx` into Server Component (fetches project + tasks) + Client Component (UI + dialog state).

- [ ] **Step 1: Create the Client Component**

File: `frontend/src/app/projects/[id]/detail-client.tsx`

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectDetail } from "@/components/projects/project-detail"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import {
  createTask, updateTaskStatus, updateProjectStatus,
  updateProject, saveProjectAsTemplate,
} from "../actions"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface DetailClientProps {
  project: Project
  tasks: Task[]
}

export function DetailClient({ project, tasks }: DetailClientProps) {
  const router = useRouter()
  const projectId = project.id

  const [showEditProject, setShowEditProject] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showSubTaskForm, setShowSubTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [parentTaskId, setParentTaskId] = useState<string | null>(null)

  const handleAddTask = (parentId?: string) => {
    if (parentId) {
      setParentTaskId(parentId)
      setShowSubTaskForm(true)
    } else {
      setParentTaskId(null)
      setShowTaskForm(true)
    }
  }

  const handleEditTask = (taskId: string) => {
    setEditingTaskId(taskId)
    setShowTaskForm(true)
  }

  const handleSaveTask = async (data: TaskFormData) => {
    await createTask({
      ...data,
      projectId,
      parentId: parentTaskId ?? undefined,
    })
    setShowTaskForm(false)
    setShowSubTaskForm(false)
  }

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    await updateTaskStatus(taskId, newStatus)
  }

  const handleProjectStatusChange = async (newStatus: ProjectStatus) => {
    await updateProjectStatus(projectId, newStatus)
  }

  const handleEditProject = async (data: ProjectFormData) => {
    await updateProject(projectId, {
      ...data,
    })
    setShowEditProject(false)
  }

  const handleSaveAsTemplate = async () => {
    await saveProjectAsTemplate(projectId)
  }

  // Validate projectId is a UUID
  if (!projectId || projectId.length < 32) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">无效的项目 ID</p>
        <Button variant="outline" onClick={() => router.push("/projects")}>
          返回项目目录
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* 返回按钮 */}
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
          ← 返回项目目录
        </Button>
      </div>

      <ProjectDetail
        project={project}
        tasks={tasks}
        onAddTask={handleAddTask}
        onEditTask={handleEditTask}
        onEditProject={() => setShowEditProject(true)}
        onSaveAsTemplate={handleSaveAsTemplate}
        onStatusChange={handleStatusChange}
        onProjectStatusChange={handleProjectStatusChange}
      />

      {/* 编辑项目对话框 */}
      <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
          </DialogHeader>
          <ProjectForm
            onSave={handleEditProject}
            onCancel={() => setShowEditProject(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 新建任务对话框 */}
      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{parentTaskId ? "添加子任务" : editingTaskId ? "编辑任务" : "新建任务"}</DialogTitle>
          </DialogHeader>
          <TaskForm
            projectId={projectId}
            parentId={parentTaskId ?? undefined}
            onSave={handleSaveTask}
            onCancel={() => { setShowTaskForm(false); setParentTaskId(null); setEditingTaskId(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* 添加子任务对话框 */}
      <Dialog open={showSubTaskForm} onOpenChange={setShowSubTaskForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加子任务</DialogTitle>
          </DialogHeader>
          <TaskForm
            projectId={projectId}
            parentId={parentTaskId ?? undefined}
            onSave={handleSaveTask}
            onCancel={() => { setShowSubTaskForm(false); setParentTaskId(null) }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Rewrite page.tsx as Server Component**

File: `frontend/src/app/projects/[id]/page.tsx`

```typescript
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { DetailClient } from "./detail-client"

const userId = "current-user" // TODO: get from session

export const dynamic = "force-dynamic"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  const project = await projectRepo.findById(projectId, userId)
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">项目不存在</p>
        <a href="/projects" className="text-sm text-primary hover:underline">
          返回项目目录
        </a>
      </div>
    )
  }

  const tasks = await taskRepo.findByProject(projectId, userId)

  return <DetailClient project={project} tasks={tasks} />
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep -E "projects/\[id\]"` 
Expected: No output

- [ ] **Step 4: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/app/projects/[id]/page.tsx frontend/src/app/projects/[id]/detail-client.tsx
git commit -m "fix: refactor project detail page to server/client split"
```

---

### Task 6: Update Navigation Label

**Files:**
- Modify: `frontend/src/app/page.tsx:469`

**What:** Change the sidebar navigation label from "项目" to "项目/任务".

- [ ] **Step 1: Update the label**

File: `frontend/src/app/page.tsx`, line 469

Change:
```tsx
项目
```
To:
```tsx
项目/任务
```

- [ ] **Step 2: Commit**

```bash
cd /home/walker/lifeware
git add frontend/src/app/page.tsx
git commit -m "fix: update nav label from 项目 to 项目/任务"
```

---

### Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `cd frontend && node_modules/.bin/tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"`
Expected: Only pre-existing errors (okr-types.test.ts)

- [ ] **Step 2: Lint check on changed files**

Run: `cd frontend && npx eslint "src/app/projects/**/*.tsx" "src/components/projects/template-dialog.tsx" "src/components/projects/project-detail.tsx" --max-warnings 10 2>&1`
Expected: No new errors

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run 2>&1 | tail -5`
Expected: 10 passed (our tests), same pre-existing failures

- [ ] **Step 4: Build verification**

Run: `cd frontend && npm run build 2>&1 | tail -30`
Expected: Successful build, no `Module not found: Can't resolve 'fs'` error

- [ ] **Step 5: Commit**

```bash
cd /home/walker/lifeware
git add -A
git commit -m "chore: final verification after client-db fix"
```

---

## Dependency Order

```
Task 1 (Server Actions) 
  → Task 2 (Projects list page — depends on actions)
  → Task 3 (TemplateDialog — independent, but needed by Task 2)
  → Task 4 (ProjectDetail — independent)
  → Task 5 (Detail page — depends on Task 4 + actions)
  → Task 6 (Nav label — independent)
  → Task 7 (Verification — depends on all)
```

Tasks 3, 4, and 6 are independent and can run in parallel.
Tasks 2 and 5 depend on Task 1 (Server Actions must exist first).
Task 5 depends on Task 4 (ProjectDetail refactored to accept props).

## Parallel Opportunities

```
Batch 1: Task 1 (Server Actions) — blocking
Batch 2: Task 3 (TemplateDialog) || Task 4 (ProjectDetail) || Task 6 (Nav label)
Batch 3: Task 2 (Projects page) || Task 5 (Detail page)
Batch 4: Task 7 (Verification)
```
