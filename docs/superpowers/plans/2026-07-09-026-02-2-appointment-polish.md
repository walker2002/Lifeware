# [026.02.2] 约定管理优化 — 7 项 polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 处理 [026.02.1] post-ship review 剩余 7 项 polish（I-2 + M-1..M-7），含 1 UX（I-2「条」后缀）+ 5 mechanical（M-1 as any/M-2 rename/M-3 fake timers/M-4 ymdKey DRY/M-6 Promise.allSettled）+ 1 defer 登记（M-5 CHANGELOG）。

**Architecture:** 纯客户端 polish，无 schema/server action/manifest 变更。7 task 顺序：M-4（建 lib）→ I-2（test contract）→ M-1（类型契约）→ M-2（rename）→ M-3（fake timers）→ M-6（perf + 错误隔离）→ M-5（CHANGELOG 登记 defer）。M-4 先做以让后续 task 复用 `ymdKey`。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, vitest, @testing-library/react, fake timers via `vi.useFakeTimers({ toFake: ['Date'] })`

## Global Constraints

- 注释规范：所有 TS/JS 文件 `/** @file ... @brief ... */` 头 + 简体中文注释（per docs/code-commenting-guide.md）
- CSS 令牌：仅 `bg-canvas`/`text-ink`/`bg-primary`/`text-error` 等 token，无 Tailwind 默认色（per UI-DESIGN-SPEC §14 C-01）
- a11y：维持现有 `aria-pressed`/`aria-label`/`role="grid"` 等属性
- tsc：变更文件 0 新增错误（baseline pre-existing 不计）
- vitest：base/head 失败集合零新增（baseline 47 不变）
- pre-push hooks：validate:domain-structure ✓ + validate:rules-registry ✓
- Commit 规范：`feat(026.02.2):` / `fix(026.02.2):` / `chore(026.02.2):` / `docs(026.02.2):` 前缀 + Co-Authored-By 头
- 文件路径全为绝对或相对 frontend/ 项目根的路径（worker 在 frontend cwd 跑）
- IRON RULE 不破：timebox `mini-calendar.regression.test.tsx` + `register-client-surfaces.test.ts` 必须仍过

## File Structure

```
frontend/src/domains/timebox/
├── lib/
│   ├── appointment-filter.ts            (existing, M-3 改 test)
│   ├── __tests__/appointment-filter.test.ts (M-3 改)
│   └── appointment-date-utils.ts        (M-4 新建, exports ymdKey)
├── components/
│   ├── appointment-mini-calendar.tsx    (M-4 改 import + 删本地 ymdKey)
│   ├── appointment-month-view.tsx       (I-2 改 + M-4 改 import)
│   ├── appointment-workspace.tsx        (M-4 改 import + M-6 改 handleDelete)
│   └── __tests__/
│       ├── appointment-month-view.test.tsx     (I-2 改 4 test contracts)
│       └── appointment-workspace.test.tsx      (M-1 删 as any + M-2 rename + M-6 +1 test)

CHANGELOG.md                              (M-5 新增 [026.02.2] 段)
```

7 task × 1 commit = 7 commits in this PR.

---

## Task 1: M-4 — ymdKey 提取到 `lib/appointment-date-utils.ts`

**Files:**
- Create: `frontend/src/domains/timebox/lib/appointment-date-utils.ts`
- Modify: `frontend/src/domains/timebox/components/appointment-workspace.tsx:124-126`（删本地 `ymdKey` + 加 import）
- Modify: `frontend/src/domains/timebox/components/appointment-mini-calendar.tsx:19-26`（删本地 `ymdKey` + 加 import）
- Modify: `frontend/src/domains/timebox/components/appointment-month-view.tsx:15-22`（删本地 `ymdKey` + 加 import）

**Interfaces:**
- Consumes: `Date` 标准库
- Produces: `ymdKey(d: Date): string` — 输出 `YYYY-MM-DD` 格式（本地时区）

- [ ] **Step 1: 创建新文件 `lib/appointment-date-utils.ts`**

