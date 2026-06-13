# CNUI Surface 规范合规修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 habits、tasks、timebox 三个 Domain 的 11 个 CNUI Surface 组件统一到 UI-DESIGN-SPEC §十一 视觉规范。

**Architecture:** 纯视觉层修正——只改 CSS class 和少量 JSX 结构，不改逻辑。容器从 Card/shadcn 统一为规范 div，按钮 token 统一，补齐缺失的全屏/翻页功能。

**Tech Stack:** React 19, Tailwind CSS 4, TypeScript 5

**设计文档:** `docs/superpowers/specs/2026-06-13-cnui-surface-spec-compliance-design.md`

**规范参考:** `docs/UI-DESIGN-SPEC.md` §十一 (line 567~656)

---

## 文件结构

| 操作 | 文件 | 职责 |
|---|---|---|
| 修改 | `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx` | 习惯批量操作 — 取消按钮补 token |
| 修改 | `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` | 习惯打卡 — 完成/详情按钮 + 取消按钮 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 任务批量操作 — 主操作按钮 token |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 主线批量操作 — 主操作按钮 token |
| 修改 | `frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx` | 习惯创建 — 加容器边框 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 任务创建 — Card→div + 按钮 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx` | 主线创建 — Card→div + 按钮 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx` | 任务拆分 — Card→div + 按钮 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 任务编辑 — 加容器边框 + 按钮 |
| 修改 | `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx` | 任务树 — bg 修正 + done 容器 + 全屏 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx` | 时间盒 — Card→div + 全屏 + 翻页 + 按钮 |

---

### Task 1: 列表操作型 Surface — 按钮样式统一

**Files:**
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx` (line ~204, ~212)
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` (line ~191, ~197, ~222, ~229)
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx` (line ~244, ~251)
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` (line ~229, ~443)

- [ ] **Step 1: 修改 HabitActionPanel 取消按钮**

文件 `HabitActionPanel.tsx`，找到取消按钮（约 line 204）：

```tsx
// 修改前
className="rounded-md border px-3 py-1.5 text-xs"

// 修改后
className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 2: 修改 HabitCheckinPanel 按钮样式**

文件 `HabitCheckinPanel.tsx`，三处修改：

**"完成"按钮**（约 line 191）：
```tsx
// 修改前
className="rounded bg-success px-2 py-1 text-xs text-on-primary hover:bg-success/90"

// 修改后 — 打卡是主操作，使用 primary
className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
```

**"详情"按钮**（约 line 197）：
```tsx
// 修改前
className="rounded bg-muted px-2 py-1 text-xs text-on-primary hover:bg-muted/80"

// 修改后 — 次要操作，使用 outline 风格
className="rounded border border-hairline bg-canvas px-2 py-1 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

**取消按钮**（约 line 222）：
```tsx
// 修改前
className="rounded-md border px-3 py-1.5 text-xs"

// 修改后
className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 3: 修改 TaskActionPanel 主操作按钮**

文件 `TaskActionPanel.tsx`，找到执行按钮（约 line 251）：

```tsx
// 修改前
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors"

// 修改后
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
```

- [ ] **Step 4: 修改 ThreadActionPanel 主操作按钮**

文件 `ThreadActionPanel.tsx`，两处执行按钮（约 line 229 和 line 443），均做相同替换：

```tsx
// 修改前
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors"

// 修改后
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
```

- [ ] **Step 5: TypeScript 验证并提交**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "HabitActionPanel|HabitCheckinPanel|TaskActionPanel|ThreadActionPanel"
# Expected: 无输出（零错误）
```

```bash
git add frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx \
        frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx \
        frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx \
        frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx
git commit -m "fix: 列表操作型 Surface 按钮样式统一到 §11.6 规范 [011]"
```

---

### Task 2: 表单型 Surface — 容器迁移 + 按钮统一

**Files:**
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`

- [ ] **Step 1: 修改 HabitCreationCard — 加容器边框**

文件 `HabitCreationCard.tsx`，外层 div 加规范容器样式：

```tsx
// 修改前（约 line 37）
<div className="w-full max-w-md">

// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">
```

- [ ] **Step 2: 修改 TaskCreationCard — Card→div**

文件 `TaskCreationCard.tsx`：

**移除 Card 相关 import**（约 line 11）：
```tsx
// 修改前
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// 修改后 — 删除此行
```

**Done 态**（约 line 71~78）：
```tsx
// 修改前
<Card className="w-full max-w-md">
  <CardContent className="pt-4 text-center">
    <p className="text-sm text-ink">✅ 任务已创建</p>
  </CardContent>
</Card>

// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4 text-center">
  <p className="text-sm text-ink">✅ 任务已创建</p>
</div>
```

**主表单**（约 line 81~191）：
```tsx
// 修改前
<Card className="w-full max-w-md">
  <CardHeader>
    <CardTitle>创建任务</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* ... 表单内容 ... */}
  </CardContent>
</Card>

// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">
  <div className="mb-3 text-sm font-medium text-ink">创建任务</div>
  <div className="space-y-3">
    {/* ... 表单内容保持不变 ... */}
  </div>
</div>
```

