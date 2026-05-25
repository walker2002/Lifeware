# Habits View Routes 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 habits 域实现 `/habits`（习惯列表）和 `/habits/templates`（模板管理）两个页面路由，提供完整 CRUD 管理能力和页面级脏状态追踪。

**Architecture:** Notion 风格单页布局 + 侧边抽屉表单。读操作直接走 Repository（`getHabits` server action），写操作通过 `submitHabitIntent` / `updateHabitStatus` 等 server action 进入 Nexus 链（Intent Engine → Rule Engine → State Machine）。页面级脏状态模型：`idle → dirty → submitting → idle`，退出编辑时提供三选一确认弹窗。最大程度复用已有组件，仅新增 2 个 prop（`onDirtyChange`、`onSubmitError`）。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui (Sheet, AlertDialog, Button, Card 等)

---

## 文件结构总览

```
新建 (4):
  frontend/src/domains/habits/pages/HabitListPage.tsx     — 习惯列表页（~350 行）
  frontend/src/domains/habits/pages/HabitTemplatePage.tsx  — 模板管理页（~120 行）
  frontend/src/app/habits/page.tsx                          — Thin shell 路由
  frontend/src/app/habits/templates/page.tsx                — Thin shell 路由

修改 (5):
  frontend/src/domains/habits/manifest.yaml                 — view_routes +2
  frontend/src/domains/habits/components/habit-form.tsx      — +onDirtyChange prop
  frontend/src/domains/habits/components/habit-template-form.tsx — +onDirtyChange prop
  frontend/src/domains/habits/components/habit-template-manager.tsx — +onDirtyChange, +onSubmitError props
  frontend/src/domains/habits/components/index.ts           — +pages 导出

删除 (1):
  frontend/src/hooks/use-habits.ts                          — 被 Page 直读替代
```

---

### Task 1: 修改 manifest.yaml — 注册 view_routes

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml:199-203`

- [ ] **Step 1: 在 view_routes 区块新增 view_list 和 view_templates**

将 `manifest.yaml` 第 199-203 行的 `view_routes` 区块从：

```yaml
view_routes:
  createHabit:
    component: domains/habits/pages/HabitFormPage
    params:
      mode: create
```

修改为：

```yaml
view_routes:
  createHabit:
    component: domains/habits/pages/HabitFormPage
    params:
      mode: create
  view_list:
    component: domains/habits/pages/HabitListPage
  view_templates:
    component: domains/habits/pages/HabitTemplatePage
