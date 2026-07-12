# [028] 今日行动计划提案 ScheduleProposal Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v2 修订（2026-07-11）**：应用 plan-eng-review（6 findings）+ codex outside voice（15 findings）全部 fold-ins。v1 的代码事实错误（Repository 接口名 / TemplateRow 字段名 / handle 无 aiRuntime / manifest contexts 漏 / 5维数学）已修正，fold-ins 已融入对应 task。原 v1 末尾的 `## Implementation Tasks (fold-ins)` section 已全部应用到主任务，保留 `## v2 Changelog` 作审计。

**Goal:** 用 `/ScheduleProposal`（今日行动计划提案）替代并退役 `smartTimeboxes`，实现四源归集（模板 + 约定 + 任务 + NL）+ §04 硬规则词典序 Tier0/1/2 编排 + NL 一次结构化输出（结构性置信度）+ rule-based 5 维评分，1 PR / ~9-10 commits / 零 DDL。

**Architecture:** Approach A minimal viable — 复用 `[023.08]` 基础设施（`CreateSmartTimebox` surface / `AIOrchestratePanel` / batch undo / rule-engine），重写 `orchestration-handler` 的编排算法（2 源线性贪心 → 4 源 + §04 硬规则 + Tier0/1/2），新增 NL 结构化输出 + 评分。`ScheduleProposal` 是 timebox 域 generative action，复用 `timeboxes` 表，不新建表。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Tailwind 4, Drizzle ORM 0.45.1, Vitest, Playwright, zod

**Design doc SSOT:** `~/.gstack/projects/walker2002-lifeware/walker-main-design-20260711-028-schedule-proposal.md`（APPROVED，spec review 2 轮 PASS 8.5/10）

## Global Constraints

- **~9-10 commits on main**, 1 PR（对齐 `[023.07]`/`[023.08]`/`[023.09]` cadence）
- **TDD 链**：每 task 先写 failing test，再实现
- **零 DDL**：`ScheduleProposal` 是 generative action，复用 `timeboxes` 表（status 是 `text({enum:[]})` 非 PG enum）
- **复用** `[023.08]` 基础设施，不重写 surface/panel/undo
- **§04 硬规则词典序**（不做 §03.3 加权，design doc P2）
- **不动** DB schema / USOM 核心类型 / CHANGELOG（runtime-only）
- **测试基线**：base/head 失败集合对比 0 新增
- **tsc 零新增**（**v2 baseline 修正**：当前 base **199 errors**，原 hardcode `73` 已 stale——plan 写完后 main 上其他 commit 累积 126 个 tsc error，与 [028] 无关。**应用 [feedback_change-gate-baseline] 原则**：focus diff / 被改文件 0 新增，不看绝对数字）
- **pre-push hooks 全过**（`validate:manifest 0 errors`、`validate:domain-structure ✓`）
- **中文注释 + @file/@brief header**（CLAUDE.md §5）
- **Vitest 必须在 `frontend/` cwd 跑**（`@/` 映射，repo root 假失败，learning `feedback_vitest-pitfalls`）
- **Vitest 不做 TS 类型检查**（配 tsc 双验证）
- **TZ canonical UTC**（[023.09] 已就位，「当日」边界用 UTC 一致）
- **pre-merge gate 含 `npm run dev` + curl smoke**（Server Action async export 陷阱，learning `server-action-async-pre-push`）
- **T9 是 6 注册点 + 3 关注点**（design doc 集成检查清单，最高频陷阱 `project-cnui-surface-dual-registration`）
- **R12 是 dead parameter 非 bug**（`getRevertableBatches` filter 不含 sessionId，batch-proposals.ts:233-242），T9 统一 SESSION_KEY 作代码一致性改进，不作 bug fix
- **v2 A1/A2 隔离 IRON RULE（fold-in）**：`scheduleProposal`（新 4 源 + §04 硬规则 + Tier0/1/2）与 `adjustRemainingTimeboxes`（旧 2 源 habits+tasks + 词典序 + 线性贪心）**共享 `TimeboxOrchestrationHandler` 类，靠 `handle(request)` 读 `request.intent.action` 注入策略参数区分**。`adjustRemainingTimeboxes` 必须有回归测试断言「旧 2 源 + 词典序 + 线性贪心」不变（学 [023.09] baseline 铁律）

## 现有基础设施复用（important context for implementer）

| 已有 | 路径 | 用途 |
|---|---|---|
| `createTimeboxHandlers(deps)` | `frontend/src/domains/timebox/handlers/index.ts:33-41` | T9 加 `scheduleProposal` entry（map key 须与 manifest action 同名） |
| `TimeboxOrchestrationHandler` | `frontend/src/domains/timebox/handlers/orchestration-handler.ts:118` | T2/T3/T4 改 `buildTimeboxItems`/`sortItems`/`generateProposals`（策略参数隔离 A1/A2） |
| `batch undo`（record/revert/getRevertable） | `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts:125/150/224` | T9 复用，`recordBatchProposals` action 字段改 scheduleProposal |
| `rule-engine` + `TimeOverlapRule` | `frontend/src/nexus/core/rule-engine/` | T7 评分复用 `detectConflicts` warning |
| `registerAllProviders` + lazy gate | `frontend/src/nexus/context-engine/register-providers.ts:65/141` | T1 新 provider 须在函数体内注册 |
| `cnuiRegistry.getHandler` | `frontend/src/nexus/ai-runtime/cnui/registry.ts:67` | T9 R11：硬编码 `timeboxCnuiHandler` |
| `timeboxCnuiHandler`（open/submit action 分支） | `frontend/src/domains/timebox/cnui/handlers.ts:80` | T9 加 `scheduleProposal` 分支 |
| `surfaceHandlers` map | `frontend/src/domains/timebox/cnui/handlers.ts:812` | T9 加 `'schedule-proposal'` surface |
| `CreateSmartTimebox` surface + `AIOrchestratePanel` | `frontend/src/domains/timebox/cnui/surfaces/CreateSmartTimebox.tsx` | T9 改名复用为 `ScheduleProposal` surface |
| `archetype-matcher`（LLM gateway） | `frontend/src/domains/timebox/lib/archetype-matcher.ts` | T5 复用 gateway，不复用单射逻辑 |
| `ArchetypePicker` 组件 | `frontend/src/components/archetype/archetype-picker.tsx:34` | T6 needConfirm 复用（props `{value,onChange,readOnly,enableAiMatch,title,variant}`） |
| `EditTimeboxes` 编辑组件 | `frontend/src/domains/timebox/cnui/surfaces/EditTimeboxes.tsx` | T8 defer（MVP 用 accept/reject） |

**关键事实（v2 reviewer 读码验证 — implementer 必读）**：
- **Repository 是裸 class，无 I 接口**（fold-in T1-fix）：`AppointmentRepository` @ `frontend/src/domains/timebox/repository/appointment.ts:27`；`TimeboxTemplateRepository` @ `frontend/src/lib/db/repositories/timebox-template.ts:54`。T1 import 用裸 class，**不要**用不存在的 `IAppointmentRepository`/`ITimeboxTemplateRepository`
- `AppointmentRepository.findByDateRange(start, end, userId)`（appointment.ts:100-109）已 `inArray status NON_TERMINAL=['scheduled']` 过滤——**只返 scheduled**。AppointmentsProvider **去冗余** `.filter(cancelled)`（fold-in T1-fix）；决策：completed 仍占时段（防排到已过时段），但 findByDateRange 不返 completed，故 provider 层无需额外处理
- `TimeboxTemplateRepository.findByUser(userId)`（timebox-template.ts:64）返 `TimeboxTemplate[]`（含 `daysOfWeek: number[]` + `rows: TemplateRow[]`）。**TemplatesProvider 必须 `flatMap(t => t.rows.map(r => ...))`**（fold-in T1-fix），不是 `map`
- **TemplateRow 字段名**（schema.ts:734-751，fold-in T1-fix）：`defaultStart: string`(HH:MM)、`defaultDuration: number`、`earliestStart?: string|null`(HH:MM)、`latestStart?: string|null`(HH:MM)、`shortestDuration?: number|null`（**非** `minDuration`）、`source: TemplateRowSource`('habit'|'task'|'thread'|'custom'，**非** `sourceType`)、`activityArchetypeId?: string|null`
- **`handle()` 无 aiRuntime**（orchestration-handler.ts:125，fold-in T5/T6-fix）：签名 `handle(request: GenerationRequest)`；`onGenerate(request, aiRuntime)`（:152）才有 aiRuntime。**NL 解析（需 LLM）必须在 `onGenerate`**，不能在 `handle`
- `cnui/handlers.ts:119` open path `` sessionId: `timebox-${action}` ``（`createSmartTimeboxes` → `timebox-createSmartTimeboxes` 复数）
- `cnui/handlers.ts:465` submit/record path `sessionId: 'timebox-createSmartTimebox'`（**单数**）→ R12 单复数不一致（dead parameter，功能无害）
- `cnui/handlers.ts:523-539` `createSmartTimeboxes` submit 已返回「intent 已弃用」（半退役）
- `cnui/handlers.ts:544` `revertSmartTimeboxes` 独立 action 分支（撤销路径，T9 须保留）
- `orchestration-handler.ts` `TimeboxItem` 接口（~line 48-63）**缺 `earliestStart`/`latestStart`/`minDuration`**（T2 须加，T4 Tier2 依赖；类型是 UTC hour `number`，从 TemplateRow HH:MM string 转换）
- `register-providers.ts` 6 capability 无 appointment/template（T1 从零建）
- `recordBatchProposals`（batch-proposals.ts:125/132）硬编码 `action: 'createSmartTimeboxes'`（T9 须改 `'scheduleProposal'`）
- **manifest K-block `create-smart-timebox` surface**（manifest.yaml:360）handler `./cnui/handlers`——T9 **保留**（`revertSmartTimeboxes` 撤销历史 batch 引用不断）；新增 `schedule-proposal` surface 给 scheduleProposal 用

---

## File Structure

**Create:**
- `frontend/src/domains/timebox/providers/appointments-provider.ts` — 约定上下文 provider（T1）
- `frontend/src/domains/timebox/providers/templates-provider.ts` — 模板上下文 provider（T1）
- `frontend/src/domains/timebox/lib/schedule-rules.ts` — §04 硬规则词典序排序纯函数（T3）
- `frontend/src/domains/timebox/lib/tier-scheduler.ts` — Tier0/1/2 槽位分配纯函数（T4）
- `frontend/src/domains/timebox/lib/nl-parser.ts` — NL 结构化输出 + 结构性置信度（T5）
- `frontend/src/domains/timebox/lib/schedule-score.ts` — 5 维 rule-based 评分纯函数（T7）
- `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx` — 今日提案 surface（T9，由 CreateSmartTimebox 改名/扩展）
- `frontend/src/domains/timebox/__tests__/schedule-rules.test.ts`（T3）
- `frontend/src/domains/timebox/__tests__/tier-scheduler.test.ts`（T4）
- `frontend/src/domains/timebox/__tests__/nl-parser.test.ts`（T5）
- `frontend/src/domains/timebox/__tests__/schedule-score.test.ts`（T7）

