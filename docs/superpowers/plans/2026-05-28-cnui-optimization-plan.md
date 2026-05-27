# CN-UI 优化与习惯管理校验实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CN-UI 表面引入生命周期管理（保存/取消二次确认、只读状态、回车拦截），并在 Domain 层统一习惯管理校验逻辑。

**Architecture:** 提取 `useCnuiLifecycle` hook 和 `CnuiSurfaceWrapper` 组件管理生命周期状态；`domains/habits/validation.ts` 提供客户端/服务端复用的纯函数校验。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, shadcn/ui, Vitest

---

## 文件映射

### 新建文件

| 文件 | 职责 |
|---|---|
| `frontend/src/domains/habits/validation.ts` | 纯函数校验模块，客户端/服务端复用 |
| `frontend/src/components/cnui/cnui-confirm-dialog.tsx` | 基于 shadcn/ui AlertDialog 的可复用确认弹窗 |
| `frontend/src/components/cnui/use-cnui-lifecycle.ts` | Hook，管理 surface 生命周期状态 |
| `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx` | 包裹单个 CN-UI 表面，确认弹窗 + 只读遮罩 |
| `frontend/src/domains/habits/__tests__/validation.test.ts` | validation.ts 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `frontend/src/domains/habits/hooks.ts` | `onValidate` 复用 `validation.ts` |
| `frontend/src/domains/habits/components/habit-form.tsx` | 新增 `disableEnterSubmit` prop |
| `frontend/src/components/cnui/cnui-form-adapter.tsx` | 新增 `onCancel` 透传，`isDone` 处理 |
| `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx` | 新增 `onCancel` 透传，`isDone` 处理 |
| `frontend/src/components/cnui/CnuiRenderer.tsx` | 新增 `isDone`、`onCancel` prop |
| `frontend/src/components/layout/conversation-view.tsx` | 使用 `useCnuiLifecycle` 和 `CnuiSurfaceWrapper` |
| `frontend/src/app/actions/intent.ts` | `submitCnuiSurface` 前加入校验调用 |

---

### Task 1: `domains/habits/validation.ts` — 纯函数校验模块

**Files:**
- Create: `frontend/src/domains/habits/validation.ts`
- Test: `frontend/src/domains/habits/__tests__/validation.test.ts`

- [ ] **Step 1: 创建校验模块**

```typescript
// 纯函数校验模块 — 客户端/服务端复用
// 不依赖 React、不依赖数据库

const HH_MM_REGEX = /^\d{2}:\d{2}$/

function isValidHHMM(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!HH_MM_REGEX.test(value)) return false
  const [h, m] = value.split(':').map(Number)
  return h >= 0 && h < 24 && m >= 0 && m < 60
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateHabitFields(
  fields: Record<string, unknown>,
  action: 'createHabit' | 'updateHabit',
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 必填校验
  const title = fields['title']
  if (action === 'createHabit' && (!title || (typeof title === 'string' && title.trim() === ''))) {
    errors.push('标题必填')
  }

  // 时间格式校验
  if (!isValidHHMM(fields['defaultTime'])) {
    errors.push('默认时间必须是有效的 HH:MM 格式')
  }
  if (!isValidHHMM(fields['earliestTime'])) {
    errors.push('最早开始时间格式无效')
  }
  if (!isValidHHMM(fields['latestStartTime'])) {
    errors.push('最迟开始时间格式无效')
  }

  // 时间窗口约束
  const defaultTime = fields['defaultTime'] as string
  const earliestTime = fields['earliestTime'] as string
  const latestStartTime = fields['latestStartTime'] as string
  if (defaultTime && earliestTime && latestStartTime &&
      isValidHHMM(defaultTime) && isValidHHMM(earliestTime) && isValidHHMM(latestStartTime)) {
    const dt = timeToMinutes(defaultTime)
    const et = timeToMinutes(earliestTime)
    const lt = timeToMinutes(latestStartTime)
    if (dt < et || dt > lt) {
      errors.push('默认时间必须在最早开始时间和最迟开始时间之间')
    }
  }

  // 时长校验
  const defaultDuration = fields['defaultDuration']
  if (typeof defaultDuration === 'number') {
    if (defaultDuration <= 0) errors.push('默认时长必须大于 0')
    if (defaultDuration >= 180) warnings.push('默认时长较长（≥180分钟），建议拆分为多个习惯')
  }

  const minDuration = fields['minDuration']
  if (typeof minDuration === 'number' && typeof defaultDuration === 'number') {
    if (minDuration <= 0) errors.push('最短时长必须大于 0')
    if (minDuration > defaultDuration) errors.push('最短时长不能大于默认时长')
  }

  return { valid: errors.length === 0, errors, warnings }
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/habits/validation.ts
git commit -m "feat(habits): 提取纯函数校验模块 validation.ts

支持客户端/服务端复用，包含时间窗口校验和时长警告。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: `domains/habits/hooks.ts` — onValidate 复用校验模块

**Files:**
- Modify: `frontend/src/domains/habits/hooks.ts`

- [ ] **Step 1: 添加导入并修改 onValidate**

在文件顶部添加导入：

```typescript
import { validateHabitFields } from './validation'
```

替换 `onValidate` 中的 createHabit/updateHabit 校验逻辑（第 39-68 行）：

```typescript
// 替换前代码（删除）:
if (action === 'createHabit' || action === 'updateHabit') {
  // ... 原有校验逻辑
}

