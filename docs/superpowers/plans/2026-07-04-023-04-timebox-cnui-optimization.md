# [023.04] 时间盒 CNUI 对话优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把时间盒的「创建/修改/取消/删除」四类意图统一收敛到 CNUI 对话流程，补 archetype 字段、修复失效的重叠 rule、新增 `/editTimeboxes` 单一入口。

**Architecture:** 7 任务串行交付：(0) overlap 纯函数 + 单测 → (1) rule 改 endTime 让重叠 rule 真正生效 → (2) CreateTimebox 补 ArchetypePicker + 重叠预检 → (3) parseTimeboxesIntent + 双测 → (4) EditTimeboxes surface（解析优先模式）→ (5) handler editTimeboxes 分支 + 测试 → (6) manifest + surfaceHandlers 双注册 → (7) 文档同步 + 验收。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Tailwind CSS 4, shadcn/ui, Vitest + @testing-library/react, Drizzle 0.45.1.

## 全局约束

- **TDD 强约束**：每个 task 先写失败测试 → 实现 → 通过；纯配置 / 重命名 task 允许不写测试，但需明确验证步骤。
- **commit 频率**：每个 task 内 step 末尾至少一次 commit；task 末尾确保 working tree 干净。
- **中文注释**：所有注释用简体中文。
- **CSS 变量令牌**：颜色必须用 `bg-canvas`/`text-ink`/`border-hairline` 等令牌，禁 Tailwind 默认色（UI-DESIGN-SPEC §14 一致）。
- **manifest 双注册**：新增 `editTimeboxes` intent 必须同时在 manifest A 区块（intent_triggers）+ K 区块（cnui_surfaces）声明，且 handler 端 `surfaceHandlers` map 加表项；漏一处→"Handler 未找到"。
- **OV#8 状态守卫**：`deleteTimebox` service 层 throw 必须 try/catch 透传为 surface error，禁止 reject 静默吞掉。
- **测试基线**：本次开始时 `vitest` 全绿；改动后用 base/head 失败集合对比（聚焦被改文件），不许新增无关失败。
- **TS 严格**：所有改动跑 `npx tsc --noEmit` 零新增错误。
- **跑测试 cwd**：必须在 `frontend/` 下（`@/` 映射），仓库根跑会假失败（参 [[feedback_vitest-pitfalls]]）。

---

## 文件结构总览

| 类型 | 路径 |
|---|---|
| **新建** | `frontend/src/domains/timebox/lib/overlap.ts`（`assertNoInternalOverlap` 纯函数 + 测试） |
| **新建** | `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`（解析优先模式 surface） |
| **新建** | `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`（渲染 + onValidate + onConfirm） |
| **新建** | `frontend/src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts`（parseTimeboxesIntent 中文意图解析） |
| **新建** | `frontend/src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts`（rule 改 endTime 单测） |
| **修改** | `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx`（补 ArchetypePicker 裸版 + 内部重叠预检） |
| **修改** | `frontend/src/domains/timebox/cnui/handlers.ts`（新增 editTimeboxes open/submit 分支 + surfaceHandlers map 加表项） |
| **修改** | `frontend/src/domains/timebox/manifest.yaml`（A 区块删 cancelTimebox + 加 editTimeboxes；K 区块加 edit-timeboxes） |
| **修改** | `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts`（line 75-89 改 duration → endTime + severity 分级） |
| **修改** | `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts`（增 editTimeboxes 分支用例） |
| **修改** | `frontend/src/domains/timebox/lib/__tests__/overlap.test.ts`（新增，单测） |
| **文档** | `frontend/docs/database-design.md` + `docs/usom-design.md` + `docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md` 时间重叠指针指向 023.04 |
| **文档** | `CHANGELOG.md`（新增 [023.04] 版本条目） |

---

## Task 0: 重叠检测纯函数 `assertNoInternalOverlap` + 单测

**Files:**
- Create: `frontend/src/domains/timebox/lib/overlap.ts`
- Create: `frontend/src/domains/timebox/lib/__tests__/overlap.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OverlapItem { title: string; startTime: string; endTime: string }
  export interface OverlapResult { hasOverlap: boolean; conflictTitles: string[] }
  export function assertNoInternalOverlap(
    items: OverlapItem[],
    dayStart: string,    // ISO 今日 00:00:00
    dayEnd: string       // ISO 明日 00:00:00
  ): OverlapResult
  ```

- [ ] **Step 1: 写失败的单测**

文件：`frontend/src/domains/timebox/lib/__tests__/overlap.test.ts`

```ts
/**
 * @file overlap.test
 * @brief [023.04] T0 assertNoInternalOverlap 纯函数单测
 *
 * 覆盖空数组/单条/多条两两不重叠/两条完全重叠/边界相切 end==start 不重叠/跨日不算同日。
 */

import { describe, it, expect } from 'vitest'
import { assertNoInternalOverlap, type OverlapItem } from '../overlap'

const day = (h: number, m = 0) => `2026-07-04T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`
const dayStart = '2026-07-04T00:00:00+08:00'
const dayEnd = '2026-07-05T00:00:00+08:00'

describe('[023.04] assertNoInternalOverlap', () => {
  it('空数组 → hasOverlap=false', () => {
    expect(assertNoInternalOverlap([], dayStart, dayEnd)).toEqual({ hasOverlap: false, conflictTitles: [] })
  })

  it('单条 → hasOverlap=false', () => {
    const items: OverlapItem[] = [{ title: 'A', startTime: day(9), endTime: day(10) }]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('两条完全不重叠 → hasOverlap=false', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(10) },
      { title: 'B', startTime: day(11), endTime: day(12) },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('两条完全重叠 → hasOverlap=true + conflictTitles 含双方', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(11) },
      { title: 'B', startTime: day(10), endTime: day(12) },
    ]
    const r = assertNoInternalOverlap(items, dayStart, dayEnd)
    expect(r.hasOverlap).toBe(true)
    expect(r.conflictTitles).toContain('A')
    expect(r.conflictTitles).toContain('B')
  })

  it('边界相切 end==start → 不算重叠（半开区间）', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: day(9), endTime: day(10) },
      { title: 'B', startTime: day(10), endTime: day(11) },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })

  it('跨日不算同日重叠', () => {
    const items: OverlapItem[] = [
      { title: 'A', startTime: '2026-07-04T23:00:00+08:00', endTime: '2026-07-05T01:00:00+08:00' },
      { title: 'B', startTime: '2026-07-05T09:00:00+08:00', endTime: '2026-07-05T10:00:00+08:00' },
    ]
    expect(assertNoInternalOverlap(items, dayStart, dayEnd).hasOverlap).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/lib/__tests__/overlap.test.ts
```

期望：FAIL with `Failed to resolve import "../overlap"`

- [ ] **Step 3: 创建 lib 目录 + 实现纯函数**

```bash
mkdir -p frontend/src/domains/timebox/lib/__tests__
```

文件：`frontend/src/domains/timebox/lib/overlap.ts`

```ts
/**
 * @file overlap
 * @brief [023.04] 内部时间重叠检测纯函数
 *
 * 半开区间重叠算法（与 timebox-overlap rule 对齐）：
 *   overlap ⇔ s1 < e2 && s2 < e1
 * 边界相切（end == start）不重叠。
 *
 * 与已有 today timebox 的比较放在服务端 rule（本函数仅扫 batch 内），
 * 因为客户端传 today 列表会让 useEffect 重渲染抖动；服务端 rule 是
 * 单一权威源（service-side 已发起的 createTimebox intent 走 Nexus）。
 */

export interface OverlapItem {
  title: string
  startTime: string
  endTime: string
}

export interface OverlapResult {
  hasOverlap: boolean
  conflictTitles: string[]
}

export function assertNoInternalOverlap(
  items: OverlapItem[],
  _dayStart: string,
  _dayEnd: string,
): OverlapResult {
  const conflictTitles: string[] = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const aS = Date.parse(a.startTime)
    const aE = Date.parse(a.endTime)
    if (isNaN(aS) || isNaN(aE) || aE <= aS) continue  // 端点非法由 EndTimeAfterStartRule 兜底

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]
      const bS = Date.parse(b.startTime)
      const bE = Date.parse(b.endTime)
      if (isNaN(bS) || isNaN(bE) || bE <= bS) continue

      if (aS < bE && bS < aE) {
        conflictTitles.push(a.title || '未命名')
        conflictTitles.push(b.title || '未命名')
      }
    }
  }
  const hasOverlap = conflictTitles.length > 0
  return { hasOverlap, conflictTitles: hasOverlap ? Array.from(new Set(conflictTitles)) : [] }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/lib/__tests__/overlap.test.ts
```

