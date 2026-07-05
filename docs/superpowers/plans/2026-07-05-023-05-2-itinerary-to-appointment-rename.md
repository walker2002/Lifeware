# [023.05-2] itinerary→appointment 全层重命名（PR2 阶段 2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ 设计覆盖（2026-07-05，eng-review 期用户决议）：** 母 design doc（`~/.gstack/projects/walker2002-lifeware/walker-main-design-20260704-itinerary-rename.md`）原定 PR2 目标词 = `schedule`/「日程计划」。eng-review 期用户识别出 schedule/「日程计划」与 timebox 语义**正面撞车**——「日程计划」口语 = 「当日计划」= 时间盒（组合输出），而 itinerary 是**固定的未来日历事件**（输入），「计划」暗示可重排恰好相反。三层 review（office-hours / eng-review / codex）都漏了这层中文产品语感。
> **覆盖决议**：目标词改为 `appointment`/「约定」。理由：(1) appointment = 固定时间承诺，AI 不可挪，精确对应「钉死的未来事件」；(2)「约定」中文清晰，与「时间盒」零撞车，且用户原话自然用「约定回访」（约定是用户本能词）；(3) `scheduled` enum 值保留（`AppointmentStatus.scheduled` 读作「约定的计划态」，可接受，P3）；(4) PR1 已释放的 `schedule` 命名空间**留空**（appointment 不用它，无害）。
> 本 plan 结构（11 task）= 母 design，仅目标词参数换 + A1/T1 finding fold（详见各 task + GSTACK REVIEW REPORT）。

**Goal:** 把已上线的 `itinerary` 对象（中文「行程」）在**全层**重命名为 `appointment`（中文「约定」），让命名精确传达「固定未来时间承诺，AI 不可挪，到日合并为锁定时间格」的语义；配套 DB 表名迁移。

**Architecture:** 纯重命名重构，零行为变更。范围 = DB（`itineraries`→`appointments` 表 + 2 索引 + `0033_rename` 迁移 + `.down.sql`）+ USOM 类型（`Itinerary*`→`Appointment*`，enum 值 `'scheduled'` 保留）+ manifest（lifecycle/field_metadata/intent_triggers/view_routes/cnui_surfaces）+ ~22 生产文件 git mv + ~14 测试文件同步 + 中文「行程」→「约定」+ `/itineraries`→`/appointments` 308 redirect。**不碰 timebox 对象**（PR1 已清理 schedule 命名空间，本 PR 不占用 schedule）。**Tier 2 docs 先行**。

**Tech Stack:** Next.js 16 + TypeScript 5 + PostgreSQL + Drizzle（手写迁移）+ YAML manifest + vitest + ESLint + validate-manifest pre-push hook

## Global Constraints

- **P1 命名空间独立**：本 PR2 占用 `appointment` 命名空间（与 timebox 域完全分离）。PR1 已清空 timebox 域所有活 `schedule` 标识符；`schedule` 命名空间留空（appointment 不用它）。timebox 与 appointment 两域命名互不干扰。
- **F1 resolveObjectType PascalCase 分派**（design eng-review F1，conf 10/10；prior learning `[resolve-objecttype-pascalcase-dispatch]`）：`lifecycle-configs.ts:resolveObjectType` 对多键域按 lifecycle key 的 PascalCase 子串动态匹配 action 名分派对象类型。本 PR2 后 timebox 域 keys=['timebox','appointment']，**任何含 'Appointment' 子串的 action 路由到 appointment lifecycle**。验收：`resolveObjectType('timebox','createAppointment')='appointment'` AND `('timebox','createSmartTimeboxes')='timebox'` AND `getTransitionFromManifest('timebox','appointment',null,'create')` 返回 `AppointmentCreated`。**必须新增回归测试**（Task 10）。
- **T1 isAppointmentIntent dispatch 回归**（eng-review finding，prior learning `[post-ship-codex-catches-cross-task-routing-bug]`）：`rule-engine/rules/timebox.ts:88` 的 `isAppointmentIntent` 用 `intent.action.includes('Appointment')` 分派，是 F1 的 rule-engine 镜像。**必须加回归测试**（Task 10）断言 createAppointment/editAppointment/deleteAppointment→true AND createSmartTimeboxes/viewTimeboxes→false。per-task mock 不能替代 real routing verify。
- **P3 `scheduled` 状态值保留**：`ItineraryStatus`/`AppointmentStatus` 的 enum 值 `'scheduled'`（DB 已存）不动；`tasks.capture_mode='scheduled'`、`intentions.capture_mode='scheduled'` 也用同一 enum 值，**完全不动**。接受 `AppointmentStatus.scheduled` 的轻微重复（「约定的计划态」，改 enum = prod 数据迁移 + 跨表牵连，风险大无收益）。
- **CNUI surface 双注册**（[project-cnui-surface-dual-registration]）：每个改名 surface 同步 server `surfaceHandlers`/manifest K-block + client `cnuiRegistry.register`（在 `src/domains/timebox/index.ts`）+ manifest `intent_triggers` cnui_surface key。
- **CNUI surface 文件 PascalCase**（[cnui-surface-file-pascalcase]）：`CreateItinerary.tsx`→`CreateAppointment.tsx` 等必须 git mv（保留 git 历史），pre-push hook（validate-manifest K-component 规则）强制。
- **drizzle 迁移手写 + journal 登记**（[project-drizzle-migrations-handwritten] + [drizzle-journal-must-register-every-sql]）：`0033_rename_itineraries_to_appointments.sql` 手写 SQL + 登记 `_journal.json` idx=33。RENAME 无 IF EXISTS 不可重跑。
- **A1 dev/prod 迁移机制区分**（eng-review finding，实测 dev DB 无 `__drizzle_migrations` 表）：**dev** = `psql -f` 直跑（无 hash 跟踪，dev DB 无 `__drizzle_migrations`），用 `\dt appointments` 验证；**prod** = `./prod.sh --migrate` 走 drizzle-kit migrate，读 `_journal.json` idx=33 应用并在 `drizzle.__drizzle_migrations`（带 schema 前缀）登记 hash。dev 验证**不查** `__drizzle_migrations`（不存在会报错）。
- **F2 snapshot drift acknowledge**（codex Gap 1）：最后 snapshot 停在 `0006_snapshot.json`，0007+ 全手写无 snapshot。本 PR2 改 `schema.ts` `pgTable('appointments')` 后 gap 加剧——`docs/database-design.md` 显式注明未来 appointments 表 schema 变更继续手写 SQL + 登记 journal，**不引入 `drizzle-kit up`**。
- **F4 response contract 改 property key**（codex Gap 3）：`app/actions/timebox.ts` `ItineraryActionResult` 的 `{ status:'ok'; itinerary: Itinerary }` → `{ status:'ok'; appointment: Appointment }`。**property key 是 contract 改变**——所有 destructure `result.itinerary` 的调用方 break（tsc 编译时 catch）。`itineraryId` 变量名同改。
- **F5 down migration**（codex Gap 4）：`0033_rename_itineraries_to_appointments.down.sql` 配套（RENAME appointments→itineraries + 2 索引）。
- **F6 路由 redirect**（codex Gap 5）：`next.config.ts` `redirects()` 加 `/itineraries/:path*` → `/appointments/:path*` 308 永久跳转。
- **vitest 两个陷阱**（[feedback_vitest-pitfalls]）：必须 frontend cwd 跑（`@/` 映射）；vitest 不做 TS 类型检查，须 `tsc --noEmit` 双验证。
- **Change Gate 基线**（[feedback_change-gate-baseline]）：vitest/tsc 用 base=head 失败集合对比，不硬编码预存失败数。
- **注释规范**：每个 TS/JS 文件保留 `/** @file ... @brief ... */` 中文头，改名同步更新。
- **commit convention**：`refactor(023.05):` 前缀；每 task 独立 commit；`git mv` 保留历史。
- **Tier 2 docs 先行**（[feedback_tier2-sync]）：`docs/usom-design.md` + `docs/database-design.md` 必须先改再动码（Task 1）。
- **mainViewState.type='schedule' 保留**（PR1 OQ-1，C1 finding 已消解）：内部 view state 字面量（贯穿 main-view-state.ts / bottom-nav.tsx / app-context.tsx / use-conversation.ts / use-intent-handler.ts 5 文件），指向 TimeboxesWorkspace。**本 PR2 后仍是「孤儿字面量」（appointment 不占用 schedule，无 Schedule 对象撞车）**，保留理由成立。bottom-nav.tsx:43 `item.key === 'schedule'` 是否持久化未查，重命名需先调查，**defer 独立 follow-up**（见 NOT in scope）。
- **中间态 tsc 不绿（预期）**：本次重命名跨 ~22 文件 + USOM 类型，按依赖层分 task 推进。Task 2-9 之间跨层 import，中间态 tsc/vitest 必然失败。每 task 用 grep 守护本 task 拥有的文件，**full tsc/vitest base=head 总验收在 Task 11**。

## Open Questions（plan 阶段决议）

- **OQ-1 prod itinerary 数据状态** → **决议：RENAME**（保数据）。`itineraries` 无 FK 被引用，RENAME TABLE 安全。dev/prod row count 仅作尽职调查（Task 11 ship 前 `SELECT count(*) FROM itineraries` 留证）。
- **OQ-2 viewAppointments 单复数** → **决议：复数 `viewAppointments` + `/appointments`**（对齐 `viewTimeboxes` + `/timeboxes`）。
- **OQ-3 `AppointmentStatus.scheduled` 重复** → **决议：保留**（P3）。
- **OQ-4 `[023.03] T4` 历史注释** → **决议：保留**（真实历史）。
- **OQ-5 lifecycle key 触 require 债** → **已由 F1 修正**：真机制是 PascalCase 动态分派（require 债已修）。Task 10 加 F1 + T1 回归测试。
- **OQ-6 parse-itinerary 命名形态** → **决议：`parse-appointment.test.ts`（单数）**，匹配函数 `parseAppointmentWithAI` + 对象类型 `Appointment` + action `parseAppointmentIntent`。

---

## File Structure

**Tier 2 docs（Task 1，先行）：**
- `docs/usom-design.md` — §3.13 Itinerary→Appointment + interface/enum + 行为段 + [026] ship note + L1238 field_metadata 提及 + 设计覆盖注（schedule→appointment）
- `docs/database-design.md` — L141 表清单 + L826-871 表 DDL/索引（修 doc 漂：L861-862 索引名补 `_status_`）+ L1648-1655 TZ reconcile 段 + 新增 F2 snapshot drift acknowledge 段

**DB 层（Task 2）：**
- Create: `src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql`
- Create: `src/lib/db/migrations/0033_rename_itineraries_to_appointments.down.sql`
- Modify: `src/lib/db/schema.ts:388-414` — `itineraries`→`appointments` const + 2 索引名 + 注释
- Modify: `src/lib/db/migrations/meta/_journal.json` — 追加 idx=33 entry

**USOM 类型层（Task 3）：**
- Modify: `src/usom/types/objects.ts:626-652` — `Itinerary`→`Appointment` interface
- Modify: `src/usom/types/summaries.ts:53-64` — `ItinerarySummary`→`AppointmentSummary`
- Modify: `src/usom/types/primitives.ts:240` — `ItineraryStatus`→`AppointmentStatus`（值保留）
- Modify: `src/usom/types/process.ts:215` — 6 个 `Itinerary*` event → `Appointment*`

**数据 + reconcile 仓储层（Task 4，git mv）：**
- Rename: `repository/itinerary.ts` → `appointment.ts`（`ItineraryRepository`→`AppointmentRepository`）
- Rename: `repository/mappers/itinerary.ts` → `appointment.ts`
- Modify: `repository/index.ts` barrel
- Modify: `repository/generic-repo-adapter.ts` — `itineraryRepo`→`appointmentRepo` + `objectType:'itinerary'`→`'appointment'` + 「行程不存在」→「约定不存在」
- Modify: `app/actions/timebox/mutation-service.ts` — `createItineraryMutationService`→`createAppointmentMutationService` + `ItineraryFieldUpdated`→`AppointmentFieldUpdated` + `repoLabel:'Itinerary'`→`'Appointment'`
- Rename: `status/reconcile-itinerary.ts` → `reconcile-appointment.ts`（`reconcileItineraryStatuses`→`reconcileAppointmentStatuses`）
- Rename: `app/actions/reconcile-itineraries.ts` → `reconcile-appointments.ts`（`reconcileAndAdvanceItineraries`→`reconcileAndAdvanceAppointments` + `objectType:'itinerary'`→`'appointment'` + `act.itineraryId`→`act.appointmentId`）

