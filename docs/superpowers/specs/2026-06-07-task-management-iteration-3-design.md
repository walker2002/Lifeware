# 任务管理迭代优化（第三批）— 设计文档

**日期**：2026-06-07
**版本**：1.0
**状态**：待审批

---

## 概述

本文档涵盖任务管理模块的两项 UI 迭代优化，均属于 MVP 阶段 Domain Plugin Page 组件层改动。

| ID | 需求 | 改动范围 |
|---|---|---|
| [011] | 任务树筛选栏重构 | 新建 TaskFilterBar + TaskTreeView 搜索/排序 + TaskEditZone 开始时间 |
| [012] | 操作按钮优化 | 任务树/主线列表行内操作 + Detail 手动保存模式 |

**治理合规**：
- 所有改动均在 Domain Plugin 的 Page 组件层，符合宪章 Page component data access rules
- `startDate`/`endDate` 已存在于 DB schema（`tasks.start_date`/`tasks.end_date`）和 USOM `Task` 类型（`startDate?: DateOnly`/`endDate?: DateOnly`），无需新增字段或迁移
- 搜索和排序为前端操作，不涉及 Repository 接口变更或 Nexus 组件改动
- 行内操作的归档/删除调用已有 Server Action，与抽屉内按钮逻辑一致

---

## [011] 任务树筛选栏重构

### 需求

将筛选条件从左侧面板底部移到页面顶部（标题下方），新增搜索框和排序功能，UI 从复选框改为文字按钮。

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-filter-bar.tsx`（新建） | 顶部筛选栏组件：搜索框 + 清晰度/状态文字按钮 + 排序下拉 |
| `TaskTreePage.tsx` | 新增 `searchQuery`/`sortBy` 状态；渲染 TaskFilterBar；ThreadListPanel 移除筛选 props |
| `thread-list-panel.tsx` | 删除底部筛选区 footer；Props 移除 `filterClarity`/`filterStatus`/`onFilterChange` |
| `task-tree-view.tsx` | 新增 `searchQuery`/`sortBy` props；内部搜索过滤 + 排序 |
| `task-edit-zone.tsx` | 属性网格新增"开始时间"（startDate）日期输入 |

### 子功能 1 — TaskFilterBar 组件

**Props**：

```typescript
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
  sortBy: 'title' | 'startDate' | 'endDate'
  /** 排序字段变更回调 */
  onSortByChange: (sortBy: 'title' | 'startDate' | 'endDate') => void
}
```

**UI 布局**：

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 搜索任务...]                               排序: [名称 ▼]  │
│ 清晰度: [模糊] [有范围] [可执行]                                 │
│ 状态:   [待办] [计划中] [进行中] [已完成] [已归档]              │
└─────────────────────────────────────────────────────────────────┘
```

- 容器：`px-4 py-3 border-b border-hairline bg-surface-soft`
- 第一行：搜索框（flex-1）+ 排序下拉（右侧）
- 第二行：清晰度标签组
- 第三行：状态标签组

**搜索框**：

- 左侧 `Search` 图标（`lucide-react`）
- 输入框：`bg-canvas border border-hairline rounded-md h-8 text-xs`
- 输入时实时触发 `onSearchChange`（无防抖，任务量在客户端可控范围内）

**文字按钮**：

- 未选中：`bg-canvas text-body border border-hairline rounded px-2.5 py-1 text-xs cursor-pointer hover:bg-hover-overlay`
- 选中：`bg-ink text-on-primary rounded px-2.5 py-1 text-xs cursor-pointer`
- 点击切换选中/取消，不允许全部取消（至少保留一个）
- 归档状态默认不勾选

**排序下拉**：

- `<select>` 原生下拉，样式与现有 select 一致
- 选项：名称（title）、开始时间（startDate）、结束时间（endDate）
- 默认值：名称

### 子功能 2 — TaskTreePage 状态调整

**新增状态**：

