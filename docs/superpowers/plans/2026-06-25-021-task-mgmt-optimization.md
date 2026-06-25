# [021] 任务管理 Domain 优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复任务管理 Domain 的两个 bug（删主线不消失、子任务刷新）并完成 4 项体验优化（时长双框、新建任务抽屉入口、面包屑动态根、清理两个 AI action），使「创建 → 树形管理 → 抽屉编辑」链路行为一致。

**Architecture:** 纯前端组件层改动，无 DB/USOM schema 变更。新增 `TaskCreateDrawer` 作为 02b/02c/03b 共用的新建任务抽屉；bug 修复走「复现测试 → 修复」TDD；可测逻辑抽为纯函数单测，重组件 UI 接线靠 tsc + /browse E2E 验证。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / vitest（jsdom + globals）/ @testing-library/react / sonner。

**Spec:** `docs/superpowers/specs/2026-06-25-021-task-mgmt-optimization-design.md`
**分支:** `feat/021-task-mgmt-optimization`

---

## 测试与命令约定（所有任务通用）

- **测试 cwd 必须是 `frontend/`**（`@/` 别名，repo root 跑会假失败，见 memory [[feedback_vitest-pitfalls]]）
- 跑单测：`cd frontend && npm run test -- <pattern>`（`npm run test` = `vitest run`）
- 类型检查：`cd frontend && npx tsc --noEmit`（vitest 不做类型检查，必须 tsc 双验证）
- 仅跑被改文件的失败集合对比（见 [[feedback_change-gate-baseline]]），不硬编码失败数
- server action mock 标准模式（vitest，globals 已开，describe/it/expect 免 import）：

```typescript
vi.mock('@/app/actions/tasks', () => ({
  getThreads: vi.fn(),
  deleteThread: vi.fn(),
  createTask: vi.fn(),
  getSubtasks: vi.fn(),
  // ...仅 mock 被测组件用到的
}))
```

- sonner mock（组件含 toast 时）：

```typescript
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
```

---

## 文件结构总览

**新增**：
- `frontend/src/domains/tasks/components/task-create-drawer.tsx` — 新建任务抽屉（Task 3）

**修改**：
- `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx` — 时长双框（Task 2）
- `frontend/src/lib/format-duration.ts` — 无改动（仅补测试，Task 2）
- `frontend/src/domains/tasks/components/thread-list-panel.tsx` — 删主线走 deleteThread（Task 4）
- `frontend/src/domains/tasks/components/subtask-list.tsx` — onChanged 回调 + + 按钮开抽屉（Task 5/6）
- `frontend/src/domains/tasks/components/task-tree-view.tsx` — 抽 resolveThreadFromFilter + 02b/02c 入口（Task 6）
- `frontend/src/domains/tasks/components/task-detail-drawer.tsx` — 面包屑动态根 + 转发回调（Task 6/7）
- `frontend/src/domains/tasks/pages/TaskTreePage.tsx` — DrawerState 扩展 create + 接线（Task 6）

**04 清理（Task 1）**：manifest.yaml、cnui/handlers.ts、cnui/surfaces/TaskActionPanel.tsx、cnui/surfaces/TaskSplitCard.tsx（删）、index.ts、hooks.ts、hooks/use-intent-handler.ts、components/system-cognition-panel.tsx

---

## Task 1: 清理两个 AI action（refineTask / splitTask）

**类型：** 删除（验证驱动，无新单测；确保 tsc 通过 + grep 无残留 + vitest 基线不破）。

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`
- Modify: `frontend/src/domains/tasks/cnui/handlers.ts`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`
- Delete: `frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx`
- Modify: `frontend/src/domains/tasks/index.ts`
- Modify: `frontend/src/domains/tasks/hooks.ts`
- Modify: `frontend/src/hooks/use-intent-handler.ts`
- Modify: `frontend/src/domains/tasks/components/system-cognition-panel.tsx`

> 删除任务的定位方式：每个步骤用 `grep -n "<锚点>"` 定位（行号会随删除偏移），用 Edit 精确删除锚点片段。**保留** `task-action-panel` surface 及 complete/archive/delete 相关代码。

- [ ] **Step 1: 删 manifest.yaml 的 action 注册与 surface 声明**

  定位并删除 `frontend/src/domains/tasks/manifest.yaml` 中：

  ```yaml
  - action: refineTask
    shortcut: /refineTask
    description: AI 帮助细化模糊任务
    response_type: cnui
    cnui_surface: task-action-panel
    examples:
      - 细化这个任务
      - 帮我拆解任务
    keywords: [细化, refine, 拆解]
  ```
  ```yaml
  - action: splitTask
    shortcut: /splitTask
    description: AI 建议拆分可拆分任务
    response_type: cnui
    cnui_surface: task-split-card
    examples:
      - 拆分这个任务
      - 建议子任务
    keywords: [拆分, split, 子任务]
  ```

  以及 `cnui_surfaces:` 下：
  ```yaml
    task-split-card:
      handler: ./cnui/handlers
  ```
  **保留** `task-action-panel:` surface（仍承载 complete/archive/delete）。

  定位命令：`cd frontend && grep -n "refineTask\|splitTask\|task-split-card" src/domains/tasks/manifest.yaml`

- [ ] **Step 2: 删 handlers.ts 的 refineTask/splitTask 处理**

  `cd frontend && grep -n "refineTask\|splitTask\|task-split-card" src/domains/tasks/cnui/handlers.ts`

  删除以下片段（用 grep 定位实际行）：
  - `if (action === 'refineTask') { ... }` 整块（查询模糊任务返回 content/dataSnapshot）
  - `if (action === 'splitTask') { ... }` 整块
  - 提交处理中 `if (action === 'refineTask') { return { success: true, ... } }` 与 `if (action === 'splitTask') { return { success: true, ... } }` 两块
  - handler 导出映射中 `'task-split-card': taskCnuiHandler,` 行

- [ ] **Step 3: 删 TaskActionPanel.tsx 的 refine 标签**

  `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`：
  - 删 `ACTION_LABELS` 中的 `refine: { title: '细化任务', button: '细化所选' },`（:43）
  - 文件头注释 `@brief` 行的「refineTask」字样移除（:5）：改为 `处理 completeTask、archiveTask、deleteTask 等任务操作。`

  组件渲染逻辑无需改（refine 已无入口，`ACTION_LABELS[action] ?? ACTION_LABELS.complete` 兜底）。

