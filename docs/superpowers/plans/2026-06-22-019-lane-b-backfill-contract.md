# [019.0] Lane B — 回填契约（Backfill Contract）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CNUI surface 提交失败时，服务端字段级错误（`errors[]`）从 domain handler 一路透传到 surface 组件并按字段标红（L6 回填契约），且提交失败时 surface 保持可编辑、不被误标 `saved`（saved bug）。

**Architecture:** tasks domain handler 的 `submit()` **已经产出** `errors: string[]`（`CnuiSurfaceSubmitResult.errors`，见 `types.ts:86`）。问题是 `errors` 在 6 层管线中被逐层丢弃：`submitCnuiSurface` 不转发 → `handleCnuiConfirm` 返回 void → `onCnuiConfirm` 类型 void → `useCnuiLifecycle.onSubmit` 类型 `Promise<void>`（且无脑标 saved）→ `CnuiSurfaceWrapper` 不传 → `CnuiRenderer` 不转发。本 plan 纯**透传修补 + 结果契约重塑**，不新增错误源逻辑。新增一个 `CnuiSubmitResult` 契约类型贯穿 lifecycle / view / handler 三层。

**Tech Stack:** React 19 + TypeScript 5（`'use client'` hooks）、Next.js server action、Vitest + @testing-library/react（**必须在 `frontend/` cwd 跑**，`@/` 映射；vitest 不做类型检查，配 `tsc` 双验证）。

**范式层**：L6 回填（`docs/domain-development-guide.md` L6-1/L6-2）。§IX 已生效（constitution v2.0.0），但本 Lane 不依赖 §IX（L6 独立于 L4 CnuiFormAdapter）。

---

## File Structure

| 文件 | 责任 | 本 Lane 改动 |
|---|---|---|
| `frontend/src/app/actions/intent.ts` | `submitCnuiSurface` server action | 转发 handler 的 `errors`；`HabitActionResult` 加 `errors?` |
| `frontend/src/components/cnui/use-cnui-lifecycle.ts` | CNUI lifecycle hook（提交/状态） | **核心**：`onSubmit` 契约 `Promise<void>`→`Promise<CnuiSubmitResult>`；state 加 `serverErrors`；saved bug 修复 |
| `frontend/src/components/layout/conversation-view.tsx` | lifecycle 唯一消费者 | onSubmit 包装器返回结果；`onCnuiConfirm` prop 类型 |
| `frontend/src/hooks/use-intent-handler.ts` | `handleCnuiConfirm` 真实提交 | 返回 `CnuiSubmitResult`（携带 `result.errors`） |
| `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx` | surface 包装器 | 从 lifecycleState 取 `serverErrors` 透传给 renderer |
| `frontend/src/components/cnui/CnuiRenderer.tsx` | surface 渲染器 | 加 `serverErrors` prop 并转发给 surface 组件 |
| `frontend/src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx` | **新建** lifecycle 契约测试 | TDD：成功→saved / 失败→serverErrors+不 saved / 再存清空 |
| `frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx` | 已有 wrapper 测试 | fixture `makeLifecycle` 补 `serverErrors`；新增透传断言 |

**不在范围**：tasks handler 错误源（已存在）、habits/okrs/timebox 回填（各自 Lane）、完整 CNUI Suspend/NeedInput 回环（[018] follow-up ⑥）、3 个 tasks surface 组件内部（**已正确消费 `serverErrors`，零改动**）。

---

## Task 1：server action 转发 `errors`

**Files:**
- Modify: `frontend/src/app/actions/intent.ts:744-749`（`HabitActionResult`）+ `frontend/src/app/actions/intent.ts:1335-1341`（`submitCnuiSurface` 返回）

- [ ] **Step 1：`HabitActionResult` 加 `errors?` 字段**

`frontend/src/app/actions/intent.ts` 约 744 行，把：

```ts
export interface HabitActionResult {
  success: boolean;
  habit?: Habit;
  habits?: Habit[];
  error?: string;
}
```

改为：

```ts
export interface HabitActionResult {
  success: boolean;
  habit?: Habit;
  habits?: Habit[];
  error?: string;
  /** [019.0] Lane B：字段级服务端错误（handler.submit 拆分自 orchestrator Rejected.errors），供 surface 回填 */
  errors?: string[];
}
```

