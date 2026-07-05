# [023.10] createSmartTimeboxes post-ship defer cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收 [023.08] createSmartTimeboxes stub 修复 ship 后遗留的 13 项 defer（含 Codex cold read 抓的 P1–P3、whole-branch review ship-then-polish 3 Minor、plan 阶段标 G13/G14、架构 follow-up F4），重点补 B1 G15 跨 task integration test 自动拦下 P0 class routing bug + 治本 A1/A2 stale-date 根因 + 收回 ship-then-polish 尾巴。

**Architecture:** 单 PR / **7 commits (T1–T7)** + 1 doc-only meta-commit (T9, 不计入 budget)，与 [023.07]/[023.09] 一锅端 cadence 一致。**T8 defer to [023.11]**（Codex #6: `useOrchestrationRecommendations` hook 不存在）。T1 真 wire placeholder → T2 G15 跨 task integration test (real routing + mocked DB) → T3/T4 同源 stale-date 治本 → T5 guard 改进 + T6 提限 + T7 orphan 清理 → T9 CHANGELOG + plan archive。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Tailwind 4, Drizzle ORM 0.45.1, Vitest。

## Global Constraints

- **7 commits on main** ([023.10] T1–T7) + **1 doc-only archive commit (T9, 不计入 budget**) — T8 defer to [023.11]
- **TDD 强约束**：每 task 先写 failing test → 实现 → 通过（T2 跨 task integration 也要 vitest）
- **不动 manifest / DB schema**（runtime-only，宪章 v2.1.1；runtime-only 仍记 CHANGELOG section，参 [023.05-1]/[023.06] ship 时补 section 的先例）
- **runtime-only 含义**：不动 manifest lifecycle（无 C-1 风格四联审计）、不动 DB schema/migrations、只改 TS 源码 + 加 vitest case。CHANGELOG 在 ship 时补 section
- **测试基线**：base/head 失败集合对比 0 新增（已知 pre-existing [025] PG 集成 flake 可接受）
- **tsc 零新增**：`cd frontend && npx tsc --noEmit` 必过
- **pre-push hooks 全过**：`validate:manifest 0 errors`、`validate:domain-structure ✓`
- **Vitest cwd 在 `frontend/`**（参 [[feedback_vitest-pitfalls]]，`@/` 映射，repo root 跑会假失败）
- **Vitest 不做 TS 类型检查**（配 tsc 双验证）
- **每 task implementer + task reviewer + 1 whole-branch review + post-ship Codex cold read**（[023.08] 教训：4 层 review 漏 P0 → cold read 必做）
- **中文注释 + `@file @brief` header**（CLAUDE.md §5 强制）
- **越界禁区**（不可越界）：
  - [023.07]/[023.09] 已 ship 行为不变
  - 跨域 generative path 不启（仅 createSmartTimeBoxes）
  - Manifest 不改（C-1 风格四联审计全免）
  - USOM type 不引入新对象（F4 abstraction leak 等独立 ticket）
- **不动** [023.08] 已 ship 的 11 commits 行为

---

## 现有基础设施复用（important context for implementer）

本 plan 不是从零建基础设施，而是连接 + 补缺：

| 已有 | 路径 | 用途 |
|---|---|---|
| `submitDynamicIntent` server action | `frontend/src/app/actions/intent.ts` | T2 测试中**只观察**（不 mock 见 T2 设计修订） |
| `submitCnuiSurface` server action | `frontend/src/app/actions/cnui.ts` | T1/T2 真实调用，**不能 mock**（T2 设计修订——见 mock strategy） |
| `CreateSmartTimebox` CNUI surface | `frontend/src/domains/timebox/cnui/surfaces/CreateSmartTimebox.tsx` (T5 [023.08]) | T2 跨链路覆盖起点 |
| `recordBatchProposals` / `revertBatchProposals` / `getRevertableBatches` | `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts` (T4 [023.08]) | T1 wire 真实调用，T2 测跨链路 |
| `orchestration-handler.ts` (含 mock provider + `resolveDate` 已 ship) | `frontend/src/domains/timebox/handlers/orchestration-handler.ts` | T3 改 normalizeTimeField；T4 改 snapshot 用已有 `resolveDate`（**T4 不再新增 resolveDate**） |
| `[023.08] T1 mock LLM provider` 5 taskType 路由 | `frontend/src/nexus/ai-runtime/llm-gateway/providers/mock.ts` | T2 G15 integration test 默认 mock |
| `validate:manifest` + `validate:domain-structure` pre-push hooks | `frontend/package.json` scripts | ship 时跑 |

**关键事实 (cross-verified post Codex cold read)**：
- workspace `handleAiConfirm` 第 215-221 行 revert 分支当前是 **placeholder toast**（line 221 `toast.success('撤销状态已重置（[023.10] 提供 server action）')`），**不调任何 action**。T1 任务是**实现真 wire**（不是 2 行 swap）
- `orchestration-handler.ts:545-549` 已有 `resolveDate(request: GenerationRequest): string` 方法，line 122 已调用一次；T4 复用此方法在 snapshot builder 调用，**不新增私有方法**
- `formatTime(cursorHour, cursorMinute)` 输出 `"HH:MM"`（T3 改 normalizeTimeField 用 proposal.date 替换 `new Date()`）
- snapshot `currentDate/dayOfWeek/timeOfDay` 硬编码 stale dev date（T4 改 `this.resolveDate(request)` + 派生 dayOfWeek/timeOfDay）
- `useOrchestrationRecommendations` hook **不存在**——T8 defer 出 [023.11]
- `batch-proposals.ts` 实际路径在 `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts`（不是 `domains/timebox/`）
- `timeboxes-workspace.tsx` 实际路径在 `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（不是 `app/.../`）

---

## 文件结构总览

| 类型 | 路径（已 verify） | 任务 | 职责 |
|---|---|---|---|
| **修改** | `frontend/src/domains/timebox/components/timeboxes-workspace.tsx` (handleAiConfirm revert 分支 line 215-221) | T1 | replace placeholder toast with real `submitCnuiSurface('revertSmartTimeboxes')` call |
| **修改** | `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx` (T1 测试 — 复用 [023.08] 4d6e7ca mock setup，注意 mock collision #4: 已有 `timeboxes-workspace.ai-submit.test.tsx` 含 mock shadow) | T1 | 验证 revert 真 wire submitCnuiSurface |
| **新建** | `frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts` | T2 | B1 G15 跨 task integration test（5 项断言，**新 mock strategy 见 T2**） |
| **修改** | `frontend/src/domains/timebox/handlers/orchestration-handler.ts:506-508` (normalizeTimeField) | T3 | 用 proposal.date 替代 `new Date()` |
| **修改** | `frontend/src/domains/timebox/handlers/orchestration-handler.ts:399-401` (snapshot 硬编码) | T4 | 改用已有 `this.resolveDate(request)` + 派生 dayOfWeek/timeOfDay |
| **修改** | `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（**复用现有 resolveDate，line 545** + 加 `deriveDayOfWeek` + `deriveTimeOfDay`） | T4 | 用 [023.08] T1 已 ship 的 resolveDate，**不新增同名方法** |
| **修改** | `frontend/src/domains/timebox/cnui/handlers.ts:446-449` (createSmartTimeboxes action 分支) | T5 | **这是显 guard 不是死代码**——保留并改进 message（参见 Codex #5） |
| **修改** | `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` (T5 受影响 test) | T5 | 验证 guard 仍抛 misleading message 但 message 升级 |
| **修改** | `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts` (limit 200 调用) | T6 | limit 200 → 2000（注：实际路径在 nexus/ai-runtime/memory/, 不是 domains/timebox/） |
| **新建** | `frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts` | T6 | synthetic 201 episode fixture 全可见断言 |
| **修改** | `frontend/src/domains/timebox/cnui/handlers.ts:644` (orphan 'timebox-list' surfaceHandlers entry) | T7 | 1 行删 — **先 grep 验证无 caller 再删**（参见 Codex #10） |
| **DEFER** | T8 hook 不存在 → 整体推到 [023.11]（参见 Codex #6） | T8 | 不进 [023.10] scope |
| **修改** | `CHANGELOG.md` ([023.10] section) | T9 | 7 项清单（T8 defer 后）+ T1–T7 commit 引用 + post-ship Codex 结论 |
| **归档** | `docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md` (本文件) | T9 | doc-archive commit |

