# 任务管理迭代修正 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复任务管理迭代 [016]-[023] 验证中发现的全部阻断性 bug、对比度问题、筛选/数据增强、NLP 解析问题。

**Architecture:** 按 Nexus 四层架构分层修改 — USOM (manifest) → Nexus (intent-engine, orchestrator) → Domain Plugin (handlers, hooks, validation, surfaces) → Page。每个 Task 聚焦 1-2 个文件，顺序执行避免冲突。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui

**上游设计文档:** `docs/superpowers/specs/2026-06-10-task-management-iteration-fix-design.md`

---

## 文件结构

| 文件 | 负责内容 | 涉及 Task |
|------|----------|-----------|
| `frontend/src/domains/tasks/manifest.yaml` | action 改名、lifecycle 定义 | 1, 9 |
| `frontend/src/domains/tasks/cnui/handlers.ts` | handler 注册、筛选、提交路径、数据格式 | 1, 2 |
| `frontend/src/domains/tasks/components/thread-list-panel.tsx` | action 映射、对比度 | 3 |
| `frontend/src/app/actions/tasks.ts` | promoteToThread 子任务关联 | 4 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 信息增强、搜索、对比度 | 5 |
| `frontend/src/domains/tasks/components/task-filter-bar.tsx` | 对比度修复 | 6 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx` | 对比度修复、筛选排序 | 7 |
| `frontend/src/domains/tasks/pages/TaskTreePage.tsx` | 默认排序 | 8 |
| `frontend/src/nexus/core/intent-engine/routing-context.ts` | 枚举值注入 | 9 |
| `frontend/src/domains/tasks/hooks.ts` | 字段值规范化 | 10 |
| `frontend/src/app/actions/intent.ts` | 解析失败兜底 | 11 |
| `docs/UI-DESIGN-SPEC.md` | 禁止清单附录 | 12 |

---

### Task 1: manifest.yaml + handlers.ts — 改名 + 注册 + 筛选修正

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`
- Modify: `frontend/src/domains/tasks/cnui/handlers.ts`

**Bug 2** (handler 未注册) + **Bug 4** (updateThread 缺 action) + **§4.5** (筛选条件修正) + **§5** (viewTree 改名)

- [ ] **Step 1: manifest.yaml — 改名 viewTree → viewTaskTree**

在 `frontend/src/domains/tasks/manifest.yaml` 中：

将 intent_triggers 中的 `viewTree` action 改名（约 line 168-177）：

```yaml
  # 改名前
  - action: viewTree
    shortcut: /viewTree
    description: 查看任务树（CNUI 内展示，含搜索和树形结构）
    ...
    keywords: [任务树, 查看任务, 展示]

  # 改名后
  - action: viewTaskTree
    shortcut: /viewTaskTree
    description: 查看任务树（CNUI 内展示，含搜索和树形结构）
    ...
    keywords: [任务树, 查看任务, 展示]
```

将 `query_actions` 中的 `viewTree` 键改名（约 line 459）：

```yaml
  # 改名前
  query_actions:
    viewTree:
      action: viewTree
      ...

  # 改名后
  query_actions:
    viewTaskTree:
      action: viewTaskTree
      ...
```

- [ ] **Step 2: handlers.ts — 注册 task-tree-view + 改名 viewTree → viewTaskTree**

在 `frontend/src/domains/tasks/cnui/handlers.ts` 中：

**2a.** 在 `surfaceHandlers` 导出（约 line 454-462）中添加缺失的 `task-tree-view`：

```typescript
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
  'thread-creation-card': taskCnuiHandler,
  'thread-promote-card': taskCnuiHandler,
  'thread-action-panel': taskCnuiHandler,
  'task-split-card': taskCnuiHandler,
  'task-tree-view': taskCnuiHandler,  // ← 新增：修复 Bug 2
}
```

**2b.** 在 `open()` 方法中，将 `action === 'viewTree'` 改为 `action === 'viewTaskTree'`（约 line 359）。

**2c.** 在 `submit()` 方法中，将 `action === 'viewTree'` 改为 `action === 'viewTaskTree'`（约 line 398）。

- [ ] **Step 3: handlers.ts — 修正筛选条件映射 (§4.5)**

```typescript
/** 任务生命周期状态映射 — 用于查询对应状态的任务列表 */
const TASK_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'in_progress',  // 修正：'active' 不是合法状态，应为 'in_progress'
  archiveTask: 'completed',     // 不变
}
```