**nexus 层（Task 5）：**
- Modify: `nexus/core/intent-engine/ai-parser.ts:520-687` — `ITINERARY_PARSE_PROMPT`→`APPOINTMENT_PARSE_PROMPT` + `ItineraryDraft`→`AppointmentDraft` + `ItineraryParseResult`→`AppointmentParseResult` + `LLMItineraryResponse`→`LLMAppointmentResponse` + `parseItineraryWithAI`→`parseAppointmentWithAI` + `action:'parseItineraryIntent'`→`'parseAppointmentIntent'`
- Modify: `nexus/core/rule-engine/rules/timebox.ts:53,67-95` — `isItineraryIntent`→`isAppointmentIntent` + `includes('Itinerary')`→`includes('Appointment')` + action 白名单 `cancelItinerary/...`→`cancelAppointment/...`
- Modify: `nexus/domain-mutation-service/factory.ts:71,75` — 注释 objectType 示例

**server actions（Task 6）：**
- Modify: `app/actions/intent.ts` — import + `getItinerariesByRange`→`getAppointmentsByRange` + `ItineraryParseIntentResult`→`AppointmentParseIntentResult` + `parseItineraryIntentOnly`→`parseAppointmentIntentOnly` + `itineraryRepo`→`appointmentRepo` + 中文
- Modify: `app/actions/timebox.ts:9-13,233-424` — **F4**：`ItineraryActionResult`→`AppointmentActionResult` + `{itinerary}`→`{appointment}` + `CreateItineraryInput`→`CreateAppointmentInput` + 5 server action 函数 + `ITINERARY_UPDATE_ALLOWED`→`APPOINTMENT_UPDATE_ALLOWED` + `itineraryId`→`appointmentId` + action 字符串 + `objectType` + 中文

**manifest（Task 7）：**
- Modify: `domains/timebox/manifest.yaml` — lifecycle key `itinerary`→`appointment` + field_metadata key + 4 intent_triggers + view_routes `viewItineraries`→`viewAppointments` + cnui_surfaces 3 key + 中文「行程」→「约定」
- Modify: `domains/manifest-loader/schema.ts:272-273` — 注释

**CNUI surfaces（Task 8，git mv + 双注册）：**
- Rename: `CreateItinerary.tsx`→`CreateAppointment.tsx` / `EditItinerary.tsx`→`EditAppointment.tsx` / `DeleteItinerary.tsx`→`DeleteAppointment.tsx` / `ItineraryFormFields.tsx`→`AppointmentFormFields.tsx`（`ItineraryDraftFields`→`AppointmentDraftFields`）
- Modify: `domains/timebox/cnui/handlers.ts` — action 字符串 + `ItineraryRepository`→`AppointmentRepository` + import + 中文
- Modify: `domains/timebox/index.ts:23-25,67-78` — 3 import + 3 client 注册

**components + pages + 路由（Task 9，git mv）：**
- Rename: `itinerary-workspace.tsx`→`appointment-workspace.tsx`（`ItineraryWorkspace`→`AppointmentWorkspace` + 中文）
- Rename: `itinerary-locked-card.tsx`→`appointment-locked-card.tsx`（`ItineraryLockedCard`→`AppointmentLockedCard`）
- Rename: `pages/ItineraryPage.tsx`→`pages/AppointmentPage.tsx`（`ItineraryPage`→`AppointmentPage`）
- Rename: `app/itineraries/page.tsx`→`app/appointments/page.tsx`
- Modify: `components/views/action-view.tsx:33,54` — import `AppointmentPage` + `viewAppointments`
- Modify: `components/timeboxes-event.ts` — **运行时 kind 判别**：`kind:'itinerary'`→`kind:'appointment'` + `itineraryToEvent`→`appointmentToEvent` + `mergeEvents` param `itineraries`→`appointments`
- Modify: `components/timebox-list.tsx` / `timebox-timeline.tsx` — kind consumer
- Modify: `components/timeboxes-workspace.tsx` — `getItinerariesByRange`→`getAppointmentsByRange` + `itineraryList`→`appointmentList`
- Modify: `lib/overlap-layout.ts` — 注释
- Modify: `rules-registry.ts` — `itineraryTitleRequired`→`appointmentTitleRequired` + `itineraryStartTimeInFuture`→`appointmentStartTimeInFuture` + 错误文案
- Modify: `hooks/use-intent-handler.ts:27,571-581` — import + action 判别 + `parseItineraryIntentOnly`→`parseAppointmentIntentOnly`
- Modify: `next.config.ts` — `redirects()` `/itineraries/:path*`→`/appointments/:path*` 308（F6）

**测试同步 + F1/T1 回归（Task 10）：**
- Rename: 12 个 itinerary 测试文件（清单见 Task 10）
- Modify: ~14 测试文件全局替换
- Create: `nexus/orchestrator/__tests__/resolveObjectType.regression.test.ts`（F1 + T1 回归）

**不改（明确排除）：**
- `intentions.capture_mode='scheduled'` / `tasks.capture_mode='scheduled'`（不同概念，P3）
- `mainViewState.type='schedule'`（PR1 OQ-1；C1 finding 已消解——本 PR2 后仍是孤儿字面量，无 Schedule 对象撞车；`bottom-nav.tsx:43 item.key === 'schedule'` 持久化未查，重命名需先调查，defer 独立 follow-up）

---

### Task 1: Tier 2 docs 先行（usom-design + database-design + F2 snapshot drift + 设计覆盖注）

**Files:**
- Modify: `docs/usom-design.md:957-1013,1238`
- Modify: `docs/database-design.md:141,826-871,1648-1655` + 新增 snapshot drift 段
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: 文档层 SSOT 更新（Tier 2 硬约束，解锁后续代码层 task）

- [ ] **Step 1: docs/usom-design.md §3.13 改名 + 设计覆盖注**

`docs/usom-design.md:957` `### 3.13 Itinerary（行程，[026]）` → `### 3.13 Appointment（约定，[026]，[023.05] PR2 重命名自 Itinerary；目标词自 schedule 覆盖为 appointment——schedule/日程计划与 timebox 语义撞车）`

L959-961 对象意图段：`Itinerary`→`Appointment`，「行程」→「约定」，`reconcileItineraryStatuses()`→`reconcileAppointmentStatuses()`。

L964 `interface Itinerary {` → `interface Appointment {`；L966 `ItineraryStatus`→`AppointmentStatus`；L982 `type ItineraryStatus =` → `type AppointmentStatus =`（值不变 P3）。

L1004 `Itinerary.startTime`→`Appointment.startTime`；L1009 段「Itinerary 不参与 AI 自动编排...scheduling-handler 只查 timeboxes。Itinerary 只在当日读时合并进 `/schedule`」→「Appointment 不参与 AI 自动编排...orchestration-handler 只查 timeboxes。Appointment 只在当日读时合并进 `/timeboxes`」（修 PR1 后路由笔误）。

L1013 [026] ship note：action/surface/component 名全改 appointment 系列；末尾追加 `[023.05] PR2（2026_07_05）：Itinerary→Appointment 全层重命名 + itineraries→appointments 表 + 0033 rename 迁移，中文「行程」→「约定」。目标词自 design 原 schedule 覆盖（eng-review 期用户识别 schedule/日程计划 与 timebox 撞车）。schedule 命名空间由 PR1 释放后留空，appointment 不占用。`

L1238 `timebox itinerary 与其它域同名字段` → `timebox appointment 与其它域同名字段`。

- [ ] **Step 2: docs/database-design.md 表清单 + DDL + 修索引漂 + F2 snapshot drift**

L141 `├── itineraries ← 行程（[026]...）` → `├── appointments ← 约定（[026]，[023.05] PR2 rename 自 itineraries，Cycle 模式 5 态存储 + 4 transition 时间戳）`

L826 `### 4.X itineraries（行程表，[026]）` → `### 4.X appointments（约定表，[026]，[023.05] PR2 rename）`

L836 `CREATE TABLE itineraries (` → `CREATE TABLE appointments (`（0031 建为 itineraries，0033 RENAME 为 appointments；doc 标最终态）

**修 doc 漂（L861-862）**，改为最终态：
```
CREATE INDEX idx_appointments_user_status_start ON appointments(user_id, status, start_time);
CREATE INDEX idx_appointments_user_status       ON appointments(user_id, status);
```

L871 [026] ship note：`ItineraryRepository`→`AppointmentRepository`，`reconcileAndAdvanceItineraries`→`reconcileAndAdvanceAppointments`，文件名 `reconcile-itinerary.ts`/`reconcile-itineraries.ts`→`reconcile-appointment.ts`/`reconcile-appointments.ts`；末尾追加 `[023.05] PR2（2026_07_05）：0033_rename_itineraries_to_appointments.sql（RENAME TABLE + 2 INDEX，journal idx=33）+ 全层重命名。`

L1648-1655 TZ reconcile 段：文件名/函数名 itinerary→appointment 系列。

**新增 F2 snapshot drift 段**（L871 后）：
```markdown
**[023.05] F2 snapshot drift acknowledge**：drizzle snapshot 停在 `0006_snapshot.json`，0007+ 全手写无 snapshot。本表 0033 RENAME 后 `schema.ts` 写 `pgTable('appointments')`，未来 `drizzle-kit generate` 会生成 `CREATE TABLE appointments`（表已存在）→ apply 失败。**决议**：维持手写迁移 convention，未来 appointments 表 schema 变更继续手写 SQL + 登记 journal；**不引入 `drizzle-kit up`**。
```

- [ ] **Step 3: CHANGELOG.md 加 [023.05-2] section（含设计覆盖说明）**

`CHANGELOG.md` 在 `[023.05-1]` 后加 `[023.05-2]` section（WIP 占位，含：目标词 schedule→appointment 覆盖决议 + 11 task 范围 + ship 时回填 commit/验证）。

- [ ] **Step 4: Commit**

```bash
cd /home/walker/lifeware
git add docs/usom-design.md docs/database-design.md CHANGELOG.md
git commit -m "docs(023.05): Tier 2 先行 — usom/database Itinerary→Appointment + 设计覆盖 + F2

[023.05] PR2 阶段 2 Task 1：Tier 2 docs 先行（硬约束）
- usom-design §3.13 Itinerary→Appointment + 设计覆盖注（schedule→appointment 因 timebox 撞车）
- database-design L141/826-871 表+DDL+索引（修 doc 漂 _status_）+ F2 snapshot drift
- L1648-1655 TZ reconcile 段 itinerary→appointment
- CHANGELOG [023.05-2] WIP 含设计覆盖说明

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: DB 层 — schema.ts + 0033 rename 迁移 + .down.sql + journal idx=33

**Files:**
- Modify: `src/lib/db/schema.ts:388-414`
- Create: `src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql`
- Create: `src/lib/db/migrations/0033_rename_itineraries_to_appointments.down.sql`
- Modify: `src/lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `appointments` pgTable const（供 Task 4 仓储 import）+ 0033 迁移

- [ ] **Step 1: schema.ts itineraries→appointments**

`src/lib/db/schema.ts:388-414` 当前 `export const itineraries = pgTable('itineraries', {...})` + 2 索引 `idx_itineraries_*`。改为：
```typescript
// ─── 4.7 appointments（[026] 约定，D2 reversal: 5 态存储 + 4 transition 时间戳；[023.05] PR2 rename 自 itineraries）──
export const appointments = pgTable('appointments', {
  // 列定义不变（id/userId/title/startTime/durationMin/people/status/4 transition 时间戳/createdAt/updatedAt）
  ...
  status: text('status', { enum: ['scheduled', 'in_progress', 'expired', 'cancelled', 'completed'] }).notNull().default('scheduled'),
  ...
}, (table) => [
  index('idx_appointments_user_status_start').on(table.userId, table.status, table.startTime),
  index('idx_appointments_user_status').on(table.userId, table.status),
])
```
**列名不变**，仅表 const 名 + 物理表名 + 索引名改。`status` enum 值 `'scheduled'` **保留**（P3）。注释「行程」→「约定」。`grep -n "itineraries" src/lib/db/schema.ts` 确认仅此块。

- [ ] **Step 2: 写 0033_rename_itineraries_to_appointments.sql**

创建 `src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql`：
```sql
-- [023.05] PR2: itineraries → appointments 重命名（表 + 2 索引）
-- 设计来源：~/.gstack/projects/walker2002-lifeware/walker-main-design-20260704-itinerary-rename.md §2.1（目标词 schedule→appointment 覆盖，eng-review 期用户决议）
-- OQ-1 决议：RENAME（保数据）；itineraries 无 FK 被引用，RENAME 安全。
-- 注意：ALTER ... RENAME TO 无 IF EXISTS，不可重跑；靠 __drizzle_migrations hash 一次性应用。

BEGIN;

ALTER TABLE itineraries RENAME TO appointments;
ALTER INDEX idx_itineraries_user_status_start RENAME TO idx_appointments_user_status_start;
ALTER INDEX idx_itineraries_user_status RENAME TO idx_appointments_user_status;

COMMIT;
```

- [ ] **Step 3: 写 0033_rename_itineraries_to_appointments.down.sql（F5）**

```sql
-- [023.05] PR2 rollback: appointments → itineraries 反向重命名（F5 codex Gap 4）
-- 注意：RENAME 无 IF EXISTS，不可重跑。

BEGIN;

ALTER TABLE appointments RENAME TO itineraries;
ALTER INDEX idx_appointments_user_status_start RENAME TO idx_itineraries_user_status_start;
ALTER INDEX idx_appointments_user_status RENAME TO idx_itineraries_user_status;

COMMIT;
```

