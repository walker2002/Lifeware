# [023.11] Timebox Action 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 editTimeboxes 三处 UX 问题（manifest 改名 / 双重标题 / 编辑页空白）+ 为 createTimebox/editTimeboxes 加 AI 活动原型匹配（规则优先 + LLM 兜底，被动推断仅 createTimebox，主动按钮两表单共享）。

**Architecture:** 7 任务串行。Part 1（Task 1-2）低风险 UX 修复，与 matcher 无关；Part 2 以 `domains/timebox/lib/archetype-matcher.ts` 纯函数为唯一原语（Task 3），被动推断（Task 6）与主动按钮的 server action（Task 4）→ ArchetypePicker（Task 5）→ 两 surface 接线（Task 7）依次消费它。每任务 1 commit、独立可 revert、TDD。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Vitest, @testing-library/react。

## 全局约束

- **TDD 强约束**：每个任务先写失败测试 → 实现 → 通过 → commit。
- **vitest cwd**：必须在 `frontend/` 下跑（`@/` 映射；repo root 跑会假失败，参 [[feedback_vitest-pitfalls]]）。
- **tsc 双验**：vitest 不做类型检查，每个任务末尾跑 `cd frontend && npx tsc --noEmit` 零新增错误。
- **失败集合对比**：用 base/head 失败集合对比（参 [[feedback_change-gate-baseline]]），不许新增无关失败；已知 [025] PG 集成 flake 视为 pre-existing。
- **中文注释**：所有注释简体中文；新建 TS 文件必须有 `/** @file ... @brief ... */` 文件头。
- **manifest 不增 surface**：本任务不新增/重命名 action（仅改 description 文案），**不触发 C-1 四联审计**。
- **无 DB 迁移 / 无 USOM schema 变更**：archetype FK 既有，不动 schema。
- **commit 前缀**：`fix(023.11): ...`（Part 1）/ `feat(023.11): ...`（Part 2）。
- **不在范围（defer 硬边界）**：editTimeboxes 被动推断、archetype 表加 keywords 字段、editTimeboxes TOCTOU / batch failure UI / MVP_USER_ID 硬码 —— 全 defer。
- **置信度常量**：`RULE_CONFIDENCE = 0.9`（规则命中直接接受）、`LLM_THRESHOLD = 0.7`（LLM 兜底接受门槛）。

---

## 文件结构总览

| 类型 | 路径 | 职责 | 任务 |
|---|---|---|---|
| 修改 | `frontend/src/domains/timebox/manifest.yaml` | editTimeboxes description 改名 | T1 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx` | 删重复标题（T1）+ 加 useEffect 回填（T2）+ 接 ArchetypePicker props（T7） | T1/T2/T7 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx` | 更新 case 2/7 断言（T1）+ 加回填回归（T2）+ 接线断言（T7） | T1/T2/T7 |
| **新建** | `frontend/src/domains/timebox/lib/archetype-matcher.ts` | 共享匹配原语（规则优先 + LLM 兜底） | T3 |
| **新建** | `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts` | matcher 单测 | T3 |
| 修改 | `frontend/src/app/actions/activity-archetype.ts` | 新增 `matchArchetypeForTitle` server action | T4 |
| **新建** | `frontend/src/app/actions/__tests__/activity-archetype.test.ts` | action 单测 | T4 |
| 修改 | `frontend/src/components/archetype/archetype-picker.tsx` | 加 enableAiMatch/title props + 「AI 匹配」按钮 | T5 |
| 修改 | `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx` | 按钮渲染/命中/未命中用例 | T5 |
| 修改 | `frontend/src/app/actions/intent.ts` | `parseTimeboxBatchIntentOnly` 调 matcher 填 archetypeId | T6 |
| 修改 | `frontend/src/app/actions/__tests__/intent.test.ts` | drafts 带 archetypeId 用例 | T6 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx` | ArchetypePicker 传 enableAiMatch/title | T7 |
| 修改 | `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx` | 接线断言 | T7 |

---

## Task 1: editTimeboxes selecting 模式 UX（manifest 改名 + 双重标题去重）

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（editTimeboxes action description）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx:125`（删重复标题）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`（case 2 & case 7 断言更新）

**Interfaces:**
- Consumes: 无（独立 UX 修复）
- Produces: editTimeboxes selecting 模式不再出现两次「请选择要操作的时间盒」（外层 header 由 CnuiSurfaceWrapper 渲染，组件内不再重复）

**背景**：`EditTimeboxes.tsx:125` 硬编码 `<div>...请选择要操作的时间盒</div>`，与 `handlers.ts:329` 返回的 `content`（经 CnuiSurfaceWrapper 渲染为 header）重复。注意：测试文件里 `<EditTimeboxes>` 直接渲染（无 wrapper），所以 case 2/case 7 当前断言的正是这行组件内文本——删除后必须同步改这两处断言。

- [ ] **Step 1: 更新 case 2 & case 7 断言（先改测试，使其反映"去重后"的期望）**

打开 `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`。

**case 2（约 104-109 行）**：把对重复标题的断言改为断言列表项出现。原代码：

```tsx
  it('case 2: selecting items>0 → 列表渲染 + 点击 item 进 editing', () => {
    render(<EditTimeboxes {...makeProps({ items: [tb('tb1', 'planned'), tb('tb2', 'running')] })} />)
    expect(screen.getByText('请选择要操作的时间盒')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ttb1').closest('button')!)
    expect(screen.getByText(/编辑时间盒/)).toBeInTheDocument()
  })
```

改为（去掉重复标题断言，改为断言列表项可见）：

```tsx
  it('case 2: selecting items>0 → 列表渲染 + 点击 item 进 editing', () => {
    render(<EditTimeboxes {...makeProps({ items: [tb('tb1', 'planned'), tb('tb2', 'running')] })} />)
    // [023.11] 组件内不再重复渲染「请选择要操作的时间盒」（外层 header 由 wrapper 出）
    expect(screen.queryByText('请选择要操作的时间盒')).not.toBeInTheDocument()
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ttb1').closest('button')!)
    expect(screen.getByText(/编辑时间盒/)).toBeInTheDocument()
  })
```

**case 7（约 170-180 行）**：点「返回列表」后，改为断言回到 selecting（列表项重新出现 + 「返回列表」按钮消失）。原代码：

```tsx
    fireEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText('请选择要操作的时间盒')).toBeInTheDocument()
