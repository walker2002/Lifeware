# 项目文档清单

> 本文件为项目所有核心文档的**索引**。
> 文档版本历史见根目录 `CHANGELOG.md`（核心文档变更后 MUST 同步追加）。

## 文档归属模型

| 归属层 | 目录 | 维护者 | 规则 |
|---|---|---|---|
| **第一层：用户所有** | `mydocs/` | 用户编辑，Claude 只读 | 用户写指令后 Claude 才可更新 |
| **第二层：协同维护** | `docs/` | 用户定义意图，Claude 执行 | Claude 保证与代码一致性，用户不直接编辑 |
| **第三层：Claude 自动维护** | 根目录 + `.specify/` | Claude 维护，用户审批 | 包括本文件、`CHANGELOG.md`、CLAUDE.md、constitution.md、specs/ |

## 文档索引

### 第一层：用户所有 (`mydocs/`)

```
mydocs/core/
LW_overall_项目开发必读_2026_05_01.md          # 项目最高解释文档
LW_overall_总体设计_2026_05_02.md              # 架构设计-总体设计文档
LW_overall_技术栈设计演进_2026_03_18.md        # 技术栈选型与演进路径
LW_AI_Runtime_Architecture_Design.md           # AI Runtime 架构设计（LLMGateway/SessionManager/CN-UI Protocol/Handler 依赖注入）
```

> **注**：`LW_domain_注册指南` 已于 [019]（2026-06-21）移入 `docs/domain-development-guide.md`（归属转第二层），与 Domain 范式整合为单一权威文件。

### 第二层：协同维护 (`docs/`)

```
docs/
usom-design.md           # USOM 对象定义文档（由 LW_USOM_详细设计 演化）
database-design.md       # 数据库表结构与设计规范（由 LW_database_数据库设计 演化）
route-generation-spec.md # Domain 路由生成规范（构建时自动生成 app/ 路由文件）
UI-DESIGN-SPEC.md        # 界面设计规范（色彩/排版/间距/组件/布局/交互/响应式/暗色模式/检查清单）
code-commenting-guide.md # 代码注释规范（文件头、模块分隔、JSDoc、特殊标记）
UI-REDESIGN.md           # 界面改版设计（Phase 1~3 视觉升级方案）
domain-development-guide.md  # [019] Domain 开发权威指南（范式+注册+治理，单一权威文件）= 原 mydocs 注册指南 + domain-paradigm 整合；Part I 范式/治理/CI/C-DC，Part II Step1-13 机械指南（已对齐 tasks 参考实现）；route-generation-spec 为下级
superpowers/specs/
  2026-06-20-rules-three-tier-architecture-design.md  # [018-G3] 规则三层架构设计 v3（plan-eng-review CLEAN）
  2026-06-23-020-rules-management-redesign.md         # [020] 系统规则管理重设计（office-hours DESIGN，锁定 D1/D2/D3）
  2026-06-25-okr-task-domain-boundary-design.md        # OKR/Task Domain 边界决策（office-hours DESIGN，经对抗评审修正）：保持分离+OKR拥有junction，先读时聚合后建跨域分发器。[022] OKR 重组已确认 habits.key_result_id 一并迁移 junction（考古：非刻意不对称，见 CHANGELOG.md 2026_06_25）
superpowers/plans/
  2026-06-20-018-g3-r0-rules-framework.md             # [018-G3] R0 walking-skeleton 实现计划
  2026-06-20-018-g3-r1-habits-end-to-end.md           # [018-G3] R1 habits 端到端实现计划
  2026-06-24-020-rules-management-redesign.md         # [020] 去 C/L 范式重构实现计划（plan-eng-review CLEARED，RT1-RT9）

# [026] Itinerary 域 — Plan 在 `.superpowers/sdd/task-026-T{1..14}-brief.md`（不在 docs/superpowers/plans/，因 [026] 实施时未走完整 /superpowers:writing-plans 流程；brief 在 .superpowers/sdd/ 维护）。设计 authority 在 CHANGELOG.md `## Itinerary 域（[026]）` 段 + docs/usom-design.md §3.13 + docs/database-design.md §4.X。完整 ship-ready：A3 (T1-T14) 14 commits 已 ship，剩余 P2/P3 follow-up T15-T23。