- [ ] **Step 4: 删 TaskSplitCard.tsx 整个文件 + 取消注册**

  ```bash
  rm frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx
  ```

  `frontend/src/domains/tasks/index.ts`：
  - 删 `import { TaskSplitCard } ...` 行（`grep -n "TaskSplitCard" src/domains/tasks/index.ts`）
  - 删 registry 注册块：
    ```typescript
    cnuiRegistry.register('tasks', 'task-split-card', {
      component: TaskSplitCard,
      handlerModulePath,
    })
    ```
  **保留** `task-action-panel` 的 register 块。

- [ ] **Step 5: 删 hooks.ts 的 refine_task/split_task cue**

  `cd frontend && grep -n "refine_task\|split_task\|refine-\|task-refine\|task-split" src/domains/tasks/hooks.ts`

  删除 `onActionSurfaceRequest` 中两块 cue push：
  - `if (task.clarity === 'fuzzy') { actions.push({ ... actionType: 'refine_task' ... }) }`
  - `if (task.decomposition === 'splittable') { actions.push({ ... actionType: 'split_task' ... }) }`

- [ ] **Step 6: 删 use-intent-handler.ts 的成功消息**

  `cd frontend && grep -n "refineTask\|splitTask" src/hooks/use-intent-handler.ts`

  删除：
  ```typescript
  refineTask: () => '细化请求已提交，AI 将分析任务并给出建议',
  splitTask: () => '拆分请求已提交，AI 将分析任务并给出建议',
  ```

- [ ] **Step 7: 删 system-cognition-panel.tsx 的拆分提示**

  `frontend/src/domains/tasks/components/system-cognition-panel.tsx`：
  - 删除 :172-177 的 Lightbulb 提示块：
    ```tsx
    {task.decomposition === 'splittable' && (
      <p className="mt-1 flex items-center gap-1 text-xs text-warning">
        <Lightbulb className="size-3" />
        AI 建议：此任务可拆分为更小的子任务
      </p>
    )}
    ```
  - **保留** `DECOMPOSITION_LABELS` 纯展示（拆分状态文字标签）
  - 删除 `import { Brain, Lightbulb } from 'lucide-react'` 中的 `Lightbulb`（如已无其他引用）→ 改为 `import { Brain } from 'lucide-react'`。先 `grep -n "Lightbulb" src/domains/tasks/components/system-cognition-panel.tsx` 确认仅此一处。

- [ ] **Step 8: 验证清理彻底**

  ```bash
  cd frontend
  grep -rn "refineTask\|splitTask\|task-split-card\|TaskSplitCard\|refine_task\|split_task" src/ || echo "✅ 无残留"
  ```
  Expected: 仅可能在注释/无关处命中；**src 内不应有功能性引用**。如有命中，逐一确认是否需清除。

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error（删 TaskSplitCard 后 index.ts 不再 import，无悬空引用）。

- [ ] **Step 9: 回归 vitest 基线**

  ```bash
  cd frontend && npm run test
  ```
  Expected: 通过数 ≥ 基线（无新增失败）。tasks 域测试（`src/domains/tasks/__tests__/`）应全绿。

- [ ] **Step 10: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  chore(tasks): [021] T1 删除 refineTask/splitTask 两个 AI action

  彻底删除入口与 cue：manifest action/surface、handlers 处理、TaskSplitCard 文件、
  TaskActionPanel refine 标签、index 注册、hooks cue、use-intent-handler 消息、
  system-cognition-panel 拆分提示。保留 task-action-panel（承载 complete/archive/delete）
  与底层 calculateClarity/calculateDecomposition 字段评估。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: 创建任务 CNUI 时长改双框

