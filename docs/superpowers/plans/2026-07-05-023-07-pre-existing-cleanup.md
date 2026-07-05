# [023.07] 时间盒域 pre-existing bug 清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修两个 timebox 域 pre-existing bug：#5 logTimebox 重复 filter（dedupe by id）+ #3 generateProposals 谓词不一致 livelock（统一 findOccupyingSlot 为重叠语义 + 动态 iteration bound 作 defense-in-depth），为 [023.08] 修 #1 createSmartTimeboxes stub 解锁。

**Architecture:** 2 任务串行（T1 fast win → T2 root cause + 安全网），1 PR / 2 commits，每 commit 独立 revertible。T1 在 CNUI handler 层加 dedupe；T2 在 orchestration-handler 改 `findOccupyingSlot` 谓词、改 `generateProposals` 返回 shape 为 `{ proposals, warnings }` 并加 bound、改 `handle()` 合并 warnings。两任务都走 TDD（failing test → impl → pass），跳过 /browse（pure-function 修复，单测覆盖足够）。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Vitest, Drizzle 0.45.1。

## 全局约束

- **TDD 强约束**：每个 task 先写失败测试 → 实现 → 通过。
- **commit 频率**：每个 task 末尾一次 commit；commit message 用 `fix(023.07): ...` 前缀。
- **中文注释**：所有注释用简体中文；改动的 TS 文件保留/更新 `/** @file ... @brief ... */` 文件头。
- **测试基线**：本次开始时 `vitest` 已知 flake 1 个（[025] PG 集成 flake，pre-existing）；改动后用 base/head 失败集合对比（聚焦被改文件），不许新增无关失败。
- **TS 严格**：所有改动跑 `npx tsc --noEmit` 零新增错误。
- **跑测试 cwd**：必须在 `frontend/` 下（`@/` 映射），仓库根跑会假失败（参 [[feedback_vitest-pitfalls]]）。
- **CHANGELOG**：本任务 runtime-only，按宪章 v2.1.1 不产生 CHANGELOG 条目（与 [023.06] 同模式）。
- **manifest 不动**：本任务不新增/重命名 action，**不触发 C-1 风格四联审计**。
- **不在范围**（defer 项目的硬边界，implementer 不可越界）：
  - #1 createSmartTimeboxes stub → 独立 [023.08]（4 层架构债：aiRuntime 不可达 / ISO 时间 / overlap rule / undo 框架）
  - #2 editTimeboxes TOCTOU / #4 batch failure UI / #6 MVP_USER_ID 硬码 / #7 N+1 writes — 全 defer P1
- **#3 谓词统一后必须保持 `detectConflicts`（orchestration-handler.ts:301）仍用重叠语义** `pStart < tEnd && pEnd > tStart`，既有 detection 不能破。

---

## 文件结构总览

| 类型 | 路径 | 职责 |
|---|---|---|
| **修改** | `frontend/src/domains/timebox/cnui/handlers.ts` (line 142-150) | T1：logTimebox open 分支加 dedupe（按 t.id 保留首次出现） |
| **修改** | `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` | T1：新增 dedupe 用例（mock `getTodayTimeboxes` 返重复 id） |
| **修改** | `frontend/src/domains/timebox/handlers/orchestration-handler.ts` (line 219-280, 387-416, 92-108) | T2：(a) `findOccupyingSlot` 加 durationMinutes 参数 + 改重叠语义；(b) `generateProposals` 加 bound + 返 `{ proposals, warnings }`；(c) `handle()` 合并 warnings |
| **新建** | `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts` | T2：谓词一致性 unit test + bound 不 hang 集成 test + bound warning spy test |

---

