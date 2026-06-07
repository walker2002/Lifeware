# 任务管理迭代（第三批）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构任务树筛选栏（移至顶部、新增搜索/排序/文字按钮）并优化操作按钮（行内操作 + Detail 手动保存）

**Architecture:** 纯 Domain Plugin Page 组件层改动。筛选/搜索/排序在前端 TaskTreeView 内完成，不新增 Server Action。行内操作复用已有 archiveTask/deleteTask/updateThreadStatus。TaskEditZone 从即改即存改为 draft 批量保存。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4 (design tokens), lucide-react, shadcn/ui

**Design Spec:** `docs/superpowers/specs/2026-06-07-task-management-iteration-3-design.md`

---

## File Structure

| 操作 | 文件 | 职责 |
|---|---|---|
| Create | `frontend/src/domains/tasks/components/task-filter-bar.tsx` | 顶部筛选栏组件（搜索 + 清晰度/状态文字按钮 + 排序） |
| Modify | `frontend/src/domains/tasks/pages/TaskTreePage.tsx` | 新增 search/sort 状态，渲染 TaskFilterBar，清理 ThreadListPanel filter props |
| Modify | `frontend/src/domains/tasks/components/thread-list-panel.tsx` | 移除底部筛选 footer 和 filter props；主线列表项增加行内操作图标 |
| Modify | `frontend/src/domains/tasks/components/task-tree-view.tsx` | 新增 search/sort props，搜索过滤 + 排序逻辑；行内操作图标 |
| Modify | `frontend/src/domains/tasks/components/task-edit-zone.tsx` | 新增 startDate 字段；改即改即存为 draft 批量保存 |
| Modify | `frontend/src/domains/tasks/components/task-detail-drawer.tsx` | 移除底部归档/删除按钮，仅保留关闭按钮 |

---

## [011] 筛选栏重构

### Task 1: 创建 TaskFilterBar 组件

**Files:**
- Create: `frontend/src/domains/tasks/components/task-filter-bar.tsx`

- [ ] **Step 1: 创建 TaskFilterBar 组件文件**

```tsx
/**
 * @file task-filter-bar
 * @brief 任务树顶部筛选栏组件
 *
 * 包含搜索框、清晰度/状态文字按钮筛选、排序下拉。
 * 替代原 ThreadListPanel 底部复选框筛选区。
 */

'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** 排序字段类型 */
export type SortField = 'title' | 'startDate' | 'endDate'

/** TaskFilterBar 组件属性 */
interface TaskFilterBarProps {
  /** 搜索关键词 */
  searchQuery: string
  /** 搜索变更回调 */
  onSearchChange: (query: string) => void
  /** 当前清晰度筛选值 */
  filterClarity: string[]
  /** 当前状态筛选值 */
  filterStatus: string[]
  /** 筛选变更回调 */
  onFilterChange: (key: 'clarity' | 'status', value: string) => void
  /** 排序字段 */
  sortBy: SortField
  /** 排序字段变更回调 */
  onSortByChange: (sortBy: SortField) => void
}

// ─── 常量 ──────────────────────────────────────────────────────────

/** 清晰度选项（排除空串） */
const CLARITY_OPTIONS = [
  { value: 'fuzzy', label: '模糊' },
  { value: 'scoped', label: '有范围' },
  { value: 'actionable', label: '可执行' },
]

/** 状态选项（排除空串） */
const STATUS_OPTIONS = [
  { value: 'todo', label: '待办' },
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

/** 排序选项 */
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'title', label: '名称' },
  { value: 'startDate', label: '开始时间' },
  { value: 'endDate', label: '结束时间' },
]

/** 文字按钮 — 未选中样式 */
const TAG_UNSELECTED = 'bg-canvas text-body border border-hairline rounded px-2.5 py-1 text-xs cursor-pointer hover:bg-hover-overlay transition-colors'

/** 文字按钮 — 选中样式 */
const TAG_SELECTED = 'bg-ink text-on-primary rounded px-2.5 py-1 text-xs cursor-pointer transition-colors'

// ─── 组件 ──────────────────────────────────────────────────────────

/**
 * 任务树顶部筛选栏组件
 * @param props - 组件属性
 */
export function TaskFilterBar({
  searchQuery,
  onSearchChange,
  filterClarity,
  filterStatus,
  onFilterChange,
  sortBy,
  onSortByChange,
}: TaskFilterBarProps) {
  return (
    <div className="px-4 py-3 border-b border-hairline bg-surface-soft space-y-2">
      {/* 第一行：搜索框 + 排序 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索任务..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">排序</span>
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortField)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 第二行：清晰度标签 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted shrink-0">清晰度</span>
        <div className="flex flex-wrap gap-1.5">
          {CLARITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('clarity', opt.value)}
              className={cn(filterClarity.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 第三行：状态标签 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted shrink-0">状态</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange('status', opt.value)}
              className={cn(filterStatus.includes(opt.value) ? TAG_SELECTED : TAG_UNSELECTED)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-filter-bar`
