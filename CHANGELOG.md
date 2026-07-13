# 文档变更日志 (CHANGELOG)

> 项目核心文档的版本演进记录。每次文档级变更后 **MUST** 同步追加。
> 执行细节（commit / 子任务编号 / 技术方案）留在 git、memory、specs/plans；
> 本文件只记**文档级里程碑**。同文档同日多次变更合并为一行。
>
> 历史归档见文末「## 历史归档 (≤ 2026-05-31)」。

---

## [page-thin] page.tsx 退化为 thin wrapper — domain 自包含入口统一（2026-07-13）

> 2026_07_13 — 9 任务重构（branch `refactor/page-thin-wrapper`）：把 `app/<route>/page.tsx` 从手写壳统一收敛为 codegen 生成的薄 wrapper；页面入口（含数据预取 + 容器）下移到 domain。manifest.view_routes.component 语义统一指向 domain 入口组件（去 `app/` 前缀），消除 codegen 循环 import 风险。6 个 page-thin 目标路由（`/tasks` `/okrs` `/timeboxes` `/timebox-templates` `/config/activity-archetypes` `/appointments`）全部 ship。

- **WBR 最终修复**：约定 reload 复用 canonical ±90 天窗口；路由 codegen 增加 `page_props` 结构校验与 ESM-safe 入口守卫；D8 测试改为 YAML 解析失败即失败，并精确断言全部 `(domain, action, component)` 绑定；`route-generation-spec.md` 与 `domain-development-guide.md` 同步补齐 Domain 路径、导出推断/覆盖、`page_props` 和默认导出检测契约。

### 改动（9 任务）

- **T1 — appointment-window 纯函数（timebox/lib）**：`getAppointmentWindow(now, ±90d)` + `daysFromToday(now, offset)` 两个纯函数 + 2 单测；F3 收口 client `AppointmentPage` 之前 stale 7/90 天窗口。
- **T2 — archetype 入口搬入 domain**：`archetype-table.tsx` + `archetype-form.tsx` 从 `components/settings/` 搬入 `domains/timebox/config/`，配套 `load-activity-archetypes.ts` server helper；T2-fix 一并修 archetype-form 漏改回归。
- **T3 — timebox-templates route 入口**：`timebox-templates-route.tsx`（D9 重命名）+ `load-templates.ts` server helper + 2 单测。
- **T4 — appointment route 入口（拥 h-screen）**：`appointment-route.tsx` + `load-appointments.ts` server helper + 1 单测；F3 收口 client `AppointmentPage` stale 窗口。
- **T5 — workspace standalone prop**：OKRWorkspace + TimeboxesWorkspace 新增 `standalone?: boolean`（默认 false），standalone 时 root 用 `h-screen` 自撑高度，AppShell 嵌入仍 `h-full`；CRITICAL 回归测试守住两种模式。
- **T6 — manifest 校准**：`timebox/manifest.yaml` 4 个 view_route.component 改指向 domain，`okrs/manifest.yaml` 加 `page_props`；`ViewRouteSchema`（Zod）加 `export_name` + `page_props` 两可选字段；不变量测试 `manifest-view-routes.test.ts`（16 cases）禁 `app/` 前缀。
- **T7 — codegen 扩展**：`generate-routes.ts` 支持 kebab→PascalCase 文件名、`export_name` 兜底默认导出、`page_props` 透传、`searchParams` 类型拓宽；单测 9 cases 覆盖 4 种分支。
- **T7-fix**：`default-export detection`（codegen 默认导出识别）+ `OKRWorkspace searchParams union widening`（从 `Record<string,string>` 拓宽到 `Record<string, string|string[]|undefined>`）。
- **T8 — `--force` 接管 6 pages**：6 个手写 page.tsx（tasks/okrs/timeboxes/timebox-templates/activity-archetypes/appointments）被 codegen 覆盖为 9 行薄 wrapper；habits 2 个 page 幂等不变（no manifest change since T6）。

### 关键决策

- **D3** `standalone` 必传（不设 default）— 强制 caller 显式声明是嵌入还是独立页，避免 AppShell 嵌入时误用 `h-screen` 撑爆父容器（参 [[project_chromium-stretch-flex-percent-height-bug]]）。
- **D4** validate-all-first + single atomic update + post-write events — UI drawer catch → reload + toast。
- **D6** codegen page_props JSON.stringify 边界（null/obj）由 Task 7 单测覆盖 4 case。
- **D8** manifest view_route.component 禁 `app/` 前缀 — 不变量测试守护，防回归循环 import。
- **D9** `appointment` + `timebox-templates` 重命名（避「行程计划」与 timebox 撞车）。

### 验证

- ✅ vitest critical 6 suite 全绿：`scripts/__tests__/generate-routes.test.ts` (9/9) + `domains/timebox/lib/__tests__/appointment-window.test.ts` (2/2) + `domains/__tests__/manifest-view-routes.test.ts` (16/16) + 5 个新 route/standalone/render 测试 (24/24) + OKR components (37/37) + timebox components (142/142)
- ✅ vitest full suite **零净回归**：44 failed 全在 T1-T8 范围外（timebox-card / habit-card / OKR repos / nexus state-machine / habit handlers 等 — 全部 pre-existing）
- ✅ tsc head **201 错误，净 -18 vs T8 baseline (219)**；2 个 `transitionTimebox` 类型错误在 baseline 9c01c65 已存在，确认 pre-existing，非本次引入
- ✅ manifest 校验 0 新警告：8 routes 全部 `✓`（2 habits + 1 okrs + 1 tasks + 4 timebox），6 条历史「not auto-generated」警告全消失（T8 接管）；仅剩 2 条结构性 `Skipping X: no manifest.yaml found`（`__tests__/` / `manifest-loader/` 目录无 manifest — by design）
- ✅ dev server (port 3000) 6 路由 + `/` 全 200：tasks / okrs / timeboxes / timebox-templates / config/activity-archetypes / appointments

### 遗留（不在本期处理）

- /browse 视觉回归（`/okrs` `/timeboxes` `/appointments` 滚动链）由 controller 在本 commit 后单独跑
- 双重 `h-screen` 期视觉异常 — 理论嵌套等价 100vh，无变化；如视觉回归，回退 Task 5 对应文件 `h-screen` 即可
- `view_routes` kebab vs snake 命名风格混用（历史债）

### 关联

- 设计：`docs/superpowers/specs/2026-07-13-page-thin-wrapper-refactor-design.md`
- 计划：`docs/superpowers/plans/2026-07-13-page-thin-wrapper-refactor.md`（9 任务）+ `docs/superpowers/plans/2026-07-13-page-thin-wrapper-refactor-review.md`（eng-review 8 findings 折入）
- Branch：`refactor/page-thin-wrapper`（10 commits ahead main: T1 → T8）
- 相关项目债：[[TD-039]] TZDate RSC boundary（同期同 PR 收口）

---

## [TD-039] TZDate RSC boundary 序列化丢失 class — 治本修复（2026-07-13）

> 2026_07_13 — TZ-2.2 段尾遗留债。`use-timebox.ts:53` `getDateRange` 用 `@date-fns/tz v1.4.1` 的 `tz(tzName)` 包出 `TZDate`（Date subclass），跨 Next.js 16 RSC boundary 序列化时 Next.js 不识别 subclass prototype，server action 收到 plain object 后 `start.toISOString()` 抛 `TypeError`。`/timeboxes` / `/appointments` 页面 100% 触发（hydration 后 client `loadRange()` → Server Action），`/timeboxes` HTTP 200 但 UI 显示「今天还没有时间盒」空 state（fetch 失败被 catch 静默 swallow）。MVP Shanghai-only 巧合 OK；任何有范围查询的 page 加载即爆。

### 改动（方案 A — 治本）

- **`frontend/src/hooks/use-timebox.ts`**：`getDateRange(mode, date, tzName)` 返回类型 `Date → { start: string; end: string }`，出口 `.toISOString()` 转 ISO 字符串。`string` 是 RSC boundary 安全的 primitive，零额外转换、零 runtime 分支判断
- **`frontend/src/app/actions/intent.ts`**：`fetchTimeboxSummariesByRange` / `getTimeboxesByRange` / `getAppointmentsByRange` 类型契约 `Date → string`，去掉入口 `.toISOString()` 调用（直接当 `Timestamp` 透传）
- **`frontend/src/app/appointments/page.tsx`**（server component）：`new Date()` → `.toISOString()` 调 `getAppointmentsByRange`
- **`frontend/src/domains/timebox/components/appointment-workspace.tsx`**（client reload）：同上
- **测试**：
  - **新增** `frontend/src/hooks/__tests__/use-timebox.test.ts`（9 cases）守 `{ start: string; end: string }` 契约 + day/week/month 模式形状 + 跨日跨度
  - **修改** `__tests__/timeboxes-workspace.{range,view-mode}.test.tsx`：`.getHours()` / `.getDay()` / `.getDate()` 改 `new Date(start).xxx()`，类型断言 `[Date, Date] → [string, string]`
  - 改动 7 files +155 / -41（1 new test + 6 改）

### 关键决策

- **D1** 方案 A 治本（推荐）：`getDateRange` 出口转 ISO string，类型契约清晰，跨 boundary 永远 safe
- **D2** 方案 B（intent.ts 入口 `instanceof Date` 兜底）抛弃：治标 — 治不到其他未来 caller 仍可能踩同一坑
- **D3** 方案 C（getDateRange 返回 ms number）抛弃：API 仍非 string，caller 协同成本高于 D1

### 验证

- ✅ vitest touched **35/35 PASS**（含新增 9/9）
- ✅ vitest baseline 对比：**零净回归**（15 文件 pre-existing failed 全保留，TD-039 触达 vitest 全部 GREEN）
- ✅ tsc **净 -5 错误**（225 → 220）—— string 类型契约使 chain 严格化
- ✅ dev server `:3002` `/timeboxes` HTTP 200 + 0 console error + 4 个 timebox 卡片真实渲染（晨间规划 / 深度工作 / 午间运动 / 睡前阅读） + Server Actions POST 200
- ✅ dev server `:3002` `/appointments` HTTP 200 + 0 console error + 约定管理页正常 + 月历 grid 渲染

### 遗留

- [TZ-2.2] `appointment-locked-card.tsx` 视觉 badge 验证：原计划在本 PR 补，但 TZ-2.2 ship-then-verify 时因 TD-039 阻断无法 browser 验证 — TD-039 修复后下次 `/qa` 顺手补即可，不再单独立 TD

### 关联

- 根因：commit `5e36355` ([TZ-2.3]) 引入 `@date-fns/tz` 但未做 RSC boundary 跨域测试
- 修复：commit `374e9f3` ([TD-039])（待 push origin main + 用户手动 merge PR）
- TD 文档：`docs/tech-debt/TD-039-tzdate-rsc-serialization.md`（status: 已修复）
- 印证 [[feedback_post-ship-review-meta-pattern]] 第 N 次累积（TZ-2.2 ship-then-verify 漏 RSC boundary）

---

## [TZ-2.2] localDayKey 接受 IANA TZ — 收口 [026] OQ-6 最后一个 tz 边界（2026-07-12）

> 2026_07_12 — `[TZ-2] / [TZ-2.1] / [TZ-2.3]` 全链路 SHIPPED 后，写路径 + handler internal + 显示端 + 范围查询 全部切 user_tz，但**约定日历日派生** `localDayKey`（`getFullYear/getMonth/getDate`）仍按 OS TZ 计算——是 TZ-2 范围最后一个边界遗漏。`appointment-locked-card.tsx:85` [TZ-2] 改造时切了 `formatTime(iso, tz)` 但漏了 `deriveAppointmentDisplayStatus(status, startTime, now)`，是该函数内部 `localDayKey` 仍按浏览器/OS TZ 计算日历日。MVP Shanghai-only 巧合 OK；Tokyo user 跨日/跨月边界会与 TZ-1 写路径 8h 漂移同根因。

### 改动

- **新增** `frontend/src/lib/tz.ts`：`getUserTzYear/Month/Date` 三个 Intl-based helper（与已有 `getUserTzHour/Minute` 同模式）
- **新增** `frontend/src/lib/__tests__/tz.test.ts`：17 cases 覆盖 4 个 TZ（Shanghai/Tokyo/NY/Auckland）+ 跨年边界
- **修改** `frontend/src/domains/timebox/status/derive-display-status.ts`：`localDayKey(d, tz)` 用 `getUserTzYear/Month/Date` 替代 `getFullYear/Month/Date`；`deriveAppointmentDisplayStatus` 加 `tz: string` 必传
- **修改** `frontend/src/domains/timebox/status/reconcile-appointment.ts`：同上 + `deriveAppointmentBadges` / `findExpiredAppointmentIds` / `findInProgressAppointmentIds` 同步加 `tz: string` 必传（list helper 虽 production 无 callsite 但保持 API 对称）
- **修改** `frontend/src/domains/timebox/components/appointment-locked-card.tsx:85`：`useUserTz().tz` 透传给 `deriveAppointmentDisplayStatus`（修 [TZ-2] 漏改的边角）
- **测试更新** 3 文件：`derive-display-status.test.ts` 12 cases（含 3 跨 TZ）、`reconcile-appointment.test.ts` 16 cases（含 3 跨 TZ list batch）、`reconcile-appointment-tz.test.ts` 7 cases 加 tz 参数

### 验证

- ✅ vitest TZ-2.2 范围 **52/52 pass**（17 helpers + 12 derive + 16 list + 7 cross-TZ）
- ✅ vitest 全 timebox **679/681 pass**（1 failed = pre-existing handlers-edit-appointment flake，baseline 对齐）
- ✅ tsc **0 新增错误**（强制必传 tz 会暴露其他遗忘点——已 grep 确认 0 遗漏）

### 关键决策

- **D1** `tz: string` **必传**（不设 default）：避免 MVP Shanghai-only 巧合隐藏 bug，与 TZ-1 `useUserTz()` 模式一致
- **D2** `localDayKey` 在两个文件各自保留（功能模块内聚，user D2 决策）
- **D3** lib/tz.ts 加 3 个 helper（Intl 模式，跨 Node/browser 一致），供两个 `localDayKey` 调用
- **D4** appointment-locked-card.tsx 最小 diff：`useUserTz()` 已存在，只透传 tz

### 遗留债 → [[TD-039]] ×1

TZ-2.2 /qa 抓漏 pre-existing TZ-2.3 债：`use-timebox.ts:53` `getDateRange` 返回 `TZDate`（@date-fns/tz），Next.js 16 RSC boundary 序列化丢 class，server action 收到 plain object 无 `toISOString`，`fetchTimeboxSummariesByRange`/`getAppointmentsByRange` 抛 `TypeError: start.toISOString is not a function`，`/timeboxes` 页面 500。**TZ-2.2 不引入此 bug**（仅改 localDayKey 内部实现，不触 getDateRange/TZDate 路径），但 ship-then-verify 时漏掉。修复方向：方案 A（推荐）`getDateRange` 返回前显式 `.toISOString()` 转 ISO string。

### 设计 authority

- Spec：`docs/superpowers/specs/2026-07-12-tz-2-2-localdaykey-iana-tz-design.md`
- Plan：`docs/superpowers/plans/2026-07-12-tz-2-2-localdaykey-iana-tz.md`
- 关联 [[project-tz-2-full-shipment]]（TZ 全链路最后一块拼图）
- 关联 [026] OQ-6（[026] 收口 defer 列表）
- 上游 TZ-2：origin/main @ `d283dbd`

---

## [neat-2026_07_12-td003] /lifeware-neat [TD-003] 四件套 drift 收口（2026-07-12）

> 2026_07_12 — `/lifeware-neat` 第二轮扫描 `[TD-003]` branch (`fix/td-003-occ-version` 9 commits ahead of main) 收 4 件 drift：(1) `docs/database-design.md` §4.7 timeboxes CREATE TABLE 漏 `occ_version` 列（schema 已加，但文档没跟上）；(2) `docs/usom-design.md` §3.10 漏 `ITimeboxRepository` `expectedOccVersion` 必填参数说明；(3) `manifest.md` 漏 `[TD-003]` 索引条目；(4) `docs/tech-debt/README.md` TD-003 应移到「已修复」段（已通过 [TD-003] OCC POC 闭环），TD-037 已在新建段登记。

### 改动

- `docs/database-design.md` — §4.7 timeboxes CREATE TABLE 加 `occ_version integer NOT NULL DEFAULT 1` 列 + `[TD-003]` 注脚 + 顶部「变更记录」加 2026_07_12 `[TD-003]` 段 + 页脚「*变更」加 [TD-003] 行
- `docs/usom-design.md` — §3.10 Timebox Repository 注脚加 `expectedOccVersion` 必填参数 + USOM `Timebox` interface **不暴露** occVersion（Repository 契约）+ 顶部「变更记录」加 2026_07_12 `[TD-003]` 段 + 页脚「*变更」加 [TD-003] 行
- `manifest.md` — 追加 `[TD-003]` 索引条目（带 design SSOT / plan SSOT / CHANGELOG / memory / tech-debt / branch 9 commits / `/qa` 阻塞等交叉引用）
- `docs/tech-debt/TD-003-edit-timeboxes-toctou.md` — `status: 登记 → 已修复` + `last_updated: 2026-07-06 → 2026-07-12` + History 加 2026-07-12 [TD-003] 修复记录段
- `docs/tech-debt/README.md` — TD-003 在「📌 登记」段加修复状态说明 + 「🟢 已修复」段加 TD-003 一行（[TD-003] / fix/td-003-occ-version / 2026-07-12）
- `CHANGELOG.md` — 追加本 `[neat-2026_07_12-td003]` 段（最新在上）

### 验证

- 2A 枚举对齐：TimeboxStatus USOM `planned|logged|cancelled` ↔ DB CHECK 一致（[TD-003] 无状态枚举变更）
- 2B 表结构总览：timeboxes 表 §二总览已存在，§4.7 CREATE TABLE 现含 `occ_version` 列（双向对齐）
- 2C 视图/SQL 列名：`v_running_timeboxes` 引用的列（`status` / `start_time` / `end_time`）均在 timeboxes 表中存在（含新加的 `occ_version` 不被 view 引用，OK）
- 2D 残留文本：usom-design / database-design 无删除遗留片段
- 2E 版本号：`usom-design` / `database-design` 页脚 `2026_07_11 → 2026_07_12`（与最新变更日期自洽）
- 2F 字段一致：USOM `Timebox` interface（不含 occVersion）↔ DB `occ_version` 列：USOM 不暴露，Repository 接口契约 `expectedOccVersion` 必填（在 usom-design 注释中说明），符合「Repository 契约不污染域对象」原则
- UI C-01~C-07：[TD-003] 改动仅 timebox-drawer.tsx 内 `instanceof ConflictError` 分支 + toast 文案，无新颜色/布局（C-01 PASS by diff scope）
- Constitution 约束 ID：[TD-003] 无新约束引入（Repository 原子写入是 R-02 既有约束的延伸，不需新增约束 ID）
- mydocs/ 只读：本次会话未动 `mydocs/core/` 任一文件
- 修复 [TD-037] 漏登债：branch 新增 `docs/tech-debt/TD-037-cross-domain-occ-deferred.md` 已就位 + README 登记段已含（branch 之前已做）

### 未处理

- `/browse` 浏览器 E2E 受 pre-existing `fetchTimeboxSummariesByRange start.toISOString` 阻塞（[TD-039]）— 与 [TD-003] 无关，沿用既有登记
- [TD-003] ship-then-polish backlog：I-2 ConflictError 跨域归属决策 / I-5 revertTimebox stale-read window / T3 I-2 execute() legacy path / T3 M-1 `?? 0` fallback / T5 I-1 真空 wait / T5 M-5 `getTimeboxById` outer try 失败兜底 — 待 user 启 next session 收口
- `0037_TD-003_add_timebox_occ_version.sql` 非幂等（无 `IF NOT EXISTS`），手工应用后漏 INSERT `drizzle.__drizzle_migrations` 表（已被 [systematic-debugging] 修）—— 改 `ADD COLUMN IF NOT EXISTS` + 登记 helper script 待 [TD-038] follow-up
- `manifest.md` 仍 109 行（soft limit 80）；行数膨胀历史遗留（详细 [026.02.3.1]/[026.02.4] 长注释），不在本轮 scope

