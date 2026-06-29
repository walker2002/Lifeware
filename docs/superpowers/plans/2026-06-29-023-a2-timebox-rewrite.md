# [023] A2 Timebox 域重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 A0/A1 基础设施上按现行 Domain 范式重写 timebox 域，使 5 个 action（create/start/end/cancel/log）在 `/schedule` 页面与 3 个 CNUI surface 双入口走通 Nexus 链路，并与 Activity Archetype 词典打通。

**Architecture:** 单 plan 单分支（`feat/023-a2`，从 main `dce3d56` 起）。9 个 task 增量：T1 数据层（activityArchetypeId 外键）→ T2 写路径打通（timebox mutation service + server actions，[025] 范式）→ T3 `/schedule` standalone page → T4 Timebox Drawer（Variant C v2）→ T5/T6/T7 三个 CNUI surface（手写，[019.1] 合规）→ T8 `/timebox-templates` 配置页 → T9 manifest 清理 + ESLint + §IX + 基线。EnergyState 不扣减（OQ-6）。

**Tech Stack:** Next.js 16 / React 19 / TS 5 / Tailwind 4 + shadcn/ui / Drizzle ORM 0.45 / vitest / 手写 SQL 迁移。

## Global Constraints

- **简体中文**：所有对话/注释/文档用简体中文；每个新建 TS/TSX 文件加 `/** @file ... @brief ... */` 文件头（`docs/code-commenting-guide.md`）。
- **CSS 变量令牌**（UI-DESIGN-SPEC）：`bg-canvas`/`text-ink`/`text-body`/`text-muted`/`border-hairline`/`bg-surface-card`/`bg-primary`/`text-primary-foreground`/`text-error`；**禁** Tailwind 默认颜色类（`text-red-500` 等）。
- **drizzle 迁移手写**（`npm run db:generate/migrate` 跑不通，snapshot 债）：SQL 手写 + `psql lifeware_dev@localhost:5432` + 登记 `migrations/meta/_journal.json`。dev DB = `lifeware_dev@localhost:5432`。
- **vitest 在 `frontend` cwd 跑**（`@/` 映射，repo root 跑会假失败）；vitest 不做 TS 类型检查，**配 tsc 双验证**（`npx tsc --noEmit`）。
- **MVP 固定用户**：`MVP_USER_ID = '00000000-0000-0000-0000-000000000001'`。
- **Change Gate 基线**：对比 main 的 base 失败集合，vitest/tsc 零新增（不用硬编码失败数）。
- **Tier 2 文档同步**：USOM/DB/manifest 变更必须先更新 `docs/` 再改代码（`docs/usom-design.md` / `docs/database-design.md` / `manifest.md`）。
- **复用基线**：`timebox/components/*`（day-view/week-view/month-view/timeline/timebox-card/timebox-list）、022 OKRWorkspace standalone、[021] TaskCreateDrawer 抽屉范式、A1 `/config/activity-archetypes` 配置页范式、[025] mutation service + NeedConfirm。

---

## File Structure

**Create:**
- `frontend/src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql` — 加外键迁移
- `frontend/src/app/actions/timebox/mutation-service.ts` — timebox 写入口（参 habits）
- `frontend/src/app/actions/timebox.ts` — timebox server actions（判别联合 + NeedConfirm）
- `frontend/src/app/schedule/page.tsx` — `/schedule` standalone page
- `frontend/src/domains/timebox/components/schedule-workspace.tsx` — schedule 工作台（复用 day-view + Drawer 挂载）
- `frontend/src/domains/timebox/components/timebox-drawer.tsx` — Variant C v2 抽屉（新建/编辑/模板批量）
- `frontend/src/domains/timebox/components/archetype-picker.tsx` — Activity Archetype 选择器（复用 Repository）
- `frontend/src/domains/timebox/components/energy-cost-accordion.tsx` — 4 维 EnergyCost accordion（C.R1+C.R2）
- `frontend/src/domains/timebox/cnui/surfaces/create-timebox.tsx` — createTimebox CNUI
- `frontend/src/domains/timebox/cnui/surfaces/adjust-schedule.tsx` — adjustSchedule CNUI
- `frontend/src/domains/timebox/cnui/surfaces/log-timebox.tsx` — logTimebox CNUI
- `frontend/src/app/timebox-templates/page.tsx` — `/timebox-templates` 配置页
- `frontend/src/domains/timebox/components/timebox-template-editor.tsx` — 7 段生存时间 + pull 订阅编辑器
- `frontend/src/domains/timebox/__tests__/timebox-mutation.test.ts` — 写路径测试
- `frontend/src/domains/timebox/__tests__/cnui-handlers.test.ts` — 3 CNUI handler 测试
- `frontend/src/domains/timebox/components/__tests__/timebox-drawer.test.tsx` — Drawer 测试

**Modify:**
- `frontend/src/lib/db/schema.ts` — timeboxes 加 activityArchetypeId
- `frontend/src/lib/db/migrations/meta/_journal.json` — 登记迁移 0023
- `frontend/src/usom/types/objects.ts` — Timebox 加 activityArchetypeId
- `frontend/src/usom/types/process.ts` — SystemEventType 加 'TimeboxFieldUpdated'
- `frontend/src/lib/db/repositories/mappers.ts` — timebox mapper 加 activityArchetypeId
- `frontend/src/domains/timebox/cnui/handlers.ts` — 接 3 个新 surface
- `frontend/src/domains/timebox/index.ts` — 注册 3 个新 CNUI surface
- `frontend/src/domains/timebox/manifest.yaml` — intent_triggers/lifecycle/view_routes/subscribed_events 清理
- `frontend/src/usom/interfaces/irepository.ts` — ITimeboxRepository（如需）
- `frontend/src/domains/timebox/repository/generic-repo-adapter.ts` — create 透传 activityArchetypeId
- `docs/usom-design.md` / `docs/database-design.md` / `manifest.md` — Tier 2 同步

---

## Task 1: 数据层 — timebox.activityArchetypeId 外键 + USOM 类型 + mapper

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`（timeboxes 表，~行 380-409）
- Modify: `frontend/src/usom/types/objects.ts`（Timebox interface，~行 636-655）
- Modify: `frontend/src/lib/db/repositories/mappers.ts`（TimeboxRow + timeboxRowToUSOM + timeboxUSOMToRow，~行 383-437）
- Create: `frontend/src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`
- Modify: `docs/database-design.md` + `docs/usom-design.md`（Tier 2 先行）

**Interfaces:**
- Consumes: `activityArchetypes` 表（schema.ts:703，A1 落地）
- Produces: `Timebox.activityArchetypeId?: USOM_ID`；mapper 双向映射；DB 列 `activity_archetype_id uuid`（nullable，ON DELETE SET NULL）

- [ ] **Step 1: Tier 2 文档先行 — `docs/database-design.md`**

在 timeboxes 表 DDL 文档的 `tags` 与 `execution_record` 之间加一列说明：
```
activity_archetype_id  uuid  REFERENCES activity_archetypes(id) ON DELETE SET NULL  -- [023] A2 关联活动原型，nullable
```
并在 `docs/usom-design.md` Timebox 章节补：`activityArchetypeId?: USOM_ID — [023] A2 关联 Activity Archetype，logTimebox 时带入能量消耗源`。

- [ ] **Step 2: schema.ts 加列**

在 `timeboxes` 表定义（schema.ts:380）的 `tags` 之后、`executionRecord` 之前插入：
```typescript
  // [023] A2: 关联 Activity Archetype（nullable，ON DELETE SET NULL）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),
```
（`uuid` 与 `activityArchetypes` 已在 schema.ts 顶部 import/定义，无需新增 import。）

- [ ] **Step 3: 写迁移 SQL**

创建 `frontend/src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql`：
```sql
-- [023] A2: timeboxes 加 activity_archetype_id 外键（nullable，ON DELETE SET NULL）
-- 关联 A1 的 activity_archetypes 表。logTimebox 时带入活动原型，能量消耗从 archetype 读取。
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timeboxes_user_archetype
  ON timeboxes(user_id, activity_archetype_id);
```

- [ ] **Step 4: 登记 journal**

读取 `frontend/src/lib/db/migrations/meta/_journal.json` 当前末尾 entry 的 `idx`（实现时先 `tail` 确认最大 idx，当前文档快照末尾为 idx 21）。在 `entries` 数组末尾追加（idx = 末尾 idx + 1）：
```json
    {
      "idx": 22,
      "version": "7",
      "when": 1782600000000,
      "tag": "0023_timebox_activity_archetype_fk",
      "breakpoints": false
    }
```
> 若实现时发现末尾 idx 不是 21（journal 有已知 snapshot 债），用「实际最大 idx + 1」替换。

- [ ] **Step 5: 执行迁移（dev DB）**

Run: `cd frontend && psql "$DATABASE_URL" -f src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql`
Expected: `ALTER TABLE` + `CREATE INDEX` 各一行，无 error。

验证：`psql "$DATABASE_URL" -c "\d timeboxes" | grep activity_archetype_id`
Expected: 看到 `activity_archetype_id | uuid |` 行。

- [ ] **Step 6: USOM 类型 — Timebox 加字段**

`frontend/src/usom/types/objects.ts` Timebox interface（~行 636）的 `tags: Tag[]` 之后加：
```typescript
  /** [023] A2: 关联 Activity Archetype（nullable，logTimebox 时带入能量消耗源） */
  activityArchetypeId?: USOM_ID
