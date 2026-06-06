# 任务管理迭代（第二批）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三项任务管理 UI 优化：筛选条件多选复选框、导航菜单图标/标题调整、时长显示输入与面包屑颜色优化。

**Architecture:** 纯 Domain Plugin Page 组件层改动。筛选状态从 `string` 升级为 `string[]`，Repository 的 `findByUserId` 已支持 status 数组但 clarity 仅支持单值需扩展。时长格式化为纯 UI 工具函数，后端存储不变。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Drizzle ORM, lucide-react

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/format-duration.ts` (新建) | 时长格式化/解析工具函数 |
| `frontend/src/usom/interfaces/irepository.ts` | TaskFilters.clarity 类型扩展支持数组 |
| `frontend/src/domains/tasks/repository/task.ts` | findByUserId clarity 数组筛选逻辑 |
| `frontend/src/domains/tasks/components/thread-list-panel.tsx` | 筛选区复选框 UI + 导航菜单图标/文字调整 |
| `frontend/src/domains/tasks/pages/TaskTreePage.tsx` | 筛选状态 string→string[] + 标题硬编码 |
| `frontend/src/domains/tasks/components/task-tree-view.tsx` | 筛选逻辑适配数组 + Props 类型更新 |
| `frontend/src/domains/tasks/components/task-edit-zone.tsx` | DurationEdit 双输入框（小时+分钟） |
| `frontend/src/domains/tasks/components/task-complete-zone.tsx` | CompletedSummary + CheckInForm 时长双输入框 |
| `frontend/src/domains/tasks/components/task-detail-drawer.tsx` | 面包屑颜色对比度提升 |

---

### Task 1: [008] 扩展 TaskFilters.clarity 支持数组 + Repository 逻辑

**Files:**
- Modify: `frontend/src/usom/interfaces/irepository.ts:82-99`
- Modify: `frontend/src/domains/tasks/repository/task.ts:29-48`

- [ ] **Step 1: 扩展 TaskFilters.clarity 类型**

在 `frontend/src/usom/interfaces/irepository.ts:89`：

```typescript
// 之前
clarity?: ClarityLevel

// 之后
clarity?: ClarityLevel | ClarityLevel[]
```

- [ ] **Step 2: Repository findByUserId 支持 clarity 数组**

在 `frontend/src/domains/tasks/repository/task.ts:38`：

```typescript
// 之前
if (filters?.clarity) conditions.push(eq(s.tasks.clarity, filters.clarity))

// 之后
if (filters?.clarity) {
  if (Array.isArray(filters.clarity)) {
    conditions.push(inArray(s.tasks.clarity, filters.clarity))
  } else {
    conditions.push(eq(s.tasks.clarity, filters.clarity))
  }
}
```

确保文件顶部已导入 `inArray`（检查现有 import，`eq` 来自 drizzle-orm，`inArray` 同源）。

- [ ] **Step 3: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "(irepository|task\.ts)" | head -10`
Expected: 无新错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/usom/interfaces/irepository.ts frontend/src/domains/tasks/repository/task.ts
git commit -m "feat(tasks): [008] 扩展 TaskFilters.clarity 支持数组筛选"
```

---

### Task 2: [008] 筛选状态升级 string→string[] + Props 类型适配

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx:56-65`
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:33-48`
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx:58-73`

- [ ] **Step 1: TaskTreePage 筛选状态改为数组**

在 `frontend/src/domains/tasks/pages/TaskTreePage.tsx`，替换筛选状态和回调：

