# 任务管理迭代优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为任务管理模块实现三项迭代优化：删除校验、Detail 交互升级、多层次显示 + 主线标签。

**Architecture:** 所有改动均在 Task Domain 的组件层和 Server Action 层。无 Nexus / USOM / Repository 接口变更。前端校验仅影响 UI 行为，不修改后端数据安全策略。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Drizzle ORM

---

## 文件结构

| 操作 | 文件 | 职责 |
|---|---|---|
| 修改 | `frontend/src/app/actions/tasks.ts` | 新增 `getTaskAncestors`、`deleteThread` |
| 修改 | `frontend/src/domains/tasks/components/task-detail-drawer.tsx` | 删除校验 + 导航栈 + 面包屑 + 未保存拦截 |
| 修改 | `frontend/src/domains/tasks/components/thread-detail-drawer.tsx` | 新增删除按钮 + 校验 |
| 修改 | `frontend/src/domains/tasks/components/task-tree-view.tsx` | childCountMap + 主线标签 |
| 修改 | `frontend/src/domains/tasks/components/task-edit-zone.tsx` | 新增 `onDirtyChange` 回调 |
| 修改 | `frontend/src/domains/tasks/components/subtask-list.tsx` | 无需修改（onOpenTask 回调已在 Props 中定义，只需在调用方传递正确回调） |

---

## Task 1: [005] TaskDetailDrawer — 删除按钮校验

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx:87-367`

- [ ] **Step 1: 在 TaskDetailDrawer 中新增子任务计数 state**

在 `task-detail-drawer.tsx` 的组件函数内，`loadTask` 回调之后，新增 childCount state，并在 loadTask 中同时获取子任务计数。

找到 `const [expanded, setExpanded] = useState(false)` 行（约第 97 行），在其后添加：

```typescript
const [childCount, setChildCount] = useState<number>(0)
```

在 `loadTask` 回调内部，`else setTask(t)` 行之后（约第 113 行），添加获取子任务计数的逻辑：

```typescript
const c = await getChildCounts([taskId])
setChildCount(c[taskId] ?? 0)
```

同时在文件顶部 import 中添加 `getChildCounts`：

```typescript
import { getTaskById, deleteTask, archiveTask, getChildCounts } from '@/app/actions/tasks'
```

- [ ] **Step 2: 计算删除按钮可用状态**

在 `loadTask` useEffect 之后（约第 122 行），新增删除条件计算：

```typescript
/** 删除条件：todo 或 archived 且无子任务 */
const canDelete = task
  ? (task.status === 'todo' || task.status === 'archived') && childCount === 0
  : false

/** 删除按钮禁用原因提示 */
const deleteDisabledReason = !task ? ''
  : task.status !== 'todo' && task.status !== 'archived'
    ? '仅待办/已归档任务可删除'
    : childCount > 0
      ? '存在子任务，无法删除'
      : ''
```

- [ ] **Step 3: 修改删除按钮 UI**

将底部操作栏中的「彻底删除」按钮（约第 324-356 行）替换为带校验的版本。将整个 `<AlertDialog>` 块替换为：

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      className="text-error hover:text-error"
      disabled={!canDelete}
      title={deleteDisabledReason}
    >
      <Trash2 className="size-3.5 mr-1" />
      彻底删除
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认彻底删除</AlertDialogTitle>
      <AlertDialogDescription>
        此操作不可撤销，任务将被永久删除。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          try {
            await deleteTask(taskId)
            onTaskChanged?.()
            onClose()
            toast.success('任务已删除')
          } catch {
            toast.error('删除失败，请重试')
          }
        }}
      >
        确认删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

注意：AlertDialog 描述文案已移除"如有子任务，子任务将变为独立任务"；按钮新增 `disabled={!canDelete}` 和 `title={deleteDisabledReason}`。

- [ ] **Step 4: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过，无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "feat(tasks): [005] TaskDetailDrawer 删除按钮增加状态和子任务校验

- 仅 todo/archived 且无子任务时允许删除
- 禁用时 title 提示原因
- 更新 AlertDialog 描述文案"
```

---

