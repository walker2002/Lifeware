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

# [023.05-2] Itinerary → Appointment 全层重命名（PR2 阶段 2）— Plan 在 `docs/superpowers/plans/2026-07-05-023-05-2-itinerary-to-appointment-rename.md`（11 task + C1 fix + T11 fixup 共 12 commits，ship-ready 2026-07-05）。设计覆盖：schedule→appointment（eng-review 用户识别 schedule 与 timebox 撞车）。Authority：plan SSOT + CHANGELOG.md `## [023.05-2] Itinerary → Appointment 全层重命名（PR2 阶段 2，ship-ready 2026_07_05）` + docs/usom-design.md §3.13 + docs/database-design.md §4.X。剩余 defer：[023.10] postship follow-up。

<<<<<<< Updated upstream
# [023.12] 三域生命周期语义重构（timebox / OKR cycle / appointment）— Design `docs/superpowers/specs/2026-07-06-023-12-lifecycle-simplify-design.md`（APPROVED by /office-hours）+ Plan `docs/superpowers/plans/2026-07-06-023-12-lifecycle-simplify.md`（plan-eng-review 21 findings 全折入，14 task + T9 fix + T11 docs + T12 待跑）。Authority：CHANGELOG.md `## [023.12] 三域生命周期语义重构（2026-07-06）` + docs/usom-design.md §3.5a/§3.9/§3.13 + docs/database-design.md §4.0/§4.7/§4.X + 迁移 0034 摘要。**关键决议**：反转 [026] D2 reversal（appointment 持久态 5 值→3 值，in_progress/expired 派生显示；不再 lazy reconcile 写库）。
=======
# [023.12] 三域生命周期语义重构（office-hours DESIGN + plan-eng-review CLEARED + /qa ship-ready）— Plan 在 `docs/superpowers/plans/2026-07-06-023-12-lifecycle-simplify.md`（15 SDD task + 4 plan-eng-review AM1-AM10 amendments + codex outside voice 吸收 + 3 /qa 真 issue 修 + 4 pre-land cluster fix = 24 commits，ship-ready 2026-07-06）。设计覆盖：timebox 6→3 态、cycle 5→4 态、appointment 5→3 态；时间态（running/overtime/in_progress/expired）改读时派生；cycle 字段 AM6 rename（started_at→approved_at, ended_at→finished_at）；2 条 revert transition per domain；**反向 [026] D2 reversal**（appointment 从持久化改派生）。Authority：plan SSOT（含 GSTACK REVIEW REPORT + per-task briefs/reports at .superpowers/sdd/）+ CHANGELOG.md `## USOM 详细设计 2026_07_06 [023.12]` + docs/usom-design.md §3.5a/§3.9/§3.13 + docs/database-design.md §4.0/§4.7/§4.X。剩余 ship-then-polish 7 错：tsc 95（baseline 103 - 8 真修；剩 7 是 tasks/hooks.ts fixture + intent.ts/timebox.ts 漏跟 + habits 域），[023.13] 收口。
>>>>>>> Stashed changes
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