**取消按钮**（约 line 183~185）：
```tsx
// 修改前
className="rounded-md px-3 py-1.5 text-xs text-body/60 hover:text-ink transition-colors"

// 修改后
className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 3: 修改 ThreadCreationCard — Card→div**

文件 `ThreadCreationCard.tsx`，与 TaskCreationCard 同模式：

**移除 import**（约 line 11）：
```tsx
// 删除
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
```

**Done 态**（约 line 57~65）：
```tsx
// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4 text-center">
  <p className="text-sm text-ink">✅ 主线已创建</p>
</div>
```

**主表单**（约 line 68~168）：
```tsx
// Card → div 容器
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">
  <div className="mb-3 text-sm font-medium text-ink">创建主线</div>
  <div className="space-y-3">
    {/* ... 表单内容保持不变 ... */}
  </div>
</div>
```

**取消按钮**（约 line 159~161）：
```tsx
// 修改前
className="rounded-md px-3 py-1.5 text-xs text-body/60 hover:text-ink transition-colors"

// 修改后
className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 4: 修改 TaskSplitCard — Card→div**

文件 `TaskSplitCard.tsx`：

**移除 import**（约 line 10）：
```tsx
// 删除
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
```

**Done 态**（约 line 31~38）：
```tsx
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4 text-center">
  <p className="text-sm text-ink">✅ 拆分请求已提交</p>
</div>
```

**主视图**（约 line 42~80）：
```tsx
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">
  <div className="mb-3 text-sm font-medium text-ink">任务拆分</div>
  <div className="space-y-3">
    {/* ... 内容保持不变 ... */}
  </div>
</div>
```

**关闭按钮**（约 line 72~74）：
```tsx
// 修改前
className="rounded-md px-3 py-1.5 text-xs text-body/60 hover:text-ink transition-colors"

// 修改后
className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 5: 修改 TaskEditCard — 加容器 + 按钮统一**

文件 `TaskEditCard.tsx`：

**Done 态**（约 line 99~103）：
```tsx
// 修改前
<div className="w-full max-w-md text-center py-4">
  <p className="text-sm text-ink">✅ 任务已更新</p>
</div>

// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4 text-center">
  <p className="text-sm text-ink">✅ 任务已更新</p>
</div>
```

**直接编辑模式容器**（约 line 258）：
```tsx
// 修改前
<div className="w-full max-w-md">

// 修改后
<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">
```

**列表模式容器**（约 line 267）：
```tsx
// 修改前
<div className="w-full max-w-lg">

// 修改后
<div className="w-full max-w-lg border border-hairline rounded-lg bg-surface-soft p-4">
```

**保存按钮**（约 line 246，在 renderEditForm 内）：
```tsx
// 修改前
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors"

// 修改后
className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
```

- [ ] **Step 6: TypeScript 验证并提交**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "HabitCreationCard|TaskCreationCard|ThreadCreationCard|TaskSplitCard|TaskEditCard"
# Expected: 无输出
```

```bash
git add frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx \
        frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx \
        frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx \
        frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx \
        frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx
git commit -m "fix: 表单型 Surface 容器迁移 + 按钮统一到 §11 规范 [011]"
```

---