修正 `DELETABLE_TASK_STATUSES`（约 line 24）：

```typescript
/** 可删除的任务状态列表 — 仅归档后可删除（业务规则） */
const DELETABLE_TASK_STATUSES = ['archived']
```

同步更新 `TASK_LIFECYCLE_SM_ACTION` 注释，使其反映业务规则。

- [ ] **Step 4: handlers.ts — updateThread 列表分支补充 action 字段 (Bug 4)**

在 `open()` 方法的 `updateThread` 分支中，当既无 threadId 也无 name 时返回全部主线的 `dataSnapshot` 中添加 `action: 'update'`（约 line 199-210）：

```typescript
const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
return {
  content: '请选择要修改的主线',
  dataSnapshot: {
    action: 'update',  // ← 新增：修复 Bug 4，使 ThreadActionPanel 进入编辑模式
    threads: threads.map(t => ({
      id: t.id,
      name: t.name,
      color: t.color,
      status: t.status,
    })),
  },
}
```

- [ ] **Step 5: handlers.ts — 扩展 formatTaskList 增加字段 (§4.3)**

```typescript
function formatTaskList(tasks: any[]): Record<string, unknown>[] {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
    clarity: t.clarity,               // 新增
    startDate: t.startDate,           // 新增
    endDate: t.endDate,               // 新增
    actualDuration: t.actualDuration, // 新增
  }))
}
```

- [ ] **Step 6: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

确认无类型错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/tasks/manifest.yaml frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "fix: 注册 task-tree-view handler + 修正筛选条件 + viewTree 改名 + updateThread action 补全 [016][019b][021]"
```

---

### Task 2: handlers.ts — 提交路径拆分 + 归档校验 + promoteToThread 筛选

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/handlers.ts`

**Bug 3** (update 走错 SM 路径) + **Bug 5** (归档主线接受新任务) + **§4.1** (promoteToThread 筛选)

- [ ] **Step 1: submit() — updateTask/updateThread 走直接 repo (Bug 3)**

在 `submit()` 方法中，在 `if (action === 'promoteToThread')` 分支**之前**，新增 updateTask 和 updateThread 的直接 repo 路径：

```typescript
async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
  // viewTaskTree 是纯展示 query action，无提交操作
  if (action === 'viewTaskTree') {
    return { success: true }
  }

  try {
    // ── 字段更新：不走 SM，直接 repo 调用（临时方案） ──
    // updateTask: 字段更新走直接 repo
    if (action === 'updateTask') {
      const { updateTask } = await import('@/app/actions/tasks')
      const task = await updateTask(fields.taskId as string, fields as any)
      return { success: true, data: { object: task } }
    }

    // updateThread: 字段更新走直接 repo
    if (action === 'updateThread') {
      const { updateThread } = await import('@/app/actions/tasks')
      const thread = await updateThread(fields.threadId as string, fields as any)
      return { success: true, data: { object: thread } }
    }

    // promoteToThread 是多阶段编排操作...
    if (action === 'promoteToThread') {
      // ... 保持不变
    }
    // ... 后续代码不变
```

> **备注**: 此为临时方案。SM 支持的字段更新范围，后续通过专题统一规范。

- [ ] **Step 2: submit() — createTask 归档主线校验 (Bug 5)**

在 `submit()` 方法的末尾（通用 `submitDynamicIntent` 调用之前），新增 createTask 校验：

```typescript
    // createTask 校验：已归档主线不允许添加任务
    if (action === 'createTask' && fields.threadId) {
      const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
      const repo = new ThreadRepository()
      const thread = await repo.findById(fields.threadId as USOM_ID, MVP_USER_ID as USOM_ID)
      if (thread?.status === 'archived') {
        return { success: false, error: '已归档的主线不允许添加任务' }
      }
    }

    const result = await submitDynamicIntent('tasks', action, fields)
    return { success: result.success, error: result.error, data: result.object ? { object: result.object } : undefined }
```

- [ ] **Step 3: open() promoteToThread — 顶级任务筛选 (§4.1)**

在 `promoteToThread` 的 `open()` 分支中，修改兜底列表查询（约 line 233-238）：

