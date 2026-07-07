# [023.12] 三域生命周期语义重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 timebox / okr cycle / appointment 三个域的生命周期收敛到"只跟踪用户行为"，时间态（running/overtime/in_progress/expired）改为读时派生显示，并调整三页 UI 操作按钮匹配新语义。

**Architecture:** 单分支三域同 ship。lifecycle SSOT 在 manifest.yaml（`lifecycle-configs.ts` 动态读取）。status 列是 plain TEXT（非 PG enum），迁移只需 TRUNCATE + DROP 废弃时间戳列 + 改 schema.ts `enum:[]` 数组。新增共享派生工具 `derive-display-status.ts` 服务 timebox+appointment UI。OKR cycle 涉及 SM action rename（startCycle/planCycle→approve、endCycle→finish、新增 revert）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle 0.45 / PostgreSQL / vitest / shadcn-ui。

## Global Constraints

- 所有注释/文档/commit 使用**简体中文**；每个改动 TS/JS 文件保持 `/** @file ... @brief ... */` 头注释同步。
- **manifest.yaml 是 lifecycle SSOT**；改完跑 `validate:manifest` 必须 0 errors。
- **Repository Pattern + 多租户**：状态写走 SM → repository，不绕过；`userId` 透传。
- **CNUI surface 四路注册**（[[project-cnui-surface-dual-registration]]）：server surfaceHandlers + client register-client-surfaces + manifest K-block + intent_trigger。
- **手写迁移**（[[project-drizzle-migrations-handwritten]]）：`db:generate/migrate` 跑不通，迁移手写 SQL + 登记 journal；DB = `lifeware_dev@localhost:5432`（dev，数据可弃）。
- **vitest 必须在 `frontend/` cwd 跑**（`@/` 映射，repo root 跑会假失败，[[feedback_vitest-pitfalls]]）；vitest 不做类型检查，配 tsc 双验证。
- **CSS 变量令牌**（`bg-canvas`/`text-ink`/`text-body` 等），禁 Tailwind 默认颜色类（[[ui-design-constraints]]）。
- **buildActionMap camelCase 拆解要求单数 objectType**（timebox/appointment/cycle）——intent action 名必须单数（`revertTimebox` ✓，`revertTimeboxes` ✗）。
- **Tier 2 文档同步**（[[feedback_tier2-sync]]）：USOM/DB 变更先更新 `docs/` 再改代码。

## File Structure

**新建文件**
- `frontend/src/lib/db/migrations/0034_023_12_lifecycle_simplify.sql` — TRUNCATE + DROP 废弃列
- `frontend/src/lib/db/migrations/0034_023_12_lifecycle_simplify.down.sql` — 反向重建列（dev 回滚）
- `frontend/src/domains/timebox/status/derive-display-status.ts` — 共享派生显示状态纯函数（timebox+appointment）
- `frontend/src/domains/timebox/status/__tests__/derive-display-status.test.ts` — 派生函数测试

**修改文件（按 task 分组见下）**
- schema/迁移：`lib/db/schema.ts`、`migrations/meta/_journal.json`
- USOM：`usom/types/primitives.ts`、`usom/types/objects.ts`
- manifest：`domains/timebox/manifest.yaml`、`domains/okrs/manifest.yaml`
- SM/lifecycle：`nexus/orchestrator/lifecycle-configs.ts`、`domains/timebox/transitions.ts`
- 仓储：`domains/timebox/repository/*`（timebox + appointment）、`domains/okrs/repository/cycle.ts`
- guard：`domains/okrs/guard.ts`
- rules：`nexus/core/rule-engine/rules/timebox-overlap.ts`
- reconcile：`domains/timebox/status/reconcile-appointment.ts`、删除 `app/actions/reconcile-appointments.ts`、`app/appointments/page.tsx`
- actions：`app/actions/timebox.ts`、`app/actions/okr.ts`、`app/actions/intent.ts`
- CNUI：`domains/timebox/cnui/handlers.ts`、surfaces（LogTimebox/EditTimeboxes/Create/Edit/DeleteAppointment）
- UI：`timebox-card.tsx`、`timebox-list.tsx`、`timeboxes-workspace.tsx`、`appointment-workspace.tsx`、`appointment-locked-card.tsx`、`cycle-menu.tsx`、`okr-directory.tsx`、`objective-card.tsx`、`okr-form.tsx`
- docs：`docs/usom-design.md`、`docs/database-design.md`、`CHANGELOG.md`、`manifest.md`

---

