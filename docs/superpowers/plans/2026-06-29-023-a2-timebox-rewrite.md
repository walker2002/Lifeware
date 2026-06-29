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
- Produces: `Timebox.activityArchetypeId?: USOM_ID`；`Timebox.taskIds`/`habitIds` 已有 USOM 类型（objects.ts:642-643）但 **DB 列缺**——**T1 一并加列** `task_ids uuid[]` / `habit_ids uuid[]`（nullable，无 FK 外键约束，仅作软关联；强一致性由 habits.tasks 域各自负责）；mapper 双向映射；DB 列 `activity_archetype_id uuid`（nullable，ON DELETE SET NULL）

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
  // [023] A2 OV#P1-#2: USOM 类型已声明 taskIds/habitIds，DB 列补齐（D7 LinkPicker 数据落库依赖）
  taskIds: uuid('task_ids').array(),  // 软关联，无 FK 外键
  habitIds: uuid('habit_ids').array(), // 软关联，无 FK 外键
```
（`uuid` 与 `activityArchetypes` 已在 schema.ts 顶部 import/定义，无需新增 import。）

- [ ] **Step 3: 写迁移 SQL**

创建 `frontend/src/lib/db/migrations/0023_timebox_activity_archetype_fk.sql`：
```sql
-- [023] A2: timeboxes 加 activity_archetype_id 外键（nullable，ON DELETE SET NULL）
-- 关联 A1 的 activity_archetypes 表。logTimebox 时带入活动原型，能量消耗从 archetype 读取。
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- [023] A2 OV#P1-#2: USOM Timebox.taskIds/habitIds 落库列（D7 LinkPicker 依赖）
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS task_ids uuid[] DEFAULT '{}';
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS habit_ids uuid[] DEFAULT '{}';

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
- `TimeboxRow` type（~行 385）加字段：`activityArchetypeId: string | null;` `taskIds: string[] | null;` `habitIds: string[] | null;`
- `timeboxRowToUSOM`（~行 404）返回对象加：`activityArchetypeId: row.activityArchetypeId ?? undefined,` `taskIds: row.taskIds ?? [],` `habitIds: row.habitIds ?? [],`
- `timeboxUSOMToRow`（~行 419）返回对象加：`activityArchetypeId: timebox.activityArchetypeId ?? null,` `taskIds: timebox.taskIds ?? null,` `habitIds: timebox.habitIds ?? null,`

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

- [ ] **Step 1: 审计 [025] 写路径分叉（理解现状，不写代码）**

Run 并阅读，理解 state transition 与 field write 两条路径：
```bash
cd frontend
sed -n '320,345p' src/app/actions/intent.ts          # executeFieldStateWrite：tasks-only 回调
sed -n '937,985p' src/app/actions/intent.ts          # habits updateHabit：字段写直调 service.execute
grep -n "executeIntent\|executeTransition" src/nexus/orchestrator/index.ts  # 统一入口
```
**已确认的现状（plan-eng-review OV-T2 亲核，无需再查）**：
1. **状态转换已通**：`submitDynamicIntent('timebox', action)` → `executePipeline` → `orchestrator.executeIntent` → `getRepo(timebox)`（intent.ts:300+ 支持 timebox）。**5 个 action（create/start/end/cancel/log）经此路径本就落库**，本 task 不动 orchestrator。
2. **字段写是 gap**：`executeFieldStateWrite`（intent.ts:323）tasks-only、manifest 无 `updateTimebox` intent_trigger。故编辑（标题/时间/archetype）**不能走 submitDynamicIntent**（那是死调用），必须像 habits `updateHabit`（intent.ts:937-985）**直调** `createTimeboxMutationService().execute({ steps: fieldSteps })`。

> 本 task 仅做 field-write 直调接线（Step 4/5）；create/transition/delete 三个 state action 复用已通的 submitDynamicIntent 路径（delete 加 OV#8 守卫）。

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
import { createTimeboxMutationService } from './timebox/mutation-service'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import type { Timebox } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

/** MVP 固定用户 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * A3 owner-check：activityArchetypeId 必须属于当前用户。
 * FK 约束只证「存在」不证「租户隔离」——跨用户 archetype id 仍能命中 FK，
 * 故写前显式按 (id, userId) 校验归属（参 learning fk-doesnt-enforce-tenant-isolation）。
 */
async function assertArchetypeOwned(archetypeId: string): Promise<void> {
  const arch = await new ActivityArchetypeRepository().findById(archetypeId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!arch) throw new Error('活动原型不存在或不属于当前用户')
}

/** Timebox 写操作结果（判别联合） */
export type TimeboxActionResult =
  | { status: 'ok'; timebox: Timebox }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }

/** createTimebox 表单输入 */
export interface CreateTimeboxInput {
  title: string
  startTime: string // ISO
  endTime: string // ISO（派生：startTime + duration；客户端折好，server 不接受 duration）
  activityArchetypeId?: string
  taskIds?: string[] // [023] A2 OV#P1：T1 schema timeboxes 加 task_ids/habit_ids 列（USOM 类型已声明，D7 LinkPicker 数据落库依赖）
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
  // A3 owner-check：archetype 归属校验（FK 只证存在）
  if (input.activityArchetypeId) await assertArchetypeOwned(input.activityArchetypeId)
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
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
 * 字段更新（编辑标题/时间/archetype）— 直调 mutation service 字段写（habits 直调范式）
 *
 * [023] A2 关键修正（OV-T2）：字段写**不走** submitDynamicIntent——manifest 无
 * updateTimebox intent_trigger，那是死调用。改为像 habits `updateHabit`
 * （intent.ts:937-985）那样直调 createTimeboxMutationService().execute()，
 * 在单事务内按字段 step 写（经字段执行器字段级校验，绕过 manifest 路由键）。
 * 仅值非 undefined 的字段造 step（与旧 repo 条件展开语义一致）。
 * 字段写无 needs_confirm（重叠提示仅在 create 路径，edit 返回 ok/throw）。
 *
 * [023] A2 OV#P1-#1：客户端必须把 `duration` 折成 `endTime = startTime + duration`
 * 在 Drawer edit 路径已实现（本函数不接 duration 字段；USOM Timebox 无 duration 字段）。
 *
 * @param timeboxId - 目标时间盒 ID
 * @param fields - 待写字段（仅值非 undefined 落库）
 */
export async function updateTimebox(
  timeboxId: string,
  fields: Record<string, unknown>,
): Promise<TimeboxActionResult> {
  try {
    // A3 owner-check：archetype 归属校验（字段写路径同样校验）
    if (typeof fields.activityArchetypeId === 'string') await assertArchetypeOwned(fields.activityArchetypeId)
    const fieldSteps = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) => ({ kind: 'field' as const, field, value }))

    // 无字段可写：直接读回当前时间盒返回（保持契约——成功且有 timebox）
    if (fieldSteps.length === 0) {
      const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
      if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
      return { status: 'ok', timebox: tb }
    }

    const service = createTimeboxMutationService()
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'timebox',
        objectType: 'timebox',
        targetId: timeboxId as USOM_ID,
        steps: fieldSteps,
      },
      MVP_USER_ID as USOM_ID,
    )
    if (!res.success) throw new Error(res.error ?? '更新时间盒失败')

    // 纯 field steps 下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
    // 兜底用 findById 读回更新后的时间盒。
    if (res.object) return { status: 'ok', timebox: res.object as Timebox }
    const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
    return { status: 'ok', timebox: tb }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '更新时间盒失败')
  }
}

