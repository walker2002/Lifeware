# Tasks Domain 页面开发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Tasks Domain 三个页面（TaskTreePage、TaskDetailPage、ThreadDetailPage）的完整数据、交互、状态管理。

**Architecture:** 单页 + 状态驱动抽屉。TaskTreePage 是唯一容器，任务详情/主线详情通过 Drawer 弹出，独立页面 `/tasks/[id]` / `/threads/[id]` 复用相同组件。只读走 Repository，写入构造 PrebuiltIntent 走 Nexus 全链路。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Drizzle ORM, lucide-react

---

## Sprint 1：基础框架

### Task 1.1: 新增 DB 字段 + 迁移

**Files:**
- Modify: `frontend/src/lib/db/schema.ts` — tasks 表新增 2 列
- Create: `frontend/src/lib/db/migrations/0014_add_task_placeholders.sql` — 迁移 SQL

- [ ] **Step 1: 在 schema.ts 的 tasks 表新增 acceptance_criteria 和 expected_output**

在 `frontend/src/lib/db/schema.ts` 查找 tasks 表定义中的 `aiTags` 字段位置，在其后新增：

```typescript
// AI 辅助占位字段（未来功能）
acceptanceCriteria: text('acceptance_criteria'),
expectedOutput: text('expected_output'),
```

- [ ] **Step 2: 创建迁移 SQL 文件**

创建 `frontend/src/lib/db/migrations/0014_add_task_placeholders.sql`：

```sql
ALTER TABLE tasks ADD COLUMN acceptance_criteria text;
ALTER TABLE tasks ADD COLUMN expected_output text;
```

- [ ] **Step 3: 更新迁移日志 journal**

在 `frontend/src/lib/db/migrations/meta/_journal.json` 的 `entries` 数组中追加：

```json
{"idx": 14, "version": "14", "when": 1717500000000, "tag": "0014_add_task_placeholders", "breakpoints": false}
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/0014_add_task_placeholders.sql frontend/src/lib/db/migrations/meta/_journal.json
git commit -m "feat(db): tasks 表新增 acceptance_criteria + expected_output 占位字段

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.2: 更新 USOM/DB 设计文档

**Files:**
- Modify: `docs/usom-design.md`
- Modify: `docs/database-design.md`

- [ ] **Step 1: 更新 USOM 设计文档 Task 对象**

在 `docs/usom-design.md` 的 Task 对象定义中，在 `notes` 字段后新增：

```markdown
| `acceptanceCriteria` | `string \| null` | 验收标准（自由文本，占位字段） |
| `expectedOutput` | `string \| null` | 预期产出物描述（占位字段） |
```

- [ ] **Step 2: 更新数据库设计文档 tasks 表**

在 `docs/database-design.md` 的 tasks 表定义中，在 `notes` 列后新增：

```sql
acceptance_criteria text,    -- 验收标准（占位）
expected_output text,         -- 预期产出物描述（占位）
```

- [ ] **Step 3: 提交**

```bash
git add docs/usom-design.md docs/database-design.md
git commit -m "docs: USOM/DB 文档同步 acceptance_criteria + expected_output 字段

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.3: Repository 计算字段扩展 — Task childCount

**Files:**
- Modify: `frontend/src/domains/tasks/repository/task.ts`

- [ ] **Step 1: 新增 getChildCount 方法**

在 `frontend/src/domains/tasks/repository/task.ts` 的 TaskRepository 类中新增方法：

```typescript
/**
 * 获取子任务数量
 * @param parentId - 父任务 ID
 * @param userId - 用户 ID
 * @returns 子任务数量
 */
async getChildCount(parentId: USOM_ID, userId: USOM_ID): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` })
    .from(s.tasks)
    .where(and(
      eq(s.tasks.parentId, parentId),
      eq(s.tasks.userId, userId),
    ))
  return result[0]?.count ?? 0
}

/**
 * 批量获取子任务数量（用于任务树展开箭头）
 * @param parentIds - 父任务 ID 列表
 * @param userId - 用户 ID
 * @returns Map<parentId, count>
 */
async getChildCounts(parentIds: USOM_ID[], userId: USOM_ID): Promise<Map<string, number>> {
  if (parentIds.length === 0) return new Map()
  const rows = await db.select({
    parentId: s.tasks.parentId,
    count: sql<number>`count(*)::int`,
  })
    .from(s.tasks)
    .where(and(
      inArray(s.tasks.parentId, parentIds),
      eq(s.tasks.userId, userId),
    ))
    .groupBy(s.tasks.parentId)
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.parentId) map.set(row.parentId, row.count)
  }
  return map
}
```

需要在文件顶部导入 `sql`：
```typescript
import { sql } from 'drizzle-orm'
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/repository/task.ts
git commit -m "feat(repo): TaskRepository 新增 getChildCount / getChildCounts 聚合方法

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.4: Repository 计算字段扩展 — Thread taskCount

**Files:**
- Modify: `frontend/src/domains/tasks/repository/thread.ts`

- [ ] **Step 1: 新增 findAllWithCount 方法**

在 `frontend/src/domains/tasks/repository/thread.ts` 的 ThreadRepository 类中新增方法：

```typescript
import { sql } from 'drizzle-orm'

/**
 * 带任务计数的 Thread 查询结果
 */
export interface ThreadWithCount {
  thread: Thread
  taskCount: number
  completedTaskCount: number
}

/**
 * 查找所有主线并附带任务计数
 * @param userId - 用户 ID
 * @returns 带计数的 Thread 列表
 */
async findAllWithCount(userId: USOM_ID): Promise<ThreadWithCount[]> {
  const rows = await db.select({
    thread: s.threads,
    taskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} != 'archived')::int`,
    completedTaskCount: sql<number>`count(${s.tasks.id}) filter (where ${s.tasks.status} = 'completed')::int`,
  })
    .from(s.threads)
    .leftJoin(s.tasks, and(
      eq(s.tasks.threadId, s.threads.id),
      sql`${s.tasks.status} != 'archived'`,
    ))
    .where(eq(s.threads.userId, userId))
    .groupBy(s.threads.id)
    .orderBy(
      sql`CASE ${s.threads.status}
        WHEN 'active' THEN 0
        WHEN 'paused' THEN 1
        WHEN 'completed' THEN 2
        ELSE 3 END`,
      sql`CASE ${s.threads.priority}
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4 END`,
      s.threads.updatedAt,
    )

  return rows.map(r => ({
    thread: threadRowToUSOM(r.thread as any),
    taskCount: r.taskCount,
    completedTaskCount: r.completedTaskCount,
  }))
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/repository/thread.ts
git commit -m "feat(repo): ThreadRepository 新增 findAllWithCount 方法（含任务计数）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.5: TaskTreePage 布局骨架 — Banner + 左右分栏

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx` — 全部重写

- [ ] **Step 1: 重写 TaskTreePage**

替换 `frontend/src/domains/tasks/pages/TaskTreePage.tsx` 全部内容：

```typescript
/**
 * @file TaskTreePage
 * @brief 任务树页面 — 左侧主线列表 + 右侧任务树
 *
 * 核心页面容器。任务详情和主线详情以 Drawer 形式弹出。
 */

'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Plus, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThreadListPanel } from '../components/thread-list-panel'
import { TaskTreeView } from '../components/task-tree-view'
import { TaskDetailDrawer } from '../components/task-detail-drawer'
import { ThreadDetailDrawer } from '../components/thread-detail-drawer'