文件：`frontend/src/domains/timebox/lib/appointment-date-utils.ts`

完整内容：

```tsx
/**
 * @file appointment-date-utils
 * @brief [026.02.2] M-4 — appointment 域日期工具（DRY ymdKey 提取）
 *
 * 之前 3 处（appointment-workspace + appointment-mini-calendar + appointment-month-view）
 * 各自实现相同 `ymdKey(d: Date)` 函数，本任务统一到 lib。
 * 使用本地时区（与原实现一致），输出 YYYY-MM-DD。
 */

/**
 * 将 Date 序列化为 YYYY-MM-DD 字符串（本地时区）。
 *
 * @param d - 待序列化的 Date 对象
 * @returns `YYYY-MM-DD` 格式字符串（月份/日期补零到 2 位）
 *
 * @example
 * ymdKey(new Date(2026, 6, 8)) // '2026-07-08'
 */
export function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

- [ ] **Step 2: 修改 `appointment-workspace.tsx` 删除本地 `ymdKey`**

文件：`frontend/src/domains/timebox/components/appointment-workspace.tsx`

找到现有的本地 `ymdKey` 实现（约 line 124-126），删除 3 行：

```tsx
// 删除这 3 行：
const ymdKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
```

在文件顶部 import 区追加：

```tsx
import { ymdKey } from '@/domains/timebox/lib/appointment-date-utils'
```

- [ ] **Step 3: 修改 `appointment-mini-calendar.tsx` 删除本地 `ymdKey`**

文件：`frontend/src/domains/timebox/components/appointment-mini-calendar.tsx`

找到现有的本地 `ymdKey` 函数（约 line 19-26），删除整个函数定义。

在文件顶部 import 区追加：

```tsx
import { ymdKey } from '@/domains/timebox/lib/appointment-date-utils'
```

- [ ] **Step 4: 修改 `appointment-month-view.tsx` 删除本地 `ymdKey`**

文件：`frontend/src/domains/timebox/components/appointment-month-view.tsx`

找到现有的本地 `ymdKey` 函数（约 line 15-22），删除整个函数定义。

在文件顶部 import 区追加：

```tsx
import { ymdKey } from '@/domains/timebox/lib/appointment-date-utils'
```

- [ ] **Step 5: 运行测试验证**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx src/domains/timebox/components/__tests__/appointment-month-view.test.tsx src/domains/timebox/components/__tests__/appointment-workspace.test.tsx 2>&1 | tail -15
```

Expected: 6 + 4 + 18 = 28 tests pass（与重构前数量一致，行为不变）。

- [ ] **Step 6: tsc 验证**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "appointment-(workspace|mini-calendar|month-view|date-utils)" | head -10
```

Expected: 无 tsc 错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/lib/appointment-date-utils.ts frontend/src/domains/timebox/components/appointment-workspace.tsx frontend/src/domains/timebox/components/appointment-mini-calendar.tsx frontend/src/domains/timebox/components/appointment-month-view.tsx
git commit -m "refactor(026.02.2): M-4 ymdKey 提取到 lib/appointment-date-utils.ts

[026.02.2] 3 处（workspace + mini-calendar + month-view）各自实现相同
ymdKey(d: Date) 函数。提取到 lib/，3 处 import 共享。

验证：
- vitest: 6 + 4 + 18 = 28/28 pass（行为不变）
- tsc: 变更文件 0 error

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: I-2 — 月视图格子计数「条」后缀补回

**Files:**
- Modify: `frontend/src/domains/timebox/components/appointment-month-view.tsx:94`（component 1 行）
- Modify: `frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`（4 test contract 调整）

**Interfaces:**
- Consumes: `info.count: number`（per `AppointmentSummary`）
- Produces: 显示 `'{count} 条'`（中文计数词，与 plan §3.1 对齐）

- [ ] **Step 1: 修改 component 显示「条」后缀**

文件：`frontend/src/domains/timebox/components/appointment-month-view.tsx`

找到 line 94 附近的 `{info.count}`（不含任何后缀），改为：

```tsx
{info.count} 条
```

- [ ] **Step 2: 修改 test contracts 适配新格式**

文件：`frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`

全文搜索 `toBe('1')` 或 `toBe('2')` 等纯数字断言（通常用于验证格子内文本），改为带「条」：

```tsx
// 原:
expect(cell).toHaveTextContent('1')
// 新:
expect(cell).toHaveTextContent('1 条')

