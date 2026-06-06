# 任务管理迭代优化（第二批）— 设计文档

**日期**：2026-06-07
**版本**：1.0
**状态**：已确认

---

## 概述

本文档涵盖任务管理模块的三项迭代优化需求，均属于 MVP 阶段 UI 层改动，不涉及 Nexus 核心组件或 USOM 对象变更。

| ID | 需求 | 改动范围 |
|---|---|---|
| [008] | 任务树筛选条件优化 | ThreadListPanel 底部筛选区 + TaskTreeView 筛选逻辑 |
| [009] | 任务树管理页面优化 | TaskTreePage 标题 + ThreadListPanel 导航菜单图标/文字 |
| [010] | 任务 Detail 时长与面包屑优化 | TaskEditZone + TaskCompleteZone + 面包屑颜色 |

**治理合规**：
- 所有改动均在 Domain Plugin 的 Page 组件层，符合宪章 Domain Registration Process 的 Page component data access rules
- 无 USOM 对象变更（`estimatedDuration` / `actualDuration` 仍以分钟存储），无 Repository 接口变更，无 Nexus 组件改动
- 时长格式化仅为 UI 层显示/输入转换，后端存储不变

---

## [008] 任务树筛选条件优化

### 需求

清晰度和状态筛选从"点击关键词切换"改为"复选框多选"，默认全选（归档状态默认不勾选）。

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `thread-list-panel.tsx` | 底部筛选区从标签按钮改为复选框；Props 类型 `filterClarity`/`filterStatus` 从 `string` 改为 `string[]` |
| `TaskTreePage.tsx` | 筛选状态从 `string` 改为 `string[]`；回调类型适配 |
| `task-tree-view.tsx` | 筛选逻辑从 `===` 匹配改为 `includes()` 多值匹配 |

### 数据模型变更

**Props 类型**：

```typescript
// 之前
filterClarity?: string
filterStatus?: string
onFilterChange?: (key: 'clarity' | 'status', value: string) => void

// 之后
filterClarity?: string[]   // 已勾选的清晰度值
filterStatus?: string[]    // 已勾选的状态值
onFilterChange?: (key: 'clarity' | 'status', value: string) => void
```

**初始值**（在 TaskTreePage 中）：

```typescript
const CLARITY_DEFAULT = ['', 'fuzzy', 'scoped', 'actionable']  // 全选（含空串=无清晰度）
const STATUS_DEFAULT = ['todo', 'planned', 'in_progress', 'completed']  // 排除 archived

const [filterClarity, setFilterClarity] = useState<string[]>(CLARITY_DEFAULT)
const [filterStatus, setFilterStatus] = useState<string[]>(STATUS_DEFAULT)
```

### 筛选区 UI

```
清晰度
☑ 模糊  ☑ 有范围  ☑ 可执行

状态
☑ 待办  ☑ 计划中  ☑ 进行中  ☑ 已完成  ☐ 已归档
```

- 使用 `<input type="checkbox">` + `<label>` 替代当前 `<button>` 标签
- 勾选/取消直接修改数组，无需额外确认
- 空数组含义 = 不过滤（等效全选），但 UI 上不允许全部取消（至少保留一个勾选）

### 复选框回调

```typescript
const handleFilterChange = useCallback((key: 'clarity' | 'status', value: string) => {
  const setter = key === 'clarity' ? setFilterClarity : setFilterStatus
  setter(prev => {
    if (prev.includes(value)) {
      // 取消勾选：移除（但不允许清空）
      const next = prev.filter(v => v !== value)
      return next.length === 0 ? prev : next
    } else {
      // 勾选：追加
      return [...prev, value]
    }
  })
}, [])
```

### 筛选逻辑（task-tree-view.tsx）

当前筛选匹配逻辑需要从单值 `===` 改为数组 `includes`：