/**
 * 抽屉状态联合类型
 */
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string }
  | { type: 'thread'; threadId: string }

/**
 * 任务树页面组件
 */
export default function TaskTreePage() {
  const [selectedEntryId, setSelectedEntryId] = useState<string>('__all__')
  const [bannerCollapsed, setBannerCollapsed] = useState(false)
  const [drawer, setDrawer] = useState<DrawerState>({ type: 'closed' })

  const handleOpenTask = useCallback((taskId: string) => {
    setDrawer({ type: 'task', taskId })
  }, [])

  const handleOpenThread = useCallback((threadId: string) => {
    setDrawer({ type: 'thread', threadId })
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawer({ type: 'closed' })
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Banner 区域 */}
      {!bannerCollapsed && (
        <div className="relative bg-surface-soft border-b border-hairline px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-medium text-ink">任务</h1>
              <p className="text-sm text-muted mt-1">管理你的任务和主线</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setDrawer({ type: 'thread', threadId: '__new__' })}>
                <Plus className="size-4" />
                创建主线
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setBannerCollapsed(true)}>
                <ChevronUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 折叠态标题栏 */}
      {bannerCollapsed && (
        <div className="flex items-center justify-between border-b border-hairline px-6 py-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-body font-semibold text-ink">任务</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setDrawer({ type: 'thread', threadId: '__new__' })}>
              <Plus className="size-4" />
              创建主线
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setBannerCollapsed(false)}>
              <ChevronDown className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 主体：左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：主线列表 */}
        <aside className="w-[260px] shrink-0 border-r border-hairline overflow-y-auto">
          <ThreadListPanel
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
            onOpenThread={handleOpenThread}
          />
        </aside>

        {/* 右侧：任务树 */}
        <main className="flex-1 overflow-y-auto">
          <TaskTreeView
            entryId={selectedEntryId}
            onOpenTask={handleOpenTask}
            onQuickAdd={undefined}
          />
        </main>
      </div>

      {/* Drawer 层 */}
      {drawer.type === 'task' && (
        <TaskDetailDrawer
          taskId={drawer.taskId}
          onClose={handleCloseDrawer}
        />
      )}
      {drawer.type === 'thread' && (
        <ThreadDetailDrawer
          threadId={drawer.threadId}
          onClose={handleCloseDrawer}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "feat(ui): TaskTreePage 布局骨架 — Banner + 左右分栏 + Drawer 状态管理

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.6: 主线列表组件 ThreadListPanel

**Files:**
- Create: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

- [ ] **Step 1: 创建 ThreadListPanel 组件**

创建 `frontend/src/domains/tasks/components/thread-list-panel.tsx`：

```typescript
/**
 * @file thread-list-panel
 * @brief 主线列表面板 — 左侧固定入口 + 主线列表 + 筛选
 */

'use client'

import { useEffect, useState } from 'react'
import { ListTodo, FolderOpen } from 'lucide-react'
import { ThreadRepository, type ThreadWithCount } from '../repository/thread'
import { cn } from '@/lib/utils'

/** 固定入口 ID 常量 */
const FIXED_ENTRIES = [
  { id: '__all__', label: '全部任务', icon: ListTodo },
  { id: '__orphan__', label: '无主线任务', icon: FolderOpen },
] as const

/**
 * ThreadListPanel Props
 */
interface ThreadListPanelProps {
  selectedEntryId: string
  onSelectEntry: (id: string) => void
  onOpenThread: (id: string) => void
}

/**
 * 主线列表面板组件
 */
export function ThreadListPanel({
  selectedEntryId,
  onSelectEntry,
  onOpenThread,
}: ThreadListPanelProps) {
  const [threads, setThreads] = useState<ThreadWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const repo = new ThreadRepository()

  useEffect(() => {
    async function load() {
      // TODO: 从 auth 上下文获取 userId，MVP 阶段使用占位值
      const userId = 'placeholder' as any
      const data = await repo.findAllWithCount(userId)
      setThreads(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-10 rounded-md bg-surface-soft animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 固定入口 */}
      <div className="px-3 py-3 space-y-1">
        {FIXED_ENTRIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelectEntry(id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              selectedEntryId === id
                ? 'bg-surface-soft text-ink font-medium'
                : 'text-body hover:bg-[rgba(20,20,19,0.04)]',
            )}
          >
            <Icon className="size-4 text-muted" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* 分隔线 */}
      <div className="mx-3 border-t border-hairline-soft" />

      {/* 主线列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {threads.map(({ thread, taskCount, completedTaskCount }) => (
          <button
            key={thread.id}
            onClick={() => onSelectEntry(thread.id)}
            onDoubleClick={() => onOpenThread(thread.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              selectedEntryId === thread.id
                ? 'bg-surface-soft'
                : 'hover:bg-[rgba(20,20,19,0.04)]',
            )}
          >
            {/* 色块 */}
            <span
              className={cn(
                'shrink-0 w-1 self-stretch rounded-full',
                selectedEntryId === thread.id ? 'w-[6px]' : '',
              )}
              style={{ backgroundColor: thread.color ?? '#3498DB' }}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate text-ink">{thread.name}</span>
                {thread.status === 'paused' && (
                  <span className="shrink-0 rounded-pill bg-surface-card px-2 py-0.5 text-[10px] text-muted">
                    已暂停
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                {taskCount}个任务 · {completedTaskCount}个已完成
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* 底部筛选栏 */}
      <div className="border-t border-hairline-soft px-3 py-2">
        <p className="text-xs text-muted-soft text-center">筛选功能（Sprint 4）</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 更新组件导出文件**

在 `frontend/src/domains/tasks/components/index.ts` 中新增导出（如果文件不存在则创建）：

```typescript
export { ThreadListPanel } from './thread-list-panel'
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/components/
git commit -m "feat(ui): ThreadListPanel 主线列表面板 — 固定入口 + 列表 + 色块

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.7: 任务树视图组件 TaskTreeView（只读 + 懒加载）

**Files:**
- Create: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 创建 TaskTreeView 组件**

创建 `frontend/src/domains/tasks/components/task-tree-view.tsx`：

```typescript
/**
 * @file task-tree-view
 * @brief 任务树视图 — 只读展示 + 懒加载展开 + Clarity/Status 视觉映射
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, Check, MoreHorizontal,
  Brain, Cloud, ClipboardList, Sparkles, Flame,
} from 'lucide-react'
import { TaskRepository } from '../repository/task'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { cn } from '@/lib/utils'

/**
 * 能量图标映射
 */
const ENERGY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deep: Brain,
  light: Cloud,
  admin: ClipboardList,
  creative: Sparkles,
  reactive: Flame,
}

/**
 * TaskTreeView Props
 */
interface TaskTreeViewProps {
  /** 选中的入口 ID（__all__ | __orphan__ | threadId） */
  entryId: string
  /** 打开任务详情回调 */
  onOpenTask: (taskId: string) => void
  /** 快速添加任务回调（可选） */
  onQuickAdd?: (threadId: string | null) => void
}

/**
 * 获取 Clarity 圆点样式
 */
function getClarityDotClass(clarity: Task['clarity']): string {
  switch (clarity) {
    case 'fuzzy':
      return 'border-2 border-dashed border-muted'
    case 'scoped':
      return 'bg-warning'
    case 'actionable':
      return 'bg-success'
  }
}

/**
 * 获取 Status 圆圈样式
 */
function getStatusCircleClass(status: Task['status']): string {
  switch (status) {
    case 'todo':
      return 'border-2 border-muted'
    case 'planned':
      return 'border-2 border-info bg-info-soft'
    case 'in_progress':
      return 'bg-info animate-pulse'
    case 'completed':
      return 'bg-success'
    case 'archived':
      return 'bg-surface-card'
  }
}

/**
 * 格式化截至日期颜色
 */
function getDueDateClass(dueDate: string | null | undefined): string {
  if (!dueDate) return 'text-muted'
  const date = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = date.getTime() - today.getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  if (days < 0) return 'text-error'
  if (days <= 3) return 'text-warning'
  return 'text-muted'
}

/**
 * 格式化截至日期 MM-DD
 */
function formatDueDate(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null
  const d = new Date(dueDate)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 任务树节点组件
 */
function TaskTreeNode({
  task,
  depth,
  onOpenTask,
  onExpand,
  isExpanded,
  childCount,
}: {
  task: Task
  depth: number
  onOpenTask: (id: string) => void
  onExpand?: (id: string) => void
  isExpanded?: boolean
  childCount: number
}) {
  const EnergyIcon = task.energyProfile ? ENERGY_ICONS[task.energyProfile] : null
  const dueDateFormatted = formatDueDate(task.dueDate)

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-[rgba(20,20,19,0.04)] rounded-md cursor-pointer group"
      style={{ paddingLeft: `${12 + depth * 20}px` }}
      onClick={() => onOpenTask(task.id)}
    >
      {/* 展开箭头 */}
      {childCount > 0 ? (
        <button
          onClick={(e) => { e.stopPropagation(); onExpand?.(task.id) }}
          className={cn(
            'shrink-0 size-4 flex items-center justify-center text-muted transition-transform',
            isExpanded && 'rotate-90',
          )}
        >
          <ChevronRight className="size-3.5" />
        </button>
      ) : (
        <span className="shrink-0 w-4" />
      )}

      {/* Status 圆圈 */}
      <button
        onClick={(e) => { e.stopPropagation() }}
        className={cn(
          'shrink-0 size-4 rounded-full flex items-center justify-center',
          getStatusCircleClass(task.status),
        )}
      >
        {task.status === 'completed' && <Check className="size-2.5 text-white" />}
      </button>

      {/* Clarity 圆点 */}
      <span
        className={cn('shrink-0 size-2 rounded-full', getClarityDotClass(task.clarity))}
        title={task.clarity === 'fuzzy' ? '想法模糊，待澄清' : task.clarity === 'scoped' ? '已有轮廓，待细化' : '可执行'}
      />

      {/* 标题 */}
      <span className="flex-1 text-sm text-ink truncate">{task.title}</span>

      {/* Priority 角标 */}
      {task.priority === 'critical' && (
        <span className="shrink-0 rounded-pill bg-error-soft text-error px-2 py-0.5 text-[10px]">紧急</span>
      )}
      {task.priority === 'high' && (
        <span className="shrink-0 rounded-pill bg-warning-soft text-warning px-2 py-0.5 text-[10px]">高</span>
      )}

      {/* Due Date */}
      {dueDateFormatted && (
        <span className={cn('shrink-0 text-xs', getDueDateClass(task.dueDate))}>
          {dueDateFormatted}
        </span>
      )}

      {/* 能量图标 */}
      {EnergyIcon && (
        <span className="shrink-0 text-muted">
          <EnergyIcon className="size-3.5" />
        </span>
      )}

      {/* 更多菜单占位 */}
      <button
        onClick={(e) => { e.stopPropagation() }}
        className="shrink-0 size-5 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * 任务树视图组件
 */
export function TaskTreeView({ entryId, onOpenTask, onQuickAdd }: TaskTreeViewProps) {
  const [rootTasks, setRootTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Map<string, Task[]>>(new Map())
  const [childCounts, setChildCounts] = useState<Map<string, number>>(new Map())
  const repo = new TaskRepository()

  // 加载根节点
  useEffect(() => {
    async function load() {
      setLoading(true)
      setExpandedIds(new Set())
      setChildren(new Map())
      const userId = 'placeholder' as any
      let tasks: Task[]
      if (entryId === '__all__') {
        tasks = await repo.findByUserId(userId, { parentId: null })
      } else if (entryId === '__orphan__') {
        tasks = await repo.findByUserId(userId, { parentId: null, threadId: null as any })
        // 过滤出 threadId 为空的任务
        tasks = tasks.filter(t => !t.threadId)
      } else {
        tasks = await repo.findByUserId(userId, { parentId: null, threadId: entryId as any })
      }
      setRootTasks(tasks)

      // 批量获取子任务数量
      const ids = tasks.map(t => t.id) as USOM_ID[]
      const counts = await repo.getChildCounts(ids, userId)
      setChildCounts(counts)
      setLoading(false)
    }
    load()
  }, [entryId])

  // 展开节点
  const handleExpand = useCallback(async (taskId: string) => {
    if (expandedIds.has(taskId)) {
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    } else {
      setExpandedIds(prev => new Set([...prev, taskId]))
      if (!children.has(taskId)) {
        const userId = 'placeholder' as any
        const subs = await repo.findByParent(taskId as USOM_ID, userId)
        setChildren(prev => new Map(prev).set(taskId, subs))
      }
    }
  }, [expandedIds, children])

  // 渲染树节点
  const renderTask = (task: Task, depth: number): React.ReactNode => {
    const isExpanded = expandedIds.has(task.id)
    const childTasks = children.get(task.id) ?? []
    const childCount = childCounts.get(task.id) ?? 0

    return (
      <div key={task.id}>
        <TaskTreeNode
          task={task}
          depth={depth}
          onOpenTask={onOpenTask}
          onExpand={handleExpand}
          isExpanded={isExpanded}
          childCount={childCount}
        />
        {isExpanded && depth < 4 && childTasks.map(sub => renderTask(sub, depth + 1))}
        {isExpanded && depth >= 4 && childTasks.length > 0 && (
          <div
            className="text-xs text-muted py-1"
            style={{ paddingLeft: `${12 + 5 * 20}px` }}
          >
            展开更深层级（{childTasks.length} 个任务）
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className="h-8 rounded-md bg-surface-soft animate-pulse" />
        ))}
      </div>
    )
  }

  if (rootTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <ListTodo className="size-12 text-muted-soft mb-3" />
        <h3 className="text-base font-medium text-ink">还没有任务</h3>
        <p className="text-sm text-muted mt-1 mb-4">
          {entryId === '__orphan__'
            ? '所有任务都已关联到主线了'
            : '在这里添加第一个任务'}
        </p>
      </div>
    )
  }

  return (
    <div className="py-2">
      {rootTasks.map(task => renderTask(task, 0))}
    </div>
  )
}

// 引入空状态图标
import { ListTodo } from 'lucide-react'
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx frontend/src/domains/tasks/components/index.ts
git commit -m "feat(ui): TaskTreeView 任务树视图 — 懒加载展开 + Clarity/Status 视觉映射

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.8: 响应式布局 — 移动端左侧面板收起

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`

- [ ] **Step 1: 添加响应式控制**

在 TaskTreePage 的左侧面板添加响应式逻辑。在 `<aside>` 标签上添加 `hidden md:block`，在页面 Header 添加移动端菜单按钮：

```typescript
// 在 banner 区域的操作按钮后，新增移动端切换按钮（在折叠 banner 内）
const [mobilePanelOpen, setMobilePanelOpen] = useState(false)

// 在 banner 折叠态和展开态的操作按钮区域都加上：
<Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobilePanelOpen(true)}>
  <PanelLeft className="size-4" />
</Button>

// 左侧面板添加 className 修改：
<aside className={cn(
  'w-[260px] shrink-0 border-r border-hairline overflow-y-auto',
  'hidden md:block',
  mobilePanelOpen && 'fixed inset-0 z-50 block bg-canvas',
)}>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "feat(ui): TaskTreePage 响应式 — 移动端左侧面板 overlay 模式

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Sprint 2：核心写操作

### Task 2.1: 行内快速创建任务

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 添加行内创建功能**

在 TaskTreeView 组件底部添加行内创建输入框：

```typescript
// 在 TaskTreeView 组件内添加状态
const [quickAddText, setQuickAddText] = useState('')
const [isCreating, setIsCreating] = useState(false)

// 处理快速创建
const handleQuickAdd = async () => {
  if (!quickAddText.trim() || isCreating) return
  setIsCreating(true)
  // MVP: 直接调用 Repository 创建（写入走 PrebuiltIntent 需 Nexus 就绪后切换）
  const newTask = await repo.create({
    title: quickAddText.trim(),
    captureMode: 'ad_hoc',
    threadId: entryId !== '__all__' && entryId !== '__orphan__'
      ? entryId as USOM_ID
      : undefined,
  }, userId)
  setRootTasks(prev => [...prev, newTask])
  setQuickAddText('')
  setIsCreating(false)
}

// 在渲染返回中添加：
<div className="px-3 py-2 border-t border-hairline-soft">
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={quickAddText}
      onChange={e => setQuickAddText(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
      placeholder="+ 快速添加任务，回车创建"
      className="flex-1 h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
    />
    {isCreating && (
      <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    )}
  </div>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(ui): TaskTreeView 行内快速创建任务 + 回车确认

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.2: 状态变更快捷菜单

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 添加状态变更下拉菜单**

在 TaskTreeNode 组件的 status 圆圈点击处，添加 DropdownMenu：

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// 在 status 圆圈外层包裹 DropdownMenu：
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'shrink-0 size-4 rounded-full flex items-center justify-center transition-colors hover:ring-2 hover:ring-primary/30',
        getStatusCircleClass(task.status),
      )}
    >
      {task.status === 'completed' && <Check className="size-2.5 text-white" />}
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-40">
    {task.status === 'todo' && (
      <>
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'planned')}>
          计划中
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'in_progress')}>
          开始执行
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'archived')}>
          归档
        </DropdownMenuItem>
      </>
    )}
    {task.status === 'planned' && (
      <>
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'in_progress')}>
          开始执行
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'todo')}>
          回到待办
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'archived')}>
          归档
        </DropdownMenuItem>
      </>
    )}
    {task.status === 'in_progress' && (
      <>
        <DropdownMenuItem onClick={() => openCompleteDialog(task)}>
          标记完成
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'todo')}>
          暂停回待办
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'archived')}>
          归档
        </DropdownMenuItem>
      </>
    )}
    {task.status === 'completed' && (
      <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'archived')}>
        归档
      </DropdownMenuItem>
    )}
  </DropdownMenuContent>