- [ ] **Step 4: 登记 _journal.json idx=33**

`src/lib/db/migrations/meta/_journal.json` 在 idx=32 entry 后追加：
```json
    ,
    {
      "idx": 33,
      "version": "7",
      "when": 1783500000000,
      "tag": "0033_rename_itineraries_to_appointments",
      "breakpoints": false
    }
```
⚠️ **codex #6**：`when` 是占位时间戳。drizzle 不校验单调，但若多开发者在同 idx 撞车或 dev DB 已手动跑过同 idx，journal 会乱。ship 前 `date +%s%3N` 取真实毫秒替换；单开发线性历史下占位可接受。

- [ ] **Step 5: dev DB apply 0033 + 验证（A1 修正：dev 无 __drizzle_migrations，用 \dt）**

⚠️ **A1 finding（实测）**：dev DB **无** `__drizzle_migrations` 表（团队约定 dev 直跑 psql 不记 hash）。**不要查** `__drizzle_migrations`（会报 `relation does not exist`）。prod 才有 `drizzle.__drizzle_migrations`（schema 前缀，drizzle-kit 管）。

```bash
cd /home/walker/lifeware/frontend
# dev = psql 直跑（无 hash 跟踪）
psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql
# dev 验证（用 \dt/\di，不查 __drizzle_migrations）
psql "$DATABASE_URL" -c "\dt appointments"                                # 表存在
psql "$DATABASE_URL" -c "\d appointments"                                  # 列结构
psql "$DATABASE_URL" -c "SELECT count(*) FROM appointments;"               # OQ-1 row count 留证
psql "$DATABASE_URL" -c "\di idx_appointments_user_status_start"
psql "$DATABASE_URL" -c "\di idx_appointments_user_status"
```
Expected: `appointments` 表 + 2 索引存在。`$DATABASE_URL` 从 `.env.local` 取（`lifeware_dev@localhost:5432`）。

⚠️ **codex #8（dev 重跑非幂等）**：`psql -f 0033...sql` 在 `appointments` 表已存在时重跑会 ERROR（RENAME 无 IF EXISTS）。iterative dev 重跑前先跑 down（`psql -f 0033...down.sql` 回 itineraries）再正向，或加守护：
```bash
psql "$DATABASE_URL" -tAc "SELECT to_regclass('appointments');" | grep -q appointments \
  && echo "appointments 已存在，跳过 0033（先跑 .down.sql 若需重跑）" \
  || psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql
```

prod 机制（Task 11 Step 10 ship 时）：`./prod.sh --migrate` 走 drizzle-kit migrate，读 `_journal.json` idx=33 应用 + 在 `drizzle.__drizzle_migrations` 登记 hash。

- [ ] **Step 6: 验 down migration rollback（F5）**

```bash
psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.down.sql
psql "$DATABASE_URL" -c "\dt itineraries"   # 回到 itineraries
psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql  # 恢复 appointments 终态
psql "$DATABASE_URL" -c "\dt appointments"
```
Expected: down 跑通回 itineraries，正向回 appointments（SQL 语法验证；dev 手动验证后保持 appointments 终态）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql src/lib/db/migrations/0033_rename_itineraries_to_appointments.down.sql src/lib/db/migrations/meta/_journal.json
git commit -m "refactor(023.05): DB itineraries→appointments + 0033 rename 迁移 + F5 down + A1 dev 机制

[023.05] PR2 阶段 2 Task 2：DB 层
- schema.ts itineraries→appointments pgTable + 2 索引（列名/enum scheduled 保留 P3）
- 0033_rename_itineraries_to_appointments.sql（RENAME TABLE + 2 INDEX）
- 0033.down.sql（F5 反向 RENAME）
- _journal.json idx=33
- A1：dev 验证用 \\dt（dev 无 __drizzle_migrations），prod 走 drizzle-kit via ./prod.sh --migrate

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: USOM 类型层 — Itinerary*→Appointment*

**Files:**
- Modify: `src/usom/types/objects.ts:626-652`
- Modify: `src/usom/types/summaries.ts:53-64`
- Modify: `src/usom/types/primitives.ts:240`
- Modify: `src/usom/types/process.ts:215`

**Interfaces:**
- Produces: `Appointment` / `AppointmentStatus` / `AppointmentSummary` + 6 个 `Appointment*` event（供 Task 4-9 import）

- [ ] **Step 1: objects.ts Itinerary→Appointment**

`src/usom/types/objects.ts:626` `export interface Itinerary {` → `export interface Appointment {`。L628 `status: ItineraryStatus`→`status: AppointmentStatus`。注释段「行程—— 未来日历...」→「约定—— 未来日历...」+ 标识符 + `reconcileItineraryStatuses()`→`reconcileAppointmentStatuses()` + 「读时合并进当日时间盒视图作"锁定时间格"」。

- [ ] **Step 2: summaries.ts ItinerarySummary→AppointmentSummary**

`src/usom/types/summaries.ts:53` `export interface ItinerarySummary {` → `export interface AppointmentSummary {`。L57 `ItineraryStatus`→`AppointmentStatus`。注释「行程摘要」→「约定摘要」+ `<ItineraryFormFields>`→`<AppointmentFormFields>`。

- [ ] **Step 3: primitives.ts ItineraryStatus→AppointmentStatus**

`src/usom/types/primitives.ts:240` `export type ItineraryStatus = ...` → `export type AppointmentStatus = ...`（**值不变** P3）。注释「行程状态」→「约定状态」。

- [ ] **Step 4: process.ts 6 个 event**

`src/usom/types/process.ts:215` SystemEventType union：`'ItineraryCreated'|'ItineraryMarkedInProgress'|'ItineraryMarkedExpired'|'ItineraryCancelled'|'ItineraryFieldUpdated'|'ItineraryCompleted'` → `'AppointmentCreated'|'AppointmentMarkedInProgress'|'AppointmentMarkedExpired'|'AppointmentCancelled'|'AppointmentFieldUpdated'|'AppointmentCompleted'`。`grep -n "Itinerary" src/usom/types/process.ts` 确认无残留。

- [ ] **Step 5: grep 守护 + Commit**

```bash
grep -rnE "Itinerary|ItineraryStatus|ItinerarySummary" src/usom/types/
```
Expected: 空。

```bash
git add src/usom/types/objects.ts src/usom/types/summaries.ts src/usom/types/primitives.ts src/usom/types/process.ts
git commit -m "refactor(023.05): USOM Itinerary*→Appointment* 类型层

[023.05] PR2 阶段 2 Task 3：USOM 类型
- objects.ts Itinerary→Appointment interface
- summaries.ts ItinerarySummary→AppointmentSummary
- primitives.ts ItineraryStatus→AppointmentStatus（enum 值 scheduled 保留 P3）
- process.ts 6 个 Itinerary* event→Appointment*

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 数据 + reconcile 仓储层 — repository/mapper/adapter/mutation-service/reconcile

**Files:**
- Rename: `repository/itinerary.ts` → `appointment.ts` / `repository/mappers/itinerary.ts` → `appointment.ts` / `status/reconcile-itinerary.ts` → `reconcile-appointment.ts` / `app/actions/reconcile-itineraries.ts` → `reconcile-appointments.ts`
- Modify: `repository/index.ts` / `repository/generic-repo-adapter.ts` / `app/actions/timebox/mutation-service.ts`

**Interfaces:**
- Consumes: Task 2 `appointments` pgTable + Task 3 `Appointment`/`AppointmentStatus`/`AppointmentSummary`
- Produces: `AppointmentRepository` + `reconcileAppointmentStatuses` + `reconcileAndAdvanceAppointments` + `createAppointmentMutationService`

- [ ] **Step 1: git mv 4 文件**

```bash
cd /home/walker/lifeware/frontend
git mv src/domains/timebox/repository/itinerary.ts src/domains/timebox/repository/appointment.ts
git mv src/domains/timebox/repository/mappers/itinerary.ts src/domains/timebox/repository/mappers/appointment.ts
git mv src/domains/timebox/status/reconcile-itinerary.ts src/domains/timebox/status/reconcile-appointment.ts
git mv src/app/actions/reconcile-itineraries.ts src/app/actions/reconcile-appointments.ts
```

- [ ] **Step 2: repository/appointment.ts 内部**

`src/domains/timebox/repository/appointment.ts`：
- @file 头 `itinerary`→`appointment` + 「行程」→「约定」
- `import { itineraries } from '@/lib/db/schema'` → `import { appointments } from '@/lib/db/schema'`
- `import type { Itinerary }` → `import type { Appointment }`；`ItineraryStatus`→`AppointmentStatus`
- `export class ItineraryRepository` → `export class AppointmentRepository`
- 全文 `itineraries`(schema const)→`appointments`；`Itinerary`→`Appointment`；`ItineraryStatus`→`AppointmentStatus`
- mapper import 路径 `./mappers/itinerary`→`./mappers/appointment`

```bash
grep -nE "itineraries|Itinerary|itinerary|行程" src/domains/timebox/repository/appointment.ts
```

- [ ] **Step 3: repository/mappers/appointment.ts 内部**

同 Step 2 模式：schema const `itineraries`→`appointments`、类型 `Itinerary`/`ItineraryStatus`→`Appointment*`、mapper 函数名 `mapItinerary*`→`mapAppointment*`、中文。

- [ ] **Step 4: repository/index.ts barrel**

`export { ItineraryRepository } from './itinerary'` → `export { AppointmentRepository } from './appointment'`（grep 确认 export 形态）。

- [ ] **Step 5: generic-repo-adapter.ts**

`src/domains/timebox/repository/generic-repo-adapter.ts`：
- L19 `@property itineraryRepo` → `@property appointmentRepo`
- L72 注释「行程独立 GenericRepo 键」→「约定独立 GenericRepo 键」
- `itineraryRepo:` 字段名 → `appointmentRepo:`（类型声明 + 构造赋值全文）
- L86 `status: 'scheduled'` **保留**（P3）
- L95 `throw new Error('行程不存在')` → `throw new Error('约定不存在')`
- `import { ItineraryRepository }`→`import { AppointmentRepository }`；`new ItineraryRepository()`→`new AppointmentRepository()`

```bash
grep -nE "itinerary|Itinerary|行程" src/domains/timebox/repository/generic-repo-adapter.ts
```

- [ ] **Step 6: mutation-service.ts**

`src/app/actions/timebox/mutation-service.ts`：
- @file 头 L3-7 注释 `[026] 行程`→「[026] 约定」+ `ItineraryFieldUpdated`→`AppointmentFieldUpdated` + `createItineraryMutationService`→`createAppointmentMutationService`
- L17 `import { TimeboxRepository, ItineraryRepository }` → `... AppointmentRepository`
- L28 `itineraryRepo: new ItineraryRepository() as any` → `appointmentRepo: new AppointmentRepository() as any`（createTimeboxMutationService 内）
- L44 `export function createItineraryMutationService` → `createAppointmentMutationService`
- L46 `itineraryRepo:`→`appointmentRepo:` + `new AppointmentRepository()`
- L52 `fieldUpdatedEventType: 'ItineraryFieldUpdated'` → `'AppointmentFieldUpdated'`
- L53 `repoLabel: 'Itinerary'` → `'Appointment'`

```bash
grep -nE "itinerary|Itinerary|行程" src/app/actions/timebox/mutation-service.ts
```

- [ ] **Step 7: status/reconcile-appointment.ts**

`src/domains/timebox/status/reconcile-appointment.ts`：
- @file 头 + 注释「行程」→「约定」
- `import type { Itinerary }`→`{ Appointment }`；`ItineraryStatus`→`AppointmentStatus`
- `export function reconcileItineraryStatuses` → `reconcileAppointmentStatuses`
- 全文 `Itinerary`→`Appointment`、`ItineraryStatus`→`AppointmentStatus`、内部 `itinerary` 参数→`appointment`
- ⚠️ 行动对象字段名 `itineraryId`→`appointmentId`（跨文件契约，reconcile-appointments.ts Step 8 消费）

```bash
grep -nE "itinerary|Itinerary|行程" src/domains/timebox/status/reconcile-appointment.ts
```

- [ ] **Step 8: app/actions/reconcile-appointments.ts**

`src/app/actions/reconcile-appointments.ts`：
- @file 头 `reconcile-itineraries`→`reconcile-appointments` + 「行程」→「约定」
- L35 `import { ItineraryRepository } from '@/domains/timebox/repository/itinerary'` → `import { AppointmentRepository } from '@/domains/timebox/repository/appointment'`
- L36 `import { reconcileItineraryStatuses } from '@/domains/timebox/status/reconcile-itinerary'` → `import { reconcileAppointmentStatuses } from '@/domains/timebox/status/reconcile-appointment'`
- L37 `import { createItineraryMutationService }` → `createAppointmentMutationService`
- L40 `export async function reconcileAndAdvanceItineraries` → `reconcileAndAdvanceAppointments`
- L43 `new ItineraryRepository()`→`new AppointmentRepository()`
- L46 `reconcileItineraryStatuses(...)`→`reconcileAppointmentStatuses(...)`
- L48 `createItineraryMutationService()`→`createAppointmentMutationService()`
- L60 `objectType: 'itinerary'`→`'appointment'`
- L61-62 `act.itineraryId`→`act.appointmentId`（与 Step 7 契约同步）

```bash
grep -nE "itinerary|Itinerary|行程" src/app/actions/reconcile-appointments.ts
```

- [ ] **Step 9: grep 守护 + Commit**

```bash
grep -rnE "ItineraryRepository|ItineraryStatus|reconcileItinerary|createItineraryMutationService|ItineraryFieldUpdated|reconcileAndAdvanceItineraries" src/domains/timebox/repository src/domains/timebox/status src/app/actions/timebox/mutation-service.ts src/app/actions/reconcile-appointments.ts
```
Expected: 空。

```bash
git add src/domains/timebox/repository/ src/domains/timebox/status/reconcile-appointment.ts src/app/actions/timebox/mutation-service.ts src/app/actions/reconcile-appointments.ts
git commit -m "refactor(023.05): 仓储+reconcile 层 itinerary→appointment