/**
 * 删除（cancel 软退场；硬删 MVP 不提供，编辑模式「删除」= cancel）
 *
 * [023] A2 OV#8 状态守卫：cancel 仅对 planned/running 合法。对 ended/logged/cancelled
 * 调 cancelTimebox 会触发 SM 非法转换错误（崩溃），故派发前显式拒绝并给清晰提示。
 */
const CANCELABLE_STATUSES = new Set(['planned', 'running'])

export async function deleteTimebox(timeboxId: string): Promise<TimeboxActionResult> {
  const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
  if (!CANCELABLE_STATUSES.has(tb.status)) {
    throw new Error(`该时间盒已${tb.status === 'logged' ? '记录' : '结束'}，不可删除（仅未开始/进行中可取消）`)
  }
  return transitionTimebox(timeboxId, 'cancel', {})
}
```

> **注**：`submitDynamicIntent` 的返回类型 `IntentSubmissionResult` 字段名以实际为准（`result.object` / `result.needsConfirmation` / `result.confirmationMessage` / `result.error`）。Step 1 审计时若字段名不同，按 `intent.ts` 实际定义对齐。

- [ ] **Step 6: 写失败测试 — 写路径单测**

创建 `frontend/src/domains/timebox/__tests__/timebox-mutation.test.ts`：
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 状态转换路径依赖
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))
// 字段写路径依赖（updateTimebox 直调）
const mockExecute = vi.fn()
vi.mock('@/app/actions/timebox/mutation-service', () => ({
  createTimeboxMutationService: () => ({ execute: mockExecute }),
}))
const mockFindById = vi.fn()
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: vi.fn().mockImplementation(() => ({ findById: mockFindById })),
}))

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimebox, transitionTimebox, updateTimebox, deleteTimebox } from '@/app/actions/timebox'

describe('[023] A2 timebox server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createTimebox 成功 → status ok（走 submitDynamicIntent）', async () => {
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

  it('transitionTimebox start → startTimebox intent（走 submitDynamicIntent）', async () => {
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'running' } })
    const r = await transitionTimebox('tb-1', 'start')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'startTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })

  it('updateTimebox 字段写 → 直调 mutation service.execute（不经 submitDynamicIntent）', async () => {
    // execute 返回 object，跳过 findById 兜底
    mockExecute.mockResolvedValue({ success: true, object: { id: 'tb-1', title: '写作', status: 'planned' } })
    const r = await updateTimebox('tb-1', { title: '写作', activityArchetypeId: 'arch-1' })
    expect(r.status).toBe('ok')
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
      domainId: 'timebox', objectType: 'timebox', targetId: 'tb-1',
      steps: [
        { kind: 'field', field: 'title', value: '写作' },
        { kind: 'field', field: 'activityArchetypeId', value: 'arch-1' },
      ],
    }), expect.anything())
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('updateTimebox 仅 undefined 字段 → findById 读回，不写', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', title: 'x', status: 'planned' })
    const r = await updateTimebox('tb-1', { title: undefined })
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockFindById).toHaveBeenCalledWith('tb-1', expect.anything())
    expect(r.status).toBe('ok')
  })

  it('deleteTimebox 对 logged 状态 → 抛错守卫（OV#8，不派发 cancel）', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', status: 'logged' })
    await expect(deleteTimebox('tb-1')).rejects.toThrow(/不可删除/)
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('deleteTimebox 对 planned 状态 → 派发 cancelTimebox', async () => {
    mockFindById.mockResolvedValue({ id: 'tb-1', status: 'planned' })
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-1', status: 'cancelled' } })
    const r = await deleteTimebox('tb-1')
    expect(r.status).toBe('ok')
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'cancelTimebox', expect.objectContaining({ objectId: 'tb-1' }), undefined)
  })
})
```