## Task 2: [005] ThreadDetailDrawer — 新增删除按钮

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts:145-198`
- Modify: `frontend/src/domains/tasks/components/thread-detail-drawer.tsx`

- [ ] **Step 1: 在 actions/tasks.ts 中添加 deleteThread action**

在 `updateThreadStatus` 函数之后（约第 197 行），添加：

```typescript
/**
 * 彻底删除主线（不可恢复）
 * @param threadId - 主线 ID
 */
export async function deleteThread(threadId: string): Promise<void> {
  const repo = new ThreadRepository()
  return repo.delete(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
}
```

- [ ] **Step 2: 在 ThreadDetailDrawer 中添加删除按钮**

在 `thread-detail-drawer.tsx` 文件顶部的 import 中添加：

```typescript
import { Trash2 } from 'lucide-react'
import { deleteThread } from '@/app/actions/tasks'
```

（`Trash2` 添加到已有的 lucide import 中，`deleteThread` 为新 import）

同时确保 AlertDialog 相关组件已导入。检查现有 import，如果没有则添加：

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
```

- [ ] **Step 3: 在状态操作按钮区域添加删除按钮**

在 `renderDetailHeader` 函数中，找到 `{/* 状态操作按钮 */}` 区域（约第 212 行）。在归档按钮的 `</div>` 关闭标签之后，添加删除按钮。

找到归档主线的 `</Button>` 和其后的 `)}`，在该区域结束后（约第 249 行 `)}` 之后），添加：

```tsx
{/* 彻底删除（仅无下级任务时可用） */}
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      className="text-error hover:text-error"
      disabled={counts ? counts.taskCount > 0 : false}
      title={counts && counts.taskCount > 0 ? '存在下级任务，无法删除' : ''}
    >
      <Trash2 className="size-3.5 mr-1" />
      彻底删除
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认彻底删除主线</AlertDialogTitle>
      <AlertDialogDescription>
        此操作不可撤销，主线将被永久删除。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          try {
            await deleteThread(threadId)
            onThreadChanged?.()
            onClose()
            toast.success('主线已删除')
          } catch {
            toast.error('删除失败，请重试')
          }
        }}
      >
        确认删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/actions/tasks.ts frontend/src/domains/tasks/components/thread-detail-drawer.tsx
git commit -m "feat(tasks): [005] ThreadDetailDrawer 新增彻底删除按钮

- 仅无下级任务时允许删除
- 新增 deleteThread Server Action"
```

---

## Task 3: [007] 修复任务树多层次展开

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 新增 childCountMap state**

在 `TaskTreeView` 组件中，找到 `const [loadedIds, setLoadedIds]` 行（约第 142 行），在其后添加：

```typescript
const [childCountMap, setChildCountMap] = useState<Map<string, number>>(new Map())
```

- [ ] **Step 2: 修改 handleToggle 获取子节点的 childCount**

在 `handleToggle` 回调中，找到 `setLoadedIds(prev => new Set(prev).add(id))` 行（约第 260 行），在其后添加获取子节点计数的逻辑：

```typescript
// 获取子节点的子任务计数（修复第三层及以下无法展开的问题）
const childrenIds = children.map(c => c.id)
if (childrenIds.length > 0) {
  const subCounts = await getChildCounts(childrenIds)
  setChildCountMap(prev => {
    const next = new Map(prev)
    childrenIds.forEach(cid => next.set(cid, subCounts[cid] ?? 0))
    return next
  })
}
```

- [ ] **Step 3: 将 childCountMap 传递给 SortableTaskRow**

在 `TaskTreeView` 的渲染部分，找到 `<SortableTaskRow` 组件调用（约第 326 行），添加 `childCountMap` prop：

```tsx
<SortableTaskRow
  key={node.task.id}
  id={node.task.id}
  node={node}
  expandedIds={expandedIds}
  childData={childData}
  childCountMap={childCountMap}
  onToggle={handleToggle}
  onOpenTaskDetail={onOpenTaskDetail}
  onStatusChange={handleStatusChange}
  onPromoteToThread={onPromoteToThread}
/>
```

- [ ] **Step 4: 更新 TaskTreeRowProps 接口**

在 `TaskTreeRowProps` 接口中（约第 370 行），添加 `childCountMap` 属性：

```typescript
interface TaskTreeRowProps {
  node: TreeNode
  expandedIds: Set<string>
  childData: Map<string, Task[]>
  childCountMap: Map<string, number>
  onToggle: (node: TreeNode) => void
  onOpenTaskDetail?: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: Task['status']) => void
  onPromoteToThread?: (taskId: string) => void
}
```

- [ ] **Step 5: 更新 SortableTaskRow 透传 childCountMap**

在 `SortableTaskRow` 组件中，找到 `<TaskTreeRow` 调用（约第 423 行），添加 `childCountMap`：

```tsx
<TaskTreeRow
  node={node}
  expandedIds={expandedIds}
  childData={childData}
  childCountMap={childCountMap}
  onToggle={onToggle}
  onOpenTaskDetail={onOpenTaskDetail}
  onStatusChange={onStatusChange}
  onPromoteToThread={onPromoteToThread}
/>
```

同时更新 `SortableTaskRow` 的解构参数，在 `{ id } & TaskTreeRowProps` 之前不需要改动（它通过 spread 接收所有 TaskTreeRowProps）。

- [ ] **Step 6: 修复 TaskTreeRow 中 childCount 硬编码为 0 的问题**

在 `TaskTreeRow` 组件的 `children` useMemo 中（约第 459 行），将 `const cnt = 0` 替换为：

```typescript
const cnt = childCountMap.get(t.id) ?? 0
```

同时将 `childCountMap` 添加到 useMemo 的依赖数组中：

```typescript
}, [childData, childCountMap, task.id, depth])
```

- [ ] **Step 7: 更新递归 TaskTreeRow 调用传递 childCountMap**

在 `TaskTreeRow` 的子节点渲染部分（约第 659 行），找到递归的 `<TaskTreeRow` 调用，添加 `childCountMap`：

```tsx
<TaskTreeRow
  key={child.task.id}
  node={child}
  expandedIds={expandedIds}
  childData={childData}
  childCountMap={childCountMap}
  onToggle={onToggle}
  onOpenTaskDetail={onOpenTaskDetail}
  onStatusChange={onStatusChange}
  onPromoteToThread={onPromoteToThread}
/>
```

- [ ] **Step 8: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 9: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "fix(tasks): [007] 修复任务树第三层及以下无法展开的问题

- 新增 childCountMap state 存储子节点的子任务计数
- handleToggle 中获取子节点的 childCount
- TaskTreeRow 使用真实计数替代硬编码 0"
```

---

## Task 4: [007] 行内主线标签

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 新增主线映射类型和 state**

在 `TaskTreeView` 组件中，在已有的 state 声明之后（约第 144 行），添加主线映射 state：

```typescript
/** 主线映射表：threadId → { name, color } */
const [threadMap, setThreadMap] = useState<Map<string, { name: string; color: string }>>(new Map())
```

在 `TaskTreeView` 文件顶部的 import 中，添加 `getThreads`：

```typescript
import { getTasks, getChildCounts, getSubtasks, createTask, updateTaskStatus as updateTaskStatusAction, getThreads } from '@/app/actions/tasks'
```

- [ ] **Step 2: 加载主线映射数据**

在 `TaskTreeView` 中加载根节点的 `useEffect` 之后，新增一个 `useEffect` 加载主线映射：

```typescript
// ─── 加载主线映射 ──────────────────────────────────────────────

useEffect(() => {
  let cancelled = false
  async function loadThreads() {
    try {
      const threads = await getThreads()
      if (cancelled) return
      const map = new Map<string, { name: string; color: string }>()
      for (const twc of threads) {
        map.set(twc.thread.id, { name: twc.thread.name, color: twc.thread.color ?? '#3498DB' })
      }
      setThreadMap(map)
    } catch {
      // 主线加载失败不影响任务树显示
    }
  }
  loadThreads()
  return () => { cancelled = true }
}, [])
```

- [ ] **Step 3: 将 threadMap 和 threadId 传递给 TaskTreeRow**

更新 `TaskTreeRowProps` 接口，添加：

```typescript
/** 主线映射表 */
threadMap: Map<string, { name: string; color: string }>
/** 当前筛选的主线 ID（用于判断是否隐藏标签） */
currentThreadId?: string
```

在 `TaskTreeView` 的渲染中，传递给 `SortableTaskRow`（由于 SortableTaskRow 使用 spread 接收 TaskTreeRowProps，只需确保在 SortableTaskRow 调用处添加这两个 props）：

```tsx
<SortableTaskRow
  key={node.task.id}
  id={node.task.id}
  node={node}
  expandedIds={expandedIds}
  childData={childData}
  childCountMap={childCountMap}
  threadMap={threadMap}
  currentThreadId={threadId}
  onToggle={handleToggle}
  onOpenTaskDetail={onOpenTaskDetail}
  onStatusChange={handleStatusChange}
  onPromoteToThread={onPromoteToThread}
/>
```

同样在 SortableTaskRow 内部的 `<TaskTreeRow>` 调用和递归 `<TaskTreeRow>` 调用中透传 `threadMap` 和 `currentThreadId`。

- [ ] **Step 4: 在 TaskTreeRow 中渲染主线标签**

在 `TaskTreeRow` 组件中，解构新增的 props：

```typescript
function TaskTreeRow({
  node,
  expandedIds,
  childData,
  childCountMap,
  threadMap,
  currentThreadId,
  onToggle,
  onOpenTaskDetail,
  onStatusChange,
  onPromoteToThread,
}: TaskTreeRowProps) {
```

在精力图标之后、更多菜单之前（约第 613 行 `{FinalIcon && ...}` 之后），添加主线标签渲染：

```tsx
{/* 主线标签（非主线筛选模式下显示） */}
{task.threadId && currentThreadId === '__all__' && (() => {
  const thread = threadMap.get(task.threadId)
  if (!thread) return null
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-muted bg-surface-soft">
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: thread.color }}
      />
      {thread.name}
    </span>
  )
})()}
```

- [ ] **Step 5: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): [007] 任务树行内显示所属主线标签

- 加载主线映射表（颜色 + 名称）
- 任务行显示颜色圆点 + 主线名称标签
- 已按主线筛选时隐藏标签避免冗余"
```