[023.05] PR2 阶段 2 Task 4：数据 + reconcile 仓储层
- repository/itinerary.ts→appointment.ts (ItineraryRepository→AppointmentRepository)
- mappers/itinerary.ts→appointment.ts
- generic-repo-adapter: itineraryRepo→appointmentRepo + objectType appointment
- mutation-service: createAppointmentMutationService + AppointmentFieldUpdated
- status/reconcile-itinerary.ts→reconcile-appointment.ts
- app/actions/reconcile-itineraries.ts→reconcile-appointments.ts
- 契约: reconcile 行动对象 itineraryId→appointmentId 同步

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: nexus 层 — ai-parser + rule-engine + factory

**Files:**
- Modify: `nexus/core/intent-engine/ai-parser.ts:520-687`
- Modify: `nexus/core/rule-engine/rules/timebox.ts:53,67-95`
- Modify: `nexus/domain-mutation-service/factory.ts:71,75`

**Interfaces:**
- Consumes: Task 3 `Appointment*` 类型
- Produces: `parseAppointmentWithAI` + `APPOINTMENT_PARSE_PROMPT` + `AppointmentParseResult` + `isAppointmentIntent`

- [ ] **Step 1: ai-parser.ts 改名 5 标识符 + action 字符串（F3）**

`src/nexus/core/intent-engine/ai-parser.ts`：
- L520 `const ITINERARY_PARSE_PROMPT` → `const APPOINTMENT_PARSE_PROMPT`（prompt 内中文「行程」→「约定」）
- L612 `export interface ItineraryDraft` → `AppointmentDraft`
- L619 `export interface ItineraryParseResult` → `AppointmentParseResult`；内 `drafts: ItineraryDraft[]`→`AppointmentDraft[]`
- L625 `interface LLMItineraryResponse` → `LLMAppointmentResponse`
- L635 `export async function parseItineraryWithAI` → `parseAppointmentWithAI`；返回 `Promise<ItineraryParseResult>`→`Promise<AppointmentParseResult>`
- L642 `action: 'parseItineraryIntent'` → `'parseAppointmentIntent'`
- L643 `systemPrompt: ITINERARY_PARSE_PROMPT(...)` → `APPOINTMENT_PARSE_PROMPT(...)`
- 函数体内 `LLMItineraryResponse`/`ItineraryDraft` → `LLMAppointmentResponse`/`AppointmentDraft`

⚠️ **codex #3（LLM prompt 不能盲改）**：`APPOINTMENT_PARSE_PROMPT`（ai-parser.ts:521-604）原围绕「行程」语义构建（"你是 Lifeware 行程意图解析器"、"行程分隔符"、"与行程常用时长对齐"）。机械替换「行程」→「约定」后部分短语读着别扭：
  - "约定分隔符"——分隔符配 约定 怪（约定不像 行程/日程 那样是批量可分割概念）
  - "与约定常用时长对齐"——约定 没有「常用时长」的口语感
  - "无关输入"置信度启发式可能需重调（prompt examples 原按 行程 校准）
  本 step 之外**加一个 prompt review 子步**：替换后通读 prompt 全文，对上述别扭短语手动改写（如 "约定分隔符"→"多条约定之间用分隔符"，"与约定常用时长对齐"→"与常见约定时长对齐"），并确认 example（看牙医/约饭/回访）仍贴合「约定」语义。[→EVAL] 可选：若有 eval suite，跑一遍确认解析质量不回归。

```bash
grep -nE "ITINERARY_PARSE_PROMPT|ItineraryDraft|ItineraryParseResult|LLMItineraryResponse|parseItineraryWithAI|parseItineraryIntent" src/nexus/core/intent-engine/ai-parser.ts
```

- [ ] **Step 2: rule-engine/rules/timebox.ts isItineraryIntent→isAppointmentIntent**

⚠️ L88 `intent.action.includes('Itinerary')` 是 itinerary 域分派判别。本 PR2 后 action 全改 appointment（`createAppointment` 等），判别改 `includes('Appointment')`。**确认 PR1 后 timebox action 不含 'Appointment' 子串**（timebox action 仅含 'Timebox'，安全）。

`src/nexus/core/rule-engine/rules/timebox.ts`：
- L53 action 白名单 `'cancelItinerary', 'startItinerary', 'completeItinerary', 'expireItinerary'` → `'cancelAppointment', 'startAppointment', 'completeAppointment', 'expireAppointment'`
- L67-95 注释「itinerary 域」「action 名含 "Itinerary"」「isItineraryIntent」→ schedule→appointment 系列
- L87 `function isItineraryIntent(intent)` → `function isAppointmentIntent(intent)`
- L88 `intent.action.includes('Itinerary')` → `intent.action.includes('Appointment')`
- 注释「行程」→「约定」

```bash
grep -nE "itinerary|Itinerary|行程" src/nexus/core/rule-engine/rules/timebox.ts
```

- [ ] **Step 3: factory.ts 注释**

`src/nexus/domain-mutation-service/factory.ts:71,75`：注释 `objectType（... itinerary）` → `... appointment`。

- [ ] **Step 4: grep 守护 + Commit**

```bash
grep -rnE "ITINERARY_PARSE_PROMPT|parseItineraryWithAI|ItineraryParseResult|isItineraryIntent|includes\('Itinerary'\)" src/nexus/
```
Expected: 空。

```bash
git add src/nexus/core/intent-engine/ai-parser.ts src/nexus/core/rule-engine/rules/timebox.ts src/nexus/domain-mutation-service/factory.ts
git commit -m "refactor(023.05): nexus 层 itinerary→appointment

[023.05] PR2 阶段 2 Task 5：nexus 层
- ai-parser: APPOINTMENT_PARSE_PROMPT + AppointmentDraft + AppointmentParseResult
  + LLMScheduleResponse→LLMAppointmentResponse + parseAppointmentWithAI + action parseAppointmentIntent (F3)
- rule-engine/rules/timebox: isItineraryIntent→isAppointmentIntent
  + includes('Appointment') + action 白名单 cancelAppointment/startAppointment/...
- factory: 注释 objectType 示例

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: server actions — intent.ts + timebox.ts（F4 response contract）

**Files:**
- Modify: `app/actions/intent.ts:11,16,26,301,553,816-858,1251-1290`
- Modify: `app/actions/timebox.ts:9-13,19,233-424`

**Interfaces:**
- Consumes: Task 4 `AppointmentRepository`/`createAppointmentMutationService` + Task 5 `parseAppointmentWithAI`/`AppointmentParseIntentResult` + Task 3 `Appointment`/`AppointmentSummary`
- Produces: `getAppointmentsByRange` + `parseAppointmentIntentOnly` + `AppointmentActionResult`（**F4**：`{appointment}` key）+ 5 server action

- [ ] **Step 1: intent.ts imports + reconcile 装配**

`src/app/actions/intent.ts`：
- L11 `import type { TimeboxSummary, ItinerarySummary }` → `... AppointmentSummary`
- L16 `import { TimeboxRepository, ItineraryRepository }` → `... AppointmentRepository`
- L26 `import { parseHabitWithAI, parseMultiTask, parseItineraryWithAI }` → `... parseAppointmentWithAI`
- L301, L553 `itineraryRepo: new ItineraryRepository() as any` → `appointmentRepo: new AppointmentRepository() as any`

- [ ] **Step 2: intent.ts getItinerariesByRange→getAppointmentsByRange**

`src/app/actions/intent.ts:816-858`：
- L816 注释 `Itinerary Read Action`→`Appointment Read Action`
- L819-829 注释「行程摘要」「reconcileItineraryStatuses」「/itineraries」「reconcileAndAdvanceItineraries」→「约定」「reconcileAppointmentStatuses」「/appointments」「reconcileAndAdvanceAppointments」
- L837 `export async function getItinerariesByRange` → `getAppointmentsByRange`；返回 `Promise<ItinerarySummary[]>`→`Promise<AppointmentSummary[]>`
- L841 `new ItineraryRepository()`→`new AppointmentRepository()`

- [ ] **Step 3: intent.ts parseItineraryIntentOnly→parseAppointmentIntentOnly + AppointmentParseIntentResult**

`src/app/actions/intent.ts:1251-1290`：
- L1251 注释 `Itinerary 意图仅解析`→`Appointment 意图仅解析`
- L1259 注释 `use-intent-handler.ts:createItinerary/editItinerary/deleteItinerary`→`createAppointment/editAppointment/deleteAppointment`
- L1272 `export interface ItineraryParseIntentResult` → `AppointmentParseIntentResult`
- L1278 `export async function parseItineraryIntentOnly` → `parseAppointmentIntentOnly`；返回 `Promise<ItineraryParseIntentResult>`→`Promise<AppointmentParseIntentResult>`
- L1281 `parseItineraryWithAI`→`parseAppointmentWithAI`
- L1284 `'未识别到有效的行程'` → `'未识别到有效的约定'`
- 内部 `ItineraryDraft`/`ItineraryParseResult` → `AppointmentDraft`/`AppointmentParseResult`

```bash
grep -nE "itinerary|Itinerary|行程" src/app/actions/intent.ts
```

- [ ] **Step 4: timebox.ts 文件头 + imports**

`src/app/actions/timebox.ts:9-19`：@file 头注释 itinerary server actions 全改 appointment 系列 + 「行程」→「约定」。L19 `import { createTimeboxMutationService, createItineraryMutationService }` → `... createAppointmentMutationService`；`import { TimeboxRepository, ItineraryRepository }` → `... AppointmentRepository`。

- [ ] **Step 5: timebox.ts F4 response contract（关键）**

`src/app/actions/timebox.ts:235-238`：
```typescript
export type ScheduleActionResult = ... // 原计划是 Schedule，覆盖为 Appointment
```
⚠️ 本 PR2 目标词是 **appointment**（不是 schedule——design 覆盖）。改为：
```typescript
export type AppointmentActionResult =
  | { status: 'ok'; appointment: Appointment }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }
```
⚠️ **property key `itinerary`→`appointment` 是 contract 改变**（F4），所有 `result.itinerary` destructure 调用方 break（tsc catch，Task 9 修 components）。

L240-247 `export interface CreateItineraryInput` → `CreateAppointmentInput`。

- [ ] **Step 6: timebox.ts 5 server action 函数**

`src/app/actions/timebox.ts:249-424` 全段：
- L256 `createItinerary(input: CreateItineraryInput, confirmed?): Promise<ItineraryActionResult>` → `createAppointment(input: CreateAppointmentInput, confirmed?): Promise<AppointmentActionResult>`
- L267 `submitDynamicIntent('timebox', 'createItinerary', ...)` → `'createAppointment'`
- L273 `confirmAction: 'createItinerary'` → `'createAppointment'`
- L277 `'创建行程失败'` → `'创建约定失败'`
- L279 `{ status: 'ok', itinerary: result.object as Itinerary }` → `{ status: 'ok', appointment: result.object as Appointment }`
- L293 `updateItinerary(itineraryId, patch): Promise<ItineraryActionResult>` → `updateAppointment(appointmentId, patch): Promise<AppointmentActionResult>`
- L304 `ITINERARY_UPDATE_ALLOWED` → `APPOINTMENT_UPDATE_ALLOWED`（白名单值不变）；L305-309 引用同步
- L314 `new ItineraryRepository().findById(itineraryId, ...)` → `new AppointmentRepository().findById(appointmentId, ...)`
- L315 `throw new Error(\`Itinerary ${itineraryId} not found\`)` → `\`Appointment ${appointmentId} not found\``
- L316 `{ status: 'ok', itinerary: it }` → `{ status: 'ok', appointment: it }`
- L320 `createItineraryMutationService()` → `createAppointmentMutationService()`
- L325 `objectType: 'itinerary'` → `'appointment'`
- L326 `targetId: itineraryId` → `targetId: appointmentId`
- L331 `'更新行程失败'` → `'更新约定失败'`
- L337 `{ status: 'ok', itinerary: res.object as Itinerary }` → `{ status: 'ok', appointment: res.object as Appointment }`
- L338 `'更新行程失败：...'` → `'更新约定失败：...'`
- L355 `deleteItinerary(itineraryId, confirmed?)` → `deleteAppointment(appointmentId, confirmed?)`
- L362 `submitDynamicIntent('timebox', 'cancelItinerary', { objectId: itineraryId }, confirmed)` → `'cancelAppointment', { objectId: appointmentId }`
- L368 `confirmAction: 'cancelItinerary'`→`'cancelAppointment'`；`{ objectId: itineraryId }`→`{ objectId: appointmentId }`
- L372 `'删除行程失败'`→`'删除约定失败'`
- L374 `{ status: 'ok', itinerary: result.object as Itinerary }` → `{ status: 'ok', appointment: result.object as Appointment }`
- L390 `markInProgressItinerary(itineraryId, at)` → `markInProgressAppointment(appointmentId, at)`；L391 `itineraryId`→`appointmentId`；L396 `'markInProgressItinerary'`→`'markInProgressAppointment'`；`{ objectId: itineraryId, at }`→`{ objectId: appointmentId, at }`
- L413 `markExpiredItinerary(itineraryId, at)` → `markExpiredAppointment(appointmentId, at)`；同步
- 全段注释「行程」「Itinerary」「itinerary」→「约定」「Appointment」「appointment」
- ⚠️ L342-353 deleteItinerary 注释段提 `[026] C1 修复` + `resolveObjectType('timebox', 'cancelItinerary')` + 「action 含 "Itinerary"」→ 改为 `'cancelAppointment'` + 「含 "Appointment"」（保留 [026] C1 历史说明，仅更新标识符）

```bash
grep -nE "itinerary|Itinerary|行程" src/app/actions/timebox.ts
```
Expected: 空（含注释）。

- [ ] **Step 7: grep 守护 + Commit**

```bash
grep -rnE "ItineraryActionResult|createItinerary|updateItinerary|deleteItinerary|markInProgressItinerary|markExpiredItinerary|getItinerariesByRange|parseItineraryIntentOnly|ItineraryParseIntentResult" src/app/actions/
```
Expected: 空。

```bash
git add src/app/actions/intent.ts src/app/actions/timebox.ts
git commit -m "refactor(023.05): server actions itinerary→appointment + F4 response contract

[023.05] PR2 阶段 2 Task 6：server actions
- intent.ts: getAppointmentsByRange + parseAppointmentIntentOnly + AppointmentParseIntentResult + imports
- timebox.ts: F4 contract {itinerary}→{appointment} + AppointmentActionResult + 5 action
  (createAppointment/updateAppointment/deleteAppointment/markInProgressAppointment/markExpiredAppointment)
  + appointmentId + APPOINTMENT_UPDATE_ALLOWED + action 字符串
- 中文 行程→约定

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: manifest.yaml itinerary→appointment + 中文「行程」→「约定」

**Files:**
- Modify: `src/domains/timebox/manifest.yaml`
- Modify: `src/domains/manifest-loader/schema.ts:272-273`

**Interfaces:**
- Produces: `lifecycle.appointment` + `field_metadata.appointment` + 4 action + 3 cnui_surface key + view_routes `viewAppointments`
- ⚠️ **validate:manifest 此 task 后报 K-component ERROR**（3 surface key 改但 surface 文件 Task 8 才 git mv），预期，Task 8 完成后消除。

- [ ] **Step 1: lifecycle key itinerary→appointment（L182）**

`src/domains/timebox/manifest.yaml` L182 块：`itinerary:` → `appointment:`；transitions 全部 event_type `Itinerary*`→`Appointment*`（`AppointmentCreated`/`AppointmentMarkedInProgress`/`AppointmentMarkedExpired`/`AppointmentCancelled`/`AppointmentCompleted`）。**states 值 `scheduled` 保留**（P3）。块前注释「行程=独立对象...」→「约定=独立对象...」。

```bash
sed -n '180,230p' src/domains/timebox/manifest.yaml | grep event_type
```
全部 Itinerary* → Appointment*。

- [ ] **Step 2: field_metadata key（L278）**

L278 `itinerary:` → `appointment:`（字段名 title/startTime/...不变）。

- [ ] **Step 3: 4 intent_triggers（L104-136）**

- `action: createItinerary` → `createAppointment`；`shortcut: /createItinerary` → `/createAppointment`；`description: 增加一个未来行程` → `增加一个未来约定`；`cnui_surface: create-itinerary` → `create-appointment`；`keywords: [行程, 安排, 约会, 日历]` → `[约定, 安排, 约会, 日历]`
- `editItinerary` → `editAppointment`；shortcut/description/cnui_surface 同步；「行程」→「约定」
- `deleteItinerary` → `deleteAppointment`；同上
- `viewItineraries` → `viewAppointments`（OQ-2 复数）；shortcut `/itineraries`→`/appointments`；description「行程管理」→「约定管理」；`view_route: /itineraries`→`/appointments`

块前注释「行程管理 4 action」→「约定管理 4 action」。

- [ ] **Step 4: view_routes（L372-374）**

```yaml
viewAppointments:
  component: app/appointments/page
  url: /appointments
```

- [ ] **Step 5: cnui_surfaces 3 key（L445-453）**

`create-itinerary`→`create-appointment`（description「增加行程」→「增加约定」）；`edit-itinerary`→`edit-appointment`；`delete-itinerary`→`delete-appointment`。块前注释同步。

- [ ] **Step 6: manifest-loader/schema.ts 注释**

`src/domains/manifest-loader/schema.ts:272-273` 注释 `objectType（... itinerary）`→`... appointment`；`timebox itinerary`→`timebox appointment`。

- [ ] **Step 7: validate:manifest（预期 K-component ERROR）**

```bash
cd /home/walker/lifeware/frontend && npm run validate:manifest
```
Expected: 报 3 个 K-component ERROR（`create-appointment`/`edit-appointment`/`delete-appointment` 找不到 `CreateAppointment.tsx` 等——Task 8 才 git mv）。记下来，Task 8 完成后重跑清零。其它（lifecycle/field_metadata/action 名）应 0 error。

- [ ] **Step 8: Commit**

```bash
git add src/domains/timebox/manifest.yaml src/domains/manifest-loader/schema.ts
git commit -m "refactor(023.05): manifest itinerary→appointment + 行程→约定

[023.05] PR2 阶段 2 Task 7：manifest
- lifecycle.itinerary→appointment + event_type Itinerary*→Appointment*（scheduled 值保留 P3）
- field_metadata.itinerary→appointment
- 4 intent_triggers: createAppointment/editAppointment/deleteAppointment/viewAppointments + shortcut
- cnui_surfaces: create-appointment/edit-appointment/delete-appointment（K-component 待 Task 8）
- view_routes viewAppointments→/appointments
- 中文 行程→约定

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: CNUI surfaces git mv + form fields + handlers + 双注册

**Files:**
- Rename: `CreateItinerary.tsx`→`CreateAppointment.tsx` / `EditItinerary.tsx`→`EditAppointment.tsx` / `DeleteItinerary.tsx`→`DeleteAppointment.tsx` / `ItineraryFormFields.tsx`→`AppointmentFormFields.tsx`
- Modify: `cnui/handlers.ts` / `domains/timebox/index.ts`

**Interfaces:**
- Consumes: Task 3 `Appointment`/`AppointmentDraftFields` + Task 6 server actions + Task 7 manifest cnui_surface key
- Produces: 4 appointment surface + 双注册闭合

- [ ] **Step 1: git mv 4 surface**

```bash
cd /home/walker/lifeware/frontend
git mv src/domains/timebox/cnui/surfaces/CreateItinerary.tsx src/domains/timebox/cnui/surfaces/CreateAppointment.tsx
git mv src/domains/timebox/cnui/surfaces/EditItinerary.tsx src/domains/timebox/cnui/surfaces/EditAppointment.tsx
git mv src/domains/timebox/cnui/surfaces/DeleteItinerary.tsx src/domains/timebox/cnui/surfaces/DeleteAppointment.tsx
git mv src/domains/timebox/cnui/surfaces/ItineraryFormFields.tsx src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx
```

- [ ] **Step 2: AppointmentFormFields.tsx 内部**

`src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`：@file 头「行程 4 字段共享表单组件」→「约定 4 字段」；L25 `export interface ItineraryDraftFields`→`AppointmentDraftFields`；L45 `export function ItineraryFormFields`→`AppointmentFormFields`；注释「行程」→「约定」。

- [ ] **Step 3-5: Create/Edit/DeleteAppointment.tsx 内部**

每文件：import `AppointmentFormFields`/`AppointmentDraftFields`；Props interface `*ItineraryProps`→`*AppointmentProps`；`export function Create/Edit/DeleteItinerary`→`Appointment`；JSX `ItineraryFormFields`→`AppointmentFormFields`；类型 `ExistingItinerary`→`ExistingAppointment`；中文「行程」→「约定」。

- [ ] **Step 6: cnui/handlers.ts action 字符串 + import + 类型**

`src/domains/timebox/cnui/handlers.ts`：
- L233 `action === 'createItinerary'`→`'createAppointment'`
- L245, L257, L269 `new ItineraryRepository()`→`new AppointmentRepository()`
- L255 `action === 'editItinerary'`→`'editAppointment'`
- L267 `action === 'deleteItinerary'`→`'deleteAppointment'`
- L507-508 注释 action 名→appointment 系列
- L511 `action === 'createItinerary'`→`'createAppointment'`
- L518 `submitDynamicIntent('timebox', 'createItinerary')`→`'createAppointment'`
- L538 `action === 'editItinerary'`→`'editAppointment'`
- L539 注释 `ItineraryDraftFields`→`AppointmentDraftFields`
- L545 `const { updateItinerary } = await import(...)`→`updateAppointment`；L547 调用
- L560 `const { deleteItinerary }`→`deleteAppointment`；调用
- 注释/中文「行程」→「约定」；`ItinerarySummary`/`Itinerary`→`Appointment*`

```bash
grep -nE "createItinerary|editItinerary|deleteItinerary|updateItinerary|ItineraryRepository|ItineraryDraftFields|ItinerarySummary|行程" src/domains/timebox/cnui/handlers.ts
```

- [ ] **Step 7: domain index.ts 双注册**

`src/domains/timebox/index.ts`：
- L23-25 import `CreateAppointment`/`EditAppointment`/`DeleteAppointment` from `./cnui/surfaces/*Appointment`
- L67-78 `cnuiRegistry.register('timebox', 'create-appointment', { component: CreateAppointment, ... })` 等 3 处

- [ ] **Step 8: validate:manifest 清零 + grep 守护**

```bash
npm run validate:manifest
```
Expected: `0 errors`（3 K-component ERROR 消除）。

```bash
grep -rnE "CreateItinerary|EditItinerary|DeleteItinerary|ItineraryFormFields|ItineraryDraftFields|'create-itinerary'|'edit-itinerary'|'delete-itinerary'" src/domains/timebox/cnui/ src/domains/timebox/index.ts
```
Expected: 空。

- [ ] **Step 9: Commit**

```bash
git add src/domains/timebox/cnui/ src/domains/timebox/index.ts
git commit -m "refactor(023.05): CNUI surfaces itinerary→appointment + 双注册闭合

[023.05] PR2 阶段 2 Task 8：CNUI surfaces
- git mv 4 surface: CreateAppointment/EditAppointment/DeleteAppointment/AppointmentFormFields
- AppointmentDraftFields + Props + export 改名
- cnui/handlers: action createAppointment/editAppointment/deleteAppointment + updateAppointment/deleteAppointment import
- index.ts 双注册 3 surface
- validate:manifest 0 errors

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: components + pages + 路由 + event kind 判别 + redirect（F6）+ use-intent-handler

**Files:**
- Rename: `itinerary-workspace.tsx`→`appointment-workspace.tsx` / `itinerary-locked-card.tsx`→`appointment-locked-card.tsx` / `ItineraryPage.tsx`→`AppointmentPage.tsx` / `app/itineraries/page.tsx`→`app/appointments/page.tsx`
- Modify: `components/views/action-view.tsx` / `timeboxes-event.ts` / `timebox-list.tsx` / `timebox-timeline.tsx` / `timeboxes-workspace.tsx` / `overlap-layout.ts` / `rules-registry.ts` / `hooks/use-intent-handler.ts` / `next.config.ts`

**Interfaces:**
- Consumes: Task 4-8 全部新名 + Task 3 类型
- Produces: 完整 appointment UI 层 + `/appointments` 路由 + `/itineraries` 308 redirect + `kind:'appointment'` 判别

- [ ] **Step 1: git mv 4 文件**

```bash
git mv src/domains/timebox/components/itinerary-workspace.tsx src/domains/timebox/components/appointment-workspace.tsx
git mv src/domains/timebox/components/itinerary-locked-card.tsx src/domains/timebox/components/appointment-locked-card.tsx
git mv src/domains/timebox/pages/ItineraryPage.tsx src/domains/timebox/pages/AppointmentPage.tsx
git mv src/app/itineraries/page.tsx src/app/appointments/page.tsx
```

- [ ] **Step 2: timeboxes-event.ts 运行时 kind 判别（关键）**

⚠️ `kind:'itinerary'` 是 discriminated union 运行时字符串，producer + consumer 必须同步。

`src/domains/timebox/components/timeboxes-event.ts`：
- 文件头注释 `kind: 'itinerary' 来自 ItineraryRepository` → `kind: 'appointment' 来自 AppointmentRepository`；「itinerary」→「appointment」（保留 [023.03] T4/[026] codex D5 历史注释，仅标识符改）
- `import type { TimeboxSummary, ItinerarySummary }`→`... AppointmentSummary`
- `import type { ItineraryStatus }`→`AppointmentStatus`
- type union 分支 `kind: 'itinerary'`→`kind: 'appointment'`；分支内 `status: ItineraryStatus`→`AppointmentStatus`；`source: ItinerarySummary`→`AppointmentSummary`
- `export function itineraryToEvent(it: ItinerarySummary)`→`export function appointmentToEvent(it: AppointmentSummary)`；体内 `kind: 'itinerary'`→`kind: 'appointment'`
- `export function mergeEvents(timeboxes, itineraries: ItinerarySummary[])`→`mergeEvents(timeboxes, appointments: AppointmentSummary[])`

```bash
grep -nE "itinerary|Itinerary|行程" src/domains/timebox/components/timeboxes-event.ts
```

- [ ] **Step 3: timebox-list.tsx + timebox-timeline.tsx（kind consumer）**

`timebox-list.tsx`：L21 `import { ItineraryLockedCard }`→`import { AppointmentLockedCard }`（路径 `./appointment-locked-card`）；JSX `<ItineraryLockedCard`→`<AppointmentLockedCard`；L54,67 `e.kind === "timebox"` 保留；注释「行程」→「约定」。

`timebox-timeline.tsx`：L14 `kind='itinerary'：行程色块`→`kind='appointment'：约定色块`；L49 注释；L123 `e.kind === "timebox"` 保留；L161 `// kind === "itinerary"`→`// kind === "appointment"`（保留 [023.03] T2 历史标识）。

```bash
grep -rnE "kind === ['\"]itinerary['\"]|kind: 'itinerary'|ItineraryLockedCard" src/domains/timebox/components/
```

- [ ] **Step 4: appointment-workspace.tsx（原 itinerary-workspace）**

`src/domains/timebox/components/appointment-workspace.tsx`：
- 全段「行程」→「约定」（~20 处 UI 文案：L113「行程列表刷新失败」/L146「我的行程」/L157,160「新建行程」/L168「还没有行程」/L169「创建一个行程，把它钉到未来的日历上」/L186「行程：${it.title}」/L208「编辑行程：...」/L308「行程已更新」/L327,333,335「编辑行程」/L409「行程已创建」/L426,432,434「新建行程」/L458「保存行程」）
- import：`ItinerarySummary`/`ItineraryStatus`→`Appointment*`；`ItineraryLockedCard`→`AppointmentLockedCard`（路径 `./appointment-locked-card`）；`getItinerariesByRange`→`getAppointmentsByRange`；`updateItinerary`/`deleteItinerary`/`parseItineraryIntentOnly`→`updateAppointment`/`deleteAppointment`/`parseAppointmentIntentOnly`
- `export function ItineraryWorkspace`→`export function AppointmentWorkspace`
- 变量名 `itineraryList`→`appointmentList`；`itinParse`→`apptParse`
- ⚠️ **F4 contract**：`result.itinerary` destructure → `result.appointment`（createAppointment/editAppointment 返回的 action result）

```bash
grep -nE "行程|Itinerary|itinerary" src/domains/timebox/components/appointment-workspace.tsx
```

- [ ] **Step 5: appointment-locked-card.tsx**

`src/domains/timebox/components/appointment-locked-card.tsx`：import `AppointmentSummary`/`AppointmentStatus`；`interface ItineraryLockedCardProps`→`AppointmentLockedCardProps`；`itinerary: ItinerarySummary`→`appointment: AppointmentSummary`；`export function ItineraryLockedCard`→`AppointmentLockedCard`；`STATUS_STYLES[itinerary.status]`→`[appointment.status]`；体内 `itinerary.*`→`appointment.*`；注释「行程」→「约定」。

- [ ] **Step 6: AppointmentPage.tsx + app/appointments/page.tsx**

`src/domains/timebox/pages/AppointmentPage.tsx`：@file 头 `ItineraryPage`→`AppointmentPage` + 「行程管理页面」→「约定管理页面」+ `handleGrowthAction('timebox', 'viewItineraries')`→`'viewAppointments'`；import `AppointmentWorkspace`/`getAppointmentsByRange`/`AppointmentSummary`（路径 `./appointment-workspace`）；`export function ItineraryPage()`→`AppointmentPage()`；体内同步 + 中文。

`src/app/appointments/page.tsx`：@file 头 `/itineraries`→`/appointments`；import `reconcileAndAdvanceAppointments`（`@/app/actions/reconcile-appointments`）+ `getAppointmentsByRange` + `AppointmentWorkspace`；`export default async function ItinerariesPage()`→`SchedulesPage()→AppointmentsPage()`；体内同步。

- [ ] **Step 7: action-view.tsx import + viewAppointments**

`src/components/views/action-view.tsx`：L33 `import { ItineraryPage } from ".../ItineraryPage"`→`import { AppointmentPage } from ".../AppointmentPage"`；L54 `viewItineraries: ItineraryPage`→`viewAppointments: AppointmentPage`；L21 `[023.03] T4` 历史注释**保留**（OQ-4）。

- [ ] **Step 8: timeboxes-workspace.tsx + overlap-layout.ts + rules-registry.ts**

`timeboxes-workspace.tsx`：L102 `const [timeboxList, itineraryList] = ... [..., getItinerariesByRange(...)]`→`const [timeboxList, appointmentList] = ... [..., getAppointmentsByRange(...)]`；L106 `mergeEvents(timeboxList, itineraryList)`→`(timeboxList, appointmentList)`；L32 注释「行程计划由 /itineraries 域承担」→「约定由 /appointments 域承担」；`getItinerariesByRange` import→`getAppointmentsByRange`。

`overlap-layout.ts`：L26 `events.filter(e => e.kind === 'timebox')` 保留；注释「itinerary」→「appointment」/「行程」→「约定」。

`rules-registry.ts`：L92 注释「+ 行程」→「+ 约定」；L175-179 注释「行程是独立对象」→「约定是独立对象」；L190 `fieldsValid: '行程字段校验失败'`→`'约定字段校验失败'`；L195 `const itineraryTitleRequired`→`appointmentTitleRequired`；L202 `const itineraryStartTimeInFuture`→`appointmentStartTimeInFuture`；全文引用同步。

```bash
grep -rnE "itinerary|Itinerary|行程" src/domains/timebox/components/timeboxes-workspace.tsx src/domains/timebox/lib/overlap-layout.ts src/domains/timebox/rules-registry.ts
```

- [ ] **Step 9: use-intent-handler.ts action 判别**

`src/hooks/use-intent-handler.ts`：L27 `parseItineraryIntentOnly`→`parseAppointmentIntentOnly`（注释「行程 dry-run」→「约定 dry-run」）；L571-574 注释 action 名 + `ITINERARY_PARSE_PROMPT`→`APPOINTMENT_PARSE_PROMPT`；L577-579 `slashResult.action === "createItinerary" || "editItinerary" || "deleteItinerary"`→`"createAppointment" || "editAppointment" || "deleteAppointment"`；L581 `const itinParse = await parseItineraryIntentOnly(...)`→`const apptParse = await parseAppointmentIntentOnly(...)`；后续 `itinParse.*`→`apptParse.*`。

```bash
grep -nE "itinerary|Itinerary|行程|itinParse" src/hooks/use-intent-handler.ts
```

- [ ] **Step 10: next.config.ts F6 redirect**

`next.config.ts` 加 `redirects()`：
```typescript
async redirects() {
  return [
    // [023.05] PR2: /itineraries → /appointments 永久跳转（itinerary→appointment 重命名，防存链接 + AI 历史 session 失效）
    { source: "/itineraries/:path*", destination: "/appointments/:path*", permanent: true },
  ];
},
```

- [ ] **Step 11: grep 守护 + Commit**

```bash
grep -rnE "ItineraryWorkspace|ItineraryLockedCard|ItineraryPage|ItinerarySummary|ItineraryStatus|getItinerariesByRange|reconcileAndAdvanceItineraries|parseItineraryIntentOnly|kind: 'itinerary'|kind === ['\"]itinerary" src/domains/timebox src/components src/app/appointments src/hooks/use-intent-handler.ts
```
Expected: 空。

⚠️ **codex #2 + #4（盲假设清零）**：plan 未显式 grep `growth-menu.tsx`（Task 10 改了它的测试文件 `growth-menu-itinerary.test.tsx`，但生产组件 `src/components/layout/growth-menu.tsx` 未列入 modify 清单——codex 实测干净，但加守护防回归）+ 中间层 barrel（`providers/index.ts`/`handlers/index.ts`/`components/index.ts`，codex 实测干净）。补 grep：
```bash
# GrowthMenu 生产组件 + 中间 barrel 不含 itinerary 残留（codex 实测干净，守护防回归）
grep -rnE "itinerary|Itinerary|行程" src/components/layout/growth-menu.tsx src/domains/timebox/providers/index.ts src/domains/timebox/handlers/index.ts src/domains/timebox/components/index.ts 2>/dev/null
```
Expected: 空（若命中，补改——growth-menu.tsx 若硬编码 action/shortcut 需同步 appointment）。

```bash
git add src/domains/timebox/components/ src/domains/timebox/pages/AppointmentPage.tsx src/app/appointments/ src/components/views/action-view.tsx src/domains/timebox/lib/overlap-layout.ts src/domains/timebox/rules-registry.ts src/hooks/use-intent-handler.ts next.config.ts
git commit -m "refactor(023.05): components+pages+路由 itinerary→appointment + F6 redirect + kind 判别

[023.05] PR2 阶段 2 Task 9：components + pages + 路由
- git mv: appointment-workspace/appointment-locked-card/AppointmentPage/app/appointments
- timeboxes-event: kind:'itinerary'→'appointment' (运行时判别) + appointmentToEvent + mergeEvents param
- timebox-list/timeline: AppointmentLockedCard + kind 注释
- action-view: import AppointmentPage + viewAppointments（[023.03] T4 历史注释保留 OQ-4）
- rules-registry: appointmentTitleRequired/appointmentStartTimeInFuture + 错误文案
- use-intent-handler: parseAppointmentIntentOnly + action createAppointment/editAppointment/deleteAppointment
- next.config F6: /itineraries/:path* → /appointments/:path* 308
- 中文 ~20 处 行程→约定

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 测试同步 + F1 resolveObjectType 回归 + T1 isAppointmentIntent 回归

**Files:**
- Rename: 12 个 itinerary 测试文件
- Modify: ~14 测试文件全局替换
- Create: `src/nexus/orchestrator/__tests__/resolveObjectType.regression.test.ts`（F1 + T1 回归）

**Interfaces:**
- Consumes: Task 2-9 全部新命名
- Produces: 全量测试绿 + F1 + T1 回归守护

- [ ] **Step 1: git mv 12 测试文件**

```bash
cd /home/walker/lifeware/frontend
git mv src/app/actions/__tests__/itinerary-actions.test.ts src/app/actions/__tests__/appointment-actions.test.ts
git mv src/app/actions/__tests__/reconcile-itineraries.test.ts src/app/actions/__tests__/reconcile-appointments.test.ts
git mv src/app/actions/__tests__/reconcile-itineraries-partial-failure.test.ts src/app/actions/__tests__/reconcile-appointments-partial-failure.test.ts
git mv src/components/layout/__tests__/growth-menu-itinerary.test.tsx src/components/layout/__tests__/growth-menu-appointment.test.tsx
git mv src/domains/timebox/__tests__/rules-registry.itinerary.test.ts src/domains/timebox/__tests__/rules-registry.appointment.test.ts
git mv src/domains/timebox/cnui/__tests__/parse-itinerary.test.ts src/domains/timebox/cnui/__tests__/parse-appointment.test.ts
git mv src/domains/timebox/cnui/surfaces/__tests__/create-itinerary.test.tsx src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx
git mv src/domains/timebox/cnui/surfaces/__tests__/itinerary-form-fields.test.tsx src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx
git mv src/domains/timebox/cnui/surfaces/__tests__/delete-itinerary.test.tsx src/domains/timebox/cnui/surfaces/__tests__/delete-appointment.test.tsx
git mv src/domains/timebox/cnui/surfaces/__tests__/edit-itinerary.test.tsx src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx
git mv src/domains/timebox/components/__tests__/itinerary-workspace.test.tsx src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
git mv src/domains/timebox/status/__tests__/reconcile-itinerary.test.ts src/domains/timebox/status/__tests__/reconcile-appointment.test.ts
git mv src/domains/timebox/status/__tests__/reconcile-itinerary-tz.test.ts src/domains/timebox/status/__tests__/reconcile-appointment-tz.test.ts
git mv src/domains/timebox/repository/__tests__/itinerary.test.ts src/domains/timebox/repository/__tests__/appointment.test.ts
```

- [ ] **Step 2: 全局替换测试文件 itinerary 标识符**

逐文件 Edit（不可盲目 sed，区分字符串字面量 vs 注释 vs 标识符）。替换映射：
- `ItineraryRepository`→`AppointmentRepository` / `ItinerarySummary`→`AppointmentSummary` / `ItineraryStatus`→`AppointmentStatus` / `Itinerary`→`Appointment`
- `reconcileItineraryStatuses`→`reconcileAppointmentStatuses` / `reconcileAndAdvanceItineraries`→`reconcileAndAdvanceAppointments` / `createItineraryMutationService`→`createAppointmentMutationService` / `ItineraryFieldUpdated`→`AppointmentFieldUpdated`
- `parseItineraryWithAI`→`parseAppointmentWithAI` / `parseItineraryIntentOnly`→`parseAppointmentIntentOnly` / `ItineraryParseIntentResult`→`AppointmentParseIntentResult` / `ItineraryParseResult`→`AppointmentParseResult` / `ITINERARY_PARSE_PROMPT`→`APPOINTMENT_PARSE_PROMPT` / `ItineraryDraft`/`ItineraryDraftFields`→`AppointmentDraft`/`AppointmentDraftFields`
- `isItineraryIntent`→`isAppointmentIntent` / `getItinerariesByRange`→`getAppointmentsByRange`
- `createItinerary`/`updateItinerary`/`deleteItinerary`/`markInProgressItinerary`/`markExpiredItinerary`→appointment* / `ItineraryActionResult`→`AppointmentActionResult` / `CreateItineraryInput`→`CreateAppointmentInput`
- `result.itinerary`→`result.appointment`（F4 contract）/ `itineraryId`→`appointmentId`
- action 字符串 `'createItinerary'`/`'editItinerary'`/`'deleteItinerary'`/`'cancelItinerary'`/`'viewItineraries'`/`'markInProgressItinerary'`/`'markExpiredItinerary'`/`'parseItineraryIntent'`→appointment*
- `'create-itinerary'`/`'edit-itinerary'`/`'delete-itinerary'`→`'create-appointment'`/`'edit-appointment'`/`'delete-appointment'`
- `CreateItinerary`/`EditItinerary`/`DeleteItinerary`/`ItineraryFormFields`/`ItineraryWorkspace`/`ItineraryLockedCard`/`ItineraryPage`→Appointment*
- import 路径 `'.../itinerary'`→`'.../appointment'`、`'.../itinerary-workspace'`→`'.../appointment-workspace'` 等
- `objectType: 'itinerary'`→`'appointment'` / `kind: 'itinerary'`/`kind === 'itinerary'`→`'appointment'`
- 中文「行程」→「约定」（describe/it 文案 + fixture 字符串）

```bash
grep -rlE "itinerary|Itinerary|行程" src --include="*.test.ts" --include="*.test.tsx"
```
逐文件 Edit 至 grep 空。

**注意**：`view_schedule`（snake_case，[023.03] T4 历史注释/快照）保留（OQ-4）；`ScheduleEvent`/`ScheduleView`（[023.03] T4 legacy in .snap）保留；`status: 'scheduled'`/`capture_mode: 'scheduled'` 保留（P3）。

⚠️ **codex #5（.snap 快照漂移）**：若 vitest `.snap` 文件捕获了 `ItinerarySummary`/`ItineraryLockedCard`/`kind: 'itinerary'` 等序列化字符串，重命名后 snapshot 比对会失败（不是类型错，是 snapshot mismatch）。Step 4 vitest 跑时若遇 snapshot 失败：
```bash
# 先确认失败确是 itinerary→appointment 重命名导致（而非真回归）
npx vitest run 2>&1 | grep -i snapshot
# 确认是重命名漂移后，更新快照
npx vitest run --update
git add -A src/**/*.snap  # 提交更新后的 snapshot
```
**先 grep .snap 是否含 itinerary**（若无则无此问题）：
```bash
grep -rln "Itinerary\|itinerary\|行程" src --include="*.snap" 2>/dev/null
```

- [ ] **Step 3: 写 F1 + T1 回归测试**

⚠️ **实际路径**：`resolveObjectType`/`getTransitionFromManifest` 位于 `src/nexus/orchestrator/lifecycle-configs.ts`（已 grep 确认）。`isAppointmentIntent` 位于 `src/nexus/core/rule-engine/rules/timebox.ts`。

创建 `src/nexus/orchestrator/__tests__/resolveObjectType.regression.test.ts`：
```typescript
/**
 * @file resolveObjectType.regression
 * @brief F1+T1 回归：[023.05] PR2 后 timebox 域双 lifecycle key（timebox+appointment）的分派守护
 *        F1: resolveObjectType PascalCase 分派（lifecycle-configs.ts）
 *        T1: isAppointmentIntent rule-engine 镜像分派（rule-engine/rules/timebox.ts）
 */
import { describe, it, expect } from 'vitest'
import { resolveObjectType, getTransitionFromManifest } from '../lifecycle-configs'
import { isAppointmentIntent } from '../../core/rule-engine/rules/timebox'

describe('[023.05] F1 resolveObjectType PascalCase 分派', () => {
  it('createAppointment 路由到 appointment lifecycle（非 timebox）', () => {
    expect(resolveObjectType('timebox', 'createAppointment')).toBe('appointment')
  })

  it('createSmartTimeboxes 仍路由到 timebox（不含 Appointment 子串）', () => {
    expect(resolveObjectType('timebox', 'createSmartTimeboxes')).toBe('timebox')
  })

  it('editAppointment/deleteAppointment/viewAppointments 路由到 appointment', () => {
    expect(resolveObjectType('timebox', 'editAppointment')).toBe('appointment')
    expect(resolveObjectType('timebox', 'deleteAppointment')).toBe('appointment')
    expect(resolveObjectType('timebox', 'viewAppointments')).toBe('appointment')
  })

  it('getTransitionFromManifest appointment create 返回 AppointmentCreated', () => {
    const t = getTransitionFromManifest('timebox', 'appointment', null, 'create')
    expect(t?.eventType).toBe('AppointmentCreated')
    expect(t?.to).toBe('scheduled')
  })
})

describe('[023.05] T1 isAppointmentIntent rule-engine 分派镜像', () => {
  it('createAppointment/editAppointment/deleteAppointment → true', () => {
    for (const action of ['createAppointment', 'editAppointment', 'deleteAppointment']) {
      expect(isAppointmentIntent({ targetDomain: 'timebox', action } as any)).toBe(true)
    }
  })

  it('createSmartTimeboxes/viewTimeboxes → false（timebox 域不误判）', () => {
    for (const action of ['createSmartTimeboxes', 'viewTimeboxes', 'createTimebox', 'logTimebox']) {
      expect(isAppointmentIntent({ targetDomain: 'timebox', action } as any)).toBe(false)
    }
  })
})
```
⚠️ 写测试前先 grep 确认 export 名 + 签名 + `isAppointmentIntent` 的入参形态（StructuredIntent）+ `getTransitionFromManifest` 返回字段名（`eventType` vs `event_type`）。按实际调整 assertion。

- [ ] **Step 4: vitest 全量 base=head**

```bash
npx vitest run 2>&1 | tail -30
```
Expected: 与 base（`origin/main` HEAD）对比**零新增失败**。重点：`appointment-actions`/`reconcile-appointments*`/`parse-appointment`/`appointment-workspace`/3 surface 测试/`reconcile-appointment*`/`repository/appointment`/`resolveObjectType.regression`/`rules-registry.appointment`。

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "test(023.05): 测试同步 itinerary→appointment + F1+T1 回归

[023.05] PR2 阶段 2 Task 10：测试同步 + F1+T1 回归
- 14 测试文件 git mv (appointment-actions/reconcile-appointments/parse-appointment/...)
- 全局替换 itinerary 标识符 + F4 result.appointment + 中文 行程→约定
- 新增 resolveObjectType.regression.test.ts (F1 PascalCase + T1 isAppointmentIntent)
- 历史注释/快照 ([023.03] T4 view_schedule/ScheduleEvent) 保留 (OQ-4)
- scheduled enum 值保留 (P3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: 全量验收（grep 守护 + tsc + vitest + validate:manifest + /appointments + lazy reconcile + redirect + down rollback）

**Files:** 无（验收 only）

- [ ] **Step 1: F1 grep 守护**

```bash
cd /home/walker/lifeware/frontend
grep -E "action:.*Appointment" src/domains/timebox/manifest.yaml
```
Expected: 命中 `createAppointment`/`editAppointment`/`deleteAppointment` + state-machine 生成的 `cancelAppointment`/`startAppointment`/`completeAppointment`/`expireAppointment`/`markInProgressAppointment`/`markExpiredAppointment`——都是 appointment 对象（原 itinerary），正确。

- [ ] **Step 2: itinerary 标识符全局 grep（活代码清零）**

```bash
grep -rnE "\bItinerary\b|ItineraryRepository|ItinerarySummary|ItineraryStatus|ItineraryDraft|reconcileItinerary|createItineraryMutationService|ItineraryFieldUpdated|parseItinerary|getItinerariesByRange|ItineraryWorkspace|ItineraryLockedCard|ItineraryPage|ItineraryFormFields|ItineraryActionResult" src --include="*.ts" --include="*.tsx" | grep -v __tests__
```
Expected: **空**。仅剩 `[023.03] T4` 历史注释（OQ-4）+ mainViewState.type='schedule'（PR1 OQ-1，C1 已消解，非 itinerary）。

```bash
grep -rnE "itinerary" src --include="*.ts" --include="*.tsx" --include="*.yaml" | grep -v __tests__ | grep -v "\[023.03\]" | grep -v "\[026\]"
```
Expected: 空或仅注释历史。

- [ ] **Step 3: validate:manifest**

```bash
npm run validate:manifest
```
Expected: `0 errors`。

- [ ] **Step 4: tsc base=head + ESLint（codex #7）**

```bash
npx tsc --noEmit 2>&1 | tail -15
```
Expected: 与 base 对比**零新增 error**。重点：F4 contract（`result.appointment` 调用方全改）、import 路径、AppointmentStatus enum。

```bash
npm run lint
```
Expected: 与 base 对比**零新增 lint error/warning**（codex #7：lint 可能抓 tsc 抓不到的 casing/naming/import 规则，如 `no-restricted-imports` 或文件名 PascalCase 规则）。若新增，定位是否重命名触发，修复。

- [ ] **Step 5: vitest base=head**

```bash
npx vitest run 2>&1 | tail -10
```
Expected: 零新增失败。

- [ ] **Step 6: dev server /appointments + /timeboxes 200 + redirect**

```bash
npm run dev &  # 等 5 秒
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/appointments     # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/timeboxes         # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/itineraries/foo  # 308 → /appointments/foo
```
Expected: `/appointments` 200 + `/timeboxes` 200 + `/itineraries/foo` 308 redirect `/appointments/foo`（F6）。

- [ ] **Step 7: lazy reconcile 验证（手改 DB status）**

```bash
psql "$DATABASE_URL" -c "UPDATE appointments SET status='scheduled', start_time=NOW() - INTERVAL '2 days' WHERE status IN ('scheduled','in_progress') LIMIT 1;"
curl -s http://localhost:3000/appointments -o /dev/null  # 触发 server component reconcile
psql "$DATABASE_URL" -c "SELECT id, status FROM appointments ORDER BY updated_at DESC LIMIT 1;"  # 期望推进到 in_progress/expired
```
Expected: reconcile 推进后 status 不再是 scheduled（lazy reconcile `reconcileAppointmentStatuses` 工作）。

- [ ] **Step 8: GrowthMenu + 3 CNUI /browse 视觉验证**

`/browse` 验证：GrowthMenu timebox 组显示 4 个 appointment action（中文「约定」）；`/createAppointment`/`/editAppointment`/`/deleteAppointment` 3 CNUI shortcut 走通；`/appointments` 页面「我的约定」标题 + 新建/编辑 drawer 中文「约定」；`/timeboxes` 当日视图 appointment 锁定卡片正常。

- [ ] **Step 9: 0033 down migration rollback（F5）**

```bash
psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.down.sql
psql "$DATABASE_URL" -c "\dt itineraries"  # 回到 itineraries
psql "$DATABASE_URL" -f src/lib/db/migrations/0033_rename_itineraries_to_appointments.sql  # 恢复 appointments
psql "$DATABASE_URL" -c "\dt appointments"
```
Expected: down 跑通回 itineraries，正向回 appointments。

- [ ] **Step 10: /review + ship + prod migrate**

```bash
# ship 前 OQ-1 尽职调查
psql "$DATABASE_URL" -c "SELECT count(*) FROM itineraries;"  # row count 留证（dev）
# prod ship 后
./prod.sh --migrate  # 走 drizzle-kit，读 _journal idx=33，应用 0033 + 登记 drizzle.__drizzle_migrations hash
```
- `/review` 全量审查（重点 F1/T1/F4/F6 + 中文清理 + 测试）
- `/ship` 合 main
- `./prod.sh --migrate` 应用 0033（内置 pg_dump 备份）

- [ ] **Step 11: 最终 fixup commit（若有）**

若全绿无需 fixup，跳过。否则 `git add -A && git commit -m "fix(023.05): PR2 阶段 2 验收 fixup"`。

---

## Self-Review

**1. Spec coverage**（母 design §2.1-2.6 + F1-F7 + 6 OQ + eng-review 覆盖决议 + A1/T1 finding fold）：
- ✅ 2.1 DB（表+索引+0033+schema.ts）→ Task 2（+A1 dev 机制修正）
- ✅ 2.2 USOM（Itinerary→Appointment + Status + Summary + events）→ Task 3
- ✅ 2.3 manifest（lifecycle/field_metadata/4 action/3 surface/view_routes）→ Task 7（本域无独立 context provider，G-? id/query 成对约束 N/A）
- ✅ 2.4 文件+标识符（10 生产 git mv + 函数/import）→ Task 4-9
- ✅ 2.5 中文「行程」→「约定」（D1）→ Task 4/6/7/9
- ✅ 2.6 验收 → Task 1/2/11
- ✅ F1 resolveObjectType 回归 → Task 10 Step 3 + Task 11 Step 1
- ✅ F2 snapshot drift → Task 1 Step 2 + Task 2 注释
- ✅ F3 3 标识符 → Task 5 Step 1 + Task 6 Step 3
- ✅ F4 response contract → Task 6 Step 5-6 + Task 9 Step 4（result.appointment）+ Task 10
- ✅ F5 down migration → Task 2 Step 3 + Task 11 Step 9
- ✅ F6 /itineraries→/appointments 308 → Task 9 Step 10 + Task 11 Step 6
- ✅ A1 dev/prod 迁移机制区分 → Task 2 Step 5（dev \dt，prod drizzle-kit）
- ✅ T1 isAppointmentIntent 回归 → Task 10 Step 3
- ✅ 设计覆盖（schedule→appointment）→ 头部 ⚠️ 注 + Task 1 docs + CHANGELOG
- ✅ D1 双向清理（中文）→ Task 4/6/7/9
- ✅ P3 scheduled enum 保留 → Global Constraints + Task 2/3
- ✅ C1 mainViewState.type='schedule' 消解 → Global Constraints（C1 finding 因覆盖决议消解，defer 独立 follow-up）
- ✅ OQ-1 RENAME / OQ-2 viewAppointments 复数 / OQ-3 scheduled 保留 / OQ-4 历史注释保留 / OQ-5 F1 修正 / OQ-6 parse-appointment 单数

**2. Placeholder scan**：无 TBD/TODO。每 step 含精确 file:line + old→new diff 或精确 grep 目标。Task 10 Step 2 给完整替换映射表 + 区分字符串/注释/标识符/历史保留。

**3. Type consistency**：`Appointment`/`AppointmentStatus`(值'scheduled'保留)/`AppointmentSummary`/`AppointmentDraft`/`AppointmentDraftFields`/`AppointmentParseResult`/`AppointmentParseIntentResult`/`AppointmentActionResult`/`LLMAppointmentResponse`；函数 `reconcileAppointmentStatuses`/`reconcileAndAdvanceAppointments`/`createAppointmentMutationService`/`parseAppointmentWithAI`/`parseAppointmentIntentOnly`/`getAppointmentsByRange`/`appointmentToEvent`/`isAppointmentIntent`/5 server action；const `APPOINTMENT_PARSE_PROMPT`/`APPOINTMENT_UPDATE_ALLOWED`/`appointmentTitleRequired`/`appointmentStartTimeInFuture`；表 `appointments`/`idx_appointments_*`；契约 `{status:'ok';appointment:Appointment}`/`act.appointmentId`/`kind:'appointment'`；event `AppointmentCreated`等；manifest `lifecycle.appointment`/4 action/3 surface/view_routes。全 plan 一致。

**4. 跨 task 契约同步点**：
- `act.appointmentId`：Task 4 Step 7（定义）+ Step 8（消费）同步
- F4 `{appointment}` key：Task 6（定义）+ Task 9 Step 4（消费）+ Task 10（测试）同步
- `kind:'appointment'`：Task 9 Step 2（定义）+ Step 3（消费）同步
- `objectType:'appointment'`：Task 4（adapter+reconcile）+ Task 6（timebox.ts）+ manifest lifecycle.appointment（Task 7）+ F1 resolveObjectType 一致
- manifest action：Task 7（manifest）+ Task 6（submitDynamicIntent）+ Task 5（isAppointmentIntent）+ Task 9（use-intent-handler slash）一致

**5. 中间态 tsc 不绿（已标注）**：Global Constraints 显式说明，full gate 在 Task 11。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-023-05-2-itinerary-to-appointment-rename.md`（覆盖原 schedule 版，原文件已删）。

**1. Subagent-Driven (recommended)** - 每 task 派 fresh subagent，task 间 review（适合 11 task 大重构）
**2. Inline Execution** - 本 session 内 executing-plans 批量执行 + checkpoints

**Which approach?**

---

## NOT in scope

- `mainViewState.type='schedule'` → `'timeboxes'` 重命名（5 文件：main-view-state.ts / bottom-nav.tsx / app-context.tsx / use-conversation.ts / use-intent-handler.ts）——C1 finding 因 schedule→appointment 覆盖决议消解（无 Schedule 对象撞车），但 `bottom-nav.tsx:43 item.key === 'schedule'` 是否持久化（localStorage）未查，重命名需先调查。defer 独立 follow-up（建议下次小 PR 调查 + 改名）。
- drizzle snapshot 重置（`drizzle-kit up`）——同源 vitest/ESM 跑不通风险，F2 维持手写 convention。
- itinerary client 注册位置统一到 `register-client-surfaces.ts`——[026] 既定不一致，P3，重命名不承担。
- LLM prompt（`APPOINTMENT_PARSE_PROMPT`）的 [→EVAL] eval suite 跑——本 plan 加了 prompt review step（codex #3），但完整 eval suite 跑留独立 follow-up。
- [027] 打卡→completed + 智能编排归集约定——独立后续。

## What already exists

- `resolveObjectType`（`src/nexus/orchestrator/lifecycle-configs.ts:120-145`）已按 manifest lifecycle keys PascalCase 动态分派——plan 不新增分派逻辑，仅靠 manifest key + action 名一致，F1+T1 回归守护。
- PR1 已释放 `schedule` 命名空间（timebox 域 schedule→timebox 清理）——本 PR2 干净占用 `appointment`，`schedule` 留空无害。
- `migrate-prod.sh` 内置 pg_dump 备份 + `./prod.sh --migrate` 走 drizzle-kit 读 `_journal.json` + 登记 `drizzle.__drizzle_migrations` hash。
- `validate-manifest` pre-push hook 已强制 CNUI surface PascalCase K-component + 双注册。
- `0031_itineraries.sql` 已建表（journal idx=31），`0033_rename` RENAME 之（保数据，无 FK 引用）。
- `reconcileItineraryStatuses` 纯函数 + lazy reconcile 在页面 server component 触发（零 cron）——重命名不改逻辑。

## Failure modes

每个新/改 codepath 的生产失败模式 + 测试/错误处理覆盖：

| Codepath | 失败模式 | 测试? | 错误处理? | 用户见? |
|---|---|---|---|---|
| F1 resolveObjectType 分派 | manifest key/action 名不一致 → 错路由 → SM 找不到 transition → 运行时崩 | ✅ F1 回归（Task 10） | ❌（崩） | ❌ 静默崩 |
| T1 isAppointmentIntent 分派 | includes('Appointment') 误判 → rule 验证走错分支 | ✅ T1 回归（Task 10） | ⚠️ | ⚠️ |
| F4 response contract `{appointment}` | 调用方仍 destructure `result.itinerary` → undefined → 下游崩 | ✅ tsc base=head（Task 11） | ✅ tsc catch | n/a（编译期） |
| 0033 RENAME 迁移 | dev 重跑非幂等 → ERROR；prod hash 漂 → 重跑 | ⚠️ 手动（Task 2/11） | ✅ A1 + codex #8 守护 | n/a |
| kind:'appointment' 判别 | producer/consumer 不同步 → schedule 事件落 else 分支 → 渲染错 | ✅ tsc + grep（Task 9/11） | ✅ discriminated union tsc | ⚠️ |
| /itineraries→/appointments redirect | 旧链接 404 | ✅ curl 308（Task 11 Step 6） | ✅ F6 | ✅ 308 跳转 |

**Critical gap：无**（所有失败模式都有测试或编译期 catch 或错误处理）。F1 静默崩由回归测试守护（防患于未然）。

## Worktree parallelization strategy

**Sequential implementation, no parallelization opportunity.** 11 task 按依赖层从下到上（docs→DB→USOM→repo→nexus→server actions→manifest→CNUI→components→tests→验收），跨层 import 强依赖，中间态 tsc 不绿。每 task 建立在前 task 新名之上，无法并行。单 worktree 顺序执行。

## Implementation Tasks

本 review 的 findings 全部 fold 进 plan（plan 层 amendment，非新代码 task）。代码层实施 = plan 的 11 task。/autoplan 聚合见 JSONL artifact `~/.gstack/projects/walker2002-lifeware/tasks-eng-review-*.jsonl`。

- [x] **R1 (P1, CC: ~10min)** — plan — schedule→appointment 覆盖决议全层反映（plan 头注 + Task 1 docs + CHANGELOG）
  - Surfaced by: 用户 eng-review 期 pivot（schedule/日程计划 与 timebox 撞车）
- [x] **R2 (P1, CC: ~2min)** — plan Task 2 Step 5 — A1 dev 迁移验证修正（\dt，dev 无 __drizzle_migrations）
  - Surfaced by: Architecture review A1（实测 dev DB）
- [x] **R3 (P2, CC: ~3min)** — plan Task 10 Step 3 — F1+T1 回归测试 + codex #1 import 路径修正（`../../core/...`）
  - Surfaced by: prior learning [resolve-objecttype-pascalcase-dispatch] + codex #1
- [x] **R4 (P2, CC: ~5min)** — plan Task 5 Step 1 — codex #3 LLM prompt review step（"约定分隔符"等别扭短语手动改写）
  - Surfaced by: codex outside voice
- [x] **R5 (P3, CC: ~2min)** — plan Task 9 Step 11 — codex #2+#4 GrowthMenu + barrel 守护 grep
  - Surfaced by: codex（实测干净，加守护防回归）
- [x] **R6 (P3, CC: ~2min)** — plan Task 10 Step 2 — codex #5 .snap snapshot 漂移处理（`--update` + grep .snap）
  - Surfaced by: codex
- [x] **R7 (P3, CC: ~1min)** — plan Task 11 Step 4 — codex #7 ESLint gate
  - Surfaced by: codex
- [x] **R8 (P3, CC: ~1min)** — plan Task 2 Step 4-5 — codex #6 _journal `when` + #8 dev 重跑非幂等守护
  - Surfaced by: codex

_全部 fold 完成（plan amendment）。C1 finding 因覆盖决议消解，未产 task。_

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | CLEAR | 8 findings (1 bug import path + 7 procedural: GrowthMenu/barrel/prompt/snap/ESLint/dev-rerun/timestamp), all folded |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 arch (A1 migration dev verify) + 1 dissolved (C1 mainViewState, by pivot) + 1 test (T1 isAppointmentIntent) + user pivot (schedule→appointment) + codex 8, all folded/closed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** codex-cli 0.135.0 plan review — 1 concrete bug (F1+T1 regression test import path `'../../../core/...'`→`'../../core/...'`, fixed) + 7 procedural gaps (GrowthMenu/barrel audit grep, LLM prompt review step, .snap snapshot handling, ESLint gate, dev migration re-run guard, _journal when note), all user-approved for fold.
- **CROSS-MODEL:** No tension. Codex findings are additive (areas Claude's per-section review didn't cover: GrowthMenu/barrels/snapshots/ESLint/prompt content), not disagreements. The one concrete bug (import path) was independently catchable; codex caught it. High agreement.
- **VERDICT:** ENG CLEARED — ready to implement (proceed to /superpowers:subagent-driven-dev+TDD with the 11-task plan). Plan reflects schedule→appointment design override + all review findings folded.

NO UNRESOLVED DECISIONS