Expected: 无输出（无错误）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/components/task-filter-bar.tsx
git commit -m "feat(tasks): [011] 新建 TaskFilterBar 顶部筛选栏组件"
```

---

### Task 2: TaskTreePage 接入 TaskFilterBar + ThreadListPanel 清理

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx:10-19,48-63,130,173-181,194-202`
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:33-47,60-82,96-103,247-281`

- [ ] **Step 1: 修改 TaskTreePage — 新增 import 和状态**

在 `TaskTreePage.tsx` 中：
1. 添加 import：`import { TaskFilterBar } from '../components/task-filter-bar'`（加在 `ThreadDetailDrawer` import 之后）
2. 添加 `type SortField` import：`import type { SortField } from '../components/task-filter-bar'`
3. 在 `filterStatus` 状态之后新增：

```typescript
const [searchQuery, setSearchQuery] = useState('')
const [sortBy, setSortBy] = useState<SortField>('title')
```

- [ ] **Step 2: 修改 TaskTreePage — 在 header 之后渲染 TaskFilterBar**

在 `</header>` 之后、`<div className="flex flex-1 overflow-hidden relative">` 之前插入：

```tsx
<TaskFilterBar
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  filterClarity={filterClarity}
  filterStatus={filterStatus}
  onFilterChange={handleFilterChange}
  sortBy={sortBy}
  onSortByChange={setSortBy}
/>
```

- [ ] **Step 3: 修改 TaskTreePage — ThreadListPanel 移除 filter props**

将 `<ThreadListPanel>` 调用中的 `filterClarity`、`filterStatus`、`onFilterChange` 三个 prop 移除。

修改后：
```tsx
<ThreadListPanel
  selectedThreadId={selectedThreadId}
  onSelectThread={handleSelectThread}
  onOpenThreadDetail={openThreadDetail}
  refreshKey={refreshKey}
/>
```

- [ ] **Step 4: 修改 TaskTreePage — TaskTreeView 新增 search/sort props**

在 `<TaskTreeView>` 调用中新增 `searchQuery` 和 `sortBy`：

```tsx
<TaskTreeView
  threadId={selectedThreadId}
  refreshKey={refreshKey}
  onOpenTaskDetail={openTaskDetail}
  onPromoteToThread={promoteToThread}
  onDataChanged={handleDataChanged}
  filterClarity={filterClarity}
  filterStatus={filterStatus}
  searchQuery={searchQuery}
  sortBy={sortBy}