```typescript
// 之前 (line 58-65)
const [filterClarity, setFilterClarity] = useState('')
const [filterStatus, setFilterStatus] = useState('')

const handleFilterChange = useCallback((key: 'clarity' | 'status', value: string) => {
  if (key === 'clarity') setFilterClarity(value)
  else setFilterStatus(value)
}, [])

// 之后
const [filterClarity, setFilterClarity] = useState<string[]>(['fuzzy', 'scoped', 'actionable'])
const [filterStatus, setFilterStatus] = useState<string[]>(['todo', 'planned', 'in_progress', 'completed'])

const handleFilterChange = useCallback((key: 'clarity' | 'status', value: string) => {
  const setter = key === 'clarity' ? setFilterClarity : setFilterStatus
  setter(prev => {
    if (prev.includes(value)) {
      const next = prev.filter(v => v !== value)
      return next.length === 0 ? prev : next  // 不允许清空
    }
    return [...prev, value]
  })
}, [])
```

- [ ] **Step 2: ThreadListPanelProps 类型改为数组**

在 `frontend/src/domains/tasks/components/thread-list-panel.tsx:33-48`：

```typescript
// 之前
filterClarity?: string
filterStatus?: string
onFilterChange?: (key: 'clarity' | 'status', value: string) => void

// 之后
filterClarity?: string[]
filterStatus?: string[]
onFilterChange?: (key: 'clarity' | 'status', value: string) => void
```

组件函数签名中解构默认值也要改：
```typescript
// 之前
filterClarity = '',
filterStatus = '',

// 之后
filterClarity = [],
filterStatus = [],
```

- [ ] **Step 3: TaskTreeViewProps 类型改为数组**

在 `frontend/src/domains/tasks/components/task-tree-view.tsx:58-73`：

```typescript
// 之前
filterClarity?: string
filterStatus?: string

// 之后
filterClarity?: string[]
filterStatus?: string[]
```

- [ ] **Step 4: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "(TaskTreePage|thread-list-panel|task-tree-view)" | head -10`
Expected: 无新错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx frontend/src/domains/tasks/components/thread-list-panel.tsx frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): [008] 筛选 Props 类型从 string 升级为 string[]"
```

---

### Task 3: [008] 筛选 UI 复选框 + 筛选逻辑适配

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:248-291`
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx:195-203`

- [ ] **Step 1: ThreadListPanel 底部筛选区改为复选框**

替换 `thread-list-panel.tsx` 的 `<footer>` 区域（约 line 248-291）：

```tsx
<footer className="border-t border-hairline-soft px-3 py-3 space-y-2.5">
  <div>
    <p className="text-[10px] text-body mb-1.5">清晰度</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {CLARITY_OPTIONS.filter(v => v !== '').map(v => (
        <label key={v} className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filterClarity.includes(v)}
            onChange={() => onFilterChange?.('clarity', v)}
            className="size-3.5 rounded accent-primary"
          />
          <span className="text-[11px] text-body">{CLARITY_LABELS[v]}</span>
        </label>
      ))}
    </div>
  </div>
  <div>
    <p className="text-[10px] text-body mb-1.5">状态</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {STATUS_OPTIONS.filter(v => v !== '').map(v => (
        <label key={v} className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filterStatus.includes(v)}
            onChange={() => onFilterChange?.('status', v)}
            className="size-3.5 rounded accent-primary"
          />
          <span className="text-[11px] text-body">{STATUS_LABELS[v]}</span>
        </label>
      ))}
    </div>
  </div>
</footer>
```

同时更新 STATUS_OPTIONS 和 STATUS_LABELS，新增 `archived`：

```typescript
// line 72-81 替换为：
const STATUS_LABELS: Record<string, string> = {
  '': '全部',
  todo: '待办',
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  archived: '已归档',
}

const STATUS_OPTIONS = ['', 'todo', 'planned', 'in_progress', 'completed', 'archived']
```

注意：CLARITY_OPTIONS 中 `''` 代表无清晰度值的任务（已从复选框列表中过滤掉 `''`，但这类任务在数据库中不存在，所以不影响筛选）。如果存在空 clarity 的任务，需额外处理。

- [ ] **Step 2: TaskTreeView 筛选逻辑适配数组**

在 `task-tree-view.tsx` 的 `load` 函数中（约 line 195-203），替换筛选条件构建：

