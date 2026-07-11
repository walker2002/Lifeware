# [027-A] Phase A：原型选择器统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 11 处「活动原型选择」界面统一为单一组件 `ArchetypePicker`（+ `variant` prop），补齐 AI 匹配全覆盖与 `/tasks` 页面缺失的编辑入口，删除冗余 `ArchetypePickerCard`——实现「改一处全同步」。

**Architecture:** 5 任务线性推进。Task 1 给 `ArchetypePicker` 加 `variant` prop 并吸收带盒渲染（核心，TDD）；Task 2-3 迁移/补全消费方；Task 4 给 `/tasks` 两个页面表单补原型字段（复用已透传的 `createTask`/`updateTask`，无后端改动）；Task 5 删 `ArchetypePickerCard` + grep 闭环 + CHANGELOG。分支 `feat/027-a-archetype-unify`，从 main 切。

**Tech Stack:** Next.js 16.1.6 / React 19.2.3 / TypeScript 5 / vitest + @testing-library/react。验证：vitest（须在 `frontend` cwd 跑）+ tsc 双验证。

## Global Constraints

1. **简体中文注释**：所有新增/修改注释用简体中文；新增文件须 `/** @file ... @brief ... */` 文件头（CLAUDE.md code-commenting-guide）。
2. **CSS 变量令牌**：原型选择器已用 `bg-surface-card`/`text-ink` 等令牌，保持；禁止 Tailwind 默认颜色类。
3. **vitest cwd 陷阱**：测试必须在 `frontend` 目录跑（`@/` 映射，repo root 跑会假失败，[[feedback_vitest-pitfalls]]）。
4. **tsc 双验证**：vitest 不做类型检查，每个 task 后跑 `npx tsc --noEmit` 确认零新增错误。
5. **3-state 语义保留**：`ArchetypePicker` 的 `onChange(archetypeId)` 在 appointment 域消费方维持 `undefined=skip / null=clear / string=set`（[026.02.4] TD-022 #6），本任务不得塌缩。
6. **无后端改动**：`CreateTaskInput`/`UpdateTaskInput` 已含 `activityArchetypeId?`（`usom/interfaces/irepository.ts:128,148`），Task 4 仅前端透传。
7. **无 DB/USOM 变更**：Phase A 不动 schema，Tier 2 文档同步只更 CHANGELOG（database-design/usom-design 留给 Phase B）。
8. **不自 merge**：可 commit + push，跨分支合并由用户在 gitee 网页确认（[[feedback_no-self-merge]]）。
9. **清除原型入口（[plan-eng-review D3 决策]**）：`ArchetypePicker` 在 selected + 非 readOnly 态增加「清除」按钮，emit `onChange(undefined)`。**编辑既有对象的消费方**（TaskEditCard / task-edit-zone / EditTimeboxes / timebox-drawer 编辑态 / habit-form 编辑态 / AppointmentFormFields）须把 `undefined → null` 透传，确保 null 落库清除（createTask/createHabit 等 create 路径 undefined=不设即可，无需特殊处理）。各域 update 路径 null=clear 支持须在 T1/T3/T4 实现时核实：appointment ✅（既有 3-state）、tasks ✅（updateTask `Object.entries` filter `v!==undefined`，null 通过；repo task.ts:320 `null!==undefined` 写入）、timebox/habit 当前 2-state（undefined=skip），若 null-clear 不支持则该域清除按钮为 cosmetic——记为已知限制或补 backend（实现时定）。
10. **测试深度（[plan-eng-review D2 决策] = 全补）**：每个新代码路径都要测。除各 task 内联测试外，必须含：task-edit-zone archetype 字段 render+draft→updateTask 测试（T4）、createTask/updateTask archetype 持久化回归断言（T4，防 silent-failure，沿用 [post-ship-codex-catches-cross-task-routing-bug] real-routing verify 精神）、TaskCreationCard/TaskEditCard AI 匹配冒烟（T3）。

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `frontend/src/components/archetype/archetype-picker.tsx` | 唯一选择器组件，加 `variant` prop | T1 |
| `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx` | variant 测试 | T1, T5 |
| `frontend/src/components/archetype/archetype-picker-card.tsx` | 删除（带盒渲染并入 variant=card） | T5 |
| `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx` | Card → `variant=card` | T2 |
| `frontend/src/domains/timebox/components/timebox-drawer.tsx` | Card → `variant=card` | T2 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 补 AI 匹配 | T3 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 补 AI 匹配 | T3 |
| `frontend/src/domains/habits/components/habit-form.tsx` | 补 AI 匹配（顺带覆盖 HabitCreationCard） | T3 |
| `frontend/src/domains/tasks/components/task-create-drawer.tsx` | 新增原型字段 + 透传 createTask | T4 |
| `frontend/src/domains/tasks/components/task-edit-zone.tsx` | 新增原型字段 + 透传 updateTask draft | T4 |
| `frontend/src/domains/tasks/components/__tests__/task-create-drawer.test.tsx` | 原型字段冒烟 | T4 |
| `CHANGELOG.md` | `[027-A]` 段 | T5 |

