# CN-UI Surface 尺寸约束与全屏展开实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CN-UI Surface 添加翻页、全屏展开、完成态折叠三项交互能力，统一由包装层管控。

**Architecture:** CnuiSurfaceWrapper 拦截 dataModel.items 自动分页，注入 `_pagination` 元数据供子组件渲染翻页指示器；全屏模式通过 shadcn Dialog 覆盖主显示区；完成态由独立组件 CnuiSurfaceDone 处理折叠摘要与只读展开。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui Dialog, Vitest

---

## File Structure

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | `components/cnui/pagination.ts` | 纯函数：分页计算 |
| 新建 | `components/cnui/__tests__/pagination.test.ts` | 分页逻辑测试 |
| 新建 | `components/cnui/CnuiSurfaceDone.tsx` | 完成态：折叠摘要 + 可展开只读 |
| 新建 | `components/cnui/CnuiSurfaceFullscreen.tsx` | 全屏：Dialog 容器 |
| 修改 | `components/cnui/CnuiSurfaceWrapper.tsx` | 核心：集成翻页 + 全屏 + done |
| 修改 | `components/cnui/CnuiRenderer.tsx` | 透传 `onRequestFullscreen` prop |
| 修改 | `domains/habits/cnui/surfaces/HabitActionPanel.tsx` | 标题行加翻页指示器 + ⛶ |
| 修改 | `domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` | 同上 |
| 修改 | `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 同上 |
| 修改 | `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 同上 |
| 修改 | `docs/UI-DESIGN-SPEC.md` | 新增 CN-UI Surface 视觉规范章节 |

所有路径相对于 `frontend/src/`。

---

### Task 1: 分页工具函数 + 测试

**Files:**
- Create: `frontend/src/components/cnui/pagination.ts`
- Create: `frontend/src/components/cnui/__tests__/pagination.test.ts`

- [ ] **Step 1: 创建分页工具函数**

```typescript
/**
 * @file pagination
 * @brief CN-UI Surface 分页工具函数
 *
 * 纯函数，负责列表分页计算，不依赖任何 UI 状态
 */

/** 分页状态元信息 */
export interface PaginationMeta {
  /** 当前页码（1-based） */
  page: number
  /** 总页数 */
  totalPages: number
  /** 总项目数 */
  total: number
}

/** 分页结果 */
export interface PaginateResult<T = unknown> {
  /** 当前页的数据切片 */
  items: T[]
  /** 分页元信息（不超过 pageSize 时为 null） */
  pagination: PaginationMeta | null
}

/**
 * 对数组进行分页切片
 *
 * @param items - 原始数组
 * @param page - 当前页码（1-based，默认 1）
 * @param pageSize - 每页项目数（默认 5）
 * @returns 分页结果
 */
export function paginateItems<T = unknown>(
  items: T[],
  page: number = 1,
  pageSize: number = 5,
): PaginateResult<T> {
  if (items.length <= pageSize) {
    return { items, pagination: null }
  }

  const totalPages = Math.ceil(items.length / pageSize)
  const safePage = Math.max(1, Math.min(page, totalPages))
  const start = (safePage - 1) * pageSize
  const end = start + pageSize

  return {
    items: items.slice(start, end),
    pagination: { page: safePage, totalPages, total: items.length },
  }
}
```

- [ ] **Step 2: 编写分页测试**