```

- [ ] **Step 2: 验证 YAML 语法**

```bash
cd frontend && node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('src/domains/habits/manifest.yaml','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/manifest.yaml
git commit -m "feat(habits): register view_list and view_templates in manifest view_routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 修改 habit-form.tsx — 新增 onDirtyChange prop

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-form.tsx:24-33`（接口）、`:65`（组件签名）、`:109`（handleSubmit）

- [ ] **Step 1: 在 HabitFormProps 接口中新增 onDirtyChange prop**

修改 `habit-form.tsx` 第 24-33 行：

```typescript
interface HabitFormProps {
  initial?: Partial<HabitFormFields>
  onSubmit: (fields: HabitFormFields) => void
  onCancel: () => void
  isLoading?: boolean
  /** 通知父组件表单已修改（用于页面级脏状态追踪） */
  onDirtyChange?: (isDirty: boolean) => void
}
```

- [ ] **Step 2: 解构 onDirtyChange prop**

修改第 65 行组件签名：

```typescript
export function HabitForm({ initial, onSubmit, onCancel, isLoading, onDirtyChange }: HabitFormProps) {
```

- [ ] **Step 3: 在各字段 onChange 时触发 onDirtyChange**

在每个字段的 `onChange` 处理器中添加 `onDirtyChange?.(true)` 调用。需要修改以下字段的 onChange：

- `title` onChange (line 142): 追加 `onDirtyChange?.(true)`
- `description` onChange (line 153): 追加 `onDirtyChange?.(true)`
- `trackable` onChange (line 165): 追加 `onDirtyChange?.(true)`
- `defaultTime` onChange (line 179): 追加 `onDirtyChange?.(true)`
- `earliestTime` onChange (line 189): 追加 `onDirtyChange?.(true)`
- `latestStartTime` onChange (line 198): 追加 `onDirtyChange?.(true)`
- `defaultDuration` onChange (line 213): 追加 `onDirtyChange?.(true)`
- `minDuration` onChange (line 225): 追加 `onDirtyChange?.(true)`
- `frequencyType` button onClick (line 238): 追加 `onDirtyChange?.(true)`
- `daysOfWeek` toggleDay (line 103): 在 `setDaysOfWeek` 后追加 `onDirtyChange?.(true)`
- `startDate` onChange (line 282): 追加 `onDirtyChange?.(true)`
- `endDate` onChange (line 291): 追加 `onDirtyChange?.(true)`

具体修改方式：在每个 setter 调用后添加一行 `onDirtyChange?.(true)`。例如：

```typescript
// 修改前
onChange={(e) => setTitle(e.target.value)}
// 修改后
onChange={(e) => { setTitle(e.target.value); onDirtyChange?.(true) }}
```

- [ ] **Step 4: 新增 submitTrigger prop 和 form ref（支持"保存并退出"外部触发提交）**

在 `HabitFormProps` 接口中新增：

```typescript
  /** 外部触发的提交计数（用于退出保存场景），每次递增触发一次 requestSubmit */
  submitTrigger?: number
```

在组件内部（`useState` 声明之后）新增：

```typescript
import { useRef, useEffect } from "react"  // 确保 useRef, useEffect 已导入

const formRef = useRef<HTMLFormElement>(null)

// 监听外部提交触发
useEffect(() => {
  if (submitTrigger && submitTrigger > 0 && formRef.current) {
    formRef.current.requestSubmit()
  }
}, [submitTrigger])
```

将 JSX 中的 `<form onSubmit={handleSubmit} ...>` 改为 `<form ref={formRef} onSubmit={handleSubmit} ...>`。

- [ ] **Step 5: 提交成功后重置脏状态**

在 `handleSubmit` 函数中不需要额外处理 — 父组件会在提交成功后关闭抽屉，`onDirtyChange` 由父组件管理。

- [ ] **Step 6: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit src/domains/habits/components/habit-form.tsx 2>&1 | head -20
```

Expected: No errors related to the changes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/habits/components/habit-form.tsx
git commit -m "feat(habits): add onDirtyChange + submitTrigger props to HabitForm

- onDirtyChange: notifies parent of form modifications
- submitTrigger: enables external submission for 'save & exit' flow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 修改 habit-template-form.tsx — 新增 onDirtyChange prop

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-template-form.tsx`

- [ ] **Step 1: 在接口中新增 onDirtyChange prop**

修改 `HabitTemplateFormProps` 接口（约第 24-37 行），在 `isLoading` 后新增：

```typescript
interface HabitTemplateFormProps {
  availableHabits: AvailableHabit[]
  habits?: Habit[]
  initial?: { ... }
  onSubmit: (data: { ... }) => void
  onCancel: () => void
  isLoading?: boolean
  /** 通知父组件表单已修改 */
  onDirtyChange?: (isDirty: boolean) => void
}
```

- [ ] **Step 2: 解构 onDirtyChange prop**

修改第 41 行组件签名：

```typescript
export function HabitTemplateForm({ availableHabits, habits, initial, onSubmit, onCancel, isLoading, onDirtyChange }: HabitTemplateFormProps) {
```

- [ ] **Step 3: 在字段变更时触发 onDirtyChange**

在各 setter 后添加 `onDirtyChange?.(true)`：

- `setName` (line 130): `onChange={e => { setName(e.target.value); onDirtyChange?.(true) }}`
- `toggleDay` (line 72): 在 `setSelectedDays` 后追加 `onDirtyChange?.(true)`
- `addHabit` (line 78): 在 `setEntries` 后追加 `onDirtyChange?.(true)`
- `removeHabit` (line 98): 在 `setEntries` 后追加 `onDirtyChange?.(true)`
- `updateTimeOverride` (line 105): 在 `setEntries` 后追加 `onDirtyChange?.(true)`

修改 `toggleDay` 函数：

```typescript
const toggleDay = (day: number) => {
  setSelectedDays(prev =>
    prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
  )
  onDirtyChange?.(true)
}
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/domains/habits/components/habit-template-form.tsx 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/habits/components/habit-template-form.tsx
git commit -m "feat(habits): add onDirtyChange prop to HabitTemplateForm

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 修改 habit-template-manager.tsx — 新增 onDirtyChange + onSubmitError props

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-template-manager.tsx`

- [ ] **Step 1: 添加 props 类型定义**

在文件顶部（import 之后、组件定义之前）新增接口：

```typescript
interface HabitTemplateManagerProps {
  /** 通知父组件表单已修改 */
  onDirtyChange?: (dirty: boolean) => void
  /** 提交失败时通知父组件 */
  onSubmitError?: (error: { type: string; message: string; fields?: Record<string, string> }) => void
}

export function HabitTemplateManager({ onDirtyChange, onSubmitError }: HabitTemplateManagerProps) {
```

同时将原来的 `export function HabitTemplateManager()` 改为带 props 的版本。

- [ ] **Step 2: 在表单操作中触发 onDirtyChange**

在以下位置添加 `onDirtyChange?.(true)`：
- `handleCreateTemplate` 开始处理时
- `handleUpdateTemplate` 开始处理时

在以下位置添加 `onDirtyChange?.(false)`：
- `handleCreateTemplate` 成功后（`setShowForm(false)` 之后）
- `handleUpdateTemplate` 成功后（`setEditingTemplateId(null)` 之后）
- 取消编辑时（`setEditingTemplateId(null)`、`setShowForm(false)`）

- [ ] **Step 3: 在错误处理中触发 onSubmitError**

在 `handleCreateTemplate` 的 catch/error 分支中：

```typescript
if (!result.success || !result.template) {
  setError(result.error ?? "创建模板失败")
  onSubmitError?.({ type: "validation", message: result.error ?? "创建模板失败" })
  return
}
```

在 `handleUpdateTemplate` 的 error 分支中：

```typescript
if (!updateResult.success) {
  setError(updateResult.error ?? "更新模板失败")
  onSubmitError?.({ type: "validation", message: updateResult.error ?? "更新模板失败" })
  return
}
```

- [ ] **Step 4: 将 onDirtyChange 传递给 HabitTemplateForm**

在新建模板 Dialog 中的 `HabitTemplateForm` 和编辑模式中的 `HabitTemplateForm` 添加 `onDirtyChange` prop：

```typescript
<HabitTemplateForm
  availableHabits={...}
  habits={habits}
  onSubmit={handleCreateTemplate}
  onCancel={() => { setShowForm(false); onDirtyChange?.(false) }}
  onDirtyChange={onDirtyChange}
/>
```

```typescript
<HabitTemplateForm
  availableHabits={...}
  initial={...}
  onSubmit={handleUpdateTemplate}
  onCancel={() => { setEditingTemplateId(null); onDirtyChange?.(false) }}
  onDirtyChange={onDirtyChange}
/>
```

- [ ] **Step 5: 验证编译**

```bash
cd frontend && npx tsc --noEmit src/domains/habits/components/habit-template-manager.tsx 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/habits/components/habit-template-manager.tsx
git commit -m "feat(habits): add onDirtyChange + onSubmitError props to HabitTemplateManager

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 创建 HabitListPage.tsx — 习惯列表页

**Files:**
- Create: `frontend/src/domains/habits/pages/HabitListPage.tsx`

这是最核心的新文件。先创建目录：

```bash
mkdir -p frontend/src/domains/habits/pages
```

- [ ] **Step 1: 创建 HabitListPage 组件骨架**

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { HabitList } from "../components/habit-list"
import { HabitForm, type HabitFormFields } from "../components/habit-form"
import type { Habit } from "@/usom/types/objects"
import type { CreateHabitInput, UpdateHabitInput } from "@/usom/interfaces/irepository"
import {
  getHabits,
  submitHabitIntent,
  updateHabitStatus,
  updateHabit,
  checkHabitReferences,
  deleteHabit,
} from "@/app/actions/intent"

type PageState = "idle" | "dirty" | "submitting"

// HabitList 组件需要的 shape
interface HabitItem {
  id: string
  title: string
  trackable: boolean
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  streak: number
  status: string
  frequencyType?: string
  description?: string
  longestStreak?: number
  completionRate7d?: number
}

function habitToItem(h: Habit): HabitItem {
  return {
    id: h.id,
    title: h.title,
    trackable: h.trackable,
    defaultTime: h.defaultTime,
    earliestTime: h.earliestTime,
    latestStartTime: h.latestStartTime,
    defaultDuration: h.defaultDuration,
    minDuration: h.minDuration,
    streak: h.streak,
    status: h.status,
    frequencyType: h.frequency.type,
    description: h.description,
    longestStreak: h.longestStreak,
    completionRate7d: h.completionRate7d,
  }
}

/** 将 HabitFormFields 转换为 CreateHabitInput */
function formFieldsToCreateInput(fields: HabitFormFields): CreateHabitInput {
  return {
    title: fields.title,
    description: fields.description,
    defaultTime: fields.defaultTime,
    earliestTime: fields.earliestTime,
    latestStartTime: fields.latestStartTime,
    defaultDuration: fields.defaultDuration,
    minDuration: fields.minDuration,
    trackable: fields.trackable,
    frequencyType: fields.frequencyType,
    daysOfWeek: fields.daysOfWeek,
    startDate: fields.startDate,
    endDate: fields.endDate,
    tags: [],
  }
}

export function HabitListPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [pageState, setPageState] = useState<PageState>("idle")
  const [dirtyLabel, setDirtyLabel] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Habit | null>(null)
  // ... continues below
```

- [ ] **Step 2: 实现数据加载方法**

```typescript
  const loadHabits = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getHabits()
      if (result.success && result.habits) {
        setHabits(result.habits)
      }
    } catch (err) {
      // silent — 列表加载失败由空状态提示
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadHabits() }, [loadHabits])
```

- [ ] **Step 3: 实现抽屉控制方法**

```typescript
  const openCreateDrawer = useCallback(() => {
    setDrawerMode("create")
    setEditingHabit(null)
    setPageState("idle")
    setDirtyLabel("")
    setFieldErrors({})
    setSubmitError(null)
  }, [])

  const openEditDrawer = useCallback((habitId: string) => {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    setDrawerMode("edit")
    setEditingHabit(habit)
    setPageState("idle")
    setDirtyLabel("")
    setFieldErrors({})
    setSubmitError(null)
  }, [habits])
```

- [ ] **Step 4: 实现脏状态处理方法**

```typescript
  const handleFormChange = useCallback(() => {
    if (pageState === "idle") {
      setPageState("dirty")
      setDirtyLabel(
        drawerMode === "edit" && editingHabit
          ? editingHabit.title
          : "新建习惯"
      )
    }
  }, [pageState, drawerMode, editingHabit])
```

- [ ] **Step 5: 实现表单提交流程**

```typescript
  const handleSubmit = useCallback(async (fields: HabitFormFields) => {
    setIsSubmitting(true)
    setPageState("submitting")
    setSubmitError(null)
    setFieldErrors({})

    try {
      if (drawerMode === "create") {
        const input = formFieldsToCreateInput(fields)
        const result = await submitHabitIntent(input)
        if (!result.success) {
          setSubmitError(result.error ?? "创建失败")
          setPageState("dirty")
          return
        }
      } else if (drawerMode === "edit" && editingHabit) {
        const input: UpdateHabitInput = {
          title: fields.title,
          description: fields.description,
          defaultTime: fields.defaultTime,
          earliestTime: fields.earliestTime,
          latestStartTime: fields.latestStartTime,
          defaultDuration: fields.defaultDuration,
          minDuration: fields.minDuration,
          trackable: fields.trackable,
          frequencyType: fields.frequencyType,
          daysOfWeek: fields.daysOfWeek,
          startDate: fields.startDate,
          endDate: fields.endDate,
        }
        const result = await updateHabit(editingHabit.id, input)
        if (!result.success) {
          setSubmitError(result.error ?? "更新失败")
          setPageState("dirty")
          return
        }
      }

      // 成功：清状态 + 关抽屉 + 刷新
      setPageState("idle")
      setDirtyLabel("")
      setDrawerMode(null)
      setEditingHabit(null)
      setFieldErrors({})
      await loadHabits()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "提交失败")
      setPageState("dirty")
    } finally {
      setIsSubmitting(false)
    }
  }, [drawerMode, editingHabit, loadHabits])
```

- [ ] **Step 6: 实现状态变更方法**

```typescript
  const handleStatusChange = useCallback(async (habitId: string, action: string) => {
    // list_actions 映射到 updateHabitStatus 的 action 参数
    const actionMap: Record<string, "activate" | "suspend" | "reactivate" | "archive"> = {
      activate: "activate",
      suspend: "suspend",
      reactivate: "reactivate",
      archive: "archive",
    }

    const mappedAction = actionMap[action]
    if (!mappedAction) {
      setSubmitError(`未知操作: ${action}`)
      return
    }

    // 归档前检查引用
    if (mappedAction === "archive") {
      const refResult = await checkHabitReferences(habitId)
      if (refResult.success && refResult.references?.hasReferences) {
        setSubmitError(
          `该习惯有 ${refResult.references.habitLogs} 条打卡记录、${refResult.references.timeboxHabits} 个时间盒关联，建议归档而非删除。`
        )
        // 仍然执行归档（不阻止）
      }
    }

    const result = await updateHabitStatus(habitId, mappedAction)
    if (!result.success) {
      setSubmitError(result.error ?? "状态更新失败")
      return
    }
    await loadHabits()
  }, [loadHabits])

  const handleDelete = useCallback(async (habitId: string) => {
    // 先检查引用
    const refResult = await checkHabitReferences(habitId)
    if (refResult.success && refResult.references?.hasReferences) {
      // 有引用：归档而非硬删除
      const result = await updateHabitStatus(habitId, "archive")
      if (!result.success) {
        setSubmitError(result.error ?? "归档失败")
      }
    } else {
      // 无引用：可以硬删除
      const result = await deleteHabit(habitId)
      if (!result.success) {
        setSubmitError(result.error ?? "删除失败")
      }
    }
    setDeleteConfirm(null)
    await loadHabits()
  }, [loadHabits])
```

- [ ] **Step 7: 实现退出确认弹窗逻辑**

```typescript
  const handleCancel = useCallback(() => {
    if (pageState === "dirty") {
      setPendingAction(() => () => closeDrawer())
      setShowExitDialog(true)
    } else {
      closeDrawer()
    }
  }, [pageState])

  const closeDrawer = useCallback(() => {
    setDrawerMode(null)
    setEditingHabit(null)
    setPageState("idle")
    setDirtyLabel("")
    setFieldErrors({})
    setSubmitError(null)
  }, [])

  const [submitTrigger, setSubmitTrigger] = useState(0)

  const handleExitSave = useCallback(() => {
    setShowExitDialog(false)
    setPendingAction(null)
    setSubmitTrigger(n => n + 1) // 触发 HabitForm 的 useEffect 提交
  }, [])

  const handleExitDiscard = useCallback(() => {
    setShowExitDialog(false)
    closeDrawer()
  }, [closeDrawer])

  const handleExitContinue = useCallback(() => {
    setShowExitDialog(false)
    setPendingAction(null)
  }, [])

  // Sheet openChange 处理
  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      handleCancel()
    }
  }, [handleCancel])