```typescript
    if (action === 'promoteToThread') {
      if (intentFields?.taskId) {
        // ... 保持不变
      }
      if (intentFields?.title) {
        const repo = new TaskRepository()
        const candidates = await repo.searchByTitle(intentFields.title as string, MVP_USER_ID as USOM_ID)
        // 筛选：仅顶级、非终止状态的任务
        const filtered = candidates.filter(t =>
          !t.parentId && !['paused', 'completed', 'archived', 'deleted'].includes(t.status)
        )
        if (filtered.length === 1) {
          return { content: '确认将任务提升为主线', dataSnapshot: { task: formatTaskDetail(filtered[0]), phase: 'detail' } }
        }
        if (filtered.length > 1) {
          return { content: '找到多个匹配任务，请选择', dataSnapshot: { items: formatTaskList(filtered), phase: 'select' } }
        }
      }
      // 兜底：列出所有符合条件的任务
      const repo = new TaskRepository()
      const allTasks = await repo.findByUserId(MVP_USER_ID as USOM_ID)
      const candidates = allTasks.filter(t =>
        !t.parentId && !['paused', 'completed', 'archived', 'deleted'].includes(t.status)
      )
      return {
        content: '请选择要提升为主线的任务',
        dataSnapshot: { tasks: formatTaskList(candidates), phase: 'search' },
      }
    }
```

- [ ] **Step 4: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "fix: updateTask/updateThread 走直接 repo + 归档主线校验 + promoteToThread 筛选 [019a][022][017a]"
```

---

### Task 3: ThreadListPanel — action→status 映射 + 对比度修复

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

**Bug 1** (action 映射错误) + 对比度修复

- [ ] **Step 1: 新增 ACTION_TO_TARGET_STATUS 映射**

在 `ThreadListPanel` 函数之前（约 line 58），添加映射常量：

```typescript
/** manifest lifecycle action → 目标 Thread status 映射 */
const ACTION_TO_TARGET_STATUS: Record<string, string> = {
  pause: 'paused',
  resume: 'active',
  complete: 'completed',
  archive: 'archived',
}
```

- [ ] **Step 2: 修复 handleClick 中的 action→status 转换**

在 `handleClick` 的操作菜单回调中（约 line 276-280），将 `act.action` 通过映射转换为目标状态：

```typescript
} else if (act.action === 'pause' || act.action === 'resume' || act.action === 'complete' || act.action === 'archive') {
  const targetStatus = ACTION_TO_TARGET_STATUS[act.action]
  if (targetStatus) {
    await updateThreadStatus(thread.id, targetStatus as Thread['status'])
    toast.success(`${act.label}成功`)
    setLocalRefreshKey(k => k + 1)
  }
}
```

- [ ] **Step 3: 修复 "..." 按钮对比度**

将 "..." 按钮（约 line 257）的 `text-muted` 改为 `text-body`：

```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === thread.id ? null : thread.id) }}
  className="p-1 rounded hover:bg-hover-overlay transition-colors text-body hover:text-ink"
>
```

- [ ] **Step 4: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "fix: ThreadListPanel action→status 映射 + 对比度修复 [022]"
```

---

### Task 4: tasks.ts — promoteToThread 子任务关联

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts`

**§4.2** — 子任务保持层级但关联新主线 + 清除原任务 parentId

- [ ] **Step 1: 扩展 promoteToThread 函数**

在 `frontend/src/app/actions/tasks.ts` 的 `promoteToThread` 函数（约 line 402-429）末尾，`return newThread` 之前，添加子任务关联逻辑：

```typescript
export async function promoteToThread(
  taskId: string,
  threadFields?: Partial<CreateThreadInput>,
): Promise<Thread> {
  const taskRepo = new TaskRepository()
  const task = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!task) throw new Error('任务不存在')

  const threadInput: CreateThreadInput & { name: string } = {
    name: threadFields?.name ?? task.title,
    description: threadFields?.description ?? (task.description as string | undefined),
    color: threadFields?.color,
    priority: threadFields?.priority ?? (task.priority as CreateThreadInput['priority']),
    startDate: threadFields?.startDate,
    endDate: threadFields?.endDate,
    tags: threadFields?.tags,
  }
  const result = await submitDynamicIntent('tasks', 'createThread', threadInput as unknown as Record<string, unknown>)
  if (!result.success) {
    throw new Error(result.error ?? '提升为主线失败')
  }
  const newThread = result.object as Thread

  // 将原任务关联到新主线
  await taskRepo.update(taskId as USOM_ID, { threadId: newThread.id } as UpdateTaskInput, MVP_USER_ID as USOM_ID)

  // ── 新增：子任务关联到新主线 ──
  // 原任务的子任务保持层级结构（不改变 parentId），但全部关联到新主线
  const subtasks = await taskRepo.findByParent(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  for (const subtask of subtasks) {
    await taskRepo.update(subtask.id as USOM_ID, {
      threadId: newThread.id,
    } as UpdateTaskInput, MVP_USER_ID as USOM_ID)
  }

  // 清除原任务的 parentId（它现在是主线的直接子任务）
  if (task.parentId) {
    await taskRepo.update(taskId as USOM_ID, {
      parentId: null,
    } as UpdateTaskInput, MVP_USER_ID as USOM_ID)
  }

  return newThread
}
```

- [ ] **Step 2: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/actions/tasks.ts
git commit -m "fix: promoteToThread 子任务关联新主线 + 清除 parentId [017a]"
```