---

## [TD-003] timebox 域 OCC（乐观并发控制）POC（2026-07-12）

> 2026_07_12 — `[TD-003]` timebox 域引入乐观并发控制（OCC）解决跨 tab 并发编辑丢失问题。**架构**：DB `timeboxes` 加 `occ_version` 列（[T1] migration）+ Repository 层 OCC WHERE 谓词 + `ConflictError` 异常 + field-executor 批量重构 + UI drawer catch + reload + toast。**范围**：仅 timebox 域 POC；appointment / tasks / habits / okrs / cycles 跨域 OCC → `[TD-037]` P6 deferred。Whole-branch review 抓 5 Important，本 commit 修 I-1（archive + revertTransition OCC）+ I-4（state-machine `?? 0` fallback 替换为防御性 re-read）+ I-3（CHANGELOG 67 行误删恢复 + 本段补登）；I-2 / I-5 ship-then-polish defer。

### 决策摘要

- **D1** OCC 仅在 Repository 层加 `expectedOccVersion: number` 必填参数；WHERE `occ_version = ?` 0 rows → 抛 `ConflictError(current, attempted)`；不污染 §III 业务事实写入口 contract（Nexus 层抛 `FieldMutationError` / `StateMutationError` 模式参考但不沿用）
- **D2** field-executor 走「validate-all-first + single atomic update + post-write events」批量 OCC：单条 UPDATE WHERE 同时校验所有步骤的 occVersion（plan-eng-review Codex P0+P1+P2 fix 消除 multi-field atomic gap + READ COMMITTED UPDATE 原子性 + 避 nexus blanket catch swallowing）
- **D3** UI 接入模式：drawer 打开时 read current occVersion → submit 透传 expectedOccVersion → catch `ConflictError` → reload timebox + toast「数据已被其他标签页更新，已为你刷新」——零代码丢数据
- **D4** `?? 0` fallback 永久删除：state-machine logged transition 改防御性 `findById` re-read（I-4 fix）。原 `?? 0` 让 `WHERE occ_version = 0` 必 0 rows → 抛 ConflictError 阻断合法 logged 路径
- **D5** cross-domain OCC defer：`Appointment` / `Task` / `Habit` / `Objective` / `Cycle` 全部暂未实施 OCC → `[TD-037]` P6（5 域接入指南）

### 改动（commit `521ec47..e44850d`）

- **T1** `[TD-003 T1]` schema `timeboxes.occ_version INTEGER NOT NULL DEFAULT 0` + migration `0037_add_timebox_occ_version.sql`（IF NOT EXISTS 幂等 + journal idx=37）+ `timeboxUSOMToRow` 双向读写 occVersion 字段
- **T2** `[TD-003 T2]` `TimeboxRepository.updateFields` 加 `expectedOccVersion: number` 必填参数；OCC atomic UPDATE `SET occ_version = occ_version + 1 WHERE id AND userId AND occ_version = ?` + 0 rows → `ConflictError(current, attempted)`；新增 `errors/occ-conflict-error.ts` 域本地 class（不入 nexus）
- **T3** `[TD-003 T3]` field-executor `executeBatch` 重构：validate-all-first（所有 step.expectedOccVersion 与 re-read current 一致性预检）+ single atomic `repo.updateFields` 调用（单 UPDATE 多字段）+ post-write events 在事务内发射；消除 multi-field atomic gap + nexus blanket catch 吞错
- **T4** `[TD-003 T4]` `updateTimebox` server action 透传 `expectedOccVersion`：先 `findById` 读 current → attach 到每个 field step → mutation service.execute → 3-tab 并发测试守护（同一 occVersion=N 三次并发 → 仅 1 成功 + 2 ConflictError → 客户端捕获后 reload 重试）
- **T4-fix** `[TD-003 T4-fix]` `mutation-service.execute` outer catch 显式 re-throw `ConflictError`（保留 error.name='ConflictError'），防止 nexus blanket catch 把 OCC 异常吞成普通 Error
- **T5** `[TD-003 T5]` TimeboxDrawer catch `ConflictError` + reload via `findById` + toast「数据已被其他标签页更新，已为你刷新」；ux 优雅降级，不打断用户操作
- **T6** `[TD-003 T6]` `docs/tech-debt/TD-037-timebox-occ-cross-domain-rollout.md` 新建，登记 5 域 cross-domain OCC 接入指南 + scope 划分 + 接入模板

### Whole-branch fix（本 commit `[TD-003 whole-branch review]`）

- **I-1** `TimeboxRepository.archive` / `revertTransition` 加 `expectedOccVersion` 必填参数 + OCC atomic UPDATE 模式（与 `updateFields` 同形）。原 lifecycle 写绕过 OCC 可让外部 stale write 覆盖当前修改。`ITimeboxRepository.archive` 接口同步更新
- **I-2**（defer）ConflictError 跨域归属决策（沿用 timebox 域本地 class vs 提升到 nexus）→ `[TD-037]` follow-up
- **I-3** CHANGELOG 本段补登（删除 67 行误删恢复：[TZ-2.3] + [TZ-2.1] sections 已被前序 commit 误删）
- **I-4** `state-machine/index.ts` logged transition `?? 0` fallback 替换为 `findById` re-read（防御性，避免阻断合法路径）
- **I-5**（defer）`timebox.ts:286` stale-read window 加注释「OCC 兜底 race + drawer reload+toast 兜底 UX」

### 验证

- vitest 跨 tab 并发测试守护（3 标签页同时提交 → 1 成功 + 2 ConflictError + reload 不丢数据）
- tsc 0 新增错误
- `validate:manifest` 0 errors + `validate:domain-structure` ✓
- pre-push hooks 全过

### 设计 authority

- Plan SSOT：`docs/superpowers/plans/2026-07-12-td-003-timebox-occ-poc.md`
- TD 债：`docs/tech-debt/TD-003-timebox-stale-write-risk.md`（关闭）+ `TD-037-timebox-occ-cross-domain-rollout.md`（新建 deferred）

---

## [TZ-2.3] currentDate 链路 tz-aware（use-timebox 范围查询）（2026-07-12）

> 2026_07_12 — `[TZ-2.1]` 把 rbc `WeekView` / `MonthView` 渲染按 user_tz 算（用 `@date-fns/tz:tz()` 包装 localizer），但**调用方传给 rbc 的 `currentDate` 仍按浏览器本地时区解读** — `use-timebox.ts:61` `useState(new Date())` 是 Shanghai 浏览器绝对时刻；`getDateRange` 用 `startOfDay / startOfWeek / startOfMonth` 默认浏览器本地 TZ 计算日/周/月界；`navigateDate` 用 `addDays / addWeeks / addMonths` 默认浏览器本地 TZ 步进。Tokyo user 在 Shanghai 浏览器下：rbc 按 Tokyo 周界，`getDateRange` 按 Shanghai 周界，**跨日/跨月边界事件漏报**。本步统一 `use-timebox` 链路全部按 user_tz 算。

### 改动

- **`frontend/src/hooks/use-timebox.ts`**：
  - `getDateRange(mode, date, tzName='Asia/Shanghai')` — 加 `tzName` 参数，所有 `startOfDay / endOfDay / startOfWeek / endOfWeek / startOfMonth / endOfMonth` 通过 `{ in: tz(tzName) }` 按 user_tz 算
  - `navigateDate(mode, date, direction, tzName='Asia/Shanghai')` — `addDays / addWeeks / addMonths` 通过 `{ in: tz(tzName) }` 按 user_tz "自然日"步进
  - `useTimebox()` hook — 用 `useUserTz()` 拿 tz，传给两个 helper；deps 加 `userTz`
- **`frontend/src/domains/timebox/components/timeboxes-workspace.tsx`**：
  - `useUserTz()` 拿 tz；`loadRange` 调 `getDateRange(mode, d, userTz)`；`handleNavigate` 调 `navigateDate(mode, prev, direction, userTz)`
- **Fixture 更新** 3 个 workspace fixture 补 `renderWithTz` import + `render(<TimeboxesWorkspace />)` → `renderWithTz(...)`（timeboxes-workspace.error / timeboxes-workspace.openai / timeboxes-workspace.range）

### 验证

- ✅ vitest 全 timebox: **669/672 pass**（baseline 668/669；TZ-2.3 +1 pass；剩余 2 failed = pre-existing handlers-edit-appointment + parse-appointment）
- ✅ tsc: **净 -1 error**（baseline 208 → 207；TZ-2.3 不引入新错误）
- ✅ dev server `/timeboxes` HTTP 200, 0 RSC 错误
- ✅ Node 验证 date-fns v4 `in` option：`startOfDay(d, { in: tz('Asia/Shanghai') })` → `2026-07-12T00:00:00.000+08:00`；`addDays(d, 1, { in: tz('Asia/Tokyo') })` → `2026-07-13T17:00:00.000+09:00`

### 设计依据

