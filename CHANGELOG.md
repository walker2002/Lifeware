# 文档变更日志 (CHANGELOG)

> 项目核心文档的版本演进记录。每次文档级变更后 **MUST** 同步追加。
> 执行细节（commit / 子任务编号 / 技术方案）留在 git、memory、specs/plans；
> 本文件只记**文档级里程碑**。同文档同日多次变更合并为一行。
>
> 历史归档见文末「## 历史归档 (≤ 2026-05-31)」。

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