---

### Task 5: TaskActionPanel — 数据增强 + 列表搜索 + 对比度

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`

**§4.3** (信息增强) + **§4.4** (列表搜索) + 对比度

- [ ] **Step 1: 扩展 TaskItem 接口**

```typescript
/** 任务列表项 */
interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
  clarity?: string         // 新增
  startDate?: string       // 新增
  endDate?: string         // 新增
  actualDuration?: number  // 新增
}
```

- [ ] **Step 2: 添加状态和清晰度标签映射**

在 `PRIORITY_LABELS` 常量后新增：

```typescript
/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  archived: '已归档',
}

/** 清晰度标签 */
const CLARITY_LABELS: Record<string, string> = {
  fuzzy: '模糊',
  scoped: '有范围',
  actionable: '可执行',
}
```

- [ ] **Step 3: 添加列表搜索状态**

在组件函数体内，`const items = ...` 之后，添加搜索状态和过滤逻辑：

```typescript
export function TaskActionPanel({ dataModel, onConfirm, onCancel, isLoading, isDone }: TaskActionPanelProps) {
  const action = (dataModel.action as string) ?? 'complete'
  const items = (dataModel.items as TaskItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.complete

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localSearch, setLocalSearch] = useState('')  // ← 新增

  useEffect(() => {
    setSelectedIds(new Set())
    setLocalSearch('')  // ← 新增：切换 action 时清空搜索
  }, [action])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  // ← 新增：本地搜索过滤
  const filteredItems = useMemo(() => {
    if (!localSearch.trim()) return items
    const q = localSearch.trim().toLowerCase()
    return items.filter(t => t.title.toLowerCase().includes(q))
  }, [items, localSearch])
```

在文件顶部导入中添加 `useMemo`：

```typescript
import { useState, useEffect, useMemo } from 'react'
```

- [ ] **Step 4: 渲染搜索框和增强的任务列表**

将 `items.length === 0` 检查改为 `filteredItems.length === 0`。在全选栏之前插入搜索框，任务列表遍历改用 `filteredItems`：

```tsx
{items.length === 0 ? (
  <p className="py-8 text-center text-sm text-muted">没有符合条件的任务</p>
) : (
  <div className="flex flex-col gap-2">
    {/* 搜索框 */}
    <div className="relative mb-1">
      <input
        type="text" value={localSearch}
        onChange={e => setLocalSearch(e.target.value)}
        placeholder="按标题过滤..."
        className="w-full h-7 pl-2.5 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
      />
    </div>

    {/* 全选栏 */}
    <div className="flex items-center justify-between border-b border-hairline pb-2 text-xs text-body">
      ...
    </div>

    {/* 任务列表 — 使用 filteredItems */}
    {filteredItems.map(task => {
      const isSelected = selectedIds.has(task.id)
      return (
        <label key={task.id} ...>
          <input ... />
          <div className="flex-1 min-w-0">
            <div className={cn('text-sm font-medium truncate', isSelected && 'text-muted line-through')}>
              {task.title}
            </div>
            <div className="text-xs text-body">  {/* ← 对比度修复：text-muted → text-body */}
              {STATUS_LABELS[task.status] ?? task.status}
              {task.clarity && ` · ${CLARITY_LABELS[task.clarity] ?? task.clarity}`}
              {task.startDate && ` · ${task.startDate.slice(0, 10)}`}
              {task.actualDuration ? ` · 实际${task.actualDuration}分钟` : (task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : '')}
            </div>
          </div>
        </label>
      )
    })}
    ...
```

**重要**: 全选栏的 `text-xs text-muted` 改为 `text-xs text-body`（对比度修复）。

- [ ] **Step 5: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx
git commit -m "fix: TaskActionPanel 信息增强 + 列表搜索 + 对比度修复 [019a][019b][020][021]"
```

---

### Task 6: TaskFilterBar — 对比度修复

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-filter-bar.tsx`

- [ ] **Step 1: 修复 Search 图标对比度**

约 line 211，将 Search 图标的 `text-muted` 改为 `text-body`：

```tsx
<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
```

- [ ] **Step 2: 修复 ArrowUpDown 图标对比度**

约 line 238，将 ArrowUpDown 图标的 `text-muted` 改为 `text-body`：

```tsx
<ArrowUpDown className={cn('size-3 text-body transition-transform', sortOrder === 'desc' && 'rotate-180')} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/components/task-filter-bar.tsx
git commit -m "fix: TaskFilterBar 搜索/排序图标对比度修复 [022]"
```

---

### Task 7: TaskTreeView (CNUI) — 对比度修复 + 筛选排序

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx`

- [ ] **Step 1: 对比度修复 — Search、Chevron、ID badge**

```tsx
// Search 图标 (约 line 95)
<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />

// ChevronDown/ChevronRight (约 line 129-131)
{isExpanded
  ? <ChevronDown className="size-3.5 text-body shrink-0" />
  : <ChevronRight className="size-3.5 text-body shrink-0" />
}

// ID badge — 主线 (约 line 139)
<span
  className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
  ...
>

// ID badge — 任务 (约 line 161)
<span
  className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
  ...
>
```

- [ ] **Step 2: 添加筛选排序状态和控件**

在组件中添加新的 state：

```typescript
const [statusFilter, setStatusFilter] = useState<string>('all')
const [sortBy, setSortBy] = useState<'title' | 'startDate'>('title')
const [sortAsc, setSortAsc] = useState(true)
```

在搜索框和任务树之间，插入筛选排序工具栏：

```tsx
{/* 筛选排序工具栏 */}
<div className="px-3 pb-2 flex items-center gap-2 border-b border-hairline">
  {/* 状态筛选 */}
  <div className="flex items-center gap-1">
    {[
      { value: 'all', label: '全部' },
      { value: 'in_progress', label: '进行中' },
      { value: 'completed', label: '已完成' },
      { value: 'archived', label: '已归档' },
    ].map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => setStatusFilter(opt.value)}
        className={cn(
          'px-2 py-0.5 rounded-full text-[11px] transition-colors',
          statusFilter === opt.value
            ? 'bg-primary/15 text-primary-active font-medium'
            : 'text-body hover:bg-hover-overlay',
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>

  {/* 排序 */}
  <div className="ml-auto flex items-center gap-1">
    <select
      value={sortBy}
      onChange={e => setSortBy(e.target.value as 'title' | 'startDate')}
      className="h-6 rounded border border-hairline bg-canvas px-1 text-[11px] text-ink cursor-pointer appearance-none"
    >
      <option value="title">标题</option>
      <option value="startDate">开始时间</option>
    </select>
    <button
      type="button"
      onClick={() => setSortAsc(!sortAsc)}
      className="h-6 w-6 flex items-center justify-center rounded border border-hairline bg-canvas hover:bg-hover-overlay text-body"
      title={sortAsc ? '顺序' : '逆序'}
    >
      <ArrowUpDown className={cn('size-3 text-body transition-transform', !sortAsc && 'rotate-180')} />
    </button>
  </div>
</div>
```

在文件顶部添加 `ArrowUpDown` 到 lucide-react import：

```typescript
import { Search, ChevronRight, ChevronDown, Check, ArrowUpDown } from 'lucide-react'
```

- [ ] **Step 3: 在 getThreadTasks 中应用筛选排序**

修改 `getThreadTasks` 函数，增加筛选和排序逻辑：

```typescript
function getThreadTasks(threadId: string) {
  let result = filteredTasks.filter(t => t.threadId === threadId && !t.parentId)

  // 状态筛选
  if (statusFilter !== 'all') {
    result = result.filter(t => t.status === statusFilter)
  }

  // 排序
  result.sort((a, b) => {
    const cmp = sortBy === 'title'
      ? a.title.localeCompare(b.title)
      : (a.startDate ?? '').localeCompare(b.startDate ?? '')
    return sortAsc ? cmp : -cmp
  })

  return result
}
```

> **注意**: TreeNode 接口需扩展 `startDate` 字段，且 handlers.ts 的 `viewTaskTree` open 分支中的 tasks 映射也需加入 `startDate`。

更新 TreeNode 接口：

```typescript
interface TreeNode {
  id: string
  title: string
  status: string
  kind: 'thread' | 'task'
  parentId?: string | null
  threadId?: string | null
  estimatedDuration?: number | null
  priority?: string | null
  startDate?: string | null  // 新增
}
```

在 handlers.ts 的 `viewTaskTree` open 分支中，tasks 映射添加 `startDate`：

```typescript
tasks: allTasks.map(t => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  threadId: t.threadId,
  parentId: t.parentId,
  estimatedDuration: t.estimatedDuration,
  startDate: t.startDate,  // 新增
})),
```

- [ ] **Step 4: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "fix: TaskTreeView CNUI 对比度 + 筛选排序能力 [016][022]"
```

---

### Task 8: TaskTreePage — 默认排序

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`

- [ ] **Step 1: 修改默认排序字段**

约 line 54，将默认排序从 `'title'` 改为 `'startDate'`：

```typescript
// 修改前
const [sortBy, setSortBy] = useState<SortField>('title')

// 修改后
const [sortBy, setSortBy] = useState<SortField>('startDate')
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "fix: 任务树默认排序改为开始时间 [022]"
```

---

### Task 9: routing-context.ts — 枚举值注入 AI prompt

**Files:**
- Modify: `frontend/src/nexus/core/intent-engine/routing-context.ts`

**§6.1** — AI prompt 中的字段描述追加枚举选项

- [ ] **Step 1: 新增 ENUM_VALUE_MAP**

在 `FIELD_SYNONYMS` 常量之后，添加枚举值映射：

```typescript
/** 枚举字段值映射 — 帮助 LLM 将中文表述转换为系统枚举值 */
const ENUM_VALUE_MAP: Record<string, string> = {
  priority: '选项: critical(紧急)/high(高)/medium(中)/low(低)',
  energyRequired: '选项: high(高能量/需要专注)/medium(中)/low(低/轻松)',
  status: '选项: todo(待办)/planned(已计划)/in_progress(进行中)/completed(已完成)/archived(已归档)',
}
```

- [ ] **Step 2: 在字段 hint 中注入枚举提示**

在 `formatRoutingContextForPrompt` 函数中，修改 `fieldHints` 构建逻辑（约 line 109-112）：

```typescript
const fieldHints = a.fields.length > 0
  ? '\n  字段: ' + a.fields.map(f => {
      const synonyms = FIELD_SYNONYMS[f.name]
      const synonymHint = synonyms?.length ? `, 同义词: ${synonyms.join('/')}` : ''
      const enumHint = ENUM_VALUE_MAP[f.name] ? ` (${ENUM_VALUE_MAP[f.name]})` : ''
      return `${f.name}(${f.label}, ${f.type}${f.required ? ', 必填' : ''}${synonymHint})${enumHint}`
    }).join(', ')
  : ''
```

- [ ] **Step 3: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/nexus/core/intent-engine/routing-context.ts
git commit -m "fix: AI prompt 字段描述注入枚举值映射 [018]"
```

---

### Task 10: hooks.ts + validation.ts — 字段值后处理规范化

**Files:**
- Modify: `frontend/src/domains/tasks/hooks.ts`
- Modify: `frontend/src/domains/tasks/validation.ts`

**§6.2** — 在验证前将中文表述转换为系统枚举

- [ ] **Step 1: 在 hooks.ts 中新增 normalizeFieldValues**

在 `createTasksHooks` 函数之前，添加规范化函数：

```typescript
/**
 * 规范化字段值 — 将自然语言表述转换为系统枚举。
 * 在 onValidate 中调用，确保 AI 解析的中文值能通过验证。
 * @param fields - 原始字段对象
 * @returns 规范化后的字段对象
 */
function normalizeFieldValues(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...fields }

  // 优先级：中文 → 枚举
  if (typeof normalized.priority === 'string') {
    const priorityMap: Record<string, string> = {
      '高': 'high', '高优先级': 'high', '紧急': 'critical', '最重要': 'critical',
      '中': 'medium', '中等': 'medium', '普通': 'medium',
      '低': 'low', '低优先级': 'low', '不急': 'low',
    }
    const mapped = priorityMap[normalized.priority]
    if (mapped) normalized.priority = mapped
  }

  // 日期格式规范化：YYYY/MM/DD → YYYY-MM-DD
  for (const key of ['dueDate', 'startDate', 'endDate']) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = (normalized[key] as string).replace(/\//g, '-')
    }
  }

  return normalized
}
```

- [ ] **Step 2: 在 onValidate 中调用规范化**

在 `onValidate` 函数体开头（约 line 63），在 `const errors: string[] = []` 之后，插入规范化调用：

```typescript
function onValidate(
  intent: StructuredIntent,
  _snapshot: USOMSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  // 规范化字段值（中文→枚举、日期格式等）
  const fields = normalizeFieldValues(intent.fields)
  const { action } = intent
```

后续所有 `intent.fields` 的引用改为使用规范化后的 `fields`：

```typescript
if (action === 'createTask' || action === 'updateTask') {
  const result = validateTaskFields(fields, action as 'createTask' | 'updateTask')
  errors.push(...result.errors)
}

if (action === 'createThread' || action === 'updateThread') {
  const result = validateThreadFields(fields, action as 'createThread' | 'updateThread')
  errors.push(...result.errors)
}

// 生命周期状态转换验证
const targetStatus = fields['targetStatus'] as string | undefined
const currentStatus = fields['currentStatus'] as string | undefined
const targetType = fields['targetType'] as 'task' | 'thread' | undefined

// ... 后续不变

if (action === 'promoteToThread') {
  const taskId = fields['taskId']
  if (!taskId || typeof taskId !== 'string') {
    errors.push('taskId 必填')
  }
}
```

- [ ] **Step 3: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/hooks.ts
git commit -m "fix: onValidate 字段值规范化（中文→枚举、日期格式） [018]"
```

---

### Task 11: intent.ts — 解析失败 CNUI 表单兜底

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`

**§6.3** — AI 解析失败时不直接报错，而是构建低置信度 intent 触发 CNUI 表单

- [ ] **Step 1: 新增兜底 intent 构建函数**

在 `executePipeline` 函数之前，添加辅助函数：

```typescript
/**
 * 从原始输入推断可能的 action 名称
 * @param rawInput - 用户原始输入
 * @returns 推断的 action 名称，或 undefined
 */
function guessActionFromInput(rawInput: string): string | undefined {
  const input = rawInput.toLowerCase()
  const ACTION_KEYWORDS: Record<string, string[]> = {
    createTask: ['创建任务', '新建任务', '添加任务', '/createtask'],
    createThread: ['创建主线', '新建主线', '/createthread'],
    updateTask: ['修改任务', '更新任务', '/updatetask'],
    completeTask: ['完成任务', '/completetask'],
    archiveTask: ['归档任务', '/archivetask'],
    deleteTask: ['删除任务', '/deletetask'],
    promoteToThread: ['提升为主线', '/promotetothread'],
  }
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some(kw => input.includes(kw))) return action
  }
  // 默认：创建任务（最常见操作）
  return 'createTask'
}