- **`@date-fns/tz` v1.4.1`** 已在 `[TZ-2.1]` 装为 date-fns v4 peer dep，无需 `npm install`
- **`in: tz(tzName)` option**：date-fns v4 所有时间函数（`startOfDay / startOfWeek / startOfMonth / addDays / addWeeks / addMonths` 等）都支持
- **默认值 `'Asia/Shanghai'`**：保持向后兼容 + 与 schema default + 系统 TZ 一致
- **`currentDate` 仍为 absolute moment**：不强制转 user_tz wall clock — rbc 内部 `format(date, str, { in: tz(userTz) })` 自动按 user_tz 显示；`getDateRange` / `navigateDate` 用 `in` option 在 date-fns 层做 tz-aware arithmetic
- **commit 边界合并**：1 commit（use-timebox + workspace 改造 + 3 fixture 补 import；与 TZ-2 / TZ-2.1 风格一致）

### 遗留（明确登记）

1. **`localDayKey`（reconcile 调度）接受 IANA TZ** → `[TZ-2.2]`（[026] OQ-6 defer；最后一个 tz 边界未收口）

---

## [TZ-2.1] react-big-calendar tz 注入 — week-view / month-view（2026-07-12）

> 2026_07_12 — `[TZ-2]` 落地 4 个显示端组件（timebox-card / appointment-locked-card / timebox-timeline）按 user_tz 显示，但 **`react-big-calendar` 的 `dateFnsLocalizer.format` 仍按浏览器本地时区渲染** — Tokyo user 在 Shanghai 浏览器下，`WeekView` / `MonthView` 仍显示 Shanghai 时间而非 Tokyo 时间。本步通过 `@date-fns/tz` v1.4.1（date-fns v4 官方 tz 包，已装为 peer dep）的 `tz(timeZone)` 工厂函数把 user_tz 注入 dateFnsLocalizer 的 `format` / `startOfWeek`，让 rbc 按 user_tz 渲染事件时间与周界。

### 改动

- `frontend/src/domains/timebox/components/week-view.tsx:48-66` — `useMemo` 缓存 `dateFnsLocalizer`，`format` / `startOfWeek` 通过 `{ in: tz(userTz) }` 包装
- `frontend/src/domains/timebox/components/month-view.tsx:78-100` — 同上模式；`byDay` 分组逻辑改用 `startOfDay + format` with `in: tz(userTz)`（Tokyo user 在 Shanghai 浏览器：原本会被聚合到昨天的事件，现在按 Tokyo 日期聚合）
- `frontend/src/domains/timebox/components/month-view.tsx:147-151` — "+x more" 占位事件 baseDate 用 `lib/tz.ts:tzLocalToUtcMs(y, m, d, 23, 59, userTz)` 构造（user_tz 23:59 → UTC 等价时刻，与 `hhmmToIso` 写路径算法一致）

### 验证

- ✅ TZ-1 + TZ-2 + TZ-2.1 测试净 **-1 failed +1 passed**（baseline 3 failed → 2 failed，revert-regression 意外修复）
- ✅ tsc: 0 新增错误（225 baseline 全 pre-existing）
- ✅ dev server `/timeboxes` HTTP 200, 0 RSC 错误
- ✅ Node script 验证 `@date-fns/tz:format(date, str, { in: tz('Asia/Shanghai') })` 正确工作：`'2026-07-12T00:00:00.000Z'` → `'2026-07-12 08:00'`
- ⚠️ **`currentDate` prop**：仍由 caller（`use-timebox.ts:61`）传浏览器本地 `new Date()`；Tokyo user 在 Shanghai 浏览器下传给 rbc 的 `date` 是 Shanghai wall clock。严格来说 `currentDate` 也需 tz-aware（让 rbc 决定显示哪一周/月），但这属于 workspace 层职责，超出 TZ-2.1 范围。

### 设计依据

- **`@date-fns/tz` v1.4.1** = date-fns v4 官方 tz 包（`@date-fns/tz: ^1.0.2` 在 date-fns `peerDependencies` 列表），无需 `npm install`
- **`in: tz(tzName)` option**：date-fns v4 标准 tz 注入模式，所有 date-fns 函数接受 `in` option 通过 `tz(timeZone)` 提供 TZDate
- **localizer useMemo 缓存**：每次 tz 变化重建 localizer（user_tz 来自 DB 几乎不变，性能影响可忽略）
- **`byDay` 分组按 user_tz Y-M-D**：与 `deriveDisplayStatus` / `localDayKey` 等读时派生一致（之前都用浏览器本地，TZ-2.2 收口 localDayKey）

### 遗留（明确登记）

1. **`currentDate` prop** tz-aware（workspace 层职责，[TZ-2.3] 候选）
2. **`localDayKey`（reconcile 调度）接受 IANA TZ** → `[TZ-2.2]`（[026] OQ-6 defer）

---

## [TZ-2] 显示端 user_tz 透传 — React Context + Provider 注入（2026-07-12）

> 2026_07_12 — `[TZ-1]` Step 1 落地后，写路径 + handler internal arithmetic 已切 user_tz，但**前端显示端仍是浏览器本地时区或硬编码 `Asia/Shanghai`**。MVP Shanghai-only 下巧合 OK，但 Tokyo user 切到 `timebox-card` / `appointment-locked-card` 会显示错（硬编码 Shanghai 而非 user_tz）。Step 2 通过 React Context 把 server-side `getEffectiveTimezone(MVP_USER_ID)` 透传到所有显示端组件，让组件按 user_tz 显示。

### 改动

- **新增** `frontend/src/contexts/user-timezone-context.tsx` — `'use client'` `UserTimezoneProvider` + `useUserTz()` hook（套用 `app-context.tsx` 既有模式：`createContext<T | null>(null)` + `if (!ctx) throw` 硬失败守卫）
- **新增** `frontend/src/contexts/__tests__/test-utils.tsx` — `renderWithTz(ui, { tz? })` 测试 helper（默认 `Asia/Shanghai`，避免每个 fixture 手写 Provider）
- **修改** `frontend/src/app/layout.tsx` — server component 入口 `async`，调 `getEffectiveTimezone(MVP_USER_ID)` 拿 user_tz，注入 `<UserTimezoneProvider initialTz={userTz}>`
- **改造** 4 个显示端组件（[TZ-1] 硬编码 `'Asia/Shanghai'` 或 `getHours()` 浏览器本地 → 接收 `tz` 参数）：
  - `timebox-card.tsx:55-63` — `formatTime(iso, tz)` 加 tz 参数；`useUserTz()` 拿 tz
  - `appointment-locked-card.tsx:35-44` — `formatTime(iso, tz)` 加 tz 参数；`useUserTz()` 拿 tz
  - `timebox-timeline.tsx:33-34, 61-65, 76-91, 128` — `timestampToHours(ts, tz)` 加 tz 参数；`currentHour` 用 `getUserTzHour/Minute`；`useUserTz()` 拿 tz
- **Fixture 更新** 5 个组件测试文件 import `renderWithTz` + `render(<X)` → `renderWithTz(<X)`（timebox-list.regression / timebox-timeline.overlap / timebox-timeline.regression / timeboxes-workspace.revert / timeboxes-workspace.view-mode）

### 验证

- ✅ timebox 组件测试 **135/135 pass**（含 TZ-2 涉及的 5 个 fixture）
- ✅ 全 timebox 范围：**668/669 pass**（1 failed = pre-existing handlers-edit-appointment）
- ✅ tsc: **0 新增错误**（201 baseline 全 pre-existing）
- ✅ dev server `/timeboxes` HTTP 200, 0 RSC 错误
- ⚠️ **week-view / month-view rbc tz 注入 defer**：[TZ-2.1]（rbc API 不直接接受 tz prop）
- ⚠️ **`localDayKey` 接受 IANA TZ defer**：[TZ-2.2]（[026] OQ-6）

### 设计依据

- **MVP Shanghai-only + TZ-2 范围**：MVP 单用户，user_tz 实际值 = `Asia/Shanghai`（与 schema default + 系统 TZ 一致）。本步只是把硬编码 `'Asia/Shanghai'` 抽出成参数，让 Tokyo / UTC 等用户场景可正确工作。
- **不引入 client-side timezone 切换**：layout server-side 拿一次即可；如需 client 实时切换可加 `router.refresh()` 触发 server re-render（[TZ-2] out-of-scope）
- **Commit 边界合并**：1 commit（context + 4 个组件改造 + 5 fixture + docs；与 TZ-1 风格一致）

---

## [TZ-1] 时区治本 — user_tz 抽象层（DB + 系统时区 + Asia/Shanghai 三级 fallback）

> 2026_07_12 — `/ScheduleProposal` 添加的记录在 `/timeboxes` 显示 +8 小时根因：handler internal `[023.09] canonical UTC` arithmetic 与 `parse-timeboxes:36` "ISO=本地时刻字面读" 约定冲突；`hhmmToIso` 直接拼 `${date}T${hhmm}:00.000Z` 把 user 输入的 Shanghai 8:00 当 UTC 字面存（DB `2026-07-12T08:00:00Z`），Shanghai 浏览器 `getHours` 返 16（+8h）。架构治本方案（D）：DB 持久化 UTC + user_tz 配置 + UI 按 user_tz 显示；Step 1 落地核心抽象层（写路径 + handler internal arithmetic + DB 接线），显示端组件参数化留 [TZ-2]。MVP 单用户假设下 user_tz 默认 `Asia/Shanghai`（schema default + 系统时区兜底）。

### 改动

- **`src/lib/tz.ts`（新）** — 跨 Node/browser 一致时区 helper：`tzLocalToUtcMs(y, mo, d, h, m, tz)` (Intl 反向求 tz offset) / `getUserTzHour(date, tz)` / `getUserTzMinute(date, tz)` / `isoToHhmmInUserTz(iso, tz)` / `isoToLocalDatetimeInputInTz(iso, tz)` / `getSystemTimezone()`（`Intl` 兜底 'Asia/Shanghai'）
- **`src/lib/timezone-config.ts`（新）** — `getEffectiveTimezone(userId)`：DB `user_settings.timezone` → 系统时区 → 'Asia/Shanghai' 三级 fallback
- **`src/app/actions/user-settings.ts`（新）** — Server Actions `saveUserTimezone(tz)` / `getUserTimezone()`：client → DB 持久化（`TimezonePicker` 从 localStorage 改接到 DB）
- **`src/domains/timebox/cnui/surfaces/time-input-helpers.ts`** — `hhmmToIso(hhmm, date, tz='Asia/Shanghai')` 加 tz 参数；`(HH:MM, date)` 当 tz 本地时间转 UTC（Shanghai 8:00 → UTC 00:00）；新增 `isoOrHhmmToHhmmInTz(value, tz)`；`isoToLocalDatetimeInput(iso, tz)` 参数化
- **`src/domains/timebox/handlers/orchestration-handler.ts`** — `extractOccupiedSlots` / `appointmentToTier0Slot` / `detectConflictsViaPredicate` 从 `getUTCHours` 切到 `getUserTzHour/Minute`；`dayStart: 8, dayEnd: 22` 含义从 UTC hour 切 user_tz hour；`normalizeTimeField(proposalDate, time, tz='Asia/Shanghai')` 切 user_tz（保持 legacy 输出格式 `YYYY-MM-DDTHH:MM:SSZ`）；`contexts.userTimezone` 注入（`collectMaterials` 提取）
- **`src/domains/timebox/cnui/handlers.ts`** — submit 入口读 `getEffectiveTimezone(MVP_USER_ID)`，createTimebox + scheduleProposal 两分支 `hhmmToIso(it.startTime, it.date, tz)` 传 tz
- **`src/components/settings/timezone-picker.tsx`** — mount 时调 `getUserTimezone()` 覆盖 detected；保存调 `saveUserTimezone(tz)` 落库（不再只写 localStorage）
- **测试 fixture 更新（保留测试意图）** — `time-input-helpers.test.ts`:5 cases + 新增 4 cases 跨 tz（Tokyo/NY/UTC）+ 30/30 pass；`orchestration-handler.test.ts`:[023.09] 7 cases fixture 改 Shanghai 视角 UTC 串（如 `2026-07-05T22:00:00Z` → `2026-07-05T14:00:00Z` = Shanghai 22:00）+ `[023.10]` normalizeTimeField fixture 期望 `2026-07-05T00:00:00Z`；`cnui/__tests__/handlers.test.ts`:`[023.08] T2 G3` fixture 期望 `2026-07-05T00:00:00.000Z`

### 验证

- ✅ vitest base/head 对比：**0 净回归**（24 failed = 24 baseline failed，全部 pre-existing 与本分支无关）
- ✅ tsc 0 新增错误（201 个 pre-existing，与本分支无关）
- ✅ time-input-helpers.test.ts **30/30 pass**（含 4 个新增跨 tz 测试）
- ✅ orchestration-handler.test.ts **31/31 pass**（含 [TZ-1] user_tz canonical fixture 更新）
- ✅ cnui/handlers.test.ts **34/34 pass**（1 todo）
- ✅ dev server smoke：`/timeboxes` HTTP 200, 0 RSC 编译错误
- ⚠️ **数据迁移**：DB 中**既有 timebox 数据不修复**（用户决策 1）。Step 1 只防新 bug；旧脏数据需用户在 UI 看到偏差后手动调整（CreateTimebox 路径本就正确，ScheduleProposal 路径旧数据有 +8h 偏差需清理）
- ⚠️ **显示端组件参数化留 [TZ-2]**：MVP Shanghai-only 假设下，浏览器本地时区 = Asia/Shanghai，显示端 `getHours` 已正确显示；Tokyo user 需 [TZ-2] 把 `getEffectiveTimezone` 透传到所有显示端组件（`appointment-locked-card` / `MonthView` / `WeekView` / `timebox-timeline` 等）

### 关键决策

- **D 方案治本**（用户确认）：DB UTC + user_tz 配置 + UI 按 user_tz 显示，三层一致性
- **system timezone fallback**（用户确认）：未设置时区 → `Intl.DateTimeFormat().resolvedOptions().timeZone`
- **fixture 意图保留**（用户确认）：所有更新 fixture 保留测试意图（"Shanghai 22:00 在 DB 中怎么表示"），更新数据 + 期望
- **commit 边界合并**：6 子任务合并为 1 commit（TZ-1.2 + 1.3 + 1.4 紧密耦合，写路径 + handler internal + fixture 同步）

---

## [028.2] workspace.openAiPanel 真接 TimeboxOrchestrationHandler.onGenerate（2026-07-12）

> 2026_07_12 — `[028]` 架构债收口：workspace.openAiPanel（`timeboxes-workspace.tsx`）静态 mock proposals → 真接 handler.onGenerate；`cnui/handlers.ts` open scheduleProposal 调 onGenerate → 4 源归集 + §04 硬规则 + Tier0/1/2 + 5 维评分 → 注入 dataSnapshot；surface dataModel 扩 `score?/dimensions?`；AIOrchestratePanel 顶部加 `[data-testid=score-badge]` 5 维评分徽章。SDD 1 task ship-ready + `/browse` 抓 2 P0（[028] ship 时 `score` 未暴露 GenerationResult + ISO UTC→HH:MM helper 缺口）独立 fix commit。

### 改动

- `cnui/handlers.ts` scheduleProposal open 分支 — 新增 onGenerate 调用 + 异常降级（throw → `proposals=[]` + console.warn + UI 不阻塞），把 `proposalSet.proposals` + `score` + `dimensions` + `needConfirm` + `archetypeCandidates` + `confirmReason` 注入 `dataSnapshot`
- `timeboxes-workspace.tsx:openAiPanel` — `useCallback(async)` 改 `await openCnuiSurface('timebox', 'scheduleProposal', { date })`，新增 `aiProposalsLoading` / `aiNeedConfirm` / `aiScore` state + loading/error toast
- `timeboxes-workspace.tsx:handleAiConfirm` — 加 `scheduleProposal` accept 分支（`submitCnuiSurface('timebox', 'scheduleProposal', fields)` + batchId 写入 `revertableBatches`）
- `ScheduleProposal.tsx` dataModel — 加 `score?/dimensions?` 字段透传 `AIOrchestratePanel`；re-export `ArchetypeCandidate` 类型给 workspace 严类型（消除 I-2 `as never` lose-cast）
- `AIOrchestratePanel.tsx` — props 加 `score?/dimensions?` + 顶部加 5 维评分徽章（含细目 grid `coverage / noConflicts / energyMatch / highPriorityHit`）
- `orchestration-handler.ts:handle()` — return shape 加 `score: scoreResult.score, dimensions: scoreResult.dimensions`（[028] T7 ship 时漏，[028.2] /browse 抓 + 补）
- `usom/types/process.ts` — `GenerationResult` interface 加 optional `score? / dimensions?` 字段
- `time-input-helpers.ts` — 新增 `isoOrHhmmToHhmmInShanghai` helper（处理 ISO + HH:MM 双路径，bug fix #2 根因：`generateProposals:716` 直接 `formatTime` 写 HH:MM 不是 ISO）
- `handlers.ts` — 新增 `buildCnuiSurfaceIntent` helper（消除 3 处 `crypto.randomUUID() as never` type-pun，I-1 fix）
- 3 测试文件 +12 cases（cnui-handlers + workspace.openai + schedule-proposal surface）+ time-input-helpers.test.ts +26 contract locking cases
- `docs/superpowers/plans/2026-07-12-028-2-ai-panel-wireup.md` — 新建 mini-plan

### 验证

- `/qa` health **100 / 100**（+28.5 vs `[028.1]` 71.5 baseline；详见 `.gstack/qa-reports/qa-report-lifeware-2026-07-12.md`）
- vitest 18 files / 241 PASS / 0 fail / 1 pre-existing flake（handlers-edit-appointment 与 [028.2] 无关）
- tsc 199 = baseline（被改 14 文件 0 new error）
- pre-push hooks 全过（`validate:manifest` 0 errors / `validate:structure` ✓ / `validate:rules-registry` 6 项一致）
- `/browse` 端到端：dev 200 → @e7「AI 智能推荐」点击 → openAiPanel → `score-badge`「今日方案综合分 9.1 / 10」+ 4 维 grid（coverage 10.0 / noConflicts 10.0 / energyMatch 6.3 / highPriorityHit 10.0，restMeal 跳过 — archetype 数据不可得，符合 T7 数学定义）+ 3 proposal cards 真实时间（08:00–08:30 / 08:30–09:00 / 11:00–11:30）真接 onGenerate + 0 console errors
- 2A 枚举对齐：TimeboxStatus / TaskStatus / HabitStatus USOM ↔ DB CHECK 一致（[028.2] 无 USOM/DB 变更）
- 2B-2F：沿用 prior baseline，[028.2] 零 DDL 零 USOM 变更
- UI C-01~C-07：score-badge 用 `bg-primary/5` + `text-primary` + `text-body/70` 令牌色（C-01 PASS）；data-testid 暴露 E2E selector
- Constitution 约束 ID：[028.2] 无新约束引入
- mydocs/ 只读：本次会话未动 `mydocs/core/` 任一文件

### 已知 ship-then-polish backlog（不动，scope out）

- **I-3** revertableBatches state 隐式 coupling（"open 非空才覆盖" 语义，close-to-spec）
- **7 Minor**（score/dimensions reset 不分 branch / console 格式不统一 / mock 样板重复 / 双 selector / 文件头 verify / handleAiConfirm verify / helper 缺 throw test）
- **M-qa-1** aria-label 缺口（Chinese text label AT-readable 不阻断 ship）

### Meta-pattern

- 印证 [[feedback_post-ship-review-meta-pattern]] 第 5 次（r1 SDD whole-branch Approved ≠ ship-ready；`/browse` 真用户流抓 2 P0 仍能漏）
- 印证 [[project-cross-module-dispatch-blindspot]] 模式：cnui/handlers open path 未串 onGenerate，workspace 端 mock 假装接通是盲点
- Plan SSOT：`docs/superpowers/plans/2026-07-12-028-2-ai-panel-wireup.md`（v1 mini-plan）
- SDD ledger：`.superpowers/sdd/progress-028.2.md`
- QA report：`.gstack/qa-reports/qa-report-lifeware-2026-07-12.md`

---

## [neat-2026_07_12] /lifeware-neat 三件套 drift 收口（2026-07-12）

> 2026_07_12 — `/lifeware-neat` 收 3 项 drift：(1) `CHANGELOG.md` 缺 `[028]` / `[028.1]` 段；(2) `manifest.md` 缺 `[028]` / `[028.1]` 索引条目；(3) `docs/database-design.md` + `docs/usom-design.md` 页脚 `2026_07_11` 应 bump 至 `2026_07_12`（[028.1] ISS-002 fix 修复了 ScheduleProposal 端到端但无 schema/db 变更，仅文档漂移需对齐）。

### 改动

- `CHANGELOG.md` — 追加 `[028] ScheduleProposal 今日计划` + `[028.1] ISS-002 修复` + 本 `[neat-2026_07_12]` 三段（最新在上）
- `manifest.md` — 追加 `[028]` + `[028.1]` 索引条目（带 plan/CHANGELOG/cross-module-dispatch-blindspot learning 交叉引用）
- `docs/database-design.md` — 文档版本 `2026_07_11 → 2026_07_12`（无 schema 变更，footer 仅对齐）
- `docs/usom-design.md` — 文档版本 `2026_07_11 → 2026_07_12`（无 USOM 变更，footer 仅对齐）
- `docs/superpowers/plans/2026-07-11-028-schedule-proposal.md` — untracked 加入 git 跟踪（commit `773c1b9` 时漏 `git add`）

### 验证

- 2A 枚举对齐：TimeboxStatus / TaskStatus / HabitStatus / etc. USOM ↔ DB CHECK 一致（[028]/[028.1] 无 USOM/DB 变更，沿用 prior baseline）
- 2B 表结构总览：33 表 / 32 CREATE TABLE（沿用 prior baseline，`external_events` 是 §十二 阶段二预留，合法）
- 2C 视图/SQL 列名：[028] 无新视图，沿用 prior baseline
- 2D 残留文本：usom/database-design 无删除遗留片段
- 2E 版本号：`usom-design 2026_07_12`、`database-design 2026_07_12`（自洽）
- 2F 字段一致：[028] 无新字段，沿用 prior baseline
- UI C-01~C-07：[028.1] 改动仅 ScheduleProposal.tsx 1 文件 9+/7-，无新颜色/布局（C-01 PASS by diff scope）
- Constitution 约束 ID：[028.1] 无新约束引入
- mydocs/ 只读：本次会话未动 `mydocs/core/` 任一文件

### 未处理

- `specs/001~010` 共 10 个 speckit feature 目录仍在 active 状态（未归档 `specs/_archived/`）—— 历史遗留，超出本次 scope，待用户决策（沿用 [neat-2026_07_11] 登记）
- **[028.2] 架构债**：`workspace.openAiPanel` 仍写死 3 条 static mock proposals（[023.08] T5 placeholder），未替换为真 `orchestration-handler.onGenerate` 接线 —— 属 [028] T1-T4 残留 scope 债，单独 ticket
- **ship-then-polish backlog**（7 Important + 9 Minor）：NL `parseNL` zod schema 校验 / R12 migration SQL / M-9 PG E2E spec 等 —— 待开 next ticket 收口

---

## [028.1] ISS-002 修复 — ScheduleProposal items 不 spread 不存在的 payload（2026-07-12）

> 2026_07_12 — `/superpowers:systematic-debugging` 4-phase 独立 debug session 修复 ISS-002（`/qa` 后残留：`3 intentions 写库但 0 timeboxes 落库`）。**根因**：workspace.openAiPanel（`timeboxes-workspace.tsx:412-416`）静态填 3 条 mock proposals 形为 `{ id, title, startTime, endTime }` **不包含 `payload` 字段**（[023.08] T5 placeholder 未替换为真 `orchestration-handler.onGenerate` 接线）；原 `[028] a24e336` spread `p.payload` 在 mock 上是 no-op → items 仅剩 `{ date }` → `timebox_fields_valid` validator（`rules-registry.ts:99-138`）拒缺字段。**修复**：revert 为 picking 4 字段（`title/date/startTime/endTime`）；duration 非校验范围（[023] A2 撤销），sourceObjectId 非必填；HH:MM + date → ISO UTC convert 已就绪（`handlers.ts:580-585`）。诊断基础设施（`/tmp/iss002-debug.log` 临时 log）已撤回。

### 改动

- `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx` — `items` 构造从 `...p.payload + date:todayLocal` 改为 picking `title/date/startTime/endTime`（9+/7-）
- 临时 `appendFileSync(/tmp/iss002-debug.log, ...)` diagnostic（handlers.ts + loop 内 4 处）—— 已 100% 撤回

### 验证（端到端真实浏览器 + PG 落库）

- `browse` 触发 `/timeboxes → AI 智能推荐 → 接受 3 个时间盒`
- DB `timeboxes` 表新增 3 行 `planned`：09:00-11:00 深度专注 / 14:00-15:00 协作 / 16:30-17:00 复盘（ISO UTC 正确）
- console clean / panel 关闭 / view 刷新
- `vitest`：`handlers.test.ts 30/30` + `cnui-handlers.test.ts 17/17` + 9 surfaces tests `138 总` 全绿
- `tsc`：0 新增（199 total = pre-existing test mocks baseline）
- `git push gitee origin main`：pre-push hooks `validate:manifest` 0 errors / `validate:structure` ✓ / `validate:rules-registry` 6 项一致
- `/qa` 重测：health score **71.5 → 96.0**（ISS-002 残留关闭，ISS-001 仍 fixed）

### Meta-pattern learning

印证 `[[feedback_post-ship-review-meta-pattern]]` 第 N 次 + 上次 cross-module-dispatch-blindspot：
- `[028] a24e336` ISS-001 L2 修复"逻辑"正确（payload 字段应有）但**假设错了** —— surface 对 schema 假设 + mock vs real source 不一致
- **教训**：debug 必先 runtime verify schema 实际 shape（diagnostic log 看 `keys:['title','date','startTime','endTime']` vs `keys:['date']` 一目了然），不当 source-of-truth 假设
- SSOT：memory `project-028-schedule-proposal.md` ## /qa ISS-002 DEBUG 段（含 Phase 1-4 完整 evidence）

---

## [028] ScheduleProposal 今日计划（2026-07-11）

> 2026_07_11 — 用 `/ScheduleProposal` 替代并退役 smartTimeboxes。**Plan v2 修订后进 SDD**：10 task T1-T10 + 4 plan-eng-review findings + 14 codex outside voice findings 全折入 + whole-branch polish amend（I-1/I-2/I-4/I-5 + M-1/M-3 + R12 silent debt 文档化）。

### 决策（plan-eng-review + office-hours A 系列）

- **P1-P6 premise 收敛**：复用 [023.08] 基础设施 / §04 硬规则词典序 / generative action 不建表 / NL 一次结构化输出+结构性置信度 / 手动入口 / 5 维 rule-based 评分
- **R12 非 bug 决策**（eng review A4）：`getRevertableBatches`（`batch-proposals.ts:233-242`）filter 不含 sessionId（dead parameter），单复数不一致功能无害，撤销按 userId 查实际 work
- **manifest rename**: `createSmartTimeboxes → scheduleProposal`（K-block 保留 `create-smart-timebox` 入口防 revertSmartTimeboxes 引用断）
- **5 维评分规则**（T7）：定义聚合公式 + 能量 0-0.9→0-10 + 空集 0/0 guard + 数据不可得 vs 条件不满足
- **pathType 边界**（T6）：NL 解析移到 `onGenerate`（`handle()` 无 aiRuntime，`process.ts:345-349`）
- **dispatch 一致性**（T9）：ScheduleProposal.tsx 发 `scheduleProposal`（与 manifest `intent_triggers.action` + handler submit 分支名对齐）

### 改动（commit `50b39d7..83ddba9`）

- `frontend/src/domains/timebox/handlers/orchestration-handler.ts` — 4 源归集（模板+约定+任务+NL）+ 5 维评分 + batch recording
- `frontend/src/domains/timebox/cnui/handlers.ts` — scheduleProposal submit 分支（自含 batch recording 不依赖 `_source` 字符串 hack）
- `frontend/src/domains/timebox/cnui/surfaces/ScheduleProposal.tsx` — T9 新 surface，复用 [023.08] T5 范式（手写 [019.1]）
- `frontend/src/domains/timebox/cnui/constants.ts` — `SCHEDULE_PROPOSAL_ACTION` + `SCHEDULE_PROPOSAL_SURFACE` 防字符串漂移
- `frontend/src/domains/timebox/components/timeboxes-workspace.tsx` — handleAiConfirm 加 `scheduleProposal` 分支（[028.1] ISS-001 L1 修复起点）
- `frontend/src/app/actions/intent.ts` — `/smartTimeboxes` 重定向到 `/ScheduleProposal`
- `frontend/src/domains/timebox/manifest.yaml` — A 块 scheduleProposal intent_trigger + B 块无 lifecycle 变更（contract path）+ K 块 schedule-proposal surface

### Whole-branch verification

- `tsc 199 = baseline`（pre-existing 测试 mocks 不变）
- `vitest 26 fail = baseline`（handlers.test.ts + workspace.ai-submit + workspace.revert 4 个 pre-existing flake 隔离）
- pre-push hooks `validate:manifest` 0 errors / `validate:structure` ✓ / `validate:rules-registry` 6 项一致
- 全 10 SDD task T1-T10 完成 + 1 polish amend commit
- push gitee origin/main `50b39d7..83ddba9`（13 commits 含 polish）

### post-ship /qa（详见 [028.1] 段修复历史）

- ISS-001 P0 silent fail：`/qa` 抓双层（handleAiConfirm 缺分支 + items 漏字段），2 commit 修（`a24e336` + `74fd9b1`）
- ISS-002（残留）：3 intentions 写库 0 timeboxes 落库 → `[028.1]` standalone debug session 修（commit `773c1b9`）
- `/qa` health score: 50.75 → 71.5 → 96.0

### 架构债 + 延后

- **[028.2] workspace.openAiPanel 真 orchestration wiring**：`openAiPanel` 仍写死 mock（[023.08] T5 placeholder 未替换），[028] T1-T4 残留 scope 债，单独 ticket
- **ship-then-polish backlog** 7 Important + 9 Minor：NL `parseNL` zod schema / R12 migration SQL / M-9 PG E2E spec 等

---

## [neat-2026_07_11] /lifeware-neat 三项 drift 收口（2026-07-11）

> 2026_07_11 — `/lifeware-neat` 收 3 项 drift：(1) `[027-A]` 缺 `manifest.md` 索引条目；(2) `docs/database-design.md` 文档版本 `2026_07_09` 应 bump 至 `2026_07_11`（[027-B] §7.8 自愈说明未登记版本变更）；(3) `database-design.md` 缺 `[027-B]` 变更记录。

### 改动

- `manifest.md` — 追加 `[027-A] activityArchetype 界面规范处理 — Phase A：原型选择器统一` 索引条目（带 plan/spec/CHANGELOG/usom-design §3.4/§3.7 交叉引用），归档 [027-A] ship-ready
- `docs/database-design.md` — 文档版本 `2026_07_09 → 2026_07_11`；追加变更记录 `[027-B] (2026_07_11)`（§7.8 TemplateRow JSONB 形状重构 + `rowToTemplate` 读时 lazy 自愈旧形状）

### 验证

- 2A 枚举对齐：TaskStatus / HabitStatus / TimeboxStatus USOM ↔ DB CHECK 一致
- 2B 表结构总览：33 表 / 32 CREATE TABLE（`external_events` 是 §十二 阶段二预留，合法）
- 2E 版本号：`usom-design 2026_07_11`、`database-design 2026_07_11`（自洽）
- UI C-01~C-07（[027-B] PR）：PASS — PR-affected 12 TS/TSX 文件无 raw tailwind 颜色
- Constitution 约束 ID：[027-B] 无新约束引入，仅 schema.ts 既有 R-01~R-04 / T-01~T-04 头注引用
- mydocs/ 只读：本次会话未动 `mydocs/core/` 任一文件

### 未处理

- `specs/001~010` 共 10 个 speckit feature 目录仍在 active 状态（未归档 `specs/_archived/`）—— 历史遗留，超出本次 scope，待用户决策

---

## [027-A] activityArchetype 界面规范处理 — Phase A：原型选择器统一（2026-07-11）

> **Phase A ship-ready**：5 task (T1-T5) 全完成 + grep 闭环 + vitest/tsc 零新增。**核心**：统一为单一 `ArchetypePicker` + `variant` prop（card=带盒+h3 / inline=裸版），删除 `ArchetypePickerCard`；补齐 AI 匹配（TaskCreationCard / TaskEditCard / habit-form）+ `/tasks` 页面编辑入口（task-create-drawer / task-edit-zone）。

### 决策

- **D1** 单一组件 + variant：合并 `ArchetypePicker`（裸版）+ `ArchetypePickerCard`（带盒）→ 单一 `ArchetypePicker` + `variant?: 'card' | 'inline'` prop
- **D2** AI 匹补全：TaskCreationCard / TaskEditCard / habit-form 传 `enableAiMatch + title`（TaskEditCard 用 `editTitle` 非 `title`）
- **D3** 清除入口：所有消费方（含 /tasks 编辑）均支持 `onChange(undefined)` → 3-state 语义真正可达（undefined=skip / null=clear / string=set）
- **D4** `/tasks` 页面补齐：task-create-drawer（创建）+ task-edit-zone（inline 编辑），两个入口均支持 archetype 选择 + AI 匹配 + 清除
- **D5** Phase B 延后：Timebox 模板增强另起分支（避免对着未重构 API 空想）

### 改动（本任务）

- **T1** `ArchetypePicker` 加 `variant` prop（card/inline）+「清除」按钮 + TDD（variant=card 渲染 h3 + bg-surface-card）
- **T2** 迁移 Card 消费方：AppointmentFormFields / timebox-drawer → `variant="card"`（/browse 视觉验证 DOM 合并）
- **T3** 补 AI 匹配：TaskCreationCard / TaskEditCard / habit-form 传 `enableAiMatch + title` + CNUI 冒烟
- **T4** `/tasks` 页面补原型字段：task-create-drawer（创建）+ task-edit-zone（inline 编辑）+ 测试 + 持久化回归
- **T5** 删 `ArchetypePickerCard` + grep 闭环（3 注释文件更新）+ 测试清理（删重复 describe 块）

### 文档同步

- `docs/usom-design.md` — Task/Habit `activityArchetypeId` widen 到 `USOM_ID | null`（3-state clear：undefined=skip / null=clear / string=set，对齐 DB nullable FK；Timebox/Appointment 暂未 widen，pre-existing imprecision 登记 neat/后续）

### 验证

- 执行细节（vitest/tsc/grep/测试用例数）见 git + plan `docs/superpowers/plans/2026-07-11-027-a-archetype-unify.md` + memory；本文件只记文档级里程碑。
- /qa 发现并修复 TaskCreateDrawer `handleSubmit` 闭包漏 `activityArchetypeId` deps（选原型不落库），见 commit 1b0e971 + 回归测试 24aea05。

---

## [027-B] 时间盒模板增强（template enhance）— 2026-07-11

### 改动

- `TemplateRow` JSONB 形状重构：`{start,end}` → `{defaultStart, defaultDuration, earliestStart, latestStart, shortestDuration, activityArchetypeId}`，**无 DDL**。
- 仓储 `rowToTemplate` 读时 lazy 自愈旧形状（defaultStart=start、defaultDuration=hhmmDiffMinutes）。
- `TemplateCard` 列表行显示原型标签（custom）/来源徽章（习惯/任务/主线）。
- `RowEditor` 多行卡片化 + 行为分叉：custom 可编辑原型与全部时间/约束字段；来源行原型只读派生；habit 时间/约束只读、task/thread 可编辑（详见 plan「设计精炼」）。
- `validateTemplateRow` 纯函数 onBlur 校验。

### 决策

- 行为矩阵精炼 spec §3.4：task/thread 无时间来源，时间/约束保持可编辑（仅 habit 锁定）。
- 原型取值：来源行**读时派生**自来源对象 activityArchetypeId（非快照）。

### 验证

- vitest baseline=head 零新增；tsc 0 新增错误；pre-push hooks 全过。

---

## [neat-2026_07_08] /lifeware-neat 数据库设计补 CREATE 段（2026-07-08）

> 2026_07_08 — `/lifeware-neat` 检测到 §二 总览有 4 张表 (`activity_archetypes` / `user_audit_log` / `user_settings` / `memory_episodes`) **缺 CREATE TABLE 段**（历史累积 drift）。补 4 段 `\`\`\`sql\`\`\`` 块（与 schema.ts pgTable 一一对齐），§二 总览 33 表 vs CREATE 31 表，剩 2 张差异 (`ai_sessions` / `external_events`) 是 §十二 阶段二预留，合法。