**不变更**（已合规）：`CreateTimebox.tsx` / `EditTimeboxes.tsx`（裸=inline 默认 + 已有 AI）、`task-detail-drawer.tsx`（readOnly 展示）、`HabitCreationCard.tsx`（[019.1] 包 `HabitForm`，T3 改 habit-form 即覆盖）。

---

## Task 1: `ArchetypePicker` 增加 `variant` prop（核心，TDD）

**Files:**
- Modify: `frontend/src/components/archetype/archetype-picker.tsx`
- Modify: `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx`

**Interfaces:**
- Produces: `ArchetypePicker` 新增可选 prop `variant?: 'card' | 'inline'`（默认 `'inline'`）。`'card'` 渲染 `rounded-md bg-surface-card p-5` 盒 + `<h3>活动原型</h3>`；`'inline'` 无盒无标题（消费方自包 label）。其余 props/行为不变。

- [ ] **Step 1: 写失败测试（variant=card 渲染 h3 + 盒；inline 不渲染 h3）**

在 `archetype-picker.test.tsx` 末尾追加：

```tsx
describe('[027-A] ArchetypePicker variant', () => {
  it('variant=card 渲染「活动原型」h3 标题与带盒容器', async () => {
    const { container } = render(<ArchetypePicker variant="card" value={undefined} onChange={() => {}} />)
    expect(await screen.findByText('活动原型')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('bg-surface-card')
  })

  it('variant=inline（默认）不渲染 h3「活动原型」标题', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    await screen.findByText('选择')
    expect(screen.queryByRole('heading', { name: '活动原型' })).not.toBeInTheDocument()
  })

  // [plan-eng-review D3] 清除入口：selected + 非 readOnly 时渲染「清除」，点击 emit onChange(undefined)
  it('selected + 非 readOnly 时渲染「清除」按钮，点击调用 onChange(undefined)', async () => {
    const onChange = vi.fn()
    render(<ArchetypePicker value="a1" onChange={onChange} />)
    await screen.findByText('深度专注')
    const clearBtn = screen.getByRole('button', { name: '清除活动原型' })
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('readOnly 模式不渲染「清除」按钮', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} />)
    await screen.findByText('深度专注')
    expect(screen.queryByRole('button', { name: '清除活动原型' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx -t "variant"`
Expected: FAIL（`variant` prop 不存在，`findByText('活动原型')` 找不到 / TypeScript 报未知 prop）

- [ ] **Step 3: 实现 variant prop**

`archetype-picker.tsx` 改两处：

(a) Props 接口加 `variant`（约第 18-29 行 interface）：

```tsx
interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更（readOnly 时可不传） */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
  /** 只读模式：隐藏按钮与下拉，仅展示选中态 */
  readOnly?: boolean
  /** [023.11] 启用「AI 匹配」按钮 */
  enableAiMatch?: boolean
  /** [023.11] 当前标题 */
  title?: string
  /** [027-A] 视觉模式：card=带盒+h3（appointment 参照）；inline=裸版（默认，消费方自包 label） */
  variant?: 'card' | 'inline'
}
```

(b) 解构 + 根 div 条件盒 + 条件 h3（签名行第 31 行 + return 根 div 第 103-104 行）：

```tsx
export function ArchetypePicker({ value, onChange, readOnly = false, enableAiMatch, title, variant = 'inline' }: ArchetypePickerProps) {
```

return 根 `<div>`（当前第 104 行 `<div>`）改为：

```tsx
  return (
    <div className={variant === 'card' ? 'rounded-md bg-surface-card p-5' : undefined}>
      {variant === 'card' && <h3 className="mb-2 text-sm font-medium text-ink">活动原型</h3>}
      {selected ? (
```

（其余 JSX 原样嵌套，仅根 div 加条件 className + 条件 h3 子节点。）

(c) [plan-eng-review D3] 加「清除」按钮：在 selected 分支的「非 readOnly」按钮组（约第 116-130 行 `<div className="flex shrink-0 items-center gap-2">` 内，「更换」+ `aiMatchBtn` 之后）追加：

```tsx
{/* [027-A] 清除原型：emit undefined，消费方按域语义转 null（编辑态落库清除） */}
<button
  type="button"
  onClick={() => onChange?.(undefined)}
  aria-label="清除活动原型"
  className="text-xs text-body"
>
  清除
</button>
```