/**
 * 构建 CNUI 表单兜底 intent
 * 当 AI 解析失败时，构建一个低置信度 intent 触发 CNUI 表单让用户手动填写
 */
function buildFallbackIntent(rawInput: string, intentionId: string): AIParserResult {
  return {
    success: true,
    intent: {
      id: crypto.randomUUID(),
      intentionId,
      targetDomain: 'tasks',
      action: guessActionFromInput(rawInput) ?? 'createTask',
      fields: {},
      confidence: 0.3,
      resolvedBy: 'ai',
      createdAt: new Date().toISOString(),
    } as any,
  }
}
```

- [ ] **Step 2: 在 executePipeline 中拦截解析失败**

在 `executePipeline` 函数中（约 line 184-195），修改解析失败的处理逻辑：

```typescript
// Step 1: 解析意图
let parseResult = await intentSupplier();
if (!parseResult.success || !parseResult.intent) {
  // ── 新增：解析失败兜底 → 构建 CNUI 表单 intent ──
  // 从 rawInput 推断可能的 action，构建低置信度 intent
  // 让 Orchestrator 检测到 confidence < 0.5 时自动进入 CNUI 表单模式
  const fallbackIntentionId = crypto.randomUUID()
  parseResult = buildFallbackIntent(rawInput, fallbackIntentionId)

  // 如果兜底也失败，返回原始错误
  if (!parseResult.success || !parseResult.intent) {
    const timeboxes = await fetchTimeboxSummaries();
    if (logger) logger.endSession('error');
    return {
      success: false,
      timeboxes,
      error: parseResult.error ?? '意图解析失败，请使用表单模式',
      traceSession: logger?.getSessions()[0],
    };
  }
}
```

> **注意**: `buildFallbackIntent` 构建 `confidence: 0.3` 的 intent。Orchestrator 的 `executeIntent` 中需检查 confidence 并触发 CNUI 确认。现有 Orchestrator 已有 `resolvedBy === 'ai'` + `response_type === 'cnui'` 的 CNUI 确认拦截。低置信度 intent 会自然进入该路径。

- [ ] **Step 3: 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "fix: AI 解析失败兜底 → 构建 CNUI 表单 intent [018]"
```