/>
```

- [ ] **Step 5: 修改 ThreadListPanel — 移除 filter props 和底部 footer**

1. 在 `ThreadListPanelProps` 接口中删除 `filterClarity`、`filterStatus`、`onFilterChange` 三个属性
2. 在组件参数解构中删除 `filterClarity = []`、`filterStatus = []`、`onFilterChange`
3. 删除文件头注释中 "底部提供清晰度和状态筛选" 的描述
4. 删除 `CLARITY_LABELS`、`CLARITY_OPTIONS`、`STATUS_LABELS`、`STATUS_OPTIONS` 常量（已移至 TaskFilterBar）
5. 删除整个 `<footer>` 区域（第 247-281 行的底部筛选区）
6. 更新文件头注释为：`展示用户所有主线及任务计数，支持选中切换。`

- [ ] **Step 6: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep -E 'TaskTreePage|thread-list-panel|task-filter'`
Expected: 无输出

- [ ] **Step 7: 提交**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "feat(tasks): [011] TaskTreePage 接入筛选栏 + ThreadListPanel 清理 filter props"
```

---

### Task 3: TaskTreeView 搜索过滤与排序

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx:58-73,129-137,221-241,559-568`

- [ ] **Step 1: 扩展 TaskTreeViewProps 接口**

在 `TaskTreeViewProps` 中 `filterStatus` 之后新增：

```typescript
/** 搜索关键词（匹配标题和描述） */
searchQuery?: string
/** 排序字段 */
sortBy?: import('../components/task-filter-bar').SortField
```

- [ ] **Step 2: 组件参数解构新增 searchQuery / sortBy**

在 `TaskTreeView` 函数参数解构中添加 `searchQuery` 和 `sortBy`：

```typescript
export function TaskTreeView({
  threadId = '__all__',
  refreshKey = 0,
  onOpenTaskDetail,
  onPromoteToThread,
  onDataChanged,
  filterClarity,
  filterStatus,
  searchQuery,
  sortBy,
}: TaskTreeViewProps) {
```

- [ ] **Step 3: 在文件顶部（`import { cn }` 之前）添加 SortField import**

```typescript
import type { SortField } from './task-filter-bar'
```

- [ ] **Step 4: 新增搜索过滤辅助函数**

在 `MAX_DEPTH` 和 `INDENT_PX` 常量之后添加：

```typescript
/**
 * 递归过滤树节点：保留匹配搜索词的节点及其祖先
 * @param nodes - 树节点数组
 * @param query - 搜索关键词（小写）
 * @returns 过滤后的节点数组
 */
function filterTreeBySearch(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const titleMatch = node.task.title.toLowerCase().includes(q)
    const descMatch = !!node.task.description?.toLowerCase().includes(q)
    const selfMatch = titleMatch || descMatch
    const filteredChildren = filterTreeBySearch(node.children, query)
    if (selfMatch || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren })
    }
    return acc
  }, [])
}

/**
 * 排序树节点数组
 * @param nodes - 树节点数组
 * @param sortField - 排序字段
 * @returns 排序后的节点数组（新数组）
 */
function sortTreeNodes(nodes: TreeNode[], sortField: SortField): TreeNode[] {
  if (sortField === 'title') {
    return [...nodes].sort((a, b) => a.task.title.localeCompare(b.task.title, 'zh-CN'))
  }
  return [...nodes].sort((a, b) => {
    const aVal = (sortField === 'startDate' ? a.task.startDate : a.task.endDate) ?? ''
    const bVal = (sortField === 'startDate' ? b.task.startDate : b.task.endDate) ?? ''
    // 空值排末尾
    if (!aVal && !bVal) return 0
    if (!aVal) return 1
    if (!bVal) return -1
    return aVal.localeCompare(bVal)
  })
}
```

- [ ] **Step 5: 在加载根节点的 useEffect 中，对 `nodes` 应用搜索过滤和排序**

找到 `if (!cancelled) setRootNodes(nodes)` 这一行（约第 230 行），在其前面插入搜索过滤和排序：

```typescript
        // 搜索过滤
        let result = filterTreeBySearch(nodes, searchQuery ?? '')
        // 排序
        result = sortTreeNodes(result, sortBy ?? 'title')

        if (!cancelled) setRootNodes(result)
```