## Task 1: DB schema enum 收敛 + 迁移 0034（TRUNCATE + DROP 列）

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`（timeboxes/cycles/appointments 三 status enum 数组；timeboxes drop startedAt/endedAt/overtimeAt 列定义；appointments drop inProgressAt/expiredAt）
- Create: `frontend/src/lib/db/migrations/0034_023_12_lifecycle_simplify.sql`
- Create: `frontend/src/lib/db/migrations/0034_023_12_lifecycle_simplify.down.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`（追加 idx=34）

**Interfaces:**
- Produces: 三表 status TEXT 列合法值集合（app 层 enum 约束）收敛；废弃时间戳列从 schema 移除。后续 task 的 USOM 类型 / SM / UI 都依赖这个新值集合。

- [ ] **Step 1: 改 schema.ts 三处 status enum 数组**

`lib/db/schema.ts` 找到 timeboxes 表（约 L357）：
```ts
// 改前
status: text('status', { enum: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'] }).notNull(),
// 改后
status: text('status', { enum: ['planned', 'logged', 'cancelled'] }).notNull(),
```
删除同表 `startedAt` / `endedAt` / `overtimeAt` 三列定义（约 L258-269 区段的 field_metadata 对应列；schema.ts 里 timeboxes 表的三个 `timestamp(...)` 列）。

cycles 表（约 L78）：
```ts
// 改前
status: text('status', { enum: ['draft', 'not_started', 'in_progress', 'ended', 'reviewed'] }).notNull(),
// 改后
status: text('status', { enum: ['draft', 'approved', 'finished', 'reviewed'] }).notNull(),
```

appointments 表（约 L399）：
```ts
// 改前
status: text('status', { enum: ['scheduled', 'in_progress', 'expired', 'cancelled', 'completed'] }).notNull().default('scheduled'),
// 改后
status: text('status', { enum: ['scheduled', 'cancelled', 'completed'] }).notNull().default('scheduled'),
```
删除同表 `inProgressAt` / `expiredAt` 两列定义。

- [ ] **Step 2: 写迁移 SQL 0034（TRUNCATE + DROP COLUMN，无类型 DDL）**

`migrations/0034_023_12_lifecycle_simplify.sql`：
```sql
-- [023.12] 三域生命周期简化
-- status 列是 plain TEXT（drizzle text+enum 仅 app 层 union），无 PG enum type 要重建。
-- 数据可弃（dev 测试数据 + prod 未录入）→ TRUNCATE 清旧值，免行迁移。

-- timeboxes: drop 3 个时间戳列（status 合法值收敛在 app 层 schema.ts enum[]）
TRUNCATE timeboxes CASCADE;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS started_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS ended_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS overtime_at;

-- cycles: 仅 TRUNCATE 清旧 status 值（无废弃列）
TRUNCATE cycles CASCADE;

-- appointments: drop 2 个时间戳列
TRUNCATE appointments CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS in_progress_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS expired_at;
```

- [ ] **Step 3: 写 down 迁移（dev 回滚兜底，prod 不需要）**

`migrations/0034_023_12_lifecycle_simplify.down.sql`：
```sql
-- 反向重建废弃列（status 旧值集合不恢复——app 层 enum[] 已收敛）
ALTER TABLE timeboxes ADD COLUMN started_at timestamp with time zone;
ALTER TABLE timeboxes ADD COLUMN ended_at timestamp with time zone;
ALTER TABLE timeboxes ADD COLUMN overtime_at timestamp with time zone;
ALTER TABLE appointments ADD COLUMN in_progress_at timestamp with time zone;
ALTER TABLE appointments ADD COLUMN expired_at timestamp with time zone;
```

- [ ] **Step 4: 登记 journal idx=34**

`migrations/meta/_journal.json` 追加条目（参照既有 idx=33 格式）：
```json
{
  "idx": 34,
  "version": "6",
  "when": <保留既有时间戳格式风格>,
  "tag": "023_12_lifecycle_simplify",
  "breakpoints": true
}
```

- [ ] **Step 5: 跑迁移验证**

Run（dev DB，数据可弃）:
```bash
cd frontend
psql "$DATABASE_URL" -f lib/db/migrations/0034_023_12_lifecycle_simplify.sql
```
Expected: 三个 TRUNCATE + 五个 DROP COLUMN 成功，无错误。

验证列已删 + 表空:
```bash
psql "$DATABASE_URL" -c "\d timeboxes" | grep -E "started_at|ended_at|overtime_at" || echo "OK: 三列已删"
psql "$DATABASE_URL" -c "\d appointments" | grep -E "in_progress_at|expired_at" || echo "OK: 两列已删"
psql "$DATABASE_URL" -c "SELECT count(*) FROM timeboxes; SELECT count(*) FROM cycles; SELECT count(*) FROM appointments;"
```
Expected: 三列/两列 grep 无输出（已删）；三表 count = 0。

- [ ] **Step 6: tsc 零新增**

Run: `cd frontend && npx tsc --noEmit`
Expected: schema.ts 列删除会触发引用这些列的代码报类型错（USOM/repo/UI）——**这些错会在后续 task 修；本 task 仅登记 schema + 迁移落盘**。记录基线错误数（后续 task 逐个清零）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/0034_*.sql frontend/src/lib/db/migrations/meta/_journal.json
git commit -m "feat(023.12): T1 schema 三域 status enum 收敛 + 迁移 0034（TRUNCATE+DROP列）"
```

---

## Task 2: USOM 类型收敛（primitives + objects）

**Files:**
- Modify: `frontend/src/usom/types/primitives.ts`（TimeboxStatus / CycleStatus / AppointmentStatus union）
- Modify: `frontend/src/usom/types/objects.ts`（Timebox / Cycle / Appointment 接口字段）

**Interfaces:**
- Consumes: Task 1 的新 enum 值集合。
- Produces: `TimeboxStatus = 'planned'|'logged'|'cancelled'`、`CycleStatus = 'draft'|'approved'|'finished'|'reviewed'`、`AppointmentStatus = 'scheduled'|'cancelled'|'completed'`；废弃时间戳字段从接口移除。后续所有 task（SM/UI/repo）依赖这些类型。

- [ ] **Step 1: 改 primitives.ts 三 union**

```ts
export type TimeboxStatus = 'planned' | 'logged' | 'cancelled';
export type CycleStatus = 'draft' | 'approved' | 'finished' | 'reviewed';
export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed';
```
（删 running/overtime/ended、not_started/in_progress、in_progress/expired）

- [ ] **Step 2: 改 objects.ts —— 移除废弃字段**

`Timebox` 接口：删 `startedAt?` / `endedAt?` / `overtimeAt?` 三字段。
`Appointment` 接口：删 `inProgressAt?` / `expiredAt?` 两字段。
`Cycle` 接口：保留 `startedAt`（语义改为 approved 时间戳）/`endedAt`（finished 时间戳）/`reviewedAt`——字段名不变，意义随 status rename（cycle.ts 仓储在 Task 6 处理映射）。

- [ ] **Step 3: tsc 看影响面**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 比 Task 1 基线多/少的差值——记录新基线（被删类型/字段的引用点会在 SM/repo/UI 报错，后续 task 清）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/usom/types/primitives.ts frontend/src/usom/types/objects.ts
git commit -m "feat(023.12): T2 USOM 类型收敛（TimeboxStatus/CycleStatus/AppointmentStatus）"
```

---

## Task 3: 派生显示状态工具（TDD 纯函数）

**Files:**
- Create: `frontend/src/domains/timebox/status/derive-display-status.ts`
- Test: `frontend/src/domains/timebox/status/__tests__/derive-display-status.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `TimeboxStatus` / `AppointmentStatus`。
- Produces:
  ```ts
  export type TimeboxDisplayStatus = 'running' | 'overtime' | null;
  export function deriveTimeboxDisplayStatus(
    status: TimeboxStatus, startTime: string, endTime: string, now: Date
  ): TimeboxDisplayStatus;
  export type AppointmentDisplayStatus = 'in_progress' | 'expired' | null;
  export function deriveAppointmentDisplayStatus(
    status: AppointmentStatus, startTime: string, now: Date
  ): AppointmentDisplayStatus;
  ```
  后续 UI task（8/10）消费这两个函数渲染 badge。

- [ ] **Step 1: 写失败测试**

`__tests__/derive-display-status.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { deriveTimeboxDisplayStatus, deriveAppointmentDisplayStatus } from '../derive-display-status';

describe('deriveTimeboxDisplayStatus', () => {
  const start = '2026-07-06T09:00:00+08:00';
  const end = '2026-07-06T10:00:00+08:00';

  it('planned 且 now 在区间内 → running', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBe('running');
  });
  it('planned 且 now > endTime → overtime', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T10:30:00+08:00'))).toBe('overtime');
  });
  it('planned 且 now < startTime → null（未开始）', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
  it('logged → null（终态不派生）', () => {
    expect(deriveTimeboxDisplayStatus('logged', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBeNull();
  });
  it('cancelled → null', () => {
    expect(deriveTimeboxDisplayStatus('cancelled', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBeNull();
  });
});

describe('deriveAppointmentDisplayStatus', () => {
  // 日历日比较（与 reconcile-appointment.ts localDayKey 同语义）
  it('scheduled 且 now 与 startTime 同日 → in_progress', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBe('in_progress');
  });
  it('scheduled 且 now 日历日 > startTime → expired', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-05T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBe('expired');
  });
  it('scheduled 且 now 日历日 < startTime → null（未来）', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-07T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
  it('cancelled/completed → null', () => {
    expect(deriveAppointmentDisplayStatus('cancelled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
    expect(deriveAppointmentDisplayStatus('completed', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/status/__tests__/derive-display-status.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

`derive-display-status.ts`：
```ts
/**
 * @file derive-display-status
 * @brief timebox/appointment 读时派生显示状态（[023.12] 时间态不持久化）
 *
 * running/overtime/in_progress/expired 都不写 DB——UI 读时用 now vs 时间区间/日历日算。
 * 纯函数，不 IO。日历日算法与原 reconcile-appointment.ts localDayKey 同语义。
 */
import type { TimeboxStatus, AppointmentStatus } from '@/usom/types/primitives';

export type TimeboxDisplayStatus = 'running' | 'overtime' | null;

export function deriveTimeboxDisplayStatus(
  status: TimeboxStatus,
  startTime: string,
  endTime: string,
  now: Date,
): TimeboxDisplayStatus {
  if (status !== 'planned') return null;
  const nowMs = now.getTime();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (nowMs > endMs) return 'overtime';
  if (nowMs >= startMs) return 'running';
  return null;
}

export type AppointmentDisplayStatus = 'in_progress' | 'expired' | null;

function localDayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function deriveAppointmentDisplayStatus(
  status: AppointmentStatus,
  startTime: string,
  now: Date,
): AppointmentDisplayStatus {
  if (status !== 'scheduled') return null;
  const nowDay = localDayKey(now);
  const startDay = localDayKey(new Date(startTime));
  if (nowDay > startDay) return 'expired';
  if (nowDay === startDay) return 'in_progress';
  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/status/__tests__/derive-display-status.test.ts`
Expected: PASS（9 test 全过）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/status/derive-display-status.ts frontend/src/domains/timebox/status/__tests__/derive-display-status.test.ts
git commit -m "feat(023.12): T3 派生显示状态工具（timebox+appointment 读时派生纯函数）"
```

---

## Task 4: timebox manifest + transitions + lifecycle-configs + timebox 仓储

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（block B timebox lifecycle、block D list_actions、block F subscribed_events、block C field_metadata）
- Modify: `frontend/src/domains/timebox/transitions.ts`
- Modify: `frontend/src/nexus/orchestrator/lifecycle-configs.ts`（同步 `@deprecated timeboxLifecycle` 常量）
- Modify: `frontend/src/domains/timebox/repository/index.ts` 及 timebox 仓储（移除 start/end/overtime，加 revert）

**Interfaces:**
- Consumes: Task 2 的新 `TimeboxStatus`。
- Produces: timebox SM 新 transition 集合（create/log/cancel/revert）；`revertTimebox(id)` server action 入口（Task 7 wire 到 UI）。后续 UI task 用这些 transition。

- [ ] **Step 1: 改 manifest.yaml block B（timebox lifecycle）**

替换 `timebox:` lifecycle 块为：
```yaml
  timebox:
    states: [planned, logged, cancelled]
    initial_state: planned
    transitions:
      - { from: null,      to: planned,   trigger: intent, action: create, event_type: TimeboxCreated }
      - { from: planned,   to: logged,    trigger: intent, action: log,    event_type: TimeboxLogged }
      - { from: planned,   to: cancelled, trigger: intent, action: cancel, event_type: TimeboxCancelled }
      - { from: logged,    to: planned,   trigger: intent, action: revert, event_type: TimeboxReverted }
      - { from: cancelled, to: planned,   trigger: intent, action: revert, event_type: TimeboxReverted }
    terminal_states: []
```

- [ ] **Step 2: 改 manifest block D（list_actions）**

```yaml
list_actions:
  - action: log
    label: 打卡
    confirm_required: false
  - action: cancel
    label: 取消
    confirm_required: true
  - action: revert
    label: 回退
    confirm_required: true
  - action: delete
    label: 删除
    confirm_required: true
```
（删 start / end）

- [ ] **Step 3: 改 manifest block F（subscribed_events）**

```yaml
subscribed_events:
  - TimeboxCreated
  - TimeboxLogged
  - TimeboxCancelled
  - TimeboxReverted
  - ExecutionLogged
```
（删 TimeboxStarted / TimeboxOvertime / TimeboxEnded；加 TimeboxReverted）

- [ ] **Step 4: 改 manifest block C field_metadata（timebox）**

删 `startedAt` / `endedAt` / `overtimeAt` 三条 field_metadata（保留 title/startTime/duration/endTime/taskIds/habitIds/executionRecord）。

- [ ] **Step 5: 改 transitions.ts**

`domains/timebox/transitions.ts` 同步成新 transition 集合（与 manifest block B 一致；移除 start/end/overtime 三 transition，加两条 revert）。具体内容与 manifest 一一对应。

- [ ] **Step 6: 同步 lifecycle-configs.ts `@deprecated timeboxLifecycle` 常量**

`nexus/orchestrator/lifecycle-configs.ts` L196-209 的 `timeboxLifecycle` 常量同步成新 states/transitions/terminal_states（与 manifest 一致；注释保留 `@deprecated`）。

- [ ] **Step 7: timebox 仓储移除 start/end/overtime + 加 revert**

`domains/timebox/repository/index.ts`（及 timebox repo 文件）：移除 startTransition/endTransition/overtime 对应方法；新增 `revertTransition`（logged|cancelled → planned，盖 updatedAt）。

- [ ] **Step 8: 加 revertTimebox server action（app/actions/timebox.ts）**

新增：
```ts
'use server'
// 走 submitDynamicIntent('timebox', 'revertTimebox', { id }) → SM revert transition
export async function revertTimebox(timeboxId: string) { ... }
```
（参照同文件 `logTimebox` / `cancelTimebox` 范式；intent action 名 = `revertTimebox` 单数 → buildActionMap 拆解为 `revert`。）

- [ ] **Step 9: validate:manifest + tsc**

Run: `cd frontend && npm run validate:manifest`
Expected: 0 errors。

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "timebox" | head`
Expected: timebox 相关错逐步清零（start/end/overtime 引用点在 Task 7/8 清）。

- [ ] **Step 10: Commit**

```bash
git add frontend/src/domains/timebox/manifest.yaml frontend/src/domains/timebox/transitions.ts frontend/src/nexus/orchestrator/lifecycle-configs.ts frontend/src/domains/timebox/repository/ frontend/src/app/actions/timebox.ts
git commit -m "feat(023.12): T4 timebox manifest+transitions+repo（删 start/end/overtime，加 revert）"
```

---

## Task 5: appointment manifest + 仓储 + reconcile 改造

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（block B appointment lifecycle）
- Modify: `frontend/src/domains/timebox/repository/appointment.ts`（删 markInProgress/markExpired，加 complete/revert）
- Modify: `frontend/src/domains/timebox/repository/generic-repo-adapter.ts`（删 in_progress/expired 分支）
- Modify: `frontend/src/domains/timebox/status/reconcile-appointment.ts`（改造为 badge 派生函数）
- Delete: `frontend/src/app/actions/reconcile-appointments.ts`（复数，写库入口）
- Modify: `frontend/src/app/appointments/page.tsx`（删 L21 reconcileAndAdvanceAppointments 调用 + import）
- Modify: `frontend/src/domains/timebox/pages/AppointmentPage.tsx`（清理 reconcile 注释/调用）
- Modify: `frontend/src/app/actions/timebox.ts`（加 completeAppointment / revertAppointment server action）
- Delete: `frontend/src/.../reconcile-appointments*.test.ts`（复数测试，若存在）
- Modify: `frontend/src/.../reconcile-appointment.test.ts` + tz test（singular，改造为 badge 派生测试）

**Interfaces:**
- Consumes: Task 2 新 `AppointmentStatus`、Task 3 `deriveAppointmentDisplayStatus`。
- Produces: appointment SM 新 transition 集合（create/cancel/complete/revert）；`completeAppointment(id)` / `revertAppointment(id)` server action；badge 派生函数。

- [ ] **Step 1: 改 manifest block B（appointment lifecycle）**

替换 `appointment:` lifecycle 块为：
```yaml
  appointment:
    states: [scheduled, cancelled, completed]
    initial_state: scheduled
    transitions:
      - { from: null,       to: scheduled, trigger: intent, action: create,   event_type: AppointmentCreated }
      - { from: scheduled,  to: cancelled, trigger: intent, action: cancel,   event_type: AppointmentCancelled }
      - { from: scheduled,  to: completed, trigger: intent, action: complete, event_type: AppointmentCompleted }
      - { from: cancelled,  to: scheduled, trigger: intent, action: revert,   event_type: AppointmentReverted }
      - { from: completed,  to: scheduled, trigger: intent, action: revert,   event_type: AppointmentReverted }
    terminal_states: []
    # 注：in_progress/expired 不再持久化——读时用 status/reconcile-appointment.ts 派生显示。
```

- [ ] **Step 2: 仓储 appointment.ts 删 markInProgress/markExpired + 加 complete/revert**

`repository/appointment.ts`：删除 `markInProgress` / `markExpired` 方法（及 NON_TERMINAL 常量中的 in_progress）。新增：
```ts
/** complete: scheduled → completed */
async complete(id, userId, at = new Date()) { /* UPDATE status='completed', updatedAt=at */ }
/** revert: cancelled|completed → scheduled */
async revert(id, userId, at = new Date()) { /* UPDATE status='scheduled', updatedAt=at */ }
```
（删 inProgressAt/expiredAt 写入——列已在 Task 1 drop。）

- [ ] **Step 3: generic-repo-adapter.ts 删 in_progress/expired 分支**

L100-102 区段 `toStatus === 'in_progress'` / `'expired'` 分支删除（不再可达）。

- [ ] **Step 4: reconcile-appointment.ts 改造为 badge 派生**

将 `reconcileAppointmentStatuses` 改为调用 Task 3 的 `deriveAppointmentDisplayStatus`，返回 badge 信息：
```ts
import { deriveAppointmentDisplayStatus } from './derive-display-status';
export type AppointmentBadge = { appointmentId: string; badge: 'in_progress' | 'expired' | null };
export function deriveAppointmentBadges(appointments, now): AppointmentBadge[] {
  return appointments.map(a => ({ appointmentId: a.id, badge: deriveAppointmentDisplayStatus(a.status, a.startTime, now) }));
}
```
（保留原 `reconcileAppointmentStatuses` 导出名作 deprecated alias 指向新函数，或直接删——按调用方清理。注释更新：纯派生、不写库。）

- [ ] **Step 5: 删 plural reconcile action + page 调用**

删除 `app/actions/reconcile-appointments.ts`（整个文件）。
`app/appointments/page.tsx`：删 L12 import + L21 `await reconcileAndAdvanceAppointments(MVP_USER_ID)`。
`domains/timebox/pages/AppointmentPage.tsx`：清理 reconcile 相关注释/调用。

- [ ] **Step 6: 加 completeAppointment / revertAppointment server action**

`app/actions/timebox.ts` 新增（参照 createAppointment/deleteAppointment 范式）：
```ts
export async function completeAppointment(appointmentId: string) { /* submitDynamicIntent('appointment','completeAppointment',...) */ }
export async function revertAppointment(appointmentId: string) { /* submitDynamicIntent('appointment','revertAppointment',...) */ }
```
（intent action 单数 → buildActionMap 拆 complete/revert。）

- [ ] **Step 7: 清理 reconcile 复数测试 + 改造 singular 测试**

删 `reconcile-appointments*.test.ts`（复数，随写库入口删除）。
`reconcile-appointment.test.ts` + `reconcile-appointment-tz.test.ts`（singular）：改为断言 badge 派生输出（不再断言 submitDynamicIntent 调用）。

- [ ] **Step 8: validate:manifest + vitest + tsc**

Run: `cd frontend && npm run validate:manifest && npx vitest run src/domains/timebox/status && npx tsc --noEmit 2>&1 | grep -E "appointment|reconcile" | head`
Expected: manifest 0 errors；reconcile/derive 测试 PASS；appointment 相关 tsc 错在 Task 10 UI 清。

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src/domains/timebox/manifest.yaml frontend/src/domains/timebox/repository/ frontend/src/domains/timebox/status/ frontend/src/app/actions/ frontend/src/app/appointments/page.tsx frontend/src/domains/timebox/pages/AppointmentPage.tsx
git commit -m "feat(023.12): T5 appointment manifest+repo+reconcile 改造（删 in_progress/expired，加 complete/revert）"
```

---

## Task 6: okrs cycle manifest + action rename + guard + repo + 过滤点

**Files:**
- Modify: `frontend/src/domains/okrs/manifest.yaml`（cycle block B）
- Modify: `frontend/src/app/actions/okr.ts`（approveCycle 简化、endCycle→finishCycle rename、reviewCycle 不变、加 revertCycle）
- Modify: `frontend/src/domains/okrs/guard.ts`（ALLOWED map 5 key → 4 key）
- Modify: `frontend/src/domains/okrs/repository/cycle.ts`（status rename + revert + 时间戳分支）
- Modify: `frontend/src/domains/okrs/repository/objective.ts:101`（filter 'in_progress' → 'approved'）
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`（tabs 5→4 + hasActive 'in_progress'→'approved'）
- Modify: `frontend/src/domains/okrs/__tests__/guard.test.ts`、`contribution-panel.test.ts`（fixture rename）

**Interfaces:**
- Consumes: Task 2 新 `CycleStatus`。
- Produces: cycle SM 新 transition（approve/finish/review/revert）；server actions `approveCycle(id)`/`finishCycle(id)`/`reviewCycle(id)`/`revertCycle(id)`；guard ALLOWED 新 key 集。后续 UI task 9 消费。

- [ ] **Step 1: 改 okrs/manifest.yaml cycle block B**

替换 `cycle:` lifecycle 块为：
```yaml
  cycle:
    states: [draft, approved, finished, reviewed]
    initial_state: draft
    transitions:
      - { from: null,       to: draft,    trigger: intent, action: create,  event_type: CycleCreated }
      - { from: draft,      to: approved, trigger: intent, action: approve, event_type: CycleApproved }
      - { from: approved,   to: finished, trigger: intent, action: finish,  event_type: CycleFinished }
      - { from: finished,   to: reviewed, trigger: intent, action: review,  event_type: CycleReviewed }
      - { from: reviewed,   to: finished, trigger: intent, action: revert,  event_type: CycleReverted }
    terminal_states: []
```
block F subscribed_events：删 CyclePlanned/CycleStarted，加 CycleApproved/CycleFinished/CycleReverted（保留 CycleCreated/CycleEnded→改名 CycleFinished/CycleReviewed）。

- [ ] **Step 2: app/actions/okr.ts —— cycle server action rename + revertCycle**

- `approveCycle`：getAction 不再按 now 分支 startCycle/planCycle，统一返回 `'approveCycle'`（intent action）。
- `endCycle` → rename 整个函数为 `finishCycle`，getAction 返回 `'finishCycle'`。
- `reviewCycle`：getAction 保持 `'reviewCycle'`。
- 新增 `revertCycle(cycleId)`：getAction 返回 `'revertCycle'`，走 submitDynamicIntent('okrs', 'revertCycle', ...)。

（buildActionMap 拆 approveCycle→approve、finishCycle→finish、reviewCycle→review、revertCycle→revert——单数 objectType='cycle' ✓。）

- [ ] **Step 3: guard.ts ALLOWED map 5 key → 4 key**

```ts
const ALLOWED: Record<Cycle['status'], ReadonlySet<EditableOperation>> = {
  draft: new Set(['edit_objective', 'edit_kr']),
  approved: new Set(['edit_objective', 'edit_kr']),
  finished: new Set(['edit_objective', 'edit_kr']),
  reviewed: new Set(),  // reviewed 锁定
};
```
（删 not_started/in_progress/ended 三 key。）

- [ ] **Step 4: cycle.ts 仓储 status rename + revert + 时间戳**

`updateStatus` 分支：
```ts
if (status === 'approved') updates.startedAt = now
if (status === 'finished') updates.endedAt = now
if (status === 'reviewed') updates.reviewedAt = now
// reviewed→finished(revert)：保留原 startedAt/endedAt（不覆盖），仅 updatedAt
```
新增 revert 路径（reviewed→finished 不盖 endedAt）。

- [ ] **Step 5: objective.ts:101 过滤 'in_progress' → 'approved'**

```ts
// 改前
eq(s.cycles.status, 'in_progress'),
// 改后
eq(s.cycles.status, 'approved'),
```

- [ ] **Step 6: okr-directory.tsx tabs + hasActive**

CYCLE_STATUS_TABS（约 L68-75）：删 not_started/in_progress/ended 三项，改为：
```ts
{ key: 'draft', label: '草稿' },
{ key: 'approved', label: '进行中' },
{ key: 'finished', label: '已结束' },
{ key: 'reviewed', label: '已复盘' },
```
hasActive（约 L124）：`cycle.status === 'in_progress'` → `cycle.status === 'approved'`。

- [ ] **Step 7: 测试 fixture rename**

`guard.test.ts`、`contribution-panel.test.ts`：把 `not_started`/`in_progress`/`ended` fixture 改为 `approved`/`finished`（contribution-panel `cycleStatus !== 'reviewed'` 不变）。

- [ ] **Step 8: validate:manifest + vitest + tsc**

Run: `cd frontend && npm run validate:manifest && npx vitest run src/domains/okrs && npx tsc --noEmit 2>&1 | grep -E "okr|cycle|guard" | head`
Expected: manifest 0 errors；okrs 测试 PASS（fixture 同步后）；cycle/guard tsc 锁零。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/domains/okrs/ frontend/src/app/actions/okr.ts
git commit -m "feat(023.12): T6 okrs cycle lifecycle 收敛（approve/finish/review/revert）+ guard+repo+过滤"
```

---

## Task 7: timebox rules + CNUI handlers（log-timebox guard、EditTimeboxes revert）

**Files:**
- Modify: `frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts`（状态判断简化为 planned）
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（log-timebox handler 加 status='planned' guard；edit-timeboxes handler 加 revert 分派）
- Modify: `frontend/src/domains/timebox/cnui/parse-timeboxes.ts`（若引用旧 status）

**Interfaces:**
- Consumes: Task 4 的 timebox 新 transition 集。
- Produces: rule-engine 在新 lifecycle 下正确放行/拒绝；CNUI 批量打卡只对 planned 生效；EditTimeboxes 支持回退。

- [ ] **Step 1: timebox-overlap.ts 状态判断简化**

把所有 `status === 'running' | 'overtime' | 'ended'` 判断改为"仅 planned 可创建/编辑/取消"——overlap 规则只对 planned 时间盒做冲突检测（running/overtime/ended 不再持久化）。具体：替换旧 status 分支为 `if (tb.status !== 'planned') continue;` 类语义。

- [ ] **Step 2: handlers.ts log-timebox handler 加 guard**

log-timebox surface handler 的批量循环内，加：
```ts
// 仅 planned 可打卡（避免对 logged/cancelled 行触发 SM 错误）
if (tb.status !== 'planned') continue;
```

- [ ] **Step 3: handlers.ts edit-timeboxes handler 加 revert 分派**

edit-timeboxes（三合一 modify/cancel/delete）扩成四合一或加 revert 分派：按 action 分派到 `revertTimebox` server action（Task 4 已建）。

- [ ] **Step 4: vitest + tsc**

Run: `cd frontend && npx vitest run src/nexus/core/rule-engine src/domains/timebox/cnui && npx tsc --noEmit 2>&1 | grep -E "overlap|handlers|parse-timeboxes" | head`
Expected: rule/handler 测试 PASS（同步 fixture）；tsc 锁零。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts frontend/src/domains/timebox/cnui/
git commit -m "feat(023.12): T7 timebox overlap rule 简化 + log-timebox planned guard + edit revert 分派"
```

---

## Task 8: timebox UI（timebox-card 删除/打卡/回退 + 派生 badge）

**Files:**
- Modify: `frontend/src/domains/timebox/components/timebox-card.tsx`（删 开始/结束 按钮；加 删除/打卡/回退；派生 running/overtime badge）
- Modify: `frontend/src/domains/timebox/components/timebox-list.tsx`（传 onRevert/onDelete）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（wire revertTimebox/deleteTimebox server action）
- Test: `frontend/src/domains/timebox/components/__tests__/timebox-card.test.tsx`（若不存在则建）

**Interfaces:**
- Consumes: Task 3 `deriveTimeboxDisplayStatus`、Task 4 `revertTimebox` server action、Task 2 `TimeboxStatus`。
- Produces: `/timeboxes` 列表卡片新按钮 + 派生显示。

- [ ] **Step 1: timebox-card.tsx STATUS_STYLES 收敛**

```ts
const STATUS_STYLES: Record<TimeboxStatus, { variant: ...; label: string }> = {
  planned: { variant: 'outline', label: '已规划' },
  logged: { variant: 'secondary', label: '已记录' },
  cancelled: { variant: 'outline', label: '已取消' },
};
```

- [ ] **Step 2: 派生 running/overtime badge（替代 startedAt 计时器）**

删除原 `startedAt`/`endedAt`/`overtimeAt` 相关的 useEffect 计时器 + elapsed/overtimeMs 计算。改用 `deriveTimeboxDisplayStatus(timebox.status, timebox.startTime, timebox.endTime, now)` 派生 displayStatus；保留每秒 setInterval（仅当 displayStatus 非 null 时跑）驱动进度条。

- [ ] **Step 3: 按钮区改造**

compact + 完整两模式，按钮逻辑改为：
```tsx
{timebox.status === 'planned' && (
  <>
    <Button size="sm" onClick={() => handleAction('log')}>打卡</Button>
    <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction('cancel')}>取消</Button>
    <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction('delete')}>删除</Button>
  </>
)}
{(timebox.status === 'logged' || timebox.status === 'cancelled') && (
  <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction('revert')}>回退</Button>
)}
{timebox.status === 'logged' && timebox.executionRecord && (
  <Button size="sm" variant="ghost" onClick={() => handleAction('viewLog')}>查看记录</Button>
)}
```
（删 开始/结束/确认结束 三按钮分支。）

- [ ] **Step 4: timebox-list + workspace wire 回退/删除**

`timebox-list.tsx`：onAction 已是 `(id, action) => void`，无需改签名（action 字符串透传）。
`timeboxes-workspace.tsx`：onAction handler 加 `case 'revert': await revertTimebox(id)`、`case 'delete': await deleteTimebox(id)`（deleteTimebox 若不存在则新增 server action，走硬删/软删按既有约定）。

- [ ] **Step 5: 写/改测试**

`timebox-card.test.tsx`：断言 planned 显示 打卡/取消/删除；logged 显示 回退+查看；cancelled 显示 回退；running/overtime badge 由派生函数决定（mock now）。

- [ ] **Step 6: vitest + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components && npx tsc --noEmit 2>&1 | grep -E "timebox-card|timebox-list|timeboxes-workspace" | head`
Expected: 测试 PASS；tsc 锁零。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/domains/timebox/components/
git commit -m "feat(023.12): T8 timebox-card 删除/打卡/回退按钮 + running/overtime 派生 badge"
```

---

## Task 9: okrs UI（cycle-menu rename + revert + directory tabs）

**Files:**
- Modify: `frontend/src/domains/okrs/components/cycle-menu.tsx`（approve/finish/review guard rename；加 CycleRevertMenuItem）
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`（已在 Task 6 改 tabs，本 task 验证 + cycle 操作菜单集成）
- Modify: `frontend/src/domains/okrs/components/objective-card.tsx`（按 cycle.status 守卫编辑）
- Modify: `frontend/src/domains/okrs/components/okr-form.tsx`（reviewed 锁定写）