```

改为：

```tsx
    fireEvent.click(screen.getByText('返回列表'))
    // [023.11] 回到 selecting：列表项重新可见，「返回列表」按钮消失
    expect(screen.getByText('Ttb1')).toBeInTheDocument()
    expect(screen.queryByText('返回列表')).not.toBeInTheDocument()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: case 2 失败（`queryByText('请选择要操作的时间盒')` 仍存在 → `not.toBeInTheDocument()` 不成立），证明现场命中。

- [ ] **Step 3: 删除 EditTimeboxes.tsx:125 的重复标题**

打开 `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`，删除第 125 行：

```tsx
        <div className="mb-2"><span className="text-sm font-medium text-ink">请选择要操作的时间盒</span></div>
```

（保留上方 102-123 的 `originalPrompt` echo 块；保留 `items.length === 0` 空态分支）。

- [ ] **Step 4: 改 manifest description**

打开 `frontend/src/domains/timebox/manifest.yaml`，把 editTimeboxes 的 description：

```yaml
  description: 修改/取消/删除当日时间盒（CNUI 三合一入口）
```

改为：

```yaml
  description: 修改/删除时间盒
```

（`keywords` / `shortcut` / `examples` / `cnui_surface` 不动。）

- [ ] **Step 5: 跑测试 + manifest validator + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: PASS（全部用例）。

Run: `cd frontend && npm run validate:manifest`（或仓库根 `npm run validate:manifest`，按既有脚本位置）
Expected: `0 errors`（确认 description 文案无 validator 约束）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/manifest.yaml \
  frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "fix(023.11): editTimeboxes manifest 改名 + 双重标题去重

- manifest description: 修改/取消/删除当日时间盒（CNUI 三合一入口）→ 修改/删除时间盒
- 删 EditTimeboxes.tsx 组件内重复的「请选择要操作的时间盒」（外层 header 已渲染）
- 同步更新 case 2/case 7 断言

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: editTimeboxes 编辑页空白修复（useEffect 同步 prefill → draft）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`（80-89 行 draft useState 旁加 useEffect）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`（新增回归用例）

**Interfaces:**
- Consumes: 无
- Produces: selecting→editing 切换选中记录时，表单字段带入该记录原值

**背景**：`draft` useState（80-89）只在首次挂载读 `prefill`；点选记录的 `onClick`（131-148）走 `onDataChange` 更新了 `dataModel.prefill`，但 draft 不会重读 → 编辑页空白。注意：既有 case 3-7 都直接以 `mode:'editing'+selectedId+prefill` 渲染，useState 初始化就带了值，所以**不覆盖 bug**——必须新增"先 selecting 再点选"的回归用例。依赖项用 `dataModel.selectedId`（不是 prefill 引用）以避免用户编辑时 draft 被重置打断。

- [ ] **Step 1: 写失败测试 — selecting 点选记录后 editing 表单带入原值**

**关键**：必须用 **stateful 父组件** 模拟真实 `CnuiSurfaceWrapper` 的回环——onClick 走 `onDataChange` 把新 dataModel（含 `selectedId`/`prefill`）回灌给 props，`dataModel.selectedId` 才会变化、useEffect 才会触发。`makeProps` 的 `onDataChange: vi.fn()` 不回灌 → useEffect 不触发 → 测不到 bug。故本组用例改用专用 `Harness`（而非 `makeProps`）。

先在 `edit-timeboxes.test.tsx` 顶部 import 区加 React `useState`：

```tsx
import { useState } from 'react'
```

在文件末尾（外层 `describe` 内）追加：