---

## Task 5: [006] 新增 getTaskAncestors Server Action

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts`

- [ ] **Step 1: 在 Task 操作区域末尾添加 getTaskAncestors**

在 `completeTask` 函数之后、`// Thread 操作` 注释之前（约第 143 行），添加：

```typescript
/**
 * 获取任务的祖先链（沿 parentId 向上递归）
 * @param taskId - 任务 ID
 * @returns 祖先数组（从最近父级到最远根级）
 */
export async function getTaskAncestors(taskId: string): Promise<Array<{ id: string; title: string }>> {
  const repo = new TaskRepository()
  const ancestors: Array<{ id: string; title: string }> = []
  let currentId: string | undefined = taskId

  for (let i = 0; i < 10; i++) { // 安全上限
    const task = await repo.findById(currentId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!task || !task.parentId) break
    const parent = await repo.findById(task.parentId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!parent) break
    ancestors.push({ id: parent.id, title: parent.title })
    currentId = parent.id
  }

  return ancestors
}
```

- [ ] **Step 2: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/actions/tasks.ts
git commit -m "feat(tasks): [006] 新增 getTaskAncestors 查询任务祖先链"
```

---

## Task 6: [006] TaskEditZone — 新增 onDirtyChange 回调

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx`

- [ ] **Step 1: 在 TaskEditZoneProps 中添加 onDirtyChange**