## Task 1: #5 logTimebox 重复 filter dedupe

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts` (line 142-150, logTimebox open 分支)
- Modify: `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` (新增 dedupe 用例)

**Interfaces:**
- Consumes: `getTodayTimeboxes()`（既有 server action，返当日 timebox 列表，可能含 SM 重复推进导致的同 id 副本）
- Produces: `dataSnapshot.items`（logTimebox surface 的 open 数据快照）dedupe by id — 同 id 只保留首次出现项，UI 不再显示重复卡片，submit 不再走重复 `logTimebox` 导致第二次 SM 拒绝。

**背景**：当前 `cnui/handlers.ts:142-150` 直接 `todayBoxes.filter(t => t.status === 'ended').map(...)`，无 dedupe。若 SM reconcile 或时区边界导致同一 ended timebox 在 `getTodayTimeboxes()` 返回中出现两次，UI 显示两张相同卡片，submit 时同一 id 走两次 `submitDynamicIntent('logTimebox')`，第二次 SM 拒绝（已 transitioned）返失败 → 用户看到幽灵错误。

- [ ] **Step 1: 写失败测试 — 重复 id 的 ended timebox 被 dedupe**

**先核对 mock 路径**：`getTodayTimeboxes()`（`cnui/handlers.ts:38-48`）内部 `new TimeboxRepository().findByDateRange(...)`，既有 `cnui/__tests__/handlers.test.ts` 顶部已 `vi.mock('@/domains/timebox/repository', ...)` mock `TimeboxRepository` class（`findByDateRange` 返固定 1 条 planned 'timebox-1'，**无 ended 状态、无 logTimebox open 既有测试**）。本测试用 `vi.spyOn(TimeboxRepository.prototype, 'findByDateRange')` 在 test 内覆写返回值（零侵入既有 mock，test 末 `mockRestore`）。

追加进 `cnui/__tests__/handlers.test.ts`（文件末尾，外层 `describe('timeboxCnuiHandler', ...)` 内或新顶层 describe 皆可；与既有 [023-01+]/[023.04] 测试同文件）：

```typescript
import { TimeboxRepository } from '@/domains/timebox/repository'  // 若文件顶部未 import 则加（mock 已存在，只需类型 import）

// [023.07] #5 — logTimebox open 分支必须 dedupe by id（SM 重复推进或时区边界可能让
// getTodayTimeboxes() 返回同 id 副本，导致 UI 重复卡片 + submit 幽灵错误）
describe('open - logTimebox（[023.07] #5 dedupe）', () => {
  it('重复 id 的 ended timebox 应被 dedupe（保留首次出现）', async () => {
    // 覆写既有 mock 的 findByDateRange，返包含重复 id 的 ended 列表
    const spy = vi.spyOn(TimeboxRepository.prototype, 'findByDateRange').mockResolvedValue([
      {
        id: 'ended-1',
        title: '晨会',
        startTime: '2026-07-05T06:00:00Z',
        endTime: '2026-07-05T07:00:00Z',
        status: 'ended',
        taskIds: [],
        habitIds: [],
      },
      {
        id: 'ended-2',
        title: '代码审查',
        startTime: '2026-07-05T08:00:00Z',
        endTime: '2026-07-05T09:00:00Z',
        status: 'ended',
        taskIds: [],
        habitIds: [],
      },
      // 重复项：同 id 'ended-1'（SM reconcile 副本）
      {
        id: 'ended-1',
        title: '晨会',
        startTime: '2026-07-05T06:00:00Z',
        endTime: '2026-07-05T07:00:00Z',
        status: 'ended',
        taskIds: [],
        habitIds: [],
      },
    ])

    const result = await timeboxCnuiHandler.open({
      surface: 'logTimebox',
      intentFields: {},
    })

    const items = (result.dataSnapshot as { items: Array<{ id: string }> }).items
    const ids = items.map(i => i.id)
    // 核心断言：ended-1 只出现一次（dedupe 生效）
    expect(ids.filter(id => id === 'ended-1')).toHaveLength(1)
    // 总数 = 2（ended-1 + ended-2），不是 3
    expect(items).toHaveLength(2)

    spy.mockRestore()
  })

  it('无重复时保持原行为（ended 全保留）', async () => {
    const spy = vi.spyOn(TimeboxRepository.prototype, 'findByDateRange').mockResolvedValue([
      { id: 'ended-1', title: '晨会', startTime: '2026-07-05T06:00:00Z', endTime: '2026-07-05T07:00:00Z', status: 'ended', taskIds: [], habitIds: [] },
      { id: 'ended-2', title: '代码审查', startTime: '2026-07-05T08:00:00Z', endTime: '2026-07-05T09:00:00Z', status: 'ended', taskIds: [], habitIds: [] },
    ])

    const result = await timeboxCnuiHandler.open({ surface: 'logTimebox', intentFields: {} })
    const items = (result.dataSnapshot as { items: Array<{ id: string }> }).items
    expect(items).toHaveLength(2)

    spy.mockRestore()
  })
})
```

> **`vi` import**：文件顶部既有 `import { describe, it, expect, beforeEach, vi } from 'vitest'` 已含 `vi`（[023-01+] mock 用过），无需再加。
>
> **`TimeboxRepository` import**：既有 `vi.mock('@/domains/timebox/repository', ...)` 走的是字符串路径，不要求顶部有值 import；但 `vi.spyOn(TimeboxRepository.prototype, ...)` 需要类引用 — 若顶部未 import，加 `import { TimeboxRepository } from '@/domains/timebox/repository'`（在 `vi.mock` 之后生效，vitest 会用 mocked 版本）。

- [ ] **Step 2: 跑测试看失败**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts -t "重复 id 的 ended timebox 应被 dedupe"
```