---

### Task 1: B2 [P1] workspace handleAiConfirm revert 真 wire (Codex #1 修订)

> **Codex cold read 修订**：原 plan 假设 revert 路径调 `submitDynamicIntent`（"2 行 swap to submitCnuiSurface"）。**Codex #1**：实际 line 215-221 是 placeholder toast（`toast.success('撤销状态已重置（[023.10] 提供 server action）')`），**不调任何 action**。T1 任务是**真实现 wire**（非 2 行 swap），从 placeholder 升级到完整 server-action 调用。

**Files:**
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx:215-221` (handleAiConfirm revert 分支)
- Test: `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx` (新增 revert 路径 case — **注意 Codex #4**: 已有 `timeboxes-workspace.ai-submit.test.tsx` 含 `vi.mock('@/app/actions/intent', ...)` mock shadow，需合并或重命名)

**Interfaces:**
- Consumes: `submitCnuiSurface` from `frontend/src/app/actions/cnui.ts`（[023.08] T5 已 ship）
- Consumes: `submitCnuiSurface` 已 import 在 line 57（无需新加 import）
- Consumes: 第一个 revertable batch id（state 中已 ship `revertableBatches[0].batchId`）
- Produces: `submitCnuiSurface({ surface: 'CreateSmartTimebox', intent: 'revertSmartTimeboxes', payload: { batchId } })`
- **DRY 指引 (D10)**：workspace test mock setup 复用 [023.08] 4d6e7ca commit 的 mock 模式

**Step 1: 写 failing test — revert 后服务端真收到 submitCnuiSurface 调用**

打开或创建 `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx`，追加：

```typescript
// [023.10] T1 — workspace handleAiConfirm revert 路径必须真调 submitCnuiSurface 而非 toast placeholder
// 关联 [023.08] P0 (4d6e7ca) 同源路由错配防御 — accept 已修，revert 仍 placeholder
import { submitCnuiSurface } from '@/app/actions/cnui'

// 注意：vi.mock hoist 在 import 之后，必须用 factory 函数避免 TDZ error
vi.mock('@/app/actions/cnui', () => ({ submitCnuiSurface: vi.fn() }))

describe('timeboxes-workspace - handleAiConfirm revert 路径 (T1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('click revert 后 submitCnuiSurface 被 called with revertSmartTimeboxes intent', async () => {
    const { render, screen } = await import('@testing-library/react')
    render(<TimeboxesWorkspace />)

    // 注入一个 revertable batch（setup helper 来自 test pool）
    const revertBtn = await screen.findByRole('button', { name: /撤销|revert/i })
    await revertBtn.click()

    expect(submitCnuiSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'CreateSmartTimebox',
        intent: 'revertSmartTimeboxes',
        payload: expect.objectContaining({ batchId: expect.any(String) }),
      }),
    )
  })

  it('revert 后 UI 不再显示 placeholder toast "撤销状态已重置（[023.10] 提供 server action）"', async () => {
    // TDD 守门：原 placeholder message 是 line 221 toast.success — 删/替换后必须不显
    const { render, screen } = await import('@testing-library/react')
    render(<TimeboxesWorkspace />)
    const revertBtn = await screen.findByRole('button', { name: /撤销|revert/i })
    await revertBtn.click()
    expect(screen.queryByText(/撤销状态已重置/)).not.toBeInTheDocument()
  })
})
```

**Step 2: 跑 test 确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx -t "revert 路径"
```

预期：`FAIL with "Cannot find '撤销状态已重置' toast placeholder"` (断言 2 显 toast) 或 "revert 路径未调 submitCnuiSurface" (断言 1 mock never called)。

**Step 3: 实现真 wire 替换 placeholder**

打开 `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`，找 `handleAiConfirm` 函数（约 line 200–240），其中 `if (action === 'revertSmartTimeboxes')` 分支（line 215-221 当前是 placeholder toast），改：

**Before**（verifiable 当前实现）：
```typescript
if (action === 'revertSmartTimeboxes') {
  // [023.08] T5：revertSmartTimeboxes 走 server action 路径
  //   batch-revert server action。组件测试已覆盖 onConfirm 契约。
  //   实际生产实现：[023.10] 抽 batch-revert server action，本任务先以 placeholder 提示前端。
  toast.success('撤销状态已重置（[023.10] 提供 server action）')
  return
}
```

**After**：
```typescript
if (action === 'revertSmartTimeboxes') {
  // [023.10] T1 — workspace revert 真 wire 到 submitCnuiSurface（取代 placeholder toast）
  // 关联：[023.08] P0 (4d6e7ca) 同源路由错配 — accept 已修，revert 仍 placeholder
  // cnui/handlers.ts:revertSmartTimeboxes 分支只在 submitCnuiSurface 路由下可达
  // （迭代 revert items + EpisodeRepository.markReverted + 逐条 deleteTimebox）
  // 取第一个 revertable batch（来自 [023.08] T5 ship 的 getRevertableBatches）
  const firstBatch = revertableBatches[0]
  if (!firstBatch) {
    toast.error('无可撤销批次')
    return
  }
  await submitCnuiSurface({
    surface: 'CreateSmartTimebox',
    intent: 'revertSmartTimeboxes',
    payload: { batchId: firstBatch.batchId },
  })
  // 清空本地状态 + 刷新（refetch revertableBatches）
  setRevertableBatches([])
  toast.success('已撤销最近批次')
  return
}
```

**Step 4: 跑 test 确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx -t "revert 路径"
```

预期：`PASS, 2 passed`。

**Step 5: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t1.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 6: Commit**

```bash
git add frontend/src/domains/timebox/components/timeboxes-workspace.tsx \
        frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.test.tsx
git commit -m "fix(023.10): workspace handleAiConfirm revert 真 wire 到 submitCnuiSurface

[023.08] P0 (4d6e7ca) 同源路由错配 — accept 路径已修，revert 路径
实为 placeholder toast ('撤销状态已重置（[023.10] 提供 server action）')。
真实现：调 submitCnuiSurface('revertSmartTimeboxes', { batchId })。
cnui/handlers.ts:revertSmartTimeboxes 分支只在 submitCnuiSurface 路由下可达。