```tsx
  /** [023.11] stateful Harness：onDataChange 回灌 dataModel，模拟 CnuiSurfaceWrapper 回环 */
  function Harness({ items }: { items: TimeboxSummary[] }) {
    const [dm, setDm] = useState<Record<string, unknown>>({
      mode: 'selecting',
      items,
    })
    return (
      <EditTimeboxes
        surfaceType="edit-timeboxes"
        dataModel={dm}
        onDataChange={setDm}
        onConfirm={vi.fn()}
      />
    )
  }

  it('[023.11] selecting 点击记录 → editing 表单带入该记录原值（regression 空白页 bug）', () => {
    // 必须先失败：当前 draft useState 只在挂载读一次 prefill；
    // 点选记录后 onDataChange 回灌 dataModel.prefill + selectedId 变化，
    // 但无 useEffect 同步 → draft 仍空 → 标题输入框为空
    render(<Harness items={[tb('tb1', 'planned', '晨间深度工作')]} />)
    fireEvent.click(screen.getByText('晨间深度工作').closest('button')!)
    const titleInput = screen.getByLabelText('标题') as HTMLInputElement
    expect(titleInput.value).toBe('晨间深度工作')
  })

  it('[023.11] 返回列表选另一条 → editing 表单刷新为新选中记录 title', () => {
    render(<Harness items={[tb('tb1', 'planned', '第一条'), tb('tb2', 'planned', '第二条')]} />)
    // 选第一条
    fireEvent.click(screen.getByText('第一条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第一条')
    // 返回再选第二条
    fireEvent.click(screen.getByText('返回列表'))
    fireEvent.click(screen.getByText('第二条').closest('button')!)
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('第二条')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: 两个新用例 FAIL（`titleInput.value` 为 `''`）。

- [ ] **Step 3: 加 useEffect 同步 prefill → draft**

在 `EditTimeboxes.tsx` 的 draft useState 之后（约 89 行后，`const [confirmOpen...` 之前）插入：

```tsx
  // [023.11] 修复编辑页空白：选中记录切换时把 prefill 同步进 draft。
  //   原仅 useState 初值读取 → selecting 点选记录后 onDataChange 更新了 dataModel.prefill，
  //   但 draft 不会重读 → 表单空白。依赖 dataModel.selectedId（不是 prefill 引用），
  //   仅在切换选中记录时重置；用户编辑 draft 期间 selectedId 不变，不会被覆盖。
  useEffect(() => {
    setDraft({
      title: prefill.title ?? '',
      startTime: prefill.startTime ?? '',
      endTime: prefill.endTime ?? '',
      activityArchetypeId: prefill.activityArchetypeId,
      notes: prefill.notes ?? '',
      tags: prefill.tags ?? [],
      taskIds: prefill.taskIds ?? [],
      habitIds: prefill.habitIds ?? [],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataModel.selectedId])
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: 全部 PASS（含新回归用例 + 既有 case 1-7 + fold-in A1-A4，证明直接 editing 渲染路径无回归）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "fix(023.11): editTimeboxes 编辑页空白修复 — useEffect 同步 prefill→draft

selecting 点选记录切换 selectedId 时重置 draft（原仅 useState 初值读取 → 空白）
+ 2 回归用例（点选带入原值 / 返回选另一条刷新）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: archetype-matcher 共享原语（规则优先 + LLM 兜底）

**Files:**
- Create: `frontend/src/domains/timebox/lib/archetype-matcher.ts`
- Test: `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`

**Interfaces:**
- Consumes: `AIRuntime`（`@/nexus/ai-runtime`，调用方注入）、`ActivityArchetype`（`@/usom/activity-archetype/types`）
- Produces:
  - `matchArchetypesForTitles(titles: string[], archetypes: ActivityArchetype[], aiRuntime: AIRuntime): Promise<(ArchetypeMatch | null)[]>` —— 与 titles 同长同序
  - `ArchetypeMatch = { archetypeId: string; confidence: number; source: 'rule' | 'llm' }`
  - 常量 `RULE_CONFIDENCE = 0.9`、`LLM_THRESHOLD = 0.7`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`：

```ts
/**
 * @file archetype-matcher.test
 * @brief [023.11] 活动原型匹配原语单测（规则优先 + LLM 兜底）
 */
import { describe, it, expect, vi } from 'vitest'
import {
  matchArchetypesForTitles,
  RULE_CONFIDENCE,
  LLM_THRESHOLD,
} from '../archetype-matcher'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
import type { AIRuntime } from '@/nexus/ai-runtime'

/** 构造 archetype fixture（最小字段） */
function arch(id: string, l2Name: string): ActivityArchetype {
  return {
    id,
    l2Name,
    l1Category: '工作' as never,
    energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
    activityLabel: {
      enjoyment: 5,
      typicalDuration: 60,
      interruptTolerance: 'medium',
      environment: [],
      location: [],
      parallelizable: false,
    },
    isSystem: false,
    userId: 'u',
    createdAt: '',
    updatedAt: '',
  } as ActivityArchetype
}

/** 构造 mock AIRuntime，generate 返回给定 content */
function mockRuntime(content: string): AIRuntime {
  return { generate: vi.fn().mockResolvedValue({ content }) } as unknown as AIRuntime
}

describe('[023.11] archetype-matcher', () => {
  it('常量门槛正确', () => {
    expect(RULE_CONFIDENCE).toBe(0.9)
    expect(LLM_THRESHOLD).toBe(0.7)
  })

  it('规则精确命中（title === l2Name）→ source=rule, confidence=RULE_CONFIDENCE', async () => {
    const runtime = mockRuntime('unused')
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '深度专注')], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: RULE_CONFIDENCE, source: 'rule' })
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('规则子串命中（title includes l2Name）→ rule', async () => {
    const [r] = await matchArchetypesForTitles(
      ['下午深度专注写作'],
      [arch('a1', '深度专注')],
      mockRuntime('x'),
    )
    expect(r?.archetypeId).toBe('a1')
    expect(r?.source).toBe('rule')
  })

  it('规则反向包含（l2Name includes title, len≥2）→ rule', async () => {
    const [r] = await matchArchetypesForTitles(
      ['有氧'],
      [arch('a1', '有氧运动')],
      mockRuntime('x'),
    )
    expect(r?.archetypeId).toBe('a1')
    expect(r?.source).toBe('rule')
  })

  it('多 archetype 命中 → 取最长 l2Name（最具体）', async () => {
    const [r] = await matchArchetypesForTitles(
      ['深度专注'],
      [arch('a1', '专注'), arch('a2', '深度专注')],
      mockRuntime('x'),
    )
    expect(r?.archetypeId).toBe('a2')
  })

  it('规则未命中 → LLM 兜底命中（≥门槛）→ source=llm', async () => {
    const runtime = mockRuntime(
      JSON.stringify({ results: [{ title: '写代码', archetypeId: 'a1', confidence: 0.8 }] }),
    )
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: 0.8, source: 'llm' })
  })

  it('LLM confidence < 门槛 → null', async () => {
    const runtime = mockRuntime(
      JSON.stringify({ results: [{ title: '吃饭', archetypeId: 'a1', confidence: 0.4 }] }),
    )
    const [r] = await matchArchetypesForTitles(['吃饭'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 返回不存在 id → null（防幻觉）', async () => {
    const runtime = mockRuntime(
      JSON.stringify({ results: [{ title: '写代码', archetypeId: 'ghost', confidence: 0.9 }] }),
    )
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 返回畸形 JSON → null（不抛）', async () => {
    const runtime = mockRuntime('not a json')
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('空标题 → null', async () => {
    const [r] = await matchArchetypesForTitles([''], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r).toBeNull()
  })

  it('空 archetypes → 全 null 且不发 LLM', async () => {
    const runtime = mockRuntime('x')
    const res = await matchArchetypesForTitles(['写代码'], [], runtime)
    expect(res).toEqual([null])
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('batch 混合：部分规则部分 LLM → 单次 LLM 调用', async () => {
    const runtime = mockRuntime(
      JSON.stringify({ results: [{ title: '跑步', archetypeId: 'a2', confidence: 0.85 }] }),
    )
    const res = await matchArchetypesForTitles(
      ['深度专注写作', '跑步'],
      [arch('a1', '深度专注'), arch('a2', '有氧运动')],
      runtime,
    )
    expect(res[0]).toMatchObject({ archetypeId: 'a1', source: 'rule' })
    expect(res[1]).toMatchObject({ archetypeId: 'a2', source: 'llm' })
    expect(runtime.generate).toHaveBeenCalledTimes(1)
  })

  it('时间词被剥：标题含 HH:MM/点/时段词仍能规则命中', async () => {
    const [r] = await matchArchetypesForTitles(
      ['下午14:00 深度专注'],
      [arch('a1', '深度专注')],
      mockRuntime('x'),
    )
    expect(r?.source).toBe('rule')
    expect(r?.archetypeId).toBe('a1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`
Expected: FAIL（模块不存在 / 导出未定义）。

- [ ] **Step 3: 实现 archetype-matcher.ts**

创建 `frontend/src/domains/timebox/lib/archetype-matcher.ts`：

```ts
/**
 * @file archetype-matcher
 * @brief [023.11] 活动原型匹配原语（规则优先 + LLM 兜底）
 *
 * 给定一批标题 + 用户 archetype 目录 + AIRuntime，逐条返回最佳匹配（或 null）。
 * 纯函数 —— DB 查询与 aiRuntime 由调用方注入（守 R-01 Repository 边界，便于单测 mock）。
 *
 * 策略：
 * 1) 规则轮（本地、零成本）：标题归一化后判 l2Name 双向子串包含；命中取最长 l2Name。
 * 2) LLM 兜底轮（仅对规则未命中的非空标题，批量一次调用）：注入 archetype 目录，
 *    要求逐条返回 {archetypeId, confidence} 或 null；confidence ≥ LLM_THRESHOLD 且 id 在目录内才接受。
 *
 * 边界：空标题 / 空目录 → null（不发 LLM）。
 */
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

export interface ArchetypeMatch {
  archetypeId: string
  confidence: number
  source: 'rule' | 'llm'
}

/** 规则命中直接接受的置信度（l2Name 子串包含，几乎不会错） */
export const RULE_CONFIDENCE = 0.9
/** LLM 兜底的接受门槛（误匹配代价 > 留空） */
export const LLM_THRESHOLD = 0.7

/** 标题归一化：trim + lowercase + 剥时间词（HH:MM / X点 / 时段词） */
function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\d{1,2}\s*[：:]\s*\d{1,2}/g, '') // HH:MM
    .replace(/\d{1,2}\s*点(半)?/g, '') // X点 / X点半
    .replace(/(上午|下午|早上|晚上|凌晨|中午)/g, '') // 时段词
    .replace(/\s+/g, ' ')
    .trim()
}

/** 规则轮：单标题在 archetype 目录里找最长 l2Name 子串命中 */
function ruleMatch(title: string, archetypes: ActivityArchetype[]): ArchetypeMatch | null {
  const norm = normalizeTitle(title)
  if (!norm) return null
  const candidates = archetypes
    .map((a) => {
      const l2 = (a.l2Name ?? '').trim().toLowerCase()
      if (!l2) return null
      const hit = norm.includes(l2) || (norm.length >= 2 && l2.includes(norm))
      return hit ? { a, score: l2.length } : null
    })
    .filter((x): x is { a: ActivityArchetype; score: number } => x !== null)
  if (candidates.length === 0) return null
  candidates.sort((x, y) => y.score - x.score) // 最长 l2Name 最具体
  return { archetypeId: candidates[0].a.id, confidence: RULE_CONFIDENCE, source: 'rule' }
}

/** 宽松 JSON 解析：兼容 LLM 可能的 ```json 代码栅栏 */
function parseLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  return JSON.parse(body.trim())
}

/** LLM 兜底轮：批量未命中标题一次调用 */
async function llmMatch(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  const catalog = archetypes.map((a) => ({
    id: a.id,
    l2Name: a.l2Name,
    l1Category: a.l1Category,
    environment: a.activityLabel?.environment ?? [],
    location: a.activityLabel?.location ?? [],
  }))
  const systemPrompt = [
    '你是活动原型分类器。依据用户给出的活动标题，从该用户已有的活动原型目录里选最匹配的一项。',
    '规则：',
    '- 只能从目录已有的 id 里选，禁止编造 id。',
    '- 返回每条标题对应的 { archetypeId, confidence(0-1) }；目录中无合适项时 confidence 须低于 0.7 或 archetypeId 给 null。',
    '- confidence 反映语义匹配确信度；标题与原型语义无关时给低分。',
    '- 输出严格 JSON：{ "results": [{ "title": "<原样回传>", "archetypeId": "<id 或 null>", "confidence": <0-1> }] }',
  ].join('\n')
  const userPrompt = JSON.stringify({ archetypes: catalog, titles })

  const resp = await aiRuntime.generate({
    domainId: 'timebox',
    action: 'matchArchetype',
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    taskType: 'field_extraction',
    temperature: 0,
  })
  const content = resp.content
  const jsonStr = typeof content === 'string' ? content : JSON.stringify(content)
  let parsed: { results?: Array<{ title: string; archetypeId: string | null; confidence: number } | null> }
  try {
    parsed = parseLoose(jsonStr) as typeof parsed
  } catch {
    return titles.map(() => null)
  }
  const validIds = new Set(archetypes.map((a) => a.id))
  return titles.map((t) => {
    const hit = (parsed.results ?? []).find((r) => r && r.title === t)
    if (!hit || !hit.archetypeId) return null
    if (!validIds.has(hit.archetypeId)) return null // 防幻觉
    if (typeof hit.confidence !== 'number' || hit.confidence < LLM_THRESHOLD) return null
    return { archetypeId: hit.archetypeId, confidence: hit.confidence, source: 'llm' }
  })
}

/**
 * 批量匹配：titles[i] → ArchetypeMatch | null（与 titles 同长同序）
 *
 * 规则全命中则零 LLM 调用；未命中的非空标题批量一次 LLM 兜底。
 */
export async function matchArchetypesForTitles(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  if (archetypes.length === 0) return titles.map(() => null) // 空目录不发 LLM

  const results: (ArchetypeMatch | null)[] = titles.map((t) =>
    t && t.trim() ? ruleMatch(t, archetypes) : null,
  )

  // 收集规则未命中的非空标题，批量 LLM 兜底
  const missIdx = titles
    .map((t, i) => ({ t, i }))
    .filter((x) => !results[x.i] && x.t && x.t.trim())
  if (missIdx.length === 0) return results

  const llmHits = await llmMatch(
    missIdx.map((x) => x.t),
    archetypes,
    aiRuntime,
  )
  missIdx.forEach((x, k) => {
    results[x.i] = llmHits[k]
  })
  return results
}
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/archetype-matcher.test.ts`
Expected: 全部 PASS（13 用例）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/lib/archetype-matcher.ts \
  frontend/src/domains/timebox/lib/__tests__/archetype-matcher.test.ts
git commit -m "feat(023.11): archetype-matcher 共享原语（规则优先 + LLM 兜底）

规则轮 l2Name 双向子串命中(0.9) / LLM 批量兜底(≥0.7,防幻觉) / 空目录不发 LLM
+ 13 单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: matchArchetypeForTitle server action（主动按钮后端）

**Files:**
- Modify: `frontend/src/app/actions/activity-archetype.ts`（新增 matchArchetypeForTitle）
- Create: `frontend/src/app/actions/__tests__/activity-archetype.test.ts`

**Interfaces:**
- Consumes: `matchArchetypesForTitles`（Task 3）、`ActivityArchetypeRepository.findByUser`、`createAIRuntime`
- Produces: `matchArchetypeForTitle(title: string): Promise<{ matched: boolean; archetypeId?: string }>`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/actions/__tests__/activity-archetype.test.ts`：

```ts
/**
 * @file activity-archetype.test
 * @brief [023.11] matchArchetypeForTitle server action 单测
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/nexus/ai-runtime', () => ({ createAIRuntime: vi.fn(() => ({})) }))

vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: vi.fn(),
}))

vi.mock('@/domains/timebox/lib/archetype-matcher', () => ({
  matchArchetypesForTitles: vi.fn(),
}))

import { matchArchetypeForTitle } from '../activity-archetype'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import { matchArchetypesForTitles } from '@/domains/timebox/lib/archetype-matcher'

const MockedRepo = vi.mocked(ActivityArchetypeRepository)
const mockMatch = vi.mocked(matchArchetypesForTitles)

beforeEach(() => {
  vi.clearAllMocks()
  MockedRepo.mockImplementation(function () {
    return { findByUser: vi.fn().mockResolvedValue([{ id: 'a1' }]) } as unknown as InstanceType<
      typeof ActivityArchetypeRepository
    >
  })
})

describe('[023.11] matchArchetypeForTitle', () => {
  it('matcher 命中 → { matched: true, archetypeId }', async () => {
    mockMatch.mockResolvedValueOnce([{ archetypeId: 'a1', confidence: 0.9, source: 'rule' }])
    const r = await matchArchetypeForTitle('深度专注')
    expect(r).toEqual({ matched: true, archetypeId: 'a1' })
  })

  it('matcher 未命中 → { matched: false }', async () => {
    mockMatch.mockResolvedValueOnce([null])
    const r = await matchArchetypeForTitle('未知活动')
    expect(r).toEqual({ matched: false })
  })

  it('空 title → { matched: false } 且不查 DB / 不调 matcher', async () => {
    const r = await matchArchetypeForTitle('   ')
    expect(r).toEqual({ matched: false })
    expect(mockMatch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/activity-archetype.test.ts`
Expected: FAIL（`matchArchetypeForTitle` 未导出）。

- [ ] **Step 3: 实现 server action**

在 `frontend/src/app/actions/activity-archetype.ts` 顶部 import 区追加（若已 import 则跳过）：

```ts
import { createAIRuntime } from "@/nexus/ai-runtime";
import { matchArchetypesForTitles } from "@/domains/timebox/lib/archetype-matcher";
```

在文件末尾（`seedArchetypes` 之后）追加：

```ts
// ─── AI 匹配（[023.11] 主动按钮）─────────────────────────────────

/** [023.11] 单标题 AI 匹配结果（命中/未命中） */
export interface ArchetypeMatchResult {
  /** 是否命中（规则 0.9 或 LLM≥0.7） */
  matched: boolean;
  /** 命中的 archetypeId（matched=true 时有值） */
  archetypeId?: string;
}

/**
 * [023.11] 单标题 AI 匹配（规则优先 + LLM 兜底）。
 *
 * 供 CNUI 表单 ArchetypePicker 的「AI 匹配」按钮调用：
 * - 空 title → 直接 { matched: false }（不查 DB）
 * - 命中 → { matched: true, archetypeId }
 * - 未命中（规则+LLM 均不足门槛）→ { matched: false }
 *
 * 多租户 T-02：MVP_USER_ID 透传（与 getArchetypes 一致）。
 *
 * @param title - 当前标题（来自 CNUI 表单）
 */
export async function matchArchetypeForTitle(title: string): Promise<ArchetypeMatchResult> {
  if (!title || !title.trim()) return { matched: false };
  try {
    const repo = new ActivityArchetypeRepository();
    const archetypes = await repo.findByUser(MVP_USER_ID);
    if (archetypes.length === 0) return { matched: false };
    const aiRuntime = createAIRuntime();
    const [hit] = await matchArchetypesForTitles([title.trim()], archetypes, aiRuntime);
    if (!hit) return { matched: false };
    return { matched: true, archetypeId: hit.archetypeId };
  } catch (err) {
    return { matched: false };
  }
}
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/activity-archetype.test.ts`
Expected: 全部 PASS。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误（`'use server'` 文件只 export async function —— `ArchetypeMatchResult` 是 interface，允许；参既有 `ArchetypeActionResult` interface 先例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/actions/activity-archetype.ts \
  frontend/src/app/actions/__tests__/activity-archetype.test.ts
git commit -m "feat(023.11): matchArchetypeForTitle server action（AI 匹配按钮后端）

空 title 短路 / repo+matcher+runtime 组装 / 返 {matched, archetypeId?}
+ 3 单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: ArchetypePicker「AI 匹配」按钮（共享组件 opt-in）

**Files:**
- Modify: `frontend/src/components/archetype/archetype-picker.tsx`
- Modify: `frontend/src/components/archetype/__tests__/archetype-picker.test.tsx`

**Interfaces:**
- Consumes: `matchArchetypeForTitle`（Task 4）
- Produces: ArchetypePicker 新增 opt-in props `enableAiMatch?: boolean` / `title?: string`，启用时渲染「AI 匹配」按钮

- [ ] **Step 1: 写失败测试**

在 `archetype-picker.test.tsx` 顶部 mock 块，把 `matchArchetypeForTitle` 加进 mock：

```tsx
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn(),
  matchArchetypeForTitle: vi.fn(),
}))
```

并把 import 行改为：

```tsx
import { getArchetypes, matchArchetypeForTitle } from '@/app/actions/activity-archetype'
```

在 `const mockGetArchetypes = vi.mocked(getArchetypes)` 下加：

```tsx
const mockMatchArchetype = vi.mocked(matchArchetypeForTitle)
```

在 `beforeEach` 里加 `mockMatchArchetype.mockReset()`。

在文件末尾追加新 describe：

```tsx
describe('[023.11] ArchetypePicker「AI 匹配」按钮', () => {
  it('enableAiMatch + title + 可写 → 渲染「AI 匹配」按钮', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="写代码" />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })

  it('无 title → 不渲染「AI 匹配」', async () => {
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="" />)
    await screen.findByText('选择')
    expect(screen.queryByText('AI 匹配')).not.toBeInTheDocument()
  })

  it('readOnly → 不渲染「AI 匹配」', async () => {
    render(<ArchetypePicker value="a1" readOnly onChange={() => {}} enableAiMatch title="写代码" />)
    await screen.findByText('深度专注')
    expect(screen.queryByText('AI 匹配')).not.toBeInTheDocument()
  })

  it('点击命中 → onChange(archetypeId)', async () => {
    mockMatchArchetype.mockResolvedValueOnce({ matched: true, archetypeId: 'a1' })
    const onChange = vi.fn()
    render(<ArchetypePicker value={undefined} onChange={onChange} enableAiMatch title="写代码" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('a1'))
  })

  it('点击未命中 → 显示「未找匹配的活动原型」', async () => {
    mockMatchArchetype.mockResolvedValueOnce({ matched: false })
    render(<ArchetypePicker value={undefined} onChange={() => {}} enableAiMatch title="未知活动" />)
    fireEvent.click(await screen.findByText('AI 匹配'))
    expect(await screen.findByText('未找匹配的活动原型')).toBeInTheDocument()
  })
})
```

（`waitFor` 已在文件顶部 import，参第 6 行。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx`
Expected: 新用例 FAIL（按钮未渲染 / `matchArchetypeForTitle` 未定义）。

- [ ] **Step 3: 实现 picker 改造**

打开 `archetype-picker.tsx`。

(a) import 加 `matchArchetypeForTitle`：

```tsx
import { getArchetypes, matchArchetypeForTitle } from '@/app/actions/activity-archetype'
```

(b) `useEffect, useMemo, useState` 的 import 改为含 `useEffect`（已有则跳过）；当前第 12 行是 `import { useState, useEffect, useMemo } from 'react'` —— 已含。

(c) Props 接口加两个 opt-in 字段：

```tsx
interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更（readOnly 时可不传） */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
  /** 只读模式：隐藏按钮与下拉，仅展示选中态 */
  readOnly?: boolean
  /** [023.11] 启用「AI 匹配」按钮（CNUI 表单传 true；详情只读页不传） */
  enableAiMatch?: boolean
  /** [023.11] 当前标题（AI 匹配依据；enableAiMatch=true 时必传） */
  title?: string
}
```

(d) 解构签名加新参数：

```tsx
export function ArchetypePicker({ value, onChange, readOnly = false, enableAiMatch, title }: ArchetypePickerProps) {
```

(e) 在 `const [retryNonce, setRetryNonce] = useState(0)` 之后加 AI 匹配状态：

```tsx
  // [023.11] AI 匹配按钮状态
  const [aiMatching, setAiMatching] = useState(false)
  const [aiError, setAiError] = useState(false)

  // [023.11] title 变化时清除未匹配提示
  useEffect(() => {
    setAiError(false)
  }, [title])

  /** [023.11] 触发 AI 匹配：命中回填，未命中显示提示 */
  const runAiMatch = async () => {
    const t = (title ?? '').trim()
    if (!t) return
    setAiMatching(true)
    setAiError(false)
    try {
      const r = await matchArchetypeForTitle(t)
      if (r.matched && r.archetypeId) {
        onChange?.(r.archetypeId)
      } else {
        setAiError(true)
      }
    } catch {
      setAiError(true)
    } finally {
      setAiMatching(false)
    }
  }

  /** [023.11] AI 匹配按钮（仅在 enableAiMatch + 有 title + 非只读时渲染） */
  const showAiMatch = enableAiMatch && !readOnly && !!title?.trim()
  const aiMatchBtn = showAiMatch ? (
    <button
      type="button"
      onClick={runAiMatch}
      disabled={aiMatching}
      aria-label="AI 匹配活动原型"
      className="shrink-0 text-xs text-primary disabled:opacity-50"
    >
      {aiMatching ? '匹配中…' : 'AI 匹配'}
    </button>
  ) : null
```

(f) 把 `aiMatchBtn` 放进两个分支的按钮区，并在组件底部显示 `aiError`：

- 在 `selected` 分支的 `{!readOnly && (...「更换」按钮...)}` 旁加 `{aiMatchBtn}`（与「更换」并列）。即把：

```tsx
          {!readOnly && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              ...
            >
              更换
            </button>
          )}
```

改为：

```tsx
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-label="更换活动原型"
                className="text-xs text-primary"
              >
                更换
              </button>
              {aiMatchBtn}
            </div>
          )}
```

- 在 `!selected` 分支的 `{!readOnly && (...「选择」按钮...)}` 同样包一层加 `{aiMatchBtn}`：

```tsx
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-label="选择活动原型"
                className="text-xs text-primary"
              >
                选择
              </button>
              {aiMatchBtn}
            </div>
          )}
```

- 在组件最外层 `<div>` 内、最末尾（`</div>` 闭合前）加未匹配提示：

```tsx
      {aiError && (
        <p className="mt-1 text-xs text-error">未找匹配的活动原型</p>
      )}
```

（放在 `{!readOnly && pickerOpen && (...)}` 块之后、`</div>` 之前。）

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd frontend && npx vitest run src/components/archetype/__tests__/archetype-picker.test.tsx`
Expected: 全部 PASS（新 5 用例 + 既有 A3.2 用例无回归）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/archetype/archetype-picker.tsx \
  frontend/src/components/archetype/__tests__/archetype-picker.test.tsx
git commit -m "feat(023.11): ArchetypePicker 加「AI 匹配」按钮（opt-in）

enableAiMatch/title props / 命中回填 onChange / 未匹配显提示 / readOnly 不显
+ 5 单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: createTimebox 被动推断（parseTimeboxBatchIntentOnly 调 matcher）

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`（`parseTimeboxBatchIntentOnly`，约 1218-1249 行）
- Modify: `frontend/src/app/actions/__tests__/intent.test.ts`

**Interfaces:**
- Consumes: `matchArchetypesForTitles`（Task 3）、`ActivityArchetypeRepository.findByUser`、既有 `parseMultiTask` + `createAIRuntime`
- Produces: `TimeboxBatchParseResult.drafts[i]` 增可选字段 `activityArchetypeId?: string`（命中填入）

**背景**：drafts 单一收口在 `parseTimeboxBatchIntentOnly`（1234-1242 map）。共享层 `parseMultiTask` 保持 generic 不动。archetype 推断失败必须 degrade gracefully（不阻断创建）。

- [ ] **Step 1: 写失败测试**

在 `intent.test.ts` 顶部 mock 区追加（既有 mock 块之后）：

```ts
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: vi.fn().mockImplementation(() => ({
    findByUser: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('@/domains/timebox/lib/archetype-matcher', () => ({
  matchArchetypesForTitles: vi.fn(),
}))
```

在 import 区追加：

```ts
import { matchArchetypesForTitles } from '@/domains/timebox/lib/archetype-matcher'
const mockMatchArchetypes = vi.mocked(matchArchetypesForTitles)
```

在文件末尾追加新 describe：

```ts
describe('[023.11] parseTimeboxBatchIntentOnly 被动推断 archetype', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('matcher 命中 → drafts 带 activityArchetypeId', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1',
          intentionId: 't',
          targetDomain: 'timebox',
          action: 'create_timebox',
          fields: {
            title: '深度专注写作',
            startTime: '2026-07-06T14:00:00+08:00',
            duration: 60,
            endTime: '2026-07-06T15:00:00+08:00',
          },
          confidence: 0.9,
          resolvedBy: 'ai',
          createdAt: '',
        },
      ],
    })
    mockMatchArchetypes.mockResolvedValueOnce([
      { archetypeId: 'a1', confidence: 0.9, source: 'rule' },
    ])
    const r = await parseTimeboxBatchIntentOnly('下午深度专注写作')
    expect(r.success).toBe(true)
    expect(r.drafts![0].activityArchetypeId).toBe('a1')
  })

  it('matcher 未命中 → activityArchetypeId undefined', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1',
          intentionId: 't',
          targetDomain: 'timebox',
          action: 'create_timebox',
          fields: {
            title: '未知活动',
            startTime: '2026-07-06T14:00:00+08:00',
            duration: 60,
            endTime: '2026-07-06T15:00:00+08:00',
          },
          confidence: 0.9,
          resolvedBy: 'ai',
          createdAt: '',
        },
      ],
    })
    mockMatchArchetypes.mockResolvedValueOnce([null])
    const r = await parseTimeboxBatchIntentOnly('未知活动')
    expect(r.drafts![0].activityArchetypeId).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/intent.test.ts`
Expected: 新用例 FAIL（`activityArchetypeId` undefined —— 当前 drafts 不带该字段）。

- [ ] **Step 3: 实现 parseTimeboxBatchIntentOnly 改造**

在 `intent.ts` 顶部 import 区追加（若已有则跳过）：

```ts
import { ActivityArchetypeRepository } from "@/lib/db/repositories/activity-archetype.repository";
import { matchArchetypesForTitles } from "@/domains/timebox/lib/archetype-matcher";
```

把 `TimeboxBatchParseResult` 的 drafts 元素类型加可选字段（约 1218-1222 行）：

```ts
export interface TimeboxBatchParseResult {
  success: boolean
  drafts?: Array<{ title: string; startTime: string; endTime: string; duration?: number; activityArchetypeId?: string }>
  error?: string
}
```

把 `parseTimeboxBatchIntentOnly` 的 drafts 构造块（1234-1244 行）替换为：

```ts
    const drafts = parseResult.intents.map((intent) => {
      const f = intent.fields as Record<string, unknown>
      return {
        title: String(f.title ?? ''),
        startTime: String(f.startTime ?? ''),
        endTime: String(f.endTime ?? ''),
        duration: typeof f.duration === 'number' ? f.duration : undefined,
      }
    })

    // [023.11] 被动推断 archetype（仅 createTimebox 提取路径）。
    //   规则优先 + LLM 兜底（matchArchetypesForTitles）；字段为空才填
    //   （parseMultiTask 当前不产出 archetype，drafts 进入时恒空，天然满足"字段为空"前提）。
    //   推断失败必须 degrade gracefully，不阻断创建流程。
    try {
      const archetypes = await new ActivityArchetypeRepository().findByUser(MVP_USER_ID)
      if (archetypes.length > 0) {
        const matches = await matchArchetypesForTitles(
          drafts.map((d) => d.title),
          archetypes,
          aiRuntime,
        )
        drafts.forEach((d, i) => {
          if (!d.activityArchetypeId && matches[i]) {
            d.activityArchetypeId = matches[i]!.archetypeId
          }
        })
      }
    } catch {
      // archetype 推断失败不阻断创建（drafts 不带 archetypeId，用户可手选/用 AI 按钮）
    }

    return { success: true, drafts }