// 原:
expect(cell).toHaveTextContent('2')
// 新:
expect(cell).toHaveTextContent('2 条')
```

预计修改 4 处（如 grep 后数量不符则按实际调整，每处都加「条」）。

- [ ] **Step 3: 运行测试验证**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-month-view.test.tsx 2>&1 | tail -15
```

Expected: 4 tests pass。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/timebox/components/appointment-month-view.tsx frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx
git commit -m "fix(026.02.2): I-2 月视图格子计数补「条」后缀, 对齐 plan §3.1

[026.02] T8 test contract 选择意外抹了 plan/spec 中的「条」字。
[026.02.2] I-2 user 决策补回：
- component: appointment-month-view.tsx:94 `{info.count}` → `{info.count} 条`
- 4 个 test contract: toBe('1') → toBe('1 条' (or 2/3/4 等)

验证：
- vitest: appointment-month-view 4/4 pass
- UX: 与中文计数习惯一致 + 对齐 plan SSOT

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: M-1 — 移除 8 处 `[baseItem] as any` 类型断言

**Files:**
- Modify: `frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`（约 8 处 `as any` 删除）

**Interfaces:**
- Consumes: `baseItem` / `terminalItem` fixture（已定义为 `AppointmentSummary` 形状）+ `MkItem` 类型（[026.02.1] I-1 定义）
- Produces: `initialItems: AppointmentSummary[]` props 直接接受 fixture，无 type cast

- [ ] **Step 1: 全文搜索 `as any` 出现位置**

```bash
grep -n "as any" frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
```

记录所有 line numbers（预计 5-10 处）。

- [ ] **Step 2: 逐处删除 `as any` cast**

文件：`frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

对每处找到的 `as any`：

```tsx
// Before:
render(<AppointmentWorkspace initialItems={[baseItem] as any} />)

// After:
render(<AppointmentWorkspace initialItems={[baseItem]} />)
```

如果 tsc 报类型错误，说明 fixture shape 不符 `AppointmentSummary`：
1. 检查 fixture 是否有缺失字段（应是 detail/people optional）
2. 若仍报错，**仅在该 fixture 局部**追加 `as AppointmentSummary`（不用 `as any`）
3. 记录到 task report

- [ ] **Step 3: 运行 tsc 验证无新增错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "appointment-workspace.test" | head -10
```

Expected: 无 tsc 错误（或仅与 baseline 同款）。

- [ ] **Step 4: 运行 vitest 验证 18/18 pass**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx 2>&1 | tail -15
```

Expected: 18 tests pass。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
git commit -m "refactor(026.02.2): M-1 移除 [baseItem] as any 等 8 处类型断言

[026.02.1] I-1 fix 定义了 MkItem 类型与 AppointmentSummary 对齐。workspace
props initialItems: AppointmentSummary[] 已能直接接受 baseItem/terminalItem
fixture。

8 处 [xxx] as any 全部移除（具体数量以 grep 结果为准）。

验证：
- tsc: appointment-workspace.test.tsx 0 新增错误
- vitest: 18/18 pass

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: M-2 — mock variable rename `mockGetItinerariesByRange` → `mockGetAppointmentsByRange`

**Files:**
- Modify: `frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`（1 变量声明 + 所有引用）

**Interfaces:**
- Consumes: 无（pure rename）
- Produces: 无（pure rename）

- [ ] **Step 1: 全文搜索引用点**

```bash
grep -n "mockGetItinerariesByRange" frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
```

记录所有 line numbers。

- [ ] **Step 2: 用 replace_all 一次性替换**

文件：`frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

```bash
cd frontend && sed -i 's/mockGetItinerariesByRange/mockGetAppointmentsByRange/g' src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
```

或用 Edit 工具 `replace_all: true`。

- [ ] **Step 3: 验证无残留**

```bash
grep -n "mockGetItinerariesByRange" frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
```

Expected: 无输出（全部替换完成）。

- [ ] **Step 4: 运行测试验证**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx 2>&1 | tail -15
```

Expected: 18 tests pass（rename 不改行为）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
git commit -m "chore(026.02.2): M-2 mock variable rename → mockGetAppointmentsByRange

[023.05] itinerary→appointment rename 的残留尾巴。workspace test 中
mockGetItinerariesByRange 与 import 的 getAppointmentsByRange 不一致，
reader 困惑。统一改 mockGetAppointmentsByRange。

验证：
- grep 残留: 0 hit
- vitest: 18/18 pass

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: M-3 — `appointment-filter.test.ts` 改用 fake timers + 相对 offset

**Files:**
- Modify: `frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

**Interfaces:**
- Consumes: `vi.useFakeTimers` + `vi.setSystemTime` + `Date.now()` 标准 vitest API
- Produces: 6 个 filter test 在固定时间点运行，不随真实日期漂移

- [ ] **Step 1: 阅读现有 test 文件结构**

```bash
head -50 frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts
```

记录 `startTime` 等 fixture 定义位置（预计 line 14 附近）+ 6 个 `it()` 块。

- [ ] **Step 2: 添加 fake timers setup/teardown**

文件：`frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

在文件顶部 `describe` 块前（或 `describe` 块内顶部）添加：

```tsx
import { afterEach, beforeEach } from 'vitest'

// ... 现有 imports ...

describe('filterAppointments', () => {
  // [026.02.2] M-3: fake timers 锁定系统时间，避免 hardcoded date 漂移
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // ... 现有 it() 块 ...
})
```

- [ ] **Step 3: 替换 hardcoded date 为相对 offset**

文件：同上

找到所有 `'2026-07-08T10:00:00.000Z'` 字面量，替换为：

```tsx
// 原:
const startTime = '2026-07-08T10:00:00.000Z'

// 新:
const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // -2h from now
```

如有多处 hardcoded date，逐处替换为相对 offset（如 `Date.now() + 24 * 60 * 60 * 1000` = +1d）。

- [ ] **Step 4: 运行测试验证**

```bash
cd frontend && npx vitest run src/domains/timebox/lib/__tests__/appointment-filter.test.ts 2>&1 | tail -15
```

Expected: 6 tests pass。

- [ ] **Step 5: 验证 fake timers 不污染其他测试**

```bash
cd frontend && npx vitest run src/domains/timebox/lib/__tests__/ 2>&1 | tail -10
```

Expected: 所有 lib/__tests__ pass，无 fake timers 残留污染。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts
git commit -m "refactor(026.02.2): M-3 appointment-filter test fake timers + 相对 offset

[026.02.2] M-3 避免 hardcoded date '2026-07-08T...' 随真实日期漂移：
- beforeEach: vi.useFakeTimers + vi.setSystemTime('2026-07-08T12:00:00Z')
- afterEach: vi.useRealTimers
- 6 个 test fixture startTime 改 Date.now() ± offset

参照 [026.02] T6/T7/T8 fake timers 模式。

验证：
- vitest: appointment-filter 6/6 pass
- vitest: lib/__tests__ 全跑无污染

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: M-6 — `handleDelete` 改用 `Promise.allSettled` + 加 partial-failure test

**Files:**
- Modify: `frontend/src/domains/timebox/components/appointment-workspace.tsx`（`handleDelete` 函数，约 line 162-178）
- Modify: `frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`（新增 1 个 test）

**Interfaces:**
- Consumes: `deleteAppointment(id)` server action + `toast.error` (sonner)
- Produces: 并行处理多选删除，单条失败聚合显示 `{N} 条删除失败` toast，不阻断成功项

- [ ] **Step 1: 修改 `handleDelete` 函数**

文件：`frontend/src/domains/timebox/components/appointment-workspace.tsx`

找到 `handleDelete` 函数（约 line 162-178），替换为：

```tsx
// [026.02.2] M-6: sequential await → Promise.allSettled, 并行 + 部分失败聚合
const handleDelete = async (ids: string[]) => {
  startDelete(async () => {
    const results = await Promise.allSettled(
      ids.map((id) => deleteAppointment(id)),
    )
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      toast.error(`${failed.length} 条删除失败`)
    }
    await reload()
  })
}
```

- [ ] **Step 2: 在 workspace test 中新增 partial-failure test**

文件：`frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