**Interfaces:**
- Consumes: Task 6 的 `approveCycle`/`finishCycle`/`reviewCycle`/`revertCycle` server action、新 CycleStatus、guard ALLOWED。
- Produces: `/okrs` 左栏 cycle 操作菜单新语义。

- [ ] **Step 1: cycle-menu.tsx 三 MenuItem guard rename + 新增 CycleRevertMenuItem**

- `CycleApproveMenuItem`：guard `cycle.status !== 'draft'` 不变；handleApprove 调 `approveCycle`（无需改）。
- `CycleEndMenuItem` → rename `CycleFinishMenuItem`：guard 改 `cycle.status !== 'approved'`（原 'in_progress'）；调 `finishCycle`（原 endCycle）。
- `CycleReviewMenuItem`：guard 改 `cycle.status !== 'finished'`（原 'ended'）。
- 新增 `CycleRevertMenuItem`：guard `cycle.status !== 'reviewed'`；调 `revertCycle`。Dialog 文案"回退到已结束状态？回退后可继续编辑/删除"。

- [ ] **Step 2: okr-directory cycle 菜单集成**

确认 Task 6 的 tabs/hasActive 改动后，cycle ⋯ 菜单含：审核通过(draft) / 添加目标 / 结束周期(approved→finishCycle) / 复盘(finished) / 回退(reviewed) / 删除周期（有 objective 时禁）。import 改 `finishCycle`、加 `CycleRevertMenuItem`。