找到 `TaskEditZoneProps` 接口（约第 22 行），添加：

```typescript
/** TaskEditZone 组件 Props */
interface TaskEditZoneProps {
  /** 当前任务对象 */
  task: Task
  /** 任务更新回调 */
  onTaskUpdate: (task: Task) => void
  /** 脏数据状态变更回调 */
  onDirtyChange?: (dirty: boolean) => void
}
```

- [ ] **Step 2: 在 TaskEditZone 组件中解构并使用 onDirtyChange**

更新组件签名：

```typescript
export function TaskEditZone({ task, onTaskUpdate, onDirtyChange }: TaskEditZoneProps) {
```

在 `saveField` 回调中（约第 212 行），在 `setSavingField(field)` 之前，调用脏数据通知：

```typescript
const saveField = useCallback(async (field: string, value: unknown) => {
  onDirtyChange?.(true)
  setSavingField(field)
  try {
    const updated = await updateTask(task.id, { [field]: value })
    onTaskUpdate(updated)
    onDirtyChange?.(false)
  } catch {
    onDirtyChange?.(false)
    throw new Error() // re-throw 让调用方处理
  } finally {
    setSavingField(null)
  }
}, [task.id, onTaskUpdate, onDirtyChange])
```

注意：需要将 `try/finally` 改为 `try/catch/finally`，catch 中重置 dirty 并 re-throw。原始代码是 `try/finally`（没有 catch），需要确保 catch 中重新抛出错误。