**Modify:**
- `frontend/src/domains/timebox/providers/timebox-provider.ts` — 过滤 cancelled（T1/R14）
- `frontend/src/nexus/context-engine/register-providers.ts` — 注册 2 新 provider + zod schema（T1/R16）
- `frontend/src/domains/timebox/handlers/orchestration-handler.ts` — `TimeboxItem` 加字段 + `buildTimeboxItems`/`sortItems`/`generateProposals` 加策略参数 + 接入 schedule-rules/tier-scheduler（T2/T3/T4）
- `frontend/src/domains/timebox/handlers/index.ts` — `createTimeboxHandlers` 加 `scheduleProposal`（T9/R13）
- `frontend/src/domains/timebox/cnui/handlers.ts` — open/submit 加 `scheduleProposal` 分支（**自含 batch recording**） + surfaceHandlers 加 entry + R12 统一 SESSION_KEY（T9/R11/R12）
- `frontend/src/nexus/ai-runtime/cnui/registry.ts` — `getHandler` 支持复用 `timeboxCnuiHandler`（T9/R11，评估后零改动）
- `frontend/src/domains/timebox/index.ts` — server 端注册 `schedule-proposal` surface（T9 注册点 5）
- `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts` — client 端注册（T9 注册点 6，**最高频陷阱**）
- `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts` — `recordBatchProposals` action 字段 `createSmartTimeboxes` → `scheduleProposal`（T9，fold-in 加入 Files）
- `frontend/src/domains/timebox/manifest.yaml` — A-block `createSmartTimeboxes`→`scheduleProposal` trigger + I-block generation action **contexts 加 appointments+templates** + K-block 加 `schedule-proposal` surface（保留 `create-smart-timebox`）（T1/T9）
- `frontend/src/app/actions/intent.ts` — `/smartTimeboxes` 旧 shortcut 重定向到 `scheduleProposal`（T10，**从零写**，无现有 createSmartTimeboxes 接线）
- `frontend/src/domains/timebox/components/timeboxes-workspace.tsx` — 「新建今日计划」按钮入口（T10）
- `mydocs/dev/028-时间盒智能编排规则处理.md` — §03.3 标 superseded by §04（design doc What I noticed 建议）

---

## 编排 Pipeline 总览（fold-in C1 ASCII 图）

```
                          ┌──────── 4 源 Context Provider (T1) ────────┐
                          │  appointments(Tier0)  templates  tasks  habits │
                          │         + NL(T5, onGenerate 注入 contexts)     │
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                          ┌── buildTimeboxItems(materials, strategy) (T2) ──┐
                          │  scheduleProposal: 4 源→items + Tier0 提取      │
                          │  adjustRemaining : 旧 2 源(habits+tasks)→items   │  ← A1/A2 隔离
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                          ┌── sortItems(items, strategy) (T3) ───────────┐
                          │  scheduleProposal: sortByHardRules §04 词典序  │
                          │    (截止紧迫 > 能量匹配 > timebox lock > OKR)   │
                          │  adjustRemaining : legacy 词典序               │
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                          ┌── generateProposals→scheduleByTiers (T4) ────┐
                          │  Tier0(约定)剔除 → Tier1 主游标线性 → Tier2 窗口 │
                          │  舍弃→ITEM_UNSCHEDULABLE warning               │
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                          ┌── scoreSchedule(proposals) (T7) ─────────────┐
                          │  5 维归一 0-10 等权平均（空集 guard / 数据不可得跳过）│
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                          ┌── needConfirm? (T6) ─────────────────────────┐
                          │  NL 低置信(<0.6) → ArchetypePicker needConfirm │
                          │  Tier0 改时意图 → appointment handoff(defer 倾向)│
                          └──────────────────────┬───────────────────────┘
                                                 ▼
                                   GenerationResult(proposals + warnings + score)
```

> **代码注释同步**：`orchestration-handler.ts` 的 `handle()` 顶部加此 pipeline 注释（简化版），帮助读码者定位每步对应方法。

---

## Task 1: 四源 Context Provider（Appointments + Templates）+ cancelled 过滤 + manifest contexts

**Files:**
- Create: `frontend/src/domains/timebox/providers/appointments-provider.ts`
- Create: `frontend/src/domains/timebox/providers/templates-provider.ts`
- Modify: `frontend/src/domains/timebox/providers/timebox-provider.ts:30-48`（过滤 cancelled，R14）
- Modify: `frontend/src/domains/timebox/providers/index.ts`（export 新 provider）
- Modify: `frontend/src/nexus/context-engine/register-providers.ts`（注册 + zod schema，R16/M-2）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（**fold-in T1-manifest-fix**：`generation_actions.scheduleProposal.contexts` 加 `appointments`+`templates`）
- Test: `frontend/src/domains/timebox/__tests__/appointments-provider.test.ts`
- Test: `frontend/src/domains/timebox/__tests__/templates-provider.test.ts`

**Interfaces（v2 修正 fold-in T1-fix）:**
- Consumes: **裸 class** `AppointmentRepository`（`frontend/src/domains/timebox/repository/appointment.ts:27`，`findByDateRange(start, end, userId)` 已过滤 scheduled）、**裸 class** `TimeboxTemplateRepository`（`frontend/src/lib/db/repositories/timebox-template.ts:54`，`findByUser(userId)` 返 `TimeboxTemplate[]`）
- Produces: `AppointmentsProvider`（query: `appointments_for_date`）、`TemplatesProvider`（query: `templates_for_date`）；contexts key `appointments` / `templates`

- [ ] **Step 1: Write the failing test — appointments provider**

```typescript
// frontend/src/domains/timebox/__tests__/appointments-provider.test.ts
/** @file appointments-provider.test @brief [028] T1 约定上下文 provider 测试 */
import { describe, it, expect, vi } from 'vitest'
import { AppointmentsProvider } from '../providers/appointments-provider'

describe('AppointmentsProvider', () => {
  it('query !== appointments_for_date 返回空数组', async () => {
    const provider = new AppointmentsProvider({} as any)
    const result = await provider.provide('other_query', { date: '2026-07-11', userId: 'u1' })
    expect(result).toEqual([])
  })

  it('返回当日约定（findByDateRange 已过滤 scheduled，作 Tier0 占用）', async () => {
    // fold-in T1-fix：findByDateRange 已 inArray status=['scheduled'] 过滤，
    // provider 不再冗余 .filter(cancelled)。返 startTime/endTime/title。
    const repo = {
      findByDateRange: vi.fn().mockResolvedValue([
        { id: 'a1', title: '牙医', startTime: '2026-07-11T02:00:00Z', endTime: '2026-07-11T03:00:00Z', status: 'scheduled' },
      ]),
    } as any
    const provider = new AppointmentsProvider(repo)
    const result = await provider.provide('appointments_for_date', { date: '2026-07-11', userId: 'u1' })
    expect(repo.findByDateRange).toHaveBeenCalledOnce()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'a1', title: '牙医' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/appointments-provider.test.ts`
Expected: FAIL（`AppointmentsProvider` 未定义）

- [ ] **Step 3: Implement AppointmentsProvider（fold-in T1-fix：裸 class + 去冗余 filter）**

```typescript
// frontend/src/domains/timebox/providers/appointments-provider.ts
/** @file appointments-provider @brief [028] T1 约定（appointment）上下文 provider — 作 Tier0 硬占用 */
import type { ContextProvider } from '@/usom/types/process'
// fold-in T1-fix：裸 class，非 IAppointmentRepository（不存在）
import { AppointmentRepository } from '@/domains/timebox/repository/appointment'
import type { USOM_ID } from '@/usom/types/primitives'

export class AppointmentsProvider implements ContextProvider {
  // 注：构造参类型用裸 class（T1-fix）。findByDateRange 已 inArray status=['scheduled']
  // 过滤（appointment.ts:100-109），provider 不再冗余 .filter(cancelled)。
  constructor(private readonly repo: InstanceType<typeof AppointmentRepository>) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'appointments_for_date') return []
    const { date, userId } = params as { date: string; userId: USOM_ID }
    // 「当日」边界用 UTC（[023.09] TZ canonical）
    const dayStart = `${date}T00:00:00Z`
    const dayEnd = `${date}T23:59:59Z`
    const appts = await this.repo.findByDateRange(dayStart, dayEnd, userId)
    // Tier0 占用：startTime/endTime 原样透传（已是 ISO UTC string），T2 提取为硬占用槽
    return appts.map(a => ({
      id: a.id, title: a.title,
      startTime: a.startTime, endTime: a.endTime, status: a.status,
    }))
  }
}
```

- [ ] **Step 4: TemplatesProvider（fold-in T1-fix：flatMap rows + shortestDuration + daysOfWeek 过滤）**

```typescript
// frontend/src/domains/timebox/__tests__/templates-provider.test.ts（先写测试）
/** @file templates-provider.test @brief [028] T1 时间盒模板上下文 provider 测试 */
import { describe, it, expect, vi } from 'vitest'
import { TemplatesProvider } from '../providers/templates-provider'

describe('TemplatesProvider', () => {
  it('flatMaps t.rows（非 t 本身）+ 按 daysOfWeek 过滤当日', async () => {
    // fold-in T1-fix：findByUser 返 TimeboxTemplate[]（含 rows: TemplateRow[]）；
    // 周三(3)只返 daysOfWeek 含 3 的模板行
    const repo = {
      findByUser: vi.fn().mockResolvedValue([
        { id: 't1', name: '工作日', daysOfWeek: [1,2,3,4,5], rows: [
          { id: 'r1', activityName: '深度工作', defaultStart: '09:00', defaultDuration: 120,
            earliestStart: '08:00', latestStart: '11:00', shortestDuration: 60,
            activityArchetypeId: 'ar1', source: 'custom' },
        ]},
        { id: 't2', name: '周末', daysOfWeek: [0,6], rows: [
          { id: 'r2', activityName: '休闲', defaultStart: '10:00', defaultDuration: 60, source: 'custom' },
        ]},
      ]),
    } as any
    const provider = new TemplatesProvider(repo)
    // 2026-07-15 是周三（getUTCDay()=3）
    const result = await provider.provide('templates_for_date', { date: '2026-07-15', userId: 'u1' })
    expect(result).toHaveLength(1)
    expect((result[0] as any).id).toBe('r1')  // 只 r1（工作日含周三）
    expect((result[0] as any)).toHaveProperty('shortestDuration')  // 非 minDuration
  })

  it('earliestStart/latestStart 透传为 HH:MM string（T2 转 UTC hour）', async () => {
    const repo = { findByUser: vi.fn().mockResolvedValue([
      { id: 't1', daysOfWeek: [3], rows: [{ id: 'r1', activityName: 'x', defaultStart: '09:00',
        defaultDuration: 120, earliestStart: '08:00', latestStart: '11:00', source: 'custom' }] },
    ]) } as any
    const result = await new TemplatesProvider(repo).provide('templates_for_date', { date: '2026-07-15', userId: 'u1' })
    expect((result[0] as any).earliestStart).toBe('08:00')  // string，T2 buildTimeboxItems 转 number
    expect((result[0] as any).latestStart).toBe('11:00')
  })
})
```