- [ ] **Step 2：`submitCnuiSurface` 转发 `result.errors`**

`frontend/src/app/actions/intent.ts` 约 1336 行，把：

```ts
  // 委托给 domain handler 执行提交
  const result = await handler.submit(action, mappedFields)
  return {
    success: result.success,
    error: result.error,
    ...(result.data ?? {}),
  }
```

改为：

```ts
  // 委托给 domain handler 执行提交
  const result = await handler.submit(action, mappedFields)
  // [019.0] Lane B：转发 handler 拆分的字段级 errors（之前被丢弃，导致回填管线断）
  return {
    success: result.success,
    error: result.error,
    errors: result.errors,
    ...(result.data ?? {}),
  }
```

- [ ] **Step 3：类型检查通过**

Run（**在 `frontend/` cwd**）: `cd frontend && npx tsc --noEmit`
Expected: PASS（`result.errors` 是 `CnuiSurfaceSubmitResult.errors: string[] | undefined`，与 `HabitActionResult.errors?` 兼容）

- [ ] **Step 4：Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "fix(cnui): [019.0] submitCnuiSurface 转发 handler errors[]（回填管线源头）"
```

---

## Task 2：`useCnuiLifecycle` 结果契约 + saved bug（核心，TDD）

**Files:**
- Modify: `frontend/src/components/cnui/use-cnui-lifecycle.ts`（onSubmit 签名、state、confirmDialogAction）
- Modify: `frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx:23-40`（fixture 补 `serverErrors`，否则 tsc 断）
- Test: `frontend/src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx`（新建）

- [ ] **Step 1：先写失败测试（新建 `use-cnui-lifecycle.test.tsx`）**

创建 `frontend/src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx`：

```tsx
/**
 * @file use-cnui-lifecycle 测试
 * @brief [019.0] Lane B 回填契约：onSubmit 结果契约 + serverErrors 存储 + saved bug
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCnuiLifecycle, type CnuiSubmitResult } from '../use-cnui-lifecycle'

/** 驱动一次 save→confirm 流程并返回最终 surfaceState/serverErrors */
async function driveSubmit(onSubmit: ReturnType<typeof vi.fn>, result: CnuiSubmitResult) {
  onSubmit.mockResolvedValue(result)
  const { result: hook } = renderHook(() => useCnuiLifecycle(onSubmit))
  // 打开确认框
  act(() => hook[1].requestSave('s1', 'tasks', 'createTask', { title: 'x' }))
  // 确认提交
  await act(async () => { await hook[1].confirmDialogAction() })
  return {
    surfaceState: hook[0].surfaceStates['s1'],
    serverErrors: hook[0].serverErrors['s1'],
  }
}

describe('useCnuiLifecycle [019.0] 回填契约', () => {
  it('成功：标记 saved 且无 serverErrors', async () => {
    const onSubmit = vi.fn()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, { success: true })
    expect(surfaceState).toBe('saved')
    expect(serverErrors).toBeUndefined()
  })

  it('失败带 serverErrors：不标 saved，存字段错误', async () => {
    const onSubmit = vi.fn()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, {
      success: false,
      serverErrors: ['标题不能为空'],
    })
    expect(surfaceState).toBeUndefined() // 未变 saved，保持 active
    expect(serverErrors).toEqual(['标题不能为空'])
  })

  it('失败无 serverErrors：兜底通用错误且不标 saved', async () => {
    const onSubmit = vi.fn()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, { success: false })
    expect(surfaceState).toBeUndefined()
    expect(serverErrors).toEqual(['保存失败，请稍后重试'])
  })

  it('失败后再次成功：清空 serverErrors 并标 saved', async () => {
    const onSubmit = vi.fn()
    onSubmit.mockResolvedValueOnce({ success: false, serverErrors: ['err'] })
    const { result: hook } = renderHook(() => useCnuiLifecycle(onSubmit))
    act(() => hook[1].requestSave('s1', 'tasks', 'createTask', { title: 'x' }))
    await act(async () => { await hook[1].confirmDialogAction() })
    expect(hook[0].serverErrors['s1']).toEqual(['err'])

    onSubmit.mockResolvedValueOnce({ success: true })
    act(() => hook[1].requestSave('s1', 'tasks', 'createTask', { title: 'y' }))
    await act(async () => { await hook[1].confirmDialogAction() })
    expect(hook[0].surfaceStates['s1']).toBe('saved')
    expect(hook[0].serverErrors['s1']).toBeUndefined()
  })
})
```

- [ ] **Step 2：跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx`
Expected: FAIL（`CnuiSubmitResult` 未导出 / `serverErrors` 字段不存在）。