期望：FAIL — `expect(ids.filter(id => id === 'ended-1')).toHaveLength(1)` 实际收到 2（当前无 dedupe，重复 id 都进 items）。

- [ ] **Step 3: 实现 dedupe**

修改 `cnui/handlers.ts` line 142-143 区域。把：

```typescript
if (action === 'logTimebox') {
  const todayBoxes = await getTodayTimeboxes()
  const ended = todayBoxes.filter(t => t.status === 'ended')
  const targetId = (intentFields?.targetId as string | undefined) ?? null
  const items = ended.map(t => ({
    id: t.id,
    title: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
  }))
```

改为：

```typescript
if (action === 'logTimebox') {
  const todayBoxes = await getTodayTimeboxes()
  // [023.07] #5 — dedupe by id：SM 重复推进（reconcile）或时区边界可能让
  // getTodayTimeboxes() 返回同 id 副本，UI 会显示重复卡片 + submit 走两次导致
  // 第二次 SM 拒绝返幽灵错误。按 id 保留首次出现项。
  const seenIds = new Set<string>()
  const ended = todayBoxes.filter(t => t.status === 'ended' && !seenIds.has(t.id) && seenIds.add(t.id))
  const targetId = (intentFields?.targetId as string | undefined) ?? null
  const items = ended.map(t => ({
    id: t.id,
    title: t.title,
    startTime: t.startTime,
    endTime: t.endTime,
  }))
```

> **关于 `!seenIds.has(t.id) && seenIds.add(t.id)` 惯用法**：`Set.add` 返回 `Set`（truthy），`&&` 短路保证首次出现时（`has` 为 false）执行 `add` 并整体为 true（保留该项），重复出现时（`has` 为 true）短路为 false（过滤掉）。这是单行 dedupe 的标准模式。**若 reviewer 觉得不够清晰，可改为显式 helper**：
> ```typescript
> const seenIds = new Set<string>()
> const ended = todayBoxes.filter(t => {
>   if (t.status !== 'ended') return false
>   if (seenIds.has(t.id)) return false
>   seenIds.add(t.id)
>   return true
> })
> ```
> **plan 倾向用显式 helper 版本**（更易读，符合「match existing style」— 该文件其他 filter 都用显式 predicate）。