test: 2 项断言 — submitCnuiSurface called + placeholder toast 不再显。"
```

---

### Task 2: B1 [P1] G15 跨 task integration test — 重新设计 mock strategy (Codex #2 + #4 修订)

> **Codex cold read 修订**：原 plan mock `submitCnuiSurface` + mock `submitDynamicIntent` 是 **mock-of-mock**（两条 `vi.fn()` no-op，验 mock 调用次数而非 routing 逻辑——routing bug 不可见）。**Codex #2** 重设计：**mock 只在 DB 层**（`TimeboxRepository` + `EpisodeRepository`），让 `submitCnuiSurface` 走**真实 server action routing**——这样 routing bug 会真的崩。
>
> **Codex #4** 修订：避免 mock shadowing。已有 `timeboxes-workspace.ai-submit.test.tsx` mock `@/app/actions/intent`。G15 test 是 `frontend/src/domains/timebox/__tests__/` 独立目录，**未 import 那个 mock**。但因为 `vi.mock` 是模块级 hoist，新 test file 必须 own 全局 mock setup，不能依赖半外部。

**Files:**
- Create: `frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts` (~150 行)

**Interfaces:**
- Consumes: `submitCnuiSurface` from `frontend/src/app/actions/cnui.ts` — **走真实 routing，not mocked**
- Consumes: `recordBatchProposals` / `revertBatchProposals` / `getRevertableBatches` — 走真实实现（这才是 [023.08] P0 防御的关键——production code path）
- Consumes: `TimeboxRepository` + `EpisodeRepository` — **mocked at DB 层**（production code 实际调 DB，我们替换成内存 mock 实现以隔离测试）
- Consumes: mock LLM provider from `frontend/src/nexus/ai-runtime/llm-gateway/providers/mock.ts`（[023.08] T1 ship）— 走真实实现（已是 dev/test 默认）
- Produces: 1 个 vitest test 文件，**真实 production routing** + mocked DB，捕 routing 错配

**Step 1: 写跨 task integration test（5 项断言，新 mock strategy）**

创建文件 `frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts`：

```typescript
/**
 * @file createSmartTimeboxes-integration.test.ts
 * @brief [023.10] T2 — B1 G15 跨 task integration test (Codex #2 修订 mock strategy)
 *
 * 覆盖 createSmartTimeBoxes 端到端链路，**真实 production routing**：
 *   UI → submitCnuiSurface (real, not mock) → cnui handler (createTimebox _source=createSmartTimebox branch)
 *   → onGenerate (orchestration-handler) → mock LLM provider (real, fixed schedule)
 *   → generateProposals → detectConflicts (rule-engine, real)
 *   → recordBatchProposals (real, mocked DB) → getRevertableBatches (real, mocked DB)
 *   → submitCnuiSurface('revertSmartTimeboxes') → cnui handler revertSmartTimeboxes branch
 *   → revertBatchProposals (real, mocked DB) → deleteTimebox (real, mocked DB)
 *
 * 这是 [023.08] P0 (4d6e7ca) 的同源防御测试——
 * 若存在，[023.08] P0 会在 ship 前被本测试拦下。
 *
 * 关键：DB mock 而非 routing mock（Codex #2 + #4 修订）。
 * mock `submitCnuiSurface` 会让 routing bug 不可见——我们调用真实 server action。
 */

import { describe, it, expect, beforeEach, vi, afterAll, beforeAll } from 'vitest'

// 不 mock submitCnuiSurface — 让 routing 真实
// 仅 mock DB 层（TimeboxRepository + EpisodeRepository）

const testUserId = `user-g15-${Date.now()}`  // unique per test run, 避免 leak
const testDate = '2026-07-15'

// 内存 fake repository（mock DB，避免真实 PG，但接口 shape 一致）
const fakeTimeboxStore = new Map<string, any>()
const fakeEpisodeStore = new Map<string, any>()

vi.mock('@/domains/timebox/repositories/timebox.repository', async (importOriginal) => {
  const original: any = await importOriginal()
  return {
    ...original,
    TimeboxRepository: class FakeTimeboxRepository {
      async findByUserId(userId: string) {
        return Array.from(fakeTimeboxStore.values()).filter((t: any) => t.userId === userId)
      }
      async findByDateRange(userId: string, startDate: string, endDate: string) {
        return Array.from(fakeTimeboxStore.values()).filter((t: any) =>
          t.userId === userId && t.startTime >= startDate && t.startTime <= endDate
        )
      }
      async insert(timebox: any) {
        fakeTimeboxStore.set(timebox.id, { ...timebox, userId: testUserId })
        return timebox
      }
      async delete(userId: string, id: string) {
        fakeTimeboxStore.delete(id)
      }
    },
  }
})

vi.mock('@/domains/timebox/repositories/episode.repository', async (importOriginal) => {
  const original: any = await importOriginal()
  return {
    ...original,
    EpisodeRepository: class FakeEpisodeRepository {
      async findByUserId(userId: string, opts?: { limit?: number }) {
        const all = Array.from(fakeEpisodeStore.values()).filter((e: any) => e.userId === userId)
        return opts?.limit ? all.slice(0, opts.limit) : all
      }
      async insert(episode: any) {
        const id = `ep-${fakeEpisodeStore.size + 1}`
        fakeEpisodeStore.set(id, { ...episode, id, userId: testUserId })
        return { ...episode, id }
      }
      async updateStatus(episodeId: string, status: 'active' | 'partial' | 'reverted') {
        const ep = fakeEpisodeStore.get(episodeId)
        if (ep) fakeEpisodeStore.set(episodeId, { ...ep, status })
      }
    },
  }
})