- [ ] **Step 3：实现 — 新增 `CnuiSubmitResult` 类型 + state 字段**

`frontend/src/components/cnui/use-cnui-lifecycle.ts`，在 `export type { SurfaceState }` 之后加：

```ts
/**
 * CNUI 提交结果契约（[019.0] Lane B 回填）。
 * lifecycle 据此决定终态：success→saved；否则存 serverErrors、surface 保持可编辑。
 */
export interface CnuiSubmitResult {
  success: boolean
  /** 服务端字段级错误（handler 拆分自 Rejected.errors），透传给 surface 回填；空/缺省表成功 */
  serverErrors?: string[]
}
```

- [ ] **Step 4：实现 — `onSubmit` 签名改契约**

同文件第 75 行，把：

```ts
  onSubmit: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<void>,
```

改为：

```ts
  onSubmit: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<CnuiSubmitResult>,
```

- [ ] **Step 5：实现 — state 加 `serverErrors`**

`CnuiLifecycleState` interface 内（`validationErrors` 之后）加字段：

```ts
  /** 各动作面的服务端字段错误（[019.0] Lane B 回填，供 surface 标红） */
  serverErrors: Record<string, string[]>
```

hook 体内（`validationErrors` useState 之后）加：

```ts
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({})
```

- [ ] **Step 6：实现 — `confirmDialogAction` 按契约决定终态（saved bug 修复）**

把第 146-171 行的 `confirmDialogAction` 整体替换为：

```ts
  const confirmDialogAction = useCallback(async () => {
    const { type, surfaceId, pendingData, domainId, action } = confirmDialog

    if (type === 'cancel') {
      setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'cancelled' }))
      onStateChange?.(surfaceId, 'cancelled')
      setConfirmDialog(prev => ({ ...prev, open: false }))
      return
    }

    // save 或 save-with-warnings
    if (!pendingData || !domainId || !action) return

    setConfirmDialog(prev => ({ ...prev, open: false }))
    setSubmittingId(surfaceId)

    try {
      const result = await onSubmit(surfaceId, domainId, action, pendingData)
      // [019.0] Lane B：按结果契约决定终态——成功才 saved；失败存 serverErrors、保持可编辑
      if (result.success) {
        setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'saved' }))
        onStateChange?.(surfaceId, 'saved', pendingData)
        setServerErrors(prev => { const next = { ...prev }; delete next[surfaceId]; return next })
      } else {
        const errs = result.serverErrors && result.serverErrors.length > 0
          ? result.serverErrors
          : ['保存失败，请稍后重试']
        setServerErrors(prev => ({ ...prev, [surfaceId]: errs }))
      }
    } catch {
      // 网络/未知异常走表单级 validationErrors（wrapper banner），不混入字段级
      setValidationErrors(prev => ({ ...prev, [surfaceId]: ['保存失败，请稍后重试'] }))
    } finally {
      setSubmittingId(null)
    }
  }, [confirmDialog, onSubmit, onStateChange])
```

- [ ] **Step 7：实现 — `requestSave` 重新提交时清空旧 serverErrors**

`requestSave` 的 `clearValidationErrors(surfaceId)` 之后加一行（约第 122 行）：

```ts
    setServerErrors(prev => { const next = { ...prev }; delete next[surfaceId]; return next })
```

（保持与 `clearValidationErrors` 并列，确保重新 save 时不残留上次字段错误。）

- [ ] **Step 8：实现 — state 返回对象加 `serverErrors`**

`const state: CnuiLifecycleState = { ... }`（约第 177 行）内，`validationErrors,` 之后加：

```ts
    serverErrors,
```

- [ ] **Step 9：修 wrapper 测试 fixture（类型变更必断）**

`frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx` 的 `makeLifecycle`（第 24-30 行），`validationErrors: {},` 之后加：