```

（保留外层 `try/catch` 与最末 `return { success: false, error: message }`。）

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/intent.test.ts`
Expected: 全部 PASS（含新 2 用例 + 既有 parseHabitIntentOnly / getActionResponse 用例无回归）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/actions/intent.ts \
  frontend/src/app/actions/__tests__/intent.test.ts
git commit -m "feat(023.11): createTimebox 被动推断 archetype

parseTimeboxBatchIntentOnly drafts 收口处调 matcher（字段为空才填，失败 degrade）
+ drafts 类型加 activityArchetypeId?
+ 2 单测

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 两个 CNUI surface 接线 ArchetypePicker（enableAiMatch / title）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx:110-114`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx:244-245`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`

**Interfaces:**
- Consumes: ArchetypePicker 的 `enableAiMatch` / `title` props（Task 5）
- Produces: CreateTimebox 与 EditTimeboxes 表单的 archetype 字段出现「AI 匹配」按钮

**背景**：两个 surface 已用 `<ArchetypePicker>`，只需补传两个 opt-in prop。测试只需断言按钮出现（证明 props 接通），不必点击（点击路径已由 Task 5 覆盖）。

- [ ] **Step 1: 写失败测试 — CreateTimebox 接线**

在 `create-timebox.test.tsx` 末尾追加 describe：

```tsx
describe('[023.11] CreateTimebox ArchetypePicker 接线 enableAiMatch', () => {
  it('title 非空时渲染「AI 匹配」按钮（证明 enableAiMatch/title 已接通）', async () => {
    render(
      <CreateTimebox
        surfaceType="createTimebox"
        dataModel={{ items: [makeDraft({ title: '下午写代码' })] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 写失败测试 — EditTimeboxes 接线**

在 `edit-timeboxes.test.tsx` 末尾追加：

```tsx
  it('[023.11] editing 模式 title 非空 → 渲染「AI 匹配」按钮（接线 enableAiMatch/title）', async () => {
    render(<EditTimeboxes {...makeProps({
      mode: 'editing',
      items: [tb('tb1', 'planned')],
      selectedId: 'tb1',
      prefill: { title: '写代码' },
      status: 'planned',
    })} />)
    expect(await screen.findByText('AI 匹配')).toBeInTheDocument()
  })
```

（`edit-timeboxes.test.tsx` 的 mock `vi.mock('@/app/actions/activity-archetype', () => ({ getArchetypes: vi.fn() }))` 不含 `matchArchetypeForTitle`，但本测试不点击按钮，不会调用，运行无碍。）

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: 两个新用例 FAIL（按钮未渲染 —— 当前未传 enableAiMatch）。

- [ ] **Step 4: CreateTimebox.tsx 接线**

打开 `CreateTimebox.tsx`，把 110-114 行的 ArchetypePicker：

```tsx
            <ArchetypePicker
              value={cur.activityArchetypeId}
              onChange={(id) => update({ activityArchetypeId: id })}
            />
```

改为：

```tsx
            <ArchetypePicker
              value={cur.activityArchetypeId}
              onChange={(id) => update({ activityArchetypeId: id })}
              enableAiMatch
              title={cur.title}
            />
```

- [ ] **Step 5: EditTimeboxes.tsx 接线**

打开 `EditTimeboxes.tsx`，把 244-245 行的 ArchetypePicker：

```tsx
            <ArchetypePicker value={draft.activityArchetypeId}
              onChange={id => update({ activityArchetypeId: id })} />
```

改为：

```tsx
            <ArchetypePicker value={draft.activityArchetypeId}
              onChange={id => update({ activityArchetypeId: id })}
              enableAiMatch
              title={draft.title} />
```

- [ ] **Step 6: 跑全量受影响测试 + tsc + 全局 vitest 基线对比**

Run: `cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`
Expected: 全部 PASS（新接线用例 + 既有用例无回归）。

Run: `cd frontend && npx tsc --noEmit`
Expected: 零新增错误。

Run（全量基线对比）: `cd frontend && npx vitest run`
Expected: 与本次工作开始时的失败集合对比，**零新增失败**（[025] PG 集成 flake 视为 pre-existing）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx \
  frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/create-timebox.test.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "feat(023.11): 两个 CNUI surface 接线 ArchetypePicker enableAiMatch/title

CreateTimebox + EditTimeboxes 的 archetype 字段启用「AI 匹配」按钮
+ 2 接线测试

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 收尾（全部 7 任务完成后）

- **`/browse` 视觉验证**（用户 opt-in，参 [[feedback_ui-verify-visual-not-functional]]）：
  - `/editTimeboxes` selecting 模式标题只出现一次；点选记录进 editing 表单带入原值（Part 1 三修复）。
  - `/createTimebox <带语义的标题>` drafts 自动带 archetype（被动推断）。
  - 两个表单 archetype 字段点「AI 匹配」命中回填 / 未命中显「未找匹配的活动原型」。
- **CHANGELOG**：本任务 runtime-only + UI 微调，按宪章 v2.1.1 默认不留条目（与 [023.06]/[023.07] 同模式）；若 team 惯例 [023.x] 系列留痕则补一条 `[023.11]`（OQ-3）。
- **finishing-a-development-branch** → `/review` → `/ship`（按 CLAUDE.md 普通任务流程）。

---

## 验收对照（spec → task）

| spec 验收项 | 任务 |
|---|---|
| F1 manifest description 改名 | T1 |
| F2 双重标题去重 | T1 |
| F3 编辑页回填（含返回选另一条） | T2 |
| F4 createTimebox 被动推断 | T6 |
| F5 主动按钮（两 surface） | T3+T4+T5+T7 |
| 质量：vitest 零新增 / tsc 零新增 / validate:manifest 0 errors / 无迁移无新 surface | 全任务 |