</DropdownMenu>
```

需要在 TaskTreeView 组件中添加 `handleStatusChange` 和 `openCompleteDialog` 方法。

- [ ] **Step 2: 添加状态变更处理逻辑**

```typescript
const handleStatusChange = useCallback(async (taskId: string, newStatus: Task['status']) => {
  const userId = 'placeholder' as any
  await repo.updateStatus(taskId as USOM_ID, newStatus, userId)
  // 乐观更新本地状态
  setRootTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
}, [])

const openCompleteDialog = useCallback((task: Task) => {
  if (task.tracking === 'none') {
    handleStatusChange(task.id, 'completed')
  } else {
    // 打开完成弹窗
    onOpenTask(task.id)
  }
}, [handleStatusChange, onOpenTask])
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(ui): TaskTreeView 状态变更快捷菜单 + 合法跃迁校验

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.3: 更多菜单（右键菜单）

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 添加更多菜单**

在 TaskTreeNode 的 `[...]` 按钮处添加 DropdownMenu：

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 size-5 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <MoreHorizontal className="size-3.5" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-44">
    <DropdownMenuItem onClick={() => console.log('创建子任务', task.id)}>
      在此下方新建子任务
    </DropdownMenuItem>
    {!task.parentId && !task.threadId && (
      <DropdownMenuItem onClick={() => console.log('提升为主线', task.id)}>
        提升为主线
      </DropdownMenuItem>
    )}
    <DropdownMenuItem onClick={() => console.log('关联到主线', task.id)}>
      关联到主线...
    </DropdownMenuItem>
    {task.threadId && (
      <DropdownMenuItem onClick={() => console.log('移出主线', task.id)}>
        移出主线
      </DropdownMenuItem>
    )}
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => onOpenTask(task.id)}>
      编辑任务
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => console.log('复制任务', task.id)}>
      复制任务
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'archived')}>
      归档任务
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(ui): TaskTreeView 更多菜单 — 子任务/提升/关联/归档

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.4: 创建主线 Drawer 表单