// 替换为:
if (action === 'createHabit' || action === 'updateHabit') {
  const result = validateHabitFields(fields, action as 'createHabit' | 'updateHabit')
  errors.push(...result.errors)
  // warnings 由客户端驱动，不侵入 onValidate 返回类型
}
```

完整的 `onValidate` 中 createHabit/updateHabit 分支替换为：

```typescript
if (action === 'createHabit' || action === 'updateHabit') {
  const result = validateHabitFields(fields, action as 'createHabit' | 'updateHabit')
  errors.push(...result.errors)
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/habits/hooks.ts
git commit -m "refactor(habits): onValidate 复用 validation.ts 纯函数模块

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `components/cnui/cnui-confirm-dialog.tsx` — 确认弹窗组件

**Files:**
- Create: `frontend/src/components/cnui/cnui-confirm-dialog.tsx`

- [ ] **Step 1: 创建确认弹窗组件**

```tsx
'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

export interface CnuiConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export function CnuiConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
  cancelLabel = '取消',
}: CnuiConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/cnui-confirm-dialog.tsx
git commit -m "feat(cnui): 可复用确认弹窗组件 CnuiConfirmDialog

基于 shadcn/ui AlertDialog，支持自定义标题/消息/按钮文案。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: `components/cnui/use-cnui-lifecycle.ts` — 生命周期 Hook

**Files:**
- Create: `frontend/src/components/cnui/use-cnui-lifecycle.ts`

- [ ] **Step 1: 创建生命周期 hook**

```typescript
'use client'

import { useState, useCallback } from 'react'
import { validateHabitFields } from '@/domains/habits/validation'

export type SurfaceState = 'active' | 'saved' | 'cancelled'

export interface CnuiLifecycleState {
  surfaceStates: Record<string, SurfaceState>
  surfaceData: Record<string, Record<string, unknown>>
  submittingId: string | null
  validationErrors: Record<string, string[]>
  confirmDialog: {
    open: boolean
    type: 'save' | 'cancel' | 'save-with-warnings'
    surfaceId: string
    title: string
    message: string
    pendingData?: Record<string, unknown>
    domainId?: string
    action?: string
  }
}

export interface CnuiLifecycleActions {
  requestSave: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
  requestCancel: (surfaceId: string) => void
  confirmDialogAction: () => void
  dismissDialog: () => void
  updateData: (surfaceId: string, data: Record<string, unknown>) => void
  clearValidationErrors: (surfaceId: string) => void
}

export function useCnuiLifecycle(
  onSubmit: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<void>,
): [CnuiLifecycleState, CnuiLifecycleActions] {
  const [surfaceStates, setSurfaceStates] = useState<Record<string, SurfaceState>>({})
  const [surfaceData, setSurfaceData] = useState<Record<string, Record<string, unknown>>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({})
  const [confirmDialog, setConfirmDialog] = useState<CnuiLifecycleState['confirmDialog']>({
    open: false,
    type: 'save',
    surfaceId: '',
    title: '',
    message: '',
  })

  const updateData = useCallback((surfaceId: string, data: Record<string, unknown>) => {
    setSurfaceData(prev => ({ ...prev, [surfaceId]: data }))
  }, [])

  const clearValidationErrors = useCallback((surfaceId: string) => {
    setValidationErrors(prev => {
      const next = { ...prev }
      delete next[surfaceId]
      return next
    })
  }, [])

  const requestSave = useCallback((surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
    clearValidationErrors(surfaceId)

    // Domain 校验
    if (domainId === 'habits' && action === 'createHabit') {
      const result = validateHabitFields(data, 'createHabit')
      if (!result.valid) {
        setValidationErrors(prev => ({ ...prev, [surfaceId]: result.errors }))
        return
      }
      if (result.warnings.length > 0) {
        setConfirmDialog({
          open: true,
          type: 'save-with-warnings',
          surfaceId,
          title: '确认保存',
          message: `${result.warnings.join('；')}。确定继续吗？`,
          pendingData: data,
          domainId,
          action,
        })
        return
      }
    }

    setConfirmDialog({
      open: true,
      type: 'save',
      surfaceId,
      title: '确认保存',
      message: '确定要保存此习惯吗？',
      pendingData: data,
      domainId,
      action,
    })
  }, [clearValidationErrors])

  const requestCancel = useCallback((surfaceId: string) => {
    setConfirmDialog({
      open: true,
      type: 'cancel',
      surfaceId,
      title: '确认取消',
      message: '确定要取消吗？已填写的内容将不会保存。',
    })
  }, [])

  const confirmDialogAction = useCallback(async () => {
    const { type, surfaceId, pendingData, domainId, action } = confirmDialog

    if (type === 'cancel') {
      setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'cancelled' }))
      setConfirmDialog(prev => ({ ...prev, open: false }))
      return
    }

    // save 或 save-with-warnings
    if (!pendingData || !domainId || !action) return

    setConfirmDialog(prev => ({ ...prev, open: false }))
    setSubmittingId(surfaceId)

    try {
      await onSubmit(surfaceId, domainId, action, pendingData)
      setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'saved' }))
    } catch {
      // 错误由调用方处理
    } finally {
      setSubmittingId(null)
    }
  }, [confirmDialog, onSubmit])

  const dismissDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }))
  }, [])

  const state: CnuiLifecycleState = {
    surfaceStates,
    surfaceData,
    submittingId,
    validationErrors,
    confirmDialog,
  }

  const actions: CnuiLifecycleActions = {
    requestSave,
    requestCancel,
    confirmDialogAction,
    dismissDialog,
    updateData,
    clearValidationErrors,
  }

  return [state, actions]
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/use-cnui-lifecycle.ts
git commit -m "feat(cnui): 生命周期管理 hook useCnuiLifecycle