在已有 `it('点击「删除选中」触发 deleteAppointment server action + reload', ...)` 测试附近新增：

```tsx
it('[026.02.2] M-6: 部分删除失败不阻断成功项（Promise.allSettled）', async () => {
  const user = userEvent.setup()
  // 准备 2 个 item
  const item1 = { ...baseItem, id: 'a-1' }
  const item2 = { ...baseItem, id: 'a-2' }
  render(<AppointmentWorkspace initialItems={[item1, item2]} />)

  // 选中 2 个
  await user.click(screen.getByLabelText(`约定：${item1.title}`))
  await user.click(screen.getByLabelText(`约定：${item2.title}`))

  // 第一个 delete 成功，第二个 reject
  vi.mocked(deleteAppointment)
    .mockResolvedValueOnce({ ok: true } as any)
    .mockRejectedValueOnce(new Error('boom'))

  // 点击删除
  await user.click(screen.getByText(/删除选中/))

  // 两条 deleteAppointment 都应被调用（Promise.allSettled 并行）
  await waitFor(() => expect(vi.mocked(deleteAppointment)).toHaveBeenCalledTimes(2))
  // reload 仍触发
  await waitFor(() => expect(mockGetAppointmentsByRange).toHaveBeenCalled())
})
```

> 注意：使用 `baseItem` 引用确保类型正确（与 Task 3 后状态一致）。