```

- [ ] **Step 8: 实现路由离开拦截**

```typescript
  // 浏览器 beforeunload 拦截
  useEffect(() => {
    if (pageState !== "dirty") return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [pageState])
```

- [ ] **Step 9: 渲染 JSX**

```typescript
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  const habitItems: HabitItem[] = habits.map(habitToItem)

  // 编辑模式下的表单初始值
  const editInitial = editingHabit ? {
    title: editingHabit.title,
    description: editingHabit.description,
    defaultTime: editingHabit.defaultTime,
    earliestTime: editingHabit.earliestTime,
    latestStartTime: editingHabit.latestStartTime,
    defaultDuration: editingHabit.defaultDuration,
    minDuration: editingHabit.minDuration,
    trackable: editingHabit.trackable,
    frequencyType: editingHabit.frequency.type,
    daysOfWeek: editingHabit.frequency.daysOfWeek,
    startDate: editingHabit.startDate,
    endDate: editingHabit.endDate,
  } : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* 脏状态指示器 */}
      {pageState !== "idle" && (
        <div className={`flex items-center justify-between rounded-md px-4 py-2 text-sm ${
          pageState === "dirty"
            ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
            : "bg-blue-50 text-blue-800 border border-blue-200"
        }`}>
          <span>
            {pageState === "dirty"
              ? `有未保存的修改 — ${dirtyLabel}`
              : "正在保存..."}
          </span>
          {pageState === "dirty" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubmitTrigger(n => n + 1)}
                className="text-xs underline hover:no-underline"
              >
                全部提交
              </button>
              <button
                type="button"
                onClick={handleExitDiscard}
                className="text-xs underline hover:no-underline"
              >
                放弃修改
              </button>
            </div>
          )}
        </div>
      )}

      {/* 提交错误 */}
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {submitError}
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="ml-2 text-xs underline hover:no-underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 习惯列表 */}
      <HabitList
        habits={habitItems}
        onCreate={openCreateDrawer}
        onEdit={openEditDrawer}
        onStatusChange={handleStatusChange}
      />

      {/* 抽屉表单 */}
      <Sheet open={drawerMode !== null} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {drawerMode === "create" ? "新建习惯" : "编辑习惯"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <HabitForm
              key={drawerMode === "edit" ? editingHabit?.id : "create"}
              initial={editInitial}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSubmitting}
              onDirtyChange={handleFormChange}
              submitTrigger={submitTrigger}
            />
          </div>
          {/* 字段级错误 */}
          {Object.keys(fieldErrors).length > 0 && (
            <div className="mt-4 space-y-1">
              {Object.entries(fieldErrors).map(([field, msg]) => (
                <p key={field} className="text-xs text-red-600">{field}: {msg}</p>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 退出确认弹窗 */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyLabel} 有未提交的修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleExitSave}>
              保存并退出
            </AlertDialogAction>
            <AlertDialogCancel onClick={handleExitDiscard}>
              放弃修改
            </AlertDialogCancel>
            <AlertDialogCancel onClick={handleExitContinue}>
              取消，继续编辑
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除习惯「{deleteConfirm?.title}」吗？如有引用数据将自动归档。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}>
              确认
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
              取消
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 10: 处理 submitTrigger — HabitForm 监听外部提交触发**

在 Task 2 中已为 `HabitForm` 添加 `submitTrigger` prop 和 form ref 机制（见 Task 2 Step 4-新增），此处无需额外修改。`handleExitSave` 通过递增 `submitTrigger` 触发 `HabitForm` 内部的 `formRef.current.requestSubmit()` 实现外部提交。

- [ ] **Step 11: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "HabitListPage\|habit-list-page" | head -20
```

- [ ] **Step 12: Commit**

```bash
git add frontend/src/domains/habits/pages/HabitListPage.tsx
git add frontend/src/domains/habits/components/habit-form.tsx  # submitTrigger 追加
git commit -m "feat(habits): create HabitListPage with drawer form, dirty state tracking, and exit confirmation

- Read habits via getHabits server action → HabitList component
- Write operations through submitHabitIntent/updateHabitStatus (Nexus chain)
- Dirty state: idle/dirty/submitting with indicator bar
- Three-option exit dialog: save & exit / discard / continue editing
- HabitForm gains submitTrigger prop for external submit triggering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 创建 HabitTemplatePage.tsx — 模板管理页

**Files:**
- Create: `frontend/src/domains/habits/pages/HabitTemplatePage.tsx`

- [ ] **Step 1: 创建 HabitTemplatePage 组件**

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { HabitTemplateManager } from "../components/habit-template-manager"

type PageState = "idle" | "dirty" | "submitting"

export function HabitTemplatePage() {
  const [pageState, setPageState] = useState<PageState>("idle")
  const [dirtyLabel, setDirtyLabel] = useState("")
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setPageState(dirty ? "dirty" : "idle")
    if (dirty) setDirtyLabel("模板编辑")
  }, [])

  const handleSubmitError = useCallback((error: { type: string; message: string }) => {
    setSubmitError(error.message)
  }, [])

  // 浏览器离开拦截
  useEffect(() => {
    if (pageState !== "dirty") return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [pageState])

  return (
    <div className="flex flex-col gap-4">
      {/* 脏状态指示器 */}
      {pageState !== "idle" && (
        <div className={`flex items-center justify-between rounded-md px-4 py-2 text-sm ${
          pageState === "dirty"
            ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
            : "bg-blue-50 text-blue-800 border border-blue-200"
        }`}>
          <span>
            {pageState === "dirty"
              ? `有未保存的修改 — ${dirtyLabel}`
              : "正在保存..."}
          </span>
        </div>
      )}

      {/* 提交错误 */}
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {submitError}
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="ml-2 text-xs underline hover:no-underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 模板管理器（已有组件） */}
      <HabitTemplateManager
        onDirtyChange={handleDirtyChange}
        onSubmitError={handleSubmitError}
      />

      {/* 退出确认弹窗 */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyLabel} 有未提交的修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowExitDialog(false)
              pendingAction?.()
            }}>
              保存并退出
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => {
              setShowExitDialog(false)
              setPageState("idle")
              pendingAction?.()
            }}>
              放弃修改
            </AlertDialogCancel>
            <AlertDialogCancel onClick={() => {
              setShowExitDialog(false)
              setPendingAction(null)
            }}>
              取消，继续编辑
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "HabitTemplatePage\|habit-template-page" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/pages/HabitTemplatePage.tsx
git commit -m "feat(habits): create HabitTemplatePage with dirty state bar wrapping HabitTemplateManager

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 创建 app/habits/page.tsx — Thin Shell 路由