```typescript
// frontend/src/domains/timebox/providers/templates-provider.ts
/** @file templates-provider @brief [028] T1 时间盒模板上下文 provider — 用户日常时间规律 */
import type { ContextProvider } from '@/usom/types/process'
// fold-in T1-fix：裸 class
import { TimeboxTemplateRepository, type TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import type { USOM_ID } from '@/usom/types/primitives'

export class TemplatesProvider implements ContextProvider {
  constructor(private readonly repo: InstanceType<typeof TimeboxTemplateRepository>) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'templates_for_date') return []
    const { date, userId } = params as { date: string; userId: USOM_ID }
    const templates: TimeboxTemplate[] = await this.repo.findByUser(userId)

    // fold-in T1-fix：按当日星期过滤（UTC midday parse 避 TZ 漂移，[023.10] deriveDayOfWeek 同源）
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
    const matched = templates.filter(t => (t.daysOfWeek ?? []).includes(dayOfWeek))

    // fold-in T1-fix：flatMap(t.rows)（非 map(t)）；字段名对齐 TemplateRow（schema.ts:734）
    // earliestStart/latestStart 是 HH:MM string|null 透传，T2 buildTimeboxItems 转 UTC hour number
    return matched.flatMap(t => t.rows.map(r => ({
      id: r.id,
      title: r.activityName,
      defaultStart: r.defaultStart,
      defaultDuration: r.defaultDuration,
      earliestStart: r.earliestStart ?? null,    // HH:MM string|null
      latestStart: r.latestStart ?? null,         // HH:MM string|null
      shortestDuration: r.shortestDuration ?? null,  // 非 minDuration
      activityArchetypeId: r.activityArchetypeId ?? null,
      source: r.source,                           // 非 sourceType
    })))
  }
}
```

- [ ] **Step 5: TimeboxProvider 过滤 cancelled（R14）**

在 `timebox-provider.ts:39-47` 的 `timeboxes.map` 前加 `.filter(t => t.status !== 'cancelled')`。

- [ ] **Step 6: 注册新 provider（register-providers.ts，M-2 lazy gate）**

在 `registerAllProviders(deps)` 函数体内（`if (deps.habitRepo)` 块之后、`energyCurve` 注册之前）加：

```typescript
  // fold-in T1-fix：ProviderDeps 用裸 class 类型
  if (deps.appointmentRepo) {
    registerContextCapability({
      id: 'appointments',
      visibility: 'planning',
      schema: z.array(z.object({
        id: z.string(), title: z.string(),
        startTime: z.string(), endTime: z.string(), status: z.string(),
      })),
      description: '当日约定（Tier0 硬占用）',
      provider: new AppointmentsProvider(deps.appointmentRepo),
    })
  }
  if (deps.templateRepo) {
    registerContextCapability({
      id: 'templates',
      visibility: 'planning',
      // fold-in T1-fix：schema 对齐 TemplateRow 字段名
      schema: z.array(z.object({
        id: z.string(), title: z.string(),
        defaultStart: z.string(), defaultDuration: z.number(),
        earliestStart: z.string().nullable(), latestStart: z.string().nullable(),
        shortestDuration: z.number().nullable(),
        activityArchetypeId: z.string().nullable(), source: z.string(),
      })),
      description: '时间盒模板行（flatMapped）',
      provider: new TemplatesProvider(deps.templateRepo),
    })
  }
```

`ProviderDeps` 接口加 `appointmentRepo?: InstanceType<typeof AppointmentRepository>` + `templateRepo?: InstanceType<typeof TimeboxTemplateRepository>`。`ensureProvidersRegistered()`（line 142-149）补 `appointmentRepo: new AppointmentRepository()` + `templateRepo: new TimeboxTemplateRepository()`。import 补 `import { AppointmentsProvider, TemplatesProvider } from '@/domains/timebox/providers'` + `import { AppointmentRepository } from '@/domains/timebox/repository/appointment'` + `import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'`。

- [ ] **Step 7: manifest generation_actions contexts（fold-in T1-manifest-fix — codex 第7个静默失败）**

> ⚠️ **关键**：不加则 `collectMaterials` 拿不到 appointments/templates contexts → 4 源变 2 源**无报错**（静默退化）。

把 manifest I-block（line 314）的 `createSmartTimeboxes:` 重命名为 `scheduleProposal:`，并在 `contexts` 列表加 2 项：

```yaml
generation_actions:
  scheduleProposal:
    description: 今日行动计划提案，四源归集（模板+约定+任务+NL）+ §04 硬规则 + Tier0/1/2 编排
    contexts:
      - id: existingTimeboxes
        query: timeboxes_for_date
        params: [date, userId]
      - id: activeTasks
        query: active_with_details
        params: [userId]
      - id: pendingHabits
        query: unlogged_for_date
        params: [date, userId]
      - id: energyCurve
        query: energy_curve
        params: []
      # fold-in T1-manifest-fix：补 appointments + templates（否则 4 源变 2 源静默退化）
      - id: appointments
        query: appointments_for_date
        params: [date, userId]
      - id: templates
        query: templates_for_date
        params: [date, userId]
    response_mode: cnui
    cnui_surface_type: schedule-proposal   # 新 surface（K-block T9 加）
    session_enabled: true
  adjustRemainingTimeboxes:
    # 沿用旧 4 contexts（不含 appointments/templates）— A1/A2 隔离，旧路径不变
    ...
```

- [ ] **Step 8: Run tests + tsc + validate:manifest**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/appointments-provider.test.ts src/domains/timebox/__tests__/templates-provider.test.ts && npx tsc --noEmit | grep -c "error TS" && npm run validate:manifest 2>&1 | tail -3`
Expected: tests PASS；tsc ≤ 73；validate:manifest 0 errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/domains/timebox/providers/ frontend/src/nexus/context-engine/register-providers.ts frontend/src/domains/timebox/manifest.yaml frontend/src/domains/timebox/__tests__/appointments-provider.test.ts frontend/src/domains/timebox/__tests__/templates-provider.test.ts
git commit -m "feat(028): T1 四源 Context Provider（Appointments+Templates，flatMap/shortestDuration/daysOfWeek）+ manifest contexts 补全 [R14/R16/T1-fix/T1-manifest-fix]"
```

---

## Task 2: buildTimeboxItems 扩 4 源 + Tier0 占用提取 + TimeboxItem 时间窗字段 + A1/A2 隔离

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（`TimeboxItem` 接口 ~line 48 + `collectMaterials` ~line 185 + `buildTimeboxItems` ~line 196 + `handle` 策略分发 ~line 125 + `extractOccupiedSlots` 复用）
- Test: `frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts`（扩 4 源 case + **adjustRemainingTimeboxes 回归 IRON RULE**）

**Interfaces（v2 fold-in T2-fix）:**
- Consumes: T1 的 `appointments`/`templates` contexts；现有 `pendingHabits`/`activeTasks`/`existingTimeboxes`
- Produces: `buildTimeboxItems(materials, strategy)` 返回 `{ items: TimeboxItem[], tier0Slots: TimeSlot[] }`（scheduleProposal 4 源 + Tier0 提取）；`adjustRemainingTimeboxes` 走旧 2 源（strategy='legacy'）

- [ ] **Step 1: Write failing tests — 4 源归集 + Tier0 提取 + earliestStart 类型转换 + adjustRemaining 回归 IRON RULE**