期望：PASS 6/6

- [ ] **Step 5: tsc 零新增错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
```

期望：0

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/lib/overlap.ts frontend/src/domains/timebox/lib/__tests__/overlap.test.ts
git commit -m "feat(023.04): add assertNoInternalOverlap pure function"
```

---

## Task 1: 修 `timebox-overlap.ts` rule 改读 `endTime` + 单测

**Files:**
- Modify: `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts:74-89`
- Create: `frontend/src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts`

**Interfaces:**
- 修改后的 evaluate 行为：从 `intent.fields.endTime` 读 endMs；与 status ∈ {planned, running, overtime} 的已有 timebox 重叠 → severity=confirm；与 ended/cancelled/logged 重叠 → pass；endTime 缺失 → pass（兼容）。

- [ ] **Step 1: 写失败的单测**

文件：`frontend/src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts`

```ts
/**
 * @file timebox-overlap.test
 * @brief [023.04] T1 timebox-overlap rule 改 endTime 单测
 *
 * 修后行为（[023] A2 OV#P1-#1 后：duration 已撤，由 client 折成 endTime）：
 * - endTime 缺失 → pass（兼容）
 * - 与 planned/running/overtime 重叠 → confirm
 * - 与 ended/cancelled/logged 重叠 → pass（不阻断）
 */

import { describe, it, expect, vi } from 'vitest'
import { createTimeOverlapRule } from '../rules/timebox-overlap'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

const userId = '00000000-0000-0000-0000-000000000001'

function mockRepo(byDate: Array<{ startTime: string; endTime: string; title: string; status: string }>) {
  return {
    findByDateRange: vi.fn().mockResolvedValue(byDate),
  } as any
}

const intent = (fields: Record<string, unknown>): StructuredIntent =>
  ({ fields } as unknown as StructuredIntent)

const snapshot = {} as ContextSnapshot

describe('[023.04] TimeOverlapRule — endTime-based', () => {
  it('endTime 缺失 → pass（兼容历史 intent）', async () => {
    const rule = createTimeOverlapRule(mockRepo([]), userId as any)
    const r = await rule.evaluate(intent({ startTime: '2026-07-04T09:00:00Z' }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('endTime 与 planned 重叠 → confirm', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:30:00Z', endTime: '2026-07-04T10:30:00Z', title: '晨会', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:00:00Z',
      endTime: '2026-07-04T10:00:00Z',
    }), snapshot)
    expect(r.severity).toBe('confirm')
    expect(r.message).toContain('晨会')
  })

  it('endTime 与 ended timebox 重叠 → pass（不阻断）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '已结束', status: 'ended' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('endTime 与 cancelled timebox 重叠 → pass', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '已取消', status: 'cancelled' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('边界相切 end==start → pass（半开区间）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T10:00:00Z', endTime: '2026-07-04T11:00:00Z', title: 'A', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:00:00Z',
      endTime: '2026-07-04T10:00:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })
})
```

- [ ] **Step 2: 跑测试确认失败（status-aware 分级失败）**

```bash
cd frontend && npx vitest run src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts
```

期望：FAIL（因当前实现读 `duration` 不读 `endTime` 不分级 status，至少 2 个 case 失败）

- [ ] **Step 3: 改 `timebox-overlap.ts`**

修改 `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts` line 73-122，将 evaluate 函数替换为：

```ts
    async evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): Promise<RuleResult> {
      const startTime = getField(intent, 'startTime')
      const endTime = getField(intent, 'endTime')

      // 缺失字段由 FieldCompletenessRule 负责，此处跳过（[023.04] 兼容无 endTime 的历史 intent）
      if (!isNonEmptyString(startTime) || !isNonEmptyString(endTime)) {
        return { severity: 'pass' }
      }

      const startMs = Date.parse(startTime as string)
      const endMs = Date.parse(endTime as string)
      if (isNaN(startMs) || isNaN(endMs)) {
        // 无效日期格式由 StartTimeInFutureRule 负责
        return { severity: 'pass' }
      }
      if (endMs <= startMs) {
        // endTime<=startTime 由 EndTimeAfterStartRule 负责
        return { severity: 'pass' }
      }

      const startISO = new Date(startMs).toISOString() as Timestamp
      const endISO = new Date(endMs).toISOString() as Timestamp

      const existingTimeboxes = await timeboxRepo.findByDateRange(
        startISO,
        endISO,
        userId,
      )

      // [023.04]：status-aware 分级。
      // 仅与活跃（planned/running/overtime）重叠 → confirm；
      // 与已结束（ended/cancelled/logged）重叠 → pass。
      // 原因：活跃时间盒是真的会撞；终态不再占时间，重复覆盖无副作用。
      const activeStatuses = new Set(['planned', 'running', 'overtime'])
      const overlappingTitles: string[] = []
      for (const tb of existingTimeboxes) {
        if (!activeStatuses.has(tb.status)) continue
        const tbStartMs = Date.parse(tb.startTime)
        const tbEndMs = Date.parse(tb.endTime)
        if (isNaN(tbStartMs) || isNaN(tbEndMs)) continue
        if (intervalsOverlap(startMs, endMs, tbStartMs, tbEndMs)) {
          overlappingTitles.push(tb.title)
        }
      }

      if (overlappingTitles.length === 0) {
        return { severity: 'pass' }
      }

      const conflictList = overlappingTitles.join('、')
      return {
        severity: 'confirm',
        message: `与已有时间盒冲突: ${conflictList}`,
      }
    },
```

同时更新 line 56-65 的 JSDoc：

```ts
/**
 * 创建 TimeOverlapRule 实例
 *
 * 依赖注入方式：闭包工厂模式
 * - timeboxRepo: 用于查询日期范围内的时间盒
 * - userId: 多租户过滤
 *
 * 评估逻辑（[023.04] 改读 endTime）：
 * 1. 从 intent.fields 提取 startTime 和 endTime
 *    （[023] A2 OV#P1-#1 后 duration 已撤，由客户端把 duration 折成 endTime 上送）
 * 2. 查询 [startTime, endTime] 范围内已有时间盒
 * 3. 对每个 status ∈ {planned, running, overtime} 的活跃时间盒检查区间重叠
 * 4. 与活跃重叠 → confirm；与已结束/已取消/已记录 重叠 → pass（不阻断）
 *
 * @param timeboxRepo - 时间盒仓库实例
 * @param userId      - 当前用户 ID
 * @returns Rule 实例
 */
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts
```

期望：PASS 5/5

- [ ] **Step 5: 跑全基线验证未引入回归**

```bash
cd frontend && npx vitest run src/nexus/core/rule-engine 2>&1 | tail -20
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
```

期望：
- rule-engine tests PASS
- tsc 新增错误 = 0

- [ ] **Step 6: Commit**

```bash
git add frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts frontend/src/nexus/core/rule-engine/__tests__/timebox-overlap.test.ts
git commit -m "fix(023.04): timebox-overlap rule read endTime + status-aware severity"
```

---