- [ ] **Step 3: objective-card + okr-form reviewed 锁定**

`objective-card.tsx` / `okr-form.tsx`：编辑入口按 `cycle.status === 'reviewed'` 禁用（接 guard.ts ALLOWED——reviewed={}）。UI 层读 cycle.status 判断是否 disabled。

- [ ] **Step 4: vitest + tsc + /browse**

Run: `cd frontend && npx vitest run src/domains/okrs/components && npx tsc --noEmit 2>&1 | grep -E "cycle-menu|okr-directory|objective-card|okr-form" | head`
Expected: 测试 PASS；tsc 锁零。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/okrs/components/
git commit -m "feat(023.12): T9 okrs UI cycle-menu（approve/finish/review/revert）+ directory tabs + reviewed 锁定"
```

---

## Task 10: appointment UI（workspace 取消/完成/回退 + 派生 badge）

**Files:**
- Modify: `frontend/src/domains/timebox/components/appointment-workspace.tsx`（删 in_progress 分支；加 取消/完成/回退 按钮；派生 badge）
- Modify: `frontend/src/domains/timebox/components/appointment-locked-card.tsx`（STATUS_STYLES 收敛 + 派生）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/CreateAppointment.tsx` / `EditAppointment.tsx` / `DeleteAppointment.tsx`（status === 'in_progress' 引用清理）
- Test: 相关 vitest 同步