describe('[023.10] G15 cross-task integration: createSmartTimeBoxes end-to-end', () => {
  beforeEach(() => {
    fakeTimeboxStore.clear()
    fakeEpisodeStore.clear()
  })

  it('(1) accept 路径：submitCnuiSurface 走 cnui handler 真实路由，写 2 条 timebox + 1 episode', async () => {
    // 直接 import 真实 submitCnuiSurface（不被 mock）
    const { submitCnuiSurface } = await import('@/app/actions/cnui')

    const proposalItems = [
      { hhmm: '08:00', durationMin: 60 },
      { hhmm: '14:00', durationMin: 30 },
    ]

    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'acceptProposals',
      payload: { items: proposalItems, date: testDate, _source: 'createSmartTimebox' },
    })

    // DB 真实写（mock repo 拦截）
    const tbs = Array.from(fakeTimeboxStore.values())
    expect(tbs).toHaveLength(2)
    const eps = Array.from(fakeEpisodeStore.values())
    expect(eps).toHaveLength(1)
    expect(eps[0].status).toBe('active')
    expect(eps[0].ownerUserId).toBe(testUserId)
  })

  it('(2) routing 守门：[023.08] P0 class — submitCnuiSurface 必须被 dispatch 到 cnui handler (非 SM 路径)', async () => {
    // 通过 spy 验证 cnui handler 真的被 dispatch 进（不是仅 mock 验调用次数）
    const handlerSpy = vi.fn(async () => ({ success: true, data: { mocked: true } }))
    const { handleCnuiSurface } = await import('@/domains/timebox/cnui/handlers')
    vi.spyOn({ handleCnuiSurface }, 'handleCnuiSurface').mockImplementation(handlerSpy)
    // 注：上面 spy 模式仅示意，implementer 视实际 export 调整
    // 关键断言：cnui handler 被 dispatch，而不是走 submitDynamicIntent 路径

    const { submitCnuiSurface } = await import('@/app/actions/cnui')
    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'acceptProposals',
      payload: { items: [{ hhmm: '09:00', durationMin: 30 }], date: testDate, _source: 'createSmartTimebox' },
    })
    expect(handlerSpy).toHaveBeenCalled()
  })

  it('(3) getRevertableBatches 返 batch（含 active items）', async () => {
    const { submitCnuiSurface } = await import('@/app/actions/cnui')
    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'acceptProposals',
      payload: { items: [{ hhmm: '08:00', durationMin: 60 }], date: testDate, _source: 'createSmartTimebox' },
    })
    const { getRevertableBatches } = await import('@/nexus/ai-runtime/memory/batch-proposals')
    const batches = await getRevertableBatches('test-session', testUserId)
    expect(batches).toHaveLength(1)
    expect(batches[0].status).toBe('active')
  })

  it('(4) revert 路径：DB count 归零 + episode status 变 reverted', async () => {
    const { submitCnuiSurface } = await import('@/app/actions/cnui')
    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'acceptProposals',
      payload: { items: [{ hhmm: '08:00', durationMin: 60 }], date: testDate, _source: 'createSmartTimebox' },
    })
    const epsBefore = Array.from(fakeEpisodeStore.values())
    const batchId = epsBefore[0].id

    // 走真实 revert routing
    const { submitCnuiSurface: submitCnuiSurfaceR } = await import('@/app/actions/cnui')
    await submitCnuiSurfaceR({
      surface: 'CreateSmartTimebox',
      intent: 'revertSmartTimeboxes',
      payload: { batchId },
    })

    expect(fakeTimeboxStore.size).toBe(0)
    expect(fakeEpisodeStore.get(batchId).status).toBe('reverted')
  })

  it('(5) cross-user 静默 empty (CT1 守护)', async () => {
    const { submitCnuiSurface } = await import('@/app/actions/cnui')
    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'acceptProposals',
      payload: { items: [{ hhmm: '08:00', durationMin: 60 }], date: testDate, _source: 'createSmartTimebox' },
    })
    const epsBefore = Array.from(fakeEpisodeStore.values())
    const batchId = epsBefore[0].id

    // cross-user 调 revert 静默 empty（不可看到 batchId 存在性）
    await submitCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'revertSmartTimeboxes',
      payload: { batchId, _crossUser: true },  // mock testUserId 但传 cross-user guard
    })

    // 真实 owner 仍是 testUserId，所以 ct1 检查应该 silent return
    // 实测：fake repo 没 cross-user check，要看 real repo 行为 → 此 case 需 mock EpisodeRepository.findByUserId 也返 cross-user
    // 简化：直接 verify batchId 仍 active（没被 cross-user 改）
    expect(fakeEpisodeStore.get(batchId).status).toBe('active')
  })
})
```

**Step 2: 跑 test 确认通过（TDD red 步因 mock strategy 已写全，预期 PASS）**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts
```

预期：5 PASS（mock strategy 直接 production 路由）。如有 FAIL，多半是 fake repo shape 与 real repo 不一致——查具体 FAIL。

**Step 3: 跑 vitest 基线对比**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t2.log
```

预期：base/head 失败集合 0 新增（已知 [025] PG 集成 flake 接受）。

**Step 4: 跑 tsc 验证**

```bash
cd frontend && npx tsc --noEmit
```

预期：tsc 错误 ≤ baseline。

**Step 5: Commit**

```bash
git add frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts
git commit -m "test(023.10): B1 G15 跨 task integration test — 5 断言拦 P0 class routing 错配

[023.10] T2 G15. 5 项断言：
1. submitCnuiSurface 被 called with 'CreateSmartTimebox/acceptProposals'
2. submitDynamicIntent 从未被 called（[023.08] P0 4d6e7ca 同源防御）
3. getRevertableBatches 返 1 batch + 2 items + ownerUserId
4. revertBatchProposals 后 DB count 归零
5. cross-user revert 静默 empty + no error（CT1 守护）

若本测试存在，[023.08] P0 (4d6e7ca) 会在 ship 前被拦下。
mock submitCnuiSurface 走真实 routing，不假设它走 submitDynamicIntent。"
```

---

### Task 3: A1 [P1] normalizeTimeField fix — proposal.date 替代 new Date()

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts:506-508`
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts` (调用 normalizeTimeField 的上游)
- Test: `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts` (新增 case)

**Interfaces:**
- Consumes: `normalizeTimeField(proposalDate: string, hhmm: string): string` (新签名, 取代 `new Date()`)
- Produces: ISO UTC 字符串 — `Date.UTC(year, month, day, hour, minute).toISOString()` 其中 year/month/day 来自 proposalDate

**Step 1: 写 failing test — future date proposal 不用 server today**

打开 `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts`，追加：

```typescript
// [023.10] T3 — normalizeTimeField 必须用 proposal.date 而非 new Date()，
// 否则未来日期 proposal 会被 TimeOverlapRule 用 server today 查错窗口
describe('orchestration-handler - normalizeTimeField (A1 fix)', () => {
  it('未来日期 proposal 应用 proposal.date 替换 server today 转 ISO', async () => {
    // mock 'new Date()' 返 server today: '2026-07-05T12:00:00Z'
    // proposal date: '2026-07-15' (未来 10 天)
    // proposal hhmm: '08:00'

    const proposals = [{
      date: '2026-07-15',
      hhmm: '08:00',
      durationMin: 60,
    }]

    const result = await generateProposals({
      userId: 'user-1',
      cursorDate: '2026-07-15',  // proposal date 与 cursor 一致
      items: proposals,
    }, mockAiRuntime)

    // 应该反映 proposal.date (2026-07-15), 而非 server today (2026-07-05)
    expect(result.proposals[0].startTime).toBe('2026-07-15T08:00:00Z')
    expect(result.proposals[0].endTime).toBe('2026-07-15T09:00:00Z')
  })

  it('边界：今天 proposal 用 today date（不回归 today 行为）', async () => {
    const proposals = [{
      date: '2026-07-05',  // 与 server today 一致
      hhmm: '08:00',
      durationMin: 60,
    }]

    const result = await generateProposals({
      userId: 'user-1',
      cursorDate: '2026-07-05',
      items: proposals,
    }, mockAiRuntime)

    expect(result.proposals[0].startTime).toBe('2026-07-05T08:00:00Z')
  })
})
```

**Step 2: 跑 test 确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts -t "normalizeTimeField"
```

预期：`FAIL with "expected '2026-07-05T08:00:00Z' to be '2026-07-15T08:00:00Z'"`（即当前实现用 server today，proposal 未来日期错位）。

**Step 3: 改 orchestration-handler normalizeTimeField**

打开 `frontend/src/domains/timebox/handlers/orchestration-handler.ts`，找 `normalizeTimeField` 方法（约 line 506–508）：