---

### Task 12: UI-DESIGN-SPEC.md — §1.7 禁止颜色类清单

**Files:**
- Modify: `docs/UI-DESIGN-SPEC.md`

- [ ] **Step 1: 在 §1.6 暗色模式之后、§二 排版体系之前插入 §1.7**

在约 line 128 (`---` 分隔线) 之前，插入新的 §1.7：

```markdown

### 1.7 禁止使用的颜色类（交互元素）

以下 Tailwind 类 **禁止** 用于任何可交互或需阅读的元素：

| 禁止类 | 适用场景 | 原因 | 替代 |
|--------|----------|------|------|
| `text-muted` | 图标、按钮、链接、select 文字 | 对比度仅 4.1:1，低于 AA 4.5:1 正常文本标准 | `text-body` |
| `text-muted-soft` | 任何可见元素（除 `placeholder:` 伪类） | 对比度仅 3.5:1，远低于 AA 标准 | `text-muted`（仅限纯装饰辅助文字） |
| `text-muted-foreground` | 任何元素 | 非规范令牌，无对应 CSS 变量 | `text-body` |

> **豁免**: `placeholder:text-muted-soft` — 占位符本身是装饰性提示，用户输入后会消失，可继续使用。

> **审查**: PR 审查时，检查 `text-muted` 和 `text-muted-soft` 是否用于交互元素（图标、按钮、标签、链接）。违反此规则的 PR 不得合并。

```