**Interfaces:**
- Consumes: Task 3 `deriveAppointmentDisplayStatus`、Task 5 `completeAppointment`/`revertAppointment` server action、Task 2 `AppointmentStatus`。
- Produces: `/appointments` 列表新按钮 + 派生 badge。

- [ ] **Step 1: appointment-workspace.tsx 列表筛 + 按钮**

L87 `active = items.filter(i => i.status === 'scheduled' || i.status === 'in_progress')` → `items.filter(i => i.status === 'scheduled')`（in_progress 不再持久化）。
L180 editable 同步：`i.status === 'scheduled'`。
列表项新增按钮（每行右侧）：
```tsx
{it.status === 'scheduled' && (
  <>
    <Button size="icon-xs" variant="ghost" onClick={e=>{e.stopPropagation(); openEditor(it)}} aria-label="编辑"><Pencil/></Button>
    <Button size="icon-xs" variant="ghost" onClick={e=>{e.stopPropagation(); handleComplete(it.id)}} aria-label="完成"><Check/></Button>
    <Button size="icon-xs" variant="ghost" className="text-body" onClick={e=>{e.stopPropagation(); handleCancel(it.id)}} aria-label="取消"><CalendarOff/></Button>
  </>
)}
{(it.status === 'cancelled' || it.status === 'completed') && (
  <Button size="icon-xs" variant="ghost" onClick={e=>{e.stopPropagation(); handleRevert(it.id)}} aria-label="回退"><RotateCcw/></Button>
)}
```
（handleComplete/handleCancel/handleRevert 调对应 server action + reload；OQ-1 cancel guard 本轮降级 TODO，无条件放行 + `// TODO [027]: appointment task/habit guard` 注释。）

