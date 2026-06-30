# [023] A3.2 Implementation Plan — Archetype CNUI 接入 + 详情只读

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ArchetypePicker`/`EnergyCostAccordion` 拆层公共化到 `src/components/archetype/`，接入 tasks/habits CNUI 创建/编辑表单 + 详情只读展示，两域 manifest 声明 `activityArchetypeId = ContentField`。

**Architecture:** 拆两层——裸版 `ArchetypePicker`（无盒无标题，守 CUC-01/02，+`readOnly`）+ 带盒版 `ArchetypePickerCard`（timebox Drawer 零回归）。裸版接入 tasks(`TaskCreationCard`/`TaskEditCard`) + habits(`HabitForm` 一处，创建+编辑共用)，详情侧 tasks 用 `TaskDetailDrawer` readOnly 裸版、habits 用 `habit-card` 小标签。archetype 是 ContentField（D3），optional，直走 `Repository.updateFields` 不发业务事件。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle / vitest + @testing-library/react / shadcn/ui

## Global Constraints

- **分支**：执行前先开 `feat/023-a3-2-archetype-cnui`，所有 commit 落该分支（CLAUDE.md：main 不直提交）。
- **语言**：所有注释/文档/对话用简体中文。
- **文件头**：每个新建 `.tsx`/`.ts` 必须有 `/** @file ... @brief ... */` 注释。
- **CSS 令牌**：只用 CSS 变量类（`bg-canvas`/`text-ink`/`bg-surface-card`/`border-hairline`/`text-body`/`text-primary`/`bg-hover-overlay` 等），**禁** Tailwind 默认颜色类（`text-red-500`/`bg-gray-100` 等）。
- **CNUI Surface 守 UI-DESIGN-SPEC §11.10**：CUC-01 单层容器（不带自带 `bg/p` 盒）、CUC-02 无静态标题、CUC-04 按钮字号统一（主操作 `text-xs font-medium text-primary-foreground`）、CUC-05 按钮右对齐。
- **archetype 语义**（D3/D10）：`activityArchetypeId` 是 `ContentField` + optional + **不进** `onValidate`/rules-registry。Thread（主线）/`*ActionPanel`/`TaskTreeView` **不接** archetype。
- **数据层已就绪**（A3.1 已 ship）：`Task`/`Habit`/`Timebox` interface 均已声明 `activityArchetypeId?: USOM_ID`（`usom/types/objects.ts:358/473/650`），`CreateTaskInput`/`CreateHabitInput` 含该字段，Repository `create`/`update` 已透传。本 plan **无 schema/迁移改动**；但 **CNUI handler/mapper 层有断裂需补**（见下 C1）。
- **C1 编辑数据链断裂（/autoplan CRITICAL，必须补）**：CNUI handler 的 `formatTaskDetail`/`formatTaskList`（`tasks/cnui/handlers.ts:56-86`）、`TaskItem` 接口（`TaskEditCard.tsx:23-30`）、`HabitListPage.habitToItem`（`HabitListPage.tsx:52-72`）四处**均不传 `activityArchetypeId`** → 编辑态 archetype 永远显示「未选择」。本 plan Task 2 必须补这 4 处（仅 USOM 层已就绪不够，handler→surface 的数据桥也要通）。
- **C2 第二写路径（/autoplan CRITICAL，必须补）**：`TaskEditCard.handleAddSubtask`（`TaskEditCard.tsx:142-154`）是计划原漏掉的第二 `onConfirm` 写路径，必须与 `handleSave` 对称补 `activityArchetypeId: editArchetypeId`，否则「改 archetype → 加子任务」丢变更。
- **C3 ContentField 事件现实（/autoplan CRITICAL，spec 措辞修正）**：`field-executor.execute()`（`field-executor/index.ts:130-170`，:167 无条件 publish）**不按 mutation_mode 分支**，故 archetype 编辑**会**发 `TaskFieldUpdated`/`HabitFieldUpdated` 事件——与 spec D9/§4.2「不发业务事件」表述冲突。本 plan 采用 **C3-(C) 最小范围修正**：改 spec 措辞对齐现实（当前无 subscriber 反应——`EnergyStateManager.applyEvent` 预留未接线、[025] cascade 只订阅状态转换不订阅字段更新，故今日无功能影响）。引擎层按 mutation_mode 分支（C3-(A)）或 updateTask/updateHabit 改走 `service.update()`（C3-(B)）属跨域 mutation 引擎债，**defer 到独立线（关联 [018] 横切债）**，不在 A3.2 scope。
- **M1 TaskDetailDrawer readOnly 是有意产品决策（/autoplan taste，已决）**：详情抽屉 archetype 只读、不可就地改（改走 CNUI `TaskEditCard` 或 `/tasks` 列表内联编辑），对齐 spec §5「详情只读」。**接受此 UX 限制**（非实现疏漏），Task 3.6/3.8 同步写进 spec/plan 显式声明。
- **archetype 语义**（D3/D10）：`activityArchetypeId` 是 `ContentField` + optional + **不进** `onValidate`/rules-registry。Thread（主线）/`*ActionPanel`/`TaskTreeView` **不接** archetype。
- **验证命令**（均在 `frontend/` cwd 跑，`@/` 映射在 repo root 跑会假失败）：
  - 单测：`cd frontend && npx vitest run <path>`
  - 全测：`cd frontend && npm test`
  - 类型：`cd frontend && npx tsc --noEmit`（基线 61 个 pre-existing 错误，零新增）
  - manifest 校验：`cd frontend && npm run validate:manifest`（0 错）
  - 结构校验：`cd frontend && npm run validate:structure`
  - vitest 基线：19 个 pre-existing 失败，用 base/head 失败集合对比，**零新增**。
- **文档同步**（Tier 2 强制）：改 `docs/` 下文档必须同步更新 `manifest.md`。

---

## File Structure

### Task 1 — 公共化（拆两层 + 迁移 + timebox 改 import）
- **Create**: `src/components/archetype/archetype-picker.tsx`（裸版）
- **Create**: `src/components/archetype/archetype-picker-card.tsx`（带盒）
- **Create**: `src/components/archetype/energy-cost-accordion.tsx`（从 timebox 迁移，内容逐字保留）
- **Create**: `src/components/archetype/__tests__/archetype-picker.test.tsx`
- **Delete**: `src/domains/timebox/components/archetype-picker.tsx`
- **Delete**: `src/domains/timebox/components/energy-cost-accordion.tsx`
- **Modify**: `src/domains/timebox/components/timebox-drawer.tsx:43,203-206`（改 import + 用 `ArchetypePickerCard`）
- **Modify**: `src/domains/timebox/components/index.ts:13-14`（删 dead re-export）

### Task 2 — tasks/habits 表单接入 + 两域 manifest + **编辑数据链补全（C1/C2）**
- **Modify**: `src/domains/tasks/cnui/handlers.ts`（**C1**：`formatTaskDetail` + `formatTaskList` 加 `activityArchetypeId: t.activityArchetypeId`）
- **Modify**: `src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`（嵌裸版 + payload）
- **Modify**: `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`（嵌裸版 + payload + **C1** `TaskItem` 接口加 `activityArchetypeId?: string | null` + **C2** `handleAddSubtask` 对称补字段）
- **Modify**: `src/domains/habits/components/habit-form.tsx`（`HabitFormFields` 加字段 + 嵌裸版 + state + initial + submit）
- **Modify**: `src/domains/habits/pages/HabitListPage.tsx`（**C1**：`habitToItem` 加 `activityArchetypeId: h.activityArchetypeId`）
- **Modify**: `src/domains/tasks/manifest.yaml`（`field_metadata.activityArchetypeId`）
- **Modify**: `src/domains/habits/manifest.yaml`（同上）
- **Modify**: `src/domains/habits/__tests__/manifest-field-metadata.test.ts`（`REQUIRED_FIELDS` 加 `activityArchetypeId` + ContentField 断言）
- **Create**: `src/domains/tasks/__tests__/manifest-field-metadata.test.ts`（**H3**：tasks 域对齐 habits，断言 `activityArchetypeId = ContentField`）
- **Create**: `src/domains/tasks/cnui/__tests__/task-creation-card.test.tsx`（payload 含 `activityArchetypeId`）
- **Create**: `src/domains/tasks/cnui/__tests__/task-edit-card.test.tsx`（**H1+C2**：enterEdit/directEdit 回填 + handleSave/handleAddSubtask 两个 onConfirm payload）
- **Create**: `src/domains/habits/components/__tests__/habit-form-archetype.test.tsx`（payload 含 `activityArchetypeId`）

### Task 3 — 详情只读 + Tier 2 文档 + /browse
- **Modify**: `src/domains/tasks/components/task-detail-drawer.tsx:396`（A 区后加 `<ArchetypePicker readOnly/>` 只读行）
- **Modify**: `src/domains/habits/components/habit-card.tsx`（加 `archetypeLabel?` prop + Badge）
- **Modify**: `src/domains/habits/components/habit-list.tsx`（`HabitItem` 加字段 + resolve label + `editInitial` 加字段 + 传 prop）
- **Modify**: `src/domains/habits/components/__tests__/habit-card.test.tsx`（测 `archetypeLabel` Badge）
- **Modify**: `docs/usom-design.md` + `docs/database-design.md` + `manifest.md`

---

## Task 1: ArchetypePicker 拆两层公共化 + EnergyCostAccordion 迁移 + timebox 改 import

**Files:**
- Create: `src/components/archetype/archetype-picker.tsx`
- Create: `src/components/archetype/archetype-picker-card.tsx`
- Create: `src/components/archetype/energy-cost-accordion.tsx`
- Create: `src/components/archetype/__tests__/archetype-picker.test.tsx`
- Delete: `src/domains/timebox/components/archetype-picker.tsx`
- Delete: `src/domains/timebox/components/energy-cost-accordion.tsx`
- Modify: `src/domains/timebox/components/timebox-drawer.tsx`
- Modify: `src/domains/timebox/components/index.ts`

**Interfaces:**
- Consumes: `getArchetypes()` from `@/app/actions/activity-archetype`；`ActivityArchetype`/`EnergyCost` from `@/usom/activity-archetype/types`
- Produces: `ArchetypePicker`（裸版，props `{ value?: string; onChange?: (id, archetype?) => void; readOnly?: boolean }`）、`ArchetypePickerCard`（带盒，props `{ value?: string; onChange?: (id, archetype?) => void }`）、`EnergyCostAccordion`（迁移后签名不变）

- [ ] **Step 1.1: 开分支**

```bash
cd /home/walker/lifeware
git checkout -b feat/023-a3-2-archetype-cnui
```

- [ ] **Step 1.2: 写裸版 + Card 版 + 迁移 energy-cost-accordion 的失败测试**

Create `src/components/archetype/__tests__/archetype-picker.test.tsx`:

```tsx
/**
 * @file archetype-picker 单测
 * @brief [023] A3.2 裸版/带盒版公共化：readOnly 行为 + Card 包裹
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArchetypePicker } from '../archetype-picker'
import { ArchetypePickerCard } from '../archetype-picker-card'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 ArchetypePicker 裸版', () => {
  it('可写模式渲染「选择」按钮', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} />)
    // 等 getArchetypes effect 落幕
    expect(await screen.findByText('选择')).toBeInTheDocument()
  })

  it('readOnly 模式不渲染「选择/更换」按钮', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} />)
    await screen.findByText('深度专注')
    expect(screen.queryByText('选择')).not.toBeInTheDocument()
    expect(screen.queryByText('更换')).not.toBeInTheDocument()
  })

  it('选中后展示 l2Name + l1Category', async () => {
    render(<ArchetypePicker value="a1" onChange={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
    expect(screen.getByText(/工作/)).toBeInTheDocument()
  })

  it('点击下拉项触发 onChange(id, archetype)', async () => {
    const onChange = vi.fn()
    render(<ArchetypePicker value={undefined} onChange={onChange} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    expect(onChange).toHaveBeenCalledWith('a1', expect.objectContaining({ l2Name: '深度专注' }))
  })
})

describe('[023] A3.2 ArchetypePickerCard 带盒版', () => {
  it('渲染 h3 标题 + bg-surface-card 盒', async () => {
    const { container } = render(<ArchetypePickerCard value={undefined} onChange={() => {}} />)
    expect(screen.getByText('活动原型')).toBeInTheDocument()
    expect(container.querySelector('.bg-surface-card')).toBeInTheDocument()
  })
})
```

- [ ] **Step 1.3: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx
```
Expected: FAIL（`Cannot find module '../archetype-picker'`）

- [ ] **Step 1.4: 创建迁移后的 energy-cost-accordion（逐字复制 + 更新文件头）**

Create `src/components/archetype/energy-cost-accordion.tsx`（内容 = 原 `src/domains/timebox/components/energy-cost-accordion.tsx` 逐字，仅 `@file`/`@brief` 注释更新为「跨域共享 4 维 EnergyCost 展示（[023] A3.2 从 timebox 公共化）」）。完整代码见原文件（92 行，`DIM_LABELS` + `EnergyCostAccordion` 组件，props `{ value: EnergyCost; readOnly?: boolean; onChange?: (v) => void }`，import `EnergyCost` from `@/usom/activity-archetype/types` 保持不变）。

- [ ] **Step 1.5: 创建裸版 archetype-picker**

Create `src/components/archetype/archetype-picker.tsx`:

```tsx
/**
 * @file archetype-picker
 * @brief Activity Archetype 选择器（裸版，[023] A3.2 公共化）
 *
 * 裸版：无自带视觉盒（bg-surface-card/p-5）、无静态标题——守 UI-DESIGN-SPEC §11.10
 * CUC-01/02。消费方自带 label（CNUI surface 用 text-xs label，Card 版用 h3）。
 * readOnly 模式（详情只读）：隐藏「选择/更换」按钮 + 下拉，仅展示选中态。
 * 数据源：server action getArchetypes()（Repository server-only，不可在客户端直引）。
 */
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Inbox } from 'lucide-react'
import { getArchetypes } from '@/app/actions/activity-archetype'
import { EnergyCostAccordion } from './energy-cost-accordion'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更（readOnly 时可不传） */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
  /** 只读模式：隐藏按钮与下拉，仅展示选中态 */
  readOnly?: boolean
}

