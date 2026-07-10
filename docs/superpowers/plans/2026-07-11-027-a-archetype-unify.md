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

- [ ] **Step 2: TaskEditCard 透传 enableAiMatch + title**

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
            onChange={id => setEditArchetypeId(id)}
            enableAiMatch
            title={editTitle}
          />
```

（`editTitle` 用该组件实际的编辑态标题变量；若编辑态标题就是 `title`，则传 `title`。）

- [ ] **Step 3: habit-form 透传 enableAiMatch + name**

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
          onChange={id => { setActivityArchetypeId(id); onDirtyChange?.(true) }}
          enableAiMatch
          title={name}
        />
```

（`name` 为习惯名称 state；若该组件变量名不同，用实际的。HabitCreationCard 包 HabitForm，此改动自动覆盖。）

- [ ] **Step 4: 写冒烟测试（AI 匹配按钮在 title 存在时渲染）**

在 `frontend/src/domains/habits/components/__tests__/habit-form-archetype.test.tsx` 末尾追加（若已有 mock 基建则复用）：

```tsx
it('[027-A] 传入 name 时渲染「AI 匹配」按钮', async () => {
  render(<HabitForm initial={{ name: '晨跑' }} onSubmit={() => {}} onCancel={() => {}} />)
  // ArchetypePicker 内部按 title.trim() 决定是否显示 AI 匹配
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

- [ ] **Step 5: task-edit-zone 加原型字段（批量 draft 透传）**

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
          value={(draft.activityArchetypeId as string) ?? task.activityArchetypeId ?? undefined}
          onChange={id => updateDraft('activityArchetypeId', id)}
          enableAiMatch
          title={task.title}
        />
      </div>
```

（`updateDraft('activityArchetypeId', id)` 进 draft，`saveAll` → `updateTask(task.id, draft)` 已含该字段。`task.activityArchetypeId` 为 USOM Task 对象既有字段，`objects.ts:361`。）

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
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 2 已迁走全部 `ArchetypePickerCard` 消费方；此刻 grep 应只剩测试文件引用。

- [ ] **Step 1: grep 确认生产代码零引用**

Run: `cd frontend && grep -rn "ArchetypePickerCard\|archetype-picker-card" src --include="*.tsx" --include="*.ts" | grep -v __tests__`
Expected: 空（仅可能剩测试文件，下一步清理）。若有生产引用，回到对应 task 补迁移。

- [ ] **Step 2: 清理测试文件对 ArchetypePickerCard 的引用**

`archetype-picker.test.tsx`：
- 删 import 行 `import { ArchetypePickerCard } from '../archetype-picker-card'`
- 把既有 `[023] A3.2 ArchetypePickerCard 带盒版` 相关 describe/it 改为对 `ArchetypePicker variant="card"` 的等价断言（Task 1 已加 variant=card 用例，可去重——保留一组即可）。若原 Card 用例仅断言「渲染 h3 + 包裹」，与 Task 1 的 `[027-A] variant=card` 用例重复，直接删除原 Card 用例。

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
- **§2.4 AI 匹配 title 接线** → T3/T4 各传 title/name ✅
- **§4.1 文档同步** → T5 CHANGELOG（Phase A 无 DB/USOM 变更，database-design/usom-design 留 Phase B）✅
- **§4.2 测试** → T1 variant TDD / T3 冒烟 / T4 失败测试先行 ✅
- **§4.3 无新 CNUI surface** → 全程改既有字段，无 manifest 变更 ✅
- **3-state 语义** → T2 AppointmentFormFields 注释保留 `undefined→null` 转换 ✅

**类型一致性**：`variant?: 'card' | 'inline'`（T1 定义）在 T2 消费方用 `variant="card"`、T3/T4 默认 inline 一致；`activityArchetypeId` 透传类型 `string | undefined` 与 `CreateTaskInput`/`UpdateTaskInput` 既有 `activityArchetypeId?: USOM_ID` 一致。

**占位符扫描**：T3 的 `title={title}` / `title={editTitle}` / `title={name}` 标注「用实际标题变量」——因组件内变量名需实现时确认，已在步骤中注明判定规则（任务标题/习惯名称 state），非 TBD。