```ts
    serverErrors: {},
```

- [ ] **Step 10：扫其它 `CnuiLifecycleState` 字面量 fixture**

Run: `cd frontend && grep -rn "validationErrors: {}" src --include="*.test.*"`
对每个命中文件，在其 `validationErrors` 字面量旁补 `serverErrors: {}`（与 Step 9 同法）。已知命中：`cnui-surface-wrapper.test.tsx`；若 `conversation-view.test.tsx` / `page-mode-toggle.test.tsx` 也构造该 state 则一并补。

- [ ] **Step 11：跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx`
Expected: PASS（4 lifecycle 新测 + 既有 wrapper 测全过）。

- [ ] **Step 12：tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS（vitest 不查类型，必须 tsc）

- [ ] **Step 13：Commit**

```bash
git add frontend/src/components/cnui/use-cnui-lifecycle.ts frontend/src/components/cnui/__tests__/use-cnui-lifecycle.test.tsx frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx
# 加上 Step 10 扫到的其它 fixture 文件
git commit -m "fix(cnui): [019.0] lifecycle onSubmit 结果契约 + serverErrors + saved bug 修复"
```

---

## Task 3：`conversation-view` 包装器返回结果 + prop 类型

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx:58`（prop 类型）+ `:102-112`（onSubmit 包装器）

- [ ] **Step 1：导入 `CnuiSubmitResult`**

`conversation-view.tsx` 顶部 import 区（已有 `import { useCnuiLifecycle } from "@/components/cnui/use-cnui-lifecycle"`），改为：

```ts
import { useCnuiLifecycle, type CnuiSubmitResult } from "@/components/cnui/use-cnui-lifecycle"
```

- [ ] **Step 2：`onCnuiConfirm` prop 类型改契约**

`ConversationViewProps`（约第 58 行），把：

```ts
  onCnuiConfirm?: (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
```

改为：

```ts
  onCnuiConfirm?: (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<CnuiSubmitResult>
```

- [ ] **Step 3：onSubmit 包装器返回结果**

约第 102-112 行，把：

```ts
  const [lifecycleState, lifecycleActions] = useCnuiLifecycle(
    useCallback(
      async (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
        if (!onCnuiConfirm) return
        await onCnuiConfirm(surfaceId, domainId, action, data)
      },
      [onCnuiConfirm]
    ),
    mergedInitialStates,
    onSurfaceStateChange,
  )
```

改为：

```ts
  const [lifecycleState, lifecycleActions] = useCnuiLifecycle(
    useCallback(
      async (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>): Promise<CnuiSubmitResult> => {
        // [019.0] Lane B：把真实提交结果回传给 lifecycle，供其按 success 决定终态 + 透传 serverErrors
        if (!onCnuiConfirm) return { success: false }
        return await onCnuiConfirm(surfaceId, domainId, action, data)
      },
      [onCnuiConfirm]
    ),
    mergedInitialStates,
    onSurfaceStateChange,
  )
```

- [ ] **Step 4：tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 此时 `handleCnuiConfirm`（Task 4）仍是 void 返回、与 `onCnuiConfirm` 新类型不符 → **预期 FAIL**（`Type 'void' is not assignable to ...Promise<CnuiSubmitResult>`）。这是下一 Task 修。**记录报错行**，进 Task 4。

- [ ] **Step 5：Commit（与 Task 4 合并提交，避免中间不可编译态）**

> 不单独 commit；Task 4 完成后一并提交（本 Task + Task 4 共同恢复编译）。

---

## Task 4：`handleCnuiConfirm` 返回 `CnuiSubmitResult`

**Files:**
- Modify: `frontend/src/hooks/use-intent-handler.ts:372-419`（`handleCnuiConfirm`）

- [ ] **Step 1：导入 `CnuiSubmitResult`**

`use-intent-handler.ts` 顶部 import 区加：

```ts
import type { CnuiSubmitResult } from '@/components/cnui/use-cnui-lifecycle'
```

- [ ] **Step 2：`handleCnuiConfirm` 返回结果**

把第 372-419 行的 `handleCnuiConfirm` 整体替换为：