# [026.02] 约定管理优化（§1 CNUI bug fix + §2 /appointments 重构）— Plan 在 `docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`（11 SDD task，ship-ready 2026-07-08）+ Spec `docs/superpowers/specs/2026-07-08-026-02-appointment-management-optimization-design.md`。覆盖：§1 [026.01] CNUI client 漏注册回归修复 + IRON RULE guardian（`register-client-surfaces.test.ts`）；§2 /appointments page 重构 Day/Month 双视图 + status/日期范围筛选 + Banner + 加载窗口 7d→90d。Authority：plan SSOT + spec SSOT + CHANGELOG.md `## [026.02]` + docs/usom-design.md（无变更）/ docs/database-design.md（无变更）。Post-ship review：[026.02.1]（commit 22ac0a7 I-1 mk() 类型签名修复 + 7 项 follow-up 登记，详见 CHANGELOG `## [026.02.1]`）。

# [026.02.2] 7 项 polish 收口（I-2 + M-1..M-7）— Plan 在 `docs/superpowers/plans/2026-07-09-026-02-2-appointment-polish.md`（7 SDD task，ship-ready 2026-07-09）+ Spec `docs/superpowers/specs/2026-07-09-026-02-2-appointment-polish-design.md`。覆盖：[026.02.1] 登记的 7 项 polish 全部 ship — M-4 ymdKey DRY → lib/appointment-date-utils.ts / I-2 月视图「条」后缀补回 / M-1 11 处 as any 移除 / M-2 mock rename / M-3 fake timers + 相对 offset / M-6 handleDelete 改 Promise.allSettled + 1 partial-failure test / M-5 click-toggle 保留 + CHANGELOG 登记 UX defer。Authority：plan SSOT + spec SSOT + CHANGELOG.md `## [026.02.2]` + docs/usom-design.md（无变更）/ docs/database-design.md（无变更）/ manifest.md（无变更）。Whole-branch review：SHIP-READY（0 critical / 0 important / 5 cosmetic minor ship-then-polish）+ vitest base=head +1 new test 零回归 + pre-push hooks 全过。延后到后续 task：TD-022 5 项 → [026.02.4] + /editAppointment TypeError → [026.02.3]（已闭环，详见下条）。