```typescript
const [searchQuery, setSearchQuery] = useState('')
const [sortBy, setSortBy] = useState<'title' | 'startDate' | 'endDate'>('title')
```

**渲染位置**：在 `header` 之后、`main content` 之前插入 `<TaskFilterBar />`：

```tsx
<header>...</header>
<TaskFilterBar
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  filterClarity={filterClarity}
  filterStatus={filterStatus}
  onFilterChange={handleFilterChange}
  sortBy={sortBy}
  onSortByChange={setSortBy}
/>
<div className="flex flex-1 overflow-hidden relative">...</div>
```

**ThreadListPanel 清理**：
- Props 移除 `filterClarity`、`filterStatus`、`onFilterChange`
- 删除底部 `<footer>` 筛选区域及其相关常量（`CLARITY_LABELS`/`STATUS_LABELS` 移至 TaskFilterBar）

### 子功能 3 — TaskTreeView 搜索与排序

**新增 Props**：

```typescript
/** 搜索关键词（匹配标题和描述） */
searchQuery?: string
/** 排序字段 */
sortBy?: 'title' | 'startDate' | 'endDate'
```

**搜索逻辑**：

对树形数据做递归过滤：
- 叶子节点：`task.title.toLowerCase().includes(q) || (task.description?.toLowerCase().includes(q))`
- 非叶子节点：自身匹配或任意子节点匹配则保留
- 匹配的节点及其所有祖先都保留，保证树结构完整

**排序逻辑**：

- 顶层任务按 `sortBy` 指定字段排序
- `title`：按 `localeCompare` 升序
- `startDate`/`endDate`：按日期升序，空值排末尾
- 子任务排序仅在展开的同一父节点下生效

### 子功能 4 — TaskEditZone 新增"开始时间"

在属性网格中"截止日期"之前新增"开始时间"字段：

```tsx
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

`startDate` 的 DB 列（`start_date`）和 USOM 字段（`startDate?: DateOnly`）均已存在，无需数据库变更。

### 数据模型变更

**无**：`startDate`/`endDate` 已存在于 DB schema 和 USOM 类型。

### 不改动

- Repository 接口不变（前端筛选/排序）
- Nexus 组件不变
- 后端 API 不变（搜索不做 ILIKE 查询）

---

## [012] 操作按钮优化

### 需求

1. 任务树行和主线列表项悬停显示编辑/归档/删除操作图标
2. Detail 抽屉改为手动保存模式，移除底部归档/彻底删除按钮
3. 检查新增/保存是否走 Nexus 链路

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-tree-view.tsx` | TaskTreeRow 行右侧悬停显示操作图标 |
| `thread-list-panel.tsx` | 主线列表项悬停显示操作图标 |
| `task-edit-zone.tsx` | 从即改即存改为 draft 批量保存模式 |
| `task-detail-drawer.tsx` | 移除底部归档/删除按钮；新增保存按钮 |

### 子功能 1 — 任务树行内操作

**交互**：行悬停时右侧显示图标组，使用 `opacity-0 group-hover:opacity-100 transition-opacity`。

**图标定义**：

| 操作 | 图标 | 显示条件 | 行为 |
|---|---|---|---|
| 编辑 | `Pencil` (size-3.5) | 始终 | 调用 `onOpenTaskDetail(taskId)` |
| 归档 | `Archive` (size-3.5) | status ≠ completed 且 ≠ archived | 调用 `archiveTask(taskId)` + 刷新 |
| 删除 | `Trash2` (size-3.5) | status = todo 且 childCount = 0 | 弹出确认后调用 `deleteTask(taskId)` + 刷新 |

**样式**：
- 图标颜色：`text-muted hover:text-ink`
- 容器：`flex items-center gap-0.5 shrink-0`
- 删除确认：复用已有的 `AlertDialog` 模式

### 子功能 2 — 主线列表行内操作

**交互**：与任务树一致，悬停显示图标组。