**Files:**
- Create: `frontend/src/app/habits/page.tsx`

- [ ] **Step 1: 创建 Thin Shell**

先创建目录：

```bash
mkdir -p frontend/src/app/habits/templates
```

```typescript
import { HabitListPage } from "@/domains/habits/pages/HabitListPage"

export default function HabitsPage() {
  return <HabitListPage />
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/habits/page.tsx
git commit -m "feat(habits): create /habits thin shell route

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 创建 app/habits/templates/page.tsx — Thin Shell 路由

**Files:**
- Create: `frontend/src/app/habits/templates/page.tsx`

- [ ] **Step 1: 创建 Thin Shell**

```typescript
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage"

export default function HabitsTemplatesPage() {
  return <HabitTemplatePage />
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/habits/templates/page.tsx
git commit -m "feat(habits): create /habits/templates thin shell route

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 更新 components/index.ts — 新增 pages 导出

**Files:**
- Modify: `frontend/src/domains/habits/components/index.ts`

- [ ] **Step 1: 新增 pages 导出**

在文件末尾追加：

```typescript
// Pages
export { HabitListPage } from "../pages/HabitListPage"
export { HabitTemplatePage } from "../pages/HabitTemplatePage"
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/habits/components/index.ts
git commit -m "feat(habits): export HabitListPage and HabitTemplatePage from components index

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 删除 hooks/use-habits.ts

**Files:**
- Delete: `frontend/src/hooks/use-habits.ts`

- [ ] **Step 1: 确认无残留引用**

```bash
cd frontend && grep -r "use-habits\|useHabits" src/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

Expected: No results（如果有引用，先更新引用再删除）

- [ ] **Step 2: 删除文件**

```bash
rm frontend/src/hooks/use-habits.ts
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git rm frontend/src/hooks/use-habits.ts
git commit -m "refactor(habits): remove use-habits.ts, replaced by Page → Repository direct reads

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 全局验证与修复

- [ ] **Step 1: 完整 TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -30
```

Expected: No errors（如有错误，逐一修复）

- [ ] **Step 2: 验证 manifest view_routes 可通过 registry 正确加载**

```bash
cd frontend && node -e "
const { getViewRoute } = require('./src/domains/registry');
console.log('view_list:', getViewRoute('habits', 'view_list'));
console.log('view_templates:', getViewRoute('habits', 'view_templates'));
"
```

注意：如果 registry 使用 ESM 导致无法直接用 node 运行，改为在浏览器 devtools 或通过单元测试验证。

- [ ] **Step 3: 检查所有 import 路径正确性**

```bash
cd frontend && grep -rn "from.*pages/HabitListPage\|from.*pages/HabitTemplatePage" src/
```

确认 import 路径与实际文件路径一致。

- [ ] **Step 4: 运行开发服务器验证页面可访问**

```bash
cd frontend && npm run dev &
sleep 5
curl -s http://localhost:3000/habits | head -5
curl -s http://localhost:3000/habits/templates | head -5
```

Expected: 两个路由均返回 HTML（非 404）

- [ ] **Step 5: Commit（如有修复）**

```bash
git add -A
git commit -m "chore(habits): fix compilation and import issues from view routes implementation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 实施检查清单（对照设计规格 §6）

- [ ] 创建 `domains/habits/pages/HabitListPage.tsx` — Task 5
- [ ] 创建 `domains/habits/pages/HabitTemplatePage.tsx` — Task 6
- [ ] 创建 `app/habits/page.tsx`（thin shell）— Task 7
- [ ] 创建 `app/habits/templates/page.tsx`（thin shell）— Task 8
- [ ] 修改 manifest.yaml（view_routes +2）— Task 1
- [ ] 修改 habit-form.tsx（onDirtyChange prop）— Task 2
- [ ] 修改 habit-template-manager.tsx（onDirtyChange + onSubmitError prop）— Task 4
- [ ] 修改 habit-template-form.tsx（onDirtyChange prop）— Task 3
- [ ] 删除 `hooks/use-habits.ts` — Task 10
- [ ] 验证编译通过 — Task 11
- [ ] 验证脏状态流转（idle → dirty → submitting → idle）— 手动测试
- [ ] 验证退出确认弹窗（三选一）— 手动测试
- [ ] 验证写操作错误处理 — 手动测试
- [ ] 验证 PrebuiltIntent → Nexus 链路畅通 — 手动测试
- [ ] 验证多租户隔离（userId 过滤）— 已有 Repository 层保证

---

## 注意事项

1. **HabitTemplateManager 现有调用者兼容**：`HabitTemplateManager` 目前被导出为无 props 组件。新增的 `onDirtyChange` 和 `onSubmitError` 都是可选的（`?:`），不影响现有调用者。

2. **编写操作（habit editing）的 Nexus 链路**：当前 `updateHabit` server action 直接调用 `repo.update()` 绕过 Nexus。本计划中使用它作为过渡方案，未来应在 manifest 中新增 `editHabit` 或 `updateHabit` action 并通过 `submitHabitEditIntent` 进入完整 Nexus 链。此问题已在代码注释中标注 TODO。

3. **模板写操作**：按照设计规格 §4.2，模板 CRUD 暂延用现有 server action（非 PrebuiltIntent 链路），已标注 TODO。