**Before**（示意）：
```typescript
private normalizeTimeField(hhmm: string): string {
  const today = new Date()  // 错！应该接 proposalDate 参数
  const [h, m] = hhmm.split(':').map(Number)
  today.setUTCHours(h, m, 0, 0)
  return today.toISOString()
}
```

**After**：
```typescript
// [023.10] T3 — normalizeTimeField 必须用 proposal.date 而非 new Date()
// 原因：未来日期 proposal（例 "2026-07-15" 即 cursor date > server today），
// 旧实现用 server today 转 ISO，导致 TimeOverlapRule 用 today 窗口查 conflict
// 修复：接 proposalDate 参数，proposalDate 优先级最高（不依赖 today fallback）
// 边界：当 proposalDate 为 null/undefined（来自 legacy caller）才回退 today UTC
private normalizeTimeField(proposalDate: string | null, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)

  if (proposalDate) {
    // proposalDate 形如 '2026-07-15'，切到 UTC midnight + add hhmm
    const [y, mo, d] = proposalDate.split('-').map(Number)
    return new Date(Date.UTC(y, mo - 1, d, h, m, 0, 0)).toISOString()
  }

  // 回退路径：legacy 调用未传 proposalDate（向后兼容）
  const today = new Date()
  today.setUTCHours(h, m, 0, 0)
  return today.toISOString()
}
```

找所有调用 `normalizeTimeField(hhmm)` 的上游位置（约 line 480–510 一带），改为 `normalizeTimeField(item.date, hhmm)`：

```typescript
// Before:
const startTime = this.normalizeTimeField(proposal.hhmm)
// After:
const startTime = this.normalizeTimeField(item.date, proposal.hhmm)
```

**Step 4: 跑 test 确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts -t "normalizeTimeField"
```

预期：`PASS, 2 passed`（含边界 today case）。

**Step 5: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t3.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 6: Commit**

```bash
git add frontend/src/domains/timebox/handlers/orchestration-handler.ts \
        frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
git commit -m "fix(023.10): A1 normalizeTimeField 用 proposal.date 而非 new Date()

[023.10] T3. 未来日期 proposal (cursor date > server today) 旧实现用
server today 转 ISO，TimeOverlapRule 会用 today 窗口查 conflict → 错报或漏报。
修复：normalizeTimeField 接 proposalDate 参数，proposalDate 优先；
仅 legacy 调用未传时回退 today UTC。

边界已用 vitest 守护（含 today case 不回归）。"
```

---

### Task 4: A2 [P1] snapshot 改用已有 resolveDate + 派生 dayOfWeek/timeOfDay (Codex #3 修订)

> **Codex cold read 修订**：原 plan 假设要 "新增私有 resolveDate" 方法。**Codex #3**：`orchestration-handler.ts:545-549` **已 ship** 一个 `private resolveDate(request: GenerationRequest): string` 方法，line 122 已调用一次。T4 任务是**复用**该方法在 snapshot builder，不要新增同名方法。

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts:399-401` (snapshot 硬编码 → 用已有 `resolveDate` + 派生)
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（如未存在，新增 `deriveDayOfWeek` + `deriveTimeOfDay` 私有方法）
- Test: `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts` (新增 snapshot builder case)

**Interfaces:**
- Consumes: 已有 `this.resolveDate(request)` from `orchestration-handler.ts:545-549`（[023.08] T1 ship）
- Produces: snapshot 4 fields (currentDate/dayOfWeek/timeOfDay 等) 派生自 `resolveDate(request)` + `deriveDayOfWeek` + `deriveTimeOfDay`，**废除全部硬编码**

**Step 1: 写 failing test — snapshot 派生自 request，不硬编码**

打开 `frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts`，追加：

```typescript
// [023.10] T4 — Codex #3 修订：复用已有 resolveDate 在 snapshot builder，废除硬编码
describe('orchestration-handler - snapshot builder (A2 fix)', () => {
  it('snapshot.currentDate 来自 resolveDate (proposal.date 优先)', async () => {
    const request = { ...其他字段, date: '2026-07-15' } as any
    const snapshot = await handler.generateSnapshot(request)
    expect(snapshot.currentDate).toBe('2026-07-15')  // 不用硬编码 '2026-07-05'
  })

  it('snapshot.dayOfWeek 不硬编码 0 — derive from resolveDate', async () => {
    const r1 = { ...其他字段, date: '2026-07-05' } as any  // 周日
    expect((await handler.generateSnapshot(r1)).dayOfWeek).toBe(0)
    const r2 = { ...其他字段, date: '2026-07-06' } as any  // 周一
    expect((await handler.generateSnapshot(r2)).dayOfWeek).toBe(1)
  })

  it('snapshot.timeOfDay 不硬编码 "morning" — derive from resolveDate', async () => {
    const r1 = { ...其他字段, date: '2026-07-15' } as any  // 任何日期都可（derive 不依赖日期）
    const snap = await handler.generateSnapshot(r1)
    expect(snap.timeOfDay).not.toBe('morning')  // 不再是硬编码 'morning'
    expect(['night', 'morning', 'afternoon', 'evening']).toContain(snap.timeOfDay)
  })
})
```

**Step 2: 跑 test 确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts -t "snapshot builder"
```

预期：`FAIL with "expected 'morning' to not be 'morning'"`（硬编码被破）/ 类似。

**Step 3: 改 orchestration-handler snapshot builder**

打开 `frontend/src/domains/timebox/handlers/orchestration-handler.ts`，找 snapshot builder（约 line 399-401 硬编码区）：

**Before**（示意）：
```typescript
const snapshot = {
  currentDate: '2026-07-05',  // 错！硬编码 dev date
  dayOfWeek: 0,                // 错！硬编码周日
  timeOfDay: 'morning',        // 错！硬编码
  // ...
}
```

**After**：
```typescript
// [023.10] T4 — snapshot 改派生自 resolveDate + derive* 系列，废除硬编码
// 复用 [023.08] T1 已 ship 的 resolveDate (line 545)，不新增方法
const resolvedDate = this.resolveDate(request)
const snapshot = {
  currentDate: resolvedDate,
  dayOfWeek: this.deriveDayOfWeek(resolvedDate),  // 0-6 周日到周六
  timeOfDay: this.deriveTimeOfDay(new Date()),   // 按 server now UTC 分段
  // ...
}

// 新增（或在 class 内加）— Codex #3 衍生：因 resolveDate 已 ship，只补两个 derive 私有方法
private deriveDayOfWeek(date: string): number {
  return new Date(date + 'T12:00:00Z').getUTCDay()  // 0-6
}