- [ ] **Step 4: 跑测试看通过**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts
```

期望：PASS（新测试通过 + 既有 logTimebox 测试不回归）。

- [ ] **Step 5: 全量回归 + tsc**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -30
cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -20
```

期望：vitest 失败集合与 base 一致（仅 pre-existing [025] flake，无新增）；tsc 零新增错误。

- [ ] **Step 6: 提交**

```bash
cd /home/walker/lifeware && git add frontend/src/domains/timebox/cnui/handlers.ts frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts
git commit -m "fix(023.07): dedupe logTimebox items by id (was showing duplicate cards + ghost submit error)"
```

---

## Task 2: #3 generateProposals 谓词统一 + 动态 bound

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts` (line 92-108 `handle`、line 219-280 `generateProposals`、line 387-402 `isSlotOccupied`、line 404-416 `findOccupyingSlot`)
- Create: `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts`

**Interfaces:**
- Consumes: `GenerationRequest`（既有 USOM 类型，`request.contexts` 含 `existingTimeboxes` / `activeTasks` / `pendingHabits` / `energyCurve`）、`TimeSlot` / `TimeboxItem` / `GeneratedProposal` / `Warning`（既有内部类型）。
- Produces:
  - `findOccupyingSlot(startHour, startMinute, durationMinutes, occupied): TimeSlot | undefined` — **签名变化**：新增 `durationMinutes` 参数，谓词统一为与 `isSlotOccupied` 一致的重叠语义 `sStart < oEnd && sEnd > oStart`。设计意图：消除「isSlotOccupied=true 但 findOccupyingSlot=undefined」的谓词不一致（当前 `cnui/handlers.ts` 与本文件均无其他 caller — `grep` 已确认 `findOccupyingSlot` / `isSlotOccupied` 仅在 `generateProposals` 内调用一次）。
  - `generateProposals(items, occupied, energyCurve, date): { proposals: GeneratedProposal[]; warnings: Warning[] }` — **返回 shape 变化**：从 `GeneratedProposal[]` 改为对象，新增 `warnings` 字段携带 `SCHEDULER_BOUND_EXCEEDED`。
  - `handle()` 返回的 `GenerationResult.warnings` 现合并 `generateProposals` 与 `detectConflicts` 两源。

**背景（root cause）**：
- `isSlotOccupied` (line 387-402)：区间重叠语义 `sStart < oEnd && sEnd > oStart`（含 duration）。
- `findOccupyingSlot` (line 404-416)：包含起点语义 `sStart >= oStart && sStart < oEnd`（不含 duration）。
- `generateProposals` line 231-244 while loop：`while (isSlotOccupied(...)) { const overlap = findOccupyingSlot(...); if (overlap) 跳到 oEnd; else fallback cursorMinute+=30 }`。
- **谓词不一致**：cursor 槽与 occupied 重叠（isSlotOccupied=true）但 cursor 起点不在 occupied 内（findOccupyingSlot=undefined）时走 fallback +30。多数情况能自愈（fallback 后 cursor 进入 occupied，再 findOccupyingSlot 返回），但异常 occupied 数据可触发长时间不退出。
- **修复 (a) root cause**：`findOccupyingSlot` 加 durationMinutes 参数 + 改重叠语义。统一后外层 while 为 true 时 findOccupyingSlot 必返回非 undefined → fallback 分支为死代码 → bound 作 defense-in-depth 双保险。
- **修复 (b) bound**：动态上界 `items.length × 48 + 100` 次总推进，超出 break + 返 partial proposals + warning（code: `SCHEDULER_BOUND_EXCEEDED`，severity: `'warn'`，区别于既有 `SCHEDULE_OVERLAP`）。
- **关键约束**：统一后 **不要**「保留 fallback 以防万一」（design doc OQ-1）— 会重新引入不一致。fallback 分支保留但实质死代码（bound 兜底）。

- [ ] **Step 1: 写失败测试 — 谓词一致性（root cause）**

新建 `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts`：

```typescript
/**
 * @file orchestration-handler.test
 * @brief TimeboxOrchestrationHandler 单测 — 守护 [023.07] #3 谓词一致性与 bound 安全网
 */