- [ ] **Step 2: 派生 badge 替代持久状态判断**

L202 `{it.status === 'in_progress' ? '执行中' : '计划'}` → 用 `deriveAppointmentDisplayStatus(it.status, it.startTime, now)` 派生 badge 文本（'执行中'/'已过期'/'计划'）。需要一个 `now` state + 定时刷新（同 timebox-card 模式，但按分钟粒度即可，不必每秒）。

- [ ] **Step 3: appointment-locked-card.tsx STATUS_STYLES 收敛**

5 entry → 3 entry（scheduled/cancelled/completed）+ 派生 badge（in_progress/expired）。

- [ ] **Step 4: CNUI surfaces 清理 in_progress 引用**

`CreateAppointment.tsx` L65 / `EditAppointment.tsx` L46,75 / `DeleteAppointment.tsx` L57：`it.status === 'in_progress'` 分支删除（派生或仅显 scheduled）。

- [ ] **Step 5: vitest + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components/appointment-workspace src/domains/timebox/cnui/surfaces && npx tsc --noEmit 2>&1 | grep -E "appointment" | head`
Expected: 测试 PASS；tsc 锁零。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/components/appointment-workspace.tsx frontend/src/domains/timebox/components/appointment-locked-card.tsx frontend/src/domains/timebox/cnui/surfaces/
git commit -m "feat(023.12): T10 appointment UI 取消/完成/回退按钮 + 派生 badge（删 in_progress 持久引用）"
```

---

## Task 11: Tier 2 文档同步 + CHANGELOG

**Files:**
- Modify: `docs/usom-design.md`（三域 lifecycle 状态机更新）
- Modify: `docs/database-design.md`（三表 status 合法值 + 废弃列移除 + 迁移 0034 记录）
- Modify: `CHANGELOG.md`（[023.12] section）
- Modify: `manifest.md`（版本历史指针，按 [[project-changelog-split]]：版本历史写 CHANGELOG 不写 manifest，仅同步索引）

- [ ] **Step 1: usom-design.md 三域 lifecycle 段更新**

timebox/cycle/appointment 三段状态机图 + transition 表对齐新定义（与 manifest 一致）；明确 running/overtime/in_progress/expired 为读时派生、不持久化。

- [ ] **Step 2: database-design.md 更新**

三表 status 列合法值表（timebox: planned/logged/cancelled；cycle: draft/approved/finished/reviewed；appointment: scheduled/cancelled/completed）；timeboxes 删 started_at/ended_at/overtime_at、appointments 删 in_progress_at/expired_at；迁移 0034 摘要（TRUNCATE + DROP COLUMN，无 enum DDL）。

- [ ] **Step 3: CHANGELOG.md [023.12] section**

加在最新版本之后：
```markdown
## [023.12] 三域生命周期语义重构（2026-07-06）

### 决策
- D1 appointment 时间态（in_progress/expired）读时派生显示，同 timebox 模式
- D2 appointment 回退 cancelled/completed→scheduled（与 timebox 对称）
- D3 方案 A（单分支三域同 ship）+ status 是 TEXT 无 PG enum（迁移零类型 DDL）
- cycle action rename：startCycle/planCycle→approve、endCycle→finish、新增 revert

### 改动
- schema 三 status enum 收敛 + 废弃时间戳列 drop（迁移 0034）
- timebox/cycle/appointment manifest lifecycle 重写
- 派生显示工具 derive-display-status.ts（timebox+appointment 共享）
- reconcile-appointments 写库入口删除 + singular 改 badge 派生
- 三页 UI（/timeboxes /okrs /appointments）操作按钮重做

### 验证
- vitest base=head 零新增 / tsc 零新增 / validate:manifest 0 errors / /browse 三页通过
```

- [ ] **Step 4: manifest.md 索引同步（版本历史写 CHANGELOG）**

按 [[project-changelog-split]]：manifest.md 仅维护索引，不写版本历史；若 [023.12] 引入新文档/改动索引项则同步。

- [ ] **Step 5: Commit**

```bash
git add docs/usom-design.md docs/database-design.md CHANGELOG.md manifest.md
git commit -m "docs(023.12): T11 Tier 2 文档同步 + CHANGELOG [023.12]"
```

---

## Task 12: 验证门 + /browse 视觉验证

**Files:** 无（验证 task）

- [ ] **Step 1: vitest base=head 零新增**

Run: `cd frontend && npx vitest run 2>&1 | tail -20`
Expected: 失败集合相比 main 基线零新增（用 base/head 失败集合对比，[[feedback_change-gate-baseline]]，别用硬编码数）。

- [ ] **Step 2: tsc 零新增**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: = 基线（Task 1 起累计清零，无新增）。

- [ ] **Step 3: validate:manifest + validate:domain-structure**

Run: `cd frontend && npm run validate:manifest && npm run validate:domain-structure`
Expected: 0 errors / ✓。

- [ ] **Step 4: /browse 三页视觉验证**

Run（gstack /browse）:
- `/timeboxes`：列表卡片显示 打卡/取消/删除（planned）、回退（logged/cancelled）；running/overtime badge 派生显示；无 开始/结束 按钮。
- `/okrs`：左栏 cycle ⋯ 菜单含 审核通过/结束/复盘/回退/删除（按 status gate）；tabs 4 态；reviewed cycle objective 编辑锁定。
- `/appointments`：列表项 取消/完成/回退 按钮；in_progress/expired badge 派生显示。

- [ ] **Step 5: 终态报告**

无 commit（验证 task）。报告：vitest/tsc/validate 数据 + /browse 三页截图结论。若全绿 → 准备 `/review` → `/ship`。

---

## Plan-Eng-Review Amendments (2026-07-06)

plan-eng-review（含 codex outside voice）发现 9 类问题，全部经用户决议。以下 amendments 是 T1-T12 的**增量**，实现时与原 task 合并执行。原 task body 未重写——amendments 优先级等于原 step。

### AM1 — 爆破半径漏网文件（blast-radius gaps，P1）
- **T5 Files 增**：`frontend/src/domains/timebox/repository/mappers/appointment.ts`（删 `inProgressAt`/`expiredAt` 行映射 L26-27,45-46——列已 drop）。
- **T7 Files 增**：`frontend/src/domains/timebox/hooks.ts:201,215,250`（`status === 'overtime'/'running'/'ended'` 分支改为：用 `currentTimebox != null` 判活跃——见 AM4；其余 overtime/running/ended 派生显示用 `deriveTimeboxDisplayStatus`）。

### AM2 — 重排：DROP COLUMN 迁移挪到最后（红树，P2）
- **T1 拆分**：T1a = schema.ts enum 数组收敛（早，类型 pivot）；**T1b = 迁移 0034（TRUNCATE + DROP COLUMN）+ schema.ts 列移除 → 挪到 T10 之后、T11 之前**（新 T11' "DB 迁移落地"）。enum 数组 pivot 仍早，残余类型 pivot 红窗对此重构规模不可避免；但**破坏性列 drop 推迟到所有引用（mappers/hooks/UI/CNUI）清完之后**，使 mappers/hooks 不经历"列已无、代码仍引用"的窗口。
- 各 task 的 `git commit` 按新顺序；T1b commit 前 `npx tsc --noEmit` 须 0 error（所有引用已清）。

### AM3 — SM transition 测试补齐（test gap，P1）
- **T4 增 Step**：timebox revert transition 测试（`logged→planned` 合法、`cancelled→planned` 合法、`logged→logged` 拒绝、`planned→planned` 拒绝）。
- **T5 增 Step**：appointment complete + revert transition 测试（`scheduled→completed`、`cancelled→scheduled`、`completed→scheduled`、非法转换拒绝）。
- **T6 增 Step**：cycle revert transition 测试（`reviewed→finished` 合法、`finished→finished` 拒绝、`approved→draft` 拒绝——见 AM7）。
- **T12 增 Step**：regression 枚举——grep 现有断言 `'running'/'overtime'/'ended'/'not_started'/'in_progress'/'expired'` 的测试文件，逐一确认已更新（[[feedback_change-gate-baseline]] base/head 集合对比）。