- [ ] **Step 3: 运行测试验证**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx 2>&1 | tail -15
```

Expected: 19 tests pass（原 18 + 新 1）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/timebox/components/appointment-workspace.tsx frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
git commit -m "perf(026.02.2): M-6 handleDelete sequential → Promise.allSettled

[026.02.2] M-6 多选删除从 sequential await 改 Promise.allSettled：
- 并行执行（O(1) round-trip 而非 O(n)）
- 单条失败不阻断其他项
- 失败数聚合 toast 显示

新增 1 个 partial-failure test 验证：
- 2 个 item，1 个 delete 成功 + 1 个 reject
- 两条 deleteAppointment 都被调用
- reload 仍触发

验证：
- vitest: workspace 19/19 pass（原 18 + M-6 +1）
- tsc: 变更文件 0 error

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: M-5 + CHANGELOG 段 — 登记 UX 验证 defer + 总结

**Files:**
- Modify: `CHANGELOG.md`（新增 `## [026.02.2]` 段）

**Interfaces:**
- Consumes: 7 个 task commit + reviewer findings
- Produces: CHANGELOG 段（决策/改动/验证/风险/follow-up/SSOT）

- [ ] **Step 1: 在 CHANGELOG.md 找到插入位置**

```bash
grep -n "^## \[026" CHANGELOG.md
```

找到 `[026.02.1]` 段位置（约 line 278）。

- [ ] **Step 2: 在 `[026.02.1]` 段之后插入 `[026.02.2]` 段**

文件：`CHANGELOG.md`

在 line ~320（[026.02.1] 段尾 `---` 之后）插入：