import { describe, it, expect } from 'vitest'
import { TimeboxOrchestrationHandler } from '../orchestration-handler'
import type { GenerationRequest } from '@/usom/types/process'

// 构造最小合法 GenerationRequest（contexts 提供 activeTasks 即可触发 buildTimeboxItems）
function buildRequest(overrides: Partial<GenerationRequest['contexts']> = {}): GenerationRequest {
  return {
    intent: {
      targetDomain: 'timebox',
      action: 'generateProposals',
      fields: { date: '2026-07-05' },
    },
    contexts: {
      activeTasks: [],
      pendingHabits: [],
      existingTimeboxes: [],
      energyCurve: { peakHours: [9, 10], lowHours: [13, 14] },
      ...overrides,
    },
  } as unknown as GenerationRequest
}

describe('[023.07] #3 generateProposals 谓词一致性 + bound', () => {
  it('findOccupyingSlot 与 isSlotOccupied 谓词一致：cursor 跨越 occupied 起点时两者都判为重叠', () => {
    const handler = new TimeboxOrchestrationHandler()
    // cursor=8:30, duration=60min → [8:30, 9:30]，与 occupied [9:00, 10:00] 重叠
    // 当前 bug：findOccupyingSlot(包含起点) 返 undefined（8:30 不在 [9:00,10:00) 内）
    // 统一后：findOccupyingSlot(重叠) 应返该 slot
    const occupied = [{ startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 }]

    // @ts-expect-error — 访问 private method 做单元守护
    const isOcc = handler.isSlotOccupied(8, 30, 60, occupied)
    expect(isOcc).toBe(true)

    // @ts-expect-error — private；签名含 durationMinutes
    const overlap = handler.findOccupyingSlot(8, 30, 60, occupied)
    expect(overlap).toBeDefined()
    expect(overlap.endHour).toBe(10)
    expect(overlap.endMinute).toBe(0)
  })

  it('findOccupyingSlot 与 isSlotOccupied 一致：完全不重叠时都返 falsy', () => {
    const handler = new TimeboxOrchestrationHandler()
    const occupied = [{ startHour: 14, startMinute: 0, endHour: 15, endMinute: 0 }]
    // cursor=8:00 duration=60 → [8:00,9:00]，与 [14:00,15:00] 不重叠
    // @ts-expect-error
    expect(handler.isSlotOccupied(8, 0, 60, occupied)).toBe(false)
    // @ts-expect-error
    expect(handler.findOccupyingSlot(8, 0, 60, occupied)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
```

期望：FAIL —
- 第 1 个 test：`findOccupyingSlot(8, 30, 60, occupied)` 当前签名只接 3 参数（无 durationMinutes），且谓词是包含起点 → 返 undefined → `expect(overlap).toBeDefined()` 失败。或 TypeScript 报参数数量错（被 `@ts-expect-error` 抑制）。
- 第 2 个 test：可能 PASS（不重叠 case 当前也一致）。

- [ ] **Step 3: 改 `findOccupyingSlot` 谓词 + 签名**

修改 `orchestration-handler.ts` line 404-416，把：

```typescript
private findOccupyingSlot(
  startHour: number,
  startMinute: number,
  occupied: TimeSlot[],
): TimeSlot | undefined {
  const sStart = startHour * 60 + startMinute
  for (const slot of occupied) {
    const oStart = slot.startHour * 60 + slot.startMinute
    const oEnd = slot.endHour * 60 + slot.endMinute
    if (sStart >= oStart && sStart < oEnd) return slot
  }
  return undefined
}
```

改为：

```typescript
private findOccupyingSlot(
  startHour: number,
  startMinute: number,
  durationMinutes: number,
  occupied: TimeSlot[],
): TimeSlot | undefined {
  // [023.07] #3 — 谓词统一为区间重叠语义（与 isSlotOccupied 一致）：
  // 旧谓词 `sStart >= oStart && sStart < oEnd`（包含起点）与 isSlotOccupied 的重叠语义
  // 不一致，导致「cursor 槽重叠但起点不在 occupied 内」时返 undefined → 走 fallback +30，
  // 多数情况能自愈但异常 occupied 数据可触发长时间不退出。
  const sStart = startHour * 60 + startMinute
  const sEnd = sStart + durationMinutes
  for (const slot of occupied) {
    const oStart = slot.startHour * 60 + slot.startMinute
    const oEnd = slot.endHour * 60 + slot.endMinute
    if (sStart < oEnd && sEnd > oStart) return slot
  }
  return undefined
}
```

- [ ] **Step 4: 改 `generateProposals` 的调用点 + 加 bound + 改返回 shape**

修改 `orchestration-handler.ts` line 219-280。把整个 `generateProposals` 方法替换为：

```typescript
private generateProposals(
  items: TimeboxItem[],
  occupied: TimeSlot[],
  energyCurve: EnergyCurve,
  date: string,
): { proposals: GeneratedProposal[]; warnings: Warning[] } {
  const proposals: GeneratedProposal[] = []
  const warnings: Warning[] = []
  let cursorHour = 8  // 从 08:00 开始
  let cursorMinute = 0

  // [023.07] #3 — 动态 iteration bound（defense-in-depth）：
  // 单 item 最多走 ~28 个半小时槽（8:00-22:00），items.length × 48 给足余量，
  // +100 兜底空 items / 极端 occupied。超出 → break + emit warning + 返 partial。
  // 正常路径（谓词统一后 fallback 实质死代码）永不触发；纯粹防止未来回归。
  const maxIterations = items.length * 48 + 100
  let iterations = 0

  for (const item of items) {
    // 向前移动游标，跳过被占用的时段
    while (this.isSlotOccupied(cursorHour, cursorMinute, item.durationMinutes, occupied)) {
      if (++iterations > maxIterations) {
        warnings.push({
          code: 'SCHEDULER_BOUND_EXCEEDED',
          message: `智能编排超出最大推进次数 ${maxIterations}，已返回部分方案（${proposals.length} 项）。可能存在异常占用数据。`,
          severity: 'warn',
        })
        return { proposals, warnings }
      }
      const overlap = this.findOccupyingSlot(cursorHour, cursorMinute, item.durationMinutes, occupied)
      if (overlap) {
        cursorHour = overlap.endHour
        cursorMinute = overlap.endMinute
      } else {
        // 安全回退：前进 30 分钟（谓词统一后此分支为死代码，bound 兜底）
        cursorMinute += 30
        if (cursorMinute >= 60) {
          cursorHour += Math.floor(cursorMinute / 60)
          cursorMinute = cursorMinute % 60
        }
      }
    }

    const endTotalMin = cursorHour * 60 + cursorMinute + item.durationMinutes
    const endHour = Math.floor(endTotalMin / 60) % 24
    const endMinute = endTotalMin % 60

    const energyMatch = this.computeEnergyMatch(
      cursorHour,
      item.energyRequired,
      energyCurve,
    )

    proposals.push({
      id: crypto.randomUUID(),
      action: 'createTimebox',
      payload: {
        title: item.title,
        date,
        startTime: this.formatTime(cursorHour, cursorMinute),
        endTime: this.formatTime(endHour, endMinute),
        duration: item.durationMinutes,
        sourceObjectId: item.relatedObjectId,
      },
      sourceType: item.sourceType,
      priority: item.priority,
      energyMatch,
    })

    cursorHour = endHour
    cursorMinute = endMinute

    // 一天最多编排到 22:00
    if (cursorHour >= 22) break
  }

  return { proposals, warnings }
}
```

- [ ] **Step 5: 改 `handle()` 合并 warnings**

修改 `orchestration-handler.ts` line 92-108。把：

```typescript
async handle(request: GenerationRequest): Promise<GenerationResult> {
  const date = this.resolveDate(request)
  const materials = this.collectMaterials(request.contexts)
  const items = this.buildTimeboxItems(materials)
  const sorted = this.sortItems(items)
  const occupied = this.extractOccupiedSlots(materials.existingTimeboxes)
  const proposals = this.generateProposals(sorted, occupied, materials.energyCurve, date)
  const warnings = this.detectConflicts(proposals, materials.existingTimeboxes)
  const presentation = this.renderMarkdown(proposals, date)

  return {
    proposalSet: {
      id: crypto.randomUUID(),
      label: `${date} 智能编排方案`,
      proposals,
      tags: ['auto-schedule', 'smart'],
    },
    presentation,
    warnings,
  }
}
```

改为：

```typescript
async handle(request: GenerationRequest): Promise<GenerationResult> {
  const date = this.resolveDate(request)
  const materials = this.collectMaterials(request.contexts)
  const items = this.buildTimeboxItems(materials)
  const sorted = this.sortItems(items)
  const occupied = this.extractOccupiedSlots(materials.existingTimeboxes)
  const { proposals, warnings: boundWarnings } = this.generateProposals(sorted, occupied, materials.energyCurve, date)
  const conflictWarnings = this.detectConflicts(proposals, materials.existingTimeboxes)
  const presentation = this.renderMarkdown(proposals, date)

  return {
    proposalSet: {
      id: crypto.randomUUID(),
      label: `${date} 智能编排方案`,
      proposals,
      tags: ['auto-schedule', 'smart'],
    },
    presentation,
    warnings: [...boundWarnings, ...conflictWarnings],
  }
}
```

- [ ] **Step 6: 跑 Step 1 的谓词测试看通过**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
```

期望：PASS — 两个谓词一致性 test 都通过。

- [ ] **Step 7: 加 bound 不 hang 集成测试 + bound warning spy 测试**

追加进 `orchestration-handler.test.ts` 同 describe 块：

```typescript
  it('handle() 不死循环：多个相邻 occupied + 多 items 在合理时间内返回', async () => {
    const handler = new TimeboxOrchestrationHandler()
    // 构造 8:00-22:00 全占满（28 个半小时 slot）+ 3 个 task
    const existingTimeboxes: any[] = []
    for (let h = 8; h < 22; h++) {
      existingTimeboxes.push({
        id: `occ-${h}`,
        title: `占用${h}`,
        startTime: `2026-07-05T${String(h).padStart(2, '0')}:00:00Z`,
        endTime: `2026-07-05T${String(h + 1).padStart(2, '0')}:00:00Z`,
        status: 'planned',
        taskIds: [],
        habitIds: [],
      })
    }
    const request = buildRequest({
      activeTasks: [
        { id: 't1', title: '任务1', status: 'active', priority: 'P1', estimatedDuration: 60, energyRequired: 'medium' },
        { id: 't2', title: '任务2', status: 'active', priority: 'P2', estimatedDuration: 60, energyRequired: 'low' },
        { id: 't3', title: '任务3', status: 'active', priority: 'P2', estimatedDuration: 60, energyRequired: 'low' },
      ],
      existingTimeboxes,
    })

    // vitest 默认 5s timeout 守护 — 若 livelock 会 timeout fail
    const result = await handler.handle(request)
    // 全天占满 → 所有 proposals 被推到 22:00 后 break → proposals 可能为空或被 cursorHour>=22 截断
    expect(result).toBeDefined()
    expect(result.proposalSet).toBeDefined()
  })

  it('bound 安全网：spy 注入「谓词再次不一致」场景 → emit SCHEDULER_BOUND_EXCEEDED warning', async () => {
    const handler = new TimeboxOrchestrationHandler()
    // 模拟「未来回归」：isSlotOccupied 永返 true，findOccupyingSlot 永返 undefined
    // （即原 bug 的谓词不一致 + 异常数据 livelock 场景）
    // @ts-expect-error — spy private method
    vi.spyOn(handler, 'isSlotOccupied').mockReturnValue(true)
    // @ts-expect-error — spy private method（新签名含 durationMinutes）
    vi.spyOn(handler, 'findOccupyingSlot').mockReturnValue(undefined)

    const request = buildRequest({
      activeTasks: [
        { id: 't1', title: '任务1', status: 'active', priority: 'P1', estimatedDuration: 60, energyRequired: 'medium' },
      ],
    })

    const result = await handler.handle(request)
    const boundWarning = result.warnings?.find(w => w.code === 'SCHEDULER_BOUND_EXCEEDED')
    expect(boundWarning).toBeDefined()
    expect(boundWarning?.severity).toBe('warn')
  })
```

> **测试文件顶部需加 `import { vi } from 'vitest'`**（若未导入）。

> **关于 spy 测试的设计理由**：谓词统一后正常路径 bound 永不触发（fallback 是死代码）。bound 是 defense-in-depth — 防止「未来有人改坏谓词 / 加入新异常数据形态」时 livelock。spy 注入模拟的就是「谓词再次不一致」的回归场景，验证 bound 安全网真的兜得住。这是对「不可预测的未来」的合理测试投资。

- [ ] **Step 8: 跑全部测试看通过**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
```

期望：4 个 test 全 PASS（谓词一致 ×2 + 不 hang + bound warning）。

- [ ] **Step 9: 全量回归 + tsc**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -30
cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -20
```

期望：vitest 失败集合与 base 一致（仅 pre-existing [025] flake）；tsc 零新增错误。

- [ ] **Step 10: validate:manifest + validate:domain-structure**

```bash
cd /home/walker/lifeware/frontend && npm run validate:manifest
cd /home/walker/lifeware/frontend && npm run validate:structure
```

期望：0 errors（本任务不动 manifest / domain structure，应与 base 一致）。

- [ ] **Step 11: 提交**

```bash
cd /home/walker/lifeware && git add frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
git commit -m "fix(023.07): unify generateProposals predicates (overlap) + add scheduler bound as defense-in-depth"
```

---

## 验收清单（提交前 implementer 自检 + whole-branch review 用）

- [ ] 2 commits on main（顺序：#5 → #3），每 commit 独立 revertible
- [ ] T1 #5：dedupe by id 测试通过（重复 id 只保留首次）
- [ ] T2 #3 谓词一致性：`findOccupyingSlot` 新签名含 `durationMinutes`，重叠语义与 `isSlotOccupied` 一致
- [ ] T2 #3 bound：`generateProposals` 返 `{ proposals, warnings }`，`handle()` 合并 bound + conflict warnings
- [ ] T2 #3 `SCHEDULER_BOUND_EXCEEDED` warning code 与既有 `SCHEDULE_OVERLAP` 区分
- [ ] `detectConflicts`（line 284-313）谓词未改（仍重叠语义）
- [ ] vitest base/head 失败集合对比：无新增失败（pre-existing [025] flake 可接受）
- [ ] tsc 零新增错误
- [ ] validate:manifest 0 errors、validate:domain-structure PASS
- [ ] manifest 未改（不触发 C-1 四联审计）
- [ ] 无 CHANGELOG 条目（runtime-only，宪章 v2.1.1）
- [ ] **#3 修复确认是 [023.08] #1 stub 修复的前置依赖**（修 #1 激活 generateProposals 路径，本 task 已堵 livelock）