export function ArchetypePicker({ value, onChange, readOnly = false }: ArchetypePickerProps) {
  const [archetypes, setArchetypes] = useState<ActivityArchetype[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  // [H4 /autoplan] archetypes 只在挂载时拉一次（不再随 [value] 重拉）。
  // selected 由 archetypes + value 派生（useMemo），消除「选后闪一下未选择再回填」的抖动。
  useEffect(() => {
    let cancelled = false
    getArchetypes()
      .then(r => {
        if (cancelled) return
        setArchetypes(r.success && r.data ? r.data : [])
      })
      .catch(() => {
        /* 静默失败（无 archetype 不阻塞表单） */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => archetypes.find(a => a.id === value),
    [archetypes, value],
  )

  return (
    <div>
      {selected ? (
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-ink">{selected.l2Name}</div>
            <div className="text-xs text-muted">
              {selected.l1Category} · {selected.isSystem ? '系统内置' : '自定义'}
            </div>
            <div className="mt-1.5">
              <EnergyCostAccordion value={selected.energyCost} readOnly />
            </div>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              className="shrink-0 text-xs text-primary"
            >
              更换
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-body">未选择（可选）</p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              className="text-xs text-primary"
            >
              选择
            </button>
          )}
        </div>
      )}

      {!readOnly && pickerOpen && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-hairline bg-canvas">
          {archetypes.length === 0 ? (
            <p className="flex items-center gap-1.5 p-3 text-xs text-body">
              <Inbox className="size-3.5 text-muted" />
              暂无活动原型，请先到「活动原型配置」创建
            </p>
          ) : (
            archetypes.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange?.(a.id, a)
                  setPickerOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-hover-overlay"
              >
                <span className="text-sm text-ink">{a.l2Name}</span>
                <span className="text-xs text-muted">{a.l1Category}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 1.6: 创建带盒版 archetype-picker-card**

Create `src/components/archetype/archetype-picker-card.tsx`:

```tsx
/**
 * @file archetype-picker-card
 * @brief Activity Archetype 选择器（带盒版，[023] A3.2 公共化）
 *
 * 带盒版：bg-surface-card p-5 + h3 静态标题「活动原型」，包裸版 ArchetypePicker。
 * 供 timebox Drawer 等「页面表单 sub-card」场景使用（视觉盒 + 标题由本组件提供）。
 */
'use client'

import { ArchetypePicker } from './archetype-picker'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

interface ArchetypePickerCardProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更 */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
}

export function ArchetypePickerCard({ value, onChange }: ArchetypePickerCardProps) {
  return (
    <div className="rounded-md bg-surface-card p-5">
      <h3 className="mb-2 text-sm font-medium text-ink">活动原型</h3>
      <ArchetypePicker value={value} onChange={onChange} />
    </div>
  )
}
```

> **视觉微调说明**：原 timebox `ArchetypePicker` 的 h3 与「更换」按钮在 flex 同一行。公共化后 Card 版 h3 单独成行、按钮落在选中态行右侧。这是拆层的必要微调，Task 1 Step 1.10 的 /browse 回归确认视觉可接受。

- [ ] **Step 1.7: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx
```
Expected: PASS（6 个 it 全过）

- [ ] **Step 1.8: 删除 timebox 旧文件 + 改 timebox-drawer import**

Delete:
- `src/domains/timebox/components/archetype-picker.tsx`
- `src/domains/timebox/components/energy-cost-accordion.tsx`

Modify `src/domains/timebox/components/timebox-drawer.tsx`:
- `:43` 把 `import { ArchetypePicker } from './archetype-picker'` 改为：
```tsx
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'
```
- `:203-206` 把 `<ArchetypePicker value={activityArchetypeId} onChange={id => setActivityArchetypeId(id)} />` 改为：
```tsx
            <ArchetypePickerCard
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
            />
```

Modify `src/domains/timebox/components/index.ts`：删掉这两行 dead re-export（无消费方）：
```ts
export { ArchetypePicker } from "./archetype-picker"
export { EnergyCostAccordion } from "./energy-cost-accordion"
```

- [ ] **Step 1.9: 跑 tsc + timebox 回归测试 + validate**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c 'error TS'   # 期望 61（基线，零新增）
cd frontend && npx vitest run src/domains/timebox/components/__tests__/timebox-drawer.test.tsx   # 期望 PASS（迁移后 import 改向，测试仍 mock @/app/actions/activity-archetype，不依赖旧路径）
cd frontend && npm run validate:structure   # 期望通过
cd frontend && npm run validate:manifest    # 期望 0 错
```

- [ ] **Step 1.10: /browse 视觉回归（timebox 零回归确认）**

用 gstack `/browse` 打开 `/schedule` → 点时间格新建时间盒 → 确认 Drawer 内「活动原型」sub-card 正常（盒 + 标题 + 选择按钮 + 选中后 4 维只读）；打开 `/timebox-templates` 确认无破坏。**重点确认 Step 1.6 的视觉微调（h3 单独行）可接受**。

- [ ] **Step 1.11: Commit**

```bash
git add src/components/archetype/ src/domains/timebox/components/timebox-drawer.tsx src/domains/timebox/components/index.ts
git add -u src/domains/timebox/components/archetype-picker.tsx src/domains/timebox/components/energy-cost-accordion.tsx
git commit -m "refactor(archetype): [023] A3.2.1 ArchetypePicker 拆两层公共化 + EnergyCostAccordion 迁移

- 裸版 ArchetypePicker（无盒无标题，CUC-01/02 合规，+readOnly）+ 带盒 ArchetypePickerCard（timebox 零回归）
- energy-cost-accordion 迁至 src/components/archetype/
- timebox-drawer 改用 ArchetypePickerCard，删 timebox 旧文件 + dead re-export

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: tasks/habits CNUI 表单接入 + 两域 manifest field_metadata

**Files:**
- Modify: `src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`
- Modify: `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`
- Modify: `src/domains/habits/components/habit-form.tsx`
- Modify: `src/domains/tasks/manifest.yaml`
- Modify: `src/domains/habits/manifest.yaml`
- Modify: `src/domains/habits/__tests__/manifest-field-metadata.test.ts`
- Create: `src/domains/tasks/cnui/__tests__/task-creation-card.test.tsx`
- Create: `src/domains/habits/components/__tests__/habit-form-archetype.test.tsx`

**Interfaces:**
- Consumes: `ArchetypePicker`（裸版，Task 1 产出）
- Produces: `TaskCreationCard`/`TaskEditCard`/`HabitForm` 的 `onConfirm`/`onSubmit` payload 含 `activityArchetypeId?: string`

- [ ] **Step 2.0: 补全编辑路径数据链（C1，/autoplan CRITICAL）**

> 不补这步，TaskEditCard `enterEdit`/`directEdit` + HabitList 编辑抽屉的 archetype 永远显示「未选择」，编辑功能名存实亡。USOM 层（A3.1）已就绪，但 CNUI handler→surface 的数据桥断了。

Modify `src/domains/tasks/cnui/handlers.ts`:
- `formatTaskDetail`（:56-67）返回对象加：`activityArchetypeId: t.activityArchetypeId,`
- `formatTaskList`（:74-86）每个 `t => ({...})` 加：`activityArchetypeId: t.activityArchetypeId,`

Modify `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`:
- `TaskItem` 接口（:23-30）加字段：`activityArchetypeId?: string | null`

Modify `src/domains/habits/pages/HabitListPage.tsx`:
- `habitToItem`（:52-72）返回对象加：`activityArchetypeId: h.activityArchetypeId,`

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c 'error TS'   # 期望 61（零新增；补字段后 TaskEditCard 读 task.activityArchetypeId 不再 TS 报错）
```

- [ ] **Step 2.1: 扩展 habits manifest 测试（TDD 红信号）**

Modify `src/domains/habits/__tests__/manifest-field-metadata.test.ts`:
- `REQUIRED_FIELDS`（:25-39）末尾加 `'activityArchetypeId',`（变 14 字段）
- 文件头 `@brief` 注释「13 字段」改「14 字段」
- 新增一个 it（放在「已批准分类：ContentField」之后）：

```tsx
  it('已批准分类：ContentField（activityArchetypeId，[023] A3.2 archetype 接入）', () => {
    expect(fieldMetadata.activityArchetypeId?.mutation_mode).toBe('ContentField')
  })
```

- [ ] **Step 2.2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/manifest-field-metadata.test.ts
```
Expected: FAIL（`field_metadata 应覆盖 CreateHabitInput 的全部 14 个字段` → `missing: ['activityArchetypeId']`；新 it 也失败）

- [ ] **Step 2.3: habits manifest 加 activityArchetypeId**

Modify `src/domains/habits/manifest.yaml`，在 `field_metadata:` 块末尾（`daysOfWeek` 之后，:177 附近）加：

```yaml
  activityArchetypeId:
    type: string
    mutation_mode: ContentField
```

- [ ] **Step 2.4: tasks manifest 加 activityArchetypeId**

Modify `src/domains/tasks/manifest.yaml`，在 `field_metadata:` 块内（`notes` 之后，:328 附近）加：

```yaml
  activityArchetypeId:
    type: string
    mutation_mode: ContentField
```

- [ ] **Step 2.5: 跑 manifest 测试 + validate 确认通过**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/manifest-field-metadata.test.ts   # PASS
cd frontend && npm run validate:manifest   # 0 错
```

- [ ] **Step 2.6: 写 TaskCreationCard payload 测试（TDD 红）**

Create `src/domains/tasks/cnui/__tests__/task-creation-card.test.tsx`:

```tsx
/**
 * @file task-creation-card 单测
 * @brief [023] A3.2 验证 TaskCreationCard 接入 ArchetypePicker：提交 payload 含 activityArchetypeId
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskCreationCard } from '../surfaces/TaskCreationCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 TaskCreationCard archetype 接入', () => {
  it('选 archetype 后提交，payload 含 activityArchetypeId', async () => {
    const onConfirm = vi.fn()
    render(
      <TaskCreationCard
        surfaceType="task-creation-card"
        dataModel={{}}
        onDataChange={() => {}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    // 选 archetype（等 getArchetypes effect 落幕后点「选择」→ 点下拉项）
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    // 填必填标题 + 提交
    fireEvent.change(screen.getByPlaceholderText('例如：完成周报'), { target: { value: '写周报' } })
    fireEvent.click(screen.getByText('创建任务'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })

  it('未选 archetype 提交，payload 不含 activityArchetypeId（optional，不阻塞）', async () => {
    const onConfirm = vi.fn()
    render(
      <TaskCreationCard surfaceType="task-creation-card" dataModel={{}} onDataChange={() => {}} onConfirm={onConfirm} onCancel={() => {}} />,
    )
    await screen.findByText('选择')
    fireEvent.change(screen.getByPlaceholderText('例如：完成周报'), { target: { value: '写周报' } })
    fireEvent.click(screen.getByText('创建任务'))
    expect(onConfirm).toHaveBeenCalledWith(expect.not.objectContaining({ activityArchetypeId: expect.anything() }))
  })
})
```

- [ ] **Step 2.7: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/tasks/cnui/__tests__/task-creation-card.test.tsx
```
Expected: FAIL（`onConfirm` payload 不含 `activityArchetypeId`）

- [ ] **Step 2.8: TaskCreationCard 接入 ArchetypePicker**

Modify `src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`:
- `:11` 后加 import：
```tsx
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```
- `:65-67`（`threadId` state 之后）加 state：
```tsx
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(
    (dataModel.activityArchetypeId as string) ?? undefined,
  )
```
- `handleConfirm`（:76-86）的 `onConfirm({...})` 加字段：
```tsx
    onConfirm({
      title: title.trim(),
      description: description || undefined,
      priority: priority || undefined,
      estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
      threadId: threadId || undefined,
      activityArchetypeId,
    })
```
- 「主线选择」div（:193-210）之后、「表单级错误」div 之前，加 archetype 字段：
```tsx
        {/* 活动原型 */}
        <div>
          <label className="text-xs text-body mb-1 block">活动原型</label>
          <ArchetypePicker
            value={activityArchetypeId}
            onChange={id => {
              setActivityArchetypeId(id)
              onDataChange({ ...dataModel, activityArchetypeId: id })
            }}
          />
        </div>
```

- [ ] **Step 2.9: 跑 TaskCreationCard 测试确认通过**

```bash
cd frontend && npx vitest run src/domains/tasks/cnui/__tests__/task-creation-card.test.tsx
```
Expected: PASS

- [ ] **Step 2.10: TaskEditCard 接入 ArchetypePicker**

Modify `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`:
- `:14` 后加 import：
```tsx
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```
- 编辑状态（:81-88，`showSubtaskInput` state 之前）加 state：
```tsx
  const [editArchetypeId, setEditArchetypeId] = useState<string | undefined>(undefined)
```
- `enterEdit`（:118-127）函数体内加：`setEditArchetypeId((task.activityArchetypeId as string) ?? undefined)`
- directEdit 初始化（:99-108）加：`setEditArchetypeId((detail.activityArchetypeId as string) ?? undefined)`
- `handleSave`（:130-139）的 `onConfirm({...})` 加 `activityArchetypeId: editArchetypeId`
- **C2（/autoplan CRITICAL）**：`handleAddSubtask`（:142-154）是第二 `onConfirm` 写路径，必须对称补 `activityArchetypeId: editArchetypeId`（否则「改 archetype → 加子任务」丢变更）：
```tsx
    onConfirm({
      taskId: editingId,
      title: editTitle,
      description: editDescription,
      priority: editPriority,
      estimatedDuration: Number(editDuration),
      activityArchetypeId: editArchetypeId,
      createSubtask: { title: subtaskTitle.trim(), parentId: editingId, threadId: editThreadId },
    })
```
- `renderEditForm`（:159 起的 `<div className="flex flex-col gap-2.5 ...">` 内），在「优先级+预估时长」grid（:179-213）之后、子任务区（:215）之前，加：
```tsx
        {/* 活动原型 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-body">活动原型</label>
          <ArchetypePicker
            value={editArchetypeId}
            onChange={id => setEditArchetypeId(id)}
          />
        </div>
```

- [ ] **Step 2.11: 写 HabitForm archetype 测试（TDD 红）**

Create `src/domains/habits/components/__tests__/habit-form-archetype.test.tsx`:

```tsx
/**
 * @file habit-form-archetype 单测
 * @brief [023] A3.2 验证 HabitForm 接入 ArchetypePicker：提交 payload 含 activityArchetypeId
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HabitForm } from '../habit-form'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
    ],
  }),
}))

describe('[023] A3.2 HabitForm archetype 接入', () => {
  it('选 archetype 后提交，payload 含 activityArchetypeId', async () => {
    const onSubmit = vi.fn()
    render(<HabitForm onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.click(await screen.findByText('选择'))
    fireEvent.click(await screen.findByText('深度专注'))
    // 填必填标题 + 提交
    fireEvent.change(screen.getByPlaceholderText('例如：晨跑、午休冥想'), { target: { value: '晨跑' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })

  it('编辑模式 initial.activityArchetypeId 回填', async () => {
    render(<HabitForm initial={{ title: '晨跑', activityArchetypeId: 'a1' } as any} onSubmit={() => {}} onCancel={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2.12: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/habits/components/__tests__/habit-form-archetype.test.tsx
```
Expected: FAIL（payload 不含 `activityArchetypeId`）

- [ ] **Step 2.13: HabitForm 接入 ArchetypePicker**

Modify `src/domains/habits/components/habit-form.tsx`:
- `:10`（`useEffect` import 同行后）确认有 `useEffect`；`:14` 后加 import：
```tsx
import { ArchetypePicker } from "@/components/archetype/archetype-picker"
```
- `HabitFormFields`（:24-37）末尾（`endDate?: string` 之后）加：
```tsx
  activityArchetypeId?: string
```
- state（:102 `autoFilled` state 附近）加：
```tsx
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(initial?.activityArchetypeId)
```
- `handleSubmit`（:143-171）的 `fields: HabitFormFields = {...}`（:148-161）末尾（`endDate` 之后）加 `activityArchetypeId,`
- 表单 JSX（:373「日期范围」grid 之后、:375「校验错误」之前）加：
```tsx
      {/* 活动原型 */}
      <div className="flex flex-col gap-1.5">
        <Label>活动原型</Label>
        <ArchetypePicker
          value={activityArchetypeId}
          onChange={id => { setActivityArchetypeId(id); onDirtyChange?.(true) }}
        />
      </div>
```

- [ ] **Step 2.13a: 新增 tasks manifest ContentField 测试（H3，对齐 habits）**

Create `src/domains/tasks/__tests__/manifest-field-metadata.test.tsx`（参照 `habits/__tests__/manifest-field-metadata.test.ts` 结构，断言 tasks manifest 的 `field_metadata.activityArchetypeId.mutation_mode === 'ContentField'`）：
```tsx
/**
 * @file tasks manifest field_metadata
 * @brief [023] A3.2 tasks 域 manifest field_metadata 守护（对齐 habits，H3）
 */
import { describe, it, expect } from 'vitest'
import { loadDomainManifest } from '@/domains/manifest-loader'

const result = loadDomainManifest('tasks')
const fieldMetadata = result.success ? result.manifest.field_metadata : {}

describe('[023] A3.2 tasks manifest archetype 接入', () => {
  it('manifest 应成功加载', () => { expect(result.success).toBe(true) })
  it('activityArchetypeId 声明为 ContentField（D3，不发业务事件——C3 已知现实偏差见 spec）', () => {
    expect(fieldMetadata.activityArchetypeId?.mutation_mode).toBe('ContentField')
  })
})
```

- [ ] **Step 2.13b: 新增 TaskEditCard 编辑路径测试（H1+C2 回归）**

Create `src/domains/tasks/cnui/__tests__/task-edit-card.test.tsx`：
```tsx
/**
 * @file task-edit-card 单测
 * @brief [023] A3.2 TaskEditCard 编辑路径：archetype 回填 + 两个 onConfirm payload（H1+C2 回归）
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskEditCard } from '../surfaces/TaskEditCard'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({ success: true, data: [
    { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
  ]}),
}))

describe('[023] A3.2 TaskEditCard archetype 编辑路径', () => {
  it('directEdit（phase=detail）回填 task 原 archetype', async () => {
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={() => {}} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
  })
  it('handleSave 提交 payload 含 activityArchetypeId', async () => {
    const onConfirm = vi.fn()
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={onConfirm} />)
    await screen.findByText('深度专注')
    fireEvent.click(screen.getByText('保存'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1' }))
  })
  it('C2 回归：handleAddSubtask 提交同样保留 activityArchetypeId（不丢变更）', async () => {
    const onConfirm = vi.fn()
    render(<TaskEditCard surfaceType="task-edit-card"
      dataModel={{ phase: 'detail', task: { id: 't1', title: '写周报', priority: 'high', estimatedDuration: 60, status: 'todo', activityArchetypeId: 'a1' } }}
      onDataChange={() => {}} onConfirm={onConfirm} />)
    await screen.findByText('深度专注')
    fireEvent.click(screen.getByText('添加子任务'))
    fireEvent.change(screen.getByPlaceholderText('子任务标题'), { target: { value: '子1' } })
    fireEvent.click(screen.getByText('确认添加'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ activityArchetypeId: 'a1', createSubtask: expect.anything() }))
  })
})
```
> 占位文案/按钮文案以 `TaskEditCard.tsx` 实际为准（实现时按 `renderEditForm` 真实文本调整选择器）。

- [ ] **Step 2.14: 跑 HabitForm 测试 + 全量基线确认**

```bash
cd frontend && npx vitest run src/domains/habits/components/__tests__/habit-form-archetype.test.tsx   # PASS
cd frontend && npx vitest run src/domains/habits/cnui/__tests__/habit-creation-card.test.tsx   # PASS（HabitCreationCard 透传 initial/activityArchetypeId 自动覆盖）
cd frontend && npx tsc --noEmit 2>&1 | grep -c 'error TS'   # 61（零新增）
cd frontend && npm test   # base/head 失败集合对比零新增（19 pre-existing）
```

- [ ] **Step 2.15: Commit**

```bash
git add src/domains/tasks/cnui/ src/domains/habits/components/habit-form.tsx src/domains/habits/cnui/__tests__/habit-creation-card.test.tsx src/domains/tasks/manifest.yaml src/domains/habits/manifest.yaml src/domains/habits/__tests__/manifest-field-metadata.test.ts
git commit -m "feat(archetype): [023] A3.2.2 tasks/habits CNUI 表单接入 ArchetypePicker + 两域 manifest ContentField

- TaskCreationCard/TaskEditCard/habit-form 嵌裸版 ArchetypePicker，payload 加 activityArchetypeId
- tasks/habits manifest field_metadata.activityArchetypeId = ContentField（D3，不发业务事件）
- 扩展 manifest-field-metadata.test（14 字段）+ 新增 TaskCreationCard/HabitForm archetype payload 测试

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 详情只读展示 + Tier 2 文档 + /browse 视觉验证

**Files:**
- Modify: `src/domains/tasks/components/task-detail-drawer.tsx`
- Modify: `src/domains/habits/components/habit-card.tsx`
- Modify: `src/domains/habits/components/habit-list.tsx`
- Modify: `src/domains/habits/components/__tests__/habit-card.test.tsx`
- Modify: `docs/usom-design.md` + `docs/database-design.md` + `manifest.md`

**Interfaces:**
- Consumes: `ArchetypePicker`（裸版 readOnly）、`getArchetypes()`、`ActivityArchetype`
- Produces: `HabitCard` 新增 `archetypeLabel?: string` prop；`HabitList.HabitItem` 新增 `activityArchetypeId?: string`

- [ ] **Step 3.1: 写 habit-card archetypeLabel 测试（TDD 红）**

Modify `src/domains/habits/components/__tests__/habit-card.test.tsx`，文件末尾追加：

```tsx
describe('[023] A3.2 HabitCard archetype 小标签', () => {
  it('传 archetypeLabel 时渲染活动原型 Badge', () => {
    render(<HabitCard {...base} archetypeLabel="深度专注" />)
    expect(screen.getByText('深度专注')).toBeInTheDocument()
  })
  it('不传 archetypeLabel 时不渲染标签', () => {
    render(<HabitCard {...base} />)
    expect(screen.queryByText('活动原型')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/habits/components/__tests__/habit-card.test.tsx
```
Expected: FAIL（`archetypeLabel` prop 不存在 / TS 报错）

- [ ] **Step 3.3: HabitCard 加 archetypeLabel prop + Badge**

Modify `src/domains/habits/components/habit-card.tsx`:
- `HabitCardProps`（:18-59）加 prop：
```tsx
  /** 活动原型显示名（[023] A3.2 只读小标签，由父组件 resolve 后传入） */
  archetypeLabel?: string
```
- 解构（:106-127）加 `archetypeLabel,`
- 顶栏 Badge 区（:175-187，`frequencyType` Badge 之后、状态标签之前）加：
```tsx
            {archetypeLabel && (
              <Badge variant="outline">{archetypeLabel}</Badge>
            )}
```

- [ ] **Step 3.4: 跑 habit-card 测试确认通过**

```bash
cd frontend && npx vitest run src/domains/habits/components/__tests__/habit-card.test.tsx   # PASS
```

- [ ] **Step 3.5: HabitList resolve archetype label + 传 prop**

Modify `src/domains/habits/components/habit-list.tsx`:
- `:10`（useEffect 已在 import）确认；`:18-19` import 加：
```tsx
import { getArchetypes } from "@/app/actions/activity-archetype"
import type { ActivityArchetype } from "@/usom/activity-archetype/types"
```
- `HabitItem`（:25-43）加字段：
```tsx
  activityArchetypeId?: string
```
- 组件内（:83 `isBatchProcessing` state 附近）加 archetype map state + effect：
```tsx
  const [archetypeMap, setArchetypeMap] = useState<Record<string, ActivityArchetype>>({})
  useEffect(() => {
    let cancelled = false
    getArchetypes()
      .then(r => {
        if (cancelled) return
        const list = r.success && r.data ? r.data : []
        const map: Record<string, ActivityArchetype> = {}
        for (const a of list) map[a.id] = a
        setArchetypeMap(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
```
- `editInitial`（:146-161）末尾（`endDate: editingHabit.endDate,` 之后）加：`activityArchetypeId: editingHabit.activityArchetypeId,`
- `<HabitCard>` 调用（:313-336）加 prop（在 `frequencyType={habit.frequencyType}` 之后）：
```tsx
                          archetypeLabel={habit.activityArchetypeId ? archetypeMap[habit.activityArchetypeId]?.l2Name : undefined}
```

- [ ] **Step 3.6: TaskDetailDrawer 加 archetype 只读行**

Modify `src/domains/tasks/components/task-detail-drawer.tsx`:
- `:22`（`TaskCompleteZone` import 之后）加 import：
```tsx
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
```
- A 区（:396 `<TaskEditZone .../>` 之后、「小屏展开按钮」:399 之前）加只读行：
```tsx
              {/* ── 活动原型（只读，[023] A3.2）── */}
              {currentTask.activityArchetypeId !== undefined && (
                <div>
                  <label className="text-xs text-body mb-1 block">活动原型</label>
                  <ArchetypePicker value={currentTask.activityArchetypeId} readOnly />
                </div>
              )}
```

> 注：`Task` interface 已声明 `activityArchetypeId?: USOM_ID`（A3.1），`currentTask.activityArchetypeId` 可读。
> - **渲染条件 M3（/autoplan 修正）**：`!== undefined` 才渲染。archetype 被删时 FK `ON DELETE SET NULL`（spec §4.1）把字段清成 NULL（JS `undefined`）→ **整块不渲染**（与 DB SET NULL 语义一致，无残留展示）。plan 旧版「已选但删除→显示未选择」描述与 SET NULL 行为矛盾、不成立，已删（M3）。
> - **M1 有意产品决策（/autoplan）**：详情抽屉 archetype **只读、不可就地改**（改走 CNUI `TaskEditCard` 或 `/tasks` 列表内联编辑），对齐 spec §5「详情只读」。Step 3.8 同步写进 spec 显式声明此 UX 限制（非实现疏漏）。

- [ ] **Step 3.6a: 新增 TaskDetailDrawer 只读行 render 测试（H2）**

Create `src/domains/tasks/components/__tests__/task-detail-drawer.test.tsx`（mock `getArchetypes`，断言渲染条件）：
```tsx
/**
 * @file task-detail-drawer 单测
 * @brief [023] A3.2 TaskDetailDrawer archetype 只读行 render 守护（H2）
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskDetailDrawer } from '../task-detail-drawer'

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({ success: true, data: [
    { id: 'a1', l2Name: '深度专注', l1Category: '工作', isSystem: true, energyCost: { physical: 2, mental: 9, emotional: 3, creative: 4 } },
  ]}),
}))

describe('[023] A3.2 TaskDetailDrawer archetype 只读行', () => {
  it('activityArchetypeId 非空时渲染只读 archetype 区', async () => {
    render(<TaskDetailCard {...(/* 最小 props，currentTask.activityArchetypeId='a1' */)} />)
    expect(await screen.findByText('深度专注')).toBeInTheDocument()
    expect(screen.queryByText('选择')).not.toBeInTheDocument() // readOnly 无按钮
  })
  it('activityArchetypeId 为 undefined 时整块不渲染（M3: SET NULL→undefined→不渲染）', () => {
    render(<TaskDetailCard {...(/* currentTask.activityArchetypeId=undefined */)} />)
    expect(screen.queryByText('活动原型')).not.toBeInTheDocument()
  })
})
```
> TaskDetailDrawer props 较重，实现时按其真实 props 签名构造最小 fixture（或抽 `currentTask` 注入点）；核心断言是「有值渲染 + readOnly 无『选择』按钮」与「无值不渲染」。

- [ ] **Step 3.7: 跑 tsc + 全量基线 + validate**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c 'error TS'   # 61（零新增）
cd frontend && npm test   # base/head 失败集合对比零新增
cd frontend && npm run validate:manifest && npm run validate:structure   # 0 错 / 通过
```

- [ ] **Step 3.8: 同步 Tier 2 文档 + C3 spec 措辞修正 + M1 声明**

Modify `docs/superpowers/specs/2026-06-30-023-a3-archetype-integration-design.md`（**C3，/autoplan CRITICAL**）：
- §4.2 写路径叙事修正：把「直走 `Repository.updateFields`（单条 UPDATE，不发业务事件）」改为实际行为——「`updateTask`/`updateHabit` 走 `service.execute()` 多步路径，`field-executor` 写库后**会** `publish(fieldUpdatedEventType)` 事件（不按 `mutation_mode` 分支）。archetype=ContentField 当前**仍发** `TaskFieldUpdated`/`HabitFieldUpdated`；今日无 subscriber 反应（`EnergyStateManager.applyEvent` 预留未接线、[025] cascade 只订阅状态转换），故无功能影响。」
- D9 补一句：「ContentField 的事件 leak 是已知引擎债，引擎层按 `mutation_mode` 分支（C3-(A)）defer 到独立线（关联 [018] 横切债），不在 A3.2 scope。」
- §5 详情只读补 **M1 声明**：「tasks 详情抽屉 archetype 只读，不可就地编辑——修改走 CNUI `TaskEditCard` 或 `/tasks` 列表内联编辑。这是有意产品决策（非实现疏漏）。」

Modify `docs/usom-design.md`：在 Activity Archetype 章节（§3.11 附近）补一段「tasks/habits UI 层接入（[023] A3.2）：CNUI 创建/编辑表单可选 Archetype（ContentField），TaskDetailDrawer readOnly + habit-card 小标签；编辑数据链经 handlers.ts/habitToItem 透传（C1）」。

Modify `docs/database-design.md`：`tasks`/`habits` 表的 `activity_archetype_id` 列说明补「UI 层已接入（A3.2，CNUI 表单 + 详情只读）；FK ON DELETE SET NULL→详情行整块不渲染」。

Modify `manifest.md`：登记本次 `docs/` 变更（A3.2 文档同步 + C3 spec 修正）。

- [ ] **Step 3.9: /browse 视觉验证（§11.10 CUC-01~12 + §14）**

用 gstack `/browse`：
1. `/tasks` → AI 对话内创建任务 → 选「活动原型」→ 确认 surface 内 ArchetypePicker **无自带盒/无重复标题**（CUC-01/02），按钮字号 `text-xs`（CUC-04）、右对齐（CUC-05）。
2. 任务详情抽屉 → 确认 A 区后「活动原型」只读行（l2Name + L1 + 4 维只读 accordion）。
3. `/habits` → 新建/编辑习惯 → 选「活动原型」→ 确认表单接入正常。
4. `/habits` 列表 → 确认 habit-card 显示 archetype Badge（小标签）。
5. 回归 `/schedule` + `/timebox-templates`（确认 Task 1 公共化无破坏）。

- [ ] **Step 3.10: Commit**

```bash
git add src/domains/tasks/components/task-detail-drawer.tsx src/domains/habits/components/habit-card.tsx src/domains/habits/components/habit-list.tsx src/domains/habits/components/__tests__/habit-card.test.tsx docs/usom-design.md docs/database-design.md manifest.md
git commit -m "feat(archetype): [023] A3.2.3 详情只读展示（TaskDetailDrawer readOnly + habit-card 小标签）+ Tier 2 文档

- TaskDetailDrawer A 区后加 ArchetypePicker readOnly 只读行
- habit-card 加 archetypeLabel Badge，habit-list resolve getArchetypes 映射 + HabitItem 加字段 + editInitial 回填
- 同步 usom-design/database-design/manifest.md（Tier 2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review（plan 写完自检）

1. **Spec 覆盖**：
   - D7/D10 公共化拆两层 → Task 1 ✓
   - §5 接入点（TaskCreationCard/TaskEditCard/habit-form）→ Task 2 ✓
   - 不接 Thread/ActionPanel/TaskTreeView → Global Constraints + Task 2 未触及 ✓
   - §6 manifest field_metadata ContentField（两域）→ Task 2 ✓
   - §5 详情只读（TaskDetailDrawer readOnly + habit-card 小标签）→ Task 3 ✓
   - §7 Tier 2 文档 → Task 3.8 ✓
   - §8 验收（tsc/vitest base=head/§11.10/§14 /browse）→ 各 Task 末尾 + Task 3.9 ✓
2. **Placeholder 扫描**：energy-cost-accordion 迁移指明「逐字复制原文件」（92 行，已在探索阶段读全）；无 TBD/TODO。✓
3. **类型一致性**：`ArchetypePicker` props `{ value?: string; onChange?: ...; readOnly?: boolean }`（Task 1 定义）↔ Task 2/3 消费一致；`HabitFormFields.activityArchetypeId?: string`（Task 2.13 定义）↔ habit-list `editInitial`（Task 3.5）一致；`HabitCard.archetypeLabel?`（Task 3.3 定义）↔ habit-list 传参（Task 3.5）一致。✓
4. **歧义**：Task 1.6 视觉微调（h3 单独行）已显式说明 + 1.10 /browse 确认；optional 语义（未选不阻塞）Task 2.6 有专门 it 覆盖。✓
5. **/autoplan 修订折入（2026-06-30）**：3 CRITICAL 已折入——C1 编辑数据链（Step 2.0：handlers.ts ×2 + TaskItem + habitToItem）、C2 handleAddSubtask（Step 2.10）、C3 spec 措辞修正（Step 3.8，引擎层分支 defer）；3 HIGH 测试已折入——H1 task-edit-card（Step 2.13b，含 C2 回归）、H3 tasks manifest（Step 2.13a）、H2 TaskDetailDrawer render（Step 3.6a）；H4 ArchetypePicker `selected` 改 useMemo + 去 `[value]` 重拉（Step 1.5）；M1 readOnly 定性有意决策（Step 3.6/3.8）、M3 注释矛盾已修（Step 3.6）。✓

---

## /autoplan 评审报告（2026-06-30）

> 双声音评审：3 个独立 Claude subagent（CEO / Design / Eng）+ Codex（MiniMax-M3，read-only，逐行核对真实代码）。所有 CRITICAL/HIGH 发现均经主审 quote 真实代码验证（pre-emit gate）。

### Decision Audit Trail（auto-decisions）

| # | Phase | Decision | 分类 | 原则 | 说明 |
|---|-------|----------|------|------|------|
| 1 | Eng | 修编辑路径数据链（C1） | auto (mechanical) | P1 完整性 | handlers.ts formatTaskDetail/formatTaskList + TaskItem + HabitListPage habitToItem 全部不传 activityArchetypeId，编辑态永远显示「未选择」——必须补 |
| 2 | Eng | 修 handleAddSubtask 第二写路径（C2） | auto (mechanical) | P1 正确性 | TaskEditCard:142-154 是计划漏掉的第二 onConfirm，改 archetype 后加子任务会丢变更——必须补 |
| 3 | Eng | 修正 spec §4.2/D9「不发业务事件」（C3） | auto (mechanical) | P5 显式 | field-executor:130-170 无条件 publish，spec 表述为假——必须改 spec 或改 executor 分支 |
| 4 | Eng | 补 4 类测试缺口（H1/H2/H3） | auto (mechanical) | P1 完整性 | TaskEditCard 编辑路径/TaskDetailDrawer/tasks manifest 全零测试——必须补 |
| 5 | Eng | getArchetypes 缓存/去重拉（H4） | **taste (defer 候选)** | P3 | 真实但数据量小、单租户 MVP，可 defer 到 neat |
| 6 | Design | TaskDetailDrawer readOnly 死胡同（M1） | **taste / 产品决策** | — | 详情可见不可改，其他字段都可改——待用户决议 |
| 7 | Design | habit-card Badge 降权（M2） | taste | P3 | 标题行 Badge 过载 |
| 8 | Design/CEO | D10 拆两层 vs 单组件 variant | taste | P5 | 拆分缺论证，但已 in-flight，改回成本 > 收益 |
| 9 | CEO | archetype 战略价值（F6 dead-field 风险） | **上抛（超 A3.2 范围）** | — | optional+D9+prod 无 seed 三叠 → 可能重走 energyProfile 老路；属 [023] 系列级，非本 plan 缺陷 |

### CRITICAL（ship-blocker，必须修后方可进 subagent-driven-dev）

**C1 — 编辑路径数据链断裂（3 处源头）** [置信 9/10，已验证]
- `frontend/src/domains/tasks/cnui/handlers.ts:56-67` `formatTaskDetail` 返回 8 字段，无 activityArchetypeId
- `frontend/src/domains/tasks/cnui/handlers.ts:74-86` `formatTaskList` 返回 9 字段，无 activityArchetypeId
- `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx:23-30` `TaskItem` 接口无 activityArchetypeId（plan Step 2.10 读 `task.activityArchetypeId` → TS strict 报错）
- `frontend/src/domains/habits/pages/HabitListPage.tsx:52-72` `habitToItem` 映射 17 字段，无 activityArchetypeId
- 后果：TaskEditCard enterEdit/directEdit + HabitList 编辑抽屉的 archetype **永远显示「未选择」**；用户重存不会清 DB（filter undefined），但 UI/DB 不一致、编辑功能名存实亡。plan 完全没触碰这 4 个文件。
- 修复（T1）：4 处全部补 `activityArchetypeId`，TaskItem 接口加字段。

**C2 — TaskEditCard handleAddSubtask 第二写路径丢 archetype** [置信 9/10，已验证]
- `TaskEditCard.tsx:142-154` `handleAddSubtask` 的 `onConfirm` payload 无 activityArchetypeId；plan Step 2.10 只补了 `handleSave`（:130-139）。
- 后果：用户改 archetype 后点「添加子任务」（而非先保存）→ archetype 变更丢失，与 handleSave 行为不一致。
- 修复（T2）：handleAddSubtask payload 加 `activityArchetypeId: editArchetypeId`。

**C3 — spec §4.2/D9「ContentField 不发业务事件」事实上为假** [置信 8/10，已验证]
- `frontend/src/nexus/field-executor/index.ts:130-170` `execute()` 写库后第 167 行**无条件** `ctx.eventBus.publish(event)`，无 `mutation_mode` 分支；注释 :120 自承「发 ctx.fieldUpdatedEventType 事件」。
- `updateTask`/`updateHabit` 走 `service.execute(...)`（多步 field-executor 路径），**不走** `service.update()`（唯一尊重 mutation_mode 的路径）。
- 后果：archetype 编辑**会**发 TaskFieldUpdated/HabitFieldUpdated 事件，与 D9「不发业务事件」冲突；当前无 subscriber 反应（EnergyStateManager.applyEvent 预留未接线），故非今日功能阻断，但 spec 是错的，未来接线即炸。
- 修复（T3）：三选一——(A) field-executor 按 mutation_mode 分支跳过 publish；(B) updateTask/updateHabit 对 ContentField 走 service.update()；(C) 改写 spec D9 措辞为「ContentField 仍发事件，subscriber 应忽略」。最低要求：Tier-2 文档说明实际行为。

### HIGH（应同分支修）

- **H1** TaskEditCard 编辑路径零测试（enterEdit/directEdit/handleSave/handleAddSubtask 全无）→ T4
- **H2** TaskDetailDrawer 只读行零 render 测试 → T5
- **H3** tasks 域无 manifest field_metadata 覆盖测试（与 habits 不对称，Step 2.4 加 ContentField 无守护）→ T6
- **H4** ArchetypePicker `useEffect([value])` 每次值变全量重拉 getArchetypes，无缓存；habit-list 另拉一次；HabitCreationCard 再挂一个 picker → T7（可 defer）

### MEDIUM / LOW（见 Decision Audit Trail #6/#7 + T8-T11）

### 双声音共识（cross-model）

**ENG DUAL VOICES — CONSENSUS**
| 维度 | Claude subagent | Codex | 共识 |
|------|-----------------|-------|------|
| 架构健全？ | 否（编辑数据链断） | 否（同 + handlers 链断） | ✅ CONFIRMED（C1） |
| 测试充分？ | 否（编辑路径漏） | 否（同 + 4 类缺口） | ✅ CONFIRMED（H1-H3） |
| 性能风险？ | getArchetypes N+1 | 同（+ HabitCreationCard） | ✅ CONFIRMED（H4） |
| 错误路径？ | 孤儿 FK 未处理 | 同 | ✅ CONFIRMED（M4） |
| spec 写路径真实？ | D9 为假 | 同（CRITICAL #1） | ✅ CONFIRMED（C3） |
| 部署风险？ | 无新攻击面 | 同 | ✅ CONFIRMED |

**CEO / DESIGN**：单模型为主（Codex 重 eng），交叉点（h3 视觉回归、readOnly 死胡同、orphan FK）三向一致。

**Cross-phase theme（高置信）**：编辑/详情侧集成 under-built——Eng（C1 数据链）+ Design（M1 readOnly 死胡同）+ Codex 三处独立命中。这是本 plan 最系统的缺口：创建路径（已验证可用）完整，编辑/详情路径断裂。

### 行动建议

plan **不可原样进入 subagent-driven-dev**。推荐路径：先在 plan 内补 C1/C2/C3 三个 CRITICAL 的修复步骤（T1-T3，均为小改 + 1 个 spec 措辞），补 H1-H3 三类测试（T4-T6），再开 feat/023-a3-2-archetype-cnui 执行。M1（readOnly 死胡同）需用户先做产品决议。H4/T7-T11 可 defer 或执行中顺手处理。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES_OPEN | 15 发现（1 critical 战略 F6 + 4 high），3 unresolved，via /autoplan |
| Codex Review | `codex exec` | Independent 2nd opinion | 1 | ISSUES_OPEN | 15 发现（5 CRITICAL + 4 HIGH），逐行核对真实代码 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 7 发现（1 P0 + 3 P1 + 3 P2），3 critical gaps，via /autoplan |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES_OPEN | 9 发现（2 HIGH + 4 MEDIUM），score 6/10，via /autoplan |
| DX Review | `/plan-devex-review` | Developer experience | 0 | — | skipped, no developer-facing scope |

- **CODEX:** 独立确认 Claude 全部 CRITICAL/HIGH，并额外发现编辑数据链 3 处源头断裂（handlers.ts formatTaskList/formatTaskDetail + HabitListPage habitToItem）。
- **CROSS-MODEL:** Claude × Codex 在 eng 6 维全 CONFIRMED、零 disagree；编辑/详情 under-built 为三向（Eng+Design+Codex）一致主题。
- **VERDICT:** ENG CLEARED (PLAN REVISED) — 用户选「修订 plan」，3 CRITICAL（C1 编辑数据链 / C2 handleAddSubtask / C3 spec 措辞）+ 3 HIGH 测试（H1/H2/H3）已全部折入 plan 步骤（Step 2.0/2.10/2.13a/2.13b/3.6a/3.8）；H4 最小修复（Step 1.5 useMemo）；M1/M3 已决议标注。plan 现可进 subagent-driven-dev。CEO/Design 供参考不阻断。

**修订折入清单（Revise 后，原 CRITICAL/HIGH 已解决）:**
- ✅ C1 → Step 2.0（handlers.ts ×2 + TaskItem + habitToItem）
- ✅ C2 → Step 2.10（handleAddSubtask 对称补字段）+ Step 2.13b 回归测
- ✅ C3 → Step 3.8（spec §4.2/D9 措辞修正对齐现实；引擎层 mutation_mode 分支 defer）
- ✅ H1 → Step 2.13b（task-edit-card.test）；H2 → Step 3.6a（task-detail-drawer.test）；H3 → Step 2.13a（tasks manifest test）
- ✅ H4（部分）→ Step 1.5（selected useMemo + fetch once）
- ✅ M1 → Step 3.6/3.8（readOnly 定性有意决策 + spec 声明）；M3 → Step 3.6（注释矛盾已修）

**UNRESOLVED DECISIONS:**
- C3 引擎层（C3-(A) field-executor 按 mutation_mode 分支 / C3-(B) updateTask 走 service.update）—— 跨域 mutation 引擎债，关联 [018] 横切债，**defer 独立线**（A3.2 仅做 spec 措辞修正 C3-(C)，今日无 subscriber 反应故无功能影响）
- M2 habit-card archetype Badge 视觉权重 —— 实现期按 `variant="outline"` 落地，过重再降权（T9，P3）
- M4 孤儿 archetype「清除」入口 —— 可选 follow-up（T11，P3），当前 D3 optional + FK SET NULL 可接受
- H4 完整缓存（SWR/Context 共享 getArchetypes）—— Step 1.5 已做最小修复（去重拉），完整缓存 defer（T7 剩余部分，P3）