```ts
  /** 处理 CN-UI 表面提交 — [019.0] Lane B：返回结果契约供 lifecycle 决定终态 + 回填 */
  const handleCnuiConfirm = useCallback(
    async (
      cnuiSurfaceId: string,
      domainId: string,
      action: string,
      data: Record<string, unknown>
    ): Promise<CnuiSubmitResult> => {
      try {
        const result = await submitCnuiSurface(
          cnuiSurfaceId,
          domainId,
          action,
          data
        )
        if (result.success) {
          const content = cnuiActionMessages[action]?.(result as unknown as Record<string, unknown>) ?? '操作成功！'
          const msg: ChatMessage = {
            role: "assistant",
            content,
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(msg)
          void recordActivity({
            activityType: "cnui_action",
            source: "cnui_surface",
            targetDomain: domainId,
            targetAction: action,
          })
        } else {
          // [019.0] Lane B：失败仍发一条 system 消息（表单级可见），同时把字段级 errors 回传
          const msg: ChatMessage = {
            role: "system",
            content: `操作失败: ${result.error}`,
            timestamp: new Date().toISOString(),
          }
          deps.addChatMessage(msg)
        }
        // 回传契约：字段级 serverErrors（handler.submit 拆分自 Rejected.errors）
        return { success: result.success, serverErrors: result.errors }
      } catch (e) {
        console.error("submitCnuiSurface failed:", e)
        const msg: ChatMessage = {
          role: "system",
          content: "网络错误，请重试",
          timestamp: new Date().toISOString(),
        }
        deps.addChatMessage(msg)
        return { success: false }
      }
    },
    []
  )
```

- [ ] **Step 3：tsc 双验证（Task 3 + Task 4 一起恢复编译）**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS（Task 3 引入的 `handleCnuiConfirm` 类型不符已消除）

- [ ] **Step 4：Commit（Task 3 + Task 4 合并）**

```bash
git add frontend/src/components/layout/conversation-view.tsx frontend/src/hooks/use-intent-handler.ts
git commit -m "fix(cnui): [019.0] onCnuiConfirm/handleCnuiConfirm 返回结果契约（透传 serverErrors）"
```

---

## Task 5：`CnuiSurfaceWrapper` 透传 serverErrors（TDD）

**Files:**
- Modify: `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx:65-68`（取 serverErrors）+ `:175-183`（传给 renderer）
- Test: `frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx`（扩透传断言）

- [ ] **Step 1：先写失败测试 — 让 mock CnuiRenderer 捕获 props**

`cnui-surface-wrapper.test.tsx` 顶部 mock 改为捕获 props：

```ts
const rendererProps = { current: {} as Record<string, unknown> }
vi.mock('../CnuiRenderer', () => ({
  CnuiRenderer: (props: Record<string, unknown>) => {
    rendererProps.current = props
    return <div data-testid="cnui-renderer" />
  },
}))
```

在文件末尾新增 describe：

```ts
describe('CnuiSurfaceWrapper [019.0] serverErrors 透传', () => {
  it('把 lifecycleState.serverErrors 透传给 CnuiRenderer', () => {
    const [state, actions] = makeLifecycle()
    state.serverErrors = { s1: ['标题不能为空'] }
    render(
      <CnuiSurfaceWrapper
        {...baseProps}
        lifecycleState={state}
        lifecycleActions={actions}
      />
    )
    expect(rendererProps.current.serverErrors).toEqual(['标题不能为空'])
  })

  it('无 serverErrors 时传 undefined（不污染 surface）', () => {
    const [state, actions] = makeLifecycle()
    render(
      <CnuiSurfaceWrapper
        {...baseProps}
        lifecycleState={state}
        lifecycleActions={actions}
      />
    )
    expect(rendererProps.current.serverErrors).toBeUndefined()
  })
})
```

- [ ] **Step 2：跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx`
Expected: FAIL（`CnuiRenderer` 未收到 `serverErrors`）

- [ ] **Step 3：实现 — 取 serverErrors 并透传**

`CnuiSurfaceWrapper.tsx` 第 65-68 行（state 派生区），`const errors = ...` 之后加：

```ts
  const serverErrors = lifecycleState.serverErrors[surfaceId]
```

第 175-183 行 `<CnuiRenderer ... />`，`isDone={false}` 之前加一行：

```tsx
            serverErrors={serverErrors}