**Files:**
- Test: `frontend/src/lib/__tests__/format-duration.test.ts`（新建）
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx:58-60,148-167`

- [ ] **Step 1: 写 format-duration 纯函数测试（失败）**

  新建 `frontend/src/lib/__tests__/format-duration.test.ts`：

  ```typescript
  import { describe, it, expect } from 'vitest'
  import {
    formatDuration,
    parseDurationToMinutes,
    durationHours,
    durationMinutes,
  } from '@/lib/format-duration'

  describe('formatDuration', () => {
    it('分钟数转中文时长', () => {
      expect(formatDuration(90)).toBe('1小时30分钟')
      expect(formatDuration(45)).toBe('45分钟')
      expect(formatDuration(120)).toBe('2小时')
      expect(formatDuration(0)).toBe('')
      expect(formatDuration(null)).toBe('')
      expect(formatDuration(undefined)).toBe('')
    })
  })

  describe('parseDurationToMinutes', () => {
    it('小时+分钟字符串合并为总分钟', () => {
      expect(parseDurationToMinutes('2', '30')).toBe(150)
      expect(parseDurationToMinutes('1', '0')).toBe(60)
      expect(parseDurationToMinutes('', '45')).toBe(45)
      expect(parseDurationToMinutes('', '')).toBe(0)
    })
  })

  describe('durationHours / durationMinutes', () => {
    it('从总分钟拆出小时与分钟字符串', () => {
      expect(durationHours(150)).toBe('2')
      expect(durationMinutes(150)).toBe('30')
      expect(durationHours(45)).toBe('0')
      expect(durationMinutes(45)).toBe('45')
      expect(durationHours(null)).toBe('')
      expect(durationMinutes(undefined)).toBe('')
    })
  })
  ```

- [ ] **Step 2: 跑测试验证通过（函数已存在，应直接绿）**

  ```bash
  cd frontend && npm run test -- format-duration
  ```
  Expected: PASS（`lib/format-duration.ts` 已实现这些函数；此测试为既有逻辑补防护）。

- [ ] **Step 3: 改 TaskCreationCard 时长为双框**

  `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`：

  顶部 import 加：
  ```typescript
  import { durationHours, durationMinutes, parseDurationToMinutes } from '@/lib/format-duration'
  ```

  state（替换 :58-60 单一 `estimatedDuration`）：
  ```typescript
  const [durHours, setDurHours] = useState(() =>
    dataModel.estimatedDuration ? durationHours(Number(dataModel.estimatedDuration)) : '',
  )
  const [durMinutes, setDurMinutes] = useState(() =>
    dataModel.estimatedDuration ? durationMinutes(Number(dataModel.estimatedDuration)) : '',
  )
  ```

  `handleConfirm` 中 `estimatedDuration` 改为按双框计算（替换原 `estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined`）：
  ```typescript
  const totalMinutes = parseDurationToMinutes(durHours, durMinutes)
  // ...onConfirm 内：
  estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
  ```

  UI：把 :147-167 的「预估时长（分钟）」单框替换为双框（label 改「预估时长」）：
  ```tsx
  <div>
    <label className="text-xs text-body mb-1 block">预估时长</label>
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        value={durHours}
        onChange={e => {
          setDurHours(e.target.value)
          const total = parseDurationToMinutes(e.target.value, durMinutes)
          onDataChange({ ...dataModel, estimatedDuration: total > 0 ? total : undefined })
        }}
        onBlur={() => {
          const total = parseDurationToMinutes(durHours, durMinutes)
          validateField('estimatedDuration', total || undefined)
        }}
        placeholder="0"
        className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
      />
      <span className="text-xs text-body shrink-0">时</span>
      <input
        type="number"
        min={0}
        max={59}
        value={durMinutes}
        onChange={e => {
          setDurMinutes(e.target.value)
          const total = parseDurationToMinutes(durHours, e.target.value)
          onDataChange({ ...dataModel, estimatedDuration: total > 0 ? total : undefined })
        }}
        placeholder="0"
        className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
      />
      <span className="text-xs text-body shrink-0">分</span>
    </div>
    {(fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration) && (
      <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration}</p>
    )}
  </div>
  ```
  > 注：该字段在 :127 `grid grid-cols-2` 内与「优先级」并列，保持外层 `<div>` 结构不变。

- [ ] **Step 4: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 5: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  feat(tasks): [021] T2 创建任务 CNUI 时长改双框（小时+分钟）

  TaskCreationCard 时长由单框分钟改为双框，与详情页 DurationEdit 一致；
  复用 format-duration 工具（durationHours/durationMinutes/parseDurationToMinutes）；
  补 format-duration 纯函数测试。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: 新建任务抽屉 TaskCreateDrawer

**Files:**
- Create: `frontend/src/domains/tasks/components/task-create-drawer.tsx`
- Test: `frontend/src/domains/tasks/components/__tests__/task-create-drawer.test.tsx`（新建）

- [ ] **Step 1: 写失败测试**

  新建 `frontend/src/domains/tasks/components/__tests__/task-create-drawer.test.tsx`：

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'

  const createTaskMock = vi.fn()
  const getThreadsMock = vi.fn()
  vi.mock('@/app/actions/tasks', () => ({
    createTask: (...args: unknown[]) => createTaskMock(...args),
    getThreads: (...args: unknown[]) => getThreadsMock(...args),
  }))
  vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

  import { TaskCreateDrawer, type TaskCreateDefaults } from '../task-create-drawer'

  const baseProps = (defaults: TaskCreateDefaults = {}) => ({
    defaults,
    userId: 'user-1' as never,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  })

  describe('TaskCreateDrawer', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      getThreadsMock.mockResolvedValue([])
      createTaskMock.mockResolvedValue({ id: 'task-new', title: 'x' })
    })

    it('defaults.title 预填到标题输入框', () => {
      render(<TaskCreateDrawer {...baseProps({ title: '来自快速添加' })} />)
      expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('来自快速添加')
    })

    it('填写后提交调用 createTask 含预填 parentId/title', async () => {
      const user = userEvent.setup()
      render(<TaskCreateDrawer {...baseProps({ parentId: 'parent-1' })} />)
      await user.type(screen.getByLabelText('标题'), '新子任务')
      await user.click(screen.getByRole('button', { name: /创建任务/ }))
      await waitFor(() => {
        expect(createTaskMock).toHaveBeenCalledTimes(1)
      })
      const payload = createTaskMock.mock.calls[0][0] as Record<string, unknown>
      expect(payload.title).toBe('新子任务')
      expect(payload.parentId).toBe('parent-1')
    })

    it('空标题时禁用提交按钮', () => {
      render(<TaskCreateDrawer {...baseProps()} />)
      expect(screen.getByRole('button', { name: /创建任务/ })).toBeDisabled()
    })
  })
  ```

- [ ] **Step 2: 跑测试验证失败**

  ```bash
  cd frontend && npm run test -- task-create-drawer
  ```
  Expected: FAIL（模块 `../task-create-drawer` 不存在）。