### 改动

- `docs/database-design.md`：
  - §七 `activity_archetypes` 补 CREATE 段（12 列 + 2 索引）
  - §七 `user_audit_log` 补 CREATE 段（8 列含 `action IN('create','update','delete')` CHECK + 2 索引含 `created_at DESC`）
  - §十三 `user_settings` 补 CREATE 段（7 列含 `timezone DEFAULT 'Asia/Shanghai'` + `uniq_user_settings_user` UNIQUE INDEX）
  - §十三 `memory_episodes` 补 CREATE 段（9 列含 `session_id REFERENCES ai_sessions ON DELETE SET NULL` + 2 索引）

### 验证

- 2B 互验：CREATE TABLE 段数 27→**31**（+4 张表），§二 总览一致
- 2 张 §二 总览 vs CREATE 差异均属 §十二 阶段二预留（合法）

---

## [023.13] 时间盒持续优化（2026-07-07）

> 2026_07_07 — **ship-ready**：11 task (T0-T10) 全完成 + 4 commit whole-branch 修复波 + 3 commit `/qa` 修复 + push gitee origin/main @ `7466534`。**核心**：JSONB 演进免 DDL 迁移（`execution_record` + 4 字段）；`energyActual` 单值度量 1-10（绕开 [023] D8 4 维能量禁令）；ARCHITECTURE TD-019/023 闭环。

### 决策

- **D1** JSONB schema 演进：`timeboxes.execution_record` 加 4 字段（`actualStartTime?` / `actualEndTime?` / `focusMinutes?` / `energyActual?`）= 零 DDL 迁移（mapper 不删未知键/不补缺键，直接 spread 透传）
- **D2** `energyActual` 是单值度量（1-10），默认取 archetype 4 维 `EnergyCost` 均值；无 archetype 留空；显式绕开 [023] D8「`EnergyState` 单维 vs `EnergyCost` 4 维」分层隔离（避免宪章 amendment）
- **D3** P0 持久化修复（AM1）：SM `updateStatus` 不再丢 executionRecord payload 字段（state-machine/index.ts:289-300 updateFields 单 UPDATE 写列）
- **D4** P2 打卡专区：5 字段（actualStart/End/focusMinutes/energyActual/notes）双向 detail flow — TimeboxDrawer edit 模式（T6 AM4 archetype 接线）+ LogTimebox CNUI surface per-item（T8）
- **D5** P3 revert 确认清空分支：AM3 复用 `updateFields(id, {executionRecord: null}, userId)`（不引入新 repo 抽象）；AM7 守卫保留（无 opts.clearExecutionRecord 时 logged+executionRecord 抛错）
- **D6** A1 STATUS_TRANSITION_ACTIONS 派生：build-status-transition-actions.ts 用 `loadDomainManifest` 动态派生（rules-registry.ts 同步 AM2 core/rule-engine 双副本），validate:rules-registry pre-push 校验
- **D7** A2 validate:rules-registry pre-push 接线：scripts/validate-rules-registry.ts fail-closed 检查 `lifecycle.transitions` 与 build 派生一致
- **D8** UI 改造：紧凑模式 planned 卡 `[✓ 一键打卡][打卡][取消][删除]` 4 按钮 + flex-wrap 拆独立行（兼容性零回归：logged/cancelled 1-2 按钮不换行）；批量多选（selectMode=true + checkbox + 批量打卡 + 批量取消）
- **D9** MiniCalendar 上下月翻页：viewMonth state + prevCurrentMonthRef 锁定规则（用户翻 ≠ currentDate 跨月）
- **A1 dual** orchestrator executeFieldStateWrite 守卫 `domainId === 'tasks'`：其他域走 sm.execute（[QA BUG-2 修复]）；timebox 不需 mutation service 等价物
- **A1 命名空间陷阱**：`intent_triggers` (manifest yaml) ≠ `transitions` (lifecycle map) — A1 derivation 走 `transitions` 字段，不是 deprecated 的 `intent_triggers`（[QA BUG 的邻近纠错]）

### 改动（本任务）

- **T1** A1 STATUS_TRANSITION_ACTIONS 派生（`src/domains/timebox/lib/build-status-transition-actions.ts` + rules-registry.ts 同步 + timebox-rule-engine.ts AM2 双副本） + `timebox-status-transition-guard.test.ts` 6 dynamic cases
- **T2** validate:rules-registry pre-push 校验（`scripts/validate-rules-registry.ts` + 纯 `deriveStatusTransitionActions(rawManifest)` 提取） + 6 items 一致性
- **T3** USOM `DetailedExecutionRecord` +4 optional fields + Tier 2 docs (`usom-design.md` §3.9, `database-design.md` §4.7) + mapper 后向兼容测试 `execution-record-compat.test.ts` 2 cases
- **T0/AM1** state-machine SM `executionRecord` write branch（guards `transition.to === 'logged' && proposal.payload['executionRecord']`）+ cnui/handlers.ts:567 flat→executionRecord object wrap
- **T4** defaultEnergyActual helper (4-dim mean round) + ExecutionDetailFields 共享 controlled 5-field component (110 行)
- **T5** `revertTimebox(id, opts?: {clearExecutionRecord: boolean})` — AM3 复用 updateFields + AM7 守卫保留；写入口（timebox.ts:205 直调 repo.updateFields）登记 WRITE_ENTRY_EXEMPTIONS (TD-023)
- **T6** TimeboxDrawer edit 模式接入 ExecutionDetailFields（AM4 archetype 接线 + activityArchetypeId 6 路同步）— archetype 字段 AM4 全链路
- **T7** 卡按钮重排 + quickLog（一键 simple log 不开 drawer）+ batch mode（多选）+ AlertDialog revert confirm（"此操作将清除该时间盒的执行记录（实际时长、深度专注、能量消耗、执行详情），不可恢复"）+ handleBatch
- **T8** `LogTimebox.tsx` per-item `detailedOpen: Record<id, boolean>` + ExecutionDetailFields integration + handler `logTimebox` payload-wrap alignment (cnui/handlers.ts:554-602)
- **T9** MiniCalendar `viewMonth` state + `prevCurrentMonthRef` 锁定规则（区分 user 翻月 vs currentDate 跨月）
- **T10** `__tests__/revert-regression.test.ts` (TD-019 regression) + `docs/tech-debt/TD-019...md` 关闭段 + tech-debt/README 状态 🔴→✅
- **Whole-branch fix wave (4 commit)**：
  - `b2d1f4d` LogTimebox open-path archetype wire + 双 notes 收口
  - `c6e0d6e` spec §5 sync test-aligned (prevCurrentMonthRef)
  - `32049d9` manifest.md conflict markers + prebuild 加 validate-rules-registry + TD-023 exemption
  - `169180c` docs(tech-debt): TD-023 登记
- **`/qa` 修复 (3 atomic commit)** — 真实 PG 验证 E2E：
  - `24160b1` ISSUE-001: 紧凑模式 planned 卡补 取消/删除 + 拆独立按钮行
  - `df8dc94` ISSUE-002: executeFieldStateWrite 守卫 tasks 域 (orchestrator 500 错误修复)
  - `7466534` ISSUE-003: 'log' 按钮开 ExecutionDetailFields 抽屉（不再直接 log）

### 验证

- vitest base=head：24 fail = baseline (零新增回归)
- tsc 121=121 (本任务改动 0 新增；QA 修复 0 新增)
- validate:manifest 0 errors
- validate:rules-registry 6 items PASS (cancelAppointment/cancelTimebox/completeAppointment/logTimebox/revertAppointment/revertTimebox)
- validate:structure 全部通过（WRITE_ENTRY_EXEMPTIONS 接入 timebox.ts 后）
- 真实 PG (lifeware_dev) E2E：5 场景过 (一键打卡/打卡专区/批量/回退确认/cancelled 直退) + 6/7 QA 场景 PASS

### 范围

- 21 文件（16 SDD impl + 3 /qa 修复 + 4 whole-branch fix 折叠）：orchestrator/index.ts (1 line guard), state-machine/index.ts (AM1 updateFields), usom/types/objects.ts (+4 fields), timebox components + cnui/handlers (双 notes + detailed wrap), scripts/validate-rules-registry.ts, tech-debt/TD-019 (close), tech-debt/TD-023 (登记)

### 设计 authority

- Design: `docs/superpowers/specs/2026-07-07-023-13-timebox-optimization-design.md`（APPROVED by office-hours + plan-eng-review 9/10）
- Plan: `docs/superpowers/plans/2026-07-07-023-13-timebox-optimization.md`
- QA 报告: `.gstack/qa-reports/qa-report-timeboxes-2026-07-07.md` + `baseline.json` (health 50→95, 3 bugs fix)
- review chain: plan-eng-review GSTACK REVIEW REPORT (AM1-AM5 folded) + whole-branch review (4 Important + 11 Minor → 4 fix commits folded) + /qa E2E（6/7 PASS）

---

## [023.12] 三域生命周期语义重构（2026-07-06）

> 2026_07_06 — **ship-ready**：14/15 task 完成（T1a / T1b / T2 / T3 / T4 / T5 / T6 / T7 / T8 / T9 / T10 / T13 / T14 + T11 docs 本任务），T12 验证门待跑。T11 docs 同步 + T9 fix wire cycleStatus at 5 call sites（reviewed lock EFFECTIVE）。**核心思路**：把 timebox / cycle / appointment 三域持久态收敛到「只跟踪用户行为」——时间态一律读时派生显示。

### 决策

- **D1** appointment 时间态（in_progress / expired）读时派生显示，与 timebox running/overtime 同模式（`derive-display-status` 共享工具）
- **D2** appointment 回退 cancelled/completed → scheduled（对称 timebox logged/cancelled → planned）
- **D3** 方案 A（单分支三域同 ship）+ status 是 TEXT 无 PG enum（迁移零类型 DDL）
- **D4** `currentTimebox` 保留：orchestrator 扫描 planned timeboxes，用 T3 `derive-display-status` 填充第一个 running（codex #3 from plan-eng-review）
- **D5** `process.env.TZ='Asia/Shanghai'` 在 `next.config.ts:3`（T14，根因修复 `localDayKey` 在容器化部署时的时区脆弱性）
- **D6** cycle 列 rename：`started_at → approved_at`、`ended_at → finished_at`（reviewed_at 不变；语义对齐 status 收敛；AM6，T1b）
- **D7** timebox revert 守卫：若 `executionRecord != null` 抛「请先清理执行记录再回退」（AM7，T4）——等价于 logged → planned 路径被拦截（logged 行必有 executionRecord），仅 cancelled → planned 可直接回退
- **D8** appointment task/habit cancel/complete guard 降级 TODO（OQ-1，无 junction 存在；留 `// TODO [027]: appointment task/habit guard`，属后续 ticket）
- **🔁 反转 [026] D2 reversal（关键决议，codex #1）**：本轮**有意反转**[026] 推出的「appointment 5 态存储 + lazy reconcile 写库」模式，**退回读时派生模式**。理据："D2 reversal 的派生模式无法 enforce 写入约束 + 无成本"——本轮经重新评估后认为写入约束可由 SM 持久态单独 enforce（cancelled/completed/scheduled 终态已足够 enforce 不可删/不可改），时间态派生足以回答"未实施计划"统计。代价已被接受：`currentTimebox` / overlap rule 改应用层派生（plan T13、T7），SQL 级"查过期约定"不再可能（单用户 MVP 可接受）。详见 design doc `docs/superpowers/specs/2026-07-06-023-12-lifecycle-simplify-design.md` §「与 [026] D2 reversal 的关系」。

### 改动

- **三域 manifest lifecycle 重写**：`domains/timebox/manifest.yaml`（timebox + appointment 两对象 block B + block D list_actions + block F subscribed_events 删 TimeboxStarted/Ended/Overtime 加 TimeboxReverted/CycleReverted/AppointmentReverted）+ `domains/okrs/manifest.yaml`（cycle block B + action rename）
- **status union 收敛（schema.ts `enum: [...]` 数组改写）**：
  - `timeboxes.status`：6 值 `{planned, running, overtime, ended, cancelled, logged}` → **3 值** `{planned, logged, cancelled}`
  - `cycles.status`：5 值 `{draft, not_started, in_progress, ended, reviewed}` → **4 值** `{draft, approved, finished, reviewed}`（`not_started` / `in_progress` 合并为 `approved`；`ended` 改名 `finished`）
  - `appointments.status`：5 值 `{scheduled, in_progress, expired, cancelled, completed}` → **3 值** `{scheduled, cancelled, completed}`（`in_progress` / `expired` 不持久化）
- **5 个时间戳列 drop（migration 0034）**：`timeboxes.started_at` / `timeboxes.ended_at` / `timeboxes.overtime_at` + `appointments.in_progress_at` / `appointments.expired_at`；**2 个 cycle 列 rename**：`cycles.started_at → approved_at`、`cycles.ended_at → finished_at`（`reviewed_at` 不变）
- **cycle 2 列 rename**：`cycles.started_at → approved_at`、`cycles.ended_at → finished_at`（reviewed_at 不变；语义对齐 status 收敛；AM6，T1b）
- **cycle SM action rename**：`startCycle / planCycle` 二选一分支塌缩为单一 `approve`；`endCycle → finish`；`review` 不变；**新增 `revert`**（reviewed → finished）
- **cycle guard ALLOWED map 重写**：5 key → 4 key（`draft/approved/finished` 各自 `{edit_objective, edit_kr}`，`reviewed = {}` 锁 objective 写）
- **派生显示工具**：`derive-display-status.ts`（timebox+appointment 共享；TDD 9 cases）
- **reconcile-appointments plural 写库入口删除** + singular `reconcile-appointment.ts` 改造为 badge 派生函数（输入 `Appointment[] + now`，输出 `{appointmentId, badge: 'in_progress' | 'expired' | null}[]`）
- **currentTimebox 派生填充**（AM4，T13）：orchestrator 扫描 planned timeboxes，用 `derive-display-status` 填充第一个 running（保留字段语义）
- **三页 UI 操作按钮重做**：
  - `/timeboxes`：删除 / 打卡 / 回退（state-gated），无 开始/结束；running/overtime 派生显示
  - `/okrs`：编辑/审批/结束/复盘/回退/删除（guarded）；tabs 4 态；reviewed cycle 锁定 objective 写
  - `/appointments`：编辑/取消/完成/回退（guarded）；in_progress/expired 派生 badge；无 reconcile 写库