- [ ] **Step 7: 跑测试 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/__tests__/timebox-mutation.test.ts`
Expected: 7 PASS（createTimebox×2 + transition×1 + updateTimebox×2 + deleteTimebox×2）。

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
import { transitionTimebox, getTimeboxById } from '@/app/actions/timebox'
import { getTimeboxesByRange } from '@/app/actions/intent'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Timebox } from '@/usom/types/objects'
import type { TimeboxSummary } from '@/usom/types/summaries'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** Drawer 打开状态 */
interface DrawerState {
  mode: DrawerMode
  editTarget?: Timebox
}

export function ScheduleWorkspace() {
  const [date, setDate] = useState(() => new Date())
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const loadDay = useCallback(async (d: Date) => {
    setLoading(true)
    try {
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      // 走 server action（客户端禁止直 import db repo / drizzle）；返回 TimeboxSummary[]
      const list = await getTimeboxesByRange(start, end)
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

  // 编辑：列表只有 summary（无 activityArchetypeId/notes），按 id 取完整 Timebox 再开 Drawer
  const handleEdit = useCallback(async (summary: TimeboxSummary) => {
    const tb = await getTimeboxById(summary.id)
    if (tb) setDrawer({ mode: 'edit', editTarget: tb })
  }, [])

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
              currentDate={date}
              onAction={(id, action) => handleAction(id, action as any)}
              onEdit={handleEdit}
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

> **注（C1）**：`DayView` 实际 props 为 `{ timeboxes, currentDate, onDateSelect?, onAction? }`（**无 onEdit**）。Step 3b 显式为 DayView/TimeboxList/TimeboxCard 三层补 `onEdit`（卡片标题点击进入编辑）；`getTimeboxById` 读 action 在 Step 3a 落地（编辑入口需完整 Timebox）。

- [ ] **Step 3a: 加 getTimeboxById 读 action（编辑入口需要完整 Timebox）**

`frontend/src/app/actions/timebox.ts` 末尾加（读 action，与 T2 写 action 同文件）：
```typescript
/** 按 id 读完整 Timebox（编辑 Drawer 需要 activityArchetypeId/notes 等 summary 缺失字段） */
export async function getTimeboxById(timeboxId: string): Promise<Timebox | null> {
  return new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
}
```

- [ ] **Step 3b: DayView / TimeboxList / TimeboxCard 三层补 onEdit（C1）**

`day-view.tsx` DayViewProps 加 `onEdit?: (tb: TimeboxSummary) => void`，透传 TimeboxList：
```typescript
interface DayViewProps {
  timeboxes: TimeboxSummary[]
  currentDate: Date
  onDateSelect?: (date: Date) => void
  onAction?: (timeboxId: string, action: string) => void
  onEdit?: (tb: TimeboxSummary) => void   // [023] A2 C1：卡片标题点击进入编辑
}
// render: <TimeboxList timeboxes={sorted} compact onAction={onAction} onEdit={onEdit} />
```
`timebox-list.tsx` TimeboxListProps 加 `onEdit?`，透传 TimeboxCard（compact 与 full 两处 render）。
`timebox-card.tsx` TimeboxCardProps 加 `onEdit?`，标题节点绑 `onClick={() => onEdit?.(timebox)}` + `cursor-pointer hover:underline`（compact 的标题 span 与 full 的 `<h3>` 都绑）。

> 实现时 Read 三个文件对齐现有 `onAction` 线程，`onEdit` 沿同一链路加。

- [ ] **Step 3c: TimeboxCard 显示 archetype 名（OV#4，死字段最小消费方）**

`TimeboxSummary`（`usom/types/summaries.ts`）加 `archetypeName?: string`；`timeboxToSummary`（intent.ts mapper）按 `activityArchetypeId` 解析 archetype 名（`ActivityArchetypeRepository` 单查/批查）填入。TimeboxCard 在标题行渲染 `{timebox.archetypeName && <span className="text-xs text-muted">· {archetypeName}</span>}`。

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

> **C4**：抽屉用 `components/ui/sheet.tsx`（radix Dialog，参 `okrs/components/cycle-create-drawer.tsx` 范本）——focus-trap / scroll-lock / Esc / scrim / slide 动画均由 radix 接管，**弃 [021] TaskCreateDrawer 的手写壳**。mockup `variant-c-v2.html`（标题→活动原型 sub-card→时间→关联→备注；4 维 accordion 默认收起 C.R2；数字可输入 C.R1）。字段顺序：**标题 → 活动原型(嵌套 sub-card) → 时间 → 备注 → 关联 task/KR**。

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
 * 提交走 T2 server actions；create 路径 needs_confirm 弹窗二次确认。
 * [023] A2 C4：用 components/ui/sheet.tsx（radix Dialog）——自带 focus-trap / scroll-lock /
 * Esc 关闭 / scrim / slide 动画，弃手写壳。参 okrs cycle-create-drawer.tsx 抽屉范本。
 */

'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'  // [023] A2 OV#P2-#5：needs_confirm 弹窗用原语（非手写 modal）
import { ArchetypePicker } from './archetype-picker'
import { createTimebox, updateTimebox, type CreateTimeboxInput } from '@/app/actions/timebox'
import type { Timebox } from '@/usom/types/objects'

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

  // Esc 关闭 / focus-trap / scroll-lock 由 radix Sheet 接管；Cmd+Enter 提交绑在 SheetContent.onKeyDown

  const handleSubmit = useCallback(async (confirmed?: boolean) => {
    const trimmed = title.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const startIso = new Date(startTime).toISOString()
      // [023] A2 OV#P1-#1：把 duration 折成 endTime（USOM 无 duration 字段，避免 service.execute 写入不存在的列）
      const endIso = new Date(new Date(startIso).getTime() + duration * 60000).toISOString()
      if (mode === 'edit' && editTarget) {
        // 字段写直调（T2 OV-T2）：updateTimebox 无 confirmed / needs_confirm
        await updateTimebox(editTarget.id, { title: trimmed, startTime: startIso, endTime: endIso, activityArchetypeId, notes: notes || undefined })
        toast.success('时间盒已更新')
        onSaved()
        return
      }
      const input: CreateTimeboxInput = {
        title: trimmed,
        startTime: startIso,
        endTime: endIso,
        activityArchetypeId,
        notes: notes || undefined,
      }
      const r = await createTimebox(input, confirmed)
      if (r.status === 'needs_confirm') {
        setConfirming({ message: r.message, action: () => handleSubmit(true) })
      } else {
        toast.success('时间盒已创建')
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
      <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
        <SheetContent
          side="right"
          className="w-[520px] sm:max-w-[520px] gap-0 p-0"
          aria-label={MODE_TITLE[mode]}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit() }}
        >
          <SheetHeader className="flex flex-row items-center justify-between shrink-0 space-y-0 px-5 py-3 border-b border-hairline-soft">
            <SheetTitle className="text-sm font-semibold text-ink">{MODE_TITLE[mode]}</SheetTitle>
          </SheetHeader>
          <SheetDescription className="sr-only">{MODE_TITLE[mode]}</SheetDescription>

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
              <Button variant="destructive" size="sm" onClick={() => { /* deleteTimebox = cancel，OV#8 守卫在 action 内 */ }}>删除</Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button onClick={() => handleSubmit()} disabled={!title.trim() || submitting}>
                {submitting ? '保存中…' : '保存时间盒'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* needs_confirm 二次确认弹窗（仅 create 路径；用 AlertDialog 原语，[023] A2 OV#P2-#5） */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认创建</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirming?.action(); setConfirming(null) }}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  it('edit 模式提交触发 updateTimebox（非 createTimebox）', async () => {
    const { updateTimebox } = await import('@/app/actions/timebox')
    render(
      <TimeboxDrawer
        mode="edit"
        editTarget={{ id: 'tb-1', title: '旧标题', startTime: '2026-06-29T09:00:00Z', endTime: '2026-06-29T10:00:00Z', notes: '' } as any}
        date={new Date('2026-06-29')} onClose={() => {}} onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('例如：专注写作'), { target: { value: '新标题' } })
    fireEvent.click(screen.getByText('保存时间盒'))
    await new Promise(r => setTimeout(r, 0))
    expect(updateTimebox).toHaveBeenCalledWith('tb-1', expect.objectContaining({ title: '新标题' }))
    expect(createTimebox).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: 跑测试 + tsc + /browse 视觉**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/timebox-drawer.test.tsx`
Expected: 4 PASS（create×3 + edit×1）。

Run: `cd frontend && npx tsc --noEmit`
Expected: T3 的 schedule-workspace 引用此 Drawer，错误消除，无新增。

视觉：`/browse` 打开 `/schedule` → 点「新建时间盒」→ 截图确认 Sheet 抽屉 520px + 字段顺序 + Archetype sub-card + 4 维 accordion 默认收起（C.R2）；确认 **focus-trap / scroll-lock / Esc 关闭 / scrim 点击关闭** 由 radix Sheet 正常工作（C4）。

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
- `submit(action, fields)` 加分支：`if (action === 'createTimebox')` → 取 `fields.items`，逐条 `await submitDynamicIntent('timebox','createTimebox', item)`。**C3：不回滚，收集 succeeded/failed 明细返回**（部分失败时 success=false 但 data 带 succeeded/failed 列表，UI 据此展示哪些成功）。

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
    // C3：逐条提交不回滚，收集 succeeded/failed 明细
    const succeeded: string[] = []
    const failed: { title: string; error: string }[] = []
    for (const it of items) {
      const r = await submitDynamicIntent('timebox', 'createTimebox', it)
      if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
      else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
    }
    return {
      success: failed.length === 0,
      error: failed.length ? `${failed.length} 条失败：${failed.map(f => f.title).join('、')}` : undefined,
      data: { count: succeeded.length, succeeded, failed },
    }
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
  // [023] A2 OV#P2-#3：open 时由 handler 注入初始快照，submit 比对（无改动不触发 updateTimebox）
  _origTitle?: string
  _origStart?: string
  _origEnd?: string
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
- `open` 现有 `adjustRemainingSchedule` 分支已返回 existingTimeboxes。**补**：把 items 也放 dataSnapshot（供 surface 用），并**注入 _origTitle/_origStart/_origEnd** 初始快照供 submit diff：
  ```typescript
  dataSnapshot: {
    items: timeboxes.map(t => ({
      id: t.id, title: t.title, startTime: t.startTime, endTime: t.endTime, status: t.status,
      _origTitle: t.title, _origStart: t.startTime, _origEnd: t.endTime,  // [023] A2 OV#P2-#3：初始快照
    })),
  }
  ```