实际上，原始代码没有 catch 块，直接 finally。修改为：

```typescript
const saveField = useCallback(async (field: string, value: unknown) => {
  onDirtyChange?.(true)
  setSavingField(field)
  try {
    const updated = await updateTask(task.id, { [field]: value })
    onTaskUpdate(updated)
  } finally {
    onDirtyChange?.(false)
    setSavingField(null)
  }
}, [task.id, onTaskUpdate, onDirtyChange])
```

这样无论是成功还是失败，都会重置 dirty 状态。

- [ ] **Step 3: 同样更新 saveNotesField**

找到 `saveNotesField` 函数（约第 239 行），它调用了 `saveField`，由于 `saveField` 已经处理了 `onDirtyChange`，`saveNotesField` 不需要额外修改。但需要将 `onDirtyChange` 添加到依赖中——实际上 `saveNotesField` 不是 `useCallback`，它直接调用 `saveField`，而 `saveField` 已经在 `useCallback` 依赖中包含了 `onDirtyChange`，所以无需额外改动。

- [ ] **Step 4: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(tasks): [006] TaskEditZone 新增 onDirtyChange 回调通知编辑状态"
```

---

## Task 7: [006] TaskDetailDrawer — 导航栈 + 面包屑 + 未保存拦截

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`

这是改动最大的 Task。需要将 `TaskDetailDrawer` 从"单任务展示"升级为"支持任务间导航的抽屉"。

- [ ] **Step 1: 定义 NavEntry 类型和导航栈 state**

在 `task-detail-drawer.tsx` 文件中，在 `TaskDetailDrawerProps` 接口之后（约第 52 行），添加导航栈类型：

```typescript
/** 导航栈条目 */
interface NavEntry {
  taskId: string
  task: Task | null
  hasUnsavedChanges: boolean
}
```

在文件顶部的 import 中添加 `getTaskAncestors` 和 `ChevronRight`：

```typescript
import { getTaskById, deleteTask, archiveTask, getChildCounts, getTaskAncestors } from '@/app/actions/tasks'
```

```typescript
import { X, ChevronDown, ChevronRight, Loader2, ArrowLeft, Zap, Maximize2, Archive, Trash2 } from 'lucide-react'
```

- [ ] **Step 2: 重构组件内部 state 为导航栈**

在 `TaskDetailDrawer` 组件内，替换现有 state 结构。将：

```typescript
const [task, setTask] = useState<Task | null>(null)
const [loading, setLoading] = useState(true)
const [notFound, setNotFound] = useState(false)
```

替换为：

```typescript
// ─── 导航栈 ──────────────────────────────────────────────────
const [navStack, setNavStack] = useState<NavEntry[]>([{ taskId, task: null, hasUnsavedChanges: false }])
const [loading, setLoading] = useState(true)
const [notFound, setNotFound] = useState(false)
const [ancestors, setAncestors] = useState<Array<{ id: string; title: string }>>([])
const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

/** 当前导航条目 */
const currentEntry = navStack[navStack.length - 1]
const currentTask = currentEntry?.task
const currentTaskId = currentEntry?.taskId ?? taskId
```

- [ ] **Step 3: 重构 loadTask 为加载当前导航条目的任务**