```typescript
// 之前
if (filterClarity) filters.clarity = filterClarity
if (filterStatus) filters.status = filterStatus

// 之后
if (filterClarity && filterClarity.length > 0) {
  filters.clarity = filterClarity.length === 1 ? filterClarity[0] : filterClarity
}
if (filterStatus && filterStatus.length > 0) {
  filters.status = filterStatus.length === 1 ? filterStatus[0] : filterStatus
}
```

- [ ] **Step 3: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "(thread-list-panel|task-tree-view)" | head -10`
Expected: 无新错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/components/thread-list-panel.tsx frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): [008] 筛选 UI 改为多选复选框 + 筛选逻辑适配数组"
```

---

### Task 4: [009] 页面标题硬编码 + 导航菜单图标/文字调整

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx:118`
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:146-245`

- [ ] **Step 1: 硬编码页面标题**

在 `TaskTreePage.tsx`（约 line 118），替换：

```tsx
// 之前
<PageBanner domainId="tasks" title={title} />

// 之后
<PageBanner domainId="tasks" title="任务树管理" />
```

- [ ] **Step 2: 导入 Folder 图标**

在 `thread-list-panel.tsx`（line 13）：

```typescript
// 之前
import { ListTodo, FolderOpen } from 'lucide-react'

// 之后
import { ListTodo, FolderOpen, Folder } from 'lucide-react'
```

- [ ] **Step 3: "无主线任务"改名为"普通任务" + 图标对比度**

在 `thread-list-panel.tsx`（约 line 166-186）的"无主线任务入口"：

```tsx
// 文字改为"普通任务"
<span className={cn(
  'flex-1 text-sm',
  selectedThreadId === ORPHAN_ID ? 'text-ink font-medium' : 'text-body',
)}>普通任务</span>
```

图标对比度提升（line 176-179）：

```tsx
// 之前
<FolderOpen className={cn(
  'size-4',
  selectedThreadId === ORPHAN_ID ? 'text-ink' : 'text-muted',
)} />

// 之后
<FolderOpen className={cn(
  'size-4',
  selectedThreadId === ORPHAN_ID ? 'text-ink' : 'text-body',
)} />
```

- [ ] **Step 4: 主线列表图标从竖线改为 Folder**

在 `thread-list-panel.tsx`（约 line 212-218），替换竖线 div 为 Folder 图标：

```tsx
// 之前
<div
  className="flex-shrink-0 w-1 h-6 rounded-full border-l-4"
  style={{
    borderColor: thread.color || 'var(--color-border)',
  }}
/>

// 之后
<Folder
  className="size-4 flex-shrink-0"
  style={{ color: thread.color || 'var(--color-text-muted)' }}
/>
```

- [ ] **Step 5: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "(TaskTreePage|thread-list-panel)" | head -10`
Expected: 无新错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "feat(tasks): [009] 页面标题硬编码 + 导航菜单图标优化 + 文字调整"
```

---

### Task 5: [010] 新建时长格式化工具函数

**Files:**
- Create: `frontend/src/lib/format-duration.ts`

- [ ] **Step 1: 创建工具函数文件**

```typescript
/**
 * @file format-duration
 * @brief 时长格式化与解析工具函数
 *
 * 将分钟数与"xx小时xx分钟"格式互相转换。
 * 后端存储统一使用分钟数，UI 层负责显示/输入转换。
 */

/**
 * 将分钟数格式化为中文时长文本
 * @param minutes - 总分钟数
 * @returns 格式化文本（如 "2小时30分钟"、"45分钟"、"1小时"），空值返回空字符串
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分钟`
  if (m === 0) return `${h}小时`
  return `${h}小时${m}分钟`
}

/**
 * 将小时和分钟输入合并为总分钟数
 * @param hours - 小时输入值
 * @param minutes - 分钟输入值
 * @returns 总分钟数（两项均为空或 0 时返回 0）
 */