### AM4 — currentTimebox 改由派生填充（codex #3，P0 功能回归）
- **新 T13: currentTimebox 派生填充链**
  - Files: `nexus/orchestrator/index.ts:284`（currentTimebox passthrough）、`lib/db/repositories/context-snapshot.repository.ts:31`（mapper）、`domains/timebox/hooks.ts:201`（活跃判断）
  - 实现：orchestrator 构建 snapshot 时，用 `deriveTimeboxDisplayStatus` 扫 planned timeboxes，把**第一个** `displayStatus==='running'` 的填入 `currentTimebox`（无则 undefined）。hooks `currentTimebox.status === 'running'` check 改为 `currentTimebox != null`（orchestrator 仅在派生 running 时填入）。
  - Test: orchestrator snapshot 构建单测（mock planned timeboxes + now，断言 currentTimebox 填充/空）。

### AM5 — TZ 根因治本（codex #6，P1 正确性）
- **新 T14: 设 process.env.TZ**
  - Files: `frontend/next.config.ts`（或 `.env`）增 `process.env.TZ = 'Asia/Shanghai'`（或 `env: { TZ: 'Asia/Shanghai' }`）
  - 注：MVP 单用户 Shanghai；若未来多用户，derive 函数加显式 iana tz 参数（[[project-023-09-tz-fragility]] 同模式不同实例）。
  - Verify: `derive-display-status.test.ts` 跨日界 case 在 `TZ=UTC` 下重跑确认日界仍 Shanghai（next.config 设 TZ 后 Node 进程统一）。

### AM6 — cycle 列 rename（codex #8，P1 命名诚实）
- **T1b（迁移）增**：`ALTER TABLE cycles RENAME COLUMN started_at TO approved_at;` + `RENAME COLUMN ended_at TO finished_at;`（reviewed_at 不动）；schema.ts cycles 列名同步；`cycle.ts` 仓储时间戳分支 + USOM `Cycle` 接口字段名同步（`startedAt→approvedAt`、`endedAt→finishedAt`）。

### AM7 — timebox revert 守卫：有 executionRecord 则拒（codex #7，P1 数据完整性）
- **T4 revertTimebox server action 增 guard**：`if (timebox.executionRecord != null) throw '请先清理执行记录再回退'`。
- **语义含义**（记录在此）：logged timebox 按定义有 executionRecord → logged→planned revert 实际需先手动清记录；**只有 cancelled→planned 可直接 revert**。UI（T8）logged 卡片的"回退"按钮点击后若 server 拒绝，toast 提示"该时间盒有执行记录，请先删除记录"。这与原 P1 premise（logged/cancelled 都可回退）部分收缩——评审后用户选 B（拒）的有意取舍。

### AM8 — 漏网文件 + CNUI 四路注册（codex #5+#10，P1/P2）
- **T5 Files 增**：`lib/db/repositories/context-snapshot.repository.ts`（currentTimebox mapper，配合 AM4）。
- **T7 Files 增**：`nexus/core/intent-engine/ai-parser.ts:38`（NL prompt 删 `'running'` 关键词示例）。
- **T7/T10 Files 增 surfaces**：`AdjustTimeboxes.tsx` / `CreateSmartTimebox.tsx` / `CreateTimebox.tsx` / `AppointmentFormFields.tsx`（grep `'running'/'overtime'/'ended'/'in_progress'/'expired'` 引用清理）；`CreateAppointment.tsx:65` `!['running','ended','logged','cancelled'].includes(cur.status)` 收敛为新 status 集。
- **CNUI 四路注册 checklist**（[[project-cnui-surface-dual-registration]]）——T4/T5/T6 每个新 server action（`revertTimebox`/`completeAppointment`/`revertAppointment`/`finishCycle`/`revertCycle`）各走四通道：
  1. server: `domains/*/cnui/handlers.ts` surfaceHandlers map 注册
  2. client: `register-client-surfaces` 注册
  3. manifest K-block `cnui_surfaces` 条目（若开新 surface）
  4. intent_trigger A 区块（若有 AI/shortcut 入口；纯 server action 调用可豁免 trigger，但 handlers dispatch 分支必须有）
  - 注：revert 多为列表内联按钮（不经 CNUI surface），但 edit-timeboxes surface 加 revert 分派（T7 Step 3）须四路闭合。

### AM9 — overlap 规则算法明确（codex #4，P1 正确性）
- **T7 Step 1b 替换 Step 1**：overlap 规则不再用 `activeStatuses` SQL 过滤。新算法：加载当日所有 `status='planned'` timeboxes，用 `deriveTimeboxDisplayStatus` 应用层派生，仅对**派生 running/overtime + 同时间区间**的做冲突检测；`planned` 但未到开始时间（派生 null）的也参与创建冲突判断。
- Test: overlap case 覆盖「两条 planned 同区间冲突」「planned 与派生 running 不重复计」「cancelled 不参与」。

### AM10 — 默认决议（非 fork，记录在此）
- **codex #1 [026] reversal**：已写入 design doc Recommended Approach（理据 + 反转代价）。plan T11 CHANGELOG 决策段补一行"反转 [026] D2 reversal，理据见 design doc"。
- **codex #9 revert 不对称**：cycle reviewed→finished 单步回退（不回初态）是有意——reviewed 是"复盘锁定"语义，单步回退保留 review 证据的语义边界；timebox/appointment 无等价锁定中间态，故回初态。design doc 注明。
- **codex #11 SQL trade-off**：design doc Recommended Approach 已注明（派生态不可 SQL 查询，单用户 MVP 可接受）。
- **codex #2 拆分建议**：用户选不拆（评审 D-shape → B），理据见 design doc。

### 新 task 顺序（amendment 后）
T1a(enum pivot) → T2(types) → T3(derive) → T4(timebox manifest/repo+revert guard) → T5(appointment+mapper+context-snapshot) → T6(okrs+cycle rename) → T7(rules overlap 算法+CNUI+ai-parser+surfaces) → T8(timebox UI) → T9(okrs UI) → T10(appointment UI) → T13(currentTimebox 派生链) → T14(TZ env) → **T1b(迁移 0034 落地+cycle rename+DROP COLUMN)** → T11(docs+CHANGELOG) → T12(验证门+/browse)。

---

## Self-Review

**Spec coverage（design doc 各节 → task 映射）**
- §Detailed/timebox → T1(schema) + T2(types) + T3(derive) + T4(manifest/repo) + T7(rules/cnui) + T8(UI) ✓
- §Detailed/cycle（含 action 映射表）→ T1 + T2 + T6(manifest/action rename/guard/repo/filter) + T9(UI) ✓
- §Detailed/appointment（含 reconcile 归因）→ T1 + T2 + T3 + T5(manifest/repo/reconcile 改造) + T10(UI) ✓
- §迁移方案（TEXT，TRUNCATE+DROP）→ T1 ✓
- §爆破半径清单（~30 文件）→ T1-T10 全覆盖；guard.ts/reconcile-appointments/page.tsx 在 T5/T6 ✓
- §OQ-1 appointment guard TODO → T10 Step 1（无条件放行 + 注释）✓
- §OQ-3 log-timebox 批量保留 + guard → T7 Step 2 ✓
- §Success Criteria → T12 ✓
- §Tier 2 文档 → T11 ✓

**Placeholder scan**：无 TBD/TODO（除 OQ-1 显式 TODO 注释，已说明原因）；每个 code step 都有实际代码或精确 edit 指令。