```typescript
// 之前
if (filterClarity && task.clarity !== filterClarity) continue
if (filterStatus && task.status !== filterStatus) continue

// 之后
if (filterClarity && filterClarity.length > 0 && !filterClarity.includes(task.clarity)) continue
if (filterStatus && filterStatus.length > 0 && !filterStatus.includes(task.status)) continue
```

### 样式规范

- 复选框尺寸：`size-3.5`
- 标签文字：`text-[11px]`，使用 `text-body` 颜色
- 勾选状态：浏览器原生复选框样式，`accent-color: var(--color-primary)`
- 容器布局：`flex flex-wrap gap-x-3 gap-y-1`

### 不改动

- 清晰度/状态的选项值不变
- 后端筛选逻辑不变（前端过滤）
- TaskTreePage 的 `handleFilterChange` 签名不变（value 仍是单个值，由 setter 内部处理数组）

---

## [009] 任务树管理页面优化

### 需求

1. 页面标题显示"任务树管理"（硬编码）
2. 左侧导航菜单优化："无主线任务"改名为"普通任务"；图标对比度调整；主线列表图标从竖线改为文件夹

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `TaskTreePage.tsx` | 标题硬编码为"任务树管理" |
| `thread-list-panel.tsx` | "无主线任务"→"普通任务"；图标对比度提升；主线列表图标替换 |

### 子功能 1 — 页面标题

当前：`<PageBanner domainId="tasks" title={title} />`，`title` 来自路由参数。

改为：

```tsx
<PageBanner domainId="tasks" title="任务树管理" />
```

不再依赖传入的 `title` prop。

### 子功能 2 — 导航菜单图标调整

**"全部任务"入口**（不变）：`ListTodo` 图标

**"普通任务"入口**（原"无主线任务"）：
- 文字：`"无主线任务"` → `"普通任务"`
- 图标：保持 `FolderOpen`，对比度提升
- 未选中态：`text-muted` → `text-body`（更清晰可读）

**主线列表项**：
- 图标：竖线（`w-1 h-6 rounded-full border-l-4`）→ `Folder` 图标
- 颜色：使用主线 `thread.color` 属性（与原竖线相同）
- 未选中态对比度提升：文字 `text-body` 保持不变

### 图标替换实现

```typescript
import { ListTodo, FolderOpen, Folder } from 'lucide-react'

// 主线列表项中
<Folder
  className="size-4 flex-shrink-0"
  style={{ color: thread.color || 'var(--color-text-muted)' }}
/>
```

替代当前的竖线 div：

```typescript
// 删除
<div
  className="flex-shrink-0 w-1 h-6 rounded-full border-l-4"
  style={{ borderColor: thread.color || 'var(--color-border)' }}
/>
```

### 样式规范

- 图标尺寸：`size-4`（与 ListTodo/FolderOpen 一致）
- 主线颜色：`thread.color` 直接作为 `style.color`，确保图标颜色与主线一致
- 未选中态图标：不使用 `text-muted`，改用 `text-body` 或主线自身颜色

---

## [010] 任务 Detail 时长与面包屑优化

### 需求

1. 预估时长 / 实际用时显示/输入改为"xx小时xx分钟"格式，自动转换（如 150 分钟 → 2 小时 30 分钟）
2. 面包屑非当前任务文字颜色过浅，调整对比度

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `lib/format-duration.ts`（新建） | 时长格式化/解析工具函数 |
| `task-edit-zone.tsx` | 预估时长输入改为双输入框（小时+分钟）；快捷选项显示文字调整 |
| `task-complete-zone.tsx` | 实际用时输入改为双输入框；已完成摘要显示格式调整 |
| `task-detail-drawer.tsx` | 面包屑非当前文字颜色提升对比度 |
| `task-tree-view.tsx` | 行内时长显示（如有）统一格式 |

### 子功能 1 — 时长工具函数

新建 `frontend/src/lib/format-duration.ts`：