同时更新 useEffect 的依赖数组，从 `[threadId, refreshKey, filterClarity, filterStatus]` 改为 `[threadId, refreshKey, filterClarity, filterStatus, searchQuery, sortBy]`

- [ ] **Step 6: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-tree-view`
Expected: 无输出

- [ ] **Step 7: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): [011] TaskTreeView 搜索过滤 + 客户端排序"
```

---

### Task 4: TaskEditZone 新增"开始时间"字段

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:343-354`

- [ ] **Step 1: 在"截止日期"之前新增"开始时间"字段**

在属性网格中"预估时长"区块之后、"截止日期"之前插入：

```tsx
        {/* 开始时间 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">开始时间</label>
          <input
            type="date"
            value={task.startDate ?? ''}
            onChange={e => saveField('startDate', e.target.value || undefined)}
            disabled={savingField === 'startDate'}
            onClick={e => e.stopPropagation()}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
```

注意：`startDate` 的 DB 列（`start_date`）和 USOM 字段（`startDate?: DateOnly`）均已存在，无需数据库迁移。

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-edit-zone`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(tasks): [011] TaskEditZone 新增开始时间 startDate 字段"
```

---

## [012] 操作按钮优化

### Task 5: 任务树行内操作图标

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx:12-16,412-425,687-725`

- [ ] **Step 1: 新增 import**

在文件顶部 lucide-react import 中添加 `Pencil, Archive, Trash2`：

```typescript
import { ChevronRight, ListTodo, Check, MoreHorizontal, GripVertical, Sparkles, Pencil, Archive, Trash2 } from 'lucide-react'
```

- [ ] **Step 2: 扩展 TaskTreeRowProps**

在 `TaskTreeRowProps` 接口中 `onPromoteToThread` 之后新增：

```typescript
/** 数据变更回调（行内归档/删除后刷新） */
onDataChanged?: () => void
```

- [ ] **Step 3: SortableTaskRow 传递 onDataChanged**

在 `SortableTaskRow` 中，将 `onDataChanged` 从 TaskTreeView props 传入 TaskTreeRow：

在 `SortableTaskRow` 的 props 解构中添加 `onDataChanged`，并在 `<TaskTreeRow>` 中传递 `onDataChanged={onDataChanged}`。

同时在 `TaskTreeView` 渲染 `SortableTaskRow` 处（约第 375 行）添加 `onDataChanged={onDataChanged}` prop。

- [ ] **Step 4: 在 TaskTreeRow "更多菜单"之前插入行内操作图标**

在 TaskTreeRow 渲染中，找到 `{/* 主线标签 */}` 区块之后、`{/* 更多菜单（悬停显示）*/}` 之前，插入行内操作图标：

```tsx
        {/* 行内操作图标（悬停显示） */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenTaskDetail?.(task.id) }}
            className="p-1 rounded text-muted hover:text-ink transition-colors"
            title="编辑详情"
          >
            <Pencil className="size-3.5" />
          </button>
          {task.status !== 'completed' && task.status !== 'archived' && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await archiveTask(task.id)
                  toast.success('任务已归档')
                  onDataChanged?.()
                } catch {
                  toast.error('归档失败')
                }
              }}
              className="p-1 rounded text-muted hover:text-ink transition-colors"
              title="归档"
            >
              <Archive className="size-3.5" />
            </button>
          )}
        </div>
```

同时需要在 TaskTreeRow 文件顶部添加 `import { archiveTask } from '@/app/actions/tasks'`。

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-tree-view`
Expected: 无输出

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): [012] 任务树行内操作图标（编辑 + 归档）"
```

---

### Task 6: 主线列表行内操作图标

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:13-16,200-241`

- [ ] **Step 1: 新增 import**

在 lucide-react import 中添加 `Pencil, Archive, Trash2`：

```typescript
import { ListTodo, FolderOpen, Folder, Pencil, Archive, Trash2 } from 'lucide-react'
```