- **process.env.TZ='Asia/Shanghai'** 写入 `next.config.ts:3`（T14，根因修复 `localDayKey` 在容器化部署时的时区脆弱性）
- **migration 0034_023_12_lifecycle_simplify.sql**：TRUNCATE timeboxes/cycles/appointments CASCADE + DROP 5 时间戳列 + RENAME cycle 2 时间戳列 + journal idx=34。`.down.sql` 反向重建废弃列（prod 不需要，dev 回滚兜底）
- **CI 校验**：`npm run validate:manifest` = 0 errors / `npm run validate:domain-structure` ✓
- **Tier 2 docs 同步（本任务）**：`docs/usom-design.md`（§3.5a cycle + §3.9 timebox + §3.13 appointment 三段状态机更新 + 派生显示说明） + `docs/database-design.md`（§4.0 cycles + §4.7 timeboxes + §4.X appointments 三表 status 合法值表 + 删除/重命名列标注 + 迁移 0034 摘要）

### 验证

- vitest base=head：**零新增 regression**（47 baseline FAIL 均为 pre-existing DB-auth，无本轮相关失败）
- tsc 92→92：**零新增 error**（92 pre-existing ship-then-polish；本轮 T1a/T2/T3/T4/T5/T6/T7/T8/T9/T10/T13/T14 净增 0 错）
- `npm run validate:manifest`：**0 errors**（2 WARN + 2 INFO pre-existing）
- `npm run validate:domain-structure`：✓ pass
- migration 0034：dev DB 跑通（TRUNCATE 3 表 + DROP 5 列 + RENAME 2 cycle 列），journal idx=34
- /browse 三页视觉验证：T12 待跑（`/timeboxes` `/okrs` `/appointments` 操作按钮 state-gated + 派生 badge 显示）
- pre-push hooks 全过：validate:manifest 0 errors + validate:domain-structure ✓

### 范围

- ~30 文件（manifest 重写 + schema + USOM 类型 + SM/lifecycle + guard + 仓储 + rules + CNUI + UI + actions + 测试同步 + docs）
- 14 impl commit + 1 docs commit (T11)
- 无 PG enum 重建、无破坏性 schema 变更（仅 DROP 5 个 nullable 时间戳列 + RENAME 2 cycle 列 + status enum 数组在 app 层 pivot）

### 设计 authority

- Design: `docs/superpowers/specs/2026-07-06-023-12-lifecycle-simplify-design.md`（APPROVED by /office-hours）
- Plan: `docs/superpowers/plans/2026-07-06-023-12-lifecycle-simplify.md`
- review 链：plan-eng-review GSTACK REVIEW REPORT + whole-branch review

### 后续 defer（不在本轮）

- OQ-1 留下的 `// TODO [027]: appointment task/habit guard`（schema 无 junction 基础，留后续 ticket）
- OQ-5 能量维度宪章缺口（constitution amendment 议题，与本轮无关）
- 「SQL 级查过期约定/COUNT 运行中时间盒」能力：派生模式无法 SQL 查询；单用户 MVP 接受；报表/分析需求时再考虑物化视图
- drizzle snapshot 重置（沿用 F2 convention）

### 遗留债 →

- [[TD-016]] · 🟠 · `cross-domain` · 测试 fixture 漏改（status 收窄与字段删除后,3 处 test fixture 未同步,tsc 累计 9 错）→ [023.13] 收口
- [[TD-017]] · 🔴 · `lifeware-timebox` · 生产代码漏跟 status 收窄（timebox.ts:262 + intent.ts:126-128 仍读被删字段与死状态）→ [023.13] 收口
- [[TD-018]] · 🟡 · `cross-domain` · pre-existing 写入口连锁债（tasks/hooks.ts 死 action + generic-repo-adapter 死 repo 引用,[018] G3 + [019.1] 退役 Adapter 连锁未清完）→ [023.13] 收口
- [[TD-019]] · 🔴 · `lifeware-timebox` · STATUS_TRANSITION_ACTIONS 漂移：revertTimebox/revertAppointment 漏注册 100% 阻断「回退」/「撤销完成约定」按钮 → **已 hot-fix**(加白名单 + 6 守护测试),A1 自动化生成 + A2 pre-push hook 预防 → [023.13] 实施

---

## [docs-cleanup] — TD-020 conflict markers 解决（2026-07-07）

> 2026_07_07 — `/lifeware-neat` skill 一次解决 14 个 diff3 conflict block（`docs/usom-design.md` 5 + `docs/database-design.md` 7 + `CHANGELOG.md` 2 = 共 42 marker 行）。统一采用 `Updated upstream` 作 canonical side，内容完整性自动校验（`type AppointmentStatus = | 'scheduled' | 'cancelled' | 'completed'` union + `type TimeboxStatus = 'planned' | 'logged' | 'cancelled'` 3 态 + `[026.01]` section 保留 + schema.ts 3 值对齐）。原 [023.12] neat-sync commit 29b409a 留下的 3 文档冲突债（TD-020 跟踪）→ 已 resolved。

## [026.01] 约定 CNUI 优化 + archetype 全链路集成（2026-07-07）

> 2026_07_07 — 5 SDD task 完成（T1 数据层 / T2 解析器 / T3 handler+server action / T4 EditAppointment 重写 / T5 docs 同步本任务）。**3 件事一次性**：(1) `/createAppointment` 保留 + 加 archetype picker；(2) `/editAppointment` 重写对齐 `/editTimeboxes` 范式（解析优先 + 降级 + 双视图 + 分页 + 删除集成）；(3) `activityArchetypeId` 全链路接入（DB → USOM → mapper → 表单 → handler → server action → AI 匹配）。

### 决策摘要

- **archetype 范围**：全链路 AI 匹配（DB+USOM+mapper+表单+handler+server action+UI 端 `matchArchetypeForTitle`）
- **editAppointment 模式**：对齐 `/editTimeboxes` 范式（解析优先 + selecting 降级 + 双视图 + 分页 + 删除集成）
- **「未知的卡片类型」**：现状已修复（CNUI surface 双注册 + manifest K-block + intent_trigger A 区块四路注册闭合），任务文档描述过期
- **列表范围**：`scheduled+in_progress`（`findActive()`）

### 改动清单

- DB migration 0035：`appointments` 加 `activity_archetype_id` 列 + FK + 索引 `idx_appointments_archetype`（IF NOT EXISTS 幂等）
- USOM `Appointment` + `AppointmentSummary` 加 `activityArchetypeId` 字段（nullable，对齐 timebox.activityArchetypeId）
- mapper 双向读写 archetype
- manifest `field_metadata.appointment` 加 archetype 元数据（type=string）
- `AppointmentFormFields` 嵌入 `<ArchetypePickerCard enableAiMatch title={...}>`（4 字段 → 5 字段）
- 新建 `parseAppointmentIntent`（参照 `parse-timeboxes.ts` 范式，6 测试）
- handler `open('editAppointment')` 重写为解析优先模式（返回 `dataSnapshot: { mode, selectedId, prefill, status, items, originalPrompt, parseReason, readOnly }`）
- handler `submit('editAppointment')` 增加 `op='delete'` 分支
- server action `createAppointment` / `updateAppointment` 加 `assertArchetypeOwned` owner-check
- server action `updateAppointment` 加 `APPOINTMENT_UPDATE_ALLOWED_FIELDS` 白名单防绕过状态机
- `EditAppointment` 重写：双视图 + 分页 5/页 + 删除集成 + AlertDialog 二次确认

### 验证结果

- vitest base=head 失败集合零新增
- tsc 零新增错误
- `validate:manifest` 0 errors
- `validate:domain-structure` ✓
- 浏览器 E2E 4 场景（创建 AI 匹配 + 编辑解析成功 + 编辑降级 selecting + 编辑删除）

### 风险与缓解

- DB 加列 + FK：IF NOT EXISTS 幂等 + nullable + ON DELETE SET NULL（archetype 删除不影响 appointment）
- LLM 解析 prompt 质量：单元测试覆盖 4 路径，失败时降级 selecting 不阻塞
- 删除按钮误操作：AlertDialog 二次确认（参照 [023.04] 范式）

### 参照

- Spec SSOT: `docs/superpowers/specs/2026-07-06-026-01-appointment-cnui-optimization-design.md`
- Plan SSOT: `docs/superpowers/plans/2026-07-06-026-01-appointment-cnui-optimization.md`

---

## [026.02] 约定管理优化（§1 CNUI bug fix + §2 /appointments 重构）（2026-07-08）

> 2026_07_08 — 10 SDD task（T1 §1 fix + T2 纯函数 + T3-T8 6 组件 + T9 Workspace 整合 + T9.5 UX 恢复 + T9.6 测试 mock + T10 加载窗口扩窗）+ T11 docs/ship。**修复 [026.01] 客户端 CNUI surface 漏注册的回归** + **/appointments page 重构为 Day/Month 双视图 + 筛选 + Banner**。

### 决策摘要

- **§1 bug fix root cause**：[026.01] 仅注册了 server `surfaceHandlers`，client `register-client-surfaces` 漏 3 个 appointment surface，导致 `/createAppointment` /`/editAppointment` /`/deleteAppointment` 报「未知的卡片类型」（per [[project-cnui-surface-dual-registration]]）
- **§2 视图模式**：严格按 dev doc，日/月两档（不做 Week）；复用 [023.06] view-mode 模式，状态名 `viewMode`（避免与 [023.06] `dateMode` 跨 workspace 术语冲突，spec §7.2）
- **§2 月视图**：全月日历网格（参照 /timeboxes MonthView）
- **§2 筛选**：status + 日期范围（dev doc 要求；不做 people/archetype 多维筛选）
- **§2 Banner**：沿用 timebox 图片集（`domainId="timebox"`），无 appointment 独立 banner
- **§2 IRON RULE**：新建独立 `AppointmentMiniCalendar`，不污染 timebox `MiniCalendar` IRON RULE 守护测试

### 改动清单

- **§1 fix**：`frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts` 补 3 行 `cnuiRegistry.register('timebox', 'create-appointment' / 'edit-appointment' / 'delete-appointment', ...)` + IRON RULE 守护测试
- **§2 新增组件**（6 个）：
  - `AppointmentPageBanner`（T3，包装 PageBanner）
  - `AppointmentViewToggle`（T4，日/月切换，a11y aria-pressed）
  - `AppointmentFilterBar`（T5，shadcn Select + 本周/本月快捷）
  - `AppointmentMiniCalendar`（T6，独立组件，过期/未过期双色 + 42 天格 + a11y grid + IRON RULE 不破 timebox）
  - `AppointmentDayView`（T7，两栏：左列表 + 右本月日历 + per-item 动作按钮 + multi-select）
  - `AppointmentMonthView`（T8，全月日历网格 + 计数 + 状态色）
- **§2 纯函数**：`filterAppointments(items, status, range)` (T2，6 TDD 测试，闭区间，readonly input)
- **§2 Workspace 整合**（T9）：`AppointmentWorkspace` 新增 viewMode / filterStatus / filterRange / selectedDate state；视图分发（DayView | MonthView）；MonthView 点日期自动切日视图；restore [023.12] T10 的 per-item Edit/Complete/Cancel/Revert 按钮 + multi-select delete
- **§2 加载窗口**：`/appointments/page.tsx` -7d → -90d，与 Workspace reload 一致（避免 reload 丢数据）

### 验证结果

- vitest base=head 失败集合零新增（47 → 47，含 IRON RULE 4/4 守护）
- tsc 零新增错误（变更文件 0 错；5 个 `as any` 是 baseline 既有）
- `validate:manifest` 0 errors（timebox domain 无新增问题）
- `validate:domain-structure` ✓
- 新增测试数：7 单元 + 2 回归守护 + 0 E2E（/browse 因环境约束未自动执行，留人工验证）

### 风险与缓解

- **§1 修复回归风险**：用新守护测试 `register-client-surfaces.test.ts` 显式 assert 3 surface 在 client 表（防 [026.01] 漏注册模式再现）
- **§2 状态命名冲突**：明确 `viewMode` vs [023.06] `dateMode`，spec §7.2 文档化
- **§2 MiniCalendar IRON RULE**：T6 用独立组件路径（`appointment-mini-calendar.tsx`）而非复用/扩展 timebox MiniCalendar，回归测试 `mini-calendar.regression.test.tsx` 4/4 持续通过
- **§2 T9 UX regression**：T9 整合后 DayView 是纯展示，删掉了 inline 列表的 Edit/Complete/Cancel/Revert 按钮 + multi-select delete（用户决策后 T9.5 fix 全部恢复）
- **T6 测试日期漂移**：brief 硬编码 2026-07-10 假设今天 7-15，实际 7-8。T6 fix 用 `vi.useFakeTimers({ toFake: ['Date'] })` + 相对 offset 锁定（commit 5f0d5b1）

### 遗留 / Follow-up

- **TD-022 5 项 deferred**（archetype clearing 语义 / UUID 验证 / perf N+1 / originalPrompt banner 等）→ 拆 [026.02.1] follow-up，本任务不解决
- **DayView `as any` casts** (baseline 既有) — 5 处 `as any` 在 server action 调用处，需后续用 proper USOM ID 类型替代
- **T8 " 条" 后缀 UX polish** — component 用纯数字（`{info.count}`），T9 整合时未补「条」字，建议 whole-branch 阶段补或记入 [026.02.1]
- **vitest globals tsc 噪声** — 项目 pre-existing baseline pattern，新增 `it()` 会增加同源错误

### 参照

- Spec SSOT: `docs/superpowers/specs/2026-07-08-026-02-appointment-management-optimization-design.md`
- Plan SSOT: `docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`
- Dev Doc: `mydocs/dev/026.02-约定相关优化.md`

---

## [026.02.1] post-ship review follow-up（2026-07-08）

> [026.02] SHIP 后 `superpowers:requesting-code-review` 触发的 post-ship review，1 项 Important 修复 + 7 项 Minor 登记。

### 修复

- **I-1 mk() 返回类型缩窄 → TS2322 回归**（`appointment-workspace.test.tsx`）
  - **根因**：[026.02] T9 (commit `8f06271`) 引入 `mk()` fixture helper，未给显式返回类型，TS 推断把 status 缩窄成 `'scheduled'` literal，导致 overrides 中的 `status: 'completed' / 'cancelled'` 触发 TS2322
  - **修复**：定义 `MkItem = Omit<typeof baseItem, 'status' | 'detail' | 'people'> & { status: 3 态联合; detail/people optional }` + 显式返回类型注解
  - **验证**：tsc TS2322 总数 12 → 11（appointment-workspace.test.tsx 错误数 1 → 0）；vitest 26/26 pass（workspace 18 + mini-calendar regression 4 + register-client-surfaces 4）；[026.02] 其他变更文件 0 tsc regression

### 登记 follow-up（defer 到后续任务）

| # | 项目 | 类型 | 来源 |
|---|---|---|---|
| I-2 | T8 月视图格子计数「条」后缀补全（plan vs 实现对齐） | UX cosmetic | code-reviewer |
| M-1 | 5+ 处 `[baseItem] as any` 测试 casts（用 MkItem 类型替代） | Test typing | code-reviewer |
| M-2 | `mockGetItinerariesByRange` 命名 stale（[023.05] itinerary→appointment rename drift） | Naming | code-reviewer |
| M-3 | `appointment-filter.test.ts:14` hardcoded date `'2026-07-08T10:00:00.000Z'`（建议改相对 offset + fake timers） | Test determinism | code-reviewer |
| M-4 | `ymdKey(d: Date)` 函数 3 处重复（`appointment-workspace.tsx:124` + `appointment-mini-calendar.tsx:21` + `appointment-month-view.tsx:17`） | DRY | code-reviewer |
| M-5 | T9.5 click-to-toggle-select UX affordance user-testing（点击 item 是 toggle 多选还是打开 Edit？） | UX validation | code-reviewer |
| M-6 | `handleDelete` sequential awaits → `Promise.allSettled`（多选删除性能） | Perf | code-reviewer |
| TD-022 | 5 项 deferred（archetype clearing 语义 / UUID 验证 / perf N+1 / originalPrompt banner / 浏览器 E2E） | From [026.02] | existing |

### 推回（no-op）

- **I-3 `reload` `useCallback` deps**：`[]` deps 但闭包捕获 `startReload`（stable `useTransition` setter）+ 多个 React state setter（stable identity）。功能性正确，lint exhaustive-deps 可能 flag 但不阻塞。code-reviewer 误判（"Actually correct"）。

### 推回结论（[026.02] reviewer push-back）

- 11/12 项目 TS2322 错误是 pre-existing baseline，[026.02] 引入的仅 I-1 这 1 处。
- 0 new tsc regression（变更文件 0 错）。
- 65+ focused test pass，2 IRON RULE guardian pass。
- Ship-ready as a whole。

### 验证

- tsc: appointment-workspace.test.tsx 错误数 1 → 0；TS2322 总数 12 → 11
- vitest focused 26/26 pass（workspace + IRON RULE + register-client-surfaces）
- pre-push hooks: `validate:domain-structure` ✓ + `validate:rules-registry` ✓（6 项 lifecycle 一致）
- push: gitee origin `1372bb4..22ac0a7 main -> main`

---

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
- **M-1**：`appointment-workspace.test.tsx` 移除 11 处 `as any`（brief 估 8 处, 实际代码扫描 11 处 — 全部用 proper USOM ID 类型替代；count drift 由 reviewer 抓, ship-then-polish 收口）
- **M-2**：`appointment-workspace.test.tsx` rename `mockGetItinerariesByRange` → `mockGetAppointmentsByRange`
- **M-3**：`appointment-filter.test.ts` 改 fake timers + 相对 offset
- **M-6**：`appointment-workspace.tsx` handleDelete 改 Promise.allSettled + 1 个 partial-failure test
- **M-5**：0 代码改动，仅 CHANGELOG 登记

### 验证结果

- vitest base=head 失败集合零新增（47 → 47，+1 新 test pass）
- tsc 变更文件 0 新增语义错误（2 个新 TS2304 baseline noise，vitest-globals 项目 pre-existing 模式）
- 新增测试数：+1（M-6 partial-failure）

### 风险与缓解

- **M-3 fake timers 误用污染其他测试**：严格 beforeEach/afterEach teardown，验证 lib/__tests__ 全跑无污染
- **M-6 改 handleDelete 改顺序逻辑**：新增 partial-failure test 锁定行为

### 遗留 / Follow-up

- **TD-022 5 项**（archetype clearing / UUID / perf N+1 / banner / E2E）→ [026.02.4]
- **M-5 click-to-toggle-select UX 验证** → 后续 /browse 人工验证后决

### 参照

- Spec SSOT: `docs/superpowers/specs/2026-07-09-026-02-2-appointment-polish-design.md`
- Plan SSOT: `docs/superpowers/plans/2026-07-09-026-02-2-appointment-polish.md`

---

## [026.02.3] /editAppointment runtime TypeError 双层防御（2026-07-09）

> [026.02.2] 收口时登记的「/editAppointment runtime TypeError（独立根因未明）」独立 task 闭环。
> 用户在 /appointments 选条 → 点击编辑图标 → 触发 Runtime TypeError。
> Source trace：`AppointmentFormFields.tsx:88` `draft.people.join('，')` 在 `draft.people === undefined` 时抛 Cannot read properties of undefined (reading 'join')。

### 根因

`handlers.ts:268-274` 的 `todayAppointments` 投射 mapper 只含 5 字段（`id`/`title`/`startTime`/`durationMin`/`status`），**丢 `detail`/`people`/`activityArchetypeId`**。

传播链：

1. handlers.ts 投射 `todayAppointments`（缺 people/detail/archetype）
2. handlers.ts:325 `dataSnapshot.items = todayAppointments`（selecting 降级模式）
3. `EditAppointment.tsx:32` `as (AppointmentDraftFields & { status: string })[]` 类型 cast 遮蔽 runtime 形状缺陷
4. 用户点击 item → `EditAppointment.tsx:146` `setDraft({ ...it })` 浅拷贝 → `draft.people === undefined`
5. `AppointmentFormFields.tsx:88` `.join('，')` 抛 TypeError

### 决策