```typescript
/**
 * 将分钟数格式化为"xx小时xx分钟"文本
 * @param minutes - 总分钟数
 * @returns 格式化文本，如 "2小时30分钟"、"45分钟"、"1小时"
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
 * 将小时和分钟转换为总分钟数
 * @param hours - 小时
 * @param minutes - 分钟
 * @returns 总分钟数（0 如果都为空或 0）
 */
export function parseDurationToMinutes(hours: string, minutes: string): number {
  const h = parseInt(hours, 10) || 0
  const m = parseInt(minutes, 10) || 0
  return h * 60 + m
}

/**
 * 从总分钟数提取小时部分
 */
export function durationHours(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(Math.floor(minutes / 60))
}

/**
 * 从总分钟数提取分钟部分
 */
export function durationMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  return String(minutes % 60)
}
```

### 子功能 2 — TaskEditZone 预估时长输入

当前（`task-edit-zone.tsx`）：单一数字输入框（分钟）+ 快捷选项按钮。

改为**双输入框**：

```
预估时长  [ 2 ] 小时  [ 30 ] 分钟   [30分钟] [1小时] [1.5小时] [2小时]
```

- 两个 `<input type="number">` 并排，中间标注"小时""分钟"
- 保存时调用 `parseDurationToMinutes(hours, minutes)` 转为总分钟数
- 初始值从 `task.estimatedDuration` 用 `durationHours()` / `durationMinutes()` 提取
- 快捷选项（DURATION_QUICK_PICKS）的标签改为 `formatDuration()` 输出：
  - 30 → "30分钟"
  - 60 → "1小时"
  - 90 → "1.5小时"
  - 120 → "2小时"
- 点击快捷选项时，同时填入小时和分钟输入框

### 子功能 3 — TaskCompleteZone 实际用时输入

当前（`task-complete-zone.tsx`）：单一数字输入框（分钟）+ "分钟"后缀。

改为**双输入框**：

```
实际用时  [ 2 ] 小时  [ 30 ] 分钟
```

- `CompletedSummary` 中 `task.actualDuration` 的显示改为 `formatDuration(task.actualDuration)`
- CheckInForm 的输入改为双输入框
- LogForm / ReviewForm 中如有实际用时输入，同样改为双输入框

### 子功能 4 — 面包屑颜色调整

当前（`task-detail-drawer.tsx` 的 `breadcrumbItems` useMemo）：
- 非当前任务链接：`text-muted`
- 分隔符 ChevronRight：`text-muted-soft`

改为：
- 非当前任务链接：`text-body`（更深的可读色，符合 UI-DESIGN-SPEC 的 text-body 令牌）
- 分隔符 ChevronRight：`text-muted`（从 `text-muted-soft` 提升一级）

"任务树"根按钮同样从 `text-muted` 改为 `text-body`。

### 数据存储

**不变**：`estimatedDuration` 和 `actualDuration` 仍以总分钟数存储（`DurationMinutes = number`）。所有转换仅在 UI 层进行。

---

## 实现优先级

建议实现顺序：

1. **[008] 筛选条件优化** — 数据模型变更（string→string[]），其他需求依赖新筛选逻辑
2. **[009] 任务树管理** — 纯 UI 调整，独立
3. **[010] 时长与面包屑** — 涉及新建工具函数 + 多组件改动，放最后

每个需求可独立测试和提交。

---

## 风险与约束

| 风险 | 缓解措施 |
|---|---|
| 筛选类型从 string 变为 string[]，影响 task-tree-view 的过滤逻辑 | 需同步修改 task-tree-view 中所有使用 filterClarity/filterStatus 的地方 |
| 时长双输入框需要同时处理小时和分钟两个字段的状态 | 用 `parseDurationToMinutes` 统一转换，保存时合并为一个值 |
| 归档任务默认不显示，可能导致用户困惑 | 后续可在树顶部添加提示"已隐藏 N 个归档任务"（不在本次范围内） |
| Folder 图标颜色依赖主线 color 属性 | 若 color 为空则 fallback 到 `var(--color-text-muted)` |