```

- [ ] **Step 4：跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add frontend/src/components/cnui/CnuiSurfaceWrapper.tsx frontend/src/components/cnui/__tests__/cnui-surface-wrapper.test.tsx
git commit -m "fix(cnui): [019.0] CnuiSurfaceWrapper 透传 serverErrors 给 renderer"
```

---

## Task 6：`CnuiRenderer` 加 `serverErrors` prop 并转发

**Files:**
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx:17-34`（props interface）+ `:45-54`（渲染转发）

- [ ] **Step 1：props interface 加字段**

`CnuiRenderer.tsx` 的 `interface CnuiRendererProps`（约第 17 行），`isDone?: boolean` 之后加：

```ts
  /** [019.0] Lane B：服务端字段错误，透传给 surface 组件回填 */
  serverErrors?: string[]
```

- [ ] **Step 2：解构 + 转发给 Component**

函数签名解构（约第 34 行）加 `serverErrors`：

```ts
export function CnuiSurfaceWrapper — // (占位，实际是 CnuiRenderer)
export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, serverErrors }: CnuiRendererProps) {
```

`<Component ... />`（约第 49-54 行）`isDone={isDone}` 之后加：

```tsx
        serverErrors={serverErrors}
```

- [ ] **Step 3：tsc + 表面类型核对**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS（3 个 tasks surface 组件 props 已声明 `serverErrors?: string[]`，转发类型吻合）

- [ ] **Step 4：跑相关测试无回归**

Run: `cd frontend && npx vitest run src/components/cnui/ src/domains/tasks/__tests__/cnui-realtime.test.tsx`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add frontend/src/components/cnui/CnuiRenderer.tsx
git commit -m "fix(cnui): [019.0] CnuiRenderer 转发 serverErrors 给 surface 组件"
```

---

## Task 7：全量验证（Change Delivery Gate）

- [ ] **Step 1：全量 tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS（0 error）

- [ ] **Step 2：全量 vitest（聚焦改动文件 + 回归）**

Run: `cd frontend && npx vitest run src/components/cnui/ src/components/layout/ src/hooks/ src/domains/tasks/__tests__/`
Expected: 改动相关全 PASS；回归无新增失败（用 base/head 失败集合对比，勿用硬编码失败数）

- [ ] **Step 3：lint**

Run: `cd frontend && npm run lint`
Expected: PASS（注意 set-state-in-effect 类规则；本 Lane 用 setState 在 callback 内，不触发）

- [ ] **Step 4：validator 门禁（husky pre-push 同款）**

Run: `cd frontend && npm run validate:manifest && npm run validate:structure`
Expected: PASS（本 Lane 未触碰 manifest/写入口/registry 结构）

- [ ] **Step 5：手动验证（建议 /browse）**

启动 dev，在 AI 对话触发一个 tasks CNUI surface（如创建任务填非法值），观察：提交失败时字段标红（`serverErrors` 回填生效）、surface 仍可编辑（未被标 saved）、再次提交成功后清空。

- [ ] **Step 6：如全绿，进入 `/superpowers:requesting-code-review` → finishing-a-development-branch**

---

## Self-Review（plan 自检）

**1. Spec 覆盖**：L6-1（可编辑 surface 消费 serverErrors，CI 可判）← Task 5+6 透传 + surface 已消费；L6-2（提交失败字段标红/surface 可编辑）← Task 2 saved bug 修复 + serverErrors 存储；onSubmit 结果契约 ← Task 2-4。三层 bug 全覆盖。✅

**2. 占位符扫描**：无 TBD/TODO/"类似 Task N"；每步含完整代码与确切命令。✅（Task 3 Step 5 故意不单独 commit 是因中间态不可编译，已注明与 Task 4 合并）

**3. 类型一致性**：`CnuiSubmitResult`（Task 2 定义）→ `useCnuiLifecycle.onSubmit`（Task 2）→ `onCnuiConfirm` prop（Task 3）→ `handleCnuiConfirm` 返回（Task 4）同名同形贯穿；`HabitActionResult.errors`（Task 1）↔ `CnuiSurfaceSubmitResult.errors`（既有）↔ `handleCnuiConfirm` 的 `result.errors`（Task 4）一致；`serverErrors: string[]`（state/prop/surface）三处同形。✅