- **双层防御**：
  - **根因**：handlers.ts todayAppointments 补 3 字段（`detail` / `people` / `activityArchetypeId`）
  - **防御深度**：`AppointmentFormFields` 加 `?? []` + `?? ''` fallback — form 自身不假设上游完美
- **测试为何漏**：`edit-appointment.test.tsx` 的 `makeItem()` 默认值含 `people: []` / `detail: null`，**测试 mock 比生产数据更完整**，遮蔽真实 bug（即「false-positive 测试」反模式：[feedback_change-gate-baseline](~/.claude/...feedback_change-gate-baseline.md)）

### 改动清单

- **根因 fix**：`handlers.ts:267-281` `todayAppointments` 补 `detail: i.detail` / `people: i.people` / `activityArchetypeId: i.activityArchetypeId` 3 字段
- **防御深度**：`AppointmentFormFields.tsx:49-50, 94, 104` `peopleArr = draft.people ?? []` + `detailVal = draft.detail ?? ''`
- **回归守护**：`edit-appointment.test.tsx:131-153` 新增「selecting 模式点 item 缺字段时不崩」测试 — 模拟真实 handler 投射形状（5 字段）作为 IRON RULE

### 验证结果

- vitest：`edit-appointment.test.tsx` 16/16 pass（含新 IRON RULE）
- tsc：`edit-appointment.test.tsx` 错误数 15 = baseline（零新增）
- baseline flake 隔离：`handlers.test.ts > 应包含未打卡的习惯` + `timeboxes-workspace.ai-submit.test.tsx > createTimebox` 在 baseline 同样 fail — 修复零回归
- pre-push hooks：`validate:manifest` 0 errors + `validate:structure` 全部通过 + `validate:rules-registry` 6 项一致

### 风险与缓解

- **类型 cast 透明性**：`EditAppointment.tsx:32` `as (AppointmentDraftFields & { status: string })[]` 仍遮蔽 runtime 形状。**未触及**：改类型会破现有测试（`makeItem` 需补 archetype），留 [026.02.4] 范围
- **未来回归防御**：任何再次改动 todayAppointments 投射的代码会立即被 IRON RULE 测试 fail 拦截 — 不再依赖 mock makeItem 兜底

### 参照

- Spec/Plan 缺失：[026.02.3] 是 TypeError 单 task 修复，scope 严格（1 commit），未走完整 spec/plan 流程；root cause 在 `superpowers:systematic-debugging` skill 内追溯
- Follow-up source：`CHANGELOG.md [026.02.2] 遗留 / Follow-up / "/editAppointment runtime TypeError"`（已 cleanup）
- Git: commit `e97b9a4`（`fix(026.02.3): /editAppointment selecting→编辑视图 TypeError 双层防御`）

---

## [026.02.3.1] 4 项 fresh drift 修复 + 5 cosmetic minor 收口（2026-07-09）

> [026.02.3] ship 后 `/lifeware-neat` 5 数据源重扫发现的 4 项 fresh drift 全部 ship。Items 1+2（TaskStatus/HabitStatus USOM drift）由前会话扫描时报 drift 但实际 main 已对齐，验证后从 scope 删除。
> 同 PR 收 [026.02.2] whole-branch review 5 cosmetic minor polish。

### 决策摘要

- **4 项 drift 全部 ship**：TD-024 (AISessionStatus 三向一致) + TD-025 (v_running_timeboxes view stale filter) + TD-026 (ai_sessions docs 格式) + TD-027 (docs 页脚过期)
- **5 cosmetic minor 收口**：[026.02.2] whole-branch review 5 项 polish 全部 ship
- **scope 不动**：type cast 透明性 (`EditAppointment.tsx:32`) 仍留 [026.02.4] 范围（与 TD-022 5 项同）

### 改动清单

- **T1 TD-024**：`primitives.ts:230` `AISessionStatus` 扩 3 值 (`created`/`completing`/`closed`) + 删 `session/index.ts` 局部 `SessionStatus` 别名 + 新增 `session-status.test.ts` IRON RULE (6 值 type-level + runtime array 双校验)
- **T2 TD-025**：`docs/database-design.md:1548-1557` view SQL 重写 (`status='planned' AND start_time<=NOW() AND end_time>=NOW()`) + `migrations/0036_drop_v_running_timeboxes_recreate.sql` 新建（journal idx=36，跨 PG 幂等 DROP IF EXISTS + CREATE OR REPLACE）+ dev DB 跑通验证
- **T3 TD-026**：`docs/database-design.md:1703-1723` §8.x ai_sessions Markdown table → ```sql CREATE TABLE``` block 格式统一（与 §4.x user_settings/memory_episodes 同模板）
- **T4 TD-027**：`docs/usom-design.md` + `docs/database-design.md` 页脚 `2026_07_07 → 2026_07_09` bump + 补 [026.02]/[026.02.1]/[026.02.2]/[026.02.3] 4 段变更记录
- **T5 5 cosmetic minor**：
  - C1: CHANGELOG M-1 count "8 处" → "11 处" + 注释
  - C2: spec/plan I-2 "4 处 test" → "2 处 test contract" + 注释
  - C3: CHANGELOG tsc "0 新增" → "0 新增语义错误 (2 TS2304 baseline)" + 注释
  - C4: `appointment-filter.test.ts` mk() comment "本月惯例" → "本月约定筛选 (fixture)"
  - C5: `appointment-workspace.test.tsx:294` `{ ok: true } as any` → `{ status: 'ok', appointment: { id: 'a-1' } }` 对齐 default mock shape

### 验证结果

- vitest: 0 回归（baseline=head）
- tsc: 0 新增错误
- pre-push hooks: `validate:manifest` 0 errors + `validate:structure` ✓ + `validate:rules-registry` 6 项一致
- USOM ↔ DB 双向互验 2A-2F 重扫: 0 新增 drift
- IRON RULE: `session-status.test.ts` 通过（6 值 shape 锁定，TypeScript + runtime 双校验）

### 风险与缓解

- **T1 类型 cast 透明性**：`EditAppointment.tsx:32` `as (AppointmentDraftFields & { status: string })[]` 仍遮蔽 runtime 形状，**未触及**（属 [026.02.4] / TD-022 同范围）；T1 仅扩 USOM 6 值对齐 DB + code，未改 surface 类型 cast
- **T2 view 替代品风险**：`v_running_timeboxes` 替代 SQL 与 `derive-display-status.ts` 派生语义等价，但 production 实际调用方需 grep 确认（已确认 production 无查询代码，仍是 documentation/audit 用途）
- **T3 docs 格式单点**：ai_sessions 一处改动，列与 schema.ts 已逐字对齐，无歧义

### 关联

- 上游：[026.02.3] commit e97b9a4 + 3ffc2c9 + c220e15（`/editAppointment TypeError 双层防御` 已 ship）
- 重扫：[`/lifeware-neat` 5 数据源] (2026-07-09) — 发现 4 项 fresh drift
- Spec SSOT: `docs/superpowers/specs/2026-07-09-026-02-3-1-follow-up-fixes-design.md` (commit 17db764)
- Plan SSOT: `docs/superpowers/plans/2026-07-09-026-02-3-1-follow-up-fixes.md`

### Post-Ship Round 2 修复（2026-07-09, 3 commits: `41c9ce8` / `22304b5` / `3c08208`）

Ship 后 whole-branch review + post-ship second-opinion (Opus, fresh "diff vs codebase reality" 视角) 抓第一轮 review 漏的 3 Important + 5 Minor。验证 [[feedback_post-ship-review-meta-pattern]] 模式：SDD whole-branch APPROVED ≠ ship-ready。

- **I-A (Important)**：`docs/tech-debt/TD-028-timebox-stale-status-running-literals.md` 补 Site 0 — `TimeboxRepository.findRunning` @ `frontend/src/domains/timebox/repository/index.ts:48-52` 是 4 caller-site drift 的 **root source**（dead query，`status='running'` post-[023.12] 后无行匹配）。修复路径改为先改 repository method（`status='planned' AND start_time <= NOW() AND end_time >= NOW()`，server-side 等价 TD-025 view 派生）
- **I-B (Important)**：`frontend/src/nexus/ai-runtime/__tests__/session-status.test.ts` IRON RULE 去 tautology — 删 runtime sort-join（line 30 vs 29 是同一字面量集，no-op），header 改诚实描述「compile-time annotation + length check 双校验」
- **I-C (Important)**：`docs/tech-debt/README.md` TD-028 5 处补全 — `last_updated: 2026-07-07 → 2026-07-09` / lifeware-timebox 加 bullet / 🟠 High 加 bullet / 录入历史第 7 批 row / 底部 20→21 条
- **M-1**：`docs/database-design.md:1551` T2 view SQL 注释「替代状态 'overtime'」→「替代 'overtime' 派生: 是 logged 且已过 end_time」句式
- **M-2**：`0036_drop_v_running_timeboxes_recreate.sql` EOF 补 `\n`（`od -c` 验证末 5 字节 `n d ] ' ;` 无 newline）
- **M-3**：`manifest.md` 「validate:rules-registry 6 项一致」→「(无变更)」澄清是 gate-pass 不是 delta
- **M-4**：`manifest.md` 「1 PR 6 task」→「1 PR 7 task」（T1+T2+T3+T3-followup+T4+T5+T6 = 7）
- **M-5**：`session/index.ts:41` 「[023.08] / [026.02.3.1]」→「[023.08] 引入 / [026.02.3.1] 扩 'deleted' 终态」

**Round 2 关键修复**: post-ship second-opinion 又一次抓 SDD whole-branch review 漏的 drift — dead query root source（测试 mock 隐藏了它）/ 测试自验 tautology（作者自己写的 IRON RULE）/ ledger index secondary view 一致性（同 TD-024/025/026/027 [feedback_tier2-sync] drift class）。

### 后续 defer（不在本轮）

- TD-022 5 项（archetype clearing / UUID 验证 / perf N+1 / originalPrompt banner / 浏览器 E2E）→ [026.02.4]
- `EditAppointment.tsx:32` 类型 cast 透明性 → [026.02.4]

---

## [026.02.4] TD-022 5 items + TD-028 5 sites + EditAppointment cast 修复（2026-07-09）

> [026.02.3.1] ship + post-ship round 2 后，本轮按 1 PR ship-ready 模式（用户 brainstorming 决策）关闭剩余 deferred tech debt + post-ship 抓的 round 2 drift。

### 决策摘要

- **TD-022 5 items 全 ship**：#2 UUID 防御 + #3 newDurationMin > 0 contract + #6 archetype clearing 3-state（真实 UX bug）+ #8 banner conditional + EditAppointment cast 透明性
- **TD-028 5 sites 全 ship**：Site 0 repository rewrite + Sites 1-4 caller updates
- **TD-029 跳过登记**：planning 阶段发现 EditAppointment.tsx 3 处 stale `'in_progress'`，T3 已 incidental fix（`status: string` cast 收紧为 `AppointmentStatus` literal 后 TS2367 forced）；TD-021 已覆盖同 drift class（[026.01] × [023.12] 交互债），独立登记会变成 paperwork 噪音
- **scope 不动**：TD-022 #7 N+1（defer）/ TD-023 架构债 / TD-008 架构债

### 改动清单（5 impl commits + 3 chore commits = 11 total on main）

- **spec**（4dac296）：TD-022 5 + TD-028 5 + EditAppointment cast 修复设计
- **plan**（e562954）：6 SDD tasks 实施 plan
- **T1**（29c6579 + e782355）：TD-022 #2 UUID v4 regex + #3 newDurationMin > 0 contract + prompt 措辞 + fixture audit trail comment
- **T2**（8fdbb2c）：TD-022 #6 archetype clearing 3-state — picker transform (undefined → null) + handlers.ts 3-state mapper + updateAppointment server action
- **T3**（9c1b404）：TD-022 #8 banner conditional + EditAppointment cast 透明性（`status: string` → AppointmentStatus literal）
- **T4**（fc90771）：TD-028 Site 0 findRunning rewrite — `status='planned' AND startTime<=NOW() AND endTime>=NOW()` server-side 等价 TD-025 view 派生
- **T5**（825ec6b）：TD-028 Sites 1-4 caller updates — matchTarget derive-display-status + use-auto-trigger inline 派生 + timebox error msg drop 'running' branch + integration test fixture planned
- **TD-030 ledger**（60dfed8）：timebox.ts createAppointment adapter truthy-check pattern 登记
- **TD-031 ledger**（bdb39f2）：use-auto-trigger.ts 双分支 planned gate 同 cycle 双 fire 风险登记
- **TD-028 ledger close**（本 task，commit pending）：status → 已修复 + 修复记录段

### 验证结果

- vitest baseline=head：0 回归
- tsc：0 新增错误
- pre-push hooks：validate:manifest 0 errors + validate:structure ✓ + validate:rules-registry 6 项一致
- TD-028 closure proof：`grep 'running' src/` 在 production 返 0 hits（仅命中合法 `display === 'running'` 派生比较 — TD-022 范围不动）
- 3-state semantics verification：null（clear）vs undefined（skip）distinct test
- 编辑数据链 4 处全链路打通：picker → mapper → server action → DB

### 关联

- Spec：`docs/superpowers/specs/2026-07-09-026-02-4-follow-up-fixes-design.md`（commit 4dac296）
- Plan：`docs/superpowers/plans/2026-07-09-026-02-4-follow-up-fixes.md`（commit e562954）
- 上游：[026.02.3.1] post-ship round 2 fixes（3c08208）
- 关联 TD：TD-022（5 items closed）+ TD-028（5 sites closed）+ TD-030 + TD-031（登记）
- Post-ship second-opinion review：待 [026.02.4] ship 后跑（per [[feedback_post-ship-review-meta-pattern]]）

---

## [026.02.4-r2] post-ship round 2 second-opinion 抓 3 Important + 3 Minor 修复（2026-07-09）

> [026.02.4] ship 后跑 second-opinion（Opus），抓出 SDD whole-branch 漏掉的 3 Important（drift class 漂移 / 测试 tautology / ledger 索引同步）+ 3 Minor（manifest HEAD 替换 / EditAppointment subtitle 一致性 / TD-030 close）。这是 [[feedback_post-ship-review-meta-pattern]] 模式在项目内第 3 次验证。

### 决策摘要

- **3 Important 全部 ship**：truthy-check drift 类 4 sites 全修（TD-030 升级关闭）/ findRunning WHERE clause shape test（去 tautology）/ TD-030 ledger close（4 sites）+ README 索引同步
- **3 Minor 全部 ship**：manifest.md `<HEAD>`/`<BASE>` 替换为真实 commit + EditAppointment subtitle `仅计划/执行中 → 仅计划`（与 T3 '执行中' → '计划' 一致）

### 改动清单（3 commits on main，fix + fix + docs）

- **Fix 1**（commit pending）：3-state propagation 4 sites — timebox.ts:110 (createTimebox) + :346 (createAppointment) + handlers.ts:309 (editAppointment prefill) + :384 (editTimeboxes prefill)。type widen `string` → `string | null` + truthy-check `?{...}:{}` → `!== undefined ?{...}:{}`
- **Fix 2**（commit pending）：repository findRunning WHERE clause shape test（IRON RULE 替代 JS-level filter mock）— vi.mock drizzle 操作符捕获 eq/lte/gte/sql 调用，断言 WHERE 链含 status='planned' + NOW() 上下界 + userId 过滤
- **Fix 3**（commit pending）：TD-030 close（status 新建 → 已修复 + 4 sites 修复记录段）+ docs/tech-debt/README.md 索引同步 + manifest.md `<HEAD>` → `0ce7574` + `<BASE>` → `4dac296` + EditAppointment.tsx:130 subtitle `仅计划/执行中 → 仅计划`

### 验证结果

- vitest baseline=head：0 回归（+1 新 test = 4/4 in timebox-repository.test.ts）
- tsc：0 新增错误（199 = baseline）
- pre-push hooks：validate:manifest 0 errors + validate:structure ✓ + validate:rules-registry 6 项一致
- 3-state semantics verification：4 sites 全部 `!== undefined` 检查（null = clear / undefined = skip / string = set）

### 关联

- 上游：[026.02.4] ship（0ce7574）
- 关联 TD：TD-030（4 sites closed）+ TD-031（仍登记）
- 关联 spec：`docs/superpowers/specs/2026-07-09-026-02-4-follow-up-fixes-design.md`（不再修订，本轮为 post-ship review）
- [[feedback_post-ship-review-meta-pattern]]：第 3 次验证 SDD whole-branch APPROVED ≠ ship-ready

---

## [026.02.4-r3] pre-land-review 抓 P0 + P1（2026-07-09）

> [026.02.4-r2] ship 后跑 `/pre-land-review`（specialist army + Claude adversarial + **Codex adversarial**），抓出 1 P0 + 1 P1 + 3 P2 + 3 P3。这是 [[feedback_post-ship-review-meta-pattern]] 模式在项目内**第 4 次验证**——前 3 轮 (Opus 2x) + 1 轮 (Sonnet 4 specialists) 都漏了 EditTimeboxes Site 5 与 useAutoTrigger double-fire 的真实 production 影响。

### 决策摘要

- **P0 useAutoTrigger double-fire 真修**：r2 登记 TD-031 但未真修，r3 Codex 抓出同 cycle 双 fire start+overtime → server-action storm（40 overdue timeboxes × 2 round-trips/min = ~80 failures/min/user）。**用 `else if` 互斥修复**，单周期单 fire
- **P1 EditTimeboxes.tsx:195 truthy-collapse 真修**：r2 defer 的 "Site 5 doesn't go through server DB.write same field" rationale 错误（r3 Codex 抓出：payload 实际流向 updateTimebox，server-side mapper 写 DB 字段）。`?` → `!== undefined` + type widening 完整闭合 TD-022 #6
- **P1 AppointmentFormFields.tsx 注释修正**："Timebox surface 用不同语义（undefined=clear）" 在本 PR 已被 timebox server mapper 改为 `!== undefined` 后**事实上错误**——timebox 现在也用 undefined=skip。注释会误导未来 maintainer
- **3 P2 + 3 P3**：findRunning IRON RULE 不绑列 / newDurationMin typeof 拒 stringified / UUID v4 锁定 legacy / setInterval reset bug / clock-source 分歧（DB NOW() vs JS new Date()）/ 误导注释。**全部 defer 到下个 session**

### 改动清单（2 commits on main，fix + fix+docs）

- **Commit 1** `83d5740` fix(026.02.4-r3-preland)：TD-031 actual fix — useAutoTrigger double-fire (else if mutual exclusion)
  - `use-auto-trigger.ts:44-59` 第二分支 `if` → `else if`（分支互斥）
  - 新建 `use-auto-trigger.test.ts`（207 行，6 cases）：覆盖 overdue planned timebox 仅 fire 一次、pre-PR 死分支（planned + future start）零 fire、边界条件
- **Commit 2** `b209cd4` fix+docs(026.02.4-r3-preland)：TD-022 #6 site 5 + EditTimeboxes.tsx truthy-collapse + AppointmentFormFields doc accuracy
  - `EditTimeboxes.tsx:195` `?` → `!== undefined`（3-state 修复）
  - `timebox.ts:115` type widening（`string` → `string | null`）支持 null 透传
  - `AppointmentFormFields.tsx:111-114` 注释改为 "Timebox surface 也用 undefined=skip"
  - 新建 `edit-timeboxes.test.tsx`（56 行，3 cases）：覆盖 clearing archetype 透传 null + skip 路径

### 验证结果

- vitest baseline=head：+9 net cases（6 useAutoTrigger + 3 EditTimeboxes）0 回归
- tsc：0 新增错误（199 = baseline）
- pre-push hooks：validate:manifest 0 errors + validate:structure ✓ + validate:rules-registry 6 项一致
- useAutoTrigger 临时 revert 验证 bug 复现 + fix 后消失（impl 自验）

### 关联

- 上游：[026.02.4-r2] ship（db8f150）
- 关联 TD：TD-031（`useAutoTrigger double-fire` — 升级为已修复）+ TD-022 #6 Site 5（`EditTimeboxes.tsx:195` — 已修）
- 关联 spec：`docs/superpowers/specs/2026-07-09-026-02-4-follow-up-fixes-design.md`（不再修订，r3 为 post-push audit）
- 4 specialist findings + Claude adversarial 2 findings + Codex adversarial 2 P1 + 3 P2 + 3 P3 — 全部 documented in `task-026-02-4-r3-fix-report.md`