将 `loadTask` 回调替换为：

```typescript
// ─── 加载任务 ───
const loadTask = useCallback(async (targetId: string) => {
  setLoading(true)
  setNotFound(false)
  try {
    const t = await getTaskById(targetId)
    if (!t) { setNotFound(true); setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: null } : e)) }
    else {
      setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: t } : e))
      // 加载面包屑祖先
      const ancs = await getTaskAncestors(targetId)
      setAncestors(ancs)
    }
  } catch {
    setNotFound(true)
    setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: null } : e))
  } finally {
    setLoading(false)
  }
}, [])
```

更新 useEffect 触发加载：

```typescript
useEffect(() => { loadTask(currentTaskId) }, [currentTaskId, loadTask])
```

- [ ] **Step 4: 添加导航函数**

在 `loadTask` useEffect 之后，添加导航函数：

```typescript
/** 导航到子任务（push） */
const navigateToTask = useCallback((targetId: string) => {
  setNavStack(prev => [...prev, { taskId: targetId, task: null, hasUnsavedChanges: false }])
}, [])

/** 导航到面包屑层级（pop 到目标） */
const navigateToAncestor = useCallback((targetIndex: number) => {
  setNavStack(prev => prev.slice(0, targetIndex + 1))
}, [])

/** 关闭拦截 */
const handleCloseAttempt = useCallback(() => {
  if (currentEntry?.hasUnsavedChanges) {
    setShowUnsavedDialog(true)
  } else {
    onClose()
  }
}, [currentEntry, onClose])
```

- [ ] **Step 5: 修改 ESC 快捷键和遮罩层**

将 ESC 键处理改为调用 `handleCloseAttempt`：

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') handleCloseAttempt()
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [handleCloseAttempt])
```

将遮罩层 onClick 改为 `handleCloseAttempt`：

```tsx
<div
  className="fixed inset-0 md:left-[260px] z-30 bg-scrim animate-in fade-in duration-200"
  onClick={handleCloseAttempt}
  aria-hidden="true"
/>
```

将顶部关闭按钮改为 `handleCloseAttempt`：

```tsx
<button
  type="button"
  onClick={handleCloseAttempt}
  className="rounded-md p-1 text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
  aria-label="关闭"
>
  <X className="size-4" />