| 操作 | 图标 | 行为 |
|---|---|---|
| 编辑 | `Pencil` (size-3.5) | 调用 `onOpenThreadDetail(threadId)` |
| 归档 | `Archive` (size-3.5) | 调用归档主线 Server Action + 刷新 |
| 删除 | `Trash2` (size-3.5) | 确认后调用删除主线 Server Action + 刷新 |

**注意**：需确认主线归档/删除的 Server Action 是否已存在。若不存在，需新增。

### 子功能 3 — Detail 抽屉手动保存

**TaskEditZone 改造**：

当前每个字段 `onBlur` 调用 `saveField`（即改即存）。改为 draft 模式：

```typescript
/** 变更字段草稿（key=字段名, value=新值） */
const [draft, setDraft] = useState<Partial<Record<string, unknown>>>({})
const hasChanges = Object.keys(draft).length > 0

/** 字段变更回调 — 更新 draft 而非直接保存 */
const updateDraft = useCallback((field: string, value: unknown) => {
  setDraft(prev => ({ ...prev, [field]: value }))
  onDirtyChange?.(true)
}, [onDirtyChange])

/** 批量保存 — 遍历 draft 提交所有变更字段 */
const saveAll = useCallback(async () => {
  if (Object.keys(draft).length === 0) return
  // 合并所有变更字段到一次 updateTask 调用
  const updated = await updateTask(task.id, draft)
  setDraft({})
  onTaskUpdate(updated)
  onDirtyChange?.(false)
}, [draft, task.id, onTaskUpdate, onDirtyChange])
```

各字段的 `onChange`/`onSave` 改为调用 `updateDraft` 而非 `saveField`。底部新增"保存"按钮：

```tsx
<button
  type="button"
  onClick={saveAll}
  disabled={!hasChanges || saving}
  className="h-9 w-full rounded-md bg-primary text-on-primary ..."
>
  保存修改
</button>
```

**TaskDetailDrawer 改造**：

- 移除底部操作栏中的"归档"和"彻底删除"按钮
- 底部仅保留"关闭"按钮
- 保存按钮在 TaskEditZone 内部（紧跟编辑区域下方）
- 已有的 `hasUnsavedChanges` 拦截逻辑（切换任务/关闭时弹出确认框）保持不变，对接新的 draft 状态

### 子功能 4 — Nexus 链路检查

**当前状态**：
- `updateTask`/`deleteTask`/`archiveTask` 为 Server Action，直接调用 Repository 写入
- 按宪章 Page component data access rules，写入操作应走 `PrebuiltIntent` → Nexus 链路

**处理方式**：
- 本次迭代保持现有直写模式（改动 Nexus 链路远超 UI 迭代范围）
- 在相关 Server Action 中标注 `// TODO: 迁移至 Nexus PrebuiltIntent 链路`
- Nexus 链路迁移作为独立技术债跟踪项

---

## 实现优先级

建议实现顺序：

1. **[011] 筛选栏重构** — 新建 TaskFilterBar + 移除旧筛选 + 搜索/排序 + 开始时间字段
2. **[012] 操作按钮优化** — 行内操作 + Detail 手动保存改造

[011] 先行，因为筛选栏的改动会影响页面布局，后续 [012] 的行内操作按钮在同一布局上开发。

---

## 风险与约束

| 风险 | 缓解措施 |
|---|---|
| 筛选从左侧移到顶部，移动端布局需适配 | TaskFilterBar 使用 `flex-wrap`，小屏自动折行 |
| 行内删除操作需二次确认 | 复用 AlertDialog 模式，防止误操作 |
| TaskEditZone 从即改即存改为 draft 模式，InlineEdit/InlineTextarea 子组件需适配 | draft 模式下子组件只更新本地状态，不触发 saveField |
| 客户端搜索/排序在任务量极大时可能有性能问题 | MVP 阶段可接受，后续可引入虚拟滚动或分页 |
| 写入操作未走 Nexus 链路 | 标注 TODO，独立迭代处理 |