- [ ] **Step 3: 实现 TaskCreateDrawer**

  新建 `frontend/src/domains/tasks/components/task-create-drawer.tsx`：

  ```typescript
  /**
   * @file task-create-drawer
   * @brief 新建任务抽屉 — 右侧滑入，支持预填（title/threadId/parentId）
   *
   * 02b/02c/03b 共用：从「在下方新建子任务」、快速添加「+」、子任务区「+」入口打开。
   * 字段集对齐 TaskCreationCard；提交走 createTask；外壳样式对齐 TaskDetailDrawer。
   */

  'use client'

  import { useState, useEffect, useCallback } from 'react'
  import { X } from 'lucide-react'
  import { toast } from 'sonner'
  import { createTask, getThreads } from '@/app/actions/tasks'
  import { durationHours, durationMinutes, parseDurationToMinutes } from '@/lib/format-duration'
  import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
  import { taskRuleRegistry } from '../../rules-registry'
  import type { Task, Thread } from '../../../usom/types/objects'
  import type { USOM_ID } from '../../../usom/types/primitives'
  import { Button } from '@/components/ui/button'

  /** 新建任务预填项 */
  export interface TaskCreateDefaults {
    /** 预填标题（来自快速添加框已输入文本） */
    title?: string
    /** 预填主线归属 */
    threadId?: string
    /** 预填父任务（子任务入口） */
    parentId?: string
  }

  /** TaskCreateDrawer Props */
  interface TaskCreateDrawerProps {
    defaults: TaskCreateDefaults
    userId: USOM_ID
    onClose: () => void
    onCreated: (task: Task) => void
  }

  /** 抽屉宽度约束（对齐 TaskDetailDrawer） */
  const DEFAULT_WIDTH = 560

  const PRIORITY_OPTIONS = [
    { value: '', label: '不设置' },
    { value: 'critical', label: '紧急' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ]

  /**
   * 新建任务抽屉组件
   */
  export function TaskCreateDrawer({ defaults, onClose, onCreated }: TaskCreateDrawerProps) {
    const [title, setTitle] = useState(defaults.title ?? '')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('')
    const [durHours, setDurHours] = useState('')
    const [durMinutes, setDurMinutes] = useState('')
    const [threadId, setThreadId] = useState<string>(defaults.threadId ?? '')
    const [threads, setThreads] = useState<Thread[]>([])
    const [submitting, setSubmitting] = useState(false)

    const { errors: fieldErrors, validateField } = useManifestRules(taskRuleRegistry)

    // 加载主线列表（下拉用）
    useEffect(() => {
      let cancelled = false
      getThreads().then(data => { if (!cancelled) setThreads(data.map(d => d.thread)) })
        .catch(() => { /* 静默：主线加载失败不阻塞创建 */ })
      return () => { cancelled = true }
    }, [])

    const handleSubmit = useCallback(async () => {
      const trimmed = title.trim()
      if (!trimmed || submitting) return
      const totalMinutes = parseDurationToMinutes(durHours, durMinutes)
      setSubmitting(true)
      try {
        const created = await createTask({
          title: trimmed,
          description: description || undefined,
          priority: priority || undefined,
          estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
          threadId: threadId || undefined,
          parentId: defaults.parentId || undefined,
        } as Parameters<typeof createTask>[0])
        toast.success(defaults.parentId ? '子任务已创建' : '任务已创建')
        onCreated(created)
      } catch (e) {
        console.error('[TaskCreateDrawer] 创建失败:', e)
        toast.error('创建任务失败，请重试')
      } finally {
        setSubmitting(false)
      }
    }, [title, description, priority, durHours, durMinutes, threadId, defaults.parentId, submitting, onCreated])

    // ESC 关闭
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
      <>
        {/* 遮罩层 */}
        <div
          className="fixed inset-0 md:left-[260px] z-30 bg-scrim animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* 抽屉主体 */}
        <div
          className="fixed top-0 right-0 z-40 h-full bg-canvas border-l border-hairline shadow-xl flex flex-col animate-in slide-in-from-right duration-300"
          style={{ width: DEFAULT_WIDTH }}
          role="dialog"
          aria-modal="true"
          aria-label="新建任务"
          onClick={e => e.stopPropagation()}
        >
          {/* 顶部栏 */}
          <div className="flex items-center justify-between shrink-0 px-5 py-3 border-b border-hairline-soft">
            <h2 className="text-sm font-semibold text-ink">
              {defaults.parentId ? '新建子任务' : '新建任务'}
            </h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-body/60 hover:text-ink hover:bg-hover-overlay transition-colors" aria-label="关闭">
              <X className="size-4" />
            </button>
          </div>

          {/* 表单 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="text-xs text-body mb-1 block">标题 <span className="text-error">*</span></label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={() => validateField('title', title.trim())}
                placeholder="例如：完成周报"
                maxLength={100}
                autoFocus
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              {fieldErrors.title && <p className="text-xs text-error mt-0.5">{fieldErrors.title}</p>}
            </div>

            <div>
              <label className="text-xs text-body mb-1 block">描述</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="任务描述…"
                maxLength={500}
                rows={2}
                className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-body mb-1 block">优先级</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  onBlur={() => validateField('priority', priority)}
                  className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                >
                  {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-body mb-1 block">预估时长</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} value={durHours}
                    onChange={e => setDurHours(e.target.value)}
                    onBlur={() => validateField('estimatedDuration', parseDurationToMinutes(durHours, durMinutes) || undefined)}
                    placeholder="0"
                    className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                  <span className="text-xs text-body shrink-0">时</span>
                  <input
                    type="number" min={0} max={59} value={durMinutes}
                    onChange={e => setDurMinutes(e.target.value)}
                    placeholder="0"
                    className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                  <span className="text-xs text-body shrink-0">分</span>
                </div>
                {fieldErrors.estimatedDuration && <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration}</p>}
              </div>
            </div>

            <div>
              <label className="text-xs text-body mb-1 block">主线</label>
              <select
                value={threadId}
                onChange={e => setThreadId(e.target.value)}
                disabled={!!defaults.parentId}
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
              >
                <option value="">普通任务（无主线）</option>
                {threads.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {defaults.parentId && (
                <p className="text-xs text-body/70 mt-0.5">子任务归属父任务所在主线</p>
              )}
            </div>
          </div>

          {/* 底部操作 */}
          <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || submitting}>
              创建任务
            </Button>
          </div>
        </div>
      </>
    )
  }
  ```

- [ ] **Step 4: 跑测试验证通过**

  ```bash
  cd frontend && npm run test -- task-create-drawer
  ```
  Expected: 3 tests PASS。若 `useManifestRules` 渲染报错，确认 `taskRuleRegistry` 为纯模块常量（无需 mock）；如仍报错，加 `vi.mock('@/nexus/rules/use-manifest-rules', () => ({ useManifestRules: () => ({ errors: {}, validateField: vi.fn() }) }))`。

- [ ] **Step 5: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 6: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  feat(tasks): [021] T3 新建任务抽屉 TaskCreateDrawer

  02b/02c/03b 共用基础设施：右侧滑入抽屉，字段对齐 TaskCreationCard，
  支持预填 title/threadId/parentId，提交走 createTask。外壳样式对齐
  TaskDetailDrawer。含组件测试（预填/提交/禁用态）。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: 修复 02a 删除主线 bug