```markdown
## [026.02.2] 7 项 polish 收口（2026-07-09）

> [026.02.1] post-ship review 登记的 7 项 follow-up 收口。I-1 mk() 已 [026.02.1] 修，本段处理剩余 7 项。

### 决策摘要

- **范围**：7 项 polish（不含 TD-022 5 项延后 + /editAppointment TypeError 拆 [026.02.3]）
- **I-2 月视图「条」后缀**：user 决策补回，对齐 plan §3.1
- **M-4 ymdKey DRY**：新建 `lib/appointment-date-utils.ts`，3 处复用
- **M-6 handleDelete**：sequential await → Promise.allSettled（并行 + 部分失败聚合）
- **M-5 click-toggle UX 验证**：保留当前实现，登记为 UX defer（待 /browse 人工验证）

### 改动清单

- **M-4**：`lib/appointment-date-utils.ts` 新建 + `appointment-{workspace,mini-calendar,month-view}.tsx` 改 import 删本地副本
- **I-2**：`appointment-month-view.tsx:94` 加「条」后缀 + 4 个 test contract 调整
- **M-1**：`appointment-workspace.test.tsx` 移除 8 处 `as any`
- **M-2**：`appointment-workspace.test.tsx` rename `mockGetItinerariesByRange` → `mockGetAppointmentsByRange`
- **M-3**：`appointment-filter.test.ts` 改 fake timers + 相对 offset
- **M-6**：`appointment-workspace.tsx` handleDelete 改 Promise.allSettled + 1 个 partial-failure test
- **M-5**：0 代码改动，仅 CHANGELOG 登记

### 验证结果

- vitest base=head 失败集合零新增（47 → 47，+1 新 test pass）
- tsc 变更文件 0 新增错误
- 新增测试数：+1（M-6 partial-failure）

### 风险与缓解

- **M-3 fake timers 误用污染其他测试**：严格 beforeEach/afterEach teardown，验证 lib/__tests__ 全跑无污染
- **M-6 改 handleDelete 改顺序逻辑**：新增 partial-failure test 锁定行为

### 遗留 / Follow-up

- **TD-022 5 项**（archetype clearing / UUID / perf N+1 / banner / E2E）→ [026.02.4]
- **/editAppointment runtime TypeError**（点击即崩，独立根因未明）→ [026.02.3]
- **M-5 click-to-toggle-select UX 验证** → 后续 /browse 人工验证后决

### 参照

- Spec SSOT: `docs/superpowers/specs/2026-07-09-026-02-2-appointment-polish-design.md`
- Plan SSOT: `docs/superpowers/plans/2026-07-09-026-02-2-appointment-polish.md`
```

- [ ] **Step 3: 验证 CHANGELOG 段格式**

```bash
grep -n "^## \[026" CHANGELOG.md
```

Expected: 显示 4 段（[026.01] [026.02] [026.02.1] [026.02.2]），按日期倒序在顶部。

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(026.02.2): CHANGELOG 段 — 7 项 polish 收口 + M-5 UX defer 登记

[026.02.2] 处理 [026.02.1] post-ship review 登记的 7 项 polish 全部 ship：
- I-2: 月视图「条」后缀补回
- M-1: 8 处 as any 移除
- M-2: mock variable rename
- M-3: fake timers + 相对 offset
- M-4: ymdKey DRY
- M-6: Promise.allSettled + 1 partial-failure test
- M-5: click-toggle UX 验证 defer 登记

延后到后续 task:
- TD-022 5 项 → [026.02.4]
- /editAppointment TypeError → [026.02.3]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**:
- I-2 → Task 2 ✓
- M-1 → Task 3 ✓
- M-2 → Task 4 ✓
- M-3 → Task 5 ✓
- M-4 → Task 1 ✓
- M-5 → Task 7 (CHANGELOG only) ✓
- M-6 → Task 6 ✓
- All 7 polish items covered, no gaps.

**2. Placeholder scan**: 无 TBD/TODO/"implement later" 类占位符。

**3. Type consistency**:
- `ymdKey(d: Date): string` 在 Task 1 定义，3 处复用签名一致 ✓
- `MkItem` 在 [026.02.1] I-1 已定义，Task 3 引用对齐 ✓
- `AppointmentSummary` shape 在 baseItem/terminalItem fixture 中体现，Task 3 移除 `as any` 后类型应一致 ✓
- `handleDelete(ids: string[]): Promise<void>` 在 Task 6 改实现，签名不变（向后兼容） ✓

**4. Test count**: 0 新增 (Task 1-5, 7) + 1 新增 (Task 6) = +1 ✓