# [026.02.3] /editAppointment runtime TypeError 双层防御（2026-07-09, commit `e97b9a4` + `3ffc2c9`）— 独立 task（scope 1 commit, 未走完整 spec/plan 流程）；root cause 追溯走 `superpowers:systematic-debugging` skill。覆盖：handlers.ts:268-274 todayAppointments 投射 mapper 5 字段 → 8 字段（补 `detail` / `people` / `activityArchetypeId`）+ AppointmentFormFields 加 `?? []` + `?? ''` 防御深度 + edit-appointment.test.tsx IRON RULE 测试（模拟真实 handler 投射形状，5 字段缺字段时不崩）。Authority：CHANGELOG.md `## [026.02.3]`。Whole-branch verification：vitest `edit-appointment.test.tsx` 16/16 pass / tsc TS2741 15=15 baseline 零新增 / pre-push hooks 全过 / baseline flake（handlers.test.ts + timeboxes-workspace.ai-submit）已隔离确认与本修复无关。延后：EditAppointment.tsx:32 `as (AppointmentDraftFields & { status: string })[]` 类型 cast 透明性 + TypeScript 收紧 → [026.02.4]（与 TD-022 5 项同范围）。
# [026.02.3.1] 4 项 fresh drift 修复 + 5 cosmetic minor 收口 + post-ship round 2 3I+5M（2026-07-09）— 1 PR 7 task + 3 post-ship commits ship-ready（commit `3c08208` (head), push gitee origin main 6c81306..3c08208）；来自 [026.02.3] ship 后 `/lifeware-neat` 5 数据源重扫。覆盖：TD-024 `AISessionStatus` USOM 3→6 值三向一致（USOM + DB schema + 实际代码 transite map）/ TD-025 `v_running_timeboxes` 视图 stale filter 重写（派生 `status='planned' AND now∈[start,end]`，迁移 0036）/ TD-026 `ai_sessions` §8.x 文档格式 Markdown table → SQL block 统一 / TD-027 `docs/usom-design.md` + `docs/database-design.md` 页脚 `2026_07_07 → 2026_07_09` + 4 变更段补 + [026.02.2] whole-branch review 5 cosmetic minor polish 收口（C1/C2/C3/C4/C5 数字注释对齐） + **post-ship second-opinion 3 Important + 5 Minor 修复**（I-A TD-028 Site 0 = repository findRunning root source / I-B session-status IRON RULE 去 tautology / I-C README 索引 5 处补 + M-1..M-5 doc polish）。Authority：spec SSOT (`docs/superpowers/specs/2026-07-09-026-02-3-1-follow-up-fixes-design.md`, commit 17db764) + plan SSOT (本文档并行 commit) + CHANGELOG.md `## [026.02.3.1]`（含 "Post-Ship Round 2 修复" 子段）。Whole-branch verification：tsc 0 新增 / vitest baseline=head 0 回归 / pre-push hooks 全过 / `validate:manifest` 0 errors / `validate:structure` ✓ / `validate:rules-registry` 6 项一致 (无变更) / IRON RULE `session-status.test.ts` pass (round 2 简化后) 。Post-ship round 2 又一次验证 SDD whole-branch APPROVED ≠ ship-ready — 抓 first review 漏的 3 Important (dead query root source / 测试自验 tautology / ledger index secondary view drift)，见 [[feedback_post-ship-review-meta-pattern]]。延后：TD-022 5 项（archetype clearing / UUID 验证 / newDurationMin 语义 / perf N+1 / originalPrompt banner）+ EditAppointment.tsx:32 类型 cast 透明性 + TD-028 5 sites (含 Site 0 repository) → [026.02.4]。

# [026.02.4] TD-022 5 items + TD-028 5 sites + EditAppointment cast 修复（2026-07-09）— 1 PR 6 SDD tasks + 3 review rounds ship-ready（commit `b209cd4` head, push gitee origin main `4dac296..b209cd4`，已 push）；来自 [026.02.3.1] post-ship round 2 + TD-022 ledger 5 items 累积。覆盖：TD-022 #2 UUID 防御（v4 regex）+ #3 newDurationMin > 0 contract + #6 archetype clearing 3-state（real UX bug — picker transform undefined→null + handlers.ts 3-state mapper + updateAppointment server action）+ #8 banner conditional + EditAppointment cast 透明性（`status: string` → AppointmentStatus literal） + TD-028 Site 0 repository findRunning rewrite（`status='planned' AND startTime <= NOW() AND endTime >= NOW()` server-side 等价 TD-025 view 派生）+ Sites 1-4 caller updates（matchTarget + use-auto-trigger + error msg + fixture）+ TD-030 / TD-031 登记（post-T2 / post-T5 review 抓出的次级 drift）+ TD-028 ledger close（status → 已修复 + 修复记录段）。Authority：spec SSOT（`docs/superpowers/specs/2026-07-09-026-02-4-follow-up-fixes-design.md`，commit 4dac296）+ plan SSOT（`docs/superpowers/plans/2026-07-09-026-02-4-follow-up-fixes.md`，commit e562954）+ CHANGELOG.md `## [026.02.4]` + `## [026.02.4-r2]` + `## [026.02.4-r3]`。Whole-branch verification：tsc 0 新增 / vitest baseline=head 0 回归 / pre-push hooks 全过 / `validate:manifest` 0 errors / `validate:structure` ✓ / `validate:rules-registry` 6 项一致（无变更）/ TD-028 grep closure proof（`grep 'running' src/` 在 production 0 hits — 仅命中合法 `display === 'running'` 派生比较）/ 3-state semantics verification（null vs undefined distinct test）。3 review rounds 累计：r1 SDD whole-branch Opus (Ship-Ready) + r2 post-ship second-opinion Opus (4 Important 全修) + r3 pre-land-review specialist-army + Codex adversarial (1 P0 useAutoTrigger double-fire + 1 P1 EditTimeboxes Site 5 + 注释修正)。r3 是 [[feedback_post-ship-review-meta-pattern]] 第 4 次验证（Codex 抓出 Opus 3 轮 + Sonnet 4 specialist 全部漏的 2 个 production-impact bug）。延后：TD-022 #7 N+1（defer）+ TD-029 EditAppointment 3 处 `'in_progress'` literals（T3 已 incidental fix，TD-021 覆盖 drift class）+ r3 P2/P3 (findRunning IRON RULE 不绑列 / newDurationMin typeof 拒 stringified / UUID v4 锁定 legacy / setInterval reset / clock-source 分歧 / misleading comments / dead `surfaceType` / design polish) → 后续 session。