- [ ] **Step 2: Commit**

```bash
git add docs/UI-DESIGN-SPEC.md
git commit -m "docs: UI-DESIGN-SPEC 新增 §1.7 禁止颜色类清单 [022]"
```

---

## 自审检查

### 1. Spec 覆盖率

| Spec 需求 | 对应 Task |
|-----------|-----------|
| Bug 1: ThreadListPanel action 映射 | Task 3 |
| Bug 2: task-tree-view handler 注册 | Task 1 |
| Bug 3: updateTask/updateThread 提交路径 | Task 2 |
| Bug 4: updateThread dataSnapshot action | Task 1 |
| Bug 5: 归档主线不接受新任务 | Task 2 |
| §3 对比度 — TaskFilterBar | Task 6 |
| §3 对比度 — ThreadListPanel "..." | Task 3 |
| §3 对比度 — TaskTreeView | Task 7 |
| §3 对比度 — TaskActionPanel 标签 | Task 5 |
| §4.1 promoteToThread 筛选 | Task 2 |
| §4.2 promoteToThread 子任务关联 | Task 4 |
| §4.3 任务列表信息增强 | Task 5 + Task 1 (formatTaskList) |
| §4.4 CNUI 列表搜索 | Task 5 |
| §4.5 筛选条件修正 | Task 1 |
| §5 viewTree 改名 | Task 1 |
| §6.1 prompt 枚举注入 | Task 9 |
| §6.2 后处理规范化 | Task 10 |
| §6.3 解析失败兜底 | Task 11 |
| §7.1 默认排序 | Task 8 |
| §7.2 CNUI TaskTreeView 筛选排序 | Task 7 |
| §3 规范 — UI-DESIGN-SPEC §1.7 | Task 12 |

### 2. 占位符扫描

无 TBD/TODO/待实现/占位符。

### 3. 类型一致性

- `TaskItem` 接口在 Task 5 定义，在 handlers.ts 的 `formatTaskList` 返回值中使用 — 字段名一致
- `ACTION_TO_TARGET_STATUS` 的 value（`'paused'`、`'active'` 等）与 `Thread['status']` 类型一致
- `DELETABLE_TASK_STATUSES = ['archived']` 与 manifest lifecycle 业务规则一致
- `normalizeFieldValues` 的 key 名（`dueDate`、`startDate`、`endDate`）与 schema field 名一致