（readOnly 分支不渲染该按钮——已在 T1 测试覆盖。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx`
Expected: PASS（全部用例，含新增 2 条 + 既有用例不回归）

- [ ] **Step 5: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/archetype/archetype-picker.tsx frontend/src/components/archetype/__tests__/archetype-picker.test.tsx
git commit -m "feat(027-A): ArchetypePicker 增加 variant prop（card/inline 统一）"
```

---

## Task 2: 迁移 `ArchetypePickerCard` 消费方 → `variant=card`

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx:118-125`
- Modify: `frontend/src/domains/timebox/components/timebox-drawer.tsx:283-288`

**Interfaces:**
- Consumes: Task 1 的 `ArchetypePicker variant="card"`（API 等价于原 `ArchetypePickerCard`：同样 `value/onChange/enableAiMatch/title` props）。

- [ ] **Step 1: AppointmentFormFields 改 import + JSX**

import 行（第 15 行）：
```tsx
// before
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'
// after
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```

JSX（第 118-125 行）：
```tsx
// before
      <ArchetypePickerCard
        value={draft.activityArchetypeId ?? undefined}
        onChange={(archetypeId) => onChange({
          activityArchetypeId: archetypeId === undefined ? null : archetypeId,
        })}
        enableAiMatch
        title={draft.title}
      />
// after
      <ArchetypePicker
        variant="card"
        value={draft.activityArchetypeId ?? undefined}
        onChange={(archetypeId) => onChange({
          activityArchetypeId: archetypeId === undefined ? null : archetypeId,
        })}
        enableAiMatch
        title={draft.title}
      />
```

（3-state `undefined→null` 转换逻辑保持不变——appointment 域语义。）

**[D3 清除 wiring — AppointmentFormFields]**：该 surface 编辑既有约定，清除需 null 落库。既有 transform `archetypeId === undefined ? null : archetypeId` 已正确处理 picker 清除按钮 emit 的 undefined → null ✅（T1 加清除按钮后自动生效，无需改本文件逻辑）。

**[D3 清除 wiring — timebox-drawer]**：timebox 域是 2-state（undefined=skip，见 AppointmentFormFields 注释 + [026.02.4]）。timebox-drawer 编辑既有 timebox 时，picker 清除按钮 emit undefined → 当前 `setActivityArchetypeId(id)` 存 undefined → updateTimebox `value!==undefined` filter 跳过 → **清不落库**。实现时核实 `updateTimebox` 是否支持 null=clear：若支持，wiring 改 `id === undefined ? null : id`；若不支持，该 surface 清除按钮为 cosmetic（记为已知限制，GC#9）。

- [ ] **Step 2: timebox-drawer 改 import + JSX**

import 行（第 43 行）：
```tsx
// before
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'
// after
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```

JSX（第 283-288 行）：
```tsx
// before
            <ArchetypePickerCard
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
              enableAiMatch
              title={title}
            />
// after
            <ArchetypePicker
              variant="card"
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
              enableAiMatch
              title={title}
            />
```

- [ ] **Step 3: 验证（vitest 该域已无失败 + tsc）**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误

Run: `cd frontend && npx vitest run src/domains/timebox` 
Expected: 既有用例不回归（这两处无专门单测，靠 tsc + 后续 /browse 人工验证）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx frontend/src/domains/timebox/components/timebox-drawer.tsx
git commit -m "refactor(027-A): AppointmentFormFields/timebox-drawer 改用 ArchetypePicker variant=card"
```

---

## Task 3: 给 TaskCreationCard / TaskEditCard / habit-form 补 AI 匹配

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx:222-228`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx:228-232`
- Modify: `frontend/src/domains/habits/components/habit-form.tsx:385-389`

**Interfaces:**
- Consumes: `ArchetypePicker` 的 `enableAiMatch` + `title` props（已在 Task 1 存在，本任务仅透传）。

- [ ] **Step 1: TaskCreationCard 透传 enableAiMatch + title**

JSX（第 222-228 行），给 `<ArchetypePicker>` 加两 prop：
```tsx
// before
          <ArchetypePicker
            value={activityArchetypeId}
            onChange={id => {
              setActivityArchetypeId(id)
              onDataChange({ ...dataModel, activityArchetypeId: id })
            }}
          />
// after
          <ArchetypePicker
            value={activityArchetypeId}
            onChange={id => {
              setActivityArchetypeId(id)
              onDataChange({ ...dataModel, activityArchetypeId: id })
            }}
            enableAiMatch
            title={title}
          />
```

（确认 `title` 在该组件作用域可用——它是任务标题 state；若变量名不同，用实际标题变量。）

- [ ] **Step 2: TaskEditCard 透传 enableAiMatch + title + 清除 wiring**