# [023.05-2] Itinerary → Appointment 全层重命名（PR2 阶段 2）— Plan 在 `docs/superpowers/plans/2026-07-05-023-05-2-itinerary-to-appointment-rename.md`（11 task + C1 fix + T11 fixup 共 12 commits，ship-ready 2026-07-05）。设计覆盖：schedule→appointment（eng-review 用户识别 schedule 与 timebox 撞车）。Authority：plan SSOT + CHANGELOG.md `## [023.05-2] Itinerary → Appointment 全层重命名（PR2 阶段 2，ship-ready 2026_07_05）` + docs/usom-design.md §3.13 + docs/database-design.md §4.X。剩余 defer：[023.10] postship follow-up。

# [027-A] activityArchetype 界面规范处理 — Phase A：原型选择器统一（2026-07-11，ship-ready）— Plan 在 `docs/superpowers/plans/2026-07-11-027-a-archetype-unify.md`（5 SDD task T1-T5）。Phase A of [027]：[027-B] Timebox 模板层接入前的消费方统一。设计覆盖：单一 `ArchetypePicker` + `variant` prop（`card`=带盒+h3 / `inline`=裸版），删除 `ArchetypePickerCard`；AI 匹配补全（TaskCreationCard / TaskEditCard / habit-form）；3-state 清除语义（`undefined`=skip / `null`=clear / `string`=set）；USOM `Task.activityArchetypeId` / `Habit.activityArchetypeId` 由 `USOM_ID?` widen 到 `USOM_ID | null`（DB FK nullable `ON DELETE SET NULL` 已支持 NULL，USOM 类型原先 undefined-only 是 imprecision）；`/tasks` 页面补齐 archetype 编辑入口（task-create-drawer 创建 + task-edit-zone inline 编辑）。Authority：plan SSOT + CHANGELOG.md `## [027-A]` + docs/usom-design.md §3.4/§3.7（`activityArchetypeId?: USOM_ID | null` + 3-state 语义说明）。`/qa` 发现并修复 TaskCreateDrawer `handleSubmit` 闭包漏 `activityArchetypeId` deps（commit 1b0e971 + 回归测试 24aea05）。Whole-branch verification：tsc 0 新增 / vitest baseline=head 零回归 / pre-push hooks 全过。Phase B 后续 → [027-B]。