export function parseDurationToMinutes(hours: string, minutes: string): number {
  const h = parseInt(hours, 10) || 0
  const m = parseInt(minutes, 10) || 0
  return h * 60 + m
}

/**
 * 从总分钟数提取小时部分
 * @param minutes - 总分钟数
 * @returns 小时数字符串（空值返回空字符串）
 */
export function durationHours(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(Math.floor(minutes / 60))
}

/**
 * 从总分钟数提取分钟部分
 * @param minutes - 总分钟数
 * @returns 分钟数字符串（空值返回空字符串）
 */
export function durationMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(minutes % 60)
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/lib/format-duration.ts
git commit -m "feat(tasks): [010] 新建时长格式化工具函数 format-duration"
```

---

### Task 6: [010] TaskEditZone DurationEdit 改为双输入框（小时+分钟）

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:382-459`

- [ ] **Step 1: 添加 import**

在 `task-edit-zone.tsx` 顶部添加：

```typescript
import { formatDuration, parseDurationToMinutes, durationHours, durationMinutes } from '@/lib/format-duration'
```

- [ ] **Step 2: 重写 DurationEdit 组件**

替换整个 `DurationEdit` 函数（约 line 387-459）：

```tsx
/**
 * 预估时长编辑器（小时+分钟双输入框 + 快捷按钮）
 */
function DurationEdit({
  value,
  onSave,
  saving,
}: {
  value?: number
  onSave: (val: number | undefined) => Promise<void>
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draftHours, setDraftHours] = useState(() => durationHours(value))
  const [draftMinutes, setDraftMinutes] = useState(() => durationMinutes(value))

  const handleSave = useCallback(async (overrideH?: string, overrideM?: string) => {
    const h = overrideH ?? draftHours
    const m = overrideM ?? draftMinutes
    const total = parseDurationToMinutes(h, m)
    if (total === (value ?? 0)) { setEditing(false); return }
    await onSave(total > 0 ? total : undefined)
    setEditing(false)
  }, [draftHours, draftMinutes, value, onSave])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraftHours(durationHours(value))
          setDraftMinutes(durationMinutes(value))
          setEditing(true)
        }}
        disabled={saving}
        className="text-xs text-ink cursor-pointer rounded-sm px-1 hover:bg-hover-overlay transition-colors"
        title="点击编辑"
      >
        {value != null ? formatDuration(value) : <span className="text-muted-soft">未设置</span>}
      </button>
    )
  }

  /** 点击快捷选项 */
  const handleQuickPick = (minutes: number) => {
    const h = durationHours(minutes)
    const m = durationMinutes(minutes)
    setDraftHours(h)
    setDraftMinutes(m)
    handleSave(h, m)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min={0}
          value={draftHours}
          onChange={e => setDraftHours(e.target.value)}
          onBlur={() => handleSave()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSave() }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          disabled={saving}
          className="h-7 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          placeholder="0"
        />
        <span className="text-xs text-muted-soft">小时</span>
        <input
          type="number"
          min={0}
          max={59}
          value={draftMinutes}
          onChange={e => setDraftMinutes(e.target.value)}
          onBlur={() => handleSave()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSave() }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          disabled={saving}
          className="h-7 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          placeholder="0"
        />
        <span className="text-xs text-muted-soft">分钟</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {DURATION_QUICK_PICKS.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => handleQuickPick(n)}
            disabled={saving}
            className={cn(
              'rounded-md border border-hairline px-2 py-0.5 text-xs transition-colors',
              'hover:border-primary/40 hover:bg-primary/10',
              value === n && 'border-primary bg-primary/10 text-primary',
            )}
          >
            {formatDuration(n)}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep "task-edit-zone" | head -10`
Expected: 无新错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(tasks): [010] TaskEditZone DurationEdit 改为小时+分钟双输入框"
```

---

### Task 7: [010] TaskCompleteZone 时长双输入框 + 显示格式

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-complete-zone.tsx:69-181`

- [ ] **Step 1: 添加 import**