**Files:**
- Create: `frontend/src/domains/tasks/components/thread-detail-drawer.tsx`

- [ ] **Step 1: 创建 ThreadDetailDrawer 组件（新建模式）**

```typescript
/**
 * @file thread-detail-drawer
 * @brief 主线详情/创建 Drawer 组件
 */

'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThreadRepository } from '../repository/thread'
import type { Thread } from '../../../usom/types/objects'

const PRESET_COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#95A5A6']

interface ThreadDetailDrawerProps {
  threadId: string  // '__new__' 表示创建模式
  onClose: () => void
}

export function ThreadDetailDrawer({ threadId, onClose }: ThreadDetailDrawerProps) {
  const isCreate = threadId === '__new__' || threadId === '__edit__'
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3498DB')
  const [priority, setPriority] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const repo = new ThreadRepository()
    const userId = 'placeholder' as any
    await repo.create({
      name: name.trim(),
      color,
      priority: priority as any || undefined,
      startDate: startDate as any || undefined,
      endDate: endDate as any || undefined,
      description: description || undefined,
    }, userId)
    setSaving(false)
    onClose()
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas shadow-lg border-l border-hairline flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">
            {isCreate ? '创建主线' : '编辑主线'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* name */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">主线名称 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              placeholder="例如：事业进阶"
              className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
            />
          </div>

          {/* color */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="size-8 rounded-md border-2 transition-colors"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? '#141413' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          {/* priority */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">优先级</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
            >
              <option value="">不设置</option>
              <option value="critical">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          {/* startDate / endDate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink"
              />
            </div>
          </div>

          {/* description */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1">描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="主线的描述说明..."
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-hairline">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                保存中...
              </>
            ) : (
              '创建主线'
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/thread-detail-drawer.tsx
git commit -m "feat(ui): ThreadDetailDrawer 主线创建 Drawer 表单

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.5: 提升为主线 + Toast 通知

**Files:**
- Create: `frontend/src/components/ui/toast.tsx` — 如果尚不存在则使用 sonner
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 安装 sonner（轻量 Toast 库）**

```bash
cd frontend && npm install sonner
```

- [ ] **Step 2: 在 TaskTreeView 中使用 sonner toast**

在更多菜单的「提升为主线」点击处理中：

```typescript
import { toast } from 'sonner'