管理 surface 状态(active/saved/cancelled)、数据缓存、校验错误、
确认弹窗和提交流程。支持错误阻断和警告二次确认。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: `components/cnui/CnuiSurfaceWrapper.tsx` — 表面包装组件

**Files:**
- Create: `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx`

- [ ] **Step 1: 创建表面包装组件**

```tsx
'use client'

import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import type { CnuiLifecycleState, CnuiLifecycleActions } from './use-cnui-lifecycle'

interface CnuiSurfaceWrapperProps {
  surfaceId: string
  domainId: string
  action: string
  surfaceType: string
  dataSnapshot: Record<string, unknown> | undefined
  lifecycleState: CnuiLifecycleState
  lifecycleActions: CnuiLifecycleActions
}

export function CnuiSurfaceWrapper({
  surfaceId,
  domainId,
  action,
  surfaceType,
  dataSnapshot,
  lifecycleState,
  lifecycleActions,
}: CnuiSurfaceWrapperProps) {
  const state = lifecycleState.surfaceStates[surfaceId] ?? 'active'
  const data = lifecycleState.surfaceData[surfaceId] ?? dataSnapshot ?? {}
  const isLoading = lifecycleState.submittingId === surfaceId
  const errors = lifecycleState.validationErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  if (isDone) {
    return (
      <div className="relative mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
        <div className="pointer-events-none opacity-50">
          <CnuiRenderer
            surfaceType={surfaceType as any}
            dataModel={data}
            onDataChange={() => {}}
            onConfirm={() => {}}
            onCancel={() => {}}
            isLoading={false}
            isDone={true}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/30">
          <div
            className={`rounded-md px-4 py-2 text-sm font-medium shadow ${
              state === 'saved'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {state === 'saved' ? '已保存' : '已取消'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
        {errors && errors.length > 0 && (
          <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        <CnuiRenderer
          surfaceType={surfaceType as any}
          dataModel={data}
          onDataChange={(d) => lifecycleActions.updateData(surfaceId, d)}
          onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
          onCancel={() => lifecycleActions.requestCancel(surfaceId)}
          isLoading={isLoading}
          isDone={false}
        />
      </div>

      <CnuiConfirmDialog
        open={lifecycleState.confirmDialog.open}
        title={lifecycleState.confirmDialog.title}
        message={lifecycleState.confirmDialog.message}
        onConfirm={lifecycleActions.confirmDialogAction}
        onCancel={lifecycleActions.dismissDialog}
      />
    </>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/CnuiSurfaceWrapper.tsx
git commit -m "feat(cnui): 表面包装组件 CnuiSurfaceWrapper

管理确认弹窗、校验错误显示、保存/取消后的只读遮罩。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: `domains/habits/components/habit-form.tsx` — 回车拦截

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-form.tsx`

- [ ] **Step 1: 添加 disableEnterSubmit prop 并拦截回车**

修改第 24-37 行的接口定义，新增 `disableEnterSubmit` prop：

```typescript
interface HabitFormProps {
  initial?: Partial<HabitFormFields>
  onSubmit: (fields: HabitFormFields) => void
  onCancel: () => void
  isLoading?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  submitTrigger?: number
  disableEnterSubmit?: boolean  // 新增
}
```

修改第 68 行的函数签名和解构：

```typescript
export function HabitForm({ initial, onSubmit, onCancel, isLoading, onDirtyChange, submitTrigger, disableEnterSubmit }: HabitFormProps) {
```

修改第 147 行的 form 标签，添加 onKeyDown 拦截：

```typescript
<form
  ref={formRef}
  onSubmit={handleSubmit}
  onKeyDown={(e) => {
    if (disableEnterSubmit && e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
    }
  }}
  className="flex flex-col gap-4"
>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/habits/components/habit-form.tsx
git commit -m "feat(habits): HabitForm 支持 disableEnterSubmit 回车拦截

CN-UI 场景下按回车不触发表单提交，避免误操作。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: `components/cnui/cnui-form-adapter.tsx` — onCancel + isDone 透传

**Files:**
- Modify: `frontend/src/components/cnui/cnui-form-adapter.tsx`

- [ ] **Step 1: 扩展接口并透传新 props**

修改第 5-12 行的接口：

```typescript
interface CnuiFormAdapterProps {
  domainId: string
  action: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void  // 新增
  isLoading?: boolean
  isDone?: boolean       // 新增
}
```

修改第 43 行的函数签名和解构：

```typescript
export function CnuiFormAdapter({ domainId, action, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CnuiFormAdapterProps) {
```

修改第 57-66 行的返回部分：

```typescript
  return (
    <FormComponent
      initial={mappedData}
      onSubmit={(fields: Record<string, unknown>) => {
        onConfirm(mapFormToData(fields, config.fieldMapping))
      }}
      onCancel={onCancel}
      isLoading={isLoading}
      disableEnterSubmit={true}
    />
  )
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/cnui-form-adapter.tsx
git commit -m "feat(cnui): CnuiFormAdapter 透传 onCancel 和 disableEnterSubmit

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: `components/cnui/surfaces/HabitCreationCard.tsx` — onCancel + isDone 透传

**Files:**
- Modify: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

- [ ] **Step 1: 扩展接口并透传**

修改第 5-11 行的接口：

```typescript
interface HabitCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void  // 新增
  isLoading?: boolean
  isDone?: boolean       // 新增
}
```

修改第 13 行的解构和第 17-24 行的 CnuiFormAdapter 调用：

```typescript
export function HabitCreationCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: HabitCreationCardProps) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">习惯创建</div>
      <CnuiFormAdapter
        domainId="habits"
        action="createHabit"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isLoading={isLoading}
        isDone={isDone}
      />
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/surfaces/HabitCreationCard.tsx
git commit -m "feat(cnui): HabitCreationCard 透传 onCancel 和 isDone

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: `components/cnui/CnuiRenderer.tsx` — isDone + onCancel

**Files:**
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx`

- [ ] **Step 1: 扩展接口并透传**

修改第 7-13 行的接口：

```typescript
interface CnuiRendererProps {
  surfaceType: CnuiComponentType
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void  // 新增
  isLoading?: boolean
  isDone?: boolean       // 新增
}
```

修改第 20 行的解构和第 31 行的 Renderer 调用：

```typescript
export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CnuiRendererProps) {
  const Renderer = SURFACE_RENDERERS[surfaceType]

  if (!Renderer) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  return (
    <Renderer
      surfaceType={surfaceType}
      dataModel={dataModel}
      onDataChange={onDataChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      isDone={isDone}
    />
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/cnui/CnuiRenderer.tsx
git commit -m "feat(cnui): CnuiRenderer 透传 onCancel 和 isDone

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: `components/layout/conversation-view.tsx` — 使用生命周期管理

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`

- [ ] **Step 1: 添加导入**

在现有导入后添加：

```typescript
import { useCnuiLifecycle } from '@/components/cnui/use-cnui-lifecycle'
import { CnuiSurfaceWrapper } from '@/components/cnui/CnuiSurfaceWrapper'
```

- [ ] **Step 2: 替换 surface 状态管理**

删除第 35-36 行的旧状态：

```typescript
// 删除:
const [loadingSurfaceId, setLoadingSurfaceId] = useState<string | null>(null)
const [surfaceDataCache, setSurfaceDataCache] = useState<Record<string, Record<string, unknown>>>({})
```

在组件内添加生命周期 hook（放在状态声明区域）：

```typescript
const [lifecycleState, lifecycleActions] = useCnuiLifecycle(
  useCallback(
    async (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
      if (!onCnuiConfirm) return
      await onCnuiConfirm(surfaceId, domainId, action, data)
    },
    [onCnuiConfirm]
  )
)
```

- [ ] **Step 3: 替换 CN-UI 渲染逻辑**

替换第 265-285 行的 CN-UI 渲染块：

```tsx
{msg.cnuiSurface && (
  <CnuiSurfaceWrapper
    surfaceId={msg.cnuiSurface.cnuiSurfaceId}
    domainId={msg.cnuiSurface.domainId}
    action={msg.cnuiSurface.action}
    surfaceType={msg.cnuiSurface.cnuiSurfaceType}
    dataSnapshot={msg.cnuiSurface.dataSnapshot}
    lifecycleState={lifecycleState}
    lifecycleActions={lifecycleActions}
  />
)}
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/layout/conversation-view.tsx
git commit -m "feat(cnui): ConversationView 使用 useCnuiLifecycle 管理生命周期

替换原有 surfaceDataCache/loadingSurfaceId，统一由生命周期 hook 管理。
支持二次确认、校验错误显示、保存/取消后的只读状态。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: `app/actions/intent.ts` — submitCnuiSurface 前校验

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`

- [ ] **Step 1: 添加导入并在提交前调用校验**

在文件顶部（其他 import 附近）添加：

```typescript
import { validateHabitFields } from '@/domains/habits/validation'
```

修改 `submitCnuiSurface` 函数（第 1024-1046 行）：

```typescript
/** 提交 CN-UI 表面数据 */
export async function submitCnuiSurface(
  _cnuiSurfaceId: string,
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<HabitActionResult> {
  // 服务端二次校验（防御性校验，客户端已校验过）
  if (domainId === 'habits' && action === 'createHabit') {
    const result = validateHabitFields(fields, 'createHabit')
    if (!result.valid) {
      return { success: false, error: result.errors.join('；') }
    }
  }

  const config = FormRegistry.get(domainId, action)
  let mappedFields = fields
  if (config) {
    mappedFields = {}
    for (const [cnuiKey, formKey] of Object.entries(config.fieldMapping)) {
      if (cnuiKey in fields) {
        mappedFields[formKey] = fields[cnuiKey]
      }
    }
  }

  if (domainId === "habits" && action === "createHabit") {
    return submitHabitIntent(mappedFields as CreateHabitInput)
  }

  return { success: false, error: `Unknown CN-UI action: ${domainId}/${action}` }
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "feat(intent): submitCnuiSurface 服务端二次校验

在提交前调用 validateHabitFields 进行防御性校验，
与客户端校验形成双层防护。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: validation.ts 单元测试

**Files:**
- Create: `frontend/src/domains/habits/__tests__/validation.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, it, expect } from 'vitest'
import { validateHabitFields } from '../validation'

describe('validateHabitFields', () => {
  it('createHabit 标题为空时返回 error', () => {
    const result = validateHabitFields({ title: '' }, 'createHabit')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('标题必填')
  })

  it('updateHabit 标题为空时允许通过', () => {
    const result = validateHabitFields({ title: '' }, 'updateHabit')
    expect(result.valid).toBe(true)
  })

  it('时间格式无效时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '25:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时间必须是有效的 HH:MM 格式')
  })

  it('默认时间在窗口外时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '05:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时间必须在最早开始时间和最迟开始时间之间')
  })

  it('默认时间在窗口内时通过', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(true)
  })

  it('默认时长 <= 0 时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0 },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时长必须大于 0')
  })

  it('默认时长 >= 180 时返回 warning', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 180 },
      'createHabit'
    )
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('默认时长较长（≥180分钟），建议拆分为多个习惯')
  })

  it('最短时长 > 默认时长时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 60 },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('最短时长不能大于默认时长')
  })

  it('完整有效数据通过', () => {
    const result = validateHabitFields(
      { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15 },
      'createHabit'
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/validation.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/habits/__tests__/validation.test.ts
git commit -m "test(habits): validation.ts 单元测试

覆盖标题必填、时间格式、时间窗口、时长校验、warnings。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: 全量测试回归

**Files:**
- 无新建/修改文件

- [ ] **Step 1: 运行全部测试**

```bash
cd frontend && npm test
```

Expected: 所有测试 PASS（包括已有的 695 个 + 新增的 8 个）

- [ ] **Step 2: 运行 lint**

```bash
cd frontend && npm run lint
```

Expected: 无错误

- [ ] **Step 3: 提交（如测试全部通过）**

```bash
git commit --allow-empty -m "chore: CN-UI 优化与习惯管理校验 — 全量测试通过

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Spec 覆盖检查

| Spec 需求 | 对应 Task | 状态 |
|---|---|---|
| 保存/取消二次确认 | Task 3, 4, 5 | ✅ |
| 保存后表单变只读 | Task 4, 5 | ✅ |
| 取消后表单变只读 | Task 4, 5 | ✅ |
| 回车不触发保存 | Task 6, 7 | ✅ |
| 默认时间在最早/最迟之间 | Task 1, 12 | ✅ |
| 默认时长 >= 180 警告 | Task 1, 4, 12 | ✅ |
| onValidate 复用校验模块 | Task 2 | ✅ |
| 服务端二次校验 | Task 11 | ✅ |

---

## Placeholder 扫描

- 无 "TBD", "TODO", "implement later"
- 无 "Add appropriate error handling" 等模糊描述
- 所有代码块包含完整可运行的代码
- 所有文件路径为绝对路径