### 仍未 ship 的 follow-ups (P2/P3 from r3)

- **P2**: findRunning IRON RULE 不绑列（lte/gte 调换 bug 不被捕获）— test gap
- **P2**: newDurationMin `typeof !== 'number'` 拒 stringified 数字（LLM contract 决策）
- **P2**: use-auto-trigger setInterval reset bug（ref refactor）
- **P2**: UUID v4 regex 锁定 legacy/v7/uppercase（保守防御，defer）
- **P3**: clock-source 分歧（DB NOW() vs JS new Date()）
- **P3**: misleading handler comments at Sites 3/4
- **P3**: EditAppointment `surfaceType` dead prop
- **P3**: design polish（archetype picker "未选择" identical for undefined/null, hardcoded "计划" badge）

---

## 项目宪章（.specify/memory/constitution.md）

- v2.1.1 (2026_07_01) — PATCH：version tracking 职责由 manifest.md 迁至 CHANGELOG.md（Tier 3 清单 + 修订流程第 5 步）
- v2.1.0 (2026_06_24) — §IX 约束 2/3 收敛（registry 即 SSOT）；§III 字段三分类正交澄清
- v2.0.0 (2026_06_22) — MAJOR：新增 §IX Domain 开发范式（七层 5 约束）；supersede §CN-UI #4（CnuiFormAdapter 强制复用）
- v1.11.1 (2026_06_20) — §VIII 新增「规则三层架构」治理小节（L1 realtime / L2 onValidate / L3 RuleEngine）
- 2026_06_19 — §VIII ValidationResult 三变体→五变体（+PassedWithWarning / NeedInput）
- v1.11.0 (2026_06_18) — MINOR：新增「业务事实写入口」治理原则（SM 重定位 + Field Executor + 字段三分类）+ §VIII ValidationResult 判定模型

## USOM 详细设计（docs/usom-design.md）

- 2026_07_06 — [023.12] §3.5a Cycle 状态机收敛：5 态 → 4 态（`not_started` / `in_progress` 合并为 `approved`，`ended` 改名 `finished`）；SM action rename（`startCycle/planCycle` 塌缩为 `approve`，`endCycle → finish`，**新增 `revert`**）；guard ALLOWED map 重写；时间戳字段重命名（`startedAt → approvedAt`、`endedAt → finishedAt`，`reviewedAt` 不变）。§3.9 Timebox 状态枚举收敛：6 值 → 3 值（`running` / `overtime` / `ended` 派生显示，不持久化）；新增 `TimeboxReverted` 事件；移除 3 个时间戳列（`startedAt` / `overtimeAt` / `endedAt`）。§3.13 Appointment **反转 [026] D2 reversal**：5 态 → 3 值（`in_progress` / `expired` 派生显示，不持久化）；新增 `AppointmentReverted` 事件；移除 2 个时间戳列（`inProgressAt` / `expiredAt`）。OQ-1 降级 TODO：appointment task/habit cancel/complete guard 留 `// TODO [027]: appointment task/habit guard`
- 2026_07_05 — [023.05-2] PR2 阶段 2：§3.13 Itinerary → Appointment 全层重命名 + 设计覆盖注（schedule→appointment 因 timebox 语义撞车）+ 中文「行程」→「约定」+ `AppointmentStatus` 值 5 态保留 P3（scheduled/in_progress/expired/cancelled/completed）
- 2026_07_04 — [023.04] §3.9 Timebox 末尾追加「时间盒修改/取消/删除意图统一入口」：`/editTimeboxes` shortcut 是修改/取消/删除三类意图的统一 CNUI 入口；`/cancelTimebox` shortcut 已弃用（提交 [023.04] 时从 manifest 删除），`cancelTimebox` 作为 SM action 仍保留用于 mutation service 内部触发状态推进
- 2026_07_04 — [023-02 用户调整] 列表卡片 `MAX_VISIBLE_ROWS` 4→10；编辑器 grid 增列；TemplateEditForm 按 start 升序
- 2026_07_04 — [023-02] §3.12 TimeboxTemplate 改写：`survivalSegments` + `subscribed*` 三数组 → `daysOfWeek` + `rows`(有序行列表)；A3 owner-check 改遍历 rows
- 2026_07_03 — [026] Itinerary A3 ship：§3.13 完整覆盖（4 action + 5 态 + lazy reconcile + GrowthMenu 自动归组）
- 2026_07_03 — [026] Itinerary 对象（D2 reversal）：5 态存储 + lazy reconcile + 4 transition 时间戳
- 2026_06_19 — [018-G3] 判定模型补全：ValidationResult 3→5 变体
- 2026_06_19 — [018-G2] 公共 `createDomainMutationServiceFactory` 抽象
- 2026_06_19 — [018-G1] habits 写入口切片：字段三分类落地 + `createHabitsMutationService`
- 2026_06_18 — onValidate 签名 `{valid,errors}` → ValidationResult；新增字段三分类 mutation_mode 小节
- 2026_06_08 — TaskStatus 枚举对齐代码与 DB（draft|active|on_hold → todo|planned，移除 deprecated scheduled）
- 2026_06_04 — 清理残留文本（废弃 ProjectTemplate / TaskTemplate 片段）
- 2026_06_03 — Task Domain 重构：Project → Thread；Task 双轴标签系统；SystemEventType Project* → Thread*

## 数据库设计（docs/database-design.md）

- 2026_07_06 — [023.12] §4.0 cycles 表 status enum 5 值→4 值（draft | approved | finished | reviewed）+ 时间戳列 RENAME（`started_at → approved_at`、`ended_at → finished_at`）；§4.7 timeboxes 表 status enum 6 值→3 值（planned | logged | cancelled）+ 移除 3 个时间戳列（`started_at` / `overtime_at` / `ended_at`）；§4.X appointments 表 status enum 5 值→3 值（scheduled | cancelled | completed）+ 移除 2 个时间戳列（`in_progress_at` / `expired_at`）+ **反转 [026] D2 reversal** 注释（in_progress/expired 由 `derive-display-status` 派生显示）。新增「迁移 0034」摘要小节（journal idx=34，TRUNCATE 3 表 + DROP 5 列 + RENAME 2 cycle 列；零 PG enum DDL；status 列是 plain TEXT，schema.ts `enum: [...]` 在 app 层约束合法值）
- 2026_07_05 — [023.05-2] PR2 阶段 2：§4.X itineraries → appointments 表 RENAME（DDL 终态标注）+ 0033_rename_itineraries_to_appointments.sql（journal idx=33）+ .down.sql（F5 反向）+ F2 snapshot drift acknowledge（drizzle snapshot 停 0006，未来 schema 变更继续手写 SQL + 登记 journal，不引入 `drizzle-kit up`）
- 2026_07_04 — [023.04] §4.7 timeboxes 末尾追加「时间盒重叠规则」：CNUI 提交按两层校验（客户端 `assertNoInternalOverlap` + 服务端 `TimeOverlapRule` 改读 endTime + status-aware severity）；DB 层无唯一性约束，重叠允许但有提示用户确认
- 2026_07_04 — [023-02] §7.8 timebox_templates 改写：survival_segments + 3 个 subscribed_* 列 → rows + days_of_week（迁移 0032）
- 2026_07_03 — [026] T20 — `user_settings.timezone` 段后新增「部署 TZ 约束」段
- 2026_07_03 — [026] A3 ship：§4.X itineraries 表 DDL + 迁移 0031 + ItineraryRepository.findActive/findNeedingReconcile + 4 transition
- 2026_07_03 — [026] §4.X itineraries 表契约：5 态 status enum + 4 transition 时间戳 + 2 索引
- 2026_06_30 — [024] key_results +confidence（CHECK 0-100）；[023] +activity_archetypes / user_audit_log；A3.3 DROP habit_templates / template_habits（迁移 0027）
- 2026_06_10 — tasks/habits status CHECK 补 deleted 状态（对齐 USOM）
- 2026_06_06 — tasks 状态枚举回退对齐代码；移除废弃列；v_active_tasks 视图修复
- 2026_06_04 — 视图 v_today_pending_habits 修复（hl.status→completion_status）；表结构总览补 threads
- 2026_06_03 — projects → threads 表；删 project_templates / task_templates；tasks +双轴标签列 +8 索引

## AI Runtime 架构设计（mydocs/core/LW_AI_Runtime_Architecture_Design.md）

- 2026_06_10 — Nexus 统一 Phase A → A/B/C 三阶段演进归档（B：Thread 写操作统一 + CNUI Surface 注册修复；C：deleteTask/refineTask/splitTask 分支补全）

## 界面设计规范（docs/UI-DESIGN-SPEC.md）

- 2026_06_13 — §十一 CN-UI 大幅修订：单层容器架构 + header prop + §11.10 新增 Surface 自测 CUC-01~CUC-12
- 2026_06_10 — §1.1 CN-UI 表单标签规则；§1.5 Scrim 使用规则 + CNUI scrim 语义变量
- 2026_06_08 — v1.2：颜色对比度铁律（WCAG AA）；primary/on-primary 可访问性；text-muted 使用限制

## 代码注释规范（docs/code-commenting-guide.md）

- 2026_06_01 — 创建：文件头 @file/@brief、模块分隔、JSDoc、特殊标记、简体中文要求

## Domain 开发权威指南（docs/domain-development-guide.md）

- 2026_07_03 — [026] T21 — §4.1 Sunset 豁免清单移除 timebox 一行；§7 四域现状对照表 timebox L3 状态从 ❌ → ✅ registry+evaluate；validate:structure 仍 0 errors
- 2026_06_22 — [019.1] CnuiFormAdapter 退役：habits 手写化 + 删 FormRegistry/Adapter/register-form + validator L4-1/L7-2 落地
- 2026_06_21 — Part II 注册步骤对齐 tasks 参考实现
- 2026_06_21 — [019] 原 mydocs 注册指南移入 docs/ 并与 Domain 范式整合为单一权威文件

## Domain 路由生成规范（docs/route-generation-spec.md）

- 2026_07_04 — §4.3 幂等写入：generate-routes 写盘前剥离时间戳行比对，业务字段未变则 skip；prod.sh 加 EXIT trap 自动恢复 tsconfig.json

## OKR Domain

- 2026_07_03 — [022.01] Phase 3：移除 Objective/KeyResult 独立 status 字段与状态机。编辑/删除权限收敛至 Cycle.status 经 assertEditable 守卫。DB 迁移 0030
- 2026_06_26 — [022] 收尾：QA/Review/Defer 修复
- 2026_06_26 — [022] Phase 3：/okrs 工作台
- 2026_06_26 — [022] Phase 2：contributions junction + KR.currentValue 派生
- 2026_06_26 — [022] Phase 1：Cycle 升格一级对象（cycles 表）
- 2026_06_25 — OKR/Task 边界设计（office-hours）：分离 + OKR 拥有 junction

## [023.04] Timebox CNUI 优化

> 2026_07_04 — ship-ready（7 commits：overlap.ts / rule endTime / CreateTimebox UI / parser / EditTimeboxes surface / handler 分支 / manifest 三合一）。**全闭环 ship-ready**。

- `CreateTimebox` CNUI surface 补 `activityArchetype` 选择器 + 同日 batch 内 overlap 预检 + page-aware conflict 红字 + 提交全程 needs_confirm AlertDialog
- 新增 `/editTimeboxes` CNUI action（修改/取消/删除统一入口，解析优先模式）+ server `surfaceHandlers` + client `register-client-surfaces` 双注册闭环；`/cancelTimebox` shortcut 弃用
- 客户端 `assertNoInternalOverlap` 纯函数 + 服务端 `TimeOverlapRule` 改读 `endTime` + status-aware severity（修原 rule 失效债 — [023] A2 OV#P1-#1 后 `duration` 已撤）+ Edit path 显式 `evaluate` 双调
- Handler `timeboxCnuiHandler.open/submit` 接 `editTimeboxes` 分支（直调 update/delete + OV#8 状态守卫透传 + safe-default race fallback）
- 测试 4 文件新增 + 1 改（`overlap.test.ts` / `timebox-overlap.test.ts` / `parse-timeboxes.test.ts` / `edit-timeboxes.test.tsx` / `handlers.test.ts` editTimeboxes 分支）+ CreateTimebox 3 case UI 测试 + 解析优先模式 7 case UI 测试
- 文档同步：`docs/database-design.md` §4.7 末尾追加「时间盒重叠规则（[023.04]）」 / `docs/usom-design.md` §3.9 末尾追加「时间盒修改/取消/删除意图统一入口（[023.04]）」 / 023-01 spec 末尾追加「[023.04] 状态更新」指针

## [023.05-1] Timebox 域 schedule 命名释放

> 2026_07_05 — ship-ready（7 commits: manifest 6 块 + AdjustTimeboxes + orchestration-handler + viewSchedule 替换 + 测试同步 + C-1 双注册 + ship-then-polish）。**[023.05] PR1 阶段 1 ship-ready**，为 PR2 itinerary→schedule 释放 `schedule` 命名空间。

### 关键决策

- **D1 双向清理**：中文「日程」→「时间盒」（manifest keywords/examples/description + cnui/handlers UI 文案 + AdjustSchedule UI）。避免「日程 vs 日程计划」撞车
- **D2 orchestration-handler**：class `SchedulingHandler` → `TimeboxOrchestrationHandler`；文件 + 5 处注释引用同步
- **D3 双 PR 手动**：本 PR 为 PR1 阶段 1（纯 refactor, 无 DB 迁移）；PR2 阶段 2 itinerary→schedule 全层 + 0033 rename 迁移后续启

### 改动清单

- `manifest.yaml` 6 块改名：`viewSchedule`→`viewTimeboxes` / `createSmartSchedule`→`createSmartTimeboxes` / `adjustRemainingSchedule`→`adjustRemainingTimeboxes` + view_routes/generation_actions/cnui_surfaces `adjust-schedule`→`adjust-timeboxes` + 中文清理
- git mv `AdjustSchedule.tsx`→`AdjustTimeboxes.tsx` + `domain/index.ts` import + cnuiRegistry 双注册
- git mv `scheduling-handler.ts`→`orchestration-handler.ts` (98% similarity) + class 改名 + handlers/index.ts map + 5 处注释引用 (energy-state-manager/energy-curve-provider/rules-registry/cnui-handlers/primitives) + cnui/handlers.ts UI 文案
- `use-intent-handler.ts:288` action 名 `viewSchedule`→`viewTimeboxes`；保留 `mainViewState.type='schedule'` 字面量（OQ-1，view state literal 非 schedule 对象）
- `cnui/handlers.ts` dispatch 4 branch + surfaceHandlers map + cnui/handlers UI 文案「日程」→「时间盒」
- 测试 15+ 文件同步：git mv `scheduling-handler.test.ts`→`orchestration-handler.test.ts` + 14 文件全局 rename
- ship-then-polish 4 cosmetic Minor：handlers.test.ts:139 it() title + domain-types.test.ts:170-172 fixture + action-view.test.tsx:75 INLINE_DISPATCH + orchestration-handler.ts ScheduleItem→TimeboxItem interface

### 验证

- `grep -E "action:.*Schedule" frontend/src/domains/timebox/manifest.yaml` = **0 hits**（F1 grep gate）
- `npm run validate:manifest` = **0 errors**（2 WARN + 2 INFO pre-existing）
- `tsc --noEmit` = **89 errors**（与 base 一致）
- vitest polished tests = **17/17 PASS**（orchestration-handler + cnui-handlers）
- `/timeboxes` HTTP 200 + GrowthMenu 显示 `viewTimeboxes`/`createSmartTimeboxes`/`adjustRemainingTimeboxes`

### C-1 风格双注册修复（3 处，Task 1+3 漏 → Task 5 补齐）

- `domain/index.ts:41` cnuiRegistry.register('timebox','adjust-timeboxes',{ component: AdjustTimeboxes })
- `nexus/ai-runtime/cnui/register-client-surfaces.ts:26` framework 客户端注册
- `cnui/handlers.ts:541` server surfaceHandlers map + 4 dispatch branches (L106/L164/L348/L372)
- 任何一处漏改 → runtime 「Handler 未找到」或 11+ 测试失败

### 范围

- 29 文件 / 139+ / 138-（rename 平衡）
- 无 DB 迁移（PR1 阶段 1 明确不碰 schema.ts/migrations）
- 无 itinerary/Itinerary* 改动（PR2 阶段 2 范围）

## [023.05-2] Itinerary → Appointment 全层重命名（PR2 阶段 2，WIP）

> 2026_07_05 — **ship-ready**：11 task 全绿，1 fixup commit（C1 stale assertion + T11 修复 test import 路径）。覆盖决议：schedule→**appointment/约定**（eng-review 用户识别 schedule 与 timebox 撞车）全 PR2 实装。

### 设计覆盖决议（eng-review 期用户识别）

- **目标词覆盖**：本 PR2 母 design doc 历史目标词为 `schedule`（中文「日程计划」），eng-review 期用户识别 `schedule` / 「日程计划」与 `timebox` 语义撞车——两者都含"日程"含义易混淆。
- **覆盖后目标词**：`appointment`（中文「约定」）—— 指对未来钉死的一次性事件安排（读书会、约饭、牙医、家长会），与 timebox 的"今日可重排执行格"语义清晰分离。
- **覆盖范围**：USOM（`Itinerary` → `Appointment`，type alias `ItineraryStatus` → `AppointmentStatus`，值 `scheduled` 保留 P3）+ DB（`itineraries` → `appointments` 表 + 0033 RENAME 迁移 + 2 INDEX）+ manifest（action/surface/component 全 appointment 系列）+ ~22 文件 git mv（`reconcile-itinerary*.ts` → `reconcile-appointment*.ts` 等）+ 中文「行程」→「约定」。
- **schedule 命名空间**：PR1 阶段 1 已释放留空，appointment 不占用。
- **母 design doc 不改**：仍写 schedule 是历史 SSOT，本 PR2 plan 为执行 SSOT。

### 11-task 范围

- T1 Tier 2 docs 先行（usom-design + database-design + F2 snapshot drift + 设计覆盖注）— 本 task
- T2 DB schema + 0033 迁移（手写 SQL + journal idx=33）
- T3 USOM 类型层（`Itinerary` → `Appointment`）
- T4 数据 + reconcile 仓储层（`AppointmentRepository` + `reconcile-appointment*.ts`）
- T5 nexus 层（orchestrator / state machine）
- T6 server actions + F4 contract
- T7 manifest.yaml（action/surface/component 全 appointment 系列）
- T8 CNUI surfaces（git mv + PascalCase 文件名）
- T9 components + pages + redirect（`/itineraries` → `/appointments`）
- T10 测试同步 + F1/T1 回归
- T11 全量验收（tsc / vitest / validate:manifest / validate:domain-structure / /browse E2E）

### Ship 时回填（2026-07-05 验收完成）

- **commits**：11 impl + 1 fixup = 12 commits（4d6e7ca..9d12ed8）
  - c3833a7 docs / f5464a6 DB+0033 / 3ebd7b2 USOM / 984cd42 仓储+reconcile / 12a722e nexus / d61bc27 server actions / 58e473c manifest / db21eb7 CNUI / e681073 components+pages+redirect / 3589d93 测试 / 9d12ed8 C1 fix
- **diff stat**：71 files changed, 1702 insertions(+), 1396 deletions(-)（rename 平衡，1702/1396 ≈ 1.22）
- **测试守护（新增）**：
  - F1 `resolveObjectType` 回归测试（manifest PascalCase key 分派守护）
  - T1 `isAppointmentIntent` 回归测试（includes('Appointment') 误判守护）
  - C1 stale assertion 修复（`rules-registry.appointment.test.ts` 删除 prev-deps header unused `it()`）