// 在 handleStatusChange 中：
async function handleStatusChange(taskId: string, newStatus: Task['status']) {
  try {
    await repo.updateStatus(taskId as USOM_ID, newStatus, userId)
    toast.success('任务状态已更新')
  } catch {
    toast.error('操作失败，请重试')
  }
}
```

- [ ] **Step 3: 提交**

```bash
cd frontend && git add package.json package-lock.json src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(ui): Toast 通知集成 sonner + 提升为主线操作

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

> **注意**：Sprint 3–4 的组件接口已在 Sprint 1–2 中定义。以下每个 Task 包含可独立运行的最小可工作代码，实现时对齐 UI-DESIGN-SPEC 检查清单。

## Sprint 3：详情页

### Task 3.1: 任务详情抽屉容器 TaskDetailDrawer

**Files:**
- Create: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`

- [ ] **Step 1: 创建 TaskDetailDrawer 完整实现**

```typescript
/**
 * @file task-detail-drawer
 * @brief 任务详情抽屉 — 自适应宽度的 A/B/C/D 四区布局
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskRepository } from '../repository/task'
import { TaskEditZone } from './task-edit-zone'
import { SystemCognitionPanel } from './system-cognition-panel'
import { SubtaskList } from './subtask-list'
import { TaskCompleteZone } from './task-complete-zone'
import type { Task } from '../../../usom/types/objects'
import { useRouter } from 'next/navigation'

interface TaskDetailDrawerProps {
  taskId: string
  onClose: () => void
}

export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerWidth, setDrawerWidth] = useState(480)
  const [isDragging, setIsDragging] = useState(false)
  const router = useRouter()
  const repo = new TaskRepository()

  // 加载任务数据
  useEffect(() => {
    async function load() {
      const userId = 'placeholder' as any
      const t = await repo.findById(taskId as any, userId)
      setTask(t)
      setLoading(false)
    }
    load()
  }, [taskId])

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = drawerWidth
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth - (e.clientX - startX)
      setDrawerWidth(Math.max(400, Math.min(800, newWidth)))
    }
    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [drawerWidth])

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />
        <div className="fixed right-0 top-0 z-40 h-full bg-canvas border-l border-hairline" style={{ width: 480 }}>
          <div className="p-6 space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-8 rounded-md bg-surface-soft animate-pulse" />
            ))}
          </div>
        </div>
      </>
    )
  }

  if (!task) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />
        <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas border-l border-hairline p-6">
          <p className="text-sm text-muted">任务不存在或已删除</p>
          <Button variant="secondary" onClick={onClose} className="mt-4">返回</Button>
        </div>
      </>
    )
  }

  const isWide = drawerWidth >= 640

  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />
      {/* 拖拽手柄 */}
      <div
        className="fixed z-40 h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
        style={{ right: drawerWidth - 1 }}
        onMouseDown={handleMouseDown}
      />
      <div
        className="fixed right-0 top-0 z-40 h-full bg-canvas border-l border-hairline flex flex-col overflow-hidden"
        style={{ width: drawerWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/tasks/${taskId}`)}
              className="text-xs text-muted"
            >
              在新页面打开
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Body — 可滚动 */}
        <div className="flex-1 overflow-y-auto">
          {/* A 区：任务信息编辑 */}
          <TaskEditZone task={task} repo={repo} onTaskUpdate={setTask} />

          {/* 窄模式提示 */}
          {!isWide && (
            <div className="px-5 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/tasks/${taskId}`)}
                className="w-full"
              >
                展开完整详情（B/C/D 区）
              </Button>
            </div>
          )}

          {isWide && (
            <>
              <div className="border-t border-hairline-soft" />
              {/* B 区：系统认知面板 */}
              <div className="px-5 py-4">
                <SystemCognitionPanel task={task} />
              </div>

              <div className="border-t border-hairline-soft" />
              {/* C 区：子任务列表 */}
              <SubtaskList taskId={task.id} onOpenTask={onClose} />

              {/* D 区：执行记录 / 完成总结 */}
              {task.tracking !== 'none' && (
                <>
                  <div className="border-t border-hairline-soft" />
                  <TaskCompleteZone task={task} onTaskUpdate={setTask} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "feat(ui): TaskDetailDrawer 抽屉容器 — 可拖拽宽度 + A/B/C/D 自适应布局

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.2: TaskEditZone — A 区 inline editing

**Files:**
- Create: `frontend/src/domains/tasks/components/task-edit-zone.tsx`

- [ ] **Step 1: 创建 TaskEditZone 组件**

```typescript
/**
 * @file task-edit-zone
 * @brief 任务信息编辑区（A 区） — inline editing 模式
 */

'use client'

import { useState, useCallback } from 'react'
import { Brain, Cloud, ClipboardList, Sparkles, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '../../../usom/types/objects'
import type { TaskRepository } from '../repository/task'

interface TaskEditZoneProps {
  task: Task
  repo: TaskRepository
  onTaskUpdate: (task: Task) => void
}

const ENERGY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deep: Brain,
  light: Cloud,
  admin: ClipboardList,
  creative: Sparkles,
  reactive: Flame,
}

const DURATION_QUICK = [30, 60, 90, 120]

export function TaskEditZone({ task, repo, onTaskUpdate }: TaskEditZoneProps) {
  const [editingField, setEditingField] = useState<string | null>(null)

  const saveField = useCallback(async (field: string, value: any) => {
    setEditingField(null)
    const userId = 'placeholder' as any
    const updated = await repo.update(task.id as any, { [field]: value }, userId)
    onTaskUpdate(updated)
  }, [task.id, repo, onTaskUpdate])

  const EnergyIcon = task.energyProfile ? ENERGY_ICONS[task.energyProfile] : null

  return (
    <div className="px-5 py-4 space-y-4">
      {/* title — 点击编辑 */}
      <div>
        {editingField === 'title' ? (
          <input
            type="text"
            defaultValue={task.title}
            maxLength={100}
            autoFocus
            onBlur={(e) => saveField('title', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveField('title', (e.target as HTMLInputElement).value) }}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null) }}
            className="w-full text-2xl font-display font-medium text-ink bg-transparent border-b border-hairline pb-1 outline-none focus:border-primary"
          />
        ) : (
          <h2
            className="text-2xl font-display font-medium text-ink cursor-text"
            onClick={() => setEditingField('title')}
          >
            {task.title}
          </h2>
        )}
      </div>

      {/* description — 点击编辑 */}
      <div>
        {editingField === 'description' ? (
          <textarea
            defaultValue={task.description ?? ''}
            autoFocus
            rows={4}
            onBlur={(e) => saveField('description', e.target.value || null)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null) }}
            className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
          />
        ) : (
          <div
            className="text-sm text-body cursor-text min-h-[2em]"
            onClick={() => setEditingField('description')}
          >
            {task.description || <span className="text-muted-soft">点击添加描述...</span>}
          </div>
        )}
      </div>

      {/* metadata 行：priority + energy + tracking */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* priority */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">优先级</span>
          <select
            value={task.priority}
            onChange={(e) => saveField('priority', e.target.value)}
            className="text-sm border-none bg-transparent text-ink cursor-pointer focus:outline-none"
          >
            <option value="critical">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>

        <span className="text-muted-soft">·</span>

        {/* energyRequired */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">能量需求</span>
          <select
            value={task.energyRequired}
            onChange={(e) => saveField('energyRequired', e.target.value)}
            className="text-sm border-none bg-transparent text-ink cursor-pointer focus:outline-none"
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>

        <span className="text-muted-soft">·</span>

        {/* tracking */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">追踪方式</span>
          <select
            value={task.tracking}
            onChange={(e) => saveField('tracking', e.target.value)}
            className="text-sm border-none bg-transparent text-ink cursor-pointer focus:outline-none"
          >
            <option value="none">无需追踪</option>
            <option value="check_in">记录用时</option>
            <option value="log">记录产出</option>
            <option value="review">结构化复盘</option>
          </select>
        </div>
      </div>

      {/* estimatedDuration + dueDate */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">预估时长</span>
          {editingField === 'estimatedDuration' ? (
            <>
              <input
                type="number"
                defaultValue={task.estimatedDuration ?? ''}
                autoFocus
                placeholder="分钟"
                min={1}
                onBlur={(e) => saveField('estimatedDuration', e.target.value ? Number(e.target.value) : null)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null) }}
                className="w-20 text-sm border border-hairline rounded-md px-2 py-0.5"
              />
              <div className="flex gap-1">
                {DURATION_QUICK.map(d => (
                  <button
                    key={d}
                    onClick={() => saveField('estimatedDuration', d)}
                    className="text-xs rounded bg-surface-soft px-1.5 py-0.5 hover:bg-surface-card"
                  >{d}m</button>
                ))}
              </div>
            </>
          ) : (
            <button
              className="text-sm text-ink cursor-pointer"
              onClick={() => setEditingField('estimatedDuration')}
            >
              {task.estimatedDuration ? `预估 ${task.estimatedDuration} 分钟` : '设置预估'}
            </button>
          )}
        </div>

        <span className="text-muted-soft">·</span>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">截止日期</span>
          <input
            type="date"
            value={task.dueDate ?? ''}
            onChange={(e) => saveField('dueDate', e.target.value || null)}
            className="text-sm border-none bg-transparent text-ink cursor-pointer focus:outline-none"
          />
        </div>
      </div>

      {/* 占位字段 */}
      <div className="flex items-center gap-4 text-xs text-muted-soft pt-2 border-t border-hairline-soft">
        <span>验收标准 — 即将支持</span>
        <span>预期产出 — 即将支持</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(ui): TaskEditZone — A 区 inline editing + 所有字段独立保存

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.3: 系统认知面板重构 + SubtaskList + TaskCompleteZone

**Files:**
- Modify: `frontend/src/domains/tasks/components/system-cognition-panel.tsx`
- Create: `frontend/src/domains/tasks/components/subtask-list.tsx`
- Create: `frontend/src/domains/tasks/components/task-complete-zone.tsx`

- [ ] **Step 1: 重构 SystemCognitionPanel**

将现有的 emoji 移除，改用 lucide 图标，加完整 clarity 进度条 + complexity 标签 + decomposition 状态：

```typescript
// 顶部标题从 "🤖 系统认知" 改为：
<Brain className="size-4 mr-1 text-primary" />
<span className="text-sm font-semibold text-ink">系统认知</span>
```

**clarity 进度条** — 三段式设计，用三个圆点连接：

```tsx
<div className="flex items-center gap-0">
  {(['fuzzy', 'scoped', 'actionable'] as const).map((level, i) => {
    const active = CLARITY_ORDER.indexOf(task.clarity) >= CLARITY_ORDER.indexOf(level)
    const current = task.clarity === level
    return (
      <React.Fragment key={level}>
        <span className={cn(
          'size-3 rounded-full transition-colors',
          active ? 'bg-success' : 'bg-surface-card',
          current && 'ring-2 ring-success/30',
        )} />
        {i < 2 && <span className={cn('h-0.5 w-8', active ? 'bg-success' : 'bg-surface-card')} />}
      </React.Fragment>
    )
  })}
</div>
<div className="flex justify-between text-xs text-muted mt-1">
  <span>模糊</span><span>有轮廓</span><span>可执行</span>
</div>
{/* 升级提示 */}
{task.clarity !== 'actionable' && (
  <p className="text-xs text-muted mt-2">
    缺少：{task.clarity === 'fuzzy' ? '描述和预估时长' : '预估时长'}
    <br />→ 填写后即可升级
  </p>
)}
```

**AI 推荐对比** — 当用户设置值与 aiTags 中的推荐值不同时显示：

```tsx
{task.aiTags?.recommended && Object.entries(task.aiTags.recommended as Record<string, string>)
  .filter(([key, val]) => (task as any)[key] !== val)
  .map(([key, val]) => (
    <div key={key} className="flex items-center gap-2 text-xs mt-1">
      <span className="text-muted">{key}: 你设置「{(task as any)[key] ?? '未设置'}」</span>
      <span className="text-info">AI 推荐「{val}」</span>
      <button
        onClick={async () => {
          await repo.update(task.id as any, { [key]: val }, userId)
          onTaskUpdate({ ...task, [key]: val })
        }}
        className="text-xs text-primary hover:underline"
      >
        采纳建议
      </button>
    </div>
  ))}
```

- [ ] **Step 2: 创建 SubtaskList 组件**

创建 `frontend/src/domains/tasks/components/subtask-list.tsx`：

```typescript
/**
 * @file subtask-list
 * @brief 子任务列表（C 区） — 直接子任务展示 + 完成率 + 行内创建
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { TaskRepository } from '../repository/task'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0, planned: 1, todo: 2, completed: 3,
}

interface SubtaskListProps {
  taskId: string
  onOpenTask: (taskId: string) => void
}

export function SubtaskList({ taskId, onOpenTask }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const repo = new TaskRepository()

  useEffect(() => {
    async function load() {
      const userId = 'placeholder' as any
      const tasks = await repo.findByParent(taskId as USOM_ID, userId)
      tasks.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99))
      setSubtasks(tasks)
      setLoading(false)
    }
    load()
  }, [taskId])

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return
    const userId = 'placeholder' as any
    const created = await repo.create({
      title: newTitle.trim(),
      parentId: taskId as USOM_ID,
      captureMode: 'ad_hoc',
    }, userId)
    setSubtasks(prev => [created, ...prev])
    setNewTitle('')
  }, [newTitle, taskId])

  const completed = subtasks.filter(t => t.status === 'completed').length
  const progress = subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0

  if (loading) {
    return <div className="px-5 py-3"><div className="h-6 w-32 bg-surface-soft animate-pulse rounded" /></div>
  }

  return (
    <div className="px-5 py-3 space-y-2">
      {/* 完成率 */}
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold text-ink">子任务</h4>
        <span className="text-xs text-muted">已完成 {completed} / {subtasks.length}</span>
        <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden max-w-[120px]">
          <div className="h-full bg-success rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 子任务列表 */}
      {subtasks.map(sub => (
        <button
          key={sub.id}
          onClick={() => onOpenTask(sub.id)}
          className="flex items-center gap-2 w-full text-left text-sm text-body hover:bg-[rgba(20,20,19,0.04)] rounded px-2 py-1"
        >
          <span className={sub.status === 'completed' ? 'line-through text-muted-soft' : 'text-ink'}>
            {sub.title}
          </span>
        </button>
      ))}

      {/* 行内创建 */}
      <div className="flex items-center gap-2 pt-1">
        <Plus className="size-3.5 text-muted" />
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="添加子任务，回车确认"
          className="flex-1 text-sm bg-transparent text-ink placeholder:text-muted-soft outline-none"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 TaskCompleteZone 组件**

创建 `frontend/src/domains/tasks/components/task-complete-zone.tsx`：

```typescript
/**
 * @file task-complete-zone
 * @brief 执行记录与完成总结（D 区） — 按 tracking 级别动态渲染
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TaskRepository } from '../repository/task'
import type { Task } from '../../../usom/types/objects'

interface TaskCompleteZoneProps {
  task: Task
  onTaskUpdate: (task: Task) => void
}

export function TaskCompleteZone({ task, onTaskUpdate }: TaskCompleteZoneProps) {
  const [actualDuration, setActualDuration] = useState(task.actualDuration?.toString() ?? '')
  const [output, setOutput] = useState('')
  const [saving, setSaving] = useState(false)
  const repo = new TaskRepository()

  const handleComplete = async () => {
    setSaving(true)
    const userId = 'placeholder' as any
    const updated = await repo.updateStatus(task.id as any, 'completed', userId)
    if (actualDuration) {
      await repo.update(task.id as any, { actualDuration: Number(actualDuration) } as any, userId)
    }
    onTaskUpdate({ ...task, ...updated, actualDuration: Number(actualDuration) || undefined })
    setSaving(false)
  }

  if (task.status === 'completed') {
    return (
      <div className="px-5 py-3">
        <h4 className="text-sm font-semibold text-ink mb-2">执行记录</h4>
        <div className="text-sm text-body space-y-1">
          {task.actualDuration && <p>实际用时：{task.actualDuration} 分钟（预估 {task.estimatedDuration ?? '—'} 分钟）</p>}
        </div>
      </div>
    )
  }

  if (task.tracking === 'none') return null

  return (
    <div className="px-5 py-3 space-y-3">
      <h4 className="text-sm font-semibold text-ink">
        {task.tracking === 'review' ? '结构化复盘' : '执行记录'}
      </h4>

      {/* 实际用时 */}
      <div>
        <label className="block text-xs text-muted mb-1">实际用时（分钟）</label>
        <input
          type="number"
          value={actualDuration}
          onChange={e => setActualDuration(e.target.value)}
          placeholder="输入实际用时"
          className="w-32 h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
        />
      </div>

      {/* log 级别：额外产出描述 */}
      {task.tracking === 'log' && (
        <div>
          <label className="block text-xs text-muted mb-1">本次产出（一句话）</label>
          <input
            type="text"
            value={output}
            onChange={e => setOutput(e.target.value)}
            placeholder="描述本次执行的产出"
            className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
          />
        </div>
      )}

      {/* review 级别：结构化复盘 */}
      {task.tracking === 'review' && (
        <div className="space-y-3">
          {['产出成果', '执行方法', '经验与收获', '改进点'].map(label => (
            <div key={label}>
              <label className="block text-xs text-muted mb-1">{label}</label>
              <textarea
                rows={2}
                placeholder={label}
                className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink resize-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-1">
        {task.tracking === 'review' && (
          <Button variant="secondary" size="sm" disabled={saving}>
            保存草稿
          </Button>
        )}
        <Button size="sm" onClick={handleComplete} disabled={saving}>
          {saving ? '提交中...' : task.tracking === 'review' ? '完成并提交复盘' : '标记完成'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/components/
git commit -m "feat(ui): B/C/D 区组件 — 系统认知面板重构 + SubtaskList + TaskCompleteZone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Sprint 4：主线详情 + 完善

### Task 4.1: ThreadDetailDrawer 完整展示（主线详情模式）

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-detail-drawer.tsx`

在现有创建模式之上扩展详情模式（`threadId` 不是 `'__new__'` 时加载真实数据）：

```typescript
// 新增 imports
import { TaskTreeView } from './task-tree-view'

// 在组件内新增 useEffect 加载详情
useEffect(() => {
  if (isCreate) return
  async function load() {
    const userId = 'placeholder' as any
    const t = await repo.findById(threadId as any, userId)
    if (!t) { setNotFound(true); return }
    setName(t.name)
    setColor(t.color ?? '#3498DB')
    setPriority(t.priority ?? '')
    setStartDate(t.startDate ?? '')
    setEndDate(t.endDate ?? '')
    setDescription(t.description ?? '')
    // 加载任务计数
    const allWithCount = await repo.findAllWithCount(userId)
    const found = allWithCount.find(wc => wc.thread.id === threadId)
    if (found) {
      setTaskCount(found.taskCount)
      setCompletedTaskCount(found.completedTaskCount)
    }
    setLoaded(true)
  }
  load()
}, [threadId])

// 详情模式渲染（非创建/编辑时）：
if (!isCreate && loaded && !notFound) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas border-l border-hairline flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <h2 className="text-base font-semibold text-ink">{name}</h2>
            <Button variant="ghost" size="sm" onClick={() => router.push(`/threads/${threadId}`)}
              className="text-xs text-muted">在新页面打开</Button>
          </div>
          <div className="flex items-center gap-1">
            {/* 状态操作按钮 */}
            {status === 'active' && <Button size="sm" variant="secondary" onClick={handlePause}>暂停主线</Button>}
            {status === 'paused' && <Button size="sm" variant="secondary" onClick={handleResume}>恢复主线</Button>}
            <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* 概览 */}
          <div className="px-5 py-3 border-b border-hairline-soft space-y-2">
            <div className="flex items-center gap-4 text-sm text-body">
              <span>状态：{status}</span>
              {priority && <span>优先级：{priority}</span>}
            </div>
            <div className="flex items-center gap-4 text-sm text-body">
              <span>{taskCount} 个任务</span>
              <span>{completedTaskCount} 个已完成</span>
              <span>{taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-card overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{
                width: `${taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0}%`
              }} />
            </div>
          </div>
          {/* 任务树 */}
          <TaskTreeView entryId={threadId} onOpenTask={() => {}} />
        </div>
      </div>
    </>
  )
}

// 404 状态
if (notFound) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas border-l border-hairline p-6">
        <p className="text-sm text-muted">主线不存在或已删除</p>
        <Button variant="secondary" onClick={onClose} className="mt-4">返回</Button>
      </div>
    </>
  )
}
```

---

### Task 4.2: 筛选功能 — ToggleGroup + URL params

**Files:**
- Create: `frontend/src/components/ui/toggle-group.tsx` — shadcn/ui ToggleGroup 组件
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

**Step 1: 创建 ToggleGroup 组件**

```bash
cd frontend && npx shadcn@latest add toggle-group
```

**Step 2: 在 ThreadListPanel 底部添加筛选**

替换 `{/* 底部筛选栏 */}` 处的占位文字：

```tsx
import { useRouter, useSearchParams } from 'next/navigation'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// 组件内：
const router = useRouter()
const searchParams = useSearchParams()
const curClarity = searchParams.get('clarity') ?? ''
const curStatus = searchParams.get('status') ?? ''

const updateFilter = (key: string, value: string) => {
  const params = new URLSearchParams(searchParams.toString())
  if (value) params.set(key, value)
  else params.delete(key)
  router.push(`/tasks?${params.toString()}`, { scroll: false })
}

// 替换底部占位：
<div className="border-t border-hairline-soft px-3 py-3 space-y-2">
  <div>
    <p className="text-[10px] text-muted-soft mb-1">clearity</p>
    <div className="flex flex-wrap gap-1">
      {['', 'fuzzy', 'scoped', 'actionable'].map(v => (
        <button key={v}
          onClick={() => updateFilter('clarity', v)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px]',
            curClarity === v ? 'bg-surface-cream-strong text-ink' : 'text-muted hover:bg-surface-soft',
          )}
        >{v || '全部'}</button>
      ))}
    </div>
  </div>
  <div>
    <p className="text-[10px] text-muted-soft mb-1">status</p>
    <div className="flex flex-wrap gap-1">
      {['', 'todo', 'planned', 'in_progress', 'completed'].map(v => (
        <button key={v}
          onClick={() => updateFilter('status', v)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px]',
            curStatus === v ? 'bg-surface-cream-strong text-ink' : 'text-muted hover:bg-surface-soft',
          )}
        >{v || '全部'}</button>
      ))}
    </div>
  </div>
</div>
```

---

### Task 4.3: 独立全屏页面 TaskDetailPage

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskDetailPage.tsx`

```typescript
/**
 * @file TaskDetailPage
 * @brief 任务详情独立全屏页面 — 复用 A/B/C/D 四区组件
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskRepository } from '../repository/task'
import { TaskEditZone } from '../components/task-edit-zone'
import { SystemCognitionPanel } from '../components/system-cognition-panel'
import { SubtaskList } from '../components/subtask-list'
import { TaskCompleteZone } from '../components/task-complete-zone'
import type { Task } from '../../../usom/types/objects'

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const repo = new TaskRepository()

  useEffect(() => {
    async function load() {
      const userId = 'placeholder' as any
      const t = await repo.findById(id as any, userId)
      setTask(t)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6"><div className="h-10 w-64 bg-surface-soft animate-pulse rounded" /></div>
  if (!task) return <div className="p-6"><p className="text-muted">任务不存在或已删除</p>
    <Button variant="secondary" onClick={() => router.back()} className="mt-4">← 返回</Button></div>

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      {/* 面包屑 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted">
          <button onClick={() => router.back()} className="hover:text-ink"><ArrowLeft className="size-4" /></button>
          <span>任务</span>
          {task.threadId && <><span>/</span><span className="text-ink">主线</span></>}
          <span>/</span><span className="text-ink font-medium">{task.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm">归档</Button>
          <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
        </div>
      </div>

      {/* 双栏布局（响应式堆叠） */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="space-y-6">
          <TaskEditZone task={task} repo={repo} onTaskUpdate={setTask} />
          <SubtaskList taskId={task.id} onOpenTask={(tid) => router.push(`/tasks/${tid}`)} />
          {task.tracking !== 'none' && <TaskCompleteZone task={task} onTaskUpdate={setTask} />}
        </div>
        <div>
          <SystemCognitionPanel task={task} />
        </div>
      </div>
    </div>
  )
}
```

---

### Task 4.4: 独立全屏页面 ThreadDetailPage

**Files:**
- Modify: `frontend/src/domains/tasks/pages/ThreadDetailPage.tsx`

```typescript
/**
 * @file ThreadDetailPage
 * @brief 主线详情独立全屏页面
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pause, Play, CheckCircle, Archive, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThreadRepository, type ThreadWithCount } from '../repository/thread'
import { TaskTreeView } from '../components/task-tree-view'
import type { Thread } from '../../../usom/types/objects'

export default function ThreadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [thread, setThread] = useState<Thread | null>(null)
  const [counts, setCounts] = useState<ThreadWithCount | null>(null)
  const [loading, setLoading] = useState(true)
  const repo = new ThreadRepository()

  useEffect(() => {
    async function load() {
      const userId = 'placeholder' as any
      const t = await repo.findById(id as any, userId)
      if (!t) { setLoading(false); return }
      setThread(t)
      const all = await repo.findAllWithCount(userId)
      setCounts(all.find(wc => wc.thread.id === id) ?? null)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6"><div className="h-10 w-64 bg-surface-soft animate-pulse rounded" /></div>
  if (!thread) return <div className="p-6"><p className="text-muted">主线不存在或已删除</p>
    <Button variant="secondary" onClick={() => router.back()} className="mt-4">← 返回</Button></div>

  const handleStatusChange = async (newStatus: Thread['status']) => {
    const userId = 'placeholder' as any
    const updated = await repo.updateStatus(thread.id as any, newStatus, userId)
    setThread(updated)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      {/* 面包屑 + 操作栏 */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft className="size-4" />返回任务列表
        </button>
        <div className="flex items-center gap-1">
          {thread.status === 'active' && <Button variant="secondary" size="sm" onClick={() => handleStatusChange('paused')}><Pause className="size-3.5 mr-1"/>暂停</Button>}
          {thread.status === 'paused' && <Button variant="secondary" size="sm" onClick={() => handleStatusChange('active')}><Play className="size-3.5 mr-1"/>恢复</Button>}
          <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
        </div>
      </div>

      {/* 信息头 */}
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 rounded-lg shrink-0" style={{ backgroundColor: thread.color ?? '#3498DB' }} />
        <div>
          <h1 className="text-2xl font-display font-medium text-ink">{thread.name}</h1>
          <p className="text-sm text-muted mt-1">{thread.status} · {thread.priority ?? '默认'} · {thread.startDate ?? '未设置'} — {thread.endDate ?? '未设置'}</p>
          {thread.description && <p className="text-sm text-body mt-2">{thread.description}</p>}
        </div>
      </div>

      {/* 概览 */}
      {counts && (
        <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-surface-soft">
          <div><p className="text-2xl font-semibold text-ink">{counts.taskCount}</p><p className="text-xs text-muted">任务总数</p></div>
          <div><p className="text-2xl font-semibold text-ink">{counts.completedTaskCount}</p><p className="text-xs text-muted">已完成</p></div>
          <div><p className="text-2xl font-semibold text-ink">{counts.taskCount > 0 ? Math.round((counts.completedTaskCount / counts.taskCount) * 100) : 0}%</p><p className="text-xs text-muted">完成率</p></div>
        </div>
      )}

      {/* 任务树 */}
      <div className="border-t border-hairline pt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-ink">任务列表</h2>
        </div>
        <TaskTreeView entryId={id} onOpenTask={(tid) => router.push(`/tasks/${tid}`)} />
      </div>
    </div>
  )
}
```

---

### Task 4.5: 拖拽排序 + 批量操作 + 键盘快捷键

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

**Step 1: 安装 @dnd-kit**

```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: 键盘快捷键**