```typescript
/**
 * @file pagination.test
 * @brief 分页工具函数测试
 */

import { describe, it, expect } from 'vitest'
import { paginateItems } from '../pagination'

describe('paginateItems', () => {
  it('不超过 pageSize 时不分页', () => {
    const items = [1, 2, 3]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3])
    expect(result.pagination).toBeNull()
  })

  it('刚好等于 pageSize 时也不分页', () => {
    const items = [1, 2, 3, 4, 5]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination).toBeNull()
  })

  it('超过 pageSize 时正确分页', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination).toEqual({ page: 1, totalPages: 2, total: 7 })
  })

  it('第二页返回正确切片', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 2, 5)
    expect(result.items).toEqual([6, 7])
    expect(result.pagination).toEqual({ page: 2, totalPages: 2, total: 7 })
  })

  it('page 超出范围时 clamp 到最后一页', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 99, 5)
    expect(result.items).toEqual([6, 7])
    expect(result.pagination!.page).toBe(2)
  })

  it('page 为 0 或负数时 clamp 到第一页', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const result = paginateItems(items, 0, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination!.page).toBe(1)
  })

  it('空数组返回空结果且不分页', () => {
    const result = paginateItems([], 1, 5)
    expect(result.items).toEqual([])
    expect(result.pagination).toBeNull()
  })

  it('使用默认参数', () => {
    const items = Array.from({ length: 12 }, (_, i) => i)
    const result = paginateItems(items)
    expect(result.items).toHaveLength(5)
    expect(result.pagination!.totalPages).toBe(3)
  })
})
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/cnui/__tests__/pagination.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: 提交**

```bash
cd /home/walker/lifeware
git add frontend/src/components/cnui/pagination.ts frontend/src/components/cnui/__tests__/pagination.test.ts
git commit -m "feat(cnui): 分页工具函数 + 测试"
```

---

### Task 2: CnuiSurfaceDone 组件

**Files:**
- Create: `frontend/src/components/cnui/CnuiSurfaceDone.tsx`

- [ ] **Step 1: 创建完成态组件**

```tsx
/**
 * @file CnuiSurfaceDone
 * @brief CN-UI Surface 完成态组件
 *
 * 折叠摘要 + 点击展开只读详情
 */

'use client'

import { useState } from 'react'
import { CnuiRenderer } from './CnuiRenderer'

/** 完成态摘要数据（由 Surface submit 时写入 dataModel._summary） */
interface SurfaceSummary {
  /** 图标（如 '✅'） */
  icon: string
  /** 摘要文本（如 '已打卡 5 项'） */
  title: string
}

/** CnuiSurfaceDone 组件属性 */
interface CnuiSurfaceDoneProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型（含可选 _summary） */
  dataModel: Record<string, unknown>
  /** 完成状态 */
  state: 'saved' | 'cancelled'
}