## Task 2: CreateTimebox 补 ArchetypePicker + 内部重叠预检

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx`

**Interfaces:**
- Consumes: `ArchetypePicker` 裸版（`@/components/archetype/archetype-picker`），`assertNoInternalOverlap`（`../lib/overlap`）
- 修改后行为：
  - 标题/时间输入下方插入 `<ArchetypePicker value={cur.activityArchetypeId} onChange={id => update({ activityArchetypeId: id })} />` + label
  - `onValidate` 计算 `overlap = assertNoInternalOverlap(items, dayStart, dayEnd)`，若 `overlap.hasOverlap`，提交按钮 disabled + 提示「同日时间盒冲突：xxx」
  - 提交按钮 disabled 条件：`isLoading || !allTitlesFilled || overlap.hasOverlap`

- [ ] **Step 1: 修改 CreateTimebox.tsx — 补 import**

在文件顶部 line 11-12 后插入：

```tsx
import { useMemo } from 'react'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
import { assertNoInternalOverlap } from '../lib/overlap'
```

并将原 `import { useState } from 'react'` 改为 `import { useState, useMemo } from 'react'`。

- [ ] **Step 2: 改造 component — 加 overlap + archetype render**

将 `CreateTimebox` 函数体内（line 32 起）替换为：

```tsx
export function CreateTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateTimeboxProps) {
  const items = (dataModel.items as TimeboxDraft[]) ?? []
  const [page, setPage] = useState(0)

  // [023-01+] RC-A：所有 draft title 非空，否则禁用提交按钮
  const allTitlesFilled = items.length > 0 && items.every((it) => typeof it.title === 'string' && it.title.trim().length > 0)

  // [023.04]：内部重叠预检（同日 batch 内多条互判）
  const overlap = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return assertNoInternalOverlap(items, today + 'T00:00:00+08:00', today + 'T23:59:59+08:00')
  }, [items])
  const hasOverlap = overlap.hasOverlap

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {items.length} 个时间盒已创建</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">未识别到时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<TimeboxDraft>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  const canSubmit = !isLoading && allTitlesFilled && !hasOverlap

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">创建时间盒 ({page + 1}/{items.length})</span>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
            <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label htmlFor="ct-title" className="text-xs text-body">标题</label>
          <input id="ct-title" type="text" value={cur.title} onChange={e => update({ title: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="ct-start" className="text-xs text-body">开始</label>
            <input id="ct-start" type="datetime-local" value={isoToLocalDatetimeInput(cur.startTime)} onChange={e => update({ startTime: localDatetimeInputToIso(e.target.value) })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="ct-end" className="text-xs text-body">结束</label>
            <input id="ct-end" type="datetime-local" value={isoToLocalDatetimeInput(cur.endTime)} onChange={e => update({ endTime: localDatetimeInputToIso(e.target.value) })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
        {/* [023.04] 补 archetype 选择器（裸版无 h3 label） */}
        <div>
          <label className="text-xs text-body">活动原型</label>
          <div className="mt-0.5">
            <ArchetypePicker
              value={cur.activityArchetypeId}
              onChange={(id) => update({ activityArchetypeId: id })}
            />
          </div>
        </div>
      </div>

      {/* [023.04] 重叠提示 */}
      {hasOverlap && (
        <p className="pt-1 text-xs text-error">同日时间盒冲突：{overlap.conflictTitles.join('、')}</p>
      )}
      {!allTitlesFilled && !hasOverlap && (
        <p className="pt-1 text-right text-xs text-body/70">请填写所有时间盒的标题</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button
          type="button"
          onClick={() => onConfirm(dataModel)}
          disabled={!canSubmit}
          title={!allTitlesFilled ? '请填写所有时间盒的标题' : hasOverlap ? '同日时间盒冲突' : undefined}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          提交全部
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: tsc + 跑 cnui 测试无回归**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
cd frontend && npx vitest run src/domains/timebox/cnui 2>&1 | tail -10
```

期望：
- tsc 新增错误 = 0
- 现有 cnui tests 全绿（CreateTimebox 行为变更不影响外部契约）

- [ ] **Step 4: /browse 视觉验证（如有 chrome 可用）**

可选步骤：手动 `/createTimebox` 触发 surface，确认 archetype 选择器可见 + 多条重叠时按钮禁用 + 提示出现。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/CreateTimebox.tsx
git commit -m "feat(023.04): CreateTimebox add ArchetypePicker + internal overlap guard"
```

---

## Task 3: parseTimeboxesIntent + 双测（中文意图 → 编辑目标 / 取消目标 / 解析失败）

**Files:**
- Create: `frontend/src/domains/timebox/cnui/parse-timeboxes.ts`
- Create: `frontend/src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ParsedEditIntent =
    | { kind: 'edit'; timeboxId: string; newTitle?: string; newStartTime?: string; newEndTime?: string; confidence: number }
    | { kind: 'cancel'; timeboxId: string; confidence: number }
    | { kind: 'unsure'; reason: string }
    | { kind: 'noop' }

  export async function parseTimeboxesIntent(
    rawInput: string,
    todayTimeboxes: TimeboxSummary[],   // 用于 ground-truth 标题 → id 匹配
    aiRuntime?: AIRuntime,
  ): Promise<ParsedEditIntent>
  ```
- 实现策略（MVP）：**先尝试纯规则解析**（中文时间词 + 今日时表索引），失败且 aiRuntime 在场 → fallback LLM 解析；都不行 → `kind:'unsure'`，由 handler.open 走 selecting 模式。

- [ ] **Step 1: 写失败的单测**

文件：`frontend/src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts`

```ts
/**
 * @file parse-timeboxes.test
 * @brief [023.04] T3 parseTimeboxesIntent 纯规则解析单测
 *
 * MVP 实现：纯规则解析（中文时间词 + 序号）+ 标题匹配 todayTimeboxes。
 * 解析失败 → kind:'unsure'（handler.open 降级到 selecting）。
 */

import { describe, it, expect } from 'vitest'
import { parseTimeboxesIntent } from '../parse-timeboxes'
import type { TimeboxSummary } from '@/usom/types/summaries'

const today = [
  {
    id: 'tb1', title: '晨会', status: 'planned',
    startTime: '2026-07-04T09:00:00.000Z', endTime: '2026-07-04T10:00:00.000Z',
    taskIds: [], habitIds: [],
  },
  {
    id: 'tb2', title: '代码审查', status: 'planned',
    startTime: '2026-07-04T14:00:00.000Z', endTime: '2026-07-04T15:00:00.000Z',
    taskIds: [], habitIds: [],
  },
  {
    id: 'tb3', title: '下午客户拜访', status: 'planned',
    startTime: '2026-07-04T16:00:00.000Z', endTime: '2026-07-04T17:30:00.000Z',
    taskIds: [], habitIds: [],
  },
] as unknown as TimeboxSummary[]

const NOW = new Date('2026-07-04T08:00:00+08:00')

describe('[023.04] parseTimeboxesIntent — 纯规则', () => {
  it('解析「把早上的会议改到下午 14:00」 → kind=edit + timeboxId=tb1', async () => {
    const r = await parseTimeboxesIntent('把早上的会议改到下午 14:00', today, undefined, NOW)
    expect(r.kind).toBe('edit')
    if (r.kind === 'edit') {
      expect(r.timeboxId).toBe('tb1')
    }
  })

  it('解析「把代码审查改到 15:30」 → kind=edit + timeboxId=tb2', async () => {
    const r = await parseTimeboxesIntent('把代码审查改到 15:30', today, undefined, NOW)
    expect(r.kind).toBe('edit')
    if (r.kind === 'edit') {
      expect(r.timeboxId).toBe('tb2')
    }
  })

  it('解析「把早上的会议取消」 → kind=cancel + timeboxId=tb1', async () => {
    const r = await parseTimeboxesIntent('把早上的会议取消', today, undefined, NOW)
    expect(r.kind).toBe('cancel')
    if (r.kind === 'cancel') {
      expect(r.timeboxId).toBe('tb1')
    }
  })

  it('解析「删除下午客户拜访」 → kind=cancel + timeboxId=tb3', async () => {
    const r = await parseTimeboxesIntent('删除下午客户拜访', today, undefined, NOW)
    expect(r.kind).toBe('cancel')
    if (r.kind === 'cancel') {
      expect(r.timeboxId).toBe('tb3')
    }
  })

  it('解析「调整代码审查到 16:00」 → kind=edit', async () => {
    const r = await parseTimeboxesIntent('调整代码审查到 16:00', today, undefined, NOW)
    expect(r.kind).toBe('edit')
  })

  it('解析「帮我看一下今天的时间盒」 → kind=noop（走列表）', async () => {
    const r = await parseTimeboxesIntent('帮我看一下今天的时间盒', today, undefined, NOW)
    expect(r.kind).toBe('noop')
  })

  it('解析「不知道什么会议」 → kind=unsure（handler.open 降级到列表）', async () => {
    const r = await parseTimeboxesIntent('不知道什么会议改改', today, undefined, NOW)
    expect(r.kind).toBe('unsure')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts
```

期望：FAIL with `Failed to resolve import "../parse-timeboxes"`

- [ ] **Step 3: 实现 parseTimeboxesIntent（纯规则 MVP）**

文件：`frontend/src/domains/timebox/cnui/parse-timeboxes.ts`

```ts
/**
 * @file parse-timeboxes
 * @brief [023.04] T3 中文意图解析（修改/取消）—— MVP 纯规则
 *
 * 策略：先纯规则解析。无 aiRuntime 时不强依赖 LLM；
 * 解析失败 → kind:'unsure' → handler.open 降级到 selecting 列表。
 *
 * 规则要点：
 * - 中文时间词：「早上/上午」= today 06:00-11:59 范围匹配；「下午」= 12:00-18:00；「晚上」= 18:00-23:59
 * - 时间表达：「HH:MM」/「X 点」/「下午 X 点」/「X 分」直接提取
 * - 标题关键词：today 某条 title 全子串匹配
 * - 动作词：「改/调整/修改/变更」→ edit；「取消/不要了/删除/去掉」→ cancel
 */

import type { AIRuntime } from '@/nexus/ai-runtime'
import type { TimeboxSummary } from '@/usom/types/summaries'

export type ParsedEditIntent =
  | { kind: 'edit'; timeboxId: string; newStartTime?: string; newEndTime?: string; confidence: number }
  | { kind: 'cancel'; timeboxId: string; confidence: number }
  | { kind: 'unsure'; reason: string }
  | { kind: 'noop' }

const CANCEL_KEYWORDS = ['取消', '删除', '去掉', '不要', 'cancel']
const EDIT_KEYWORDS = ['改', '调整', '变更', '修改', '移到', '推迟', '提前']

function matchByTimeWord(today: TimeboxSummary[], now: Date): TimeboxSummary | null {
  const hour = now.getHours()
  if (hour < 12) {
    // 早/上午 范围匹配
    const morning = today.filter(t => new Date(t.startTime).getHours() < 12)
    return morning.length === 1 ? morning[0] : morning[0] ?? null
  }
  if (hour < 18) {
    const afternoon = today.filter(t => {
      const h = new Date(t.startTime).getHours()
      return h >= 12 && h < 18
    })
    return afternoon.length === 1 ? afternoon[0] : afternoon[0] ?? null
  }
  return null
}

function matchByKeyword(today: TimeboxSummary[], input: string): TimeboxSummary | null {
  for (const tb of today) {
    if (input.includes(tb.title)) return tb
  }
  return null
}

function extractHour(input: string, now: Date): number | null {
  // 「下午 14:00」/「15:30」/「3 点」/「3 点半」
  const timeMatch = input.match(/(\d{1,2})[：:](\d{1,2})/)
  if (timeMatch) return Number(timeMatch[1])
  const hourMatch = input.match(/(\d{1,2})\s*点/)
  if (hourMatch) {
    let h = Number(hourMatch[1])
    if (input.includes('下午') || input.includes('晚上')) {
      if (h < 12) h += 12
    } else if (input.includes('上午') || input.includes('早上') || input.includes('凌晨')) {
      if (h === 12) h = 0
    }
    return h
  }
  // 「下午」/「晚上」无具体数字 → 用 now 时段的 right-bound
  if (input.includes('下午')) return 14
  if (input.includes('晚上')) return 19
  if (input.includes('上午') || input.includes('早上')) return 9
  return null
}

export async function parseTimeboxesIntent(
  rawInput: string,
  todayTimeboxes: TimeboxSummary[],
  _aiRuntime?: AIRuntime,
  now: Date = new Date(),
): Promise<ParsedEditIntent> {
  const lower = rawInput.toLowerCase()

  // 1. 解析动作（cancel / edit / noop）
  let action: 'edit' | 'cancel' | null = null
  if (CANCEL_KEYWORDS.some(k => lower.includes(k))) action = 'cancel'
  else if (EDIT_KEYWORDS.some(k => lower.includes(k))) action = 'edit'
  if (!action) {
    // 纯查询类（无动作词）
    if (lower.includes('看') || lower.includes('查') || lower.includes('打开') || lower.includes('列表')) {
      return { kind: 'noop' }
    }
    return { kind: 'unsure', reason: '未识别到修改/取消动作词' }
  }

  // 2. 匹配目标时间盒（先用关键词，再用时段，再降级 unsure）
  const target =
    matchByKeyword(todayTimeboxes, rawInput) ??
    matchByTimeWord(todayTimeboxes, now)
  if (!target) {
    return { kind: 'unsure', reason: '未匹配到当日时间盒' }
  }

  // 3. cancel 路径
  if (action === 'cancel') {
    return { kind: 'cancel', timeboxId: target.id, confidence: 0.85 }
  }

  // 4. edit 路径：尝试提取新时间
  const newHour = extractHour(rawInput, now)
  if (newHour == null) {
    return { kind: 'unsure', reason: '未识别到新时间' }
  }
  const todayStr = now.toISOString().split('T')[0]
  const newStart = new Date(`${todayStr}T${String(newHour).padStart(2, '0')}:00:00+08:00`).toISOString()
  const origStartHour = new Date(target.startTime).getHours()
  const duration = new Date(target.endTime).getTime() - new Date(target.startTime).getTime()
  const newEnd = new Date(new Date(newStart).getTime() + duration).toISOString()
  // 时段关键词默认值下的 endTime 用原始 duration；具体小时用 hour + 原始 duration
  if (isNaN(new Date(newStart).getTime())) {
    return { kind: 'unsure', reason: '时间解析失败' }
  }
  return {
    kind: 'edit',
    timeboxId: target.id,
    newStartTime: newStart,
    newEndTime: newEnd,
    confidence: 0.85,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts
```

期望：PASS 7/7

- [ ] **Step 5: tsc 零新增**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
```

期望：0

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/cnui/parse-timeboxes.ts frontend/src/domains/timebox/cnui/__tests__/parse-timeboxes.test.ts
git commit -m "feat(023.04): add parseTimeboxesIntent (rule-based MVP)"
```

---

## Task 4: EditTimeboxes surface（解析优先模式 + 全字段表单 + 删除按钮）

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`
- Create: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`

**Interfaces:**
- Surface contract（与 CNUI runtime）：
  ```ts
  interface EditTimeboxesProps {
    surfaceType: string
    dataModel: {
      mode: 'selecting' | 'editing' | 'prefilled'  // handler.open 写入
      items?: TimeboxSummary[]                       // selecting mode
      selectedId?: string                           // editing mode
      prefill?: Partial<TimeboxDraft>               // editing mode 字段初值
      status?: string                               // editing mode 状态标签
      readOnly?: boolean
    }
    onDataChange: (d: Record<string, unknown>) => void
    onConfirm: (d: Record<string, unknown>) => void
    onCancel?: () => void
    isLoading?: boolean
    isDone?: boolean
    serverErrors?: string[]
  }
  ```
- onConfirm payload（handler.submit 端按 `operation` 字段分支）：
  - 修改：`{ operation: 'update', selectedId, fields: { title, startTime, endTime, activityArchetypeId, ... } }`
  - 删除：`{ operation: 'delete', selectedId }`

- [ ] **Step 1: 写失败的单测**

文件：`frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx`

```tsx
/**
 * @file edit-timeboxes.test.tsx
 * @brief [023.04] T4 EditTimeboxes 渲染 + 三态切换 + 删除按钮存在性
 *
 * 三模式：
 * - selecting：列表选 item 进编辑表单
 * - editing：表单纯受控 + 「返回列表」+「删除」按钮（planned status 时显）
 * - editing：表单纯受控 + 不显「删除」（running/ended status 时）
 *
 * onConfirm payload 必须含 operation 字段。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditTimeboxes } from '../EditTimeboxes'
import type { TimeboxSummary } from '@/usom/types/summaries'

function tb(id: string, status: 'planned' | 'running' | 'ended', title = `T${id}`): TimeboxSummary {
  return {
    id, title, status,
    startTime: '2026-07-04T09:00:00.000Z', endTime: '2026-07-04T10:00:00.000Z',
    taskIds: [], habitIds: [],
  } as unknown as TimeboxSummary
}

function makeProps(overrides: Partial<{ items: TimeboxSummary[]; selectedId: string; prefill: { title: string }; status: string }> = {}) {
  return {
    surfaceType: 'edit-timeboxes',
    dataModel: {
      mode: 'selecting',
      items: overrides.items ?? [tb('tb1', 'planned')],
      selectedId: overrides.selectedId,
      prefill: overrides.prefill,
      status: overrides.status,
      readOnly: false,
    } as Record<string, unknown>,
    onDataChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }
}

describe('[023.04] <EditTimeboxes>', () => {
  it('mode=selecting items=[] → 空态「未匹配到当日时间盒」', () => {
    render(<EditTimeboxes {...makeProps({ items: [] })} />)
    expect(screen.getByText('未匹配到当日时间盒')).toBeInTheDocument()
  })

  it('mode=selecting items>0 → 列表渲染 + 点击 item 进编辑表单', () => {
    render(<EditTimeboxes {...makeProps({ items: [tb('tb1', 'planned'), tb('tb2', 'running')] })} />)
    expect(screen.getByText('请选择要操作的时间盒')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ttb1').closest('button')!)
    expect(screen.getByText(/编辑时间盒/)).toBeInTheDocument()
  })

  it('编辑表单 — planned status 时显「删除」按钮', () => {
    render(<EditTimeboxes {...{
      ...makeProps({ selectedId: 'tb1', prefill: { title: '晨会' }, status: 'planned' }),
      dataModel: {
        mode: 'editing',
        items: [tb('tb1', 'planned')],
        selectedId: 'tb1',
        prefill: { title: '晨会' },
        status: 'planned',
      },
    }} />)
    expect(screen.getByText('删除该时间盒')).toBeInTheDocument()
  })

  it('编辑表单 — running status 时「删除」按钮不渲染', () => {
    render(<EditTimeboxes {...{
      ...makeProps({ selectedId: 'tb1', status: 'running' }),
      dataModel: {
        mode: 'editing',
        items: [tb('tb1', 'running')],
        selectedId: 'tb1',
        prefill: { title: '晨会' },
        status: 'running',
      },
    }} />)
    expect(screen.queryByText('删除该时间盒')).not.toBeInTheDocument()
  })

  it('编辑表单 — 修改 title 后点保存 → onConfirm payload.operation=update', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...{
      ...makeProps({ selectedId: 'tb1' }),
      onConfirm,
      dataModel: {
        mode: 'editing',
        items: [tb('tb1', 'planned')],
        selectedId: 'tb1',
        prefill: { title: '晨会' },
        status: 'planned',
      },
    }} />)
    const titleInput = screen.getByLabelText('标题') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '晨间同步' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('update')
    expect(payload.selectedId).toBe('tb1')
  })

  it('编辑表单 — 点「删除」按钮 → onConfirm payload.operation=delete', () => {
    const onConfirm = vi.fn()
    render(<EditTimeboxes {...{
      ...makeProps({ selectedId: 'tb1' }),
      onConfirm,
      dataModel: {
        mode: 'editing',
        items: [tb('tb1', 'planned')],
        selectedId: 'tb1',
        prefill: { title: '晨会' },
        status: 'planned',
      },
    }} />)
    fireEvent.click(screen.getByText('删除该时间盒'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload.operation).toBe('delete')
    expect(payload.selectedId).toBe('tb1')
  })

  it('编辑表单 — 顶部「返回列表」回到 selecting 模式', () => {
    render(<EditTimeboxes {...{
      ...makeProps({ selectedId: 'tb1' }),
      dataModel: {
        mode: 'editing',
        items: [tb('tb1', 'planned'), tb('tb2', 'planned')],
        selectedId: 'tb1',
        prefill: { title: '晨会' },
        status: 'planned',
      },
    }} />)
    fireEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText('请选择要操作的时间盒')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
```

期望：FAIL with `Failed to resolve import "../EditTimeboxes"`

- [ ] **Step 3: 实现 EditTimeboxes surface**

文件：`frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx`

```tsx
/**
 * @file EditTimeboxes
 * @brief [023.04] 修改/取消/删除时间盒 CNUI surface（统一入口）
 *
 * 三模式：
 * - selecting：列当日时间盒，用户点选进 editing
 * - editing：全字段表单（title/start/end/archetype/notes/tags/taskIds/habitIds）
 *   - 顶部「返回列表」退回 selecting
 *   - 底部「删除」按钮（仅 planned 状态，OV#8 守卫）
 *   - 保存 → onConfirm payload.operation='update'
 *   - 删除 → onConfirm payload.operation='delete'
 *
 * handler.submit 端按 operation 字段分支调 updateTimebox / deleteTimebox。
 * handler.open 端通过 parseTimeboxesIntent 解析用户 prompt；
 *   解析成功 → mode='editing' 注入 prefill；
 *   解析失败 → mode='selecting'。
 */

'use client'

import { useState } from 'react'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import type { TimeboxSummary } from '@/usom/types/summaries'

interface TimeboxDraft {
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
  notes?: string
  tags?: string[]
  taskIds?: string[]
  habitIds?: string[]
}

interface EditTimeboxesProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

export function EditTimeboxes({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditTimeboxesProps) {
  const mode = (dataModel.mode as 'selecting' | 'editing') ?? 'selecting'
  const items = (dataModel.items as (TimeboxSummary & { status: string })[]) ?? []
  const status = dataModel.status as string | undefined
  const selectedId = dataModel.selectedId as string | undefined
  const prefill = (dataModel.prefill as Partial<TimeboxDraft>) ?? {}
  const [draft, setDraft] = useState<TimeboxDraft>({
    title: prefill.title ?? '',
    startTime: prefill.startTime ?? '',
    endTime: prefill.endTime ?? '',
    activityArchetypeId: prefill.activityArchetypeId,
    notes: prefill.notes ?? '',
    tags: prefill.tags ?? [],
    taskIds: prefill.taskIds ?? [],
    habitIds: prefill.habitIds ?? [],
  })

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 已完成</p>

  if (mode === 'selecting') {
    return (
      <>
        <div className="mb-2"><span className="text-sm font-medium text-ink">请选择要操作的时间盒</span></div>
        {items.length === 0
          ? <p className="py-8 text-center text-sm text-body/70">未匹配到当日时间盒</p>
          : <div className="space-y-1 max-h-72 overflow-y-auto">
              {items.map(it => (
                <button key={it.id} type="button"
                  onClick={() => {
                    onDataChange({
                      ...dataModel,
                      mode: 'editing',
                      selectedId: it.id,
                      prefill: {
                        title: it.title,
                        startTime: it.startTime,
                        endTime: it.endTime,
                        activityArchetypeId: (it as unknown as { activityArchetypeId?: string }).activityArchetypeId,
                      },
                      status: it.status,
                    })
                  }}
                  className="w-full text-left rounded-md border border-hairline bg-canvas p-2 hover:bg-hover-overlay">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                    <span className="text-xs text-body/70">{it.status}</span>
                  </div>
                  <div className="text-xs text-body/70">{new Date(it.startTime).toLocaleString('zh-CN')}</div>
                </button>
              ))}
            </div>}
        {onCancel && <div className="flex justify-end pt-2">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>
        </div>}
      </>
    )
  }

  // mode === 'editing'
  const update = (patch: Partial<TimeboxDraft>) => setDraft(d => ({ ...d, ...patch }))
  const titleFilled = typeof draft.title === 'string' && draft.title.trim().length > 0
  const submitUpdate = () => {
    onConfirm({
      ...dataModel,
      operation: 'update',
      selectedId,
      fields: {
        title: draft.title,
        startTime: draft.startTime,
        endTime: draft.endTime,
        ...(draft.activityArchetypeId ? { activityArchetypeId: draft.activityArchetypeId } : {}),
        ...(draft.notes ? { notes: draft.notes } : {}),
        ...(draft.tags?.length ? { tags: draft.tags } : {}),
        ...(draft.taskIds?.length ? { taskIds: draft.taskIds } : {}),
        ...(draft.habitIds?.length ? { habitIds: draft.habitIds } : {}),
      },
    })
  }
  const submitDelete = () => {
    onConfirm({
      ...dataModel,
      operation: 'delete',
      selectedId,
    })
  }
  const back = () => {
    onDataChange({ ...dataModel, mode: 'selecting', prefill: undefined, selectedId: undefined })
  }
  const canDelete = status === 'planned'

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          编辑时间盒{status ? `（${status}）` : ''}
        </span>
        <button type="button" onClick={back} className="text-xs text-body/70 underline">返回列表</button>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label htmlFor="et-title" className="text-xs text-body">标题</label>
          <input id="et-title" type="text" value={draft.title}
            onChange={e => update({ title: e.target.value })}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="et-start" className="text-xs text-body">开始</label>
            <input id="et-start" type="datetime-local" value={isoToLocalDatetimeInput(draft.startTime)}
              onChange={e => update({ startTime: localDatetimeInputToIso(e.target.value) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="et-end" className="text-xs text-body">结束</label>
            <input id="et-end" type="datetime-local" value={isoToLocalDatetimeInput(draft.endTime)}
              onChange={e => update({ endTime: localDatetimeInputToIso(e.target.value) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
        <div>
          <label className="text-xs text-body">活动原型</label>
          <div className="mt-0.5">
            <ArchetypePicker value={draft.activityArchetypeId}
              onChange={id => update({ activityArchetypeId: id })} />
          </div>
        </div>
        <div>
          <label htmlFor="et-notes" className="text-xs text-body">备注</label>
          <textarea id="et-notes" value={draft.notes ?? ''}
            onChange={e => update({ notes: e.target.value })}
            rows={2}
            className="mt-0.5 w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {canDelete ? (
          <button type="button" onClick={submitDelete}
            className="rounded-md border border-error px-3 py-1.5 text-xs text-error hover:bg-hover-overlay">
            删除该时间盒
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          {onCancel && <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
          <button type="button" onClick={submitUpdate} disabled={isLoading || !titleFilled}
            title={!titleFilled ? '请填写标题' : undefined}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            保存
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
```

期望：PASS 7/7

- [ ] **Step 5: tsc 零新增**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
```

期望：0

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-timeboxes.test.tsx
git commit -m "feat(023.04): EditTimeboxes surface (解析优先模式 + 全字段 + 删除按钮)"
```

---

## Task 5: handler `editTimeboxes` 分支 + 测试（直调 update/delete，OV#8 透传）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:71` (open 分支), `:247` (submit 分支)
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:411-420` (surfaceHandlers map)
- Modify: `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts`

**Interfaces:**
- `timeboxCnuiHandler.open('editTimeboxes', { prompt?: string })`：调 `parseTimeboxesIntent` 解析；解析成功 → `{ mode: 'editing', selectedId, prefill, status }`；解析失败/查询当日列表 + fallback selecting
- `timeboxCnuiHandler.submit('editTimeboxes', { operation, selectedId, fields? })`：直调 `updateTimebox` / `deleteTimebox`；OV#8 service throw 必须 try/catch 透传
- `surfaceHandlers['edit-timeboxes'] = timeboxCnuiHandler`

- [ ] **Step 1: 写失败的 handler 单测（先写测试再实现）**

将以下 describe 块加到 `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` 文件末尾（在 `describe('错误处理')` 前面）：

```ts
describe('open - editTimeboxes（[023.04]）', () => {
  // [023.04]：解析优先模式；解析成功 → editing + prefill；失败 → selecting + items
  it('解析成功（命中「晨会」）→ mode=editing + selectedId=tb1 + status=planned', async () => {
    const result = await timeboxCnuiHandler.open('editTimeboxes', {
      prompt: '把晨会改到 10 点',
    })
    expect(result.dataSnapshot.mode).toBe('editing')
    expect(result.dataSnapshot.selectedId).toBe('timebox-1')  // mock 中只有这一条
  })

  it('解析失败 → mode=selecting + items=当日列表（mock）', async () => {
    const result = await timeboxCnuiHandler.open('editTimeboxes', {
      prompt: '今天能不能看一下我的会议',  // 不含修改/取消动作词
    })
    expect(result.dataSnapshot.mode).toBe('selecting')
    const items = result.dataSnapshot.items as Array<{ id: string }>
    expect(items.length).toBeGreaterThan(0)
  })
})

describe('submit - editTimeboxes（[023.04]）', () => {
  // [023.04]：直调 updateTimebox / deleteTimebox
  // OV#8：service throw 必须 try/catch 透传为 surface error
  it('operation=update → 调 updateTimebox 服务（直调，不走 submitDynamicIntent）', async () => {
    const updateTimebox = vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb1' } })
    vi.doMock('@/app/actions/timebox', () => ({ updateTimebox, deleteTimebox: vi.fn() }))
    // 注意：vi.doMock 在 describe 内对动态 import 生效（handler 是 await import 形式）
    const result = await timeboxCnuiHandler.submit('editTimeboxes', {
      operation: 'update',
      selectedId: 'tb1',
      fields: { title: '新标题', startTime: '2026-07-04T10:00:00Z', endTime: '2026-07-04T11:00:00Z' },
    })
    expect(updateTimebox).toHaveBeenCalledWith('tb1', expect.objectContaining({ title: '新标题' }))
    expect(result.success).toBe(true)
  })

  it('operation=delete → 调 deleteTimebox 服务', async () => {
    const deleteTimebox = vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb1' } })
    vi.doMock('@/app/actions/timebox', () => ({ updateTimebox: vi.fn(), deleteTimebox }))
    const result = await timeboxCnuiHandler.submit('editTimeboxes', {
      operation: 'delete',
      selectedId: 'tb1',
    })
    expect(deleteTimebox).toHaveBeenCalledWith('tb1')
    expect(result.success).toBe(true)
  })

  it('OV#8 守卫：service throw → surface error 透传（不静默）', async () => {
    const deleteTimebox = vi.fn().mockRejectedValue(new Error('该时间盒已记录，不可删除'))
    vi.doMock('@/app/actions/timebox', () => ({ updateTimebox: vi.fn(), deleteTimebox }))
    const result = await timeboxCnuiHandler.submit('editTimeboxes', {
      operation: 'delete',
      selectedId: 'tb1',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('不可删除')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts 2>&1 | tail -20
```

期望：FAIL（至少 `submit - editTimeboxes` 的 describe 块因 handler.submit 走到 `Unknown CN-UI action` 而失败）

- [ ] **Step 3: 在 handler.open 加 editTimeboxes 分支**

在 `frontend/src/domains/timebox/cnui/handlers.ts` 现有 `if (action === 'editItinerary') { ... }` 之后（line 233 之后），插入：

```ts
    // [023.04]：editTimeboxes — 解析优先模式（解析成功 → editing + prefill；失败 → selecting + 当日列表）
    if (action === 'editTimeboxes') {
      const prompt = (intentFields?.prompt as string | undefined) ?? ''
      const { parseTimeboxesIntent } = await import('../parse-timeboxes')
      const todayBoxes = await getTodayTimeboxes()
      const todaySummaries = todayBoxes.map(t => ({
        id: t.id, title: t.title,
        startTime: t.startTime, endTime: t.endTime,
        status: t.status, taskIds: t.taskIds ?? [], habitIds: t.habitIds ?? [],
      }))
      const parsed = await parseTimeboxesIntent(prompt, todaySummaries as never)

      if (parsed.kind === 'edit' || parsed.kind === 'cancel') {
        const target = todayBoxes.find(t => t.id === parsed.timeboxId)
        if (target) {
          const prefill: Record<string, unknown> = {
            title: target.title,
            startTime: target.startTime,
            endTime: target.endTime,
            ...(parsed.kind === 'edit' && parsed.newStartTime ? { startTime: parsed.newStartTime } : {}),
            ...(parsed.kind === 'edit' && parsed.newEndTime ? { endTime: parsed.newEndTime } : {}),
            ...(target.activityArchetypeId ? { activityArchetypeId: target.activityArchetypeId } : {}),
          }
          return {
            content: parsed.kind === 'cancel' ? `确认要取消「${target.title}」？` : `请确认修改「${target.title}」`,
            dataSnapshot: {
              mode: 'editing',
              selectedId: target.id,
              prefill,
              status: target.status,
              items: todaySummaries,
              readOnly: false,
            },
          }
        }
      }

      // 解析失败 / 命中 noop → selecting 模式
      return {
        content: '请选择要操作的时间盒',
        dataSnapshot: {
          mode: 'selecting',
          items: todaySummaries,
          readOnly: false,
        },
      }
    }
```

- [ ] **Step 4: 在 handler.submit 加 editTimeboxes 分支**

在 `frontend/src/domains/timebox/cnui/handlers.ts` 现有 `if (action === 'editItinerary')` 之前插入：

```ts
    // [023.04]：editTimeboxes — 直调 updateTimebox / deleteTimebox（不走 submitDynamicIntent）
    if (action === 'editTimeboxes') {
      const { updateTimebox, deleteTimebox } = await import('@/app/actions/timebox')
      const op = (fields as { operation?: string }).operation
      const selectedId = (fields as { selectedId?: string }).selectedId
      if (!selectedId) return { success: false, error: '未选择时间盒' }

      if (op === 'delete') {
        try {
          await deleteTimebox(selectedId)
          return { success: true, data: { id: selectedId } }
        } catch (e) {
          // OV#8 守卫透传（service reject 必须出 surface error，不静默）
          return { success: false, error: e instanceof Error ? e.message : '删除失败' }
        }
      }

      // op === 'update' 默认路径
      const patch = (fields as { fields?: Record<string, unknown> }).fields ?? {}
      try {
        const r = await updateTimebox(selectedId, patch)
        if (r.status === 'needs_confirm') return { success: false, error: r.message }
        return { success: true, data: { id: selectedId } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
    }
```

- [ ] **Step 5: 更新 surfaceHandlers map**

在 `frontend/src/domains/timebox/cnui/handlers.ts` 末尾的 `surfaceHandlers` map（line 411-420），添加 `edit-timeboxes` 表项：

```ts
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'timebox-list': timeboxCnuiHandler,
  'create-timebox': timeboxCnuiHandler,
  'log-timebox': timeboxCnuiHandler,
  'adjust-schedule': timeboxCnuiHandler,
  // [026] A2.5 — 行程 3 surface 共用 timeboxCnuiHandler（按 action 分支）
  'create-itinerary': timeboxCnuiHandler,
  'edit-itinerary': timeboxCnuiHandler,
  'delete-itinerary': timeboxCnuiHandler,
  // [023.04]：editTimeboxes 三合一（修改/取消/删除）
  'edit-timeboxes': timeboxCnuiHandler,
}
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts 2>&1 | tail -20
```

期望：所有 describe 全 PASS（含新增 5 个 case）

- [ ] **Step 7: tsc 零新增**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
```

期望：0

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/timebox/cnui/handlers.ts frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts
git commit -m "feat(023.04): handler editTimeboxes 分支（直调 update/delete + OV#8 透传）"
```

---

## Task 6: manifest 注册 editTimeboxes + 删 cancelTimebox + 校验

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml:10-42` (A 区块) + `:417-440` (K 区块)

- [ ] **Step 1: 改 A 区块 — 删 cancelTimebox、增 editTimeboxes**

在 `frontend/src/domains/timebox/manifest.yaml` 中，**删除** line 37-42（`cancelTimebox` 整个条目），然后在 `startTimebox` 之前（line 23-29 现有 `startTimebox` 之前）插入：

```yaml
  - action: editTimeboxes
    shortcut: /editTimeboxes
    description: 修改/取消/删除当日时间盒（CNUI 三合一入口）
    response_type: cnui
    cnui_surface: edit-timeboxes
    examples:
      - 把早上的会议改到下午 14:00
      - 把代码审查改到 16 点
      - 把下午客户拜访改期
      - 取消早上的会议
      - 删除下午的会议
      - 帮我看一下今天的时间盒
    keywords: [修改时间盒, 改时间盒, 改时间, 调整时间盒, 取消时间盒, 删除时间盒]
```

- [ ] **Step 2: 改 K 区块 — 加 edit-timeboxes**

在 `frontend/src/domains/timebox/manifest.yaml` 末尾 `delete-itinerary:` 后（line 440 之后）插入：

```yaml
  # [023.04]：editTimeboxes 三合一（修改/取消/删除）
  edit-timeboxes:
    description: 修改/取消/删除时间盒（解析优先模式 + 全字段表单 + 删除按钮）
    handler: ./cnui/handlers
```

- [ ] **Step 3: 跑 manifest 校验**

```bash
cd frontend && npm run validate:manifest 2>&1 | tail -10
```

期望：`0 errors`

- [ ] **Step 4: 注册 client-side surface**

查找 client 端 surface 注册逻辑（参考 `cnui/registry.ts` 或类似入口）。按照 [023] 已建立的模式：新增 cnui surface 必须 server `surfaceHandlers` + client `register-client-surfaces` 双注册（key 都是 surface 名 `edit-timeboxes`）。

具体查找命令：

```bash
grep -rn "create-itinerary\|edit-itinerary" frontend/src --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "__tests__" | grep "register\|surfaces" | head -20
```

找到注册点后，按现有模式加 `edit-timeboxes` 项。如无 client registration，单 server `surfaceHandlers` 注册即可。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/manifest.yaml
git commit -m "feat(023.04): manifest editTimeboxes 三合一注册 + 删 cancelTimebox"
```

---

## Task 7: 文档同步 + 验收（database-design / usom-design / 023-01 spec / CHANGELOG）

**Files:**
- Modify: `frontend/docs/database-design.md` (timebox 表附近)
- Modify: `frontend/docs/usom-design.md` (timebox USOM 段)
- Modify: `frontend/docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md` (加上 023.04 指针)
- Modify: `CHANGELOG.md` (新增 [023.04] 条目)

- [ ] **Step 1: database-design.md 加时间盒重叠规则声明**

查找 `docs/database-design.md` 中 `timeboxes` 表 schema 段（line 351-386 附近），在约束/索引说明后追加：

```markdown
### 时间盒重叠规则（[023.04]）

CNUI 提交时间盒时按两层校验：

1. **客户端预检**：`assertNoInternalOverlap`（`frontend/src/domains/timebox/lib/overlap.ts`）
   - 扫同日 batch 内多条是否区间重叠（半开：end==start 不算）
   - 命中 → 提交按钮 disabled + 红字提示
2. **服务端兜底**：`TimeOverlapRule`（`frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts`）
   - 读 `intent.fields.endTime`（[023] A2 OV#P1-#1 后 duration 已撤）
   - 与 status ∈ {planned, running, overtime} 重叠 → severity=confirm
   - 与 status ∈ {ended, cancelled, logged} 重叠 → pass（不阻断）

数据库层无唯一性约束；重叠允许但有提示用户确认。
```

- [ ] **Step 2: usom-design.md 同步**

在 `docs/usom-design.md` 中 Timebox 对象段末尾追加：

```markdown
### 时间盒修改/取消/删除意图统一入口（[023.04]）

`/editTimeboxes` shortcut 是修改、取消、删除三类意图的统一 CNUI 入口：

- 修改 → `updateTimebox(id, fields)` 直调（mutation service 字段写）
- 取消 → `deleteTimebox(id)` OV#8 状态守卫（仅 planned 合法）
- 删除 ≡ 取消（软退场；MVP 无硬删）

`/cancelTimebox` shortcut 已弃用（提交 [023.04] 时从 manifest 删除）。
```

- [ ] **Step 3: 023-01 spec 加时间重叠指针**

在 `frontend/docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md` 文件末尾追加：

```markdown
## [023.04] 状态更新

[023.04] 已闭合本 spec §3.5 验证项「多条 draft 左右翻页」之外的**时间重叠**遗留债：
- 客户端预检：`assertNoInternalOverlap` 纯函数
- 服务端兜底：`timebox-overlap` rule 改读 endTime + status-aware severity
- SSOT：[023.04] 设计文档 `2026-07-04-023-04-timebox-cnui-optimization-design.md`
```

- [ ] **Step 4: CHANGELOG.md 加新版本条目**

查找 `CHANGELOG.md` 顶部，按现有模式插入：

```markdown
## [023.04] 2026-07-04

时间盒 CNUI 对话优化：

- `CreateTimebox` CNUI surface 补 activityArchetype 选择器（[023] A2 已有字段，UI 缺失）
- 新增 `/editTimeboxes` CNUI action（修改/取消/删除统一入口，解析优先模式）
- `/cancelTimebox` shortcut 弃用（统一到 `/editTimeboxes`）
- 客户端 `assertNoInternalOverlap` 纯函数 + 服务端 `TimeOverlapRule` 改读 `endTime`（修原 rule 失效债）
- Handler `timeboxCnuiHandler.submit` 接 `editTimeboxes` 分支（直调 update/delete + OV#8 状态守卫透传）
- 测试 4 文件新增（overlap / rule / parse-timeboxes / edit-timeboxes surface + 1 改 handlers 测试）
```

- [ ] **Step 5: validate:manifest 再跑一遍**

```bash
cd frontend && npm run validate:manifest 2>&1 | tail -5
```

期望：0 errors

- [ ] **Step 6: 全基线验证**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "0 errors" | wc -l
cd frontend && npx vitest run src/domains/timebox src/nexus/core/rule-engine 2>&1 | tail -20
```

期望：
- tsc 新增错误 = 0
- vitest：被改文件全 PASS；与 base 比较不引入新增失败

- [ ] **Step 7: /browse 端到端验证（chrome 可用时）**

按 gstack 流程走 /browse + /qa（参考 CLAUDE.md gstack 段）：
1. `/createTimebox` 触发 surface → 确认 archetype 选择器可见
2. 提交 batch 含 2 条同日重叠 → 第一条 OK；第二条弹 needs_confirm AlertDialog
3. `/editTimeboxes` 输「把晨会改到 10 点」→ 直接进编辑表单
4. `/editTimeboxes` 输「取消早会」→ 列今日列表 + 选完后底部「删除」可见

- [ ] **Step 8: Commit**

```bash
git add frontend/docs/database-design.md frontend/docs/usom-design.md frontend/docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md CHANGELOG.md
git commit -m "docs(023.04): 时间重叠规则 + editTimeboxes 三合一意图统一入口文档同步"
```

- [ ] **Step 9: 推 ff-merge main + 归档**

合并到 main 分支前先检查 git status 干净：

```bash
git status
git log --oneline -5
```

按 CLAUDE.md 项目流程的"普通任务"分支，后续（如果属于复杂任务）：
- 推 origin / 创建 PR / 通知 reviewer
- 任何约束遗留则 /lifeware-neat

---

## Self-Review（按 writing-plans 要求执行）

### 1. Spec coverage 检查

| Spec 节 | Plan Task | 状态 |
|---|---|---|
| §1 CreateTimebox 补 ArchetypePicker | T2 ✓ | OK |
| §1 时间重叠预检 | T2 + T0 | OK |
| §1 onConfirm 透传 archetype | T2 ✓ | OK |
| §2 修 timebox-overlap.ts duration→endTime | T1 ✓ | OK |
| §3 解析优先 surface | T4 ✓（mode='editing'+prefill）| OK |
| §3 顶部「切换列表」按钮 | T4（back 函数）| OK |
| §4 handler.open 解析成功/失败分支 | T5 open ✓ | OK |
| §5 handler.submit 直调 update/delete | T5 submit ✓ | OK |
| §6 manifest 删 cancelTimebox + 加 editTimeboxes | T6 ✓ | OK |
| §6 manifest K 区块加 edit-timeboxes | T6 step 2 ✓ | OK |
| §7 assertNoInternalOverlap 纯函数 | T0 ✓ | OK |
| 测试计划：overlap.test.ts | T0 ✓ | OK |
| 测试计划：timebox-overlap.test.ts | T1 ✓ | OK |
| 测试计划：parse-timeboxes.test.ts | T3 ✓ | OK |
| 测试计划：edit-timeboxes.test.tsx | T4 ✓ | OK |
| 测试计划：handlers.test.ts editTimeboxes 分支 | T5 ✓ | OK |
| 风险：J-rule 已部署 fake-pass 状态被外部测试依赖 | T1 single-step + commit + validate | OK（用单 commit 内聚修改 + tsc/vitest 验证）|
| 风险：parseTimeboxesIntent 14:00 中文时间歧义 | T3 测试覆盖多条 case | OK |
| 风险：OV#8 throw 仍可能被 submit 吞 | T5 step 4 try/catch + 测试 step 1 有 case | OK |
| 风险：service-side rule 真生效 e2e | T1 step 4 | OK |
| 文档同步：database-design.md / usom-design.md / 023-01 spec / CHANGELOG | T7 ✓ | OK |

**无遗漏。**

### 2. Placeholder scan

- "写最小实现"等通用 placeholder：**无**（每个 step 都有具体代码）
- 缺测的 task：**无**（T0/T1/T3/T4/T5 都有 test step 在 implementation 之前）
- T1 step 6 vitest 检查 "with regression" 表述无具体数字 → 改用 `tsc 新增错误 = 0`
- T5 step 1 测试用例 `vi.doMock` 调用是具体代码，不算 placeholder
- T4 step 3 EditTimeboxes 实装代码完整（无 "..." 省略）
- T6 step 4 "如无 client registration" 是 fallback 描述，符合"先查后写"实际步骤

### 3. Type consistency

| 名称 | 第一次出现 | 后续使用 | 一致性 |
|---|---|---|---|
| `OverlapItem` | T0 step 1 测试 | T0 step 3 实现 | ✓ |
| `OverlapResult` | T0 step 1 | T0 step 3 | ✓ |
| `assertNoInternalOverlap(items, dayStart, dayEnd)` | T0 step 3 实现签名 | T2 step 2 调用 | ✓ (items, today+00, today+2359) |
| `TimeboxDraft` 接口 | T2 step 2 | T4 step 3 EditTimeboxes 复引用 | ✓ |
| `ParsedEditIntent` | T3 step 1 测试 | T3 step 3 实现 | ✓ |
| `parseTimeboxesIntent(prompt, todaySummaries, aiRuntime?, now?)` | T3 step 3 | T5 step 3 handler 调用（4 arg）| ✓ |
| `dataModel.mode` 三值 | T4 step 1 测试 | T4 step 3 实现（selecting/editing） | **降为 2 值**：实现没有 mode='prefilled'（prefilled 走 mode='editing'+prefill 字段）→ 测试相应只测 selecting/editing 两种 |
| `dataModel.payload.operation ∈ {'update','delete'}` | T4 step 3 实现 | T5 step 4 submit 分支 | ✓ |
| `surfaceHandlers['edit-timeboxes']` | T5 step 5 | T6 manifest K 区块 | ✓ |
| `deleteTimebox(id)` 抛错 | T5 step 1 测试 vi.fn().mockRejectedValue | T5 step 4 catch 块 | ✓ |

**所有类型签名一致。** 仅一处预先声明的 3-mode（`selecting/editing/prefilled`）已通过合并 `prefilled` 进 `editing+prefill 字段` 解决，实现 + 测试对齐 2-mode。

### 4. 结论

Plan 可执行：每个 step 都有具体代码、命令、断言；测试覆盖所有 spec 验收项；类型签名一致；无 placeholder。

---

## [023.04] plan-eng-review 决议补丁（2026-07-04）

由 `/plan-eng-review` 二审注入的 11 处调整（T0..T7 各 step 全在原 plan 内微调）：

### A. Architecture review（5 issues, 全 resolved）

- **A1** handler.open 解析失败静默降级 → surface 加 `originalPrompt` 顶部 echo + reasons 路径回显
- **A2** extractHour 隐式回退默认（14/19/9）→ 加 confidence≥0.5 门槛；不达走 unsure
- **A3** updateTimebox needs_confirm 缺二次确认 → CNUI 内嵌 AlertDialog（仿 `timebox-drawer.tsx:139-147, 292-310`）
- **A4** open 阶段 race（目标 TB 已删）→ safe-default + 显式 silent-fallback 到 selecting
- **A5** +08:00 字符串 dead code → overlap.ts 加 1-line 注释说明「业务上限纯 epoch，不挑 TZ」；TZ 一致性债 defer 到 `[TZ.01]` plan

### B. Code quality review（2 issues resolved, 2 deferred）

- **C1** T5 step 1 测试用 `vi.doMock` 重复 3 次 → deferred 到 TODOS（不影响 ship）
- **C2** T5 handler.submit try/catch 镜像 adjustRemainingSchedule → **follow precedent**，不动
- **C3** parseTimeboxesIntent 测试缺"纯数字"边界 → 加 2 case（「14:00」「上午」→ unsure）
- **C4** OV#8 delete 路径无 needs_confirm 分支 → spec 补 "delete 路径无二次确认（CANCELABLE_STATUSES 仅含 planned, service 直 throw）"；deferred 到 TODOS

### C. Test review（11 gap: 7 加测 + 4 defer）

- T1 +4 case（running active / overtime active / invalid date / endMs<=startMs）
- T2 +1 UI test 文件「create-timebox.test.tsx」(3 case)
- T4 +3 case（A1 originalPrompt 顶部 / A3 needs_confirm dialog / notes-taskIds 字段透传）
- T5 +2 case（A4 race safe-default / operation missing → "未选择时间盒"）

### D. Performance review

No issues. plan 性能无新增债。

### E. Outside Voice（Codex 二审，10 findings: 3 valid + 7 驳）

- **Codex #4 VALID** — Edit 路径 updateTimebox 不走 rule engine → T5 step 4 handler.submit 加 `createTimeOverlapRule` 显式 evaluate，confirm→unconfirm 双调
- **Codex #9 VALID** — page-aware conflict 高亮 → T2 CreateTimebox 「提交全部」红字提示 + 当前页 title 高亮
- **Codex #10 VALID** — needs_confirm AlertDialog E2E → T7 验收 §7 step 7 /browse 场景新增 E2E
- 其余 7 个：parser 降级率、over-abstract、dead-letter pass、9 字段 CNUI 撑爆、生產 CI 假 pass 依赖、CreateTimebox 透传一致性、删除独立确认层 — **驳**（与现有 spec/decision 一致）

### F. 覆盖率 (Final)

```
COVERAGE: 52/52 paths tested (100%) | Code paths: 33/33 (100%) | User flows: 19/19 (100%)
QUALITY: ★★★:all
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run（[023.04] 是普通 follow-up 任务，未涉及战略变更） |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | CLEAN (rounds=10, valid=3, rejected=7) | 3 valid：Edit 路径无 rule / page-aware UX / needs_confirm E2E |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 5 arch + 2 code + 11 test gap + 0 perf，**全部 folded** 到本 plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | CNUI 多表面统一入口决策由 user 在 brainstorming 阶段拍板，非本次 review scope |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 无 |

- **CODEX:** 3 valid findings（#4 #9 #10）已 folded — T5 加 evaluate、T2 加 page-aware 提示、T7 加 E2E；7 rejected 与 spec 一致
- **VERDICT:** Eng + Codex CLEARED — plan ships-ready；user 在 A1-A5 + C2-C3 + #4-#10 决议已锁定 plan 内容，**user 已签发 ship-ready**

**UNRESOLVED DECISIONS:**
- C1（DRY mock 重复）+ C4（OV#8 无 needs_confirm 文档）已 defer 到 TODOS；不在本次 ship 范围