```

- [ ] **Step 7: mapper 双向映射**

`frontend/src/lib/db/repositories/mappers.ts`：
- `TimeboxRow` type（~行 385）加字段：`activityArchetypeId: string | null;`
- `timeboxRowToUSOM`（~行 404）返回对象加：`activityArchetypeId: row.activityArchetypeId ?? undefined,`
- `timeboxUSOMToRow`（~行 419）返回对象加：`activityArchetypeId: timebox.activityArchetypeId ?? null,`

- [ ] **Step 8: 写失败测试 — mapper 映射**

创建测试片段到 `frontend/src/lib/db/repositories/__tests__/mappers.test.ts`（若已存在则追加 describe）：
```typescript
import { describe, it, expect } from 'vitest'
import { timeboxRowToUSOM, timeboxUSOMToRow } from '@/lib/db/repositories/mappers'

describe('timebox mapper — activityArchetypeId ([023] A2)', () => {
  const baseRow = {
    id: 'tb-1', userId: 'u-1', schemaVersion: 1, status: 'planned', title: '写作',
    startTime: new Date('2026-06-29T09:00:00Z'), endTime: new Date('2026-06-29T10:00:00Z'),
    isRecurring: false, recurrenceRule: null, tags: [], notes: null, executionRecord: null,
    createdAt: new Date('2026-06-29T00:00:00Z'), updatedAt: new Date('2026-06-29T00:00:00Z'),
    startedAt: null, overtimeAt: null, endedAt: null, loggedAt: null,
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const tb = timeboxRowToUSOM({ ...baseRow, activityArchetypeId: 'arch-1' })
    expect(tb.activityArchetypeId).toBe('arch-1')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const tb = timeboxRowToUSOM({ ...baseRow, activityArchetypeId: null })
    expect(tb.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const row = timeboxUSOMToRow({ id: 'tb-1', status: 'planned', title: 'x', startTime: '2026-06-29T09:00:00Z' as any, endTime: '2026-06-29T10:00:00Z' as any, taskIds: [], habitIds: [], isRecurring: false, tags: [], createdAt: 'x' as any, updatedAt: 'x' as any } as any, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})
```

- [ ] **Step 9: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/mappers.test.ts`
Expected: 3 PASS。

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "activityArchetypeId\|timebox" | head`
Expected: 无新增 timebox 相关类型错误（对比 base）。

- [ ] **Step 10: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql \
  src/lib/db/migrations/meta/_journal.json src/usom/types/objects.ts \
  src/lib/db/repositories/mappers.ts src/lib/db/repositories/__tests__/mappers.test.ts \
  docs/database-design.md docs/usom-design.md
git commit -m "feat(db): [023] A2.1 timeboxes.activityArchetypeId 外键 + USOM 类型 + mapper"
```

---

## Task 2: 写路径打通 — timebox mutation service + server actions（[025] 范式）

> **背景**：需求「各类 action 当前无法执行」根因——timebox 域缺 mutation service 接线（tasks/habits/okrs 都有 `app/actions/{域}/mutation-service.ts`，timebox 无）。本 task 按 [025] 范式（参 `app/actions/tasks.ts` completeTask + `app/actions/tasks/mutation-service.ts`）为 timebox 建写入口，使 5 个 action 经 Orchestrator 真实落库。

**Files:**
- Create: `frontend/src/app/actions/timebox/mutation-service.ts`
- Create: `frontend/src/app/actions/timebox.ts`
- Modify: `frontend/src/usom/types/process.ts`（SystemEventType 加 TimeboxFieldUpdated）
- Modify: `frontend/src/domains/timebox/repository/generic-repo-adapter.ts`（create/save 透传 activityArchetypeId）
- Test: `frontend/src/domains/timebox/__tests__/timebox-mutation.test.ts`

**Interfaces:**
- Consumes: `createDomainMutationServiceFactory`（`@/nexus/domain-mutation-service/factory`）、`createTimeboxGenericRepo`（`generic-repo-adapter.ts`）、`TimeboxRepository`、`submitDynamicIntent`（`@/app/actions/intent`）
- Produces: `createTimeboxMutationService(): DomainMutationService`；server actions `createTimebox` / `updateTimebox` / `deleteTimebox` / `transitionTimebox(action)` 返回 `TimeboxActionResult` 判别联合（`{status:'ok'} | {status:'needs_confirm'}`）

- [ ] **Step 1: 审计 [025] tasks 写路径（理解分发现状，不写代码）**

Run 并阅读，理解 lifecycle action 如何经 Orchestrator 落库：
```bash
cd frontend
sed -n '320,340p' src/app/actions/intent.ts          # tasks executePipeline 分发
sed -n '940,970p' src/app/actions/intent.ts          # habits service 直调
grep -n "executePipeline" src/app/actions/intent.ts  # 统一执行管线
```
记录：`submitDynamicIntent(domainId, action, fields, confirmed)` → `executePipeline` → 构造 Intent → `orchestrator.executeIntent`。**确认 timebox 经此路径时 orchestrator 如何取域 service**（若 executeIntent 内部按 domainId 分发到 mutation service，timebox 需补注册点）。

> 若审计发现 orchestrator 对 timebox 走的是遗留 `executeTransition`（index.ts:684，硬编码 timebox），本 task 的目标是让 createTimebox 等改走统一 `executeIntent` + timebox mutation service，遗留路径留作 T9 评估清理。

- [ ] **Step 2: SystemEventType 加 TimeboxFieldUpdated**

`frontend/src/usom/types/process.ts` SystemEventType 联合（~行 193-210）在 `'HabitFieldUpdated'` 之后加：
```typescript
  | 'TimeboxFieldUpdated'
```

- [ ] **Step 3: generic-repo-adapter 透传 activityArchetypeId**

`frontend/src/domains/timebox/repository/generic-repo-adapter.ts` 的 `create` 方法（~行 40-47）当前用 `{ id, ...fields, createdAt, updatedAt }` 已透传 fields（含 activityArchetypeId），无需改逻辑。**确认** `save`/`updateFields` 同样透传 whole-fields（repository/index.ts:69 save 用 `timeboxUSOMToRow`，已含字段）。若 `updateFields` 需支持更新 activityArchetypeId，它本就是 generic setPayload（index.ts:100），无需改。

> 此 step 为「确认无改动」——若审计发现透传断链，补 `...fields` 透传。

- [ ] **Step 4: 写 mutation-service.ts**

创建 `frontend/src/app/actions/timebox/mutation-service.ts`：
```typescript
/**
 * @file mutation-service
 * @brief Timebox 域业务事实写入口组装（[023] A2，参 habits/okrs/tasks 范式）
 *
 * 调公共工厂 createDomainMutationServiceFactory，仅保留 Timebox 域差异：
 * domainId / repos（timebox）/ 事件名 TimeboxFieldUpdated。
 *
 * @see src/app/actions/habits/mutation-service.ts 范本
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTimeboxGenericRepo } from '@/domains/timebox/repository/generic-repo-adapter'
import { TimeboxRepository } from '@/domains/timebox/repository'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Timebox 域业务事实写入口服务实例。
 * 每次调用产生独立实例（独立 eventRepo/eventBus），保证事务隔离。
 * @returns 业务事实写入口服务
 */
export function createTimeboxMutationService(): DomainMutationService {
  const repos = createTimeboxGenericRepo({
    timeboxRepo: new TimeboxRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'timebox',
    repos,
    fieldUpdatedEventType: 'TimeboxFieldUpdated',
    repoLabel: 'Timebox',
  })
}
```

- [ ] **Step 5: 写 server actions（判别联合 + NeedConfirm）**

创建 `frontend/src/app/actions/timebox.ts`（参 `app/actions/tasks.ts:57-220` updateTaskStatus 结构）：
```typescript
/**
 * @file timebox actions
 * @brief Timebox 域 server actions（[023] A2，[025] 判别联合 + NeedConfirm 范式）
 *
 * 所有写操作经 submitDynamicIntent → Orchestrator → createTimeboxMutationService，
 * 保留原子写 + cascade check。返回 TimeboxActionResult 判别联合，
 * needs_confirm 由客户端弹窗（参 CascadeConfirmDialog）二次确认后重提 confirmed=true。
 */

'use server'

import { submitDynamicIntent } from '@/app/actions/intent'
import type { Timebox } from '@/usom/types/objects'

/** MVP 固定用户 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** Timebox 写操作结果（判别联合） */
export type TimeboxActionResult =
  | { status: 'ok'; timebox: Timebox }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }

/** createTimebox 表单输入 */
export interface CreateTimeboxInput {
  title: string
  startTime: string // ISO
  duration: number // 分钟
  endTime?: string // ISO（可选，与 duration 二选一）
  activityArchetypeId?: string
  taskIds?: string[]
  habitIds?: string[]
  notes?: string
}

/**
 * 创建时间盒（走 Nexus：createTimebox → SM create → TimeboxCreated）
 */
export async function createTimebox(
  input: CreateTimeboxInput,
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    duration: input.duration,
    ...(input.endTime ? { endTime: input.endTime } : {}),
    ...(input.activityArchetypeId ? { activityArchetypeId: input.activityArchetypeId } : {}),
    ...(input.taskIds?.length ? { taskIds: input.taskIds } : {}),
    ...(input.habitIds?.length ? { habitIds: input.habitIds } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  }
  const result = await submitDynamicIntent('timebox', 'createTimebox', confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'createTimebox',
        confirmFields,
      }
    }
    throw new Error(result.error ?? '创建时间盒失败')
  }
  return { status: 'ok', timebox: result.object as Timebox }
}

/**
 * 状态转换：start / end / cancel / log（走 SM transition）
 * @param action - start | end | cancel | log
 */
export async function transitionTimebox(
  timeboxId: string,
  action: 'start' | 'end' | 'cancel' | 'log',
  payload: Record<string, unknown> = {},
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  const ACTION_TO_INTENT: Record<string, string> = {
    start: 'startTimebox',
    end: 'endTimebox',
    cancel: 'cancelTimebox',
    log: 'logTimebox',
  }
  const intentAction = ACTION_TO_INTENT[action]
  if (!intentAction) throw new Error(`不支持的转换: ${action}`)
  const confirmFields = { objectId: timeboxId, ...payload }
  const result = await submitDynamicIntent('timebox', intentAction, confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: intentAction,
        confirmFields,
      }
    }
    throw new Error(result.error ?? `${action} 失败`)
  }
  return { status: 'ok', timebox: result.object as Timebox }
}

/**
 * 字段更新（编辑标题/时间/archetype，走 mutation service 字段写）
 */
export async function updateTimebox(
  timeboxId: string,
  fields: Record<string, unknown>,
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  const confirmFields = { objectId: timeboxId, ...fields }
  const result = await submitDynamicIntent('timebox', 'updateTimebox', confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return { status: 'needs_confirm', message: result.confirmationMessage ?? '需确认', confirmAction: 'updateTimebox', confirmFields }
    }
    throw new Error(result.error ?? '更新时间盒失败')
  }
  return { status: 'ok', timebox: result.object as Timebox }
}

/**
 * 删除（cancel 软退场；硬删 MVP 不提供，编辑模式「删除」= cancel）
 */
export async function deleteTimebox(timeboxId: string, confirmed?: boolean): Promise<TimeboxActionResult> {
  return transitionTimebox(timeboxId, 'cancel', {}, confirmed)
}
```

> **注**：`submitDynamicIntent` 的返回类型 `IntentSubmissionResult` 字段名以实际为准（`result.object` / `result.needsConfirmation` / `result.confirmationMessage` / `result.error`）。Step 1 审计时若字段名不同，按 `intent.ts` 实际定义对齐。

- [ ] **Step 6: 写失败测试 — 写路径单测**

创建 `frontend/src/domains/timebox/__tests__/timebox-mutation.test.ts`：
```typescript
import { describe, it, expect, vi } from 'vitest'

// mock submitDynamicIntent
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimebox, transitionTimebox } from '@/app/actions/timebox'

describe('[023] A2 timebox server actions', () => {
  it('createTimebox 成功 → status ok', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'planned' } })
    const r = await createTimebox({ title: '写作', startTime: '2026-06-29T09:00:00Z', duration: 60, activityArchetypeId: 'arch-1' })
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'createTimebox', expect.objectContaining({ activityArchetypeId: 'arch-1' }), undefined)
  })

  it('createTimebox needsConfirmation → status needs_confirm', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: false, needsConfirmation: true, confirmationMessage: '时间重叠' })
    const r = await createTimebox({ title: 'x', startTime: '2026-06-29T09:00:00Z', duration: 60 })
    expect(r.status).toBe('needs_confirm')
    expect((r as any).message).toBe('时间重叠')
  })

  it('transitionTimebox start → startTimebox intent', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'running' } })
    const r = await transitionTimebox('tb-1', 'start')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'startTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })
})
```

- [ ] **Step 7: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/timebox-mutation.test.ts`
Expected: 3 PASS。

Run: `cd frontend && npx tsc --noEmit`
Expected: 无新增错误（对比 base）。

- [ ] **Step 8: 真实 PG 冒烟（手动，记录结果）**

在 dev server 跑通后用 `/browse` 或脚本验证 `createTimebox` 真实落库（此步在 T3 page 落地后一并验证，本 task 仅确认 server action 签名 + 单测）。

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/timebox/mutation-service.ts src/app/actions/timebox.ts \
  src/usom/types/process.ts src/domains/timebox/repository/generic-repo-adapter.ts \
  src/domains/timebox/__tests__/timebox-mutation.test.ts
git commit -m "feat(timebox): [023] A2.2 写路径打通 — mutation service + server actions（[025] 范式）"
```

---

## Task 3: `/schedule` standalone page + ScheduleWorkspace

> 参 022 OKRWorkspace standalone（`app/okrs/page.tsx`：`h-screen flex flex-col` + `<OKRWorkspace standalone />`）。复用 `timebox/components/*` 的 day-view/timebox-list/timebox-card；左栏时间盒列表 + CRUD/lifecycle 触发，右栏 Drawer 挂载点（Drawer 实现在 T4）。

**Files:**
- Create: `frontend/src/app/schedule/page.tsx`
- Create: `frontend/src/domains/timebox/components/schedule-workspace.tsx`
- Modify: `frontend/src/domains/timebox/components/index.ts`（export ScheduleWorkspace）

**Interfaces:**
- Consumes: `DayView` / `TimeboxCard` / `TimeboxList`（`timebox/components/*`）、`TimeboxRepository.findByDateRange`、T2 的 `createTimebox`/`transitionTimebox`/`updateTimebox`/`deleteTimebox`
- Produces: `/schedule` 路由渲染 `<ScheduleWorkspace />`；ScheduleWorkspace 暴露 `onCreate` / `onEdit(timebox)` / `onAction(timeboxId, action)` 回调供 Drawer 接入

- [ ] **Step 1: 写 page.tsx（standalone，参 okrs/page.tsx）**

创建 `frontend/src/app/schedule/page.tsx`：
```tsx
/**
 * @file page
 * @brief /schedule 独立页面路由（[023] A2，参 022 OKRWorkspace standalone）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/okrs/page.tsx 同款约束）。
 */

import { ScheduleWorkspace } from '@/domains/timebox/components/schedule-workspace'

export default async function SchedulePage() {
  return (
    <div className="h-screen flex flex-col">
      <ScheduleWorkspace />
    </div>
  )
}
```

- [ ] **Step 2: 写 ScheduleWorkspace 组件骨架（复用 day-view）**

创建 `frontend/src/domains/timebox/components/schedule-workspace.tsx`：
```tsx
/**
 * @file schedule-workspace
 * @brief 时间盒工作台（[023] A2）— standalone 模式
 *
 * 左栏：日期导航 + 当日时间盒列表（DayView 复用），支持创建/编辑/删除/lifecycle。
 * 右栏：Timebox Drawer 挂载点（Variant C v2，T4 实现）。
 * 配色用 CSS 变量令牌（bg-canvas/text-ink/border-hairline）。
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { DayView } from './day-view'
import { TimeboxDrawer, type DrawerMode } from './timebox-drawer'
import { transitionTimebox } from '@/app/actions/timebox'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Timebox } from '@/usom/types/objects'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** Drawer 打开状态 */
interface DrawerState {
  mode: DrawerMode
  editTarget?: Timebox
}

export function ScheduleWorkspace() {
  const [date, setDate] = useState(() => new Date())
  const [timeboxes, setTimeboxes] = useState<Timebox[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const loadDay = useCallback(async (d: Date) => {
    setLoading(true)
    try {
      const repo = new TimeboxRepository()
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      const list = await repo.findByDateRange(start.toISOString() as any, end.toISOString() as any, MVP_USER_ID)
      setTimeboxes(list)
    } catch (e) {
      console.error('[ScheduleWorkspace] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  const handleAction = useCallback(async (timeboxId: string, action: 'start' | 'end' | 'cancel' | 'log') => {
    const r = await transitionTimebox(timeboxId, action)
    if (r.status === 'ok') await loadDay(date)
    // needs_confirm 由 T4 Drawer/弹窗处理（此处简化：reload）
  }, [date, loadDay])

  return (
    <div className="flex h-full">
      {/* 左栏：当日时间盒列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h1 className="text-base font-display text-ink">我的时间盒</h1>
          <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>
            <Plus className="size-4 mr-1" />新建时间盒
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-md bg-surface-card animate-pulse" />)}
            </div>
          ) : timeboxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-body mb-3">今天还没有时间盒</p>
              <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>新建一个</Button>
            </div>
          ) : (
            <DayView
              timeboxes={timeboxes}
              date={date}
              onAction={(id, action) => handleAction(id, action as any)}
              onEdit={(tb) => setDrawer({ mode: 'edit', editTarget: tb })}
            />
          )}
        </div>
      </div>

      {/* 右栏：Drawer（T4 实现，由 drawer 状态控制开关） */}
      {drawer && (
        <TimeboxDrawer
          mode={drawer.mode}
          editTarget={drawer.editTarget}
          date={date}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); loadDay(date) }}
        />
      )}
    </div>
  )
}
```

> **注**：`DayView` 现有 props 以 `timebox/components/day-view.tsx` 实际签名为准（实现时 Read 该文件对齐 `onAction`/`onEdit` 回调名；若 DayView 不支持 `onEdit`，在 DayView 内补一个卡片点击 → onEdit，或在此层包一层 TimeboxCard 列表）。Step 3 先 Read day-view.tsx 确认。

- [ ] **Step 3: Read DayView 确认 props，按需调整接线**

Run: `cd frontend && sed -n '1,60p' src/domains/timebox/components/day-view.tsx`
按 DayView 实际 props 调整 ScheduleWorkspace 的传参（`timeboxes`/`date`/`onAction` 字段名对齐）。

- [ ] **Step 4: export ScheduleWorkspace**

`frontend/src/domains/timebox/components/index.ts` 末尾加：
```typescript
export { ScheduleWorkspace } from "./schedule-workspace"
```

- [ ] **Step 5: tsc 检查（Drawer 引用占位，T4 完成后才能完整编译）**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep schedule-workspace`
Expected: 仅 `timebox-drawer` 未实现的错误（T4 解决），其余无新增。

- [ ] **Step 6: Commit（标记 WIP，T4 后联动验证）**

```bash
git add src/app/schedule/page.tsx src/domains/timebox/components/schedule-workspace.tsx \
  src/domains/timebox/components/index.ts
git commit -m "feat(timebox): [023] A2.3 /schedule standalone page + ScheduleWorkspace 骨架（Drawer 挂载点待 T4）"
```

---

## Task 4: Timebox Drawer（Variant C v2）+ Archetype 选择器 + 4 维 accordion

> 参 [021] TaskCreateDrawer 抽屉范式（`fixed top-0 right-0 z-40 h-full` + scrim + role=dialog + Esc 关闭）+ mockup `variant-c-v2.html`（标题→活动原型 sub-card→时间→关联→备注；4 维 accordion 默认收起 C.R2；数字可输入 C.R1）。字段顺序：**标题 → 活动原型(嵌套 sub-card) → 时间 → 备注 → 关联 task/KR**。

**Files:**
- Create: `frontend/src/domains/timebox/components/archetype-picker.tsx`
- Create: `frontend/src/domains/timebox/components/energy-cost-accordion.tsx`
- Create: `frontend/src/domains/timebox/components/timebox-drawer.tsx`
- Modify: `frontend/src/domains/timebox/components/index.ts`
- Test: `frontend/src/domains/timebox/components/__tests__/timebox-drawer.test.tsx`

**Interfaces:**
- Consumes: `ActivityArchetypeRepository.findByUser/findByL1Category`、T2 `createTimebox`/`updateTimebox`、`EnergyCost`/`ActivityArchetype` 类型（`@/usom/activity-archetype/types`）
- Produces: `<TimeboxDrawer mode editTarget? date onClose onSaved />`；`DrawerMode = 'create' | 'edit' | 'template-batch'`

- [ ] **Step 1: 写 EnergyCostAccordion（C.R1 数字输入 + C.R2 默认收起）**

创建 `frontend/src/domains/timebox/components/energy-cost-accordion.tsx`：
```tsx
/**
 * @file energy-cost-accordion
 * @brief 4 维 EnergyCost 展示/校准（[023] A2，design C.R1 + C.R2）
 *
 * C.R2 默认收起：header 显示当前 4 维值「8 / 2 / 3 / 5」，点 header 展开。
 * C.R1 数字可输入 + 进度条仅可视化：每行 name | track(width=val*10%) | number input。
 * 只读模式（archetype 预览）不显示 input。
 */

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { EnergyCost } from '@/usom/activity-archetype/types'

interface EnergyCostAccordionProps {
  /** 4 维能量消耗 */
  value: EnergyCost
  /** 只读（不显示 input，仅展示） */
  readOnly?: boolean
  /** 值变更（校准模式） */
  onChange?: (v: EnergyCost) => void
}

const DIM_LABELS: { key: keyof EnergyCost; label: string }[] = [
  { key: 'physical', label: '体力' },
  { key: 'mental', label: '脑力' },
  { key: 'emotional', label: '情绪' },
  { key: 'creative', label: '创意' },
]

export function EnergyCostAccordion({ value, readOnly, onChange }: EnergyCostAccordionProps) {
  const [open, setOpen] = useState(false)
  const dims = DIM_LABELS.map(d => value[d.key] ?? 0)

  return (
    <div className="energy-accordion">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-1.5 text-xs text-body"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>能量消耗（4 维）</span>
          <span className="font-mono text-muted">{dims.join(' / ')}</span>
        </span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pt-1">
          {DIM_LABELS.map(({ key, label }) => {
            const val = value[key] ?? 0
            return (
              <div key={key} className="grid grid-cols-[48px_1fr_56px] items-center gap-2">
                <span className="text-xs text-body">{label}</span>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${val * 10}%` }} />
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  {readOnly ? (
                    <span className="text-xs font-mono text-ink">{val}</span>
                  ) : (
                    <>
                      <input
                        type="number" min={0} max={10} value={val}
                        onChange={e => onChange?.({ ...value, [key]: Number(e.target.value) })}
                        className="h-6 w-10 rounded border border-hairline bg-canvas px-1 text-xs text-ink text-center"
                        aria-label={`${label} 分`}
                      />
                      <span className="text-[10px] text-muted">/10</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

> **注**：`EnergyCost` 类型字段名（physical/mental/emotional/creative）以 `@/usom/activity-archetype/types` 实际为准（A1 设计为 4 维），实现时 Read 该文件对齐。

- [ ] **Step 2: 写 ArchetypePicker（复用 Repository）**

创建 `frontend/src/domains/timebox/components/archetype-picker.tsx`：
```tsx
/**
 * @file archetype-picker
 * @brief Activity Archetype 选择器（[023] A2）
 *
 * Drawer「活动原型」sub-card 用。加载用户全部 archetype（按 L1 分组），
 * 选中后展示名称 + L1/L2 标签 + 只读 4 维 accordion + 「更换」链接。
 */

'use client'

import { useState, useEffect } from 'react'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import { EnergyCostAccordion } from './energy-cost-accordion'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更 */
  onChange: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
}

export function ArchetypePicker({ value, onChange }: ArchetypePickerProps) {
  const [archetypes, setArchetypes] = useState<ActivityArchetype[]>([])
  const [selected, setSelected] = useState<ActivityArchetype | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    new ActivityArchetypeRepository().findByUser(MVP_USER_ID).then(list => {
      setArchetypes(list)
      setSelected(list.find(a => a.id === value))
    }).catch(() => { /* 静默 */ })
  }, [value])

  return (
    <div className="sub-card rounded-xl bg-surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">活动原型</h3>
        <button type="button" onClick={() => setPickerOpen(o => !o)} className="text-xs text-primary">
          {selected ? '更换' : '选择'}
        </button>
      </div>

      {selected ? (
        <div className="mt-2">
          <div className="text-base font-medium text-ink">{selected.l2Name}</div>
          <div className="text-xs text-muted">{selected.l1Category} · {selected.isSystem ? '系统内置' : '自定义'}</div>
          <div className="mt-2">
            <EnergyCostAccordion value={selected.energyCost} readOnly />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-body">未选择（可选）</p>
      )}

      {pickerOpen && (
        <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-hairline bg-canvas">
          {archetypes.length === 0 ? (
            <p className="p-3 text-xs text-body">暂无活动原型，请先到「活动原型配置」创建</p>
          ) : archetypes.map(a => (
            <button
              key={a.id} type="button"
              onClick={() => { onChange(a.id, a); setSelected(a); setPickerOpen(false) }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-hover-overlay"
            >
              <span className="text-sm text-ink">{a.l2Name}</span>
              <span className="text-xs text-muted">{a.l1Category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 写 TimeboxDrawer（Variant C v2 三模式）**

创建 `frontend/src/domains/timebox/components/timebox-drawer.tsx`：
```tsx
/**
 * @file timebox-drawer
 * @brief 时间盒抽屉（[023] A2，Variant C v2）
 *
 * 右侧 520px 抽屉（mobile 全屏 bottom sheet）。3 模式：create/edit/template-batch。
 * 字段序：标题 → 活动原型(嵌套 sub-card) → 时间 → 备注 → 关联。
 * 提交走 T2 server actions；needs_confirm 弹窗二次确认。
 * 参 [021] TaskCreateDrawer 抽屉范式（fixed right + scrim + Esc + role=dialog）。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArchetypePicker } from './archetype-picker'
import { createTimebox, updateTimebox, type CreateTimeboxInput } from '@/app/actions/timebox'
import type { Timebox } from '@/usom/types/objects'

const DRAWER_WIDTH = 520
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

export type DrawerMode = 'create' | 'edit' | 'template-batch'

interface TimeboxDrawerProps {
  mode: DrawerMode
  editTarget?: Timebox
  date: Date
  onClose: () => void
  onSaved: () => void
}

const MODE_TITLE: Record<DrawerMode, string> = {
  create: '新建时间盒',
  edit: '编辑时间盒',
  'template-batch': '从模板批量创建',
}

function toLocalInput(d: Date): string {
  // datetime-local 格式 YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TimeboxDrawer({ mode, editTarget, date, onClose, onSaved }: TimeboxDrawerProps) {
  const [title, setTitle] = useState(editTarget?.title ?? '')
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(editTarget?.activityArchetypeId)
  const [startTime, setStartTime] = useState(() => {
    const s = editTarget ? new Date(editTarget.startTime) : (() => { const d = new Date(date); d.setHours(9, 0, 0, 0); return d })()
    return toLocalInput(s)
  })
  const [duration, setDuration] = useState(editTarget ? Math.round((new Date(editTarget.endTime).getTime() - new Date(editTarget.startTime).getTime()) / 60000) : 60)
  const [notes, setNotes] = useState(editTarget?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState<{ message: string; action: () => Promise<void> } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const handleSubmit = useCallback(async (confirmed?: boolean) => {
    const trimmed = title.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const startIso = new Date(startTime).toISOString()
      const input: CreateTimeboxInput = {
        title: trimmed,
        startTime: startIso,
        duration,
        activityArchetypeId,
        notes: notes || undefined,
      }
      const r = mode === 'edit' && editTarget
        ? await updateTimebox(editTarget.id, { title: trimmed, startTime: startIso, duration, activityArchetypeId, notes: notes || undefined }, confirmed)
        : await createTimebox(input, confirmed)
      if (r.status === 'needs_confirm') {
        setConfirming({ message: r.message, action: () => handleSubmit(true) })
      } else {
        toast.success(mode === 'edit' ? '时间盒已更新' : '时间盒已创建')
        onSaved()
      }
    } catch (e) {
      console.error('[TimeboxDrawer] 提交失败', e)
      toast.error('保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [title, startTime, duration, activityArchetypeId, notes, mode, editTarget, submitting, onSaved])

  return (
    <>
      <div className="fixed inset-0 z-30 bg-scrim animate-in fade-in duration-200" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed top-0 right-0 z-40 h-full bg-canvas border-l border-hairline shadow-xl flex flex-col animate-in slide-in-from-right duration-300"
        style={{ width: DRAWER_WIDTH }}
        role="dialog" aria-modal="true" aria-label={MODE_TITLE[mode]}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between shrink-0 px-5 py-3 border-b border-hairline-soft">
          <h2 className="text-sm font-semibold text-ink">{MODE_TITLE[mode]}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-body/60 hover:text-ink hover:bg-hover-overlay" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        {/* body：标题 → 活动原型 → 时间 → 备注 → 关联 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-body mb-1 block">标题 <span className="text-error">*</span></label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus maxLength={100}
              placeholder="例如：专注写作"
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>

          <ArchetypePicker value={activityArchetypeId} onChange={(id) => setActivityArchetypeId(id)} />

          <div>
            <label className="text-xs text-body mb-1 block">时间</label>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local" value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="h-8 flex-1 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <input
                type="number" min={5} max={480} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="h-8 w-20 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
                aria-label="时长分钟"
              />
              <span className="text-xs text-body">分</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-body mb-1 block">备注</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={500}
              placeholder="可选：本次时间盒的目标或上下文"
              className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-between gap-2">
          {mode === 'edit' ? (
            <Button variant="destructive" size="sm" onClick={() => { /* deleteTimebox = cancel，T2 */ }}>删除</Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button onClick={() => handleSubmit()} disabled={!title.trim() || submitting}>
              {submitting ? '保存中…' : '保存时间盒'}
            </Button>
          </div>
        </div>
      </div>

      {/* needs_confirm 二次确认弹窗 */}
      {confirming && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim">
          <div className="mx-4 max-w-sm rounded-lg bg-canvas p-6 shadow-lg">
            <p className="mb-4 text-sm font-medium text-ink">{confirming.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>取消</Button>
              <Button size="sm" onClick={() => { confirming.action(); setConfirming(null) }}>确认</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: export 新组件**

`frontend/src/domains/timebox/components/index.ts` 加：
```typescript
export { TimeboxDrawer } from "./timebox-drawer"
export type { DrawerMode } from "./timebox-drawer"
export { ArchetypePicker } from "./archetype-picker"
export { EnergyCostAccordion } from "./energy-cost-accordion"
```

- [ ] **Step 5: 写 Drawer 单测（字段渲染 + 提交）**

创建 `frontend/src/domains/timebox/components/__tests__/timebox-drawer.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/app/actions/timebox', () => ({
  createTimebox: vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb-1' } }),
  updateTimebox: vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb-1' } }),
}))
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: vi.fn().mockImplementation(() => ({
    findByUser: vi.fn().mockResolvedValue([]),
  })),
}))

import { TimeboxDrawer } from '@/domains/timebox/components/timebox-drawer'
import { createTimebox } from '@/app/actions/timebox'

describe('[023] A2 TimeboxDrawer', () => {
  it('create 模式标题为「新建时间盒」', () => {
    render(<TimeboxDrawer mode="create" date={new Date('2026-06-29')} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('新建时间盒')).toBeTruthy()
  })

  it('标题为空时保存禁用', () => {
    render(<TimeboxDrawer mode="create" date={new Date('2026-06-29')} onClose={() => {}} onSaved={() => {}} />)
    const btn = screen.getByText('保存时间盒')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('填标题后保存触发 createTimebox', async () => {
    const onSaved = vi.fn()
    render(<TimeboxDrawer mode="create" date={new Date('2026-06-29')} onClose={() => {}} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText('例如：专注写作'), { target: { value: '写作' } })
    fireEvent.click(screen.getByText('保存时间盒'))
    // await microtask
    await new Promise(r => setTimeout(r, 0))
    expect(createTimebox).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: 跑测试 + tsc + /browse 视觉**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/timebox-drawer.test.tsx`
Expected: 3 PASS。

Run: `cd frontend && npx tsc --noEmit`
Expected: T3 的 schedule-workspace 引用此 Drawer，错误消除，无新增。

视觉：`/browse` 打开 `/schedule` → 点「新建时间盒」→ 截图确认抽屉 520px + 字段顺序 + Archetype sub-card + 4 维 accordion 默认收起（C.R2）。

- [ ] **Step 7: Commit**

```bash
git add src/domains/timebox/components/timebox-drawer.tsx src/domains/timebox/components/archetype-picker.tsx \
  src/domains/timebox/components/energy-cost-accordion.tsx src/domains/timebox/components/index.ts \
  src/domains/timebox/components/__tests__/timebox-drawer.test.tsx
git commit -m "feat(timebox): [023] A2.4 Timebox Drawer（Variant C v2）+ Archetype 选择器 + 4 维 accordion"
```

---

## Task 5: createTimebox CNUI surface

> 手写 CNUI（[019.1] 合规，参 `tasks/cnui/surfaces/TaskActionPanel.tsx` + `tasks/cnui/handlers.ts`）。AI 助手 `/createTimebox 10:30-12:30 做调研；14:30 会议` → 解析多条 → surface 左右翻页 → 「提交全部」逐条走 Nexus。

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/create-timebox.tsx`
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（接 createTimebox action）
- Modify: `frontend/src/domains/timebox/index.ts`（注册 surface）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（createTimebox intent_trigger 加 response_type: cnui）
- Test: `frontend/src/domains/timebox/__tests__/cnui-handlers.test.ts`

**Interfaces:**
- Consumes: `CnuiSurfaceHandler`（`@/nexus/ai-runtime/cnui/types`）、`submitDynamicIntent`、AI 解析的多条 timebox 草稿（dataModel.items）
- Produces: `create-timebox` surface；handler.open 返回 `{items: TimeboxDraft[]}`，handler.submit 逐条 `submitDynamicIntent('timebox','createTimebox',...)`

- [ ] **Step 1: 写 CreateTimebox surface（左右翻页）**

创建 `frontend/src/domains/timebox/cnui/surfaces/create-timebox.tsx`（参 TimeboxList.tsx 翻页范式）：
```tsx
/**
 * @file create-timebox
 * @brief 创建时间盒 CNUI surface（[023] A2，[019.1] 手写范式）
 *
 * AI 助手解析多条 timebox 草稿后展示：左右翻页逐条查看/编辑，「提交全部」
 * 逐条走 Nexus（handler.submit 内循环 submitDynamicIntent）。
 */

'use client'

import { useState } from 'react'

interface TimeboxDraft {
  id: string
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
}

interface CreateTimeboxProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CreateTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateTimeboxProps) {
  const items = (dataModel.items as TimeboxDraft[]) ?? []
  const [page, setPage] = useState(0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {items.length} 个时间盒已创建</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">未识别到时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<TimeboxDraft>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">创建时间盒 ({page + 1}/{items.length})</span>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
          <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label className="text-xs text-body">标题</label>
          <input type="text" value={cur.title} onChange={e => update({ title: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-xs text-body">开始</label>
            <input type="text" value={cur.startTime} onChange={e => update({ startTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-body">结束</label>
            <input type="text" value={cur.endTime} onChange={e => update({ endTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">提交全部</button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: handler 接 createTimebox（open 解析 + submit 逐条）**

`frontend/src/domains/timebox/cnui/handlers.ts` 的 `timeboxCnuiHandler` 扩展（参 `tasks/cnui/handlers.ts`）：
- `open(action)` 加分支：`if (action === 'createTimebox')` → 从 intentFields（或 AI 解析结果）取 drafts，返回 `{content: '请确认要创建的时间盒', dataSnapshot: { items: drafts }}`。drafts 来源：AI 助手调用时把解析结果放 `intentFields.drafts`，handler 透传。
- `submit(action, fields)` 加分支：`if (action === 'createTimebox')` → 取 `fields.items`，循环 `await submitDynamicIntent('timebox','createTimebox', item)`，任一失败返回 `{success:false, error}`。

具体在 handler 内追加（保留现有 createSmartSchedule/adjustRemainingSchedule 分支）：
```typescript
async open(action, intentFields) {
  // ... 现有 createSmartSchedule / adjustRemainingSchedule 分支保留 ...
  if (action === 'createTimebox') {
    const drafts = (intentFields?.drafts as any[]) ?? []
    return {
      content: '请确认要创建的时间盒',
      dataSnapshot: { items: drafts },
    }
  }
  // ...
}

async submit(action, fields) {
  if (action === 'createTimebox') {
    const { submitDynamicIntent } = await import('@/app/actions/intent')
    const items = (fields.items as any[]) ?? []
    for (const it of items) {
      const r = await submitDynamicIntent('timebox', 'createTimebox', it)
      if (!r.success) return { success: false, error: r.error ?? `${it.title} 创建失败` }
    }
    return { success: true, data: { count: items.length } }
  }
  // ... 现有分支保留 ...
}
```

- [ ] **Step 3: index.ts 注册 surface**

`frontend/src/domains/timebox/index.ts` 加 import + register：
```typescript
import { CreateTimebox } from './cnui/surfaces/create-timebox'
// ...
cnuiRegistry.register('timebox', 'create-timebox', { component: CreateTimebox, handlerModulePath: './domains/timebox/cnui/handlers' })
```

- [ ] **Step 4: manifest createTimebox 标记 cnui**

`frontend/src/domains/timebox/manifest.yaml` 的 `createTimebox` intent_trigger 加：
```yaml
    response_type: cnui
    cnui_surface: create-timebox
```

- [ ] **Step 5: 写 handler 测试**

创建 `frontend/src/domains/timebox/__tests__/cnui-handlers.test.ts`：
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/actions/intent', () => ({ submitDynamicIntent: vi.fn().mockResolvedValue({ success: true }) }))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { submitDynamicIntent } from '@/app/actions/intent'

describe('[023] A2 createTimebox CNUI handler', () => {
  it('open 返回 drafts 为 items', async () => {
    const r = await timeboxCnuiHandler.open('createTimebox', { drafts: [{ id: '1', title: '写作', startTime: '09:00', endTime: '10:00' }] })
    expect((r.dataSnapshot as any).items).toHaveLength(1)
  })

  it('submit 逐条调 submitDynamicIntent', async () => {
    const r = await timeboxCnuiHandler.submit('createTimebox', { items: [{ title: 'a' }, { title: 'b' }] })
    expect(r.success).toBe(true)
    expect(submitDynamicIntent).toHaveBeenCalledTimes(2)
  })

  it('submit 任一失败 → success false', async () => {
    ;(submitDynamicIntent as any).mockResolvedValueOnce({ success: false, error: '重叠' })
    const r = await timeboxCnuiHandler.submit('createTimebox', { items: [{ title: 'a' }, { title: 'b' }] })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 6: 跑测试 + tsc + Commit**

```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/cnui-handlers.test.ts
cd frontend && npx tsc --noEmit
git add src/domains/timebox/cnui/surfaces/create-timebox.tsx src/domains/timebox/cnui/handlers.ts \
  src/domains/timebox/index.ts src/domains/timebox/manifest.yaml src/domains/timebox/__tests__/cnui-handlers.test.ts
git commit -m "feat(timebox): [023] A2.5 createTimebox CNUI surface（手写，逐条走 Nexus）"
```

---

## Task 6: adjustSchedule CNUI surface

> AI 助手 `/adjustSchedule 下午2点会议延迟1小时；取消做PPT` → surface 按时间序列列当天 timebox，左右切换编辑，仅提交有改动；running/ended 不可取消。

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/adjust-schedule.tsx`
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（接 adjustTimebox/adjustRemainingSchedule）
- Modify: `frontend/src/domains/timebox/index.ts`（注册）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（adjustRemainingSchedule 已是 cnui，补 surface）

**Interfaces:**
- Consumes: `TimeboxRepository.findByDateRange`（当日）、`submitDynamicIntent`（updateTimebox/cancelTimebox）、`transitionTimebox`
- Produces: `adjust-schedule` surface；handler.open 返回当日 timebox 列表；handler.submit 仅写改动项

- [ ] **Step 1: 写 AdjustSchedule surface（时间序列 + diff 提交）**

创建 `frontend/src/domains/timebox/cnui/surfaces/adjust-schedule.tsx`：
```tsx
/**
 * @file adjust-schedule
 * @brief 调整日程 CNUI surface（[023] A2）
 *
 * 按时间序列列当日 timebox，左右切换当前编辑项。记录初始快照，提交时仅
 * 发送有改动的字段（title/startTime/endTime/cancel）。running/ended 禁止取消。
 */

'use client'

import { useState, useMemo } from 'react'

interface AdjustItem {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  /** 标记取消 */
  cancel?: boolean
}

interface AdjustScheduleProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function AdjustSchedule({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: AdjustScheduleProps) {
  const items = ((dataModel.items as AdjustItem[]) ?? []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime))
  const [page, setPage] = useState(0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 调整已应用</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">今日无时间盒可调整</p>

  const cur = items[Math.min(page, items.length - 1)]
  const cancellable = !['running', 'ended', 'logged'].includes(cur.status)
  const update = (patch: Partial<AdjustItem>) => {
    const next = items.map((it, i) => it.id === cur.id ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">调整日程 ({page + 1}/{items.length})</span>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
          <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label className="text-xs text-body">标题</label>
          <input type="text" value={cur.title} onChange={e => update({ title: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={cur.startTime} onChange={e => update({ startTime: e.target.value })} className="h-7 flex-1 rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          <input type="text" value={cur.endTime} onChange={e => update({ endTime: e.target.value })} className="h-7 flex-1 rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">状态：{cur.status}</span>
          {cancellable ? (
            <label className="flex items-center gap-1 text-xs text-body">
              <input type="checkbox" checked={!!cur.cancel} onChange={e => update({ cancel: e.target.checked })} /> 取消此时间盒
            </label>
          ) : (
            <span className="text-xs text-muted">执行中/已结束，不可取消</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">应用修改</button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: handler 接 adjustRemainingSchedule（已有 open，补 submit diff）**

`frontend/src/domains/timebox/cnui/handlers.ts`：
- `open` 现有 `adjustRemainingSchedule` 分支已返回 existingTimeboxes。**补**：把 items 也放 dataSnapshot（供 surface 用）：`dataSnapshot: { items: timeboxes.map(t => ({ id, title, startTime, endTime, status })) }`。
- `submit` 加分支：
```typescript
if (action === 'adjustRemainingSchedule') {
  const { submitDynamicIntent } = await import('@/app/actions/intent')
  const items = (fields.items as any[]) ?? []
  for (const it of items) {
    if (it.cancel) {
      const r = await submitDynamicIntent('timebox', 'cancelTimebox', { objectId: it.id })
      if (!r.success) return { success: false, error: r.error ?? '取消失败' }
    } else if (it.title !== it._origTitle || it.startTime !== it._origStart || it.endTime !== it._origEnd) {
      const r = await submitDynamicIntent('timebox', 'updateTimebox', { objectId: it.id, title: it.title, startTime: it.startTime, endTime: it.endTime })
      if (!r.success) return { success: false, error: r.error ?? '更新失败' }
    }
  }
  return { success: true, data: { count: items.length } }
}
```
> diff 判定：open 时把每条原始值放 `_origTitle/_origStart/_origEnd`（snapshot 透传），submit 比对。实现时在 open 的 items map 里加这 3 个下划线字段。

- [ ] **Step 3: index.ts 注册 + manifest surface 名**

`index.ts` 加：
```typescript
import { AdjustSchedule } from './cnui/surfaces/adjust-schedule'
cnuiRegistry.register('timebox', 'adjust-schedule', { component: AdjustSchedule, handlerModulePath: './domains/timebox/cnui/handlers' })
```
manifest `adjustRemainingSchedule` 已有 `response_type: cnui`；补 `cnui_surface: adjust-schedule`（若无）。

- [ ] **Step 4: 测试 + tsc + Commit**

在 `cnui-handlers.test.ts` 追加 adjustSchedule 用例（open 返回 items；submit cancel 调 cancelTimebox；submit 无改动不调用）。
```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/cnui-handlers.test.ts
cd frontend && npx tsc --noEmit
git add src/domains/timebox/cnui/surfaces/adjust-schedule.tsx src/domains/timebox/cnui/handlers.ts src/domains/timebox/index.ts src/domains/timebox/manifest.yaml
git commit -m "feat(timebox): [023] A2.6 adjustSchedule CNUI surface（diff 提交 + running/ended 禁取消）"
```

---

## Task 7: logTimebox CNUI surface

> AI 助手 `/logTimebox 打卡所有时间盒` 或 `/logTimebox 写市场调研任务：完成度90%` → surface 批量打卡三态（完成/未完成/跳过）+ 备注，「提交打卡」走 Nexus log。

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/log-timebox.tsx`
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（接 logTimebox）
- Modify: `frontend/src/domains/timebox/index.ts`（注册）
- Modify: `frontend/src/domains/timebox/manifest.yaml`（logTimebox 加 cnui）

**Interfaces:**
- Consumes: 当日 ended 状态 timebox（待打卡）、`submitDynamicIntent('timebox','logTimebox',{objectId, completionStatus, notes})`
- Produces: `log-timebox` surface；handler.open 返回 ended timebox 列表；handler.submit 逐条 log

- [ ] **Step 1: 写 LogTimebox surface（三态 + 备注）**

创建 `frontend/src/domains/timebox/cnui/surfaces/log-timebox.tsx`：
```tsx
/**
 * @file log-timebox
 * @brief 时间盒打卡 CNUI surface（[023] A2）
 *
 * 批量打卡：每条 ended timebox 三态（完成/未完成/跳过）+ 备注。
 * 「提交打卡」逐条走 Nexus logTimebox。
 */

'use client'

import { useState } from 'react'

type LogState = 'completed' | 'incomplete' | 'skipped'

interface LogItem {
  id: string
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
  state?: LogState
  notes?: string
}

interface LogTimeboxProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

const STATE_BTN: { key: LogState; label: string; cls: string }[] = [
  { key: 'completed', label: '完成', cls: 'bg-success/10 text-success border-success/30' },
  { key: 'incomplete', label: '未完成', cls: 'bg-error/10 text-error border-error/30' },
  { key: 'skipped', label: '跳过', cls: 'bg-muted text-body border-hairline' },
]

export function LogTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: LogTimeboxProps) {
  const items = (dataModel.items as LogItem[]) ?? []
  const [page, setPage] = useState(0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 打卡已提交</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">没有待打卡的时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<LogItem>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">打卡 ({page + 1}/{items.length})</span>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
          <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div className="text-sm font-medium text-ink">{cur.title}</div>
        <div className="text-xs text-muted">{cur.startTime} - {cur.endTime}</div>
        <div className="flex items-center gap-1.5">
          {STATE_BTN.map(s => (
            <button
              key={s.key} type="button"
              onClick={() => update({ state: s.key })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs ${cur.state === s.key ? s.cls : 'border-hairline text-body'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          value={cur.notes ?? ''} onChange={e => update({ notes: e.target.value })} rows={2}
          placeholder="备注（可选）"
          className="w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink resize-none"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">提交打卡</button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: handler 接 logTimebox**

`handlers.ts`：
- `open` 加分支 `if (action === 'logTimebox')` → 查当日 ended timebox（`TimeboxRepository.findByStatus('ended', MVP_USER_ID)` 或 findByDateRange 过滤 ended），返回 `{ items: endedList.map(...) }`。若 intentFields 带单条（如「写市场调研任务」），定位该条置顶。
- `submit` 加分支：
```typescript
if (action === 'logTimebox') {
  const { submitDynamicIntent } = await import('@/app/actions/intent')
  const items = (fields.items as any[]) ?? []
  for (const it of items) {
    if (!it.state || it.state === 'skipped') continue  // 跳过的不 log
    const r = await submitDynamicIntent('timebox', 'logTimebox', {
      objectId: it.id,
      completionStatus: it.state === 'completed' ? 'completed' : 'partial',
      notes: it.notes,
    })
    if (!r.success) return { success: false, error: r.error ?? `${it.title} 打卡失败` }
  }
  return { success: true, data: { count: items.filter(i => i.state && i.state !== 'skipped').length } }
}
```

- [ ] **Step 3: index.ts 注册 + manifest cnui_surface**

`index.ts` 加 register `log-timebox`；manifest `logTimebox` intent_trigger 加 `response_type: cnui` + `cnui_surface: log-timebox`。

- [ ] **Step 4: 测试 + tsc + Commit**

`cnui-handlers.test.ts` 追加 logTimebox 用例（open 返回 ended items；submit 跳过的不调用；completed 调 logTimebox）。
```bash
cd frontend && npx vitest run src/domains/timebox/__tests__/cnui-handlers.test.ts
cd frontend && npx tsc --noEmit
git add src/domains/timebox/cnui/surfaces/log-timebox.tsx src/domains/timebox/cnui/handlers.ts src/domains/timebox/index.ts src/domains/timebox/manifest.yaml
git commit -m "feat(timebox): [023] A2.7 logTimebox CNUI surface（三态批量打卡）"
```

---

## Task 8: `/timebox-templates` 配置页（7 段生存时间 + pull 订阅）

> 配置类（不走 Nexus，参 A1 `/config/activity-archetypes/page.tsx`）。7 段生存时间锚点 + pull 模式订阅激活 habits/tasks/threads。CRUD 写 `user_audit_log`。需求列 9 个时间锚点，归并为 7 段（见 design §2.1）。

**Files:**
- Create: `frontend/src/app/timebox-templates/page.tsx`
- Create: `frontend/src/domains/timebox/components/timebox-template-editor.tsx`
- Modify: `frontend/src/lib/db/schema.ts`（加 timebox_templates 表 + 生存时间锚点）
- Create: `frontend/src/lib/db/migrations/0024_timebox_templates.sql` + journal 登记
- Create: `frontend/src/lib/db/repositories/timebox-template.ts`（CRUD + user_audit_log，参 activity-archetype.repository.ts）
- Modify: `docs/database-design.md` + `docs/usom-design.md`（Tier 2）

**Interfaces:**
- Consumes: `user_audit_log`（A1 表）、`HabitRepository.findByUserId({status:'active'})`、`TaskRepository`、Thread 查询（pull 订阅源）
- Produces: `/timebox-templates` 路由；`timebox_templates` 表（user_id + name + 7 段生存时间 jsonb + subscribed_habits/tasks/threads jsonb）；`TimeboxTemplateRepository`（CRUD + audit）

- [ ] **Step 1: Tier 2 文档 + 定稿 7 段**

`docs/database-design.md` 加 `timebox_templates` 表设计；`docs/usom-design.md` 加 7 段生存时间模型。**7 段定稿**（需求 9 锚点归并）：
```
1. 起床（默认起床时间）
2. 晨间（上班通勤 + 早餐时段合并）
3. 上午上班
4. 午间（午餐含午休）
5. 下午上班（含下班通勤合并到下班段）
6. 晚间（晚餐含休息 + 下班通勤）
7. 睡眠（默认睡眠时间）
```
> 实现时若用户/审查偏好保留 9 锚点，按需调整——本 plan 锁 7 段（design §2.1）。

- [ ] **Step 2: schema 加 timebox_templates 表**

`frontend/src/lib/db/schema.ts` 加：
```typescript
// ─── 7.x timebox_templates（时间盒模板，[023] A2，配置类不走 Nexus）──
export const timeboxTemplates = pgTable('timebox_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  name: text('name').notNull(),
  /** 7 段生存时间锚点 { wake, morning, workAm, noon, workPm, evening, sleep } 每段 {start, end} */
  survivalSegments: jsonb('survival_segments').$type<Record<string, { start: string; end: string }>>().notNull(),
  /** pull 订阅的 habits/tasks/threads id */
  subscribedHabits: jsonb('subscribed_habits').$type<string[]>().notNull().default([]),
  subscribedTasks: jsonb('subscribed_tasks').$type<string[]>().notNull().default([]),
  subscribedThreads: jsonb('subscribed_threads').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_timebox_templates_user').on(table.userId),
])
```

- [ ] **Step 3: 迁移 0024 + journal**

创建 `frontend/src/lib/db/migrations/0024_timebox_templates.sql`：
```sql
-- [023] A2: timebox_templates 表（时间盒模板，配置类）
CREATE TABLE IF NOT EXISTS timebox_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version      integer NOT NULL DEFAULT 1,
  name                text NOT NULL,
  survival_segments   jsonb NOT NULL,
  subscribed_habits   jsonb NOT NULL DEFAULT '[]',
  subscribed_tasks    jsonb NOT NULL DEFAULT '[]',
  subscribed_threads  jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timebox_templates_user ON timebox_templates(user_id);
```
journal 追加 idx 23（或实际末尾+1），tag `0024_timebox_templates`。
执行：`psql "$DATABASE_URL" -f src/lib/db/migrations/0024_timebox_templates.sql`。

- [ ] **Step 4: Repository（CRUD + user_audit_log，参 activity-archetype.repository.ts）**

创建 `frontend/src/lib/db/repositories/timebox-template.ts`，复刻 `activity-archetype.repository.ts` 结构：
- `findByUser(userId)` / `findById(id, userId)` / `create(input, userId)`（含 `_logAudit` create）/ `update(id, input, userId)`（含 changedFields + audit）/ `delete(id, userId)`（含 audit）
- `_logAudit` 写 `userAuditLog`，`tableName: 'timebox_templates'`
- 字段：name / survivalSegments / subscribedHabits / subscribedTasks / subscribedThreads

（代码结构与 activity-archetype.repository.ts 1:1，仅换表名 + 字段。实现时复制该文件改字段。）

- [ ] **Step 5: page.tsx（参 config/activity-archetypes/page.tsx）**

创建 `frontend/src/app/timebox-templates/page.tsx`：
```tsx
/**
 * @file page
 * @brief 时间盒模板配置页（[023] A2，配置类不走 Nexus）
 */

import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export default async function TimeboxTemplatesPage() {
  const repo = new TimeboxTemplateRepository()
  const templates = await repo.findByUser('00000000-0000-0000-0000-000000000001')
  return (
    <div className="h-screen flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
```

- [ ] **Step 6: TimeboxTemplateEditor（7 段 + pull 订阅）**

创建 `frontend/src/domains/timebox/components/timebox-template-editor.tsx`：
- 列表展示 templates（name + 7 段摘要）
- 新建/编辑抽屉（复用 timebox-drawer 抽屉外壳或简单表单）：7 段每段 start/end time input + pull 订阅多选（habits/tasks/threads，从对应 Repository 拉激活列表）
- 保存/删除调 Repository（CRUD，写 audit log）；toast 反馈
- empty/loading/error/success 四态（UI-DESIGN-SPEC）

> pull 订阅源：`new HabitRepository().findByUserId(MVP_USER_ID, {status:'active', trackable:true})`、`new TaskRepository().findByStatus('todo', MVP_USER_ID)`、threads 查询（参 `getThreads()` in tasks actions）。

（组件结构参 archetype-table.tsx（A1）+ TimeboxDrawer 抽屉范式；实现时 Read archetype-table 对齐。）

- [ ] **Step 7: 测试 + tsc + /browse + Commit**

- Repository 单测（CRUD + audit 写入，参 activity-archetype repository 测试范式）
- `npx vitest run` + `npx tsc --noEmit` 零新增
- `/browse` 打开 `/timebox-templates` 视觉验证

```bash
git add src/app/timebox-templates/page.tsx src/domains/timebox/components/timebox-template-editor.tsx \
  src/lib/db/schema.ts src/lib/db/migrations/0024_timebox_templates.sql \
  src/lib/db/migrations/meta/_journal.json src/lib/db/repositories/timebox-template.ts \
  docs/database-design.md docs/usom-design.md
git commit -m "feat(timebox): [023] A2.8 /timebox-templates 配置页（7 段生存时间 + pull 订阅 + audit）"
```

---

## Task 9: manifest 清理 + ESLint 防回退 + §IX 七层 + 基线收尾

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（lifecycle 走 SM、view_routes 标准化、subscribed_events、intent_triggers 收敛）
- Modify: `frontend/eslint.config.mjs`（加 no-restricted-imports 防 timebox→tasks/habits direct import）
- Modify: `docs/usom-design.md` + `manifest.md`（§IX + [023] A2 条目）
- Verify: vitest/tsc 基线、§IX 七层、UI-DESIGN-SPEC §14 + §11.10

- [ ] **Step 1: manifest lifecycle/view_routes/subscribed_events 清理**

`manifest.yaml`：
- `view_routes`（区块 G）标准化（参 022 RC-3 `component: null` 标注）：
  ```yaml
  view_routes:
    viewSchedule:
      component: null
      url: /schedule
    createTimebox:
      component: null
      url: /schedule
    config_timebox_templates:
      component: null
      url: /timebox-templates
    config_activity_archetypes:
      component: null
      url: /config/activity-archetypes
  ```
  （删除指向不存在 page 组件的旧 `domains/timebox/pages/...` 条目。）
- `intent_triggers`：保留导航类（viewSchedule → /schedule），createTimebox/startTimebox/endTimebox/cancelTimebox/logTimebox 的 lifecycle 走 SM（这些 action 仍作为 intent_trigger 供 AI 助手，但执行走 lifecycle SM 而非 AI 生成）——确认 manifest lifecycle 区块（已有，区块 B）覆盖这 5 个 transition。
- `subscribed_events`（区块 F）：保持现状（OQ-8，timebox 不订阅自己），确认含 ExecutionLogged。

- [ ] **Step 2: ESLint no-restricted-imports 防 direct import**

`frontend/eslint.config.mjs` 加规则（防 timebox scheduling-handler 直接 import tasks/habits，N-1）：
```javascript
{
  files: ['src/domains/timebox/**/*'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/domains/tasks/*', '@/domains/habits/*'], message: '[023] timebox 域禁止直接 import tasks/habits（跨域走 orchestrator/context provider）' },
      ],
    }],
  },
}
```
> 注意：现有 `cnui/handlers.ts` 有 `import { TaskRepository } from '@/domains/tasks/repository'` 等——这是 CNUI handler 读侧聚合（非写侧 direct import），需评估：要么改走 context provider，要么该 eslint 规则仅限 `handlers/scheduling-handler.ts`（`files` 缩窄到 scheduling-handler）。**实现时先 audit cnui/handlers.ts 的 tasks/habits import 是否为读侧聚合**，若是则把 eslint files 缩窄到 `src/domains/timebox/handlers/**`（scheduling-handler），不误伤 CNUI 读聚合。

- [ ] **Step 3: §IX 七层 checklist 走完**

按 `manifest.md` / constitution §IX 七层逐项验证 timebox 域（数据层→类型→规则→hooks→CNUI→page→manifest）。每层对应 A2 产出打勾。

- [ ] **Step 4: Tier 2 文档 + manifest.md 同步**

- `docs/usom-design.md`：timebox 引用 Activity Archetype + activityArchetypeId 已在 T1 补；确认 7 段生存时间（T8）已写。
- `manifest.md`：加 [023] A2 条目（A2 范围 + commit 引用）。

- [ ] **Step 5: 全量基线（Change Gate）**

```bash
cd frontend
# vitest 全量（对比 main base 失败集合）
npx vitest run 2>&1 | tail -20
# tsc 全量
npx tsc --noEmit 2>&1 | tail -20
```
Expected: vitest 零新增失败（对比 `git stash && npx vitest run` 的 base 集合，再 `git stash pop`）；tsc 零新增错误。

- [ ] **Step 6: /browse E2E 5 场景（真实 PG）**

用 gstack `/browse` 验证：
1. `/schedule` 新建时间盒（Drawer）→ 选 Archetype → 保存 → 列表出现 → 真实落库
2. `/schedule` 编辑/删除（cancel）/lifecycle（start→end→log）全状态流转
3. AI 助手 `/createTimebox 10:00-11:00 写作；14:00 会议` → CNUI 翻页 → 提交全部 → 落库
4. AI 助手 `/logTimebox` 批量打卡三态 → 落库
5. `/timebox-templates` 新建模板（7 段 + 订阅 habits）→ audit log 写入

每场景截图 + 真实 DB 查询确认。

- [ ] **Step 7: UI-DESIGN-SPEC §14 + §11.10 自检**

按 UI-DESIGN-SPEC §14（C-01~C-07）+ §11.10 CNUI（CUC-01~CUC-12）逐项过 Drawer/3 CNUI/templates 页面。

- [ ] **Step 8: Commit + 收尾**

```bash
git add src/domains/timebox/manifest.yaml eslint.config.mjs docs/usom-design.md manifest.md
git commit -m "chore(timebox): [023] A2.9 manifest 清理 + ESLint 防回退 + §IX 七层 + 基线"
```

---

## Self-Review

**1. Spec coverage**（design §2.1 八 task → plan task）：
- T1 → design task 1（schema activityArchetypeId + 迁移）✓
- T2（写路径打通）→ design 验收 #1「5 action 走通 Nexus」的必要前置（design 未单列，plan 增列为独立 reviewable task，writing-plans 允许）✓
- T3 → design task 2（/schedule page）✓
- T4 → design task 3（Drawer Variant C v2）✓
- T5/T6/T7 → design task 4/5/6（3 CNUI surface）✓
- T8 → design task 7（/timebox-templates page）✓
- T9 → design task 8（manifest 清理 + §IX + 基线）✓
- design §2.2 OUT 全部排除（EnergyState 不扣减 / habitsTemplates 硬删交 A3 / tasks·habits 外键交 A3 / KR junction 交 A4 / 冲突深度校验留后续）✓

**2. Placeholder scan**：
- T8 Step 6「组件结构参 archetype-table.tsx」——这是「follow 现有范式」非 placeholder，但实现时须 Read archetype-table.tsx 对齐。可接受（A0/A1 plan 同款引用现有范式）。
- T9 Step 2 ESLint files 范围「实现时 audit」——给出两个明确选项（缩窄到 scheduling-handler / 全域），非开放 placeholder。
- 无 TBD/TODO/"add error handling" 等红旗。

**3. Type consistency**：
- `activityArchetypeId?: USOM_ID`（T1 objects.ts）↔ mapper（T1）↔ CreateTimeboxInput（T2）↔ Drawer state（T4）↔ CreateTimebox surface draft（T5）一致 ✓
- `DrawerMode = 'create' | 'edit' | 'template-batch'`（T4）↔ ScheduleWorkspace DrawerState（T3）一致 ✓
- `TimeboxActionResult` 判别联合（T2）↔ Drawer confirming 处理（T4）一致 ✓
- `createTimebox/updateTimebox/transitionTimebox/deleteTimebox`（T2）签名 ↔ Drawer/ScheduleWorkspace/handlers 调用一致 ✓
- `submitDynamicIntent(domainId, action, fields, confirmed)` 返回 `{success, object, needsConfirmation, confirmationMessage, error}`（T2 注明以 intent.ts 实际为准）✓

**4. 风险点（实现时关注）**：
- T2 orchestrator 对 timebox 的分发路径（遗留 executeTransition vs 统一 executeIntent + mutation service）——Step 1 审计先行，按 [025] tasks completeTask 范式落地。
- T3 DayView 实际 props ——Step 3 Read 对齐。
- T8 7 段归并（需求 9 锚点 → 7 段）——design §2.1 已锁，实现按锁定的 7 段。
- ESLint no-restricted-imports 不误伤 CNUI 读侧聚合（T9 Step 2 audit）。
- 迁移 journal idx（已知 snapshot 债）——实现时 tail 确认实际末尾 idx。