</button>
```

底部关闭按钮同样改为 `handleCloseAttempt`。

- [ ] **Step 6: 添加面包屑组件**

在顶部操作栏和内容区域之间，添加面包屑。找到顶部操作栏的 `</div>` 结束标签（约第 217 行），在其后、`{/* ── 内容区域 ── */}` 之前，插入面包屑：

```tsx
{/* ── 面包屑路径 ── */}
{!loading && currentTask && (
  <div className="flex items-center gap-1 shrink-0 px-5 py-2 border-b border-hairline-soft text-xs overflow-x-auto">
    <button
      type="button"
      onClick={onClose}
      className="text-muted hover:text-ink transition-colors shrink-0"
    >
      任务树
    </button>
    {ancestors.reverse().map((anc, idx) => {
      // 计算此祖先在 navStack 中的位置
      const stackIdx = idx // ancestors 已经 reverse，顺序是从根到叶
      return (
        <React.Fragment key={anc.id}>
          <ChevronRight className="size-3 text-muted-soft shrink-0" />
          <button
            type="button"
            onClick={() => navigateToAncestor(stackIdx)}
            className="text-muted hover:text-ink transition-colors truncate max-w-[120px]"
          >
            {anc.title}
          </button>
        </React.Fragment>
      )
    })}
    <ChevronRight className="size-3 text-muted-soft shrink-0" />
    <span className="text-ink font-medium truncate max-w-[120px]">{currentTask.title}</span>
  </div>
)}
```

注意：需要在文件顶部添加 `import React from 'react'` 或确保 `React.Fragment` 可用（Next.js 通常自动导入 React）。

实际上，面包屑中祖先的导航需要更精确的栈索引计算。因为祖先链是从根到最近父级，而导航栈的索引 0 对应初始任务。当从面包屑点击某个祖先时，需要 pop 到正确位置。

更正面包屑实现：

```tsx
{/* ── 面包屑路径 ── */}
{!loading && currentTask && (() => {
  // 构建面包屑项：[任务树, ...ancestors(从根到叶), 当前任务]
  // ancestors 是从最近父级到最远根级，需要 reverse
  const breadcrumbAncestors = [...ancestors].reverse()
  return (
    <div className="flex items-center gap-1 shrink-0 px-5 py-2 border-b border-hairline-soft text-xs overflow-x-auto">
      <button
        type="button"
        onClick={onClose}
        className="text-muted hover:text-ink transition-colors shrink-0"
      >
        任务树
      </button>
      {breadcrumbAncestors.map((anc, idx) => (
        <React.Fragment key={anc.id}>
          <ChevronRight className="size-3 text-muted-soft shrink-0" />
          <button
            type="button"
            onClick={() => {
              // pop 导航栈到 idx 位置（面包屑第 idx 个祖先 = 栈的 idx 位置）
              // 但祖先不在 navStack 中，需要用 navigateToTask 替换
              setNavStack(prev => prev.slice(0, idx + 1))
            }}
            className="text-muted hover:text-ink transition-colors truncate max-w-[120px]"
          >
            {anc.title}
          </button>
        </React.Fragment>
      ))}
      <ChevronRight className="size-3 text-muted-soft shrink-0" />
      <span className="text-ink font-medium truncate max-w-[120px]">{currentTask.title}</span>
    </div>
  )
})()}
```

面包屑祖先导航实际场景分析：
- 初始打开：navStack = `[entry(taskId)]`，ancestors = `[parent, grandparent]`（从近到远）
- 点击子任务：navStack = `[entry(taskId), entry(childId)]`
- 面包屑点击应该 pop 栈，但祖先链中的任务可能不在栈中

简化方案：面包屑中的祖先点击，使用 `navigateToTask`（push 新条目），而不是 pop。但这样栈会无限增长。

最终方案——面包屑点击行为：
- 点击「任务树」→ 关闭抽屉（`onClose`）
- 点击祖先任务 → `navigateToTask(anc.id)`（导航到新任务）
- 当前任务 → 不可点击

这是最简单且一致的方案。面包屑在这里更像"路径展示 + 快速跳转"，不需要严格对应导航栈。每次跳转都会重新加载任务和祖先链。

更新面包屑为最终版本：

```tsx
{/* ── 面包屑路径 ── */}
{!loading && currentTask && (() => {
  const breadcrumbAncestors = [...ancestors].reverse()
  return (
    <div className="flex items-center gap-1 shrink-0 px-5 py-2 border-b border-hairline-soft text-xs overflow-x-auto">
      <button
        type="button"
        onClick={onClose}
        className="text-muted hover:text-ink transition-colors shrink-0"
      >
        任务树
      </button>
      {breadcrumbAncestors.map((anc) => (
        <React.Fragment key={anc.id}>
          <ChevronRight className="size-3 text-muted-soft shrink-0" />
          <button
            type="button"
            onClick={() => navigateToTask(anc.id)}
            className="text-muted hover:text-ink transition-colors truncate max-w-[120px]"
          >
            {anc.title}
          </button>
        </React.Fragment>
      ))}
      <ChevronRight className="size-3 text-muted-soft shrink-0" />
      <span className="text-ink font-medium truncate max-w-[120px]">{currentTask.title}</span>
    </div>
  )
})()}
```

- [ ] **Step 7: 添加未保存修改确认对话框**

在组件返回的 JSX 最外层（`<>...</>` 内），在遮罩层之前，添加未保存确认对话框：

```tsx
{/* ── 未保存修改确认 ── */}
<AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>未保存的修改</AlertDialogTitle>
      <AlertDialogDescription>
        关闭将丢失当前编辑内容，确认关闭？
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setShowUnsavedDialog(false)}>
        继续编辑
      </AlertDialogCancel>
      <AlertDialogAction onClick={() => { setShowUnsavedDialog(false); onClose() }}>
        放弃修改
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 8: 更新 handleTaskUpdate 使用 currentTaskId**