**Files:**
- Test: `frontend/src/domains/tasks/components/__tests__/thread-list-panel.test.tsx`（新建）
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx:69-74,323-330`

- [ ] **Step 1: 写复现测试（失败）**

  新建 `frontend/src/domains/tasks/components/__tests__/thread-list-panel.test.tsx`：

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, waitFor, act } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'

  const getThreadsMock = vi.fn()
  const getOrphanTaskCountMock = vi.fn()
  const deleteThreadMock = vi.fn()
  const updateThreadStatusMock = vi.fn()
  vi.mock('@/app/actions/tasks', () => ({
    getThreads: (...a: unknown[]) => getThreadsMock(...a),
    getOrphanTaskCount: (...a: unknown[]) => getOrphanTaskCountMock(...a),
    deleteThread: (...a: unknown[]) => deleteThreadMock(...a),
    updateThreadStatus: (...a: unknown[]) => updateThreadStatusMock(...a),
  }))
  vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

  import { ThreadListPanel } from '../thread-list-panel'

  // 一个已归档主线（仅 archived 状态允许删除，见 getAllowedActions）
  const archivedThread = {
    thread: { id: 't1', name: '旧主线', status: 'archived', color: null },
    taskCount: 0,
    completedTaskCount: 0,
  }

  describe('ThreadListPanel — 删除主线', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      getThreadsMock.mockResolvedValue([archivedThread])
      getOrphanTaskCountMock.mockResolvedValue(0)
      deleteThreadMock.mockResolvedValue(undefined)
    })

    it('点删除调用 deleteThread（而非 updateThreadStatus）', async () => {
      const user = userEvent.setup()
      render(
        <ThreadListPanel
          selectedThreadId="__all__"
          onSelectThread={vi.fn()}
          onOpenThreadDetail={vi.fn()}
        />,
      )
      await waitFor(() => expect(screen.getByText('旧主线')).toBeInTheDocument())

      // 打开「...」菜单
      const menuButtons = screen.getAllByRole('button')
      const moreBtn = menuButtons.find(b => b.getAttribute('aria-label') === undefined && b.querySelector('svg'))
      // 用文本「删除」兜底：先点开任意 ... 按钮
      await act(async () => {
        // 第一个 ... 按钮在「旧主线」行
        ;(screen.getByText('旧主线').closest('[role="button"]') as HTMLElement)
          .querySelector('button')!.click()
      })
      const deleteBtn = await screen.findByText('删除')
      await user.click(deleteBtn)

      await waitFor(() => expect(deleteThreadMock).toHaveBeenCalledWith('t1'))
      expect(updateThreadStatusMock).not.toHaveBeenCalled()
    })
  })
  ```
  > 说明：菜单按钮无 aria-label，测试用「先展开行内 ... 按钮 → 出现「删除」文本 → 点击」链路定位。如选择器不稳，改用 `screen.getAllByText`/`container.querySelector` 兜底，断言核心是 `deleteThreadMock` 被调用且 `updateThreadStatusMock` 未被调用。

- [ ] **Step 2: 跑测试验证失败（复现 bug）**

  ```bash
  cd frontend && npm run test -- thread-list-panel
  ```
  Expected: FAIL — 当前删除分支走 `updateThreadStatus`（且因无 delete 映射被跳过），`deleteThreadMock` 未被调用。

- [ ] **Step 3: 修复删除分支**

  `frontend/src/domains/tasks/components/thread-list-panel.tsx:323-330`，把：

  ```tsx
  } else if (act.action === 'delete') {
    const targetStatus = ACTION_TO_TARGET_STATUS[act.action]
    if (targetStatus) {
      await updateThreadStatus(thread.id, targetStatus as Thread['status'])
      toast.success(`${act.label}成功`)
      setLocalRefreshKey(k => k + 1)
    }
  }
  ```

  改为：

  ```tsx
  } else if (act.action === 'delete') {
    await deleteThread(thread.id)
    toast.success(`${act.label}成功`)
    setLocalRefreshKey(k => k + 1)
  }
  ```

  同时删除已无用的 `ACTION_TO_TARGET_STATUS` 中的相关引用——该常量仍被 pause/complete/archive 使用，**保留常量本身**，只改 delete 分支。删除 import 中未再需要的 `updateThreadStatus`：先 `grep -n "updateThreadStatus" src/domains/tasks/components/thread-list-panel.tsx`，若仅剩 import 一处则移除；否则保留。

- [ ] **Step 4: 跑测试验证通过**

  ```bash
  cd frontend && npm run test -- thread-list-panel
  ```
  Expected: PASS。

- [ ] **Step 5: 验证 findAllWithCount 过滤 deleted（关键验证点）**

  ```bash
  cd frontend && grep -n "deleted\|status" src/domains/tasks/repository/thread.ts | head -30
  ```
  确认 `findAllWithCount` 查询是否排除 `status='deleted'`。
  - 若**已过滤**：无需改动。
  - 若**未过滤**：在 `findAllWithCount` 的查询加 `.where(and(eq(thread.userId, ...), ne(thread.status, 'deleted')))`（按仓储实际 API），并补一条 repository 单测验证 deleted thread 不返回。E2E（Task 8）会最终确认删除后列表不显示。

- [ ] **Step 6: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 7: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  fix(tasks): [021] T4 修复删除主线不消失 bug

  根因：thread-list-panel 删除分支误走 updateThreadStatus +
  ACTION_TO_TARGET_STATUS[delete]（无 delete 映射 → undefined → 静默跳过），
  已 import 的 deleteThread 从未调用。改为直接调用 deleteThread（SM 软删）。
  含复现测试 + findAllWithCount 过滤 deleted 验证。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: 修复 03c 子任务刷新 bug

**Files:**
- Test: `frontend/src/domains/tasks/components/__tests__/subtask-list.test.tsx`（新建）
- Modify: `frontend/src/domains/tasks/components/subtask-list.tsx:21-28,104-119`