```typescript
// orchestration-handler.test.ts 扩展
describe('[028] T2 buildTimeboxItems 四源归集（scheduleProposal）', () => {
  it('templates + appointments + tasks + habits 全部进 items（appointments 转 Tier0）', () => {
    const handler = new TimeboxOrchestrationHandler()
    const materials = {
      pendingHabits: [{ id: 'h1', title: '冥想', todayLogged: false, frequency: { type: 'daily' } }] as any,
      activeTasks: [{ id: 't1', title: '写报告', priority: 'P1', energyRequired: 'high' }] as any,
      existingTimeboxes: [],
      energyCurve: { peakHours: [9], lowHours: [14] },
      appointments: [{ id: 'a1', title: '牙医', startTime: '2026-07-11T02:00:00Z', endTime: '2026-07-11T03:00:00Z', status: 'scheduled' }] as any,
      // fold-in T1-fix 形状：earliestStart/latestStart 是 HH:MM string
      templates: [{ id: 'tm1', title: '深度工作', defaultStart: '09:00', defaultDuration: 120,
        earliestStart: '08:00', latestStart: '11:00', shortestDuration: 60,
        activityArchetypeId: 'ar1', source: 'custom' }] as any,
    }
    const { items, tier0Slots } = (handler as any).buildTimeboxItems(materials, 'schedule')
    // habits + tasks + templates 进 items（appointments 是 Tier0 不进 items）
    expect(items.length).toBe(3)
    expect(items.map((i: any) => i.sourceType).sort()).toEqual(['habit', 'task', 'template'])
    // Tier0 约定提取为硬占用槽（UTC hour）
    expect(tier0Slots).toHaveLength(1)
    expect(tier0Slots[0]).toMatchObject({ startHour: 2, endHour: 3 })
    // fold-in T2-fix：earliestStart/latestStart/minDuration 字段存在且是 number（UTC hour）
    const tmpl = items.find((i: any) => i.sourceType === 'template')
    expect(tmpl).toHaveProperty('earliestStart')   // 8（从 '08:00' 转）
    expect(tmpl).toHaveProperty('latestStart')     // 11（从 '11:00' 转）
    expect(tmpl).toHaveProperty('minDuration')     // 60（从 shortestDuration）
    expect(tmpl.earliestStart).toBe(8)
    expect(tmpl.latestStart).toBe(11)
    expect(tmpl.minDuration).toBe(60)
  })
})

// fold-in T2-fix IRON RULE：adjustRemainingTimeboxes 回归测试
describe('[028] T2 adjustRemainingTimeboxes 回归 IRON RULE（A1/A2 隔离）', () => {
  it('legacy 策略：仍只吃 2 源（habits+tasks），不含 templates/appointments', () => {
    const handler = new TimeboxOrchestrationHandler()
    const materials = {
      pendingHabits: [{ id: 'h1', title: '冥想', todayLogged: false }] as any,
      activeTasks: [{ id: 't1', title: '写报告', priority: 'P1' }] as any,
      existingTimeboxes: [], energyCurve: { peakHours: [9], lowHours: [14] },
      appointments: [{ id: 'a1', title: '牙医', startTime: '2026-07-11T02:00:00Z', endTime: '2026-07-11T03:00:00Z' }] as any,
      templates: [{ id: 'tm1', title: '深度工作', defaultStart: '09:00', defaultDuration: 120 }] as any,
    }
    const { items, tier0Slots } = (handler as any).buildTimeboxItems(materials, 'legacy')
    // IRON RULE：legacy 只有 habits+tasks（2 源），无 template，无 tier0 提取
    expect(items.length).toBe(2)
    expect(items.map((i: any) => i.sourceType).sort()).toEqual(['habit', 'task'])
    expect(tier0Slots).toHaveLength(0)  // legacy 不提取 Tier0
  })

  it('legacy 策略：sortItems 仍是旧词典序（priority+sourceType），generateProposals 仍线性贪心', () => {
    // 完整 handle('adjustRemainingTimeboxes') 走 legacy 全链，断言 proposals 顺序 + 游标线性
    // （复用 [023.07] baseline 断言范式）
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/orchestration-handler.test.ts -t "T2"`
Expected: FAIL（`appointments`/`templates` 不在 materials / strategy 参数未加 / tier0Slots 未返回）

- [ ] **Step 3: Implement — TimeboxItem 加字段 + HH:MM→hour 转换 + buildTimeboxItems 策略隔离**

`TimeboxItem` 接口加字段（类型是 UTC hour `number`，**不是** HH:MM string）：
```typescript
interface TimeboxItem {
  id: string; title: string
  sourceType: GeneratedProposal['sourceType']
  priority: string
  durationMinutes: number
  energyRequired?: string
  relatedObjectId: string
  // [028] T2 加（fold-in T2-fix 类型）：T4 Tier2 窗口调度依赖
  earliestStart?: number   // UTC hour（从 TemplateRow HH:MM string 转，默认 0）
  latestStart?: number     // UTC hour（默认 22）
  minDuration?: number     // 最小可接受时长（默认 = durationMinutes）
}
```

加 HH:MM → UTC hour number helper（fold-in T2-fix 类型转换）：
```typescript
/** HH:MM("09:00") → UTC hour number(9)；支持 "09:30"→9.5。null→undefined */
private hhmmToHour(hhmm: string | null | undefined): number | undefined {
  if (!hhmm) return undefined
  const [h, m] = hhmm.split(':').map(Number)
  return h + (m || 0) / 60
}
```

`collectMaterials` 加 `appointments` + `templates` 提取（与现有 pendingHabits/activeTasks 同构，从 contexts 取）。

`buildTimeboxItems(materials, strategy)` 改返回 `{ items, tier0Slots }`：
- **strategy='schedule'**：
  - 来源 templates：`materials.templates` 每行 → item（sourceType `'planned'`，durationMinutes=defaultDuration，**earliestStart=hhmmToHour(tmpl.earliestStart) ?? 0**，latestStart/minDuration 同理从 latestStart/shortestDuration 转，energyRequired 从 archetypeId 推导或 'medium'）
  - Tier0（appointments）：不进 items，转为 `tier0Slots`（用 `extractOccupiedSlots` 同款 UTC hour 提取——复用现有方法，appointmentsstartTime/endTime 是 ISO string）
  - habits/tasks 沿用现有逻辑（加 earliestStart/latestStart/minDuration 默认值）
- **strategy='legacy'**（adjustRemainingTimeboxes，IRON RULE）：**只**吃 habits+tasks（旧 2 源），不读 templates/appointments，tier0Slots=[]。代码复用旧 buildTimeboxItems 体

- [ ] **Step 4: handle() 策略分发（fold-in A1/A2 隔离）**

`handle(request)` 读 action 注入策略（贯穿 buildTimeboxItems/sortItems/generateProposals）：
```typescript
async handle(request: GenerationRequest): Promise<GenerationResult> {
  const action = request.intent.action  // 'scheduleProposal' | 'adjustRemainingTimeboxes' | ...
  const strategy: 'schedule' | 'legacy' = action === 'scheduleProposal' ? 'schedule' : 'legacy'
  const date = this.resolveDate(request)
  const materials = this.collectMaterials(request.contexts)
  const { items, tier0Slots } = this.buildTimeboxItems(materials, strategy)
  const sorted = this.sortItems(items, strategy)              // T3 加 strategy
  const occupied = [...this.extractOccupiedSlots(materials.existingTimeboxes), ...tier0Slots]
  const { proposals, warnings: boundWarnings } = this.generateProposals(sorted, occupied, materials.energyCurve, date, strategy)  // T4 加 strategy
  // ... detectConflicts / renderMarkdown 不变
}
```

- [ ] **Step 5: Run test to verify it passes + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/orchestration-handler.test.ts -t "T2" && npx tsc --noEmit | grep -c "error TS"`
Expected: PASS（含 IRON RULE 回归）；tsc ≤ 73

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts
git commit -m "feat(028): T2 buildTimeboxItems 扩 4 源 + Tier0 提取 + HH:MM→hour 转换 + A1/A2 策略隔离 [T2-fix]"
```

---

## Task 3: §04 硬规则词典序排序策略（替换 sortItems，R15 隔离）

**Files:**
- Create: `frontend/src/domains/timebox/lib/schedule-rules.ts`
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（`sortItems` ~line 232 加 strategy 参数，'hardRules' 委托 schedule-rules）
- Test: `frontend/src/domains/timebox/__tests__/schedule-rules.test.ts`

**Interfaces:**
- Consumes: T2 的 `TimeboxItem[]`（含 sourceType/priority/energyRequired + NL 明确时间标记 `fixedTime`）
- Produces: `sortByHardRules(items, opts): TimeboxItem[]` — §04 词典序：截止紧迫 > 能量匹配 > timebox lock > OKR 对齐
- **R15 隔离（fold-in 强化）**：`sortItems(items, strategy)` —— strategy='schedule' 调 `sortByHardRules`；strategy='legacy'（adjustRemainingTimeboxes）保留旧 `PRIORITY_WEIGHT + SOURCE_WEIGHT` 词典序

§04 硬规则词典序（design doc P2）：
1. **截止紧迫**：NL 明确指定时间的 item（`fixedTime` 字段，如「16:00 接娃」）永远排前；其次 deadline 最近的 task
2. **能量匹配**：archetype-ActivityLabel「中断容忍」标签加权；活动原型=「睡眠」固定时段
3. **timebox lock**：活动原型=「饮食」固定时段
4. **OKR 对齐**：task 优先级（P0 > P1 > P2 > P3）

- [ ] **Step 1: Write failing tests — 4 层词典序矩阵**

```typescript
// frontend/src/domains/timebox/__tests__/schedule-rules.test.ts
/** @file schedule-rules.test @brief [028] T3 §04 硬规则词典序排序 */
import { describe, it, expect } from 'vitest'
import { sortByHardRules } from '../lib/schedule-rules'

describe('sortByHardRules §04 词典序', () => {
  it('层 1 截止紧迫：NL 明确时间的永远排前', () => {
    const items = [
      { id: 'a', sourceType: 'task', priority: 'P1', title: '写报告' } as any,
      { id: 'b', sourceType: 'task', priority: 'P3', title: '接娃', fixedTime: { hour: 16 } } as any,  // NL 指定 16:00
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted[0].id).toBe('b')  // fixedTime 排前，无视 P3
  })

  it('层 2 能量匹配：睡眠原型固定，中断容忍标签加权', () => {
    // 测 archetype=睡眠 排到固定时段；中断容忍标签 item 优先于无标签
    // （具体断言依 archetype 数据，给出 min case）
  })

  it('层 3 timebox lock：饮食原型固定时段', () => {
    // archetype=饮食 的 item 锁定早/午/晚固定时段
  })

  it('层 4 OKR 对齐：同层内按 priority P0>P1>P2>P3', () => {
    const items = [
      { id: 'a', sourceType: 'task', priority: 'P3' } as any,
      { id: 'b', sourceType: 'task', priority: 'P0' } as any,
      { id: 'c', sourceType: 'task', priority: 'P1' } as any,
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted.map(i => i.priority)).toEqual(['P0', 'P1', 'P3'])
  })

  it('层间严格词典序：层 1 的低优 item 排在层 2 高优前', () => {
    const items = [
      { id: 'a', sourceType: 'task', priority: 'P3', fixedTime: { hour: 16 } } as any,  // 层 1
      { id: 'b', sourceType: 'task', priority: 'P0', archetype: '深度专注' } as any,     // 层 2/4
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted[0].id).toBe('a')  // 层 1 优先于层 4，即使 P3 < P0
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/schedule-rules.test.ts`
Expected: FAIL（`sortByHardRules` 未定义）

- [ ] **Step 3: Implement schedule-rules.ts**

实现 `sortByHardRules(items, opts)`：按 4 层 key 计算 tuple `(layer1Rank, layer2Rank, layer3Rank, layer4Rank)`，稳定排序。`fixedTime`（NL 明确时间）、archetype 标签（中断容忍/睡眠/饮食）、priority 权重从 item + opts（archetype lookup）推导。纯函数，可单测。

> 实现遵循测试矩阵（4 层 + 词典序严格性）。archetype 标签查询通过 opts.archetypeMap 注入（不直接 DB），保持纯函数。

- [ ] **Step 4: Wire into orchestration-handler.sortItems（R15 隔离）**