- `submit` 加分支（**字段写走 updateTimebox 直调、cancel 走 deleteTimebox 守卫，非死调用 submitDynamicIntent**）：
```typescript
if (action === 'adjustRemainingSchedule') {
  const { updateTimebox, deleteTimebox } = await import('@/app/actions/timebox')
  const items = (fields.items as any[]) ?? []
  for (const it of items) {
    if (it.cancel) {
      // cancel 走 deleteTimebox（=cancel + OV#8 状态守卫），非 raw submitDynamicIntent
      try {
        await deleteTimebox(it.id)
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '取消失败' }
      }
    } else if (it.title !== it._origTitle || it.startTime !== it._origStart || it.endTime !== it._origEnd) {
      // 字段写直调（updateTimebox 直调 mutation service.execute，OV-T2）
      try {
        await updateTimebox(it.id, { title: it.title, startTime: it.startTime, endTime: it.endTime })
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
    }
  }
  return { success: true, data: { count: items.length } }
}
```
> diff 判定：open 时已在 items map 里注入 `_origTitle/_origStart/_origEnd`（见上），submit 比对。

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
- **A3 owner-check**：`create`/`update` 落库前校验 `subscribedHabits/subscribedTasks/subscribedThreads` 中每个 id 归属当前 userId（参 `assertArchetypeOwned` 思路）——
  ```typescript
  // 私有方法：逐集合校验归属（批量 findByX，任一不属于本用户即抛错）
  private async assertOwned(ids: string[], repo: { findById: (id: USOM_ID, userId: USOM_ID) => Promise<{ id: string } | null> }, userId: USOM_ID, label: string) {
    for (const id of ids) {
      const obj = await repo.findById(id as USOM_ID, userId)
      if (!obj) throw new Error(`订阅的${label} ${id} 不存在或不属于当前用户`)
    }
  }
  // create/update 内：await Promise.all([
  //   this.assertOwned(input.subscribedHabits ?? [], new HabitRepository(), userId, '习惯'),
  //   this.assertOwned(input.subscribedTasks ?? [], new TaskRepository(), userId, '任务'),
  //   this.assertOwned(input.subscribedThreads ?? [], new ThreadRepository(), userId, '线程'),
  // ])
  ```

（代码骨架与 activity-archetype.repository.ts 1:1，仅换表名 + 字段 + 加上述 owner-check。实现时复制该文件改字段。）

- [ ] **Step 5: server actions（CRUD 包装 + 订阅源拉取）**

Repository 是 server-only（drizzle），客户端编辑器需经 server action 读写。创建 `frontend/src/app/actions/timebox-templates.ts`：
```typescript
/**
 * @file timebox-templates actions
 * @brief 时间盒模板配置 server actions（[023] A2，配置类不走 Nexus）
 *
 * 包装 TimeboxTemplateRepository（CRUD + audit），供客户端编辑器调用。
 */
'use server'

import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { HabitRepository } from '@/domains/habits/repository/habit'
import type { USOM_ID } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID

export interface TimeboxTemplateInput {
  id?: string
  name: string
  /** 7 段生存时间锚点 */
  survivalSegments: Record<string, { start: string; end: string }>
  subscribedHabits?: string[]
  subscribedTasks?: string[]
  subscribedThreads?: string[]
}

export async function saveTimeboxTemplate(input: TimeboxTemplateInput) {
  const repo = new TimeboxTemplateRepository()
  return input.id ? repo.update(input.id, input, MVP_USER_ID) : repo.create(input, MVP_USER_ID)
}

export async function deleteTimeboxTemplate(id: string) {
  return new TimeboxTemplateRepository().delete(id, MVP_USER_ID)
}

/** pull 订阅源：当前用户可选的 habits/tasks/threads（多选 options） */
export async function fetchSubscriptionSources() {
  const habits = await new HabitRepository().findByUserId(MVP_USER_ID, { status: 'active', trackable: true } as any)
  // tasks / threads：实现时按 TaskRepository / Thread 实际 findByX 方法对齐
  // （参 app/actions/tasks.ts getThreads）；此处先返 habits，tasks/threads 同构追加
  return { habits, tasks: [] as any[], threads: [] as any[] }
}
```

- [ ] **Step 6: page.tsx（server component，仅取 templates）**

创建 `frontend/src/app/timebox-templates/page.tsx`（订阅源由编辑器懒加载，避免 page 耦合多域 repo）：
```tsx
/**
 * @file page
 * @brief 时间盒模板配置页（[023] A2，配置类不走 Nexus）
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export default async function TimeboxTemplatesPage() {
  const templates = await new TimeboxTemplateRepository().findByUser('00000000-0000-0000-0000-000000000001')
  return (
    <div className="h-screen flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
```

- [ ] **Step 7: TimeboxTemplateEditor（客户端，7 段 + pull 订阅）**