**Type consistency**：
- `deriveTimeboxDisplayStatus` / `deriveAppointmentDisplayStatus`（T3 定义）→ T8/T10 消费，签名一致 ✓
- `revertTimebox`（T4 定义）→ T7/T8 消费 ✓
- `completeAppointment` / `revertAppointment`（T5 定义）→ T10 消费 ✓
- `approveCycle` / `finishCycle` / `reviewCycle` / `revertCycle`（T6 定义）→ T9 消费 ✓
- status union（T2 定义）→ 全链路一致 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-023-12-lifecycle-simplify.md`。两个执行选项：

**1. Subagent-Driven（推荐）** — 每 task 派 fresh subagent，task 间 review，迭代快。
**2. Inline Execution** — 本 session 内 executing-plans 批量执行 + checkpoint。

按 CLAUDE.md 复杂任务流，本 plan 已过 `/plan-eng-review`（含 codex outside voice + 9 amendments，见上）→ 下一步进 SDD（`/superpowers:subagent-driven-development`）。

---

## NOT in scope

- **appointment ↔ task/habit junction + cancel/complete guard**（OQ-1）——schema 无 junction，本轮降级 TODO（UI 无条件放行 + `// TODO [027]`）。属 [027]+ 范畴。
- **timebox 持久态完整报表/分析**（codex #11）——派生后无法 SQL 查时间态；若未来引入报表需求，重新持久化或物化视图。
- **energy 维度宪章显式化**（OQ-5）——下次 constitution amendment。
- **多用户 TZ 支持**——本轮设全局 `TZ='Asia/Shanghai'`（MVP 单用户）；多用户时 derive 加 iana tz 参数。
- **tasks/habits 域 lifecycle 调整**——本轮只 timebox/cycle/appointment；tasks（`in_progress` 是其合法态）与 habits 不动。

## What already exists（reuse，非重建）

- `cycle-menu.tsx` 三 server action（approveCycle/endCycle/reviewCycle）→ rename + 加 revert，非重建。
- `status/reconcile-appointment.ts` 纯函数骨架 → 改造为 badge 派生（`localDayKey` 算法复用）。
- `timebox-card.tsx` 内联 running/overtime 派生计算（elapsed/overtimeMs）→ 抽到共享 `derive-display-status.ts`。
- manifest SSOT + `lifecycle-configs.ts` 动态加载 → 改 manifest 即生效，不动加载逻辑。
- `derive-display-status.ts`（T3 新建）→ timebox+appointment 共享，UI + orchestrator（AM4 currentTimebox）+ overlap 规则（AM9）三方消费。
- `cycle-menu` / `guard.ts` / `contribution-panel` 现有结构 → 状态值 rename + revert 追加，非重写。

## Failure modes（每条新 codepath 一个生产失败场景）

| codepath | 失败场景 | 测试? | 错误处理? | 用户可见? |
|---|---|---|---|---|
| currentTimebox 派生填充（AM4） | orchestrator 扫 planned timebox 慢查询 | T13 单测 | try/catch 兜底空 | 静默空（可接受） |
| timebox revert 有 executionRecord 拒（AM7） | logged timebox 点回退 | T4 单测 | server throw + toast | ✅ toast 提示 |
| overlap 派生算法（AM9） | 大量 planned 时间盒全加载 | T7 单测 | — | 静默（单用户量级 OK） |
| TZ='Asia/Shanghai'（AM5） | prod 容器未继承 env | T14 跨日界测试 | next.config 设 env | 静默偏移（测试守护） |
| cycle 列 rename（AM6） | 迁移漏 rename 导致 mapper 读 null | T1b 后 tsc + 手测 | — | tsc 拦截 |
| appointment 派生 expired badge | TZ 偏 → 昨日约定显"计划中" | T3 + T14 | — | 静默（TZ 守护） |

**Critical gaps**：无（所有失败路径要么有测试，要么有 tsc/validate 拦截，要么静默可接受）。

## Worktree parallelization strategy

**Sequential，无并行机会。** T1a/T2/T3 是类型/工具 pivot，全后续 task 依赖；T4-T10 共享 manifest.yaml（timebox+appointment 同文件）+ lifecycle-configs.ts + USOM types，同 module 目录强耦合；T13/T14/T1b 是横切收尾。强行分 worktree 会撞 manifest/types/cnui/handlers.ts 等共享文件。单分支顺序执行。

## Implementation Tasks（synthesized from this review）

- [ ] **T1a (P1, CC: ~10min)** — schema — 三表 status enum 数组收敛（pivot，不 drop 列）
  - Surfaced by: Step 0 + design doc §迁移方案
  - Files: `lib/db/schema.ts`
  - Verify: `npx tsc --noEmit`（记录基线错）
- [ ] **T2 (P1, CC: ~10min)** — USOM — status union + Cycle 字段 rename（startedAt→approvedAt）
  - Files: `usom/types/primitives.ts`, `usom/types/objects.ts`
- [ ] **T3 (P1, CC: ~15min)** — derive-display-status — 派生纯函数（TDD 9 cases）
  - Files: `domains/timebox/status/derive-display-status.ts` + test
- [ ] **T4 (P1, CC: ~25min)** — timebox — manifest block B/D/F + transitions + repo + revertTimebox(+executionRecord 守卫 AM7) + SM revert 测试（AM3）
  - Files: manifest, transitions, lifecycle-configs, repo, app/actions/timebox.ts, mappers
- [ ] **T5 (P1, CC: ~30min)** — appointment — manifest + repo（complete/revert）+ mappers/appointment.ts（AM1）+ context-snapshot.repo（AM4/AM8）+ reconcile 改 badge + 删 plural writer + SM complete/revert 测试（AM3）
- [ ] **T6 (P1, CC: ~25min)** — okrs — manifest cycle + action rename（approve/finish/revert）+ guard 4 keys + cycle.ts（列 rename AM6）+ objective.ts filter + directory tabs + SM revert 测试（AM3）
- [ ] **T7 (P1, CC: ~25min)** — rules/CNUI — overlap 派生算法（AM9）+ log-timebox planned guard + edit revert 分派 + ai-parser（AM8）+ surfaces 清理（AM8）+ hooks.ts（AM1）
- [ ] **T8 (P2, CC: ~20min)** — timebox UI — 删除/打卡/回退按钮 + 派生 badge + revert 拒绝 toast（AM7）
- [ ] **T9 (P2, CC: ~20min)** — okrs UI — cycle-menu（finish/revert）+ directory + reviewed 锁定
- [ ] **T10 (P2, CC: ~20min)** — appointment UI — 取消/完成/回退 + 派生 badge + surfaces in_progress 清理
- [ ] **T13 (P1, CC: ~15min)** — currentTimebox — orchestrator 派生填充链（AM4，codex #3）
- [ ] **T14 (P2, CC: ~5min)** — TZ — next.config 设 process.env.TZ（AM5，codex #6）
- [ ] **T1b (P1, CC: ~15min)** — 迁移 0034 — TRUNCATE + DROP COLUMN + cycle 列 rename（AM2/AM6）—— **最后落，前置 tsc 0 error**
- [ ] **T11 (P2, CC: ~15min)** — docs — usom-design/database-design/CHANGELOG（含 [026] 反转录，AM10）+ manifest 索引
- [ ] **T12 (P1, CC: ~20min)** — 验证门 — vitest base=head + tsc 0 + validate:manifest + /browse 三页 + regression 枚举（AM3）

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — (refactor, not product change) |
| Codex Review | `/codex review` / outside voice | Independent 2nd opinion | 1 | FOLDED | 11 findings（codex outside voice），全部经 9 plan amendments + design doc 理据吸收 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 issues，0 critical gaps，全部折入 amendments AM1-AM10 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | UI scope 存在（三页），SDD 前后可选 /plan-design-review |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX (outside voice):** codex 实地查码后抓到 6 类 prior reviews（2 轮 spec review + Claude eng sections）漏掉的问题——最重：①[026] D2 reversal 默默推翻、未记理据；②currentTimebox "运行中时间盒"特性重构后静默死亡（hooks:201 + orchestrator:284 + context-snapshot.repo:31）；③simple-path overcomplexity（行为变更 vs schema 清理可拆）；④TZ localDayKey 根因未治；⑤cycle 列改义不改名的命名谎言；⑥revert 子记录孤儿。全部折入 AM4-AM10 + design doc。
- **CROSS-MODEL:** Claude eng review 与 codex 在 blast-radius（hooks.ts）上一致。codex 额外发现 currentTimebox 链 + [026] 战略反转 + simpler-path——Claude 漏了这些。用户在 codex simpler-path 挑战下选 B（维持 Approach A），接受级联处理代价（AM4/AM9/AM6/AM8）。
- **VERDICT:** ENG CLEARED (PLAN) — 9 findings 折入 amendments；codex outside voice 吸收；可进 SDD（`/superpowers:subagent-driven-development`）。UI scope 存在 → SDD 前后可选 `/plan-design-review`。

NO UNRESOLVED DECISIONS