JSX（第 228-232 行）：
```tsx
// before
          <ArchetypePicker
            value={editArchetypeId}
            onChange={id => setEditArchetypeId(id)}
          />
// after
          <ArchetypePicker
            value={editArchetypeId}
            onChange={id => setEditArchetypeId(id === undefined ? null : id)}
            enableAiMatch
            title={editTitle}
          />
```

**[plan-eng-review codex #4 核实]**：`editTitle` 确为该组件编辑态标题变量（`TaskEditCard.tsx:90` `const [editTitle, setEditTitle] = useState('')`）✅。`editArchetypeId` state（`:90`/`:144`/`:159`）已在 onSubmit payload 透传 ✅。
**[D3 清除 wiring]**：`id === undefined ? null`——编辑既有任务清空原型需 null 落库（tasks 域 updateTask `Object.entries` filter `v!==undefined`，null 通过；repo task.ts:320 写入）。

- [ ] **Step 3: habit-form 透传 enableAiMatch + title + 清除 wiring**

JSX（第 385-389 行）：
```tsx
// before
        <ArchetypePicker
          value={activityArchetypeId}
          onChange={id => { setActivityArchetypeId(id); onDirtyChange?.(true) }}
        />
// after
        <ArchetypePicker
          value={activityArchetypeId}
          onChange={id => { setActivityArchetypeId(id === undefined ? null : id); onDirtyChange?.(true) }}
          enableAiMatch
          title={title}
        />
```

**[plan-eng-review codex #3 修正]**：习惯名称变量是 `title`（`habit-form.tsx:92` `const [title, setTitle] = useState(initial?.title ?? "")`），**不是 `name`**——codex outside voice 抓出原计划猜错的变量名。
**[D3 清除 wiring]**：`id === undefined ? null : id`——habit 编辑态清空需 null 落库（create 时 undefined 也无碍）。HabitCreationCard 包 HabitForm，此改动自动覆盖。实现时核实 `updateHabit`/repo 是否 null=clear（见 Global Constraint #9）。

- [ ] **Step 4: 写冒烟测试（AI 匹配 + 清除按钮）**

在 `frontend/src/domains/habits/components/__tests__/habit-form-archetype.test.tsx` 末尾追加（若已有 mock 基建则复用）：

```tsx
it('[027-A] 传入 title 时渲染「AI 匹配」按钮', async () => {
  render(<HabitForm initial={{ title: '晨跑' }} onSubmit={() => {}} onCancel={() => {}} />)
  expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
})
```

TaskCreationCard / TaskEditCard AI 匹配冒烟（D2 全补）——分别在 `src/domains/tasks/cnui/surfaces/__tests__/` 对应测试文件（若无则建 `task-creation-card.archetype.test.tsx` / `task-edit-card.archetype.test.tsx`），mock `getArchetypes`，断言 `title` 非空时渲染「AI 匹配」按钮：

```tsx
it('[027-A] title 非空时渲染「AI 匹配」按钮', async () => {
  render(<TaskCreationCard surfaceType="task-creation-card" dataModel={{ title: '写周报' }} onDataChange={() => {}} onConfirm={() => {}} />)
  expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
})
```

- [ ] **Step 5: 验证 + tsc**

Run: `cd frontend && npx vitest run src/domains/habits/components/__tests__/habit-form-archetype.test.tsx`
Expected: PASS

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx frontend/src/domains/habits/components/habit-form.tsx frontend/src/domains/habits/components/__tests__/habit-form-archetype.test.tsx
git commit -m "feat(027-A): TaskCreationCard/TaskEditCard/habit-form 补 AI 匹配"
```

---

## Task 4: `/tasks` 页面表单补原型字段（task-create-drawer + task-edit-zone）

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-create-drawer.tsx`
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx`
- Modify: `frontend/src/domains/tasks/components/__tests__/task-create-drawer.test.tsx`

**Interfaces:**
- Consumes: `ArchetypePicker`（inline 默认）；`createTask` / `updateTask` 已接受 `activityArchetypeId?`（无需改 server action）。
- Produces: 两个页面表单均能采集 + 透传 `activityArchetypeId`。

- [ ] **Step 1: 写失败测试（task-create-drawer 渲染原型字段）**

在 `task-create-drawer.test.tsx` 加用例（复用既有 mock 基建，若无 `getArchetypes` mock 则补 `vi.mock('@/app/actions/activity-archetype', ...)`）：

```tsx
it('[027-A] 渲染「活动原型」选择字段', async () => {
  render(<TaskCreateDrawer defaults={{}} userId="u1" onClose={() => {}} onCreated={() => {}} />)
  expect(await screen.findByText('活动原型')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/tasks/components/__tests__/task-create-drawer.test.tsx -t "活动原型"`
Expected: FAIL（字段不存在）

- [ ] **Step 3: task-create-drawer 加原型字段 + 透传**

(a) import（顶部 import 区）：
```tsx
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```

(b) 加 state（与现有 state 同区，约第 56-63 行）：
```tsx
const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(undefined)
```

(c) `createTask` 调用（约第 80-87 行）加字段：
```tsx
      const created = await createTask({
        title: trimmed,
        description: description || undefined,
        priority: (priority || undefined) as Priority | undefined,
        estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
        threadId: threadId || undefined,
        parentId: defaults.parentId || undefined,
        activityArchetypeId: activityArchetypeId || undefined,
      })
```

(d) JSX：在「主线」select 区块（约第 191-205 行 `</div>` 之后、表单内容区闭合前）插入：
```tsx
          <div>
            <label className="text-xs text-body mb-1 block">活动原型</label>
            <ArchetypePicker
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
              enableAiMatch
              title={title}
            />
          </div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/tasks/components/__tests__/task-create-drawer.test.tsx`
Expected: PASS

- [ ] **Step 5: task-edit-zone 加原型字段（批量 draft 透传 + 清除 wiring）**

(a) import：
```tsx
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```

(b) JSX：在属性网格 `</div>`（约第 359 行，`预估时长` 区块所在 grid 闭合后）插入全宽原型区块：
```tsx
      {/* ── 活动原型（批量 draft，随 saveAll 一起 updateTask）── */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-body">活动原型</label>
        <ArchetypePicker
          value={(draft.activityArchetypeId as string | null) ?? task.activityArchetypeId ?? undefined}
          onChange={id => updateDraft('activityArchetypeId', id === undefined ? null : id)}
          enableAiMatch
          title={task.title}
        />
      </div>
```

**[D3 清除 wiring]**：`id === undefined ? null`——编辑既有任务清空原型需 null 落库（tasks 域 updateTask filter `v!==undefined`，null 通过；repo task.ts:320 写入 null）。`value` 用 `(draft.activityArchetypeId as string | null) ?? task.activityArchetypeId ?? undefined` 让 draft 的 null（已清除）回显为「未选择」。`updateDraft('activityArchetypeId', …)` 进 draft，`saveAll` → `updateTask(task.id, draft)` 已含该字段。`task.activityArchetypeId` 为 USOM Task 对象既有字段（`objects.ts:361`）。

- [ ] **Step 5b: [D2 全补] task-edit-zone archetype 字段 render + draft→updateTask 测试**

在 `src/domains/tasks/components/__tests__/task-edit-zone.test.tsx`（若无则建）加用例（mock `getArchetypes` + `updateTask`）：

```tsx
it('[027-A] 渲染「活动原型」字段并显示当前 archetype', async () => {
  render(<TaskEditZone task={{ id: 't1', title: '写周报', activityArchetypeId: 'a1' } as any} onTaskUpdate={() => {}} />)
  expect(await screen.findByText('深度专注')).toBeInTheDocument() // a1 → l2Name
})

it('[027-A] 清除原型 → draft 落 null → updateTask 收到 activityArchetypeId=null', async () => {
  const updateTask = vi.mocked(require('@/app/actions/tasks').updateTask)
  updateTask.mockResolvedValue({ id: 't1', activityArchetypeId: null } as any)
  render(<TaskEditZone task={{ id: 't1', title: '写周报', activityArchetypeId: 'a1' } as any} onTaskUpdate={() => {}} />)
  await screen.findByText('深度专注')
  fireEvent.click(screen.getByRole('button', { name: '清除活动原型' }))
  fireEvent.click(screen.getByRole('button', { name: /保存/ }))
  await waitFor(() => {
    expect(updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ activityArchetypeId: null }))
  })
})
```

- [ ] **Step 5c: [D2 全补] createTask/updateTask archetype 持久化回归断言**

沿用 [post-ship-codex-catches-cross-task-routing-bug] real-routing verify 精神，在 `src/app/actions/__tests__/tasks.test.ts`（若无则建，**不 mock** 路由，用真实 repo 注入或 DB 集成）加：

```tsx
it('[027-A] createTask 透传 activityArchetypeId 到 repo（real routing）', async () => {
  // 验证 submitDynamicIntent→createTasksGenericRepo(passthrough)→TaskRepository.create(data.activityArchetypeId)
  const created = await createTask({ title: '测试', activityArchetypeId: 'a1' })
  expect(created.activityArchetypeId).toBe('a1')
})
```

（updateTask 的 null-clear 已在 Step 5b 覆盖。若项目无 DB 集成测试基建，退化为 repo 层断言：直接断言 `TaskRepository.create` 收到 `activityArchetypeId` 字段——核心是不靠 mock 假设路由，real verify。）

- [ ] **Step 6: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误

- [ ] **Step 7: vitest 域级不回归**

Run: `cd frontend && npx vitest run src/domains/tasks`
Expected: 既有用例不回归（含 task-create-drawer 新用例 PASS）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/domains/tasks/components/task-create-drawer.tsx frontend/src/domains/tasks/components/task-edit-zone.tsx frontend/src/domains/tasks/components/__tests__/task-create-drawer.test.tsx
git commit -m "feat(027-A): /tasks 页面表单（create-drawer + edit-zone）补活动原型字段"
```

---

## Task 5: 删除 `ArchetypePickerCard` + 测试清理 + grep 闭环 + CHANGELOG

**Files:**
- Delete: `frontend/src/components/archetype/archetype-picker-card.tsx`
- Modify: `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx`（注释，[codex #5]）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx`（注释，[codex #5]）
- Modify: `frontend/src/domains/timebox/cnui/parse-appointments.ts`（注释，[codex #5]）
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 2 已迁走全部 `ArchetypePickerCard` 消费方；此刻 grep 应只剩测试/注释引用。

- [ ] **Step 1: grep 确认生产代码零引用**

Run: `cd frontend && grep -rn "ArchetypePickerCard\|archetype-picker-card" src --include="*.tsx" --include="*.ts" | grep -v __tests__`
Expected: 空（仅可能剩测试文件 + 注释，下一步清理）。若有生产引用，回到对应 task 补迁移。

- [ ] **Step 2: 清理测试文件对 ArchetypePickerCard 的引用**

`archetype-picker.test.tsx`：
- 删 import 行 `import { ArchetypePickerCard } from '../archetype-picker-card'`
- 把既有 `[023] A3.2 ArchetypePickerCard 带盒版` 相关 describe/it 改为对 `ArchetypePicker variant="card"` 的等价断言（Task 1 已加 variant=card 用例，可去重——保留一组即可）。若原 Card 用例仅断言「渲染 h3 + 包裹」，与 Task 1 的 `[027-A] variant=card` 用例重复，直接删除原 Card 用例。

**[codex #5] 额外 3 处注释引用（非 import，不阻断编译但阻断 grep 闭环 + 留 stale 文档）**：
- `appointment-form-fields.test.tsx:8`（文件头注释「集成 ArchetypePickerCard」）+ `:87`（内联注释「ArchetypePickerCard 渲染 h3」）→ 改为 `ArchetypePicker variant="card"`
- `create-appointment.test.tsx:168`（内联注释「嵌入 ArchetypePickerCard」）→ 改为 `ArchetypePicker variant="card"`
- `parse-appointments.ts:8`（文件头注释「走 ArchetypePickerCard UI 端」）→ 改为 `ArchetypePicker`

- [ ] **Step 3: 删除 archetype-picker-card.tsx**

```bash
git rm frontend/src/components/archetype/archetype-picker-card.tsx
```

- [ ] **Step 4: grep 二次闭环（含测试）**

Run: `cd frontend && grep -rn "ArchetypePickerCard\|archetype-picker-card" src`
Expected: 空

- [ ] **Step 5: 全量验证**

Run: `cd frontend && npx vitest run src/components/archetype`
Expected: PASS（无对已删组件的残留引用）

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误

- [ ] **Step 6: CHANGELOG 加 [027-A] 段**

`CHANGELOG.md` 顶部（最新版本段之后）加：

```markdown
## [027-A] activityArchetype 界面规范处理 — Phase A：原型选择器统一

- 统一为单一 `ArchetypePicker` + `variant` prop（card=带盒+h3 / inline=裸版），删除 `ArchetypePickerCard`
- 补齐 AI 匹配：TaskCreationCard / TaskEditCard / habit-form（覆盖 HabitCreationCard）
- 补齐 `/tasks` 页面编辑入口：task-create-drawer（创建）+ task-edit-zone（inline 编辑）
- 设计 spec：`docs/superpowers/specs/2026-07-11-027-activity-archetype-ui-standardization-design.md`
- 验证：vitest 不回归 + tsc 0 新增；Phase B（Timebox 模板）另起分支
```

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/archetype/__tests__/archetype-picker.test.tsx CHANGELOG.md
git commit -m "chore(027-A): 删 ArchetypePickerCard + CHANGELOG [027-A]"
```

---

## Self-Review（plan vs spec §2 Phase A 覆盖核对）

- **§2.1 单一组件 + variant** → Task 1 ✅
- **§2.2 消费方迁移表**：
  - #1 AppointmentFormFields → T2 ✅
  - #2 timebox-drawer → T2 ✅
  - #3 CreateTimebox / #4 EditTimeboxes → 不变（裸=inline 默认 + 已有 AI），已在 File Structure 注明 ✅
  - #5 TaskCreationCard / #6 TaskEditCard → T3 ✅
  - #7 habit-form → T3 ✅（HabitCreationCard 经查为 HabitForm 薄壳，T3 覆盖，非独立任务——修正 spec 审计的 file-level 误判）
  - #8 HabitCreationCard → 不变（包 HabitForm）✅
  - #9 task-create-drawer → T4 ✅
  - #10 task-edit-zone → T4 ✅
  - #11 task-detail-drawer → 不变（readOnly）✅
- **§2.3 /tasks 编辑缺口** → T4（edit-zone 作主入口 + create-drawer 创建）✅
- **§2.4 AI 匹配 title 接线** → T3/T4 各传 title（TaskCreationCard `title` / TaskEditCard `editTitle` / habit-form `title`，均经 codex #3 核实）✅
- **§4.1 文档同步** → T5 CHANGELOG（Phase A 无 DB/USOM 变更，database-design/usom-design 留 Phase B）✅
- **§4.2 测试** → T1 variant + 清除 TDD / T3 冒烟（含 CNUI AI）/ T4 task-edit-zone + 持久化回归 ✅
- **§4.3 无新 CNUI surface** → 全程改既有字段，无 manifest 变更 ✅
- **3-state 语义** → T2 AppointmentFormFields 保留 `undefined→null`；T1 新增清除按钮让 3-state 真正可达（codex #1）✅

**类型一致性**：`variant?: 'card' | 'inline'`（T1 定义）在 T2 消费方用 `variant="card"`、T3/T4 默认 inline 一致；`activityArchetypeId` 透传 `string | null | undefined`（编辑 surface undefined→null 落库清除）与 `CreateTaskInput`/`UpdateTaskInput` 既有 `activityArchetypeId?: USOM_ID` 一致。

**占位符扫描**：无 TBD；变量名经 codex 核实（TaskCreationCard `title`:58✅、TaskEditCard `editTitle`:90✅、habit-form `title`:92✅）。

---

## NOT in scope

- **Phase B（Timebox 模板增强）**：单 spec 全做但分阶段，Phase B 等 Phase A 落地后另起分支 + 另写 plan（避免对着未重构 API 空想）。
- **清除原型的二次确认 UX / 跨域 null-clear backend 一致性**：timebox/habit 域当前 2-state，若 null-clear 不支持，该域清除为 cosmetic（GC#9 已记，实现时核实）——不预先扩 backend。
- **activity_archetypes 表/USOM 本体/AI 匹配算法**：复用现状，不改。
- **threads 加原型 FK**：threads 无原型，保持。
- **生产部署**：到 ship-ready + push 为止；`/ship + /land-and-deploy + /canary` 视需要另启。

## What already exists（plan 复用，非重建）

- `ArchetypePicker`（裸版内核）+ `ArchetypePickerCard`（带盒包装）→ plan 合并为单一组件 + variant，删 Card。
- `matchArchetypeForTitle` AI 匹配（规则 + LLM 兜底）→ plan 透传 enableAiMatch + title 复用，不改算法。
- `createTask`/`updateTask` 已接受 `activityArchetypeId`，且 createTasksGenericRepo.create 是 passthrough、TaskRepository.create/update 读写该字段（codex + 人工双核实）→ plan 「无后端改动」成立。
- `HabitForm` 已含原型字段；`HabitCreationCard` 是其薄壳（[019.1]）→ T3 改 habit-form 自动覆盖，非独立消费方。
- TD-022 #6 3-state 语义（[026.02.4] 已修）→ plan 保留 + 通过清除按钮让其在 UI 可达。

## Failure modes

| 代码路径 | 现实失败场景 | 测试覆盖 | 错误处理 | 用户可见 |
|---|---|---|---|---|
| 清除原型 → onChange(undefined) | 编辑 surface 漏 undefined→null wiring → 清不落库（codex #2） | ✅ T1 清除测试 + T4 Step 5b clear→null→updateTask | wiring 即处理 | 静默失败若漏 wiring——测试守住 |
| variant=card DOM 合并 | CSS `.bg-surface-card > div` 选择器命中变化（codex #4） | ⚠️ 靠 /browse 视觉验证（T2） | — | 视觉错位（低概率） |
| task-edit-zone archetype 入 batch draft | 用户改原型未点保存 → 丢失 | 与既有 batch 字段同行为 | 既有 saveAll 流程 | 既有行为，一致 |
| createTask/updateTask archetype 持久化 | intent→repo 路由丢字段（learning 警示） | ✅ T4 Step 5c real-routing 回归 | — | silent failure——测试守住 |
| ArchetypePickerCard 删除 | 遗漏注释/测试引用 → grep 闭环失败（codex #5） | ✅ T5 grep 闭环 | — | 编译不破（注释），但 stale 文档 |

**Critical gaps（无测试 + 无错误处理 + 静默）**：0——清除持久化与路由持久化均有测试守住。

## Worktree parallelization strategy

T1（ArchetypePicker + variant + 清除）是全局基础，T2/T3/T4 全部依赖。T2/T3/T4 触不同域（timebox / tasks / habits）但均依赖 T1 产物；T5 依赖 T1-T4 全部完成。

- **Lane A（顺序）**：T1 → T2 → T3 → T4 → T5（项目既定单分支 SDD 流程，`subagent-driven-dev` 单分支逐 task）。
- 并行机会：T2/T3/T4 在 T1 完成后逻辑独立，可三 worktree 并行（均只 import `ArchetypePicker`，不互改同文件）。但与项目「单分支逐 task + 每 task review」的 SDD 节奏相悖，且总量小（每 task 2-8 行）。
- **结论**：Sequential implementation, no parallelization opportunity（单分支 SDD 优先；并行省时不值得协调成本）。

## Implementation Tasks

Synthesized from this review's findings. Each derives from a specific finding.

- [ ] **T1 (P1, CC: ~15min)** — `ArchetypePicker` — 加 `variant` prop（card/inline）+ 「清除」按钮（D3）+ TDD
  - Surfaced by: Architecture §1（variant 统一）+ codex #1（清除入口）+ D3 决策
  - Files: `components/archetype/archetype-picker.tsx`, `__tests__/archetype-picker.test.tsx`
  - Verify: `npx vitest run src/components/archetype` + `npx tsc --noEmit`
- [ ] **T2 (P2, CC: ~5min)** — 迁移 AppointmentFormFields / timebox-drawer → `variant=card`
  - Surfaced by: spec §2.2 #1/#2
  - Files: `AppointmentFormFields.tsx`, `timebox-drawer.tsx`；/browse 视觉验证 DOM 合并
  - Verify: `npx tsc --noEmit` + /browse appointment + timebox-drawer
- [ ] **T3 (P2, CC: ~10min)** — TaskCreationCard/TaskEditCard/habit-form 补 AI 匹配 + 清除 wiring + CNUI 冒烟
  - Surfaced by: spec §2.2 #5/#6/#7 + codex #3（habit `title` 非 `name`）+ D2 CNUI 冒烟
  - Files: `TaskCreationCard.tsx`, `TaskEditCard.tsx`, `habit-form.tsx` + 3 测试
  - Verify: `npx vitest run src/domains/{tasks,habits}` + tsc
- [ ] **T4 (P1, CC: ~15min)** — /tasks 页面补原型字段 + task-edit-zone 测试 + 持久化回归
  - Surfaced by: spec §2.3 + D2（task-edit-zone 零测试 + 持久化 real-routing verify）
  - Files: `task-create-drawer.tsx`, `task-edit-zone.tsx`, `__tests__/task-edit-zone.test.tsx`, `__tests__/tasks.test.ts`
  - Verify: `npx vitest run src/domains/tasks` + tsc
- [ ] **T5 (P2, CC: ~10min)** — 删 `ArchetypePickerCard` + grep 闭环（含 codex #5 的 3 注释文件）+ CHANGELOG
  - Surfaced by: spec §2.1（单一组件）+ codex #5（注释引用闭环）
  - Files: delete `archetype-picker-card.tsx`，改 `archetype-picker.test.tsx` + 3 注释文件 + `CHANGELOG.md`
  - Verify: `grep -rn "ArchetypePickerCard" src` 空 + `npx vitest run src/components/archetype` + tsc

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` + outside voice | Independent 2nd opinion | 1 | issues_found | 5 findings（清除入口/变量名/T5 文件/DOM 合并/行号），全 folded |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 决策 folded（D1 全做/D2 全补测/D3 清除入口）+ codex 5 findings folded |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | （UI 变更存在，建议后续 /plan-design-review） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** outside voice 抓 3 个真问题——(1) 清除入口 UI-unreachable 且 task-edit-zone 暴露面 [→ D3 folded 为 T1 清除按钮 + 全域 wiring]；(2) habit-form 变量 `title` 非 `name` [→ T3 修正]；(3) T5 漏 3 个注释引用文件 [→ T5 补]。
- **CROSS-MODEL:** 唯一分歧是清除入口 scope（Claude 倾向 OOS/TODO，Codex 主张因暴露面应加入）→ 经 D3 用户裁决「全局加入」，分歧消解，两方共识。
- **VERDICT:** ENG CLEARED — ready to implement（3 决策 + codex 5 findings 全部 folded 入 T1-T5，0 unresolved，0 critical gaps）。建议实现后跑 `/plan-design-review`（UI 变更）+ `/pre-land-review`。

NO UNRESOLVED DECISIONS