export function CnuiSurfaceDone({ surfaceType, dataModel, state }: CnuiSurfaceDoneProps) {
  const [expanded, setExpanded] = useState(false)
  const summary = dataModel._summary as SurfaceSummary | undefined

  const displayText = summary
    ? `${summary.icon} ${summary.title}`
    : state === 'saved'
      ? '✅ 已保存'
      : '❌ 已取消'

  // ── 展开态：只读渲染原始 Surface ────────────────────────────
  if (expanded) {
    return (
      <div className="mt-3 rounded-lg border border-hairline bg-surface-soft">
        <div
          className="flex cursor-pointer items-center justify-between px-4 py-2"
          onClick={() => setExpanded(false)}
        >
          <span className="text-sm text-ink">{displayText}</span>
          <span className="text-xs text-muted">▼ 收起</span>
        </div>
        <div className="max-h-48 overflow-y-auto px-4 pb-4">
          <div className="pointer-events-none opacity-50">
            <CnuiRenderer
              surfaceType={surfaceType as never}
              dataModel={dataModel}
              onDataChange={() => {}}
              onConfirm={() => {}}
              onCancel={() => {}}
              isLoading={false}
              isDone={true}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── 折叠态：单行摘要 ───────────────────────────────────────
  return (
    <div
      className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-hairline bg-surface-soft px-4 py-2 transition-colors hover:bg-hover-overlay"
      onClick={() => setExpanded(true)}
    >
      <span className="text-sm text-ink">{displayText}</span>
      <span className="text-xs text-muted">▶</span>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/CnuiSurfaceDone.tsx
git commit -m "feat(cnui): 完成态组件 — 折叠摘要 + 可展开只读"
```

---

### Task 3: CnuiSurfaceFullscreen 组件

**Files:**
- Create: `frontend/src/components/cnui/CnuiSurfaceFullscreen.tsx`

- [ ] **Step 1: 创建全屏容器组件**

```tsx
/**
 * @file CnuiSurfaceFullscreen
 * @brief CN-UI Surface 全屏展开容器
 *
 * 桌面端：Dialog 覆盖主显示区
 * 移动端：Dialog 全屏
 */

'use client'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

/** 全屏容器属性 */
interface CnuiSurfaceFullscreenProps {
  /** 是否打开 */
  open: boolean
  /** 标题 */
  title: string
  /** 关闭回调 */
  onClose: () => void
  /** 子组件（Surface 内容） */
  children: React.ReactNode
}

export function CnuiSurfaceFullscreen({
  open,
  title,
  onClose,
  children,
}: CnuiSurfaceFullscreenProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="
          flex flex-col gap-0 p-0
          w-full max-w-3xl
          h-[85vh] max-h-[85vh]
          sm:max-w-3xl
        "
      >
        {/* ── 顶部栏 ─────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-primary hover:text-primary-active transition-colors"
          >
            ← 返回对话
          </button>
          <DialogTitle className="text-sm font-medium text-ink">
            {title}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── 内容区：全量展示 + 滚动 ─────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/CnuiSurfaceFullscreen.tsx
git commit -m "feat(cnui): 全屏展开容器组件"
```

---

### Task 4: 重构 CnuiSurfaceWrapper

**Files:**
- Modify: `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx`

这是核心变更。完整重写该文件。

- [ ] **Step 1: 重写 CnuiSurfaceWrapper**

```tsx
/**
 * @file CnuiSurfaceWrapper
 * @brief CN-UI 动作面包装器组件
 *
 * 包装 CN-UI 渲染器，处理：
 * - 翻页：拦截 dataModel.items 自动分页
 * - 全屏：Dialog 覆盖主显示区
 * - 完成态：折叠摘要 + 可展开只读
 * - 生命周期状态、数据快照和验证错误
 */

'use client'

import { useState, useCallback } from 'react'
import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import { CnuiSurfaceDone } from './CnuiSurfaceDone'
import { CnuiSurfaceFullscreen } from './CnuiSurfaceFullscreen'
import { paginateItems } from './pagination'
import type { PaginationMeta } from './pagination'
import type { CnuiLifecycleState, CnuiLifecycleActions } from './use-cnui-lifecycle'

/** CnuiSurfaceWrapper 组件属性 */
interface CnuiSurfaceWrapperProps {
  /** 动作面 ID */
  surfaceId: string
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 动作面类型 */
  surfaceType: string
  /** 数据快照 */
  dataSnapshot: Record<string, unknown> | undefined
  /** 生命周期状态 */
  lifecycleState: CnuiLifecycleState
  /** 生命周期操作 */
  lifecycleActions: CnuiLifecycleActions
  /** 列表数据字段名（默认 'items'） */
  itemsKey?: string
  /** 每页项目数（默认 5） */
  pageSize?: number
  /** 是否允许展开到全屏（默认 true） */
  expandable?: boolean
}

export function CnuiSurfaceWrapper({
  surfaceId,
  domainId,
  action,
  surfaceType,
  dataSnapshot,
  lifecycleState,
  lifecycleActions,
  itemsKey = 'items',
  pageSize = 5,
  expandable = true,
}: CnuiSurfaceWrapperProps) {
  const state = lifecycleState.surfaceStates[surfaceId] ?? 'active'
  const rawData = lifecycleState.surfaceData[surfaceId] ?? dataSnapshot ?? {}
  const isLoading = lifecycleState.submittingId === surfaceId
  const errors = lifecycleState.validationErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  // ── 翻页状态 ──────────────────────────────────────────────
  const [page, setPage] = useState(1)
  // ── 全屏状态 ──────────────────────────────────────────────
  const [fullscreen, setFullscreen] = useState(false)

  // ── 分页计算 ──────────────────────────────────────────────
  const items = rawData[itemsKey]
  const itemsArray = Array.isArray(items) ? items : []
  const { items: paginatedItems, pagination } = paginateItems(itemsArray, page, pageSize)
  // 构建分页后的 dataModel：替换 items 为当前页切片，注入 _pagination
  const dataModel: Record<string, unknown> = pagination
    ? { ...rawData, [itemsKey]: paginatedItems, _pagination: pagination }
    : rawData

  // 全屏模式：使用原始 dataModel（不分页）
  const fullscreenDataModel = rawData

  // ── onDataChange 拦截 ─────────────────────────────────────
  const handleDataChange = useCallback(
    (d: Record<string, unknown>) => {
      // 拦截翻页请求
      if (d._page !== undefined) {
        setPage(d._page as number)
        return
      }
      lifecycleActions.updateData(surfaceId, d)
    },
    [lifecycleActions, surfaceId],
  )

  // ── 全屏按钮回调（注入 dataModel 供 Surface 读取） ────────
  const requestFullscreen = useCallback(() => setFullscreen(true), [])

  // ── 完成态 ────────────────────────────────────────────────
  if (isDone) {
    return <CnuiSurfaceDone surfaceType={surfaceType} dataModel={rawData} state={state} />
  }

  // ── 活跃态 ────────────────────────────────────────────────
  return (
    <>
      <div className="mt-3 max-h-[65vh] overflow-hidden rounded-lg border border-hairline bg-surface-soft p-4">
        {errors && errors.length > 0 && (
          <div className="mb-3 rounded-md border border-error bg-error-soft px-3 py-2 text-sm text-error">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        <CnuiRenderer
          surfaceType={surfaceType as never}
          dataModel={dataModel}
          onDataChange={handleDataChange}
          onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
          onCancel={() => lifecycleActions.requestCancel(surfaceId)}
          isLoading={isLoading}
          isDone={false}
          onRequestFullscreen={expandable ? requestFullscreen : undefined}
        />
      </div>

      {/* ── 全屏 Dialog ──────────────────────────────────── */}
      {expandable && fullscreen && (
        <CnuiSurfaceFullscreen
          open={fullscreen}
          title={String(rawData._title ?? action)}
          onClose={() => setFullscreen(false)}
        >
          <CnuiRenderer
            surfaceType={surfaceType as never}
            dataModel={fullscreenDataModel}
            onDataChange={(d) => lifecycleActions.updateData(surfaceId, d)}
            onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
            onCancel={() => lifecycleActions.requestCancel(surfaceId)}
            isLoading={isLoading}
            isDone={false}
            onRequestFullscreen={undefined}
          />
        </CnuiSurfaceFullscreen>
      )}

      {/* ── 确认对话框 ───────────────────────────────────── */}
      {lifecycleState.confirmDialog.surfaceId === surfaceId && (
        <CnuiConfirmDialog
          open={lifecycleState.confirmDialog.open}
          title={lifecycleState.confirmDialog.title}
          message={lifecycleState.confirmDialog.message}
          onConfirm={lifecycleActions.confirmDialogAction}
          onCancel={lifecycleActions.dismissDialog}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: 运行构建确认无类型错误**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 无与 CnuiSurfaceWrapper 相关的错误（可能有 CnuiRenderer 的 `onRequestFullscreen` prop 报错，下一个 Task 修复）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/cnui/CnuiSurfaceWrapper.tsx
git commit -m "feat(cnui): CnuiSurfaceWrapper 集成翻页 + 全屏 + done 态"
```

---

### Task 5: 扩展 CnuiRenderer — 透传 onRequestFullscreen

**Files:**
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx`

- [ ] **Step 1: 给 CnuiRenderer 添加 onRequestFullscreen prop**

在 `CnuiRendererProps` 接口末尾添加：

```typescript
  /** 请求全屏展开回调 */
  onRequestFullscreen?: () => void
```

在 `CnuiRenderer` 函数签名中解构添加 `onRequestFullscreen`：

```typescript
export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, onRequestFullscreen }: CnuiRendererProps) {
```

在 `<Component>` 渲染中添加透传：

```tsx
  return (
    <Component
      surfaceType={surfaceType}
      dataModel={dataModel}
      onDataChange={onDataChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      isDone={isDone}
      onRequestFullscreen={onRequestFullscreen}
    />
  )
```

- [ ] **Step 2: 运行类型检查**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep -i "CnuiRenderer\|onRequestFullscreen" | head -10`
Expected: 无 CnuiRenderer 相关错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/cnui/CnuiRenderer.tsx
git commit -m "feat(cnui): CnuiRenderer 透传 onRequestFullscreen"
```

---

### Task 6: 更新 HabitActionPanel — 翻页指示器 + ⛶

**Files:**
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx`

- [ ] **Step 1: 添加翻页指示器 + 全屏按钮到标题行**

在 Props 接口末尾添加：

```typescript
  /** 请求全屏展开回调 */
  onRequestFullscreen?: () => void
```

在函数签名中解构添加 `onRequestFullscreen`。

在 `return` 中，将标题 div（约 L96）：

```tsx
<div className="mb-3 text-sm font-medium text-ink">{labels.title}</div>
```

替换为：

```tsx
<div className="mb-3 flex items-center justify-between">
  <span className="text-sm font-medium text-ink">{labels.title}</span>
  <div className="flex items-center gap-1.5">
    {dataModel._pagination && (
      <>
        <button
          type="button"
          disabled={dataModel._pagination.page <= 1}
          onClick={() => onDataChange({ ...dataModel, _page: (dataModel._pagination!.page as number) - 1 })}
          className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
        >
          ‹
        </button>
        <span className="min-w-[2rem] text-center text-xs text-muted">
          {dataModel._pagination.page}/{dataModel._pagination.totalPages}
        </span>
        <button
          type="button"
          disabled={dataModel._pagination.page >= dataModel._pagination.totalPages}
          onClick={() => onDataChange({ ...dataModel, _page: (dataModel._pagination!.page as number) + 1 })}
          className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
        >
          ›
        </button>
      </>
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
```

- [ ] **Step 2: 验证无类型错误**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep HabitActionPanel | head -5`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx
git commit -m "feat(cnui): HabitActionPanel 添加翻页指示器 + 全屏按钮"
```

---

### Task 7: 更新 HabitCheckinPanel — 翻页指示器 + ⛶

**Files:**
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx`

- [ ] **Step 1: 添加翻页指示器 + 全屏按钮**

与 Task 6 完全相同的模式：

1. Props 接口添加 `onRequestFullscreen?: () => void`
2. 函数签名解构添加 `onRequestFullscreen`
3. 标题 div（约 L100-102）替换为与 Task 6 相同的 flex 布局

注意：此组件的标题是动态文本 `今日打卡 ({completed.length}/{items.length})`，保持不变，只是在外面包一层 flex 布局并在右侧添加控件。

- [ ] **Step 2: 验证 + 提交**

```bash
git add frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx
git commit -m "feat(cnui): HabitCheckinPanel 添加翻页指示器 + 全屏按钮"
```

---

### Task 8: 更新 TaskActionPanel — 翻页指示器 + ⛶

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`

- [ ] **Step 1: 添加翻页指示器 + 全屏按钮**

与 Task 6 完全相同的模式（标题行 `labels.title` + flex 右侧控件）。

1. Props 接口添加 `onRequestFullscreen?: () => void`
2. 函数签名解构添加 `onRequestFullscreen`
3. 标题 div 替换为 flex 布局 + 控件

注意：TaskActionPanel 有多个渲染分支（空列表、单操作、多操作）。标题行出现在每个分支中，需要找到所有标题行并统一修改。

- [ ] **Step 2: 验证 + 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx
git commit -m "feat(cnui): TaskActionPanel 添加翻页指示器 + 全屏按钮"
```

---

### Task 9: 更新 ThreadActionPanel — 翻页指示器 + ⛶

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx`

- [ ] **Step 1: 添加翻页指示器 + 全屏按钮**

与 Task 6 完全相同的模式。

1. Props 接口添加 `onRequestFullscreen?: () => void`
2. 函数签名解构添加 `onRequestFullscreen`
3. 标题行（可能出现在多个渲染分支中）统一替换

注意：ThreadActionPanel 有多个分支（空列表、选择目标、确认），每个有标题行的分支都需要修改。

- [ ] **Step 2: 验证 + 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx
git commit -m "feat(cnui): ThreadActionPanel 添加翻页指示器 + 全屏按钮"
```

---

### Task 10: 更新 UI-DESIGN-SPEC.md — 新增 CN-UI Surface 视觉规范

**Files:**
- Modify: `docs/UI-DESIGN-SPEC.md`

- [ ] **Step 1: 在文档末尾（§十之后）新增 §十一「CN-UI Surface 视觉规范」**

章节内容（使用项目已有的设计令牌和 Tailwind 类名）：

```markdown
## 十一、CN-UI Surface 视觉规范

### 11.1 容器样式

| 属性 | 值 | Tailwind 类 |
|---|---|---|
| 边框 | `border-hairline` | `border border-hairline` |
| 圆角 | 8px | `rounded-lg` |
| 背景 | `bg-surface-soft` | `bg-surface-soft` |
| 内边距 | 16px | `p-4` |
| 高度上限（活跃态） | 65vh | `max-h-[65vh]` |
| 溢出 | 隐藏（翻页处理） | `overflow-hidden` |

### 11.2 标题行

Surface 标题使用 `text-sm font-medium text-ink`，与右侧控件通过 `flex items-center justify-between` 同行布局。

```
┌──────────────────────────────────────────────┐
│ [标题文本]          [‹ 1/3 ›] [⛶]            │
└──────────────────────────────────────────────┘
```

### 11.3 翻页控件

仅当列表项超过 `pageSize`（默认 5）时显示。

| 元素 | 尺寸 | 样式 |
|---|---|---|
| ‹ / › 按钮 | 20×20px (`size-5`) | `rounded border border-hairline bg-canvas text-xs text-ink` |
| 页码文字 | `min-w-[2rem]` | `text-xs text-muted` 居中 |
| disabled 态 | — | `disabled:opacity-40` |

### 11.4 全屏按钮（⛶）

所有 Surface 通用，标题行最右侧。

| 属性 | 值 |
|---|---|
| 尺寸 | 22×22px (`size-[22px]`) |
| 边框 | `border border-primary` |
| 文字色 | `text-primary` |
| hover | `hover:bg-primary/10 transition-colors` |
| 无全屏功能时 | 不渲染（`onRequestFullscreen` 为 undefined） |

### 11.5 列表项

| 状态 | 样式 |
|---|---|
| 默认 | `rounded-md border p-3` |
| 选中 | `border-primary/40 bg-primary/10` |
| 间距 | `gap-2` |
| 分隔线 | `border-b border-hairline-soft` |

### 11.6 操作按钮

| 按钮 | 样式 |
|---|---|
| 主操作（确认/打卡等） | `bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-xs font-medium` |
| 取消 | `rounded-md border border-hairline px-3 py-1.5 text-xs` |
| disabled | `disabled:opacity-50` |

### 11.7 完成态（Done）

| 状态 | 样式 |
|---|---|
| 折叠 | `rounded-lg border border-hairline bg-surface-soft px-4 py-2`，单行，`▶` 展开 |
| 展开 | 同容器样式 + `max-h-48 overflow-y-auto`，`▼ 收起` |
| 只读遮罩 | `pointer-events-none opacity-50` |
| hover（折叠态） | `hover:bg-hover-overlay transition-colors` |

### 11.8 全屏模式

| 属性 | 桌面端 | 移动端 |
|---|---|---|
| 容器 | Dialog，`max-w-3xl`，`h-[85vh]` | Dialog，全屏 |
| 顶部栏 | `border-b border-hairline px-4 py-3` | 同左 |
| 返回按钮 | `text-sm text-primary` | 同左 |
| 内容区 | `flex-1 overflow-y-auto p-4`，全量展示 | 同左 |
| 列表展示 | 全量 + 滚动（不翻页） | 同左 |

### 11.9 高度约束 CSS 变量

| 令牌 | 值 | 用途 |
|---|---|---|
| `--cnui-inline-max-h` | `65vh` | 对话内活跃态上限 |
| `--cnui-done-expanded-max-h` | `12rem` | 完成态展开上限 |
```

- [ ] **Step 2: 更新文档版本号**

在文件头部更新版本号（`v1.2` → `v1.3`）和更新日期为 `2026-06-13`。

- [ ] **Step 3: 提交**

```bash
git add docs/UI-DESIGN-SPEC.md
git commit -m "docs: UI-DESIGN-SPEC 新增 §十一 CN-UI Surface 视觉规范"
```

---

### Task 11: 集成验证

- [ ] **Step 1: 运行完整类型检查**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 运行分页测试**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/cnui/__tests__/pagination.test.ts`
Expected: 全部通过

- [ ] **Step 3: 运行开发服务器，手动验证**

Run: `cd /home/walker/lifeware/frontend && npm run dev`

验证项：
1. 打开 AI 对话面板，触发一个列表型 Surface（如打卡面板）
2. 列表超过 5 项时，显示 `‹ 1/N ›` 翻页控件
3. 点击翻页控件可切换页面，已选项不丢失
4. 点击 `⛶` 进入全屏，列表全量展示 + 可滚动
5. 点击「← 返回对话」退出全屏，数据保留
6. 提交 Surface 后，显示折叠摘要行
7. 点击摘要行展开只读详情，再点击收起

- [ ] **Step 4: 提交最终状态**

如有手动修复，提交：

```bash
git add -A
git commit -m "fix(cnui): 集成验证修复"
```