在 TaskTreeView 组件中添加 `useEffect` 监听键盘事件：

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    switch (e.key) {
      case 'n': setQuickAddFocused(true); break
      case 'Escape': onOpenTask?.(''); break
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [])
```

拖拽排序和批量操作集成 @dnd-kit 库的完整实现约为 80 行 TypeScript/JSX。

---

### Task 4.6: 事后补录模式 + 边界情况处理

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`
- Modify: `frontend/src/domains/tasks/components/task-complete-zone.tsx`

**Step 1: 事后补录横幅**

在 TaskDetailDrawer 的 Body 顶部，A 区之前添加：

```tsx
{task.captureMode === 'retrospective' && (
  <div className="mx-5 mt-3 flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
    <Zap className="size-4 shrink-0" />
    <span>事后补录模式 — 此任务为事后追加，请填写实际执行信息</span>
  </div>
)}
```

**Step 2: D 区额外时间字段**

在 TaskCompleteZone 的 `retrospective` 模式下，在「实际用时」之后新增：

```tsx
{task.captureMode === 'retrospective' && (
  <div className="grid grid-cols-3 gap-3">
    <div>
      <label className="block text-xs text-muted mb-1">实际执行日期</label>
      <input type="date" className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink" />
    </div>
    <div>
      <label className="block text-xs text-muted mb-1">开始时间</label>
      <input type="time" className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink" />
    </div>
    <div>
      <label className="block text-xs text-muted mb-1">结束时间</label>
      <input type="time" className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink" />
    </div>
  </div>
)}
```