- [ ] **Step 1: 写复现测试（失败）**

  新建 `frontend/src/domains/tasks/components/__tests__/subtask-list.test.tsx`：

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'

  const getSubtasksMock = vi.fn()
  const createTaskMock = vi.fn()
  vi.mock('@/app/actions/tasks', () => ({
    getSubtasks: (...a: unknown[]) => getSubtasksMock(...a),
    createTask: (...a: unknown[]) => createTaskMock(...a),
  }))
  vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

  import { SubtaskList } from '../subtask-list'

  describe('SubtaskList — onChanged 回调', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      getSubtasksMock.mockResolvedValue([])
      createTaskMock.mockResolvedValue({ id: 'sub-1', title: '子任务' })
    })

    it('添加子任务后调用 onChanged（通知父组件刷新树）', async () => {
      const user = userEvent.setup()
      const onChanged = vi.fn()
      render(
        <SubtaskList
          taskId="task-1"
          userId={'user-1' as never}
          onOpenTask={vi.fn()}
          onChanged={onChanged}
        />,
      )
      await waitFor(() => expect(screen.getByPlaceholderText('+ 添加子任务')).toBeInTheDocument())

      await user.type(screen.getByPlaceholderText('+ 添加子任务'), '第一个子任务')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({ title: '第一个子任务', parentId: 'task-1' }))
      })
      expect(onChanged).toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: 跑测试验证失败**

  ```bash
  cd frontend && npm run test -- subtask-list
  ```
  Expected: FAIL — `SubtaskList` 无 `onChanged` prop，添加后不调用。

- [ ] **Step 3: 加 onChanged prop 并在 handleAdd 调用**

  `frontend/src/domains/tasks/components/subtask-list.tsx`：

  Props 接口（:21-28）加：
  ```typescript
  /** 子任务变更回调（添加后通知父组件刷新任务树） */
  onChanged?: () => void
  ```

  函数签名解构（:73）加 `onChanged`。

  `handleAdd`（:104-119）在 `await loadSubtasks()` 后加 `onChanged?.()`：
  ```typescript
  const handleAdd = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) return
    setAdding(true)
    try {
      await createTask({ title, parentId: taskId, threadId: undefined })
      setNewTitle('')
      await loadSubtasks()
      onChanged?.()   // ← 新增：通知父组件刷新右侧任务树
    } finally {
      setAdding(false)
    }
  }, [newTitle, taskId, loadSubtasks, onChanged])
  ```

- [ ] **Step 4: 跑测试验证通过**

  ```bash
  cd frontend && npm run test -- subtask-list
  ```
  Expected: PASS。

- [ ] **Step 5: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 6: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  fix(tasks): [021] T5 修复抽屉内加子任务后任务树不刷新 bug

  根因：SubtaskList.handleAdd 只 loadSubtasks（刷新抽屉内部），未触发
  drawer.onTaskChanged → refreshKey 不递增 → 右侧任务树不重载、主任务
  无展开箭头。新增 onChanged 回调，handleAdd 成功后调用。含复现测试。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: 接线 02b/02c/03b（新建抽屉入口）

**前置：** Task 3（TaskCreateDrawer）已完成。

**Files:**
- Test: `frontend/src/domains/tasks/components/__tests__/resolve-create-defaults.test.ts`（新建）
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`（抽函数 + 加 + 按钮 + 菜单项）
- Modify: `frontend/src/domains/tasks/components/subtask-list.tsx`（+ 按钮开抽屉）
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`（转发回调）
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`（DrawerState + 接线）

- [ ] **Step 1: 抽 resolveThreadFromFilter 纯函数 + 测试**

  新建 `frontend/src/domains/tasks/components/__tests__/resolve-create-defaults.test.ts`：

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { resolveThreadFromFilter } from '../task-tree-view'

  describe('resolveThreadFromFilter', () => {
    it('具体主线 id 原样返回', () => {
      expect(resolveThreadFromFilter('thread-abc')).toBe('thread-abc')
    })
    it('__all__ 与 __orphan__ 归属为 undefined（新建时不预绑主线）', () => {
      expect(resolveThreadFromFilter('__all__')).toBeUndefined()
      expect(resolveThreadFromFilter('__orphan__')).toBeUndefined()
    })
  })
  ```

  在 `task-tree-view.tsx` 顶层（常量区附近）导出：
  ```typescript
  /**
   * 将列表筛选 threadId 映射为新建任务的 threadId 归属。
   * __all__/__orphan__ → undefined（不预绑）；具体主线 id → 原样。
   * handleQuickAdd 与「+」按钮入口共用，保证快速创建与抽屉创建归属一致。
   */
  export function resolveThreadFromFilter(threadId: string | undefined): string | undefined {
    if (!threadId || threadId === '__all__' || threadId === '__orphan__') return undefined
    return threadId
  }
  ```

  把 `handleQuickAdd`（:411-412）的 inline 逻辑替换为调用此函数：
  ```typescript
  const newTask = await createTask({
    title: quickAddText.trim(),
    threadId: resolveThreadFromFilter(threadId) as never,
  })
  ```

- [ ] **Step 2: 跑测试验证通过**

  ```bash
  cd frontend && npm run test -- resolve-create-defaults
  ```
  Expected: PASS。