添加 Server Action import：

```typescript
import { deleteThread, updateThreadStatus } from '@/app/actions/tasks'
```

- [ ] **Step 2: 为主线列表项添加行内操作图标**

在主线列表项的 `{/* 任务计数 */}` 之后、`</button>` 之前插入：

```tsx
                  {/* 行内操作图标（悬停显示） */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenThreadDetail?.(thread.id) }}
                      className="p-1 rounded text-muted hover:text-ink transition-colors"
                      title="编辑主线"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await updateThreadStatus(thread.id, 'archived')
                          toast.success('主线已归档')
                        } catch {
                          toast.error('归档失败')
                        }
                      }}
                      className="p-1 rounded text-muted hover:text-ink transition-colors"
                      title="归档主线"
                    >
                      <Archive className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm('确认删除此主线？')) return
                        try {
                          await deleteThread(thread.id)
                          toast.success('主线已删除')
                        } catch {
                          toast.error('删除失败')
                        }
                      }}
                      className="p-1 rounded text-muted hover:text-ink transition-colors"
                      title="删除主线"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep thread-list-panel`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "feat(tasks): [012] 主线列表行内操作图标（编辑 + 归档 + 删除）"
```

---

### Task 7: TaskEditZone 改为 draft 批量保存模式

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:1-18,208-223,284-380`

- [ ] **Step 1: 重构 TaskEditZone 为 draft 模式**

将 `saveField` 和 `savingField` 状态替换为 draft 模式。修改 TaskEditZone 函数体：

删除：
```typescript
const [savingField, setSavingField] = useState<string | null>(null)

/** 通用字段保存 */
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

替换为：
```typescript
/** 变更字段草稿（key=字段名, value=新值） */
const [draft, setDraft] = useState<Record<string, unknown>>({})
const [saving, setSaving] = useState(false)

/** 是否有未保存变更 */
const hasChanges = Object.keys(draft).length > 0

/** 字段变更回调 — 更新 draft 而非直接保存 */
const updateDraft = useCallback((field: string, value: unknown) => {
  setDraft(prev => ({ ...prev, [field]: value }))
  onDirtyChange?.(true)
}, [onDirtyChange])