- **T11 fixup**：`parse-appointment.test.ts` import 路径修复（`AIGenerateResponse` type-only 直接从 `@/nexus/ai-runtime/types` re-export 路径导入，TS2459 消解）
- **验证（2026-07-05）**：
  - tsc base=head：**零新增 error**（71 → 70，T11 fixup 后 base 对齐）
  - vitest base=head：**STRICTLY BETTER**（30 fails vs base 64 fails，少 34 个失败。1854-1608 tests 增加 76 测试（T9/T10 增量）. Pre-existing flake 1 个 [025] 已知）
  - validate:manifest：**0 errors**（2 INFO + 2 WARN pre-existing）
  - validate:domain-structure ✓
  - HTTP：`/appointments` 200 / `/timeboxes` 200 / `/itineraries/foo` 308 → `/appointments/foo`（F6 redirect 工作）
  - lazy reconcile：DB 手改 `start_time=NOW()-2 days` 后访问 `/appointments` 触发 server reconcile，`scheduled → expired` 自动推进 ✓
  - 0033 down→forward：双向幂等迁移，dev DB 2 行数据保留 ✓
  - F1 grep 守护：manifest 4 appointment action（createAppointment/editAppointment/deleteAppointment/viewAppointments）+ manifest lifecycle key `appointment` ✓
  - F4 contract：`{status:'ok';appointment:Appointment}` tsc base=head 零调用方错配
  - F5 down migration：`0033_rename_itineraries_to_appointments.{up,down}.sql` 双向通
- **dev OQ-1 row count**：appointments 表 2 行（迁移保留）
- **Follow-up / Defer（不下于 ship gate）**：
  - mainViewState.type='schedule' → 'timeboxes' 重命名 defer [023.10]
  - LLM prompt `APPOINTMENT_PARSE_PROMPT` [→EVAL] eval suite 独立 follow-up
  - [027] 打卡→completed + 智能编排归集约定
  - drizzle snapshot 重置（[023.05-1] 沿用 F2 convention）

## [026] Itinerary 域

> 2026_07_03 — A3 ship（14 commits：4 action + 5 态存储 + lazy reconcile + /schedule 锁定合并 + I-1 修复 + Tier 2 docs）。**[026] 全闭环 ship-ready**

> 2026_07_03 — **T23 (P3) ship**：field_metadata per-objectType 嵌套重构。消除 timebox itinerary 与其它域同名字段潜在冲突（timebox.timebox.* + timebox.itinerary.* 各自独立 namespace）

### 关键决策

- **D2 reversal**：原 D2=C "读时算 status"被推翻。改用 Cycle 模式：状态全部存 DB（`status` enum + 4 transition 时间戳列），SM 驱动 transition；`reconcileItineraryStatuses()` 在页面 server component 加载时 lazy 触发
- **决议 A（拆双 mutation service）**：A1.4 落地为 `createTimeboxMutationService` vs `createItineraryMutationService`，事件类型分离
- **D4 决议 A**：抽 `<ItineraryFormFields>` 公共组件，3 surface 共用

### §IX 7 层覆盖

- L1 数据模型：`Itinerary` USOM 接口 + `ItineraryStatus` 5 态枚举
- L2 仓储 + 写入口：`ItineraryRepository` 5 方法 + 双 mutation service
- L3 规则/校验：timebox/rules-registry.ts 加 itinerary 字段规则
- L4 Surface 渲染：3 surface（`response_type: cnui`）+ `<ItineraryFormFields>` 公共组件
- L5 页面路由：/itineraries 独立 Next.js page，server component 加载时调 reconcileAndAdvanceItineraries
- L6 CNUI 处理：timebox/cnui/handlers.ts 3 branch + `surfaceHandlers` 注册
- L7 schema 守门员：manifest 4 intent_triggers + lifecycle 5 态 + 6 transitions；validate:manifest 0 errors

### T14 I-1 修复

- T12 hash trigger 是死链：ItineraryWorkspace 是 standalone page 不在 chat 流；T14 修复为内联 Sheet-based Drawer（同 TimeboxDrawer 范式）：复用公共组件 + createItinerary server action + AlertDialog 二次确认；`router.refresh()` 让 server component 重跑

### [027] 后续

- `markCompleted` transition + 智能编排归集行程；/itineraries 月视图；ContextSnapshot 加 `ItinerarySummary[]`

## Timebox / Activity Archetype（[023]）

- 2026_06_30 — A3.3 habitsTemplates 硬删（消费者 → 生产者 → DB DROP，迁移 0027）
- 2026_06_30 — A3.2 CNUI 表单接入 + 详情只读（ArchetypePicker / EnergyCostAccordion 三域复用）
- 2026_06_30 — A3.1 tasks/habits 接入 activity_archetype + 删 energyProfile
- 2026_06_29 — A2 Timebox 域重写（timeboxes +3 列 + createTimeboxMutationService + /schedule 工作台 + 3 CNUI surface + /timebox-templates）

## [023.11] Timebox action 优化（archetype 智能匹配）

> 2026_07_06 — [023.10] T8 闭环 + 标题→archetype AI 匹配闭环 + editTimeboxes UX 收尾。Schema 变更：activity_archetypes 加 `synonyms jsonb` 列（迁移 0034 + down + journal idx=34）。

### Scope

- **Schema**: `activity_archetypes` 加 `synonyms jsonb NOT NULL DEFAULT '[]'`（迁移 `0034_023_11_archetype_synonyms.sql` + down，幂等 `ADD COLUMN IF NOT EXISTS`；journal idx=34）
- **Seed**: 30 条系统 archetype 的 `synonyms` 默认值（覆盖工作/学习/健康/生活等典型活动；`seedDefaults` 升级为幂等 — 已存在 system archetype 补 `synonyms` 字段，不重复创建）
- **Tier-2 文档**: `docs/database-design.md`（activity_archetypes 表新增列说明）+ `docs/usom-design.md`（ActivityArchetype USOM 类型加 `synonyms` 字段）
- **archetype-matcher 原语**: `domains/timebox/lib/archetype-matcher.ts` —— 规则优先（l2Name + synonyms + l1Category 包含匹配，forward/reverse 双向置信度），未命中 fallback LLM 位置匹配（返回命中位置便于审计）
- **`matchArchetypeForTitle` server action**: 包装 matcher + AI Runtime；返回 `{ matched, archetypeId?, position? }`，错误降级 `{ matched: false }`（不抛）
- **ArchetypePicker「AI 匹配」按钮**: opt-in（`enableAiMatch` + `title` prop）；loading 态显示「匹配中…」+ 按钮 disabled；未命中/错误 → 「未找匹配的活动原型」红字
- **createTimebox 被动推断**: 在 mutation service 中根据 title 调 matcher 推 archetype，未命中时不阻塞用户输入
- **editTimeboxes UX 修复**: (1) manifest description 补全；(2) 双重标题去重（schema title + manifest title 二选一）；(3) 编辑页 `useEffect[selectedId]` 同步 prefill→draft，修复空白态

### Decisions

- **D1**: synonyms 用 `jsonb` 数组（非 text 逗号分隔）—— 保持 USOM 列表语义（与 environment/location 一致），便于 future GIN 索引
- **D2**: matcher 规则优先 + LLM fallback —— 零 LLM 调用覆盖 80%+ 场景（l2Name 直接命中 + 同义词），LLM 只在标题完全陌生时介入；返回 `position` 便于审计
- **D3**: AI 匹配是 opt-in（不自动推断必填）—— 用户主动点「AI 匹配」触发；createTimebox 被动推断仅在 archetype 未填且 user 显式调用时生效
- **D4**: seedDefaults 幂等升级 —— 旧 system archetype（无 synonyms）下次 seed 自动补齐；用户自定义 archetype 不被覆盖
- **D5**: error 降级不抛 —— server action 出错一律 `{ matched: false }`，避免污染 CNUI 表单提交流程
- **D6**: T6 test 16 偏差注记 —— plan 写 `'跑步'`（意图：测未命中 fallback LLM），但 `'跑步'` 是「有氧运动」的 synonym，会被规则命中、覆盖 LLM 路径。implementer 改用 `'散步'`（不属于任何 archetype 的 synonym）保留 LLM 兜底测试意图，逻辑与 plan 一致

### Verification

- vitest base=head 失败集合 0 新增（同步命中/未命中/loading/错误 路径测试覆盖）
- tsc 0 新增错误
- validate:manifest 0 errors
- validate:domain-structure ✓
- prod migrate 已跑通（含 0034 + down 双向幂等）

### Prod Deploy（按顺序执行）

1. `./prod.sh --migrate` —— 应用 0034（`ADD COLUMN IF NOT EXISTS` 幂等，可重跑）
2. **必须**跑 `seedArchetypes` server action（或 `scripts/seed-prod.ts`）—— 给既有 30 条系统 archetype 补 `synonyms` 默认值。**注意**：migration 只加列（`synonyms` 默认 `'[]'`），**不会**回填已有 system archetype 的 synonym 数据；不跑此步则 prod matcher 只能命中 `l2Name` 完全相等 + `synonyms=[]` 之外的陌生标题，被静默降级为 LLM 兜底
3. 验证：`SELECT l2_name, synonyms FROM activity_archetypes WHERE is_system = true ORDER BY l2_name LIMIT 5;` —— 应见非空数组（如 `["写代码", "编程", "coding"]`）

### Out of Scope (deferred to [023.11+])

- R8 prod 命中率 gate — synonyms 实际匹配质量需真实用户流量验证
- M-2 H4 SWR 缓存 — ArchetypePicker archetypes 仍每次挂载拉取
- M-3+M-4 Minor polish — AI 匹配按钮文案/动效
- I-1 synthesized action `update_timebox` 不在 manifest lifecycle（[023.04] 遗留）

---

## [023.10] createSmartTimeBoxes 链路 post-ship defer cleanup

> 2026_07_05 — **6 commits ship on feat/023-10-postship-defer-cleanup**: T1→T6; T7 验证 non-orphan (Codex #10 守门生效, 安全网救了一个潜在错删); T8 defer to [023.11] (useOrchestrationRecommendations hook 不存在)。

### Scope (6 shipped + 1 verified no-op + 1 deferred)

- **T1 [P1]** workspace handleAiConfirm revert 真 wire 到 submitCnuiSurface（[023.08] P0 同源防御 — `timebox`/`revertSmartTimeboxes`/`{batchId}`; 附 `useCallback` deps 加 `revertableBatches` 修潜在 stale closure; placeholder toast "撤销状态已重置（[023.10] 提供 server action）" 删除）
- **T2 [P1]** B1 G15 跨 task integration test（5 断言拦 P0 class routing 错配; mock 只在 DB 层, submitCnuiSurface 走真实 routing — 避免 mock-of-mock; 413 lines）
- **T3 [P1]** A1 normalizeTimeField 用 proposal.date 替代 `new Date()`（未来日期 proposal 治本; 2 处 call sites 同步更新; 手工 `YYYY-MM-DDTHH:MM:SSZ` 格式保持与 legacy 路径一致）
- **T4 [P1]** A2 snapshot 派生自已有 resolveDate + deriveDayOfWeek/TimeOfDay（[023.08] T1 ship 的 resolveDate 复用, **不新增同名**; snapshot 硬编码 `'2026-07-05'`/`0`/`'morning'` 废除）
- **T5 [P2]** A4 cnui/handlers.ts:446 createSmartTimeboxes guard message 改进（**保留 guard branch** — Codex #5 守门生效, 不是死代码; 新 message 含 `'CreateSmartTimebox'` + `'acceptProposals'` 指明正确 surface/intent）
- **T6 [P2]** A3 batch-proposals `findByUserId(_, 200)` → `(_, 2000)` (Codex #7 路径修订: 实路径在 `nexus/ai-runtime/memory/`, **不是 domains/timebox/**; 2 处而非 brief 估的 4 处)
- **T7 [P2]** B4 orphan `'timebox-list'` 清理 — **ABORT**（4 grep 命中 + manifest ref + 测试 ref + live component; 实为 live CNUI surface; plan brief 假设错）
- **T8** ~~workspace proposals 接 useOrchestrationRecommendations 真实化~~ — DEFER to [023.11]（hook 不存在, Code #6 实际验证）

### Decisions

- **D3**: T6 limit 修法 = 提限 200 → 2000（vs cursor pagination — 留给 [023.11+] 单独 ticket）
- **D4**: T5 guard = 保留 + 改进 message（vs 删除 — Codex #5 守门）
- **D5**: runtime-only + 写 CHANGELOG section（runtime-only 不豁免 CHANGELOG）
- **D9**: T3+T4 串（同文件 orchestration-handler.ts），T1 + T6 + T2 各自独立
- **D10**: T1 workspace test mock setup 复用 [023.08] 4d6e7ca commit 模式
- **D11**: T2 mock strategy 重设计 = mock only DB layer（real production routing）
- **D12 (Codex cold read 修订)**: T1 phantom → 真 wire placeholder rewrite; T2 mock-of-mock → real routing + mocked DB; T4 dup-method → 复用已有 resolveDate; T5 dead-code misclaim → guard 保留; T6 path → nexus/ai-runtime/memory/; T8 → defer; T7 → ABORT per Codex #10 guard

### Verification

- vitest base=head 失败集合 net -1（64→63 fail, 主要来自 G15 新 5 assertions + T3/T4/T6 新 tests）—— **STRICTLY BETTER**
- tsc 错误 ≤ baseline（86 errors pre-existing 不变，T1 implementer 报 70=70, T6 报 -1 net）
- validate:manifest 0 errors
- validate:domain-structure ✓
- whole-branch review: 待 [023.10] T9 后跑
- post-ship Codex cold read: 待 ship-to-main 后跑

### Out of Scope (deferred to [023.11+])

- T8 workspace proposals 真实化（useOrchestrationRecommendations hook 不在 scope）
- **P1 PUSH**: `manifest.yaml` 缺 `revertSmartTimeboxes` intent_trigger 入口（T1 ship 后 catch 的生产路径 blocker — submitCnuiSurface 找不到 surfaceType 会返 `Unknown CN-UI action`; [023.10] T1 wire 在 unit test 覆盖, 生产需 manifest 注册; 建议：[023.11] 或本 PR 追加一个 sub-T1.5 commit）
- A5 test mock vs DB replace 行为分叉（P3, latent）
- C1 Playwright runner 接入
- C2/C3 deploy-gate (real LLM provider / eval)
- D1 F9 N+1 实际修复
- D2 F4 abstraction leak 迁移

### 遗留债（录入 `docs/tech-debt/`）

2026-07-06 通过 `/record-tech-debt` skill 录入两批共 **13 条**([023.10] scope)：

**第一批 8 条（🟠4 + 🟡4）**：

- [[TD-001]] · 🟠 · `useOrchestrationRecommendations` hook 不存在 → T8 defer [023.11]（同源 Out of Scope 第 1 条）
- [[TD-002]] · 🟠 · `logTimebox` 批失败处理不对称（Codex 7 PRE-EXISTING 债 4 defer 之一）
- [[TD-003]] · 🟠 · `editTimeboxes` TOCTOU（Codex 7 PRE-EXISTING 债 4 defer 之一）
- [[TD-004]] · 🟠 · R4 timebox/okrs 写入口债（[018] followup 历史遗留）
- [[TD-005]] · 🟡 · `MVP_USER_ID` 硬码（Codex 7 PRE-EXISTING 债 4 defer 之一）
- [[TD-006]] · 🟡 · orchestration N+1 sequential（Codex 7 PRE-EXISTING 债 4 defer 之一）
- [[TD-007]] · 🟡 · Suspend action 完整 CNUI 回环未闭环（[018] Suspend ⑥ 未闭环）
- [[TD-008]] · 🟡 · `lifecycle-configs require('@/...')` 多键域债（[025] Task3 同源一半）

**第二批 5 条（🟢3 + ⚪2）**：

- [[TD-009]] · 🟢 · `logTimebox` 重复 filter（Codex 7 PRE-EXISTING 债 4 defer 之一）
- [[TD-010]] · 🟢 · I-1 synthesized action `update_timebox` 不在 manifest lifecycle（[023.04] plan-eng-review I-1）
- [[TD-011]] · ⚪ · I-3 `_dayStart`/`_dayEnd` unused params（[023.04] plan-eng-review I-3）
- [[TD-012]] · ⚪ · [023.05-1] PR1 Polish 3 Minor（PR1 polish follow-up 遗留）
- [[TD-013]] · 🟢 · manifest validator K-component PascalCase 约束未文档化（[023] A2 pre-push hook 经验）

**合并**：原第二批候选 #11「Suspend 完整 CNUI 回环⑥」与 [[TD-007]] 同源 → 合并,不再另建。

---

## [020] 系统规则管理重设计

- 2026_06_24 — plan：去 C/L 范式重构（registry 即 SSOT，7 Phase/~20 Task）；constitution MINOR 2.0.0 → 2.1.0
- 2026_06_23 — DESIGN（office-hours）：规则三分类（Business/Governance/Policy）+ D1/D2/D3 决策锁定

---

## 历史归档 (≤ 2026-05-31)

> 项目早期文档变更，按年归档（每行精简版，详细版本/方法名从略）。

### 项目宪章

- v1.9.0 (2026_05_31) — MINOR：新增 UI 设计规范治理；Compliance Review 加 C-01~C-07
- v1.7.1 (2026_05_26) — PATCH：view_routes 构建时路由生成细节阐明
- v1.7.0 (2026_05_23) — MINOR：Query Path 三路径路由（+onQuery hook + query_actions manifest block）
- v1.6.0 (2026_05_22) — MINOR：新增 AI Runtime Constraints（7 项）+ CN-UI Protocol Constraints（3 项）

### USOM 详细设计

- 2026_05_28 — HabitLog 对齐 ExecutionRecord；Task +lastExecutionRecord；+TaskExecutionLog 类型
- 2026_05_22 — 新增 AI Runtime / CN-UI / 错误类型
- 2026_05_16 — 新增 ChatMessage / AISession / AISessionSummary / LLMConfig / UserSettings
- 2026_05_12 — 新增 Project / ProjectTemplate / TaskTemplate；TaskStatus +in_progress/on_hold；Task +10 字段

### 数据库设计

- 2026_05_30 — +user_activities 用户行为埋点表
- 2026_05_28 — habit_logs 字段变更（status→completion_status 等）；+task_execution_logs 表
- 2026_05_16 — +ai_sessions 表（10 列+2 索引）；+user_settings 表（6 列+1 唯一索引）
- 2026_05_12 — +projects / project_templates / task_templates 表；tasks 扩展状态枚举 + 多列索引

### 总体设计（mydocs/core/LW_overall_总体设计_*.md）

- 2026_05_26 — 新增 4.4 构建时路由生成机制
- 2026_05_23 — 新增 Query Path 执行链；Orchestrator 三路径识别
- 2026_05_22 — Nexus 基础设施层 +AI Runtime 组件
- 2026_05_02 — 增加附录 TODO

### 技术栈设计演进

- 2026_03_18 — 追加 Bridge Layer 实现时序 + 约束 5 + 风险表 2 条

### AI Runtime 架构设计

- 2026_05_23 — V3.1：统一 single_shot 命名；+中国 Provider；Intent Engine 纳入统一路由

### 界面设计规范

- 2026_05_31 — 创建：色彩令牌 / 排版 / 组件 / 三栏布局 / 导航 / 交互 / 响应式 / 暗色模式 / C-01~C-07

### 界面改版设计

- 2026_05_31 — 创建：Phase 1~3 视觉升级方案

### Domain 路由生成规范

- 2026_05_26 — 创建：构建时路由生成方案 B；manifest.yaml view_routes.url 字段规范

### Domain 注册指南（已并入 domain-development-guide）

- 2026_05_26 — 构建时路由生成流程说明；废弃手动创建 app/ 路由
- 2026_05_23 — Step 11 query_actions + Step 12 onQuery；manifest 区块 G
- 2026_05_22 — Step 9 Handler 扩展：onGenerate(aiRuntime) 依赖注入 + generation_actions 新字段

### 统一执行记录模型设计

- 2026_05_28 — 创建：ExecutionRecord 跨 domain 共享；HabitLog 对齐；+TaskExecutionLog；Domain manifest +cascade_rules

### 用户行为埋点设计

- 2026_05_30 — 创建：user_activities 表 + recordActivity + 时间衰减聚合