- [ ] **Step 3: task-tree-view 加入口 props + 02c「+」按钮 + 02b 菜单项**

  `task-tree-view.tsx`：
  - import 加 `Plus`（如未导入）+ `TaskCreateDefaults` 类型：
    ```typescript
    import type { TaskCreateDefaults } from './task-create-drawer'
    ```
  - `TaskTreeViewProps`（:62-79）加：
    ```typescript
    /** 快速添加「+」→ 打开新建任务抽屉 */
    onOpenTaskCreate?: (defaults: TaskCreateDefaults) => void
    /** 「在下方新建子任务」→ 打开新建子任务抽屉 */
    onCreateSubtask?: (parentTaskId: string) => void
    ```
  - 组件签名解构加 `onOpenTaskCreate`, `onCreateSubtask`。
  - 快速添加区（:622-636）在 `<input>` 后、`{isCreating && ...}` 前加「+」按钮：
    ```tsx
    <button
      type="button"
      onClick={() => onOpenTaskCreate?.({ title: quickAddText, threadId: resolveThreadFromFilter(threadId) })}
      aria-label="打开新建任务详细编辑"
      title="新建任务（详细编辑）"
      className="shrink-0 size-9 flex items-center justify-center rounded-md border border-hairline bg-canvas text-body hover:text-ink hover:bg-hover-overlay transition-colors"
    >
      <Plus className="size-4" />
    </button>
    ```
  - 「在下方新建子任务」菜单项（:967-1000 附近，`toast.info('子任务创建即将支持')`）改为：
    ```tsx
    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateSubtask?.(task.id) }}>
      在此下方新建子任务
    </DropdownMenuItem>
    ```
    > 定位：`grep -n "子任务创建即将支持\|在此下方新建子任务" src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 4: subtask-list「+」按钮改为开抽屉（03b）**

  `subtask-list.tsx`：
  - Props 加：
    ```typescript
    /** 「+」→ 打开新建子任务抽屉（带已输入文本预填） */
    onOpenSubtaskCreate?: (defaults: { parentId: string; title?: string }) => void
    ```
  - 现有 + 按钮 `onClick={handleAdd}`（:201-212）改为：
    ```tsx
    <button
      type="button"
      onClick={() => onOpenSubtaskCreate?.({ parentId: taskId, title: newTitle.trim() || undefined })}
      aria-label="打开新建子任务详细编辑"
      title="新建子任务（详细编辑）"
      className="h-8 w-8 flex items-center justify-center rounded-md bg-primary text-on-primary hover:bg-primary-active transition-colors shrink-0"
    >
      <Plus className="size-3.5" />
    </button>
    ```
    回车（`onKeyDown Enter` → `handleAdd`）保留（快速添加仅标题）。

- [ ] **Step 5: TaskTreePage 扩展 DrawerState + 接线**

  `frontend/src/domains/tasks/pages/TaskTreePage.tsx`：
  - import：`import { TaskCreateDrawer, type TaskCreateDefaults } from '../components/task-create-drawer'`
  - `DrawerState`（:32-36）加 `| { type: 'create'; defaults: TaskCreateDefaults }`
  - 加打开函数：
    ```typescript
    const openCreateDrawer = useCallback((defaults: TaskCreateDefaults) => {
      setDrawer({ type: 'create', defaults })
    }, [])
    ```
  - `TaskTreeView` 调用处（:214-223）加 props：
    ```tsx
    <TaskTreeView
      ...现有 props...
      onOpenTaskCreate={(d) => openCreateDrawer(d)}
      onCreateSubtask={(parentId) => openCreateDrawer({ parentId })}
    />
    ```
  - 渲染 TaskCreateDrawer（在 TaskDetailDrawer 渲染块附近）：
    ```tsx
    {drawer.type === 'create' && (
      <TaskCreateDrawer
        defaults={drawer.defaults}
        userId={'placeholder' as any}
        onClose={closeDrawer}
        onCreated={() => { handleDataChanged(); closeDrawer() }}
      />
    )}
    ```

- [ ] **Step 6: task-detail-drawer 转发子任务抽屉入口**

  `task-detail-drawer.tsx`：`SubtaskList` 两处渲染（小屏 :390-394 + 大屏 :410-414）加：
  ```tsx
  <SubtaskList
    taskId={currentTask.id}
    userId={userId}
    onOpenTask={(id) => navigateToTask(id)}
    onChanged={() => onTaskChanged?.()}                          // ← Task 5 的刷新转发
    onOpenSubtaskCreate={(d) => onCreateSubtask?.(d)}            // ← 新增
  />
  ```
  Props 接口加：
  ```typescript
  /** 子任务「+」→ 打开新建子任务抽屉（转发到页面） */
  onCreateSubtask?: (defaults: { parentId: string; title?: string }) => void
  ```
  解构 `onCreateSubtask`。TaskTreePage 的 `TaskDetailDrawer`（:229-237）传：
  ```tsx
  onCreateSubtask={(d) => openCreateDrawer({ parentId: d.parentId, title: d.title })}
  ```

- [ ] **Step 7: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 8: vitest 回归**

  ```bash
  cd frontend && npm run test
  ```
  Expected: 全绿（含 Task 2-5 新增测试）。

- [ ] **Step 9: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  feat(tasks): [021] T6 接线新建任务抽屉入口（02b/02c/03b）

  - 抽 resolveThreadFromFilter 纯函数（handleQuickAdd 与 + 按钮共用归属逻辑）+ 单测
  - task-tree-view：快速添加「+」按钮 → TaskCreateDrawer（带文本）；「在下方新建子任务」→ TaskCreateDrawer（带 parentId）
  - subtask-list：「+」按钮改为打开新建子任务抽屉（带文本），回车保留快速添加
  - TaskTreePage：DrawerState 扩展 create；drawer 转发 onChanged/onCreateSubtask
  - task-detail-drawer：转发 onChanged（Task 5 刷新链）+ onCreateSubtask

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: 03a 抽屉面包屑动态根

**Files:**
- Test: `frontend/src/domains/tasks/components/__tests__/root-breadcrumb-label.test.ts`（新建）
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`