### Task 3: TaskTreeView — 容器 + done 态 + 全屏按钮

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx`

- [ ] **Step 1: 添加 onRequestFullscreen prop**

在 `TaskTreeViewCardProps` 接口（约 line 40~48）中添加：

```tsx
interface TaskTreeViewCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
}
```

在函数参数解构（约 line 446~452）中添加：

```tsx
export function TaskTreeViewCard({
  dataModel,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
  onRequestFullscreen,
}: TaskTreeViewCardProps) {
```

- [ ] **Step 2: 修正容器背景**

找到树形视图主容器（约 line 792）：

```tsx
// 修改前
<div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas">

// 修改后
<div className="w-full max-w-2xl rounded-lg border border-hairline bg-surface-soft">
```

- [ ] **Step 3: 修正 done 态容器**

找到 done 状态渲染（约 line 659~663）：

```tsx
// 修改前
<div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas p-4 text-center">

// 修改后
<div className="w-full max-w-2xl rounded-lg border border-hairline bg-surface-soft p-4 text-center">
```

- [ ] **Step 4: 添加全屏按钮到标题行**

在标题栏（约 line 795~808），在 labels 渲染块内添加全屏按钮：

```tsx
{labels && (
  <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink flex items-center justify-between">
    <span>{labels.title}</span>
    <div className="flex items-center gap-1.5">
      {mode === 'select' && allVisibleTaskIds.length > 0 && (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="text-xs text-primary hover:text-primary-active font-normal transition-colors"
        >
          {selectedIds.size === allVisibleTaskIds.length ? '取消全选' : '全选'}
        </button>
      )}
      {onRequestFullscreen && (
        <button
          type="button"
          onClick={onRequestFullscreen}
          className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
          title="全屏展开"
        >
          ⛶
        </button>
      )}
    </div>
  </div>
)}
```

同样在 edit 模式无 labels 的标题行（约 line 809~813）添加：

```tsx
{mode === 'edit' && !labels && (
  <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink flex items-center justify-between">
    <span>选择要修改的任务</span>
    {onRequestFullscreen && (
      <button
        type="button"
        onClick={onRequestFullscreen}
        className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
        title="全屏展开"
      >
        ⛶
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: 修正按钮 token**

在 TaskTreeView 中的 `text-on-primary` 替换为 `text-primary-foreground`，`disabled:opacity-40` 替换为 `disabled:opacity-50`。涉及以下位置：

- direct-confirm 确认按钮（约 line 690）
- select 模式确认按钮（约 line 978）
- EditForm 保存按钮（约 line 328）
- EditForm 添加子任务按钮（约 line 310）

全部替换规则：
```
text-on-primary → text-primary-foreground
disabled:opacity-40 → disabled:opacity-50
```

- [ ] **Step 6: TypeScript 验证并提交**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "TaskTreeView"
# Expected: 无输出
```

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx
git commit -m "fix: TaskTreeView 容器背景 + 全屏按钮 + 按钮 token 统一 [011]"
```

---

### Task 4: TimeboxList — 全面合规改造

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx`

- [ ] **Step 1: 重写组件**

将整个文件替换为以下内容。核心变更：
- Card → div 规范容器
- 添加 `onRequestFullscreen` prop + 全屏按钮
- 添加翻页支持（标题行 `‹ 1/N ›`）
- 列表项 `border border-hairline rounded-md p-3`
- 主操作按钮 `text-primary-foreground disabled:opacity-50`
- 取消按钮 `border border-hairline text-ink hover:bg-hover-overlay`

```tsx
/**
 * @file TimeboxList
 * @brief 智能编排时间盒列表 Surface
 *
 * CNUI Surface 组件，展示智能编排方案中的时间盒列表
 */

'use client'

import { CnuiButton } from '@/components/cnui/components/Button'

/**
 * 时间盒项
 */
interface TimeboxItem {
  /** 标题 */
  title: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 颜色 */
  color?: string
}

/**
 * 时间盒列表属性
 */
interface TimeboxListProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 是否完成 */
  isDone?: boolean
  /** 是否加载中 */
  isLoading?: boolean
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
}

export function TimeboxList({ dataModel, onDataChange, onConfirm, onCancel, isDone, isLoading, onRequestFullscreen }: TimeboxListProps) {
  const items = (dataModel.items as TimeboxItem[]) ?? []

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    onDataChange({ ...dataModel, items: updated })
  }

  if (isDone) {
    return (
      <div className="w-full max-w-lg border border-hairline rounded-lg bg-surface-soft p-4 text-center">
        <p className="text-sm text-ink">✅ 编排方案已确认</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">智能编排方案 ({items.length} 项)</span>
        <div className="flex items-center gap-1.5">
          {(() => {
            const p = dataModel._pagination as { page: number; totalPages: number } | undefined
            return p && (
              <>
                <button
                  type="button"
                  disabled={p.page <= 1}
                  onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
                  className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="min-w-[2rem] text-center text-xs text-muted">
                  {p.page}/{p.totalPages}
                </span>
                <button
                  type="button"
                  disabled={p.page >= p.totalPages}
                  onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
                  className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
                >
                  ›
                </button>
              </>
            )
          })()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-body/70">暂无时间盒</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-hairline bg-canvas p-3"
              style={{ borderLeftColor: item.color ?? '#6366f1', borderLeftWidth: 4 }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{item.title}</div>
                <div className="text-xs text-body/70">
                  {item.startTime} - {item.endTime}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-xs text-error/70 hover:text-error transition-colors"
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={() => onConfirm(dataModel)}
          disabled={items.length === 0 || isLoading}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
        >
          确认全部
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 验证并提交**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "TimeboxList"
# Expected: 无输出
```

```bash
git add frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx
git commit -m "fix: TimeboxList 全面合规改造 — 容器/翻页/全屏/按钮 [011]"
```

---

### Task 5: 全量 TypeScript 验证

- [ ] **Step 1: 运行完整类型检查**

```bash
cd frontend && npx tsc --noEmit
# Expected: 零错误退出
```

如果有错误，修复后重新运行直到通过。

- [ ] **Step 2: 检查无遗漏的 text-on-primary / disabled:opacity-40**

```bash
grep -rn "text-on-primary\|disabled:opacity-40" frontend/src/domains/*/cnui/
# Expected: 无输出（所有已清理）
```

```bash
grep -rn "text-on-primary\|disabled:opacity-40" frontend/src/components/cnui/components/
# Expected: CnuiButton 使用 shadcn Button，其内部 disabled:opacity-50 已合规，忽略
```

- [ ] **Step 3: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: CNUI Surface 规范合规最终验证 [011]"
```