在 `task-complete-zone.tsx` 顶部添加：

```typescript
import { formatDuration, parseDurationToMinutes, durationHours, durationMinutes } from '@/lib/format-duration'
```

- [ ] **Step 2: CompletedSummary 中改用 formatDuration**

在 `CompletedSummary`（约 line 81-85），替换：

```tsx
// 之前
{task.actualDuration && (
  <div className="flex items-center gap-1.5 text-xs text-ink mb-1">
    <Clock className="size-3 text-muted-soft" />
    实际用时：{task.actualDuration} 分钟
  </div>
)}

// 之后
{task.actualDuration ? (
  <div className="flex items-center gap-1.5 text-xs text-ink mb-1">
    <Clock className="size-3 text-muted-soft" />
    实际用时：{formatDuration(task.actualDuration)}
  </div>
) : null}
```

- [ ] **Step 3: CheckInForm 实际用时改为双输入框**

在 `CheckInForm` 中（约 line 101-140），替换状态和 UI：

```tsx
// 状态初始化改为双值
const [durHours, setDurHours] = useState(() => durationHours(task.estimatedDuration))
const [durMinutes, setDurMinutes] = useState(() => durationMinutes(task.estimatedDuration))

// handleComplete 中的解析
const handleComplete = useCallback(async () => {
  setSaving(true)
  try {
    const total = parseDurationToMinutes(durHours, durMinutes)
    const extraFields: Record<string, unknown> = {}
    if (total > 0) extraFields.actualDuration = total
    const updated = await completeTask(task.id, Object.keys(extraFields).length > 0 ? extraFields : undefined)
    onTaskUpdate(updated)
  } finally {
    setSaving(false)
  }
}, [durHours, durMinutes, task.id, onTaskUpdate])
```

UI 输入区域替换（约 line 127-140）：

```tsx
<div className="flex items-center gap-2">
  <label className="text-xs text-muted-soft w-20 shrink-0">实际用时</label>
  <div className="flex items-center gap-1">
    <input
      type="number"
      min={0}
      value={durHours}
      onChange={e => setDurHours(e.target.value)}
      className="h-8 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
      placeholder="0"
    />
    <span className="text-xs text-muted-soft">小时</span>
    <input
      type="number"
      min={0}
      max={59}
      value={durMinutes}
      onChange={e => setDurMinutes(e.target.value)}
      className="h-8 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
      placeholder="0"
    />
    <span className="text-xs text-muted-soft">分钟</span>
  </div>
</div>
```

- [ ] **Step 4: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep "task-complete-zone" | head -10`
Expected: 无新错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/components/task-complete-zone.tsx
git commit -m "feat(tasks): [010] TaskCompleteZone 时长改为双输入框 + formatDuration 显示"
```

---

### Task 8: [010] 面包屑颜色对比度提升

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx:232-264`

- [ ] **Step 1: 更新面包屑 useMemo 中的颜色类**

在 `task-detail-drawer.tsx` 的 `breadcrumbItems` useMemo 中，替换颜色类：

"任务树"根按钮（约 line 241）：
```tsx
// 之前
className="text-muted hover:text-ink transition-colors shrink-0"
// 之后
className="text-body hover:text-ink transition-colors shrink-0"
```

分隔符 ChevronRight（约 line 248 和 260）：
```tsx
// 之前
className="size-3 text-muted-soft shrink-0"
// 之后
className="size-3 text-muted shrink-0"
```

祖先按钮（约 line 253）：
```tsx
// 之前
className="text-muted hover:text-ink transition-colors truncate max-w-[120px]"
// 之后
className="text-body hover:text-ink transition-colors truncate max-w-[120px]"
```

当前任务文字不变（`text-ink font-medium`）。

- [ ] **Step 2: 验证类型检查**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep "task-detail-drawer" | head -10`
Expected: 无新错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "fix(tasks): [010] 面包屑非当前文字颜色对比度提升 text-muted→text-body"
```