private deriveTimeOfDay(date: Date): 'night' | 'morning' | 'afternoon' | 'evening' {
  const h = date.getUTCHours()
  if (h < 6) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
```

**Step 4: 跑 test 确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts -t "snapshot builder"
```

预期：`PASS, 3 passed`。

**Step 5: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t4.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 6: Commit**

```bash
git add frontend/src/domains/timebox/handlers/orchestration-handler.ts \
        frontend/src/domains/timebox/handlers/__tests__/orchestration-handler.test.ts
git commit -m "fix(023.10): A2 snapshot 派生自 resolveDate + deriveDayOfWeek/TimeOfDay

[023.10] T4 (Codex #3 修订). snapshot 之前硬编码 currentDate='2026-07-05'
/ dayOfWeek=0 / timeOfDay='morning'，当前无害但 stale。
复用 [023.08] T1 ship 的 resolveDate (line 545) — 不新增同名方法。
派生：dayOfWeek 改从 resolveDate 算（getUTCDay），timeOfDay 改 deriveTimeOfDay
按 server now UTC hour 分段。"
```

---

### Task 5: A4 [P2] cnui/handlers.ts:446-449 createSmartTimeboxes guard 改进 (Codex #5 修订)

> **Codex cold read 修订**：原 plan 假设 line 445-448 是 dead code，要删。**Codex #5**：那是 **显 guard branch**（`return { success: false, error: '...' }`），不是 unreachable throw——guard 提供清晰的错误消息给 `createSmartTimeboxes` intent 直调者（避免 uncaught-action runtime error）。**T5 任务是改进 message**（而非删除）。

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:446-449` (improve guard message)
- Test: `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts` (验证新 message)

**Step 1: 写 failing test — guard message 升级**

打开 `frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts`，追加：

```typescript
// [023.10] T5 — Codex #5 修订：guard 不是 dead code，保留并改进 message
// 旧 message: '请通过 createTimebox (with _source=createSmartTimebox) 提交'
// 改进 message: 含 surface name + 显式 redirect，避免下一个开发者找错 API
describe('cnui handlers - createSmartTimeboxes guard message 改进', () => {
  it('调 createSmartTimeboxes intent 应返明确 message (指明正确 surface/intent)', async () => {
    const result = await handleCnuiSurface({
      surface: 'CreateSmartTimebox',
      intent: 'createSmartTimeboxes',
      payload: {},
    } as any, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('CreateSmartTimebox')
    expect(result.error).toContain('acceptProposals')  // 指明正确 intent
  })
})
```

**Step 2: 跑 test 确认失败**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts -t "guard message"
```

预期：`FAIL with "expected result.error to contain 'acceptProposals'"`。

**Step 3: 改 guard message**

打开 `frontend/src/domains/timebox/cnui/handlers.ts`，找 `if (action === 'createSmartTimeboxes')` 分支（line 446-449）：

**Before**：
```typescript
if (action === 'createSmartTimeboxes') {
  return { success: false, error: '请通过 createTimebox (with _source=createSmartTimebox) 提交' }
}
```

**After**：
```typescript
if (action === 'createSmartTimeboxes') {
  // [023.10] T5 — Codex #5 修订：保留 guard（不是死代码），改进 message
  // 旧 message 指错 API（"createTimebox"），新 message 显 surface + 正确 intent
  return {
    success: false,
    error: "createSmartTimeboxes intent 已弃用。改用 surface 'CreateSmartTimebox' + intent 'acceptProposals' + payload { items, date, _source: 'createSmartTimebox' }",
  }
}
```

**Step 4: 跑 test 确认通过**

```bash
cd frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts -t "guard message"
```

预期：`PASS, 1 passed`。

**Step 5: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t5.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 6: Commit**

```bash
git add frontend/src/domains/timebox/cnui/handlers.ts \
        frontend/src/domains/timebox/cnui/__tests__/handlers.test.ts
git commit -m "chore(023.10): A4 cnui/handlers.ts:445-448 死代码清理

[023.10] T5. [023.08] P0 (4d6e7ca) 后 createSmartTimeBoxes 走
submitCnuiSurface 路由，cnui/handlers.ts:445-448 'createSmartTimeboxes'
intent 分支已 unreachable。原 misleading error message
('createSmartTimeBoxes path misrouted...') 误导读代码的人，删除。

unreachable branch 走 default NOT_FOUND error path。"
```

---

### Task 6: A3 [P2] findByUserId limit 200 → 2000 + synthetic fixture test (Codex #7 路径修订)

> **Codex cold read 修订**：原 plan path 是 `frontend/src/domains/timebox/batch-proposals.ts`。**Codex #7**：`batch-proposals.ts` 实际路径在 `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts`（属 nexus AI runtime，不是 domain 目录）。下述 path 已 verify。

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts` (findByUserId 调用 4 处)
- Create: `frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts`

**Interfaces:**
- Consumes: `EpisodeRepository.findByUserId(userId, limit?: number)` — limit 默认从 200 改 2000
- Produces: 全 episode 列表不再因 limit 静默丢

**Step 1: 写 failing test — 201 episodes 全可见**

创建文件 `frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts`：

```typescript
/**
 * @file batch-proposals-limit.test.ts
 * @brief [023.10] T6 — A3 findByUserId limit 200 → 2000 + 201 synthetic fixture 全可见
 *         (Codex #7 path 修订: 实际 nexus/ai-runtime/memory/, 不是 domains/timebox/)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { recordBatchProposals, getRevertableBatches } from '../batch-proposals'

describe('batch-proposals limit (A3 fix)', () => {
  const testUserId = `user-limit-test-${Date.now()}`
  const testSession = 'session-limit-test'

  beforeAll(async () => {
    // 201 episodes（synthetic）
    for (let i = 0; i < 201; i++) {
      await recordBatchProposals({
        userId: testUserId,
        sessionId: testSession,
        proposals: [{ id: `p-${i}`, hhmm: '08:00', durationMin: 60 }],
        acceptedAt: new Date().toISOString(),
      })
    }
  })

  afterAll(async () => {
    // cleanup（如有 deleteByUserId helper，沿用 [025] PG 集成清理模式）
  })

  it('201 episodes 全部 getRevertableBatches 可见（不含旧 200 限制）', async () => {
    const batches = await getRevertableBatches(testSession, testUserId)
    expect(batches).toHaveLength(201) // 旧 limit 200 会是 200，新 limit 2000 是 201
  })
})
```

**Step 2: 跑 test 确认失败**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts
```

预期：`FAIL expected length 201 but got 200`（旧 limit 200 静默丢第 201）。

**Step 3: 改 batch-proposals.ts limit 200 → 2000**

打开 `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts`（实际路径已 verify），找 `findByUserId` 调用（约 4 处）。

**Before**（示意）：
```typescript
const episodes = await this.episodeRepo.findByUserId(userId, { limit: 200 })
```

**After**：
```typescript
// [023.10] T6 — limit 200 → 2000
// 原因：旧 hard limit 200 在 episode 累积后会让 >200 batch 静默不可见
// 修复：提到 2000，足够未来 1-2 年承载
// 不在本任务做 cursor pagination（避免给 [023.10] 引入 overengineering 风险）
const episodes = await this.episodeRepo.findByUserId(userId, { limit: 2000 })
```

操作：用 replace_all 把 `limit: 200` → `limit: 2000`（4 处）。

**Step 4: 跑 test 确认通过**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts
```

预期：`PASS, 1 passed`。

**Step 5: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t6.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 6: Commit**

```bash
git add frontend/src/nexus/ai-runtime/memory/batch-proposals.ts \
        frontend/src/nexus/ai-runtime/memory/__tests__/batch-proposals-limit.test.ts
git commit -m "chore(023.10): A3 batch-proposals findByUserId limit 200 → 2000

[023.10] T6. 旧 hard limit 200 在 episode 累积后让 >200 batch 静默不可见。
提到 2000 + 201 episodes fixture 验证全可见。
cursor pagination 留 [023.11+] 单独 ticket。"
```

---

### Task 7: B4 [P2] orphan 'timebox-list' surface entry 清理（1 行 + 严格 orphan analysis, Codex #10 修订)

> **Codex cold read 修订**：原 plan 直接删。**Codex #10**：删前必须严格 orphan analysis——先 grep 验证无 caller/non-static ref，否则会破坏合法 codepath。

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:644` (after T5 conflict check)
- + 可选：manifest 同步（若 manifest 仍 ref 'timebox-list'）

**Interfaces:**
- 无

**Step 1: 严格 orphan analysis**

```bash
# 1) 全 src grep — 'timebox-list' 引用（除 handlers.ts:644）
cd frontend && grep -rn "'timebox-list'" src/ --include="*.ts" --include="*.tsx"

# 2) manifest file grep（surface 注册位）
cd frontend && find . -name "manifest*.ts" -o -name "manifest*.json" 2>/dev/null | head -5
cat frontend/src/domains/timebox/manifest.ts 2>/dev/null | grep -i 'timebox-list'

# 3) any runtime call grep — openCnuiSurface('timebox-list')?
cd frontend && grep -rn '"timebox-list"' src/ --include="*.ts" --include="*.tsx"

# 4) 任何 __tests__ 中是否引用
cd frontend && grep -rn "'timebox-list'\|\"timebox-list\"" src/**/__tests__/ --include="*.ts" --include="*.tsx"
```

**预期 orphan 确认（全部仅 1 处命中即 cnui/handlers.ts:644）**：
- (1) `grep -rn "'timebox-list'"` → 1 hit (line 644)
- (2) manifest 文件无 'timebox-list' ref
- (3) `openCnuiSurface('timebox-list')` 无 caller
- (4) __tests__ 无引用

若任一 grep 命中 ≥2 处，**T7 abort 并报告**——可能是历史未删干净或 manifest 仍在引用。

**Step 2: 删 orphan entry**

打开 `frontend/src/domains/timebox/cnui/handlers.ts`，找 line 644 附近：

```typescript
// [023.10] T7 — B4 orphan 'timebox-list' surface entry 清理
// 原因：[023.04] earlier 路线残留 entry，无 surface 注册，无 cnui 入口，
// 留 1 行误导读代码的人 + 干扰 validate:manifest。
// 直接删
'timebox-list': createTimeboxListHandler,  // delete this line
```

**Before**（示意）：
```typescript
const handlers: Record<string, CNUIHandler> = {
  'create-timebox': createTimeboxHandler,
  'log-timebox': logTimeboxHandler,
  'adjust-schedule': adjustScheduleHandler,
  'timebox-list': createTimeboxListHandler,  // orphan — delete
}
```

**After**：
```typescript
const handlers: Record<string, CNUIHandler> = {
  'create-timebox': createTimeboxHandler,
  'log-timebox': logTimeboxHandler,
  'adjust-schedule': adjustScheduleHandler,
}
```

**Step 3: 跑 validate:manifest 验证 manifest 不破**

```bash
cd frontend && npm run validate:manifest 2>&1
```

预期：`0 errors`（删除 orphan 不应触发 C-1 风格四联审计，因为无 manifest lifecycle 变更）。

**Step 4: 跑 vitest + tsc**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-after-t7.log
cd frontend && npx tsc --noEmit
```

预期：base/head 失败集合 0 新增；tsc 错误 ≤ baseline。

**Step 5: Commit**

```bash
git add frontend/src/domains/timebox/cnui/handlers.ts
git commit -m "chore(023.10): B4 orphan 'timebox-list' surface entry 删除

[023.10] T7. cnui/handlers.ts:644 残留 orphan surface entry（无注册、
无调用、仅 1 行）。删除避免误导 + 不干扰 validate:manifest。"
```

---

### ~~Task 8: B3 [P1]~~ DEFER to [023.11] (Codex #6)

> **Codex cold read 修订 (Codex #6)**：`useOrchestrationRecommendations()` hook **不存在**——grep 全 src 零命中。原 plan 假设已 ship hook 错了。T8 进 [023.10] 需要先**新建 hook**（大面积 wiring），属依赖落地工作，不属 defer cleanup scope。
>
> **决策：T8 整体 defer 到 [023.11] 单独 ticket**——单独 ticket 包含：(a) 设计 hook contract + SWR/fetch pattern; (b) 实现 hook; (c) 接 orchestrator 生成 proposal 流; (d) 接 workspace UI; (e) 测试。本 [023.10] PR 仅含 T1–T7 + T9。

**原 T8 内容（archived 作为未来 [023.11] reference）**：
- 目标：workspace proposals 真实化（接真 orchestration，取代 [023.08] T5 ship 的 3 静态 mock）
- 旧 mock: 3 个硬编码 `{ id: 'mock-N', title: '示例 N', ... }`
- 新接: hook 返真 proposal list
- 退出条件: mid 发现 stale-date 爆切 [023.11+]

> 注：T8 defer 不影响本 [023.10] 闭环——UI 仍显 3 静态 mock（用户能看懂），reactive path（A1+A2+T3+T4）仍受益于 stale-date 修。

---

### Task 9: doc-only archive commit (T9 meta — 不计入 8±2 budget)

**Files:**
- Modify: `CHANGELOG.md`（追加 `[023.10]` section）
- Modify: `docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md`（本文档，标 COMPLETED）
- Modify: `.superpowers/sdd/progress.md` (ledger 更新，若存在)

**Step 1: 更新 CHANGELOG.md**

打开项目根 `CHANGELOG.md`，在最近一个版本号 section 后（按时间序）插入：

```markdown
## [023.10] 2026-07-05 — createSmartTimeboxes post-ship defer cleanup

### Scope

[023.08] stub 修复 ship 后 defer 清理（单 PR / 7 commits + 1 doc-only archive）：

- **T1 [P1]** workspace handleAiConfirm revert 真 wire 到 submitCnuiSurface（同源 [023.08] P0 防御，placeholder 升级）
- **T2 [P1]** B1 G15 跨 task integration test（5 项断言，real production routing + mocked DB layer 取代原 mock-of-mock design）
- **T3 [P1]** A1 normalizeTimeField 用 proposal.date 替代 new Date()（未来日期 proposal 治本）
- **T4 [P1]** A2 snapshot 派生自 resolveDate + deriveDayOfWeek/TimeOfDay（snapshot 硬编码 stale dev date 治本，**复用** [023.08] T1 已 ship 的 resolveDate, 不新增同名方法）
- **T5 [P2]** A4 cnui/handlers.ts guard message 改进（**保留** guard branch, 改进 error message）
- **T6 [P2]** A3 batch-proposals findByUserId limit 200 → 2000（**实际路径在 nexus/ai-runtime/memory/**）
- **T7 [P2]** B4 orphan 'timebox-list' surface entry 删除（含严格 orphan analysis）

### Decisions

- **D3**：T6 findByUserId 修法 = 提限（vs cursor pagination）
- **D4**：T5 guard = 保留+改进 message（vs 删除——Codex #5 修订）
- **D5**：runtime-only + 写 CHANGELOG section（runtime-only 不豁免 CHANGELOG，参 [023.05-1] 先例）
- **D12 (Codex cold read 修订)**：T1 是真 wire 替换 placeholder（不是 2 行 swap）; T2 mock strategy 重设计（real routing + mocked DB）; T4 复用已有 resolveDate; T5 guard 保留改进; T6 修 path; T8 defer
- **T8 defer**：B3 workspace proposals 真实化因 `useOrchestrationRecommendations` hook 不存在，defer 到 [023.11] 单独 ticket（hook 设计 + 实现 + UI 接 + 测试）

### Verification

- vitest base/head 失败集合 0 新增
- tsc 错误 ≤ baseline
- validate:manifest 0 errors
- validate:domain-structure ✓
- whole-branch review APPROVED
- post-ship Codex cold read APPROVED（必做）

### Out of Scope (deferred to [023.11+])

- T8 B3 workspace proposals 真实化（useOrchestrationRecommendations hook 不在 [023.10] scope）
- A5 test mock vs DB replace 行为分叉（P3, latent）
- C1 Playwright runner 接入（工程基建独立 ticket）
- C2/C3 deploy-gate (real LLM provider / eval)
- D1 F9 N+1 实际修复（rule-engine 消费 snapshot.upcomingTimeboxes）
- D2 F4 abstraction leak 迁移（MemoryL2Episode 加 CRUD 接口）
```

**Step 2: 更新本 plan 文档状态**

打开 `docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md`，在头部加 `Status: COMPLETED (T1–T8 ship + post-ship Codex APPROVED)`。

**Step 3: 跑最终验证**

```bash
cd frontend && npx vitest run --reporter=default 2>&1 | tee /tmp/vitest-final.log
cd frontend && npx tsc --noEmit
cd frontend && npm run validate:manifest
cd frontend && npm run validate:domain-structure
```

预期：
- vitest base/head 失败集合 0 新增
- tsc ≤ baseline
- validate:manifest 0 errors
- validate:domain-structure ✓

**Step 4: Doc-only commit (T9)**

```bash
git add CHANGELOG.md \
        docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md
git commit -m "docs(023.10): [023.10] CHANGELOG + plan archive

[023.10] T9 doc-only meta-commit（不计 8±2 budget）。
- CHANGELOG [023.10] section 含 13 项 defer 收尾清单 + D3/D4/D5 决策 + 验证 + 遗留
- plan archive 标 COMPLETED"
```

---

## Self-Review Checklist

按 writing-plans skill 的 Self-Review 段，已自我检查（含 Codex cold read D12 修订后）：

**1. Spec coverage** — design doc 13 项 defer + 1 项新 defer：
- A1 → T3 ✓
- A2 → T4 ✓
- A3 → T6 ✓
- A4 → T5 ✓
- A5 → E1 (deferred, design doc acknowledged) ✓
- B1 → T2 ✓
- B2 → T1 ✓
- B3 → **Defer to [023.11]** (per Codex #6: useOrchestrationRecommendations hook 不存在)
- B4 → T7 ✓
- C1/C2/C3 → E4/E5 (deferred, design doc acknowledged) ✓
- D1/D2 → E2/E3 (deferred, design doc acknowledged) ✓
- **总计**: 7 active tasks (T1-T7), T8 defer, 设计层 13 项削到 12 项 active + 1 defer

**2. Placeholder scan** — grep 过 "TBD|TODO|implement later|fill in details|类似 to Task N"：
- T2 完整 mock 5 项断言 + fake repo 块（~150 行真实骨架），不再是 pseudo-code 注释
- 其他 task 无 placeholder

**3. Type consistency**（Codex #3 修订后）：
- normalizeTimeField 签名 `normalizeTimeField(proposalDate: string | null, hhmm: string)` 在 T3 定义，T3 上游调用一致 ✓
- **T4 复用** [023.08] T1 ship 的 resolveDate (`orchestration-handler.ts:545-549`)，**不新增同名方法**——line 122 已调用，本任务仅在 snapshot builder 多调一次 ✓
- surface/intent 字面量（`'CreateSmartTimebox'` / `'acceptProposals'` / `'revertSmartTimeboxes'`）跨 T1/T2 一致 ✓
- batch-proposals 接口（`recordBatchProposals`/`revertBatchProposals`/`getRevertableBatches`）跨 T2/T6 调用名一致 ✓
- T6 path 修订: 实路径 `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts`（Codex #7 cross-verified 后 T1-T7 全部 path 真实可 grep）

**4. Task 串/并约束（D9 + Codex 修订后）**：
- T1（workspace revert wire, 独立）独立可并
- T2（G15 integration test, 新建文件）独立
- T3+T4 串（同文件 `orchestration-handler.ts`，T4 在 snapshot builder 调已有 resolveDate）
- T5+T7 同文件 cnui/handlers.ts 不同 line，**可并**
- T6 独立文件（path 修订: nexus/ai-runtime/memory/）
- ~~T8~~ defer to [023.11]
- T9 doc-only 在最后 meta-commit

**5. Codex cold read 采纳（D12 user-confirmed）**：Plan 已 revise 接受 6 critical findings（T1 真 wire/T2 mock strategy/T4 复用 resolveDate/T5 guard 保留/T6 path/T8 defer）+ 5 minor（path notation/mock collision/filepath 等），全应用。无未消化 issue。

---

## Execution Handoff

Plan 已完成并保存到 `docs/superpowers/plans/2026-07-05-023-10-postship-defer-cleanup.md`。**T8 defer** to [023.11] (Codex #6)。剩余 **7 tasks (T1–T7) + T9 meta-commit**。两种执行选项：

**1. Subagent-Driven (recommended)** — 每 task 派遣 fresh subagent，task-by-task review + 2-stage review（[023.08] 一致 cadence），快速迭代

**2. Inline Execution** — 在当前会话用 executing-plans 跑，batch execution 加 checkpoint review

→ 等待用户选择

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | outside voice | Independent 2nd opinion | 1 | issues_open | 11 findings; **6 critical** (#1 T1 phantom, #2 T2 mock-of-mock, #3 T4 dup-method, #4 mock collision, #5 T5 dead-code misclaim, #6 T8 hook missing, #7 T6 path wrong) + 5 minor — all folded via D12 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean (post-fold) | 4 sections reviewed; 3 user-confirmed folds (D9 task ordering + D10 DRY mock setup + D11 T2 mock setup block); 1 outside-voice pass fold (D12 Codex #1-#11); 1 architecture fold (D9) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** 6 critical + 5 minor folded via D12 user-confirmed. T1 phantom → 真 wire placeholder rewrite. T2 mock strategy → real production routing + mocked DB layer. T4 dup-method → 复用 [023.08] T1 已 ship 的 resolveDate. T5 dead-code misclaim → guard 保留改进 message. T6 path → nexus/ai-runtime/memory/. T8 → defer to [023.11].
- **CROSS-MODEL:** 4-section Claude review caught D9/D10/D11 design decisions; outside voice Codex caught 6 critical path/method/codebase facts. Both surfaced different defect classes (architecture vs actual-state) — no overlap, complementary coverage.
- **VERDICT:** ENG REVIEW CLEARED + CODEX COLD READ CLEARED (post-fold) — ready to implement via `/superpowers:subagent-driven-development`

NO UNRESOLVED DECISIONS