/** 批量保存 — 合并所有变更字段到一次 updateTask 调用 */
const saveAll = useCallback(async () => {
  if (Object.keys(draft).length === 0) return
  setSaving(true)
  try {
    const updated = await updateTask(task.id, draft)
    setDraft({})
    onTaskUpdate(updated)
    onDirtyChange?.(false)
  } finally {
    setSaving(false)
  }
}, [draft, task.id, onTaskUpdate, onDirtyChange])
```

- [ ] **Step 2: 替换所有 `saveField` 调用为 `updateDraft`**

在整个组件中将所有 `saveField(` 调用替换为 `updateDraft(`：
- `saveField('title', val)` → `updateDraft('title', val)`
- `saveField('description', val)` → `updateDraft('description', val)`
- `saveField('priority', e.target.value)` → `updateDraft('priority', e.target.value)`
- `saveField('energyRequired', e.target.value)` → `updateDraft('energyRequired', e.target.value)`
- `saveField('tracking', e.target.value)` → `updateDraft('tracking', e.target.value)`
- `saveField('estimatedDuration', val)` → `updateDraft('estimatedDuration', val)`
- `saveField('dueDate', e.target.value || undefined)` → `updateDraft('dueDate', e.target.value || undefined)`
- `saveField('startDate', e.target.value || undefined)` → `updateDraft('startDate', e.target.value || undefined)`
- `saveNotesField(...)` → 改用 `updateDraft('notes', ...)`，需要内联 notes JSON 合并逻辑

- [ ] **Step 3: 替换所有 `savingField === 'xxx'` 为 `saving`**

将所有 `disabled={savingField === 'xxx'}` 替换为 `disabled={saving}`。

- [ ] **Step 4: DurationEdit 适配 draft 模式**

DurationEdit 的 `onSave` 回调从 `val => saveField(...)` 改为 `val => updateDraft('estimatedDuration', val)`。DurationEdit 组件内部的 `saving` prop 改为接收 `saving`（全局保存状态）。

- [ ] **Step 5: 属性网格中 select 的 value 需要读取 draft 优先**

将属性网格中所有 `value={task.xxx}` 改为读取 draft 优先值。例如优先级：

```tsx
<select
  value={(draft.priority as string) ?? task.priority}
  onChange={e => updateDraft('priority', e.target.value)}
  disabled={saving}
```

对所有 select/date 字段执行相同替换：priority、energyRequired、tracking、dueDate、startDate。

- [ ] **Step 6: 在属性网格之后、验收标准之前添加"保存"按钮**

```tsx
      {/* ── 保存按钮 ── */}
      {hasChanges && (
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="h-9 w-full rounded-md bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
        >
          {saving ? '保存中…' : '保存修改'}
        </button>
      )}
```

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-edit-zone`
Expected: 无输出

- [ ] **Step 8: 提交**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(tasks): [012] TaskEditZone 改为 draft 批量保存模式 + 保存按钮"
```

---

### Task 8: TaskDetailDrawer 移除底部归档/删除按钮

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx:15-17,110-113,442-507`

- [ ] **Step 1: 移除不再需要的 import**

从 lucide-react import 中移除 `Archive` 和 `Trash2`（如果它们仅用于底部操作栏）。如果 `Archive` 还在其他地方使用则保留。

检查后保留 `X`（关闭按钮用），移除 `Archive, Trash2`。

- [ ] **Step 2: 移除删除相关状态和计算**

删除以下代码：
- `const [childCount, setChildCount] = useState<number>(0)` 状态（第 113 行）
- `canDelete` 计算（第 151-153 行）
- `deleteDisabledReason` 计算（第 156-161 行）
- `getChildCounts` import 和调用（第 137-138 行）

- [ ] **Step 3: 简化底部操作栏**

将整个底部操作栏（第 442-507 行）替换为仅保留"关闭"按钮：

```tsx
          {/* ── 底部操作栏 ── */}
          {!loading && currentTask && (
            <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end">
              <Button variant="secondary" onClick={handleCloseAttempt}>
                关闭
              </Button>
            </div>
          )}
```

- [ ] **Step 4: 移除不再需要的 AlertDialog/Toast import**

检查 `AlertDialog`、`AlertDialogAction`、`AlertDialogCancel`、`AlertDialogContent`、`AlertDialogDescription`、`AlertDialogFooter`、`AlertDialogHeader`、`AlertDialogTitle`、`AlertDialogTrigger` 是否仍被使用。如果底部操作栏是唯一使用场景，移除这些 import。

同理检查 `toast` 是否仍被使用（其他地方可能用到则保留）。

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep task-detail-drawer`
Expected: 无输出

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "feat(tasks): [012] TaskDetailDrawer 移除底部归档/删除按钮，仅保留关闭"
```

---

### Task 9: Nexus 链路 TODO 标注 + 最终验证

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts:96,116,125`

- [ ] **Step 1: 在 Server Action 中添加 TODO 注释**

在 `updateTask`、`archiveTask`、`deleteTask` 函数签名之前添加：

```typescript
// TODO: 迁移至 Nexus PrebuiltIntent 链路（宪章 Page component data access rules）
```

- [ ] **Step 2: 全量 TypeScript 编译检查**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep -v '__tests__\|node_modules' | grep 'error TS'`
Expected: 仅包含预存的已知错误（intent.ts、ai-runtime tests 等），不包含本次修改的文件

- [ ] **Step 3: 最终提交**

```bash
git add frontend/src/app/actions/tasks.ts
git commit -m "chore(tasks): [012] Server Action 标注 Nexus 链路迁移 TODO"
```