`sortItems` 加 strategy 参数（fold-in A1/A2 隔离）：
```typescript
private sortItems(items: TimeboxItem[], strategy: 'schedule' | 'legacy' = 'legacy'): TimeboxItem[] {
  if (strategy === 'schedule') return sortByHardRules(items, { archetypeMap: this.deps.archetypeMap ?? {} })
  // legacy（IRON RULE）：adjustRemainingTimeboxes 保留旧 PRIORITY_WEIGHT + SOURCE_WEIGHT 词典序
  return [...items].sort((a, b) => {
    const pa = PRIORITY_WEIGHT[a.priority] ?? 9
    const pb = PRIORITY_WEIGHT[b.priority] ?? 9
    if (pa !== pb) return pa - pb
    const sa = SOURCE_WEIGHT[a.sourceType] ?? 9
    const sb = SOURCE_WEIGHT[b.sourceType] ?? 9
    return sa - sb
  })
}
```
`handle()` 内已传 strategy（T2 Step 4）。`adjustRemainingTimeboxes` 因 action ≠ 'scheduleProposal' 自动走 'legacy'。

- [ ] **Step 5: Run tests + tsc + commit**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/schedule-rules.test.ts src/domains/timebox/__tests__/orchestration-handler.test.ts && npx tsc --noEmit | grep -c "error TS"
git add frontend/src/domains/timebox/lib/schedule-rules.ts frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/__tests__/schedule-rules.test.ts
git commit -m "feat(028): T3 §04 硬规则词典序排序（截止>能量>lock>OKR）+ R15 adjustRemaining legacy 隔离"
```

---

## Task 4: Tier0/1/2 槽位分配（generateProposals 改造，strategy 隔离）

**Files:**
- Create: `frontend/src/domains/timebox/lib/tier-scheduler.ts`
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（`generateProposals` ~line 266 加 strategy 参数，'schedule' 委托 tier-scheduler）
- Test: `frontend/src/domains/timebox/__tests__/tier-scheduler.test.ts`

**Interfaces:**
- Consumes: T2 的 `tier0Slots`（已合并进 occupied）+ T3 排序后的 `items` + `earliestStart`/`latestStart`/`minDuration`（UTC hour number）
- Produces: `scheduleByTiers(items, occupied, opts): { proposals: GeneratedProposal[], warnings: Warning[] }`

- [ ] **Step 1: Write failing tests — Tier0 剔除 + Tier2 窗口 + 舍弃报告**

```typescript
// frontend/src/domains/timebox/__tests__/tier-scheduler.test.ts
/** @file tier-scheduler.test @brief [028] T4 Tier0/1/2 槽位分配 */
import { describe, it, expect } from 'vitest'
import { scheduleByTiers } from '../lib/tier-scheduler'

describe('scheduleByTiers', () => {
  it('Tier0 约定时段被跳过（不安排其他 item）', () => {
    const items = [{ id: 'i1', title: '工作', sourceType: 'task', priority: 'P1', durationMinutes: 60, earliestStart: 0, latestStart: 22, minDuration: 60 } as any]
    const occupied = [{ startHour: 2, startMinute: 0, endHour: 3, endMinute: 0 }]  // 2-3 点牙医（Tier0 已合并进 occupied）
    const { proposals } = scheduleByTiers(items, occupied, { dayStart: 0 })
    expect(proposals[0].payload.startTime).not.toMatch(/^02/)  // 不安排在 Tier0 时段
  })

  it('Tier2：item 主时段被占时，在 earliestStart/latestStart 窗口内安排', () => {
    // item earliestStart=8 latestStart=12，主时段 8-9 被 Tier0 占，安排到 9-10
  })

  it('Tier2：窗口内也无法安排 → 舍弃 + warning 进报告', () => {
    const items = [{ id: 'i1', title: '长任务', durationMinutes: 480, earliestStart: 8, latestStart: 10, minDuration: 480 } as any]
    const occupied = [{ startHour: 0, startMinute: 0, endHour: 8, endMinute: 0 }]  // 占满上午前
    const { proposals, warnings } = scheduleByTiers(items, occupied, { dayStart: 8 })
    expect(proposals).toHaveLength(0)
    expect(warnings.some(w => w.code === 'ITEM_UNSCHEDULABLE')).toBe(true)
  })

  it('cursor 上限 22:00 不越界（沿用 [023.07] bound）', () => {
    // 排满到 22:00 后停止 + SCHEDULER_BOUND_EXCEEDED warning
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/tier-scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement tier-scheduler.ts**

`scheduleByTiers(items, occupied, opts)`：
- occupied 已含 Tier0 约定（T2 合并）+ existingTimeboxes
- 对排序后 items 顺序分配：cursor 从 dayStart 推进，跳过占用；
- Tier2 兜底：cursor 推进到 22 仍无法安排时，检查 `earliestStart..latestStart` 窗口 + `minDuration`，能塞则塞，否则舍弃 + push `ITEM_UNSCHEDULABLE` warning
- 沿用 `SCHEDULER_BOUND_EXCEEDED` bound（[023.07]）+ `formatTime` HH:MM 输出

> 纯函数实现遵循测试矩阵。复用 orchestration-handler 现有 `isSlotOccupied`/`findOccupyingSlot`/`formatTime`（提取到 tier-scheduler 或注入）。

- [ ] **Step 4: Wire into generateProposals（strategy 隔离）**

`generateProposals` 加 strategy 参数：strategy='schedule' 委托 `scheduleByTiers(sorted, occupied, ...)`；strategy='legacy' 保留现有线性贪心体（IRON RULE，adjustRemainingTimeboxes 不变）。保留现有 `{ proposals, warnings }` 返回 shape。

- [ ] **Step 5: Run tests + tsc + commit**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/tier-scheduler.test.ts src/domains/timebox/__tests__/orchestration-handler.test.ts && npx tsc --noEmit | grep -c "error TS"
git add frontend/src/domains/timebox/lib/tier-scheduler.ts frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/__tests__/tier-scheduler.test.ts
git commit -m "feat(028): T4 Tier0/1/2 槽位分配（约定剔除+窗口兜底+舍弃报告）+ legacy 隔离"
```

---

## Task 5: NL 结构化输出 + 结构性置信度（纯函数，无 aiRuntime 依赖）

**Files:**
- Create: `frontend/src/domains/timebox/lib/nl-parser.ts`
- Test: `frontend/src/domains/timebox/__tests__/nl-parser.test.ts`

**Interfaces（fold-in T5/T6-fix：parseNL 接收 aiRuntime 作参数，不在 handle 内调）:**
- `parseNL(nlText, catalog, aiRuntime): Promise<{ matchedTasks, matchedTemplates, matchedAppointments, newEvents, timeExpressions, confidence }>` —— aiRuntime 由 **onGenerate** 传入（handle 无 aiRuntime）
- `deriveConfidence(parsed, catalog, opts): number` —— 纯函数，结构性推导（不信 LLM 自报）
- **置信度**：entityId 在 catalog 存在→高；newEvent 不引用→高；引用实体但时间撞 Tier0→强制低

- [ ] **Step 1: Write failing tests — 结构化输出 + 置信度推导**

```typescript
// frontend/src/domains/timebox/__tests__/nl-parser.test.ts
/** @file nl-parser.test @brief [028] T5 NL 结构化输出 + 结构性置信度 */
import { describe, it, expect, vi } from 'vitest'
import { parseNL, deriveConfidence } from '../lib/nl-parser'

describe('parseNL', () => {
  it('NL 解析为四类结构（matched/new/time）', async () => {
    const aiRuntime = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      matchedTasks: [{ id: 't1', title: '写报告' }],
      matchedTemplates: [], matchedAppointments: [],
      newEvents: [{ title: '下午开会', time: '15:00' }],
      timeExpressions: [{ raw: '下午3点', hour: 15 }],
    }) }) } as any
    const catalog = { tasks: [{ id: 't1', title: '写报告' }], templates: [], appointments: [] }
    const result = await parseNL('今天要写报告，下午3点开会', catalog, aiRuntime)
    expect(result.matchedTasks).toHaveLength(1)
    expect(result.newEvents).toHaveLength(1)
    expect(result.timeExpressions[0].hour).toBe(15)
  })

  it('LLM 返回非法 JSON → 降级 + 低置信', async () => {
    const aiRuntime = { generate: vi.fn().mockResolvedValue({ content: 'not json' }) } as any
    const result = await parseNL('xxx', { tasks: [], templates: [], appointments: [] }, aiRuntime)
    expect(result.confidence).toBeLessThan(0.5)
  })
})