创建 `frontend/src/domains/timebox/components/timebox-template-editor.tsx`（参 `archetype-table.tsx` 表格 + 编辑抽屉范式）：
```tsx
/**
 * @file timebox-template-editor
 * @brief 时间盒模板编辑器（[023] A2，配置类，7 段生存时间 + pull 订阅）
 *
 * 列表 + 新建/编辑抽屉。CRUD 经 app/actions/timebox-templates（server action），
 * 订阅源懒加载。配色用 CSS 变量令牌。
 */
'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  saveTimeboxTemplate, deleteTimeboxTemplate, fetchSubscriptionSources,
  type TimeboxTemplateInput,
} from '@/app/actions/timebox-templates'

/** 7 段生存时间（锁，参 design §2.1；新增/编辑按此顺序渲染） */
const SEGMENTS: { key: string; label: string }[] = [
  { key: 'wake', label: '起床' }, { key: 'morning', label: '晨间' },
  { key: 'workAm', label: '上午上班' }, { key: 'noon', label: '午间' },
  { key: 'workPm', label: '下午上班' }, { key: 'evening', label: '晚间' },
  { key: 'sleep', label: '睡眠' },
]

interface EditorProps {
  initialTemplates: TimeboxTemplateInput[]
}

export function TimeboxTemplateEditor({ initialTemplates }: EditorProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [editing, setEditing] = useState<TimeboxTemplateInput | null>(null)
  const [sources, setSources] = useState<{ habits: any[]; tasks: any[]; threads: any[] }>({ habits: [], tasks: [], threads: [] })
  const [saving, setSaving] = useState(false)

  const ensureSources = useCallback(async () => {
    if (sources.habits.length === 0) setSources(await fetchSubscriptionSources())
  }, [sources])

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      const saved = await saveTimeboxTemplate(editing)
      toast.success('模板已保存')
      setTemplates(prev => prev.some(t => t.id === (saved as any).id)
        ? prev.map(t => (t.id === (saved as any).id ? (saved as any) : t))
        : [...prev, saved as any])
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTimeboxTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      toast.success('模板已删除')
    } catch (e) { toast.error('删除失败') }
  }

  function blankTemplate(): TimeboxTemplateInput {
    const survivalSegments = Object.fromEntries(SEGMENTS.map(s => [s.key, { start: '09:00', end: '10:00' }]))
    return { name: '', survivalSegments, subscribedHabits: [], subscribedTasks: [], subscribedThreads: [] }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-base font-display text-ink">时间盒模板</h1>
          <Button size="sm" onClick={() => { ensureSources(); setEditing(blankTemplate()) }}>
            <Plus className="size-4 mr-1" />新建模板
          </Button>
        </div>

        {/* 列表：name + 7 段摘要 + 编辑/删除 */}
        {templates.length === 0 ? (
          <p className="text-sm text-body py-12 text-center">还没有模板</p>
        ) : templates.map(t => (
          <div key={t.id} className="mb-2 rounded-md border border-hairline bg-surface-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{t.name || '未命名'}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { ensureSources(); setEditing({ ...t }) }}>编辑</Button>
                <Button size="sm" variant="ghost" className="text-error" onClick={() => t.id && handleDelete(t.id)}>删除</Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SEGMENTS.map(s => (
                <span key={s.key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-body">
                  {s.label} {(t.survivalSegments as any)?.[s.key]?.start}
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* 编辑表单（inline；抽屉化可选，参 archetype-table） */}
        {editing && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim" onClick={() => setEditing(null)}>
            <div className="mx-4 w-full max-w-lg rounded-lg bg-canvas p-6 shadow-lg" onClick={e => e.stopPropagation()}>
              <h2 className="mb-4 text-sm font-semibold text-ink">{editing.id ? '编辑模板' : '新建模板'}</h2>
              <input
                value={editing.name} placeholder="模板名称"
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                className="mb-4 h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
              {/* 7 段每段 start/end time input（锁定的 7 段，顺序固定） */}
              <div className="space-y-2">
                {SEGMENTS.map(s => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-20 text-xs text-body">{s.label}</span>
                    <input type="time" value={(editing.survivalSegments as any)[s.key].start}
                      onChange={e => setEditing({ ...editing, survivalSegments: { ...editing.survivalSegments, [s.key]: { ...(editing.survivalSegments as any)[s.key], start: e.target.value } } })}
                      className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink" />
                    <span className="text-xs text-body">—</span>
                    <input type="time" value={(editing.survivalSegments as any)[s.key].end}
                      onChange={e => setEditing({ ...editing, survivalSegments: { ...editing.survivalSegments, [s.key]: { ...(editing.survivalSegments as any)[s.key], end: e.target.value } } })}
                      className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink" />
                  </div>
                ))}
              </div>
              {/* pull 订阅多选（habits/tasks/threads，从 sources）——此处示意 habits，tasks/threads 同构 */}
              <div className="mt-4">
                <p className="mb-1 text-xs text-body">订阅习惯（多选）</p>
                <div className="flex flex-wrap gap-1">
                  {sources.habits.map((h: any) => (
                    <button key={h.id} type="button"
                      onClick={() => setEditing(prev => prev ? {
                        ...prev,
                        subscribedHabits: (prev.subscribedHabits ?? []).includes(h.id)
                          ? prev.subscribedHabits!.filter(x => x !== h.id)
                          : [...(prev.subscribedHabits ?? []), h.id],
                      } : prev)}
                      className={`rounded px-2 py-0.5 text-xs ${(editing.subscribedHabits ?? []).includes(h.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-body'}`}>
                      {h.title}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>取消</Button>
                <Button size="sm" onClick={handleSave} disabled={!editing.name.trim() || saving}>{saving ? '保存中…' : '保存'}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 测试 + tsc + /browse + Commit**

- Repository 单测（CRUD + audit 写入 + A3 owner-check 拒绝跨用户 subscribed id，参 activity-archetype repository 测试范式）
- `cd frontend && npx vitest run` + `npx tsc --noEmit` 零新增
- `/browse` 打开 `/timebox-templates`：新建模板填 7 段 + 订阅 habit → 保存 → 列表出现 + audit log 写入

```bash
git add src/app/actions/timebox-templates.ts src/app/timebox-templates/page.tsx \
  src/domains/timebox/components/timebox-template-editor.tsx \
  src/lib/db/schema.ts src/lib/db/migrations/0024_timebox_templates.sql \
  src/lib/db/migrations/meta/_journal.json src/lib/db/repositories/timebox-template.ts \
  docs/database-design.md docs/usom-design.md
git commit -m "feat(timebox): [023] A2.8 /timebox-templates 配置页（7 段生存时间 + pull 订阅 + audit + A3 owner-check）"
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

- [ ] **Step 2: ESLint no-restricted-imports（缩窄到 scheduling-handler，§1-A2 锁定）**

`frontend/eslint.config.mjs` 加规则。**files 锁定缩窄到 scheduling-handler**——CNUI 读侧 `cnui/handlers.ts` 直 import tasks/habits repo 是**合法读聚合**（OV#3 新证据：tasks 自己的 cnui/handlers 也直 import repo，无 CNUI 消费方的 context provider），ESLint 不覆盖读侧；仅禁写侧 scheduling-handler 跨域直 import：
```javascript
{
  files: ['src/domains/timebox/handlers/scheduling-handler.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/domains/tasks/*', '@/domains/habits/*'], message: '[023] timebox scheduling-handler 禁止直 import tasks/habits（写侧跨域走 orchestrator）' },
      ],
    }],
  },
}
```
> 文档（constitution §IX 注脚 / usom-design）：标注 CNUI 读侧（`cnui/handlers.ts`）直 import tasks/habits repository 做读聚合是**合法**范式（与 tasks cnui/handlers 一致），不在 ESLint 禁止范围。原 §1-A2「重构读侧走 context provider」**已撤回**。

- [ ] **Step 2b: 单测覆盖矩阵 + 2 回归（§3 densify）**

单元覆盖分布在各 task（实现时随对应 task 落测），汇总矩阵：
- **T2**（`timebox-mutation.test.ts`，7 例）：createTimebox ok/needs_confirm、transition start、updateTimebox 字段直调/无字段读回、deleteTimebox 守卫/planned 派发 ✓
- **T4**（`timebox-drawer.test.tsx`，3 例）：create 标题/禁用态/提交；**新增** edit 模式提交走 updateTimebox（不走 createTimebox）✓
- **T8**（`timebox-template.repository.test.ts`）：CRUD + audit 写入 + **A3 owner-check 拒绝跨用户 subscribed id** ✓
- **T5/T6/T7**（各 CNUI surface 单测）：createTimebox 批量返回 succeeded/failed 明细（C3）、adjustSchedule 拦截取消 running（C3）、logTimebox 三态 ✓

**2 强制回归**（T9 收尾跑）：
1. **manifest lifecycle 路由回归**：现有 createTimebox AI 路径未被 T9 manifest 清理破坏——`npx vitest run src/nexus/orchestrator/__tests__` 全绿（orchestrator 80 基线）。
2. **DayView onEdit 回归**：DayView 加 onEdit 后，现有调用方（`components/views/schedule-view.tsx`）未传 onEdit 仍正常渲染（onEdit 可选）；`npx tsc --noEmit` schedule-view 无新增错误。

- [ ] **Step 2c: perf + 一致性 TODO 登记（§4 / C4 follow-up，P3 不改实现）**

在 `docs/usom-design.md` [023] A2 章节登记以下 TODO（不在本期实现）：
- **perf-1**：`fetchTimeboxSummariesByRange` 单条 archetype 解析改批量（避免 N+1，OV#4 显示后）
- **perf-2**：timeboxes 按日期范围查询 GIN/复合索引评估（`user_id + date range`）
- **perf-3**：CNUI createTimebox 批量落库改单事务批插（当前逐条 service.execute）
- **perf-4**：`createTimeboxMutationService` 每次 new 的 eventRepo/eventBus 实例化开销评估（与 habits 一致，暂不池化）
- **一致性 TODO（C4）**：[021] TaskCreateDrawer 由手写壳迁 Sheet 原语（与 TimeboxDrawer 一致；本期不动，登记 neat/后续）

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

> **plan-eng-review（2026-06-29）后修订**：本节按 review 13 决策回折到 body——T2 重写为 habits 直调范式（OV-T2）、T3 DayView onEdit（C1）、T4 Sheet（C4）、T8 densify、T9 ESLint 缩窄锁定 + 测试 densify + perf/[021] TODO。下方覆盖与一致性核校对应**修订后**状态。

**1. Spec coverage**（design §2.1 八 task → plan task）：
- T1 → design task 1（schema activityArchetypeId FK + 迁移 0023 + USOM 类型 + mapper）✓
- T2（写路径）→ 验收 #1。**已修正（OV-T2）**：状态转换（create/start/end/cancel/log）走 `submitDynamicIntent`（orchestrator 已委托、本就通）；**字段写（updateTimebox）直调 `createTimeboxMutationService().execute()`**（habits updateHabit 范式）；deleteTimebox 加 OV#8 状态守卫；A3 owner-check（archetype 归属）✓
- T3 → design task 2（/schedule page）✓。**已修正（C1）**：DayView 用 `currentDate`（非 `date`）；DayView/TimeboxList/TimeboxCard 三层补 `onEdit`；客户端走 server action（`getTimeboxesByRange` + `getTimeboxById`），**不直 import db repo** ✓
- T4 → design task 3（Drawer Variant C v2）✓。**已修正（C4）**：用 `components/ui/sheet.tsx`，弃手写壳（focus-trap/scroll-lock/Esc/scrim 由 radix 接管）；**needs_confirm 弹窗改 AlertDialog 原语（OV#P2-#5）** ✓
- T5/T6/T7 → design task 4/5/6（3 CNUI surface）✓。C3：批量 submit 返回 succeeded/failed 明细；**T6 _orig* open 注入契约补全（OV#P2-#3）** ✓
- T8 → design task 7（/timebox-templates）✓。**已 densify**：server actions 层 + page + 客户端 editor（7 段锁定 + pull 订阅）；A3 owner-check（subscribed_*）✓
- T9 → design task 8（manifest 清理 + §IX + 基线）✓。ESLint 缩窄锁定（scheduling-handler）；测试矩阵 densify + 2 回归；perf 4 + [021] drawer TODO 登记 ✓
- design §2.2 OUT 全部排除（EnergyState 不扣减 / habitsTemplates 硬删交 A3 / tasks·habits 外键交 A3 / KR junction 交 A4 / 冲突深度校验留后续）✓

**2. Placeholder scan**：
- 无 TBD/TODO（实现级）/"add error handling" 等红旗。
- T8 `fetchSubscriptionSources` 的 tasks/threads 订阅源标注「实现时按实际 Repository 方法对齐」——已给 HabitRepository 范本 + tasks/threads 同构追加，非开放 placeholder（实现时 Read 对齐签名）。

**3. Type consistency**（修订后）：
- `activityArchetypeId?: USOM_ID`（T1）↔ `CreateTimeboxInput`（T2）↔ Drawer state（T4）↔ CreateTimebox surface draft（T5）一致 ✓
- `updateTimebox(timeboxId, fields)` **2 参（无 confirmed）** ↔ Drawer edit 分支、timebox-mutation 测试一致 ✓；**OV#P1-#1**：Drawer 提交前把 `duration` 折成 `endTime = startTime + duration`（USOM 无 duration 字段，避免 service.execute 写入不存在列）✓
- `deleteTimebox(timeboxId)` 无 confirmed + OV#8 守卫 ↔ Drawer 删除按钮、测试一致 ✓
- `createTimebox/transitionTimebox(..., confirmed?)` 走 submitDynamicIntent（IntentSubmissionResult 字段以 intent.ts 实际为准）✓；**CreateTimeboxInput 不接 duration，只接 endTime**（OV#P1-#1 衍生）
- `createTimeboxMutationService().execute({ id, domainId:'timebox', objectType:'timebox', targetId, steps }, userId)` ↔ habits `updateHabit`（intent.ts:937-985）范式一致 ✓
- `getTimeboxById(id): Promise<Timebox|null>`（T3a）↔ ScheduleWorkspace `handleEdit` 一致 ✓
- `DrawerMode = 'create' | 'edit' | 'template-batch'`（T4）↔ ScheduleWorkspace DrawerState（T3）一致 ✓
- `TimeboxTemplateInput`（T8）↔ editor + repo create/update 一致 ✓
- **Timebox.taskIds/habitIds** USOM 类型已声明 ↔ **T1 schema timeboxes 加 task_ids/habit_ids 列**（OV#P1-#2，D7 LinkPicker 数据落库依赖）✓

**4. 风险点（实现时关注；review 已决策覆盖的标 ✓）**：
- ~~T2 orchestrator 分发路径~~ ✓ 已确认 executeIntent 委托、状态转换本就通；字段写直调接线。
- ~~T3 DayView props~~ ✓ 已对齐 currentDate + onEdit（Step 3a/3b/3c）。
- T8 tasks/threads 订阅源 Repository 方法名——实现时 Read TaskRepository/Thread 对齐（habits 已给范本）。
- ~~ESLint 误伤 CNUI 读聚合~~ ✓ 已缩窄锁定到 scheduling-handler。
- 迁移 journal idx（0023/0024，已知 snapshot 债）——实现时 tail 确认实际末尾 idx。
- TimeboxSummary 加 `archetypeName` + `timeboxToSummary` 解析（OV#4）——实现时确认 mapper 入口（`fetchTimeboxSummariesByRange` → `timeboxToSummary`）。
- **Design Patch `bg-muted→bg-surface-card` 未在 body 代码全替换**（energy-cost-accordion line 860 / log-timebox line 1657 / timebox-template-editor line 2013、2058）——实现时按 patch 全局替换。
- **T9 manifest view_routes `createTimebox` 是死引用**（createTimebox 走 CNUI 不走页面跳转）——实现时从 view_routes 移除，仅留 intent_triggers。

---

## Design Review Patch（plan-design-review, 2026-06-29）

> 设计评审权威覆盖层（initial **5/10 → 8.5/10**）。7 决策锁定 + 系统性 spec 合规修复 + CNUI/EnergyCost/关联规格补全。**与 body 代码冲突处以本节为准**。校准源：`docs/UI-DESIGN-SPEC.md`（应用权威）+ `DESIGN.md`（品牌，coral 稀缺）。Outside voice（Claude subagent，codex 超时未跑，[single-model]）抓到 8 项漏点，已并入。7 维：IA 4→8 · 状态 4→9 · 旅程 5→8 · slop 7→8 · 设计系统 8→9 · 响应/a11y 3→8 · 决策 7 resolved/0 deferred。

### 锁定决策（D1–D7）
- **D1 卡片密度**：桌面维持紧凑；移动端（<640）TimeboxCard 按钮/输入放大到 **≥44px**（C-05）。紧凑态按钮 `h-6` 仅桌面，移动用 `min-h-11`。
- **D2 Drawer 移动端**：`<640` Sheet **`side="bottom"`**（bottom sheet），桌面 `side="right" w-[520px]`（条件 side，Tailwind 两态渲染或 `useMediaQuery`）。
- **D3 能量条配色**：EnergyCostAccordion 进度条填充弃 `bg-primary`(coral)，改中性/语义——统一 `bg-accent-teal` 或分维语义。**底色 `bg-muted`→`bg-surface-card`**（muted 是文字色非背景令牌，§1.7）。
- **D4 空态全套 §6.6**：4 处空态（TimeboxList / ArchetypePicker / TimeboxTemplateEditor / 3 CNUI surface）补完整结构：`lucide` 图标 48px `text-muted-soft` + 标题(subtitle,ink) + 描述(body,muted) + [主操作](primary)。
- **D5 CNUI 批量部分失败（C3）UI**：createTimebox 批量提交后**逐项标失败**——失败项卡片右上角 `text-error` 徽章 + `border-error/30`；页眉「{succeeded}/{total} 已创建」；`isDone` 仅 `failed.length===0` 触发；失败项可点重试。
- **D6 EnergyCost 校准策略**：**Drawer 全程只读**（EnergyCostAccordion 在 Drawer 强制 `readOnly`，移除 `onChange` 接线）；实际消耗 **log 时回写 `executionRecord`**（T7 加只读能量展示 + 实际值记录）；archetype 校准走 `/config/activity-archetypes`（隔离，不污染所有未来 timebox）。
- **D7 关联 task/habit**：T4 Drawer 补 task/habit 多选关联器（字段序「关联」落地）——`ArchetypePicker` 后加 `LinkPicker`（复用 habits/tasks 激活列表多选，参 T8 订阅源），填 `CreateTimeboxInput.taskIds/habitIds`（junction 表已存在）。KR 关联属 A4 OUT，不做。

### 系统性 spec 合规修复（token/尺寸/状态）
- **页面 H1 字号**：4 页面 `text-base font-display` → **`text-2xl font-display`**（24px，§2.2 H1）。勿用 14px 衬线。
- **输入框高度统一**：现 h-6/h-7/h-8 五种 → 统一 **`h-9`（36px，§6.2 default）**；内联小输入（能量数字）用 `h-8`（32px sm）。
- **加载态 Spinner**：T4 `{submitting ? '保存中…'}` + T8 `{saving ? '保存中…'}` → **`<Loader2 className="size-4 animate-spin" />` + 文字**，按钮 `disabled`（§6.7 禁纯文本加载）。
- **`bg-muted` 全局替换** → `bg-surface-card` / `bg-surface-soft`（§1.7，C-01）。
- **`text-body/70` → `text-muted`**（无 arbitrary opacity 变体）。
- **删除前置确认**：T4 删除按钮 → **AlertDialog**（取消左+确认右 destructive，C-04），不裸调 deleteTimebox。
- **onEdit 键盘可达**：标题点击进编辑从 `<span>`/`<h3>` 改 **`<button>`**（C-07）。
- **prefers-reduced-motion**：Sheet/accordion/进度条声明 `motion-safe:`/`motion-reduce:` 降级（C-04）。
- **移动优先类名**：`max-md:` → `md:` 写法（§十三）。

### 待补入 body 的设计文档（实现时随对应 task 写入）
- **IA 层级图**（T3）：ASCII 标 `/schedule` 三层——① 页头(标题+日期+今日完成率) ② DayView 三栏(时间轴为主+running 高亮+当前时间游标) ③ 卡片操作。**明确 DayView 30/40/30 三栏语义** + 与 T8「7 段生存时间」映射（7 段=配置层 / DayView=展示层）。
- **交互状态表**（T3/T5/T6/T7/T8）：5 状态(loading/empty/error/success/partial) × 5 界面矩阵，每格「用户看到什么」。
- **生命周期 storyboard**（T3）：planned(承诺)→running(专注,页面级 sticky 计时+overtime 渐变警示)→ended→logged(成就,success-soft 收尾+能量回写)→cancelled。
- **running 页面级指示**（T3）：顶部 sticky bar 显示当前 running 项+计时+end 按钮（复用现有 `startedAt`/`overtimeAt`，勿做死字段）。

### NOT in scope（设计层）
- 暗色模式深度验证（C-06，令牌已支持，实现时验）。
- KR 关联（A4 OUT，D7 仅 task/habit）。
- archetype 校准 UI（走 /config，D6）。

### What already exists（复用）
- `components/ui/sheet.tsx`（radix，含 `side="bottom"`）、`button`(destructive)、`Loader2`(lucide)、AlertDialog（若无则参 cycle-confirm 新建）。
- 现有 `TimeboxCard` running 计时器+overtime（T3 页面级指示复用其逻辑）。
- §6.6 EmptyState 结构、§6.7 加载、§十四 C-01~C-07（校准源）。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | codex 超时，Claude subagent 代跑 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAN (rerun) | 13 issues locked (run 1) → body 修订吸收；run 2 outside voice 抓到 2 P1 + 3 P2 + 3 P3，全部 folded（OV#P1-#1/#2 body 修复 + OV#P2-#3/#5/T9 manifest todo 登记） |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAN | score 5/10 → 8.5/10, 7 decisions (D1-D7), 0 unresolved; Design Review Patch 覆盖层已写入（body 冲突处以 patch 为准，实现时随 task 落地） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Outside voice（Claude subagent，codex 超时回退）**两轮**抓到评审漏网的硬伤。**Round 1 (run 1)**：(1) T2 字段写路径全断——`executeFieldStateWrite` tasks-only（intent.ts:323）、manifest 无 `updateTimebox`；(2) `executeTransition` 已委托 `executeIntent`、`getRepo` 支持 timebox，**4/5 action 状态转换本就已通**。**Round 2 (run 2)**：(1) OV#P1-#1 T2 updateTimebox `duration` 写入不存在列；(2) OV#P1-#2 USOM `Timebox.taskIds/habitIds` 声明但 DB 列缺。战略层 #3(A2 provider)/#4(archetype 死字段)/#9(更简范围) 经用户拍板：A2 撤回归窄 ESLint、archetype 保留+加最小消费方、范围维持全 9 但修正问题陈述。
- **VERDICT:** **ENG review 决策全部锁定（13+8 = 21 issues，run 1 ISSUES_OPEN → run 2 CLEAN）** + **DESIGN review 决策全部锁定（7 decisions / 0 unresolved / score 5→8.5）**。**plan body 已按 ENG Implementation Tasks T1-T12 + outside-voice round 2 全部回折修订完成**（writing-plans 修订轮：T2 habits 直调 / T3 DayView onEdit / T4 Sheet + AlertDialog / T8 densify / T9 ESLint 锁定+测试 densify / T5 C3 / T6 直调+_orig* / A3 owner-check / OV#4 / **OV#P1-#1 duration→endTime 派生 + T1 schema task_ids/habit_ids** / **OV#P2-#5 needs_confirm AlertDialog**）。**Design Review Patch 覆盖层已写入**（D1-D7 + 系统性 token/尺寸/状态修复，body 冲突处以 patch 为准）。**ENG + DESIGN CLEARED — 已 ready to implement**。

### 关键决策（本 review 锁定）
- **Step 0**：全 9 task 单 plan 单分支（用户锁）。
- **§1-A1**：T2 audit-gate（已被 OV-T2 重写决策吸收）。
- **§1-A2**：**撤回** provider 重构 → ESLint 缩窄 `scheduling-handler` + 文档标注 CNUI 读侧直 import 合法（OV#3 新证据：tasks 自己也直 import）。
- **§1-A3**：repo owner-check 现在加（`activityArchetypeId` + `subscribed_*`）。
- **§2-C1**：DayView 加 `onEdit` + T3 对齐 `currentDate`。
- **§2-C2**：锁 7 段生存时间；T8 densify 到完整 bite-sized。
- **§2-C3**：CNUI 批量 submit 返回 succeeded/failed 明细（不回滚）。
- **§2-C4**：T4 改用 `components/ui/sheet.tsx`（参 `cycle-create-drawer.tsx`，非手写）；[021] 迁移列 TODO。
- **§3**：densify ~20 测试 gap + 2 回归（manifest 路由 / DayView onEdit）。
- **§4**：4 perf P3 全列 TODO。
- **OV-T2**：T2 重写为 habits 直调范式（server action 内直接 `service.execute()` 写字段；状态转换仍走 `submitDynamicIntent`）。
- **OV-#4**：archetype 保留 + 加最小消费方（timebox-card 显示 archetype 名）。
- **OV-#8**：deleteTimebox 状态守卫（cancel 仅 planned/running 合法）。
- **Design-D1**：卡片桌面密集 + 移动端按钮/输入 ≥44px（C-05）。
- **Design-D2**：Drawer `<640` 改 Sheet `side="bottom"`，桌面 `side="right" w-520`。
- **Design-D3**：EnergyCost 进度条弃 coral，改中性/语义色；`bg-muted`→`bg-surface-card`。
- **Design-D4**：4 处空态全套 §6.6（图标48px+标题+描述+操作）。
- **Design-D5**：CNUI 批量部分失败逐项标失败（error 徽章+边框+页眉计数+isDone 仅全成功）。
- **Design-D6**：EnergyCost Drawer 只读；实际消耗 log 回写 executionRecord；archetype 校准走 /config。
- **Design-D7**：Drawer 加 task/habit 关联器（LinkPicker）；KR 关联 A4 OUT。
- **Design-系统性**：H1 `text-2xl font-display`、输入框统一 h-9、加载 Loader2 Spinner、删除 AlertDialog 确认、onEdit→button、prefers-reduced-motion、移动优先类名。
- **OV#P1-#1**（outside voice run 2）：T2 updateTimebox 不接 `duration` 字段（USOM Timebox 无 duration），Drawer 提交前客户端把 `duration` 折成 `endTime = startTime + duration*60_000`。
- **OV#P1-#2**（outside voice run 2）：T1 schema `timeboxes` 表加 `task_ids uuid[]` / `habit_ids uuid[]` 列（USOM 类型已声明 taskIds/habitIds 但 DB 列缺；D7 LinkPicker 数据落库依赖）+ mapper 双向映射。
- **OV#P2-#3**（outside voice run 2）：T6 adjustRemainingSchedule handler `open` 路径必须把每条原始值注入 `_origTitle/_origStart/_origEnd`，surface `AdjustItem` 接口同步加字段，submit 比对差异避免无改动触发 updateTimebox。
- **OV#P2-#5**（outside voice run 2）：T4 needs_confirm 二次确认弹窗从手写 `fixed inset-0` modal 换为 `AlertDialog` 原语（C4 一致性）。
- **OV#P3-#6**（outside voice run 2）：T9 manifest `view_routes.createTimebox` 路由到 `/schedule` 是死引用——createTimebox 入口是 CNUI，view_routes 仅列真页面跳转；实现时从 view_routes 移除，仅留 intent_triggers。
- **OV#P3-#7**（outside voice run 2）：T8 `fetchSubscriptionSources` 空数组入 `Promise.all` 仍会调——A3 owner-check 契约明示所有订阅源都查（哪怕空）。

### NOT in scope（沿用 design §2.2 + 本 review 新增 TODO）
- EnergyState 扣减/applyEvent/dead_letter（D1，OQ-6）。
- habitsTemplates 页 + `habit_templates` 硬删 → A3。
- tasks/habits 加 `activityArchetypeId` + 删 `EnergyProfile` enum → A3。
- Timebox↔KR junction → A4。
- 时间盒冲突深度校验（仅判重叠提示，不禁止）。
- 新增 TODO：perf 4 项（§4）、[021] drawer 迁 Sheet（C4）、A2 原 provider 重构（撤回）。

### What already exists（复用，未造重复轮子）
- 状态转换通路：`executePipeline→executeIntent→getRepo(timebox)`（4/5 action 已通，OV#9）。
- `createDomainMutationServiceFactory` + `createTimeboxGenericRepo` + habits 直调范式（intent.ts:956）。
- `components/ui/sheet.tsx` + `cycle-create-drawer.tsx`（Sheet 抽屉范本）、`dialog.tsx`。
- `ActivityArchetypeRepository` + `_logAudit` + `archetype-table.tsx`（T8 复刻范本）。
- `timebox/components/*`（DayView 等）、tasks completeTask [025] 判别联合范式。

### Failure modes（critical gaps = 0；均已决策覆盖）
- 字段写路径断 → T2 重写覆盖（原「无测试 + 抛错非静默」不计 critical gap）。
- deleteTimebox 对 ended/logged 崩 → OV#8 守卫覆盖。
- updateTimebox 死调用 → T2 重写移除该调用覆盖。
- 批量部分失败静默 → C3 返回明细覆盖。
- updateTimebox duration 写入不存在列（run 2 outside voice）→ OV#P1-#1 客户端派生 endTime 覆盖。
- USOM taskIds/habitIds vs DB schema 分裂（run 2 outside voice）→ OV#P1-#2 T1 加 task_ids/habit_ids 列覆盖。
- T6 _orig* 缺失导致 submit 误触发 update（run 2 outside voice）→ OV#P2-#3 open 注入 + AdjustItem 接口补字段覆盖。
- T4 needs_confirm 手写 modal 违 C4（run 2 outside voice）→ OV#P2-#5 换 AlertDialog 原语覆盖。
- T9 view_routes.createTimebox 死引用（run 2 outside voice）→ OV#P3-#6 实现时从 view_routes 移除覆盖。

### Worktree 并行策略
- **Lane A**（主线，共享 timebox 域）：T1 → T2(重写) → T3 → T4(Sheet) → T5 → T6 → T7，顺序。
- **Lane B**（独立）：T8 templates（新表+页+Repo，与主线零耦合）。
- 启动 A+B 并行 worktree；合并后做 T9（manifest + ESLint 触共享 config，最后）。
- 冲突点：T9 manifest + ESLint → 两 lane 合并后再做。

### Implementation Tasks
完整 12 条见 `~/.gstack/projects/walker2002-lifeware/tasks-eng-review-20260629-112816.jsonl`。

- [ ] **T1 (P1, human: ~3h / CC: ~30min)** — timebox/T2 — 重写 T2：mutation service + server action 直调字段写（habits 范式 intent.ts:956）
- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — timebox-card — 显示 archetype 名（最小消费方，消除死字段）
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — DayView/T3 — 加 onEdit + currentDate 对齐
- [ ] **T4 (P1, human: ~30min / CC: ~5min)** — timebox/delete — deleteTimebox 状态守卫（cancel 仅 planned/running）
- [ ] **T5 (P1, human: ~2h / CC: ~15min)** — TimeboxDrawer — 改用 Sheet 原语（弃手写壳）
- [ ] **T6 (P1, human: ~2h / CC: ~20min)** — repos — A3 owner-check（activityArchetypeId + subscribed_*）
- [ ] **T7 (P2, human: ~1h / CC: ~10min)** — ESLint/manifest — A2 缩窄 scheduling-handler + 文档
- [ ] **T8 (P2, human: ~4h / CC: ~30min)** — T8 templates — densify + 锁 7 段
- [ ] **T9 (P2, human: ~6h / CC: ~30min)** — tests — densify ~20 gap + 2 回归
- [ ] **T10 (P2, human: ~1h / CC: ~10min)** — CNUI batch — 返回 succeeded/failed 明细
- [ ] **T11 (P3, human: ~3h / CC: ~25min)** — perf — 4 项 TODO（缓存/GIN/批量/实例化）
- [ ] **T12 (P3, human: ~2h / CC: ~15min)** — [021] drawer — 迁 Sheet（一致性 TODO）

### Run-2 Implementation Tasks（outside voice round 2 folded）
- [ ] **T13 (P1, human: ~30min / CC: ~5min)** — Drawer/T2 — **duration→endTime 派生 + CreateTimeboxInput 改 endTime-only**（OV#P1-#1，USOM 无 duration 字段）
- [ ] **T14 (P1, human: ~1h / CC: ~10min)** — T1 schema/mapper — **timeboxes 加 task_ids/habit_ids uuid[] 列 + mapper 双向映射**（OV#P1-#2，D7 LinkPicker 数据落库依赖）
- [ ] **T15 (P2, human: ~30min / CC: ~5min)** — T6 adjustRemainingSchedule — **handler open 注入 _orig* + surface AdjustItem 补字段**（OV#P2-#3）
- [ ] **T16 (P2, human: ~30min / CC: ~5min)** — T4 Drawer — **needs_confirm 改 AlertDialog 原语**（OV#P2-#5，弃手写 modal）
- [ ] **T17 (P3, human: ~10min / CC: ~2min)** — T9 manifest — **view_routes.createTimebox 移除**（OV#P3-#6，CNUI-only action 不绑 view_route）
- [ ] **T18 (P3, human: ~30min / CC: ~5min)** — body code 同步 — **Design Patch `bg-muted→bg-surface-card` 全局替换 4 处**（energy-cost-accordion/log-timebox/timebox-template-editor）

NO UNRESOLVED DECISIONS