# [027-B] 时间盒模板增强（template enhance，2026-07-11）— Plan 在 `docs/superpowers/plans/2026-07-11-027-b-template-enhance.md`（6 SDD task，ship-ready 2026-07-11）。Phase B of [027]：[027-A] archetype picker 统一后的模板层接入。设计覆盖：`TemplateRow` JSONB 形状重构（`{start,end}` → `{defaultStart, defaultDuration, earliestStart?, latestStart?, shortestDuration?, activityArchetypeId?}`）+ 仓储 `rowToTemplate` 读时 lazy 自愈旧形状 + 行为矩阵精炼（custom 可编辑全部，habit 时间/约束锁时，task/thread 原型只读派生+时间可编辑）+ `validateTemplateRow` 纯函数 onBlur 校验 + TemplateCard 徽章 + RowEditor 多行卡片化。**无 DDL**。Authority：plan SSOT（STACK REVIEW REPORT 已附：plan-eng-review CLEAR + OV-A/B/C 全折入 + Task7 回填 SQL 删除）+ spec SSOT `docs/superpowers/specs/2026-07-11-027-b-template-enhance-design.md` §3（形状）+ §3.4（行为精炼）+ CHANGELOG.md `## [027-B]` + docs/usom-design.md §3.12（TemplateRow 形状更新 + 行为精炼 + 自愈）+ docs/database-design.md §7.8（rows 字段表更新 + 自愈说明）。Whole-branch verification：tsc 0 新增 / vitest baseline=head 零回归 / pre-push hooks 全过。`/qa` 2 项 prod-blocking 已在 `8c30458` 修：Server Action sync 500 + SheetDescription a11y。

# [023.12] 三域生命周期语义重构（office-hours DESIGN + plan-eng-review CLEARED + /qa ship-ready）— Plan 在 `docs/superpowers/plans/2026-07-06-023-12-lifecycle-simplify.md`（15 SDD task + 4 plan-eng-review AM1-AM10 amendments + codex outside voice 吸收 + 3 /qa 真 issue 修 + 4 pre-land cluster fix = 24 commits，ship-ready 2026-07-06）。设计覆盖：timebox 6→3 态、cycle 5→4 态、appointment 5→3 态；时间态（running/overtime/in_progress/expired）改读时派生；cycle 字段 AM6 rename（started_at→approved_at, ended_at→finished_at）；2 条 revert transition per domain；**反向 [026] D2 reversal**（appointment 从持久化改派生）。Authority：plan SSOT（含 GSTACK REVIEW REPORT + per-task briefs/reports at .superpowers/sdd/）+ CHANGELOG.md `## USOM 详细设计 2026_07_06 [023.12]` + docs/usom-design.md §3.5a/§3.9/§3.13 + docs/database-design.md §4.0/§4.7/§4.X。剩余 ship-then-polish 7 错：tsc 95（baseline 103 - 8 真修；剩 7 是 tasks/hooks.ts fixture + intent.ts/timebox.ts 漏跟 + habits 域），[023.13] 收口。
```

### 第三层：Claude 自动维护

```
/manifest.md                                # 本文件 — 文档索引
/CHANGELOG.md                               # 文档版本历史（变更日志）
/CLAUDE.md                                  # Claude Code 开发指引
/.specify/memory/constitution.md            # 项目宪章
/.specify/amendments/                        # 宪法修订提案 + 待 revisit 议题存档
  proposed-IX-domain-paradigm.md            # §IX Domain 范式修订记录（✅ EFFECTIVE，constitution v2.0.0）
  revisit-manifest-rules-design-tensions.md # 🟡 待 revisit：mutation_mode 正交轴裂缝 + manifest 区块 C/L 过度设计（2026-06-23 存档，未修订）
/specs/                                     # speckit 工作流生成的特性文档
```

## 文档更新规范

> **重要**：每次更新核心文档后，必须同步更新 `CHANGELOG.md`。

### 更新流程

**第一层文档变更时：**
1. 用户直接编辑 mydocs/ 下的文档
2. 用户发出指令，Claude 根据变更同步更新第二层、第三层相关文件
3. Claude 更新 `CHANGELOG.md`

**第二层文档变更时（用户定义意图 → Claude 执行）：**
1. 用户描述意图（新增对象、修改字段等）
2. Claude 更新 `docs/usom-design.md` 和/或 `docs/database-design.md`
3. Claude 同步更新 Schema 代码
4. Claude 更新 `CHANGELOG.md`

**第三层文档变更时：**
1. Claude 更新对应文件
2. Claude 更新 `CHANGELOG.md`（如涉及核心文档变更）