- [ ] **Step 1: 写纯函数测试（失败）**

  新建 `frontend/src/domains/tasks/components/__tests__/root-breadcrumb-label.test.ts`：

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { rootBreadcrumbLabel } from '../task-detail-drawer'

  describe('rootBreadcrumbLabel', () => {
    it('有主线名 → 显示主线名', () => {
      expect(rootBreadcrumbLabel(true, '健康主线')).toBe('健康主线')
    })
    it('有 threadId 但未取到名 → 兜底「主线」', () => {
      expect(rootBreadcrumbLabel(true, null)).toBe('主线')
    })
    it('无主线（普通任务）→ 「普通任务」', () => {
      expect(rootBreadcrumbLabel(false, null)).toBe('普通任务')
      expect(rootBreadcrumbLabel(false, undefined)).toBe('普通任务')
    })
  })
  ```

- [ ] **Step 2: 跑测试验证失败**

  ```bash
  cd frontend && npm run test -- root-breadcrumb-label
  ```
  Expected: FAIL（函数未导出）。

- [ ] **Step 3: 实现 rootBreadcrumbLabel + 接入面包屑**

  `task-detail-drawer.tsx`：
  - import 加 `getThreadById`（从 `@/app/actions/tasks`，:17 已 import 其他，追加）。
  - 顶层导出纯函数：
    ```typescript
    /**
     * 计算面包屑根节点标签。
     * - 有主线（hasThread）且取到名 → 主线名
     * - 有主线但未取名 → 兜底「主线」
     * - 无主线（普通任务）→ 「普通任务」
     */
    export function rootBreadcrumbLabel(hasThread: boolean, threadName: string | null | undefined): string {
      if (hasThread) return threadName ?? '主线'
      return '普通任务'
    }
    ```
  - 加 state + 加载逻辑（在 `ancestors` state 附近，:104）：
    ```typescript
    const [rootLabel, setRootLabel] = useState('任务树')
    ```
    在 `loadTask`（:122-142）取到 task 后，追加 rootLabel 计算：
    ```typescript
    // 计算面包屑根 label：优先当前 task 的 threadId；无则回溯祖先链顶端
    const threadIdForRoot = t.threadId ?? (ancs.length > 0 ? undefined : undefined)
    // 注：ancestors 仅含 {id,title}，无 threadId；子任务无 threadId 时此处留 undefined，
    // 走「普通任务」。如需精确，后续可扩展 getTaskAncestors 返回 root threadId。
    if (t.threadId) {
      const th = await getThreadById(t.threadId as string)
      setRootLabel(rootBreadcrumbLabel(true, th?.name ?? null))
    } else {
      setRootLabel(rootBreadcrumbLabel(false, null))
    }
    ```
    > 子任务 threadId 继承验证点：若 E2E 发现子任务面包屑显示「普通任务」但实际属主线，则改为在 `loadTask` 内额外查询 ancestors 顶端 task 的 threadId（`getTaskById(ancs[ancs.length-1].id)`）再判断。本步先用 `currentTask.threadId`。
  - 面包屑根节点（:220-227）把硬编码 `任务树` 替换为 `{rootLabel}`：
    ```tsx
    <button
      key="__root"
      type="button"
      onClick={onClose}
      className="text-body hover:text-ink transition-colors shrink-0"
    >
      {rootLabel}
    </button>
    ```
    并把 `rootLabel` 加入 `breadcrumbItems` 的 `useMemo` 依赖数组（:248）。

- [ ] **Step 4: 跑测试验证通过**

  ```bash
  cd frontend && npm run test -- root-breadcrumb-label
  ```
  Expected: PASS。

- [ ] **Step 5: tsc 验证**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 6: Commit**

  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
  feat(tasks): [021] T7 抽屉面包屑根节点动态化

  根节点由硬编码「任务树」改为：任务有 threadId → 主线名（getThreadById）；
  无 threadId → 「普通任务」。抽 rootBreadcrumbLabel 纯函数 + 单测。
  子任务 threadId 继承验证留 E2E（若错则回溯祖先链顶端）。

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: 全量回归 + 类型检查 + E2E

**Files:** 无（验证任务）

- [ ] **Step 1: 全量 vitest**

  ```bash
  cd frontend && npm run test
  ```
  Expected: 全绿，新增测试（format-duration / task-create-drawer / thread-list-panel / subtask-list / resolve-create-defaults / root-breadcrumb-label）均通过，无回归。用 base/head 失败集合对比确认无新增失败（[[feedback_change-gate-pitfalls]]）。

- [ ] **Step 2: 全量 tsc**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: 0 error。

- [ ] **Step 3: lint**

  ```bash
  cd frontend && npm run lint
  ```
  Expected: 无新增 error（既有 warning 不计）。

- [ ] **Step 4: dev server 冒烟**

  ```bash
  cd frontend && npm run dev
  ```
  访问 `http://localhost:3000/tasks`，确认页面 200、无控制台报错。Ctrl-C 停止。

- [ ] **Step 5: /browse E2E（真实 PG 落库）**

  用 gstack `/browse` 验证 4 区块（CLAUDE.md 规定网页浏览用 gstack /browse）：
  1. **04**：成长领域菜单无「细化」「拆分」；任务抽屉系统认知面板无「可拆分」AI 建议提示
  2. **01**：对话创建任务 → 时长为双框（时/分）
  3. **02a**：主线列表选已归档主线 → 「...」→ 删除 → 列表立即消失（无需刷新）
  4. **02c**：快速添加框输入文本 → 点「+」→ 抽屉打开、标题已预填、提交后任务出现
  5. **02b**：任务行「...」→「在此下方新建子任务」→ 抽屉打开、提交后该任务下出现子任务
  6. **03b**：抽屉内子任务区输入文本 → 点「+」→ 详细抽屉打开、文本预填
  7. **03c**：抽屉内加第一个子任务 → 关闭抽屉 → 主任务可展开（无需手动刷新）
  8. **03a**：主线任务抽屉面包屑根 = 主线名；普通任务（无主线）抽屉根 = 「普通任务」

  全部通过后记录证据。

- [ ] **Step 6: 最终 Commit（如有 E2E 修复）**

  若 E2E 暴露问题（如子任务 threadId 继承导致 03a 判断错），按 [[superpowers:systematic-debugging]] 修复后 commit；无问题则跳过。

---

## Self-Review

**1. Spec 覆盖**：
- 01 时长双框 → Task 2 ✓
- 02a 删主线 bug → Task 4 ✓
- 02b 在下方新建子任务 → Task 6 Step 3 ✓
- 02c 快速添加 + 按钮 → Task 6 Step 3 ✓
- 03a 面包屑动态根 → Task 7 ✓
- 03b 子任务 + 按钮 → Task 6 Step 4 ✓
- 03c 子任务刷新 → Task 5 ✓
- 04 删两个 action → Task 1 ✓
- TaskCreateDrawer 基础设施 → Task 3 ✓

**2. 占位符扫描**：Task 3 Step 1 的初始测试片段有占位修正说明（已用「修正（完整内容）」给出完整版），无 TBD/TODO。其余步骤均为完整代码。

**3. 类型一致性**：
- `TaskCreateDefaults{title?,threadId?,parentId?}` 在 Task 3 定义，Task 6（onOpenTaskCreate/onCreateSubtask）、Task 7 引用一致 ✓
- `resolveThreadFromFilter(threadId)` Task 6 定义并被 handleQuickAdd + + 按钮调用 ✓
- `rootBreadcrumbLabel(hasThread, threadName)` Task 7 定义并导出测试 ✓
- `onChanged` / `onOpenSubtaskCreate` / `onCreateSubtask` 跨 subtask-list / drawer / page 命名一致 ✓

无遗漏，计划完整。