describe('deriveConfidence 结构性置信度（不信 LLM 自报）', () => {
  it('entityId 在 catalog 存在 → 高置信', () => {
    const c = deriveConfidence(
      { matchedTasks: [{ id: 't1' }], matchedTemplates: [], matchedAppointments: [], newEvents: [] },
      { tasks: [{ id: 't1' }], templates: [], appointments: [] },
    )
    expect(c).toBeGreaterThanOrEqual(0.8)
  })
  it('newEvent 不引用任何已有 → 高置信（明确新建）', () => {
    const c = deriveConfidence(
      { matchedTasks: [], matchedTemplates: [], matchedAppointments: [], newEvents: [{ title: '新事' }] },
      { tasks: [], templates: [], appointments: [] },
    )
    expect(c).toBeGreaterThanOrEqual(0.8)
  })
  it('引用实体但时间撞 Tier0 → 强制低置信（走 needConfirm）', () => {
    const c = deriveConfidence(
      { matchedAppointments: [{ id: 'a1', conflictsTier0: true }], matchedTasks: [], matchedTemplates: [], newEvents: [] },
      { tasks: [], templates: [], appointments: [{ id: 'a1' }] },
      { tier0Slots: [{ startHour: 2, endHour: 3 }] },
    )
    expect(c).toBeLessThan(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/nl-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement nl-parser.ts**

`parseNL(nlText, catalog, aiRuntime)`：构造 system prompt（要求 JSON schema 输出四类结构 + timeExpressions）→ `aiRuntime.generate` → parse JSON（失败降级空 + 低置信）→ `deriveConfidence`。**aiRuntime 是参数**（fold-in T5/T6-fix），不在模块内持有，由 onGenerate 注入。

`deriveConfidence(parsed, catalog, opts)`：纯函数，按 3 条结构性规则推导（entityId 存在性 + newEvent 无引用 + Tier0 冲突检测）。**不读 LLM 自报 confidence**。

> LLM prompt + JSON schema 在实现时定型（参照 archetype-matcher.ts 的 prompt 构造范式）。复用 LLM gateway，**不复用 archetype-matcher 单射逻辑**。

- [ ] **Step 4: Run tests + tsc + commit**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/nl-parser.test.ts && npx tsc --noEmit | grep -c "error TS"
git add frontend/src/domains/timebox/lib/nl-parser.ts frontend/src/domains/timebox/__tests__/nl-parser.test.ts
git commit -m "feat(028): T5 NL 结构化输出（四类）+ 结构性置信度（aiRuntime 参数注入，handle 不调）[T5-fix]"
```

---

## Task 6: NL 置信度 needConfirm + Tier0 约定改时 handoff（onGenerate 接入）

**Files:**
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（**`onGenerate` 接入 `parseNL`**，fold-in T5/T6-fix：不在 handle 内）
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（scheduleProposal submit 分支处理 needConfirm）
- Test: `frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts`（扩 NL + needConfirm case）

**Interfaces（fold-in T5/T6-fix + T6-UI-fix）:**
- Consumes: T5 `parseNL`；`ArchetypePicker`（`src/components/archetype/archetype-picker.tsx:34`，props `{value,onChange,readOnly,enableAiMatch,title,variant}`）
- Produces：`onGenerate` 先 parseNL（若 `request.intent.fields.nlText`）→ NL 结果注入 `request.contexts`（newEvents 作第 4 源 + timeExpressions 作 fixedTime 标记）→ 调 `handle`；低置信（<0.6）或 Tier0 冲突 → `GenerationResult` 返回 `needConfirm` 字段（含 ArchetypePicker 候选）
- **Tier0 约定改时 handoff（fold-in T6-UI-fix 评估）**：现有 CNUI 架构**不支持跨 surface 跳转**（needConfirm → editAppointment surface）。倾向 **defer**：Tier0 改时意图先返回 needConfirm 文案「建议手动改约定」，不跳 surface。SDD 阶段若确认无跨 surface 机制，标 defer 到第二 PR

- [ ] **Step 1: Write failing test — onGenerate 接 parseNL + 低置信 needConfirm**

```typescript
describe('[028] T6 onGenerate 接 NL（fold-in：不在 handle）', () => {
  it('onGenerate(request, aiRuntime) 在 handle 前调 parseNL，NL 结果注入 contexts', async () => {
    // mock aiRuntime.generate 返 NL JSON；断言 handle 收到 contexts.nlResult（newEvents + fixedTime 标记）
  })
  it('NL 置信度 < 0.6 → onGenerate 返回 needConfirm（含 ArchetypePicker 候选）', async () => {
    // mock parseNL confidence 0.3 → onGenerate 返回 { needConfirm: true, archetypeCandidates: [...] }
  })
  it('handle() 仍无 aiRuntime（纯编排，回归 IRON RULE）', () => {
    // 断言 handle 签名不变（不调 LLM）
  })
})
```

- [ ] **Step 2-4: Implement + verify + commit**

`onGenerate(request, aiRuntime)` 改造（fold-in T5/T6-fix）：
```typescript
async onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult> {
  // fold-in T5/T6-fix：NL 解析在 onGenerate（handle 无 aiRuntime）
  if (request.intent.fields.nlText) {
    const catalog = this.buildCatalog(request.contexts)  // 从 contexts 提取 tasks/templates/appointments id+title
    const nlResult = await parseNL(request.intent.fields.nlText as string, catalog, aiRuntime)
    // 低置信 → needConfirm（ArchetypePicker 候选），不走编排
    if (nlResult.confidence < 0.6) {
      return { needConfirm: true, archetypeCandidates: this.deriveArchetypeCandidates(nlResult), nlResult } as any
    }
    // 注入 NL 结果到 contexts（newEvents 作额外源 + timeExpressions 标 fixedTime）
    request = {
      ...request,
      contexts: { ...request.contexts, nlResult },
    }
  }
  const baseResult = await this.handle(request)  // handle 消费注入的 nlResult
  // 现有 LLM 优化建议追加（可选保留）
  return baseResult
}
```

`buildTimeboxItems`（strategy='schedule'）消费 `materials.nlResult`：newEvents → items（sourceType='nl_event'，fixedTime 从 timeExpressions 标记，供 T3 层 1 截止紧迫用）。

cnui/handlers.ts scheduleProposal submit 分支处理 `needConfirm`（镜像现有 createTimebox 的 needConfirm 透传范式，复用 `ArchetypePicker`）。

```bash
git add frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/cnui/handlers.ts frontend/src/domains/timebox/__tests__/orchestration-handler.test.ts
git commit -m "feat(028): T6 onGenerate 接 NL（needConfirm ArchetypePicker）+ Tier0 改时 handoff 评估 defer [R6/T5-fix/T6-UI-fix]"
```

---

## Task 7: rule-based 5 维评分（fold-in T7-fix 数学定义）

**Files:**
- Create: `frontend/src/domains/timebox/lib/schedule-score.ts`
- Modify: `frontend/src/domains/timebox/handlers/orchestration-handler.ts`（`handle` 末尾调 `scoreSchedule`，结果入 `GenerationResult`）
- Test: `frontend/src/domains/timebox/__tests__/schedule-score.test.ts`

**Interfaces（fold-in T7-fix：明确聚合公式 + 归一 + guard）:**
- Consumes: proposals + tier0Slots + 候选 items 总数
- Produces: `scoreSchedule(proposals, opts): { score: number, dimensions: {...} }` — 5 维各归一 **0-10**，**等权平均**（跳过的维度不计入分母）

**5 维（design doc P6 + fold-in T7-fix 数学）:**
1. **时间覆盖率 coverage** = `scheduledItems / totalCandidates` × 10（**空集 guard**：totalCandidates=0 → 该维**跳过 + 重归一**，不算 0）
2. **0 冲突 noConflicts** = 无 `SCHEDULE_OVERLAP` ? 10 : 0
3. **能量匹配均分 energyMatch** = `avg(proposal.energyMatch.score)` × **10/0.9**（fold-in：score 原范围 0-0.9，归一到 0-10；空 proposals → 跳过）
4. **高优任务命中率 highPriorityHit** = `scheduledP0P1 / totalP0P1` × 10（空集 guard：无 P0/P1 → 跳过）
5. **休息饮食完整性 restMeal** = archetype 睡眠/饮食 item 已安排 ? 10 : 0（**区分**：archetype 标签缺失=数据不可得→跳过+重归一；有 archetype 但没安排=条件不满足→0 分）

- [ ] **Step 1: Write failing tests — 5 维 + 归一 + 空集 guard + 数据不可得**

```typescript
// frontend/src/domains/timebox/__tests__/schedule-score.test.ts
import { describe, it, expect } from 'vitest'
import { scoreSchedule } from '../lib/schedule-score'

describe('scoreSchedule 5 维（fold-in T7-fix）', () => {
  it('全安排 + 0 冲突 + 高能量匹配 → 高分（≥8）', () => {
    const r = scoreSchedule(/* full proposals */ {} as any)
    expect(r.score).toBeGreaterThanOrEqual(8)
    expect(r.dimensions).toHaveProperty('coverage')
    expect(r.dimensions).toHaveProperty('noConflicts')
  })
  it('有冲突 → noConflicts=0，总分被压低', () => { /* ... */ })
  it('energyMatch score 0.9 → 归一 10（×10/0.9）', () => {
    // 单 proposal energyMatch.score=0.9 → energyMatch 维=10
  })
  it('空集 guard：totalCandidates=0 → coverage 跳过，不影响总分（不归 0）', () => {
    // 无候选 → coverage 维跳过 + 重归一（分母减 1）
  })
  it('数据不可得：archetype 标签缺失 → restMeal 跳过（非 0 分）；有标签没安排 → restMeal=0', () => {
    // 区分两态
  })
  it('6 分以下 → 返回 warn 级（不 block，design doc P6）', () => { /* ... */ })
})
```

- [ ] **Step 2-4: Implement + verify + commit**

`scoreSchedule` 纯函数（fold-in T7-fix）：
```typescript
// 伪码（实现遵循测试）
function scoreSchedule(proposals, opts) {
  const dims: { key: string, value: number }[] = []
  // coverage（空集 guard）
  if (opts.totalCandidates > 0) {
    dims.push({ key: 'coverage', value: (proposals.length / opts.totalCandidates) * 10 })
  }
  // noConflicts
  dims.push({ key: 'noConflicts', value: opts.hasOverlap ? 0 : 10 })
  // energyMatch（归一 ×10/0.9；空 proposals 跳过）
  if (proposals.length > 0) {
    const avg = avg(proposals.map(p => p.energyMatch?.score ?? 0))
    dims.push({ key: 'energyMatch', value: Math.min(10, avg * 10 / 0.9) })
  }
  // highPriorityHit（空集 guard）
  if (opts.totalP0P1 > 0) {
    dims.push({ key: 'highPriorityHit', value: (opts.scheduledP0P1 / opts.totalP0P1) * 10 })
  }
  // restMeal（数据不可得 vs 条件不满足）
  if (opts.hasArchetypeData) {
    dims.push({ key: 'restMeal', value: opts.restMealScheduled ? 10 : 0 })
  }
  const score = avg(dims.map(d => d.value))  // 等权平均，跳过的不计入分母
  return { score, dimensions: Object.fromEntries(dims.map(d => [d.key, d.value])) }
}
```
`handle` 末尾调 `scoreSchedule`，`<6` 分返回 warn（不 block）。

```bash
git add frontend/src/domains/timebox/lib/schedule-score.ts frontend/src/domains/timebox/handlers/orchestration-handler.ts frontend/src/domains/timebox/__tests__/schedule-score.test.ts
git commit -m "feat(028): T7 rule-based 5 维评分（归一0-10/等权/空集guard/数据不可得跳过）+ warn 不 block [P6/T7-fix]"
```

---

## Task 8: 预览编辑 — DEFER

**Decision:** MVP 用 `[023.08]` 的 `CreateSmartTimebox` surface accept/reject（per-proposal 接受/拒绝）。预览编辑（改开始时间/时长，复用 `EditTimeboxes`）**defer 到第二 PR**（design doc R9 Open Question）。

- [ ] **Step 1: 记 defer 决定**（无代码改动）

在 design doc `## Deferred` 已记录。本 task 在 plan 里显式标注 defer，SDD 阶段跳过。

---

## Task 9: ScheduleProposal action + smartTimeboxes 退役（最危险，6 注册点 + 3 关注点）

> ⚠️ **这是全 plan 最危险的 task**。任一注册点漏 = feature 静默死。完成后必须跑「集成检查清单」9 点 grep 验证（closure-proof，学 [026.02.4]）。

**Files（fold-in T9-fix：batch-proposals.ts 加入）:**
- Rename/Create: `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx`（由 `CreateSmartTimebox.tsx` 改名/扩展）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（A-block + I-block + K-block 加 schedule-proposal）
- Modify: `frontend/src/domains/timebox/handlers/index.ts:33-41`（R13）
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts:80/109/465/523/544/812`（R11/R12，**scheduleProposal submit 自含 batch recording**）
- Modify: `frontend/src/nexus/ai-runtime/cnui/registry.ts:79`（R11，评估）
- Modify: `frontend/src/domains/timebox/index.ts`（注册点 5 server）
- Modify: `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts`（注册点 6 client，**最高频陷阱**）
- Modify: `frontend/src/nexus/ai-runtime/memory/batch-proposals.ts:132`（**fold-in T9-fix**：`recordBatchProposals` action `'createSmartTimeboxes'` → `'scheduleProposal'`）
- Test: `frontend/src/domains/timebox/__tests__/cnui-handlers.test.ts`（扩 scheduleProposal case）

**Interfaces（fold-in T9-fix：surface dispatch 一致性 + 自含 batch recording）:**
- Consumes: T1-T7 的全部产物
- Produces: `/ScheduleProposal` action 端到端可用；`createSmartTimeboxes` 退役（保留 `revertSmartTimeboxes` + `create-smart-timebox` K-block surface）

- [ ] **Step 1: Write failing test — scheduleProposal action 路由通 + submit 自含 recording**

```typescript
// cnui-handlers.test.ts 扩展
describe('[028] T9 scheduleProposal action', () => {
  it('surfaceHandlers 含 schedule-proposal surface', () => {
    expect(surfaceHandlers['schedule-proposal']).toBeDefined()
  })
  it('createTimeboxHandlers() 返回 scheduleProposal key', () => {
    const handlers = createTimeboxHandlers({})
    expect(handlers.scheduleProposal).toBeDefined()
  })
  // fold-in T9-fix：scheduleProposal submit 自含 batch recording（不依赖 createSmartTimebox 分支 _source）
  it('submit scheduleProposal → 自含 batch 落库 + 不返回 deprecated', async () => {
    const result = await timeboxCnuiHandler.submit('scheduleProposal', { items: [], date: '2026-07-11' })
    expect(result.error).not.toContain('弃用')
    // 断言 recordBatchProposals 被调（action='scheduleProposal'）
  })
  it('R12：record/open/revert 用同一 SESSION_KEY 常量（无单复数不一致）', () => {
    // grep 验证：handlers.ts 内 sessionId 三处引用同一常量
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/cnui-handlers.test.ts -t "T9"`
Expected: FAIL（`scheduleProposal` 未注册）

- [ ] **Step 3: 改动 6 注册点 + 3 关注点 + 退役（fold-in T9-fix）**

**注册点 1-2（manifest A + I + K block）：**
- A-block（~line 68）：`createSmartTimeboxes` trigger 改为 `scheduleProposal`（trigger `/ScheduleProposal`）；**保留** `revertSmartTimeboxes`（line 81）
- I-block（line 314）：已在 T1 Step 7 改为 `scheduleProposal:`（contexts 含 appointments+templates）；`cnui_surface_type: schedule-proposal`
- **K-block（line 357）**：**新增** `schedule-proposal:` surface（handler `./cnui/handlers`）；**保留** `create-smart-timebox:`（line 360，revertSmartTimeboxes 撤销历史 batch 引用不断，fold-in T9-fix）

**注册点 3（handlers/index.ts:33-41，R13）：**
```typescript
return {
  scheduleProposal: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
  adjustRemainingTimeboxes: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
}
// 移除 createSmartTimeboxes key（退役）
```

**注册点 4（cnui/handlers.ts，R11/R12 + fold-in T9-fix 自含 recording）：**
- `open`（line 109）：`createSmartTimeboxes` 分支改为 `scheduleProposal`；**R12 修**：提取 `const SESSION_KEY = 'timebox-scheduleProposal'` 常量，line 119 `sessionId: SESSION_KEY`
- `submit`（line 465）：`sessionId: SESSION_KEY`
- `submit`（line 523）：移除 `createSmartTimeboxes` deprecated 分支；**加 `if (action === 'scheduleProposal')` 分支，自含 batch 落库 + `recordBatchProposals`**（fold-in T9-fix：不依赖 createTimebox 分支 `_source === 'createSmartTimebox'`，独立 recording 逻辑）
- **保留** `revertSmartTimeboxes` 分支（line 544，撤销路径）
- `surfaceHandlers`（line 812）：加 `'schedule-proposal': timeboxCnuiHandler`
- **ScheduleProposal.tsx**（fold-in T9-fix surface dispatch）：dispatch 发 `action: 'scheduleProposal'`（与 handlers 分支名一致）

**注册点 5（domains/timebox/index.ts）：** server 端注册 `schedule-proposal` surface component（指向 `ScheduleProposal.tsx`）

**注册点 6（register-client-surfaces.ts，⚠️最高频陷阱）：** client 端 `cnuiRegistry.register('timebox', 'schedule-proposal', { component: ScheduleProposal, handlerModulePath: '...' })`

**关注点 7（registry.ts:79，R11）：** `getHandler` 硬编码 `module.timeboxCnuiHandler`——因注册点 4 仍用 `timeboxCnuiHandler`（surfaceHandlers 映射到它），**此处零改动**。验证：`getHandler('schedule-proposal')` 返回 timeboxCnuiHandler。

**关注点 8（R12 session key，dead parameter）：** `getRevertableBatches`（batch-proposals.ts:233-242）filter **不含 sessionId**（dead parameter），单复数不一致功能无害。T9 统一 `SESSION_KEY` 作代码一致性改进。`recordBatchProposals` action 字段改 `'scheduleProposal'`（关注点 8b，batch-proposals.ts:132）——`getRevertableBatches` 不读 action，兼容。

**关注点 9（resolveObjectType lifecycle key）：** manifest lifecycle key 若含 `ScheduleProposal` PascalCase 子串，须与 action `scheduleProposal` 同步（learning `resolveObjectType`）。

- [ ] **Step 4: 跑集成检查清单（closure-proof grep 验证，fold-in T9-grep-fix 第9点修正）**

```bash
cd frontend
echo "=== 注册点 1: manifest A-block ==="; grep -n "scheduleProposal" src/domains/timebox/manifest.yaml | head
echo "=== 注册点 2: manifest I-block generation ==="; grep -nA2 "generation_actions" src/domains/timebox/manifest.yaml | grep scheduleProposal
echo "=== 注册点 2b: manifest K-block 保留 create-smart-timebox + 新增 schedule-proposal ==="; grep -nE "create-smart-timebox|schedule-proposal" src/domains/timebox/manifest.yaml
echo "=== 注册点 3: handlers map ==="; grep -n "scheduleProposal" src/domains/timebox/handlers/index.ts
echo "=== 注册点 4: surfaceHandlers + action 分支 + SESSION_KEY ==="; grep -nE "schedule-proposal|scheduleProposal|SESSION_KEY" src/domains/timebox/cnui/handlers.ts
echo "=== 注册点 4b: ScheduleProposal.tsx dispatch action ==="; grep -n "scheduleProposal" src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx
echo "=== 注册点 4c: batch-proposals action 改 scheduleProposal (fold-in T9-fix) ==="; grep -n "action:" src/nexus/ai-runtime/memory/batch-proposals.ts
echo "=== 注册点 5: server 注册 ==="; grep -n "schedule-proposal" src/domains/timebox/index.ts
echo "=== 注册点 6: client 注册 ==="; grep -n "schedule-proposal" src/nexus/ai-runtime/cnui/register-client-surfaces.ts
echo "=== 关注点 7: getHandler 复用 timeboxCnuiHandler ==="; grep -n "timeboxCnuiHandler" src/nexus/ai-runtime/cnui/registry.ts
echo "=== 关注点 8: R12 单一 SESSION_KEY（无 timebox-createSmartTimebox 单/复数）==="; grep -nE "timebox-createSmartTimebox" src/domains/timebox/cnui/handlers.ts  # 期望 0 hit
echo "=== 退役验证: createSmartTimeboxes 残留（revertSmartTimeboxes + K-block create-smart-timebox 除外）==="; grep -rn "createSmartTimeboxes" src/domains/timebox/ | grep -v revert | grep -v test  # 期望近 0
```
Expected: 注册点 1-6 全部有 hit；K-block 同时含 `create-smart-timebox`（保留）+ `schedule-proposal`（新）；关注点 8 零 hit（R12 已统一）；batch-proposals action='scheduleProposal'（fold-in T9-grep-fix：第 4c 点明确改它，不再误报）；退役验证 createSmartTimeboxes 在 manifest/handlers/submit 分支近 0（revertSmartTimeboxes + create-smart-timebox K-block 保留）。

- [ ] **Step 5: Run tests + tsc + validate:manifest + commit**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/ && npx tsc --noEmit | grep -c "error TS" && npm run validate:manifest 2>&1 | tail -3
git add -A frontend/src/domains/timebox/ frontend/src/nexus/ai-runtime/cnui/ frontend/src/nexus/ai-runtime/memory/batch-proposals.ts
git commit -m "feat(028): T9 ScheduleProposal action 6注册点+3关注点 + submit 自含 recording + batch-proposals action 改 + smartTimeboxes 退役（保留 revert+K-block） [R11/R12/R13/T9-fix]"
```

---

## Task 10: 3 入口接线 + E2E（fold-in T10-fix：intent.ts 从零写）

**Files（fold-in T10-fix）:**
- Modify: `frontend/src/app/actions/intent.ts`（**从零写** `/smartTimeboxes` 旧 shortcut 重定向到 `scheduleProposal`——**无现有 createSmartTimeboxes 接线**，trigger 全 manifest 驱动）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（「新建今日计划」按钮）
- Modify: `frontend/src/app/.../growth/page.tsx`（成长菜单「生成今日时间盒计划」，路径以实际为准）
- Test: `/browse` E2E（mock LLM provider + real PG）

**Interfaces:**
- Consumes: T9 的 `/ScheduleProposal` action
- Produces: 3 个入口（AI 助手 CNUI / 成长菜单 / `/timeboxes` 按钮）端到端可用

- [ ] **Step 1: 3 入口接线（fold-in T10-fix：intent.ts trigger 从零写）**

- **AI 助手 `/ScheduleProposal` trigger**：manifest A-block intent_triggers 已声明（trigger `/ScheduleProposal`），`resolveShortcut`（intent.ts:1100）manifest-driven 自动解析，**无需手写 action map**。验证：`resolveShortcut('/ScheduleProposal')` 返 `{domainId:'timebox', action:'scheduleProposal'}`
- **`/smartTimeboxes` 旧 shortcut 重定向**（fold-in T10-fix，兼容旧入口）：在 `resolveShortcut`（intent.ts:1100）或 shortcut map 加显式重定向 `/smartTimeboxes` → `scheduleProposal`（manifest 不再声明 createSmartTimeboxes trigger，需手写兼容映射）。测试：`resolveShortcut('/smartTimeboxes')` 返 `{domainId:'timebox', action:'scheduleProposal'}`
- `/timeboxes` page「新建今日计划」按钮（timeboxes-workspace.tsx，放在「新建时间盒」前，dispatch scheduleProposal intent）
- 成长菜单「生成今日时间盒计划」（growth page，路径 grep 确认）

- [ ] **Step 2: E2E /browse 验证（real PG + mock LLM provider）**

```bash
# 启 dev server + curl smoke（learning server-action-async-pre-push）
cd frontend && npm run dev &
sleep 8
curl -s http://localhost:3000/timeboxes | grep -c "新建今日计划"  # 期望 ≥1
# /browse 完整 E2E：点「新建今日计划」→ mock LLM 生成 4 源 proposal → 接受 → real PG 落库 → 5 分钟撤销按钮显示计数 → 点撤销 → DB 删
```

- [ ] **Step 3: baseline 对比 + commit**

```bash
cd frontend && npx vitest run 2>&1 | tail -5  # base/head 失败集合 0 新增
git add frontend/src/app/actions/intent.ts frontend/src/domains/timebox/components/timeboxes-workspace.tsx
git commit -m "feat(028): T10 3 入口接线（/ScheduleProposal manifest驱动 + /smartTimeboxes 重定向兼容 + timeboxes按钮）+ E2E [T10-fix]"
```

---

## Self-Review (v2)

**1. Spec coverage（design doc → task 映射）：**
- P1 复用基础设施 → T9 复用 surface/panel/undo ✓
- P2 §04 硬规则 → T3 ✓
- P3 generative action 不建表 → T9 manifest（零 DDL）✓
- P4 NL 结构化输出 + 结构性置信度 → T5/T6 ✓
- P5 手动入口 → T10（3 入口，无自动）✓
- P6 5 维评分 → T7（fold-in 数学定义）✓
- R1-R16 → R1(T3 决议)/R2(T9)/R3(T7)/R4(T5)/R5(T1+T2)/R6(T6)/R7(Open Q)/R8(defer)/R9(T8 defer)/R10(T9)/R11(T9 关注点7)/R12(T9 关注点8 dead param)/R13(T9 注册点3)/R14(T1 Step5)/R15(T3 R15 隔离)/R16(T1) ✓
- 四源归集 → T1（provider）+ T2（buildTimeboxItems 消费）+ T1-manifest-fix（contexts）✓
- TDD 每 task → Step1 failing test ✓

**2. v2 fold-in 覆盖（plan-eng-review 6 + codex 15 = 全部应用）：**
- T1-fix（数据形状/裸 class）→ T1 Step 3/4/6 ✓
- T1-manifest-fix（contexts）→ T1 Step 7 ✓
- T2-fix（类型转换 + A1/A2 隔离 + IRON RULE）→ T2 全 task ✓
- T5/T6-fix（onGenerate 接 NL）→ T5（aiRuntime 参数）+ T6（onGenerate 注入）✓
- T7-fix（5维数学）→ T7 ✓
- T9-fix（surface dispatch + 自含 recording + batch-proposals + 保留 K-block）→ T9 ✓
- T9-grep-fix（grep 第4c/9点）→ T9 Step 4 ✓
- T10-fix（intent.ts 从零写 + 重定向）→ T10 ✓
- T6-UI-fix（ArchetypePicker 确认 + handoff defer）→ T6 ✓
- C1（ASCII pipeline 图）→ File Structure 后 ✓

**3. Placeholder scan：** 算法 task（T3/T4/T5/T7）的"实现遵循测试矩阵"——测试代码完整（多 case），接口签名明确。SDD subagent 拿测试 + 接口 TDD 实现，符合 lifeware 范式。无"TBD/TODO"占位。

**4. Type consistency（v2 修正）：** `TemplateRow.earliestStart`(string HH:MM) → T2 `hhmmToHour` 转 → `TimeboxItem.earliestStart`(number UTC hour) → T3/T4 消费 number，类型链闭合（fold-in T2-fix）。`SESSION_KEY` 常量（T9）三处引用一致。`scheduleProposal` action 名贯穿 T9 注册点 1-6 + T10 入口；surface 名 `schedule-proposal` 贯穿 K-block + 注册点 4/5/6。

**5. 已知边界（writing→SDD 阶段细化，非 plan 缺陷）：**
- R7「当日已有 timebox 不允许执行」UX：T9 scheduleProposal open 分支判定 existingTimeboxes 非空 → 返回提示
- archetype 标签查询（T3 中断容忍/睡眠/饮食）：opts.archetypeMap 注入，纯函数；map 构造在 handle() 内从 archetype repository 读
- **T6 Tier0 改时 handoff**（fold-in T6-UI-fix）：现有 CNUI 不支持跨 surface 跳转，倾向 defer（文案提示），SDD 确认

---

## Execution Handoff (v2)

Plan v2 complete and saved to `docs/superpowers/plans/2026-07-11-028-schedule-proposal.md`。

**建议执行顺序**：T1 → T2 → T3 → T4 → T5 → T6 → T7 →（T8 defer）→ T9（最危险，最后做集成）→ T10（E2E）。

**T9 前置提醒**：T9 是 6 注册点 + 3 关注点，任一漏 = feature 静默死。完成后必须跑 plan 内「集成检查清单」grep（closure-proof，含 fold-in T9-grep-fix 第4c点 batch-proposals）。R12 经 plan-eng-review 重评：session key 是 dead parameter（`getRevertableBatches` filter 不含 sessionId，batch-proposals.ts:233-242），单复数不一致功能无害；T9 统一 SESSION_KEY 作代码一致性改进，不作 bug fix。

**Assignment 前置**：✅ **baseline 已跑（2026-07-11）**：
- **vitest 静态**：timebox + memory + ai-runtime 域 **23 个 files passed / 273 tests passed | 3 skipped**——[023.08] smartTimeboxes 链路关键测试全绿（`createSmartTimeboxes-integration` / `orchestration-handler` / `cnui/handlers` / `CreateSmartTimebox` / `ai-submit` / `revert`）
- **tsc base 199**（原 hardcode 73 已 stale，Global Constraints 已修正）
- **phase6-cnui 1 fail known pre-existing drift**：`注册基础组件期望 16 实际 10`——timebox 域组件 catalog 注册缺失，与 [028] SDD 路径不直接相关（timebox 域测试全绿），SDD 不解决
- **Docker PG healthy**（lifeware-postgres-1 Up），dev server 未启（动态 E2E 跳过，静态 + change-gate-baseline 足够 catch [028] 引入的回归）
- R12 dead parameter 非阻断，`timeboxes-workspace.revert.test.tsx` 撤销路径 work 确认

**v2 状态**：plan v2 cleared + baseline 跑过 → ready to SDD。

**v2 状态**：plan-eng-review 6 findings + codex 15 findings 全部 fold-in 应用。**ENG + CODEX CLEARED — ready to SDD**。

## v2 Changelog（fold-ins 应用审计）

> 本节替代 v1 末尾的 `## Implementation Tasks (fold-ins)` section。10 项 fold-ins 已全部应用到主任务 T1-T10 + Global + File Structure + ASCII 图。

| fold-in | 优先级 | 应用位置 | 状态 |
|---|---|---|---|
| T1-fix（数据形状/裸 class/flatMap/shortestDuration/daysOfWeek） | P1 | T1 Step 3/4/6 + 关键事实表 | ✅ applied |
| T1-manifest-fix（contexts 加 appointments+templates） | P1 | T1 Step 7 | ✅ applied |
| T2-fix（HH:MM→hour 转换 + A1/A2 隔离 + IRON RULE 回归） | P1 | T2 全 task + Global Constraints | ✅ applied |
| T5/T6-fix（NL 挪到 onGenerate，handle 无 aiRuntime） | P1 | T5（aiRuntime 参数）+ T6（onGenerate 注入） | ✅ applied |
| T9-fix（surface dispatch + 自含 recording + batch-proposals + 保留 K-block） | P1 | T9 Step 3 + Files | ✅ applied |
| T7-fix（5维数学：聚合/归一/空集guard/数据不可得） | P2 | T7 | ✅ applied |
| T10-fix（intent.ts 从零写 + /smartTimeboxes 重定向） | P2 | T10 | ✅ applied |
| C1（ASCII pipeline 图） | P2 | File Structure 后 | ✅ applied |
| T9-grep-fix（grep 第4c/9点修正） | P3 | T9 Step 4 | ✅ applied |
| T6-UI-fix（ArchetypePicker 确认 + Tier0 handoff defer） | P2 | T6 | ✅ applied |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — (office-hours 已做战略拷问，P1-P6 收敛) |
| Codex Review | `/codex review` (outside voice) | Independent 2nd opinion | 1 | issues_found → folded | 15 findings: 3 硬伤(handle无aiRuntime/TemplatesProvider数据形状/surface dispatch) + manifest contexts漏 + batch-proposals漏 + 5维数学(公式/范围/空集) + 6 代码事实(Repository接口/TemplateRow字段名/daysOfWeek/AppointmentRepository过滤/intent.ts) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_found → folded | 6 findings: A4 R12重评(dead parameter非bug) + A1/A2 共享类leak + A3 grep误报 + C1 ASCII图缺 + T1 adjustRemaining回归(IRON RULE) + codex 15 fold-in |
| Design Review | — | UI/UX | 0 | — | — (backend-heavy 编排引擎，UI 仅复用 CreateSmartTimebox surface) |
| DX Review | — | Dev experience | 0 | — | — |

- **CODEX:** 3 硬伤 + manifest contexts 漏 + 5维数学 + 6 代码事实错误，全部 fold-in（用户批准「全部 fold-in」），v2 已应用
- **CROSS-MODEL:** session key tension — codex Q5 说 `getRevertableBatches` 按 sessionId 过滤；eng review A4 读代码确认是 dead parameter（filter batch-proposals.ts:233-242 不含 sessionId）。**eng review stands by A4**，codex Q5 机制判断错
- **VERDICT (v2):** ENG REVIEW + CODEX outside voice 均已跑，fold-ins 全部应用到 plan v2。**ENG + CODEX CLEARED — ready to SDD**。

NO UNRESOLVED DECISIONS