将 `handleTaskUpdate` 改为更新导航栈中的 task：

```typescript
const handleTaskUpdate = useCallback((updated: Task) => {
  setNavStack(prev => prev.map((e, i) =>
    i === prev.length - 1 ? { ...e, task: updated } : e
  ))
  onTaskChanged?.()
}, [onTaskChanged])
```

- [ ] **Step 9: 更新 dirty 状态管理**

添加 `handleDirtyChange` 回调：

```typescript
const handleDirtyChange = useCallback((dirty: boolean) => {
  setNavStack(prev => prev.map((e, i) =>
    i === prev.length - 1 ? { ...e, hasUnsavedChanges: dirty } : e
  ))
}, [])
```

- [ ] **Step 10: 更新所有 task 引用为 currentTask**

在组件 JSX 中，将所有 `task` 引用替换为 `currentTask`，将 `taskId` 替换为 `currentTaskId`（props 中的 `taskId` 仅用于初始化）。

主要替换点：
- `{!loading && task && (` → `{!loading && currentTask && (`
- `<TaskEditZone task={task} onTaskUpdate={handleTaskUpdate} />` → `<TaskEditZone task={currentTask} onTaskUpdate={handleTaskUpdate} onDirtyChange={handleDirtyChange} />`
- `task.captureMode` → `currentTask.captureMode`
- `task.id` → `currentTask.id`
- 归档按钮中 `archiveTask(taskId)` → `archiveTask(currentTaskId)`
- 删除按钮中 `deleteTask(taskId)` → `deleteTask(currentTaskId)`
- 全屏按钮中 `onEnterFullscreen(taskId)` → `onEnterFullscreen(currentTaskId)`

- [ ] **Step 11: 更新 SubtaskList 的 onOpenTask 回调**

在两处 `<SubtaskList>` 中，将 `onOpenTask` 回调从空函数改为导航函数：

大屏（约第 287 行）：
```tsx
<SubtaskList
  taskId={currentTask.id}
  userId={userId}
  onOpenTask={(id) => navigateToTask(id)}
/>
```

小屏（约第 267 行）：
```tsx
<SubtaskList
  taskId={currentTask.id}
  userId={userId}
  onOpenTask={(id) => navigateToTask(id)}
/>
```

- [ ] **Step 12: 更新删除按钮中的 childCount 引用**

由于 `task` 变为 `currentTask`，删除条件中的变量引用也需要更新。`childCount` state 的加载需要使用 `currentTaskId`。

在 `loadTask` 回调中获取 childCount：

```typescript
const c = await getChildCounts([targetId])
setChildCount(c[targetId] ?? 0)
```

- [ ] **Step 13: 验证**

运行: `cd frontend && npm run build`
预期: 构建通过

- [ ] **Step 14: 提交**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "feat(tasks): [006] TaskDetailDrawer 导航栈 + 面包屑 + 未保存拦截

- 引入 NavEntry 导航栈支持任务间导航
- 面包屑显示祖先路径，可点击跳转
- 子任务点击在抽屉内切换
- 有未保存修改时弹出确认对话框"
```

---

## 自检

**1. Spec 覆盖度：**
- [005] Task 删除校验 → Task 1 ✅
- [005] Thread 删除校验 → Task 2 ✅
- [007] 多层次展开修复 → Task 3 ✅
- [007] 行内主线标签 → Task 4 ✅
- [006] getTaskAncestors → Task 5 ✅
- [006] onDirtyChange → Task 6 ✅
- [006] 导航栈 + 面包屑 + 未保存拦截 → Task 7 ✅

**2. 占位符扫描：** 无 TBD/TODO/实现占位 ✅

**3. 类型一致性：**
- `NavEntry` 在 Task 7 定义，接口稳定
- `childCountMap: Map<string, number>` 在 Task 3-4 贯穿
- `threadMap: Map<string, { name: string; color: string }>` 在 Task 4 定义并传递
- `onDirtyChange?: (dirty: boolean) => void` 在 Task 6 定义，Task 7 使用
- `getTaskAncestors` 返回 `Array<{ id: string; title: string }>` 在 Task 5 定义，Task 7 使用 ✅
