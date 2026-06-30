# 项目文档清单与版本追踪

> 本文件为项目所有核心文档的索引与版本追踪表。
> Claude 在更新核心文档后 **MUST** 同步更新本文件的版本历史表。

## 文档归属模型

| 归属层 | 目录 | 维护者 | 规则 |
|---|---|---|---|
| **第一层：用户所有** | `mydocs/` | 用户编辑，Claude 只读 | 用户写指令后 Claude 才可更新 |
| **第二层：协同维护** | `docs/` | 用户定义意图，Claude 执行 | Claude 保证与代码一致性，用户不直接编辑 |
| **第三层：Claude 自动维护** | 根目录 + `.specify/` | Claude 维护，用户审批 | 包括本文件、CLAUDE.md、constitution.md、specs/ |

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
  2026-06-25-okr-task-domain-boundary-design.md        # OKR/Task Domain 边界决策（office-hours DESIGN，经对抗评审修正）：保持分离+OKR拥有junction，先读时聚合后建跨域分发器。[022] OKR 重组已确认 habits.key_result_id 一并迁移 junction（考古：非刻意不对称，见版本历史 2026_06_25）
superpowers/plans/
  2026-06-20-018-g3-r0-rules-framework.md             # [018-G3] R0 walking-skeleton 实现计划
  2026-06-20-018-g3-r1-habits-end-to-end.md           # [018-G3] R1 habits 端到端实现计划
  2026-06-24-020-rules-management-redesign.md         # [020] 去 C/L 范式重构实现计划（plan-eng-review CLEARED，RT1-RT9）
```

### 第三层：Claude 自动维护

```
/manifest.md                                # 本文件 — 文档索引与版本追踪
/CLAUDE.md                                  # Claude Code 开发指引
/.specify/memory/constitution.md            # 项目宪章
/.specify/amendments/                        # 宪法修订提案 + 待 revisit 议题存档
  proposed-IX-domain-paradigm.md            # §IX Domain 范式修订记录（✅ EFFECTIVE，constitution v2.0.0）
  revisit-manifest-rules-design-tensions.md # 🟡 待 revisit：mutation_mode 正交轴裂缝 + manifest 区块 C/L 过度设计（2026-06-23 存档，未修订）
/specs/                                     # speckit 工作流生成的特性文档
```

## 文档更新规范

> **重要**：每次更新核心文档后，必须同步更新本文件的版本历史表。

### 更新流程

**第一层文档变更时：**
1. 用户直接编辑 mydocs/ 下的文档
2. 用户发出指令，Claude 根据变更同步更新第二层、第三层相关文件
3. Claude 更新本 manifest 的版本历史表

**第二层文档变更时（用户定义意图 → Claude 执行）：**
1. 用户描述意图（新增对象、修改字段等）
2. Claude 更新 `docs/usom-design.md` 和/或 `docs/database-design.md`
3. Claude 同步更新 Schema 代码
4. Claude 更新本 manifest 的版本历史表

**第三层文档变更时：**
1. Claude 更新对应文件
2. Claude 更新本 manifest 的版本历史表（如涉及核心文档变更）

## 版本历史

| 文档 | 当前版本 | 上一版本 | 主要变更 |
|---|---|---|---|
| OKR Domain Phase 1 重构 | 2026_06_26 | 无 | [022] Phase 1：Cycle 升格一级对象（cycles 表 + objectives.cycle_id，DB 移除 period、USOM 派生）+ 扶正 §III 写入口（createOkrsMutationService + manifest mutation_mode 三分类 + FactField 走 FieldExecutor + 删违宪直写 + OkrFieldUpdated）+ OKR 范围 list_actions 收敛。CNUI Surface/工作台重写/AI 整合 defer Phase 3。触动 usom-design/database-design/domain-development-guide |
| [022] 收尾 — QA/Review/Defer 修复 | 2026_06_26 | 2026_06_26 | [022] Phase 3 后的关键缺陷修复：(1) **QA ISSUE-001**（commit `08bb704`）`/okrs` 500 — `"use server"` boundary 违宪（导出非 async）+ `CycleRepository` 经 client hook 泄漏 postgres bundle，加 server action `getActiveCycles`/`createCycle`（`createCycle` 登记 `write-entry-guard.test.ts` ALLOWED_DIRECT_WRITES 白名单，Cycle 单行 upsert 无跨表副作用）；(2) **Review 3 critical findings**（commit `0562c75`）`KeyResultRepository.updateProgress` 补 `tx: DbClient = db` 参数并透传到所有 `db.*` 与 `contributionRepo.*` 调用（修复原子性违反，PG READ COMMITTED 下 SELECT-then-UPDATE 失更新竞态）；`ContributionRepository.add` 增 KR owner-check（FK 不强制 user_id 匹配，跨租户污染修复）；`write-entry-guard.test.ts` JSDoc 块注释剥离修复（`/* ... */` 块注释中方法名示例误判）+ ALLOWED_DIRECT_WRITES 白名单；(3) **Defer 三连击**（commits `9ea6853` + `265fcfd`）— **ADV-#1** `SystemEventRepository.findByIntent(intentId, userId)` JSONB 路径查询替代 orchestrator「5s 窗口 + JS intentId 过滤」消除并发意图泄漏；**ADV-#2** onEvent 失败持久化 `OnEventDispatchFailed` 事件（含 originalEventId/originalIntentId/targetDomain/error）供回溯，SystemEventType 新增该事件（triggeredBy 复用 `'handler'` 避免 DB enum 迁移）；**TEST gaps** 补 KR `updateFields`/`save`/`archive` + app/actions/okr.ts Server Actions 集成测试，发现并修复 `keyResultRowToUSOM` mapper 漏映射 `archivedAt`/`completedAt`（USOM KeyResult 类型同步补字段）。触动 usom-design（KR 接口 + SystemEventType）|
| OKR Domain Phase 2 重构 | 2026_06_26 | 2026_06_26 | [022] Phase 2：contributions junction（贡献表 + ContributionRepository + IContributionRepository）+ KeyResult.currentValue 派生自 contributions（recomputeProgress + updateProgress 重算 + orphan 清理）+ CompletedTasksProvider（跨域 ContextProvider）+ habits.key_result_id 迁移到 contribution 行 + habits/habit mappers/summaries 去 keyResultId。触动 usom-design/database-design/domain-development-guide |
| OKR Domain Phase 3 工作台 | 2026_06_26 | 2026_06_26 | [022] Phase 3 完成 — `/okrs` 工作台（手写 page route + OKRWorkspace standalone prop + `?detail=` 查询参数）+ OKRForm ModeSwitcher（手动 \| AI 导入）+ TemplateSelector（季度/月度/个人成长 3 模板）+ ActiveHabitsProvider（跨域 ContextProvider 复用 CompletedTasksProvider 模式）+ ContributionPanel（KR 详情贡献管理，client 搜索 + server action）+ 事件驱动 recompute（Orchestrator post-mutation hook + OkrsHookRepos.contributionRepo + onEvent TaskCompleted/HabitLogged case）+ manifest 清理（intent_triggers 仅保留 view_workspace，lifecycle action triggers 由 lifecycle 配置驱动走 SM 不走 AI 路由）。tsc 49 零新增 / OKR vitest 90 PASS / habits 6 pre-existing failures 不变 / 跨域 grep 守卫 4/4 PASS（Drizzle `s.tasks`/`s.habits` schema 别名为 false positive，零真 `@/domains/(tasks\|habits)` import） | 1.15.0 |
| 项目宪章 | 2026_06_24 | 2026_06_22 | v2.0.0→v2.1.0：**MINOR** — §IX 约束2删 inline 编辑诱导句、约束3改 registry 即 SSOT（manifest 不再声明 rules，registry 自带 phase/fields/message meta）；§VIII 治理约束更新；§III 字段三分类正交澄清（[020]） |
| 项目宪章 | 2026_06_22 | 2026_06_20 | v1.11.1→v2.0.0：**MAJOR** — Core Principles 新增 **§IX Domain Development Paradigm**（七层范式 5 constraints：写入口两合法路径/跨字段红线/规则三层/治理 CI 强制/页面表单非写入口）；**显式 supersede** §CN-UI Protocol Constraints 第 4 条「Form Component Reuse Constraint」（CnuiFormAdapter 强制复用 → 手写 surface + `useManifestRules` + `useServerErrorBackfill`，[019.1] habits 退役 adapter 解锁）。supersede 属向后不兼容治理变更，主导版本定级 MAJOR。提案 `.specify/amendments/proposed-IX-domain-paradigm.md` 状态 PROPOSED→EFFECTIVE；Tier-2 操作展开见 `docs/domain-development-guide.md` |
| Domain 开发权威指南 | 2026_06_21 | — | [019]：原 `mydocs/core/LW_domain_注册指南` 移入 `docs/domain-development-guide.md`（归属转第二层）并与 Domain 范式整合为**单一权威文件**；Part I 范式与治理（写入口两合法路径适用场景+跨字段红线 `mutation_mode` 字段分类+治理 must/should+sunset 豁免+CI validator+C-DC [CI]/[HUMAN]+四域现状），Part II Step1-13 机械指南（Step3/5.5/13 加 paradigm 对齐）；route-generation-spec 为下级。含 §IX 修订提案（supersede §CN-UI 第 4 条）。经 /plan-eng-review 2026-06-21 通过 |
| Domain 开发权威指南 | 2026_06_21（Part II 对齐） | 2026_06_21 | Part II 注册步骤全面对齐 tasks 参考实现：Step 2 manifest 模板补 `rules:`/`field_metadata.mutation_mode`/`cnui_surfaces` map/根字段 `id`；Step 3 hooks 工厂 + onValidate 委托 `evaluateDomainRules`；Step 4 schema 改 `src/lib/db/schema.ts` 集中；Step 5 repository 目录；新增 Step 5.5 mutation-service；Step 13 cnui 注册签名对齐；概念统一 `requires_full_validate`→`mutation_mode`；编号对齐总览（页面 Step 6 / 注册 Step 7 / Markdown Step 8） |
| Domain 开发权威指南 | 2026_06_22 | 2026_06_21 | [019.1] CnuiFormAdapter 退役：habits 手写化（`HabitCreationCard` 直引 `HabitForm`，L4 翻 ✅）+ 删 `FormRegistry`/`CnuiFormAdapter`/`register-form.ts` 抽象层 + validator `L4-1`（`cnui-form-adapter-forbidden`）/`L7-2`（`form-registry-residual`）落地（§IX 兑现，真实 src 零残留）；habits `L6` 回填已接翻 ✅。四域现状矩阵、L4-1/L7-2 治理表、Step 13 paradigm 对齐同步去降级 TODO |
| UI-DESIGN-SPEC | 2026_06_13 | 2026_05_31 | §十一 CN-UI 大幅修订：容器改单层架构（CnuiSurfaceWrapper 提供容器，Surface 用 Fragment）；标题行改为 header prop（移除静态标题）；全屏按钮移至 wrapper 标题行（⛶/↙ 小图标）；全屏模式改 CSS fixed 状态保持（删 CnuiSurfaceFullscreen Dialog）；新增 §11.10 新增 Surface 自测检查点 CUC-01~CUC-12 |
| 总体设计 | 2026_05_02 | 2026_03_18 | 增加附录 TODO，列出可能的下一步核心扩展设计（非 MVP 考虑） |
| 技术栈设计演进 | 2026_03_18 | 2026_02_27 | 各阶段追加 Bridge Layer 实现时序、新增约束5、风险表新增2条 |
| USOM 详细设计 | 2026_05_12 | 2026_03_21 | 新增 Project/ProjectTemplate/TaskTemplate 类型；TaskStatus 扩展 in_progress/on_hold 状态、deprecated scheduled；Task 新增 parentId/projectId/时间窗口/频率等 10 个字段 |
| 数据库设计 | 2026_05_12 | 2026_03_21 | 新增 projects/project_templates/task_templates 表；tasks 表扩展状态枚举、新增 parent_id/project_id/时间窗口/频率等列和索引 |
| Domain 注册指南 | 2026_05_22 | 2026_05_15 | Step 9 Handler 扩展：onGenerate(request, aiRuntime) 依赖注入模型、AI Runtime 使用要点、generation_actions 新字段（session_mode/response_mode/cnui_surface/cache_ttl_minutes）、CN-UI 约束、Streaming 策略、AIRuntimeError 降级、新增 8 条错误模式 |
| USOM 详细设计 | 2026_05_16 | 2026_03_21 | 新增 ChatMessage/AISession/AISessionSummary/LLMConfig/UserSettings 类型及生命周期约束 |
| 数据库设计 | 2026_05_16 | 2026_03_21 | 新增 ai_sessions 表（10列+2索引）、user_settings 表（6列+1唯一索引） |
| AI Runtime 架构设计 | 2026_05_23 | 2026_05_22 | V3.1 修正：统一 single_shot 命名、Provider 列表新增中国 Provider（DashScope/DeepSeek/智谱）、Intent Engine 纳入 AI Runtime 统一路由、LLMGateway.call 签名修正+默认路由配置、Section 10 全章编号重排（10.1~10.9）、CnuiSurface 命名统一（PascalCase 类型/camelCase 字段）、新增 AITaskType 映射表、新增 LLMGateway 与 /lib/llm/ 迁移关系、新增 CN-UI Payload LLM 生成机制、CN-UI 确认复用现有 Proposal 流程、核心设计决策扩展至 11 条 |
| 项目宪章 | 2026_05_22 | 2026_05_20 | v1.5.0→v1.6.0：新增 AI Runtime Constraints（7项）、CN-UI Protocol Constraints（3项）；扩展 Orchestrator Purity（AI Runtime 注入）、Domain Manifest Self-Description（session_mode/response_mode/cnui_surface）、Handler（onGenerate hook + aiRuntime 依赖注入） |
| USOM 详细设计 | 2026_05_22 | 2026_05_20 | 新增 AI Runtime 类型（AITaskType/TokenUsage/LLMProviderConfig）、CN-UI 类型（CNUISurface/CNUIMessage/CNUIEvent/CNUISurfaceStore）、错误类型（AIRuntimeError/CNUISchemaError） |
| 总体设计 | 2026_05_22 | 2026_05_02 | Nexus 基础设施层新增 AI Runtime 组件；Orchestrator Generative Path 描述更新（AI Runtime 依赖注入模型） |
| 项目宪章 | 2026_05_23 | 2026_05_22 | v1.6.0→v1.7.0：Query Path 三路径路由；Principle I 路由输出从 (domain, action) 扩展为 (domain, action, pathType)；Principle VI Handler 新增 onQuery hook + query_actions manifest block；Principle VIII Query Path 绕过 Rule Engine 显式例外；新增 Query Path Constraints（6项）；扩展 Orchestrator Purity（Shortcut Path CN-UI 组装）、Domain Manifest Self-Description（query_actions 第四 manifest block）、Domain Registration Process（Step 11–12） |
| 总体设计 | 2026_05_23 | 2026_05_22 | 新增 Query Path 执行链（第三条路径）；Orchestrator 三路径识别（Reactive/Generative/Query）；Intent Engine 阶段 A 路由输出新增 pathType；AI 意图驱动形式标注路径对应关系 |
| 总体设计 | 2026_05_26 | 2026_05_23 | 新增 Domain 独立性保证章节（4.4 构建时路由生成机制）：说明构建时路由生成方案如何保持 Domain 完全独立性；自动生成 app/ 路由文件的原理和流程 |
| Domain 注册指南 | 2026_05_23 | 2026_05_22 | 新增 Step 11（query_actions manifest 声明）、Step 12（onQuery Handler 方法）；manifest 模板新增区块 G（query_actions）；新增 query_actions 与 view_route 边界区分；新增 onQuery 与 onGenerate 对比表；完成检查清单新增 Query Actions 和 onQuery Handler 项；新增 6 条错误模式 |
| Domain 注册指南 | 2026_05_26 | 2026_05_23 | 新增构建时路由生成流程说明：manifest.view_routes 新增 url 字段规范；scripts/generate-routes.ts 工作原理；package.json 集成（predev/prebuild hooks）；废弃手动创建 app/ 路由方式；更新 Next.js 路由注册章节和检查清单 |
| 项目宪章 | 2026_05_26 | 2026_05_23 | v1.7.0→v1.7.1：PATCH 修订 — 阐明 view_routes 实现细节：build-time route generation from manifest.url 字段 to maintain Domain independence despite Next.js App Router constraints；更新 Domain Registration Process section (Step 6-8)；扩展 Manifest Self-Description with view_routes.url field；添加 build-time route generation constraint |
| Domain 路由生成规范 | 2026_05_26 | 无 | 创建。定义构建时路由生成方案（方案 B），实现 Domain 完全独立性；规范 manifest.yaml 的 view_routes.url 字段；定义生成脚本行为和 package.json 集成；明确 Domain 新增/删除/修改流程 |
| 统一执行记录模型设计 | 2026_05_28 | 无 | 创建。ExecutionRecord 跨 domain 共享（增加 sourceType），HabitLog 字段对齐 ExecutionRecord，新增 TaskExecutionLog，ActionSurfaceSuggestion 扩展 suggestionType，新增 ExecutionLogged 事件，Domain manifest 增加 cascade_rules，State Machine 发射 ExecutionLogged |
| USOM 详细设计 | 2026_05_28 | 2026_05_22 | HabitLog 字段对齐 ExecutionRecord（删除 HabitLogStatus，新增 completionStatus/plannedDuration/deviationMinutes/completionRating/energyLevel，source 扩展 timebox_sync），Task 新增 lastExecutionRecord，ExecutionRecord 增加 sourceType/ExecutionRecordBase，新增 TaskExecutionLog 类型，SystemEventType 新增 ExecutionLogged，ActionSurfaceSuggestion 扩展 suggestionType/targetType/targetId/payload |
| 数据库设计 | 2026_05_28 | 2026_05_16 | habit_logs 字段变更（status→completion_status，新增 planned_duration/deviation_minutes/completion_rating/energy_level，source 扩展 timebox_sync），新增 task_execution_logs 表 |
| 数据库设计 | 2026_05_30 | 2026_05_28 | 新增 user_activities 用户行为埋点表（统一分析入口，4 种行为类型，时间衰减聚合查询）；新增"用户行为分析"表分类 |
| 用户行为埋点设计 | 2026_05_30 | 无 | 创建。用户行为埋点框架设计（user_activities 表 + recordActivity Server Action + 时间衰减聚合 + AI 助手常用意图展示改造 + /analytics 独立分析页面） |
| 界面设计规范 | 2026_05_31 | 无 | 创建。完整 UI 设计规范：色彩令牌体系、排版/间距/圆角/阴影层级、基础组件规范（按钮/输入框/卡片/气泡/徽标/空状态/加载）、布局系统（AppShell 三栏）、导航系统、交互规范（动画/反馈/键盘）、响应式断点、图标/暗色模式规范、AI Agent 检查清单 C-01~C-07 |
| 系统规则管理重设计 | 2026_06_23 | 无 | 创建（office-hours 产出，DESIGN）。[020] 基于 revisit 存档（mutation_mode 正交轴裂缝 + manifest C/L 过度设计）+ `mydocs/dev/020` 需求。锁定三项决策：D1 Business Rule 集中管理进代码/「动态」指 Policy 本次不做；D2 Tasks+Habits 完整做 + OKR/Timebox sunset 记债；D3 批量编辑走聚合事务+聚合校验，**不保留**「单字段触发相关规则」（020 该句作废）。规则三分类（Business/Governance/Policy）+ 判据（查库与否/跨域与否）。**plan 已产出**（`plans/2026-06-24-020-rules-management-redesign.md`，/plan-eng-review CLEARED，9 findings → RT1-RT9）；updateTask/updateThread 事务 bug 已独立修复（a47c418，聚合校验留 D3）。触动 constitution §IX 约束 2/3 + §III |
| 系统规则管理重设计 plan | 2026_06_24 | 无 | 创建（/writing-plans 产出，TDD）。[020] 去 C/L 范式重构主体（7 Phase/~20 Task）：registry 扩展自带 fields/message meta（registry 即 SSOT）→ evaluate/realtime/useManifestRules 改读 registry → 删 get-realtime-rules 中转 + manifest C/L → 删 G-rule-integrity + validate-domain-structure 补「realtime 恰 1 字段」CI（C1）→ constitution MINOR 2.0.0→2.1.0。plan-eng-review 9 findings 全 resolve 落 RT1-RT9（F1 选 B 彻底收敛 message 双源→提取常量；T1 D 模式吞粒 regression mandatory；A1 Phase1-3 中间态须连续完成）。D3 聚合校验 + E 区 required_fields defer |
| 项目宪章 | 2026_05_31 | 2026_05_29 | v1.8.0→v1.9.0：MINOR — 新增 UI 设计规范治理；Document Authority Chain 补充 UI-DESIGN-SPEC.md；Tier 2 文档清单补充；Compliance Review 新增 UI 合规审查条目（C-01~C-07） |
| USOM 详细设计 | 2026_06_03 | 2026_05_28 | Task Domain 重构：Project→Thread（ProjectStatus→ThreadStatus，projectId→threadId）；移除 ProjectTemplate/TaskTemplate；Task 新增双轴标签系统（AI 维护：clarity/complexity/decomposition + 用户管理：captureMode/energyProfile/schedulingConstraint/tracking + aiTags）；SystemEventType 从 Project* 更新为 Thread* |
| 界面改版设计 | 2026_05_31 | 无 | 创建。Phase 1~3 视觉升级方案：三栏布局优化、欢迎页 AI 引导区、任务/习惯卡片改版 |
| 代码注释规范 | 2026_06_01 | 无 | 创建。规范 TS/JS 文件注释格式：文件头 @file/@brief、模块分隔、JSDoc、TODO/FIXME 标记、简体中文要求 |
| 数据库设计 | 2026_06_03 | 2026_05_30 | projects→threads 表（移除 planning 状态）；删除 project_templates/task_templates 表；tasks 表新增双轴标签列 + ai_tags 列 + 8 个索引；迁移 0013 |
| USOM 详细设计 | 2026_06_04 | 2026_06_03 | 清理残留文本（废弃的 ProjectTemplate/TaskTemplate 代码片段）；更新文档版本号 |
| 数据库设计 | 2026_06_04 | 2026_06_03 | 视图 v_today_pending_habits 修复（hl.status→hl.completion_status）；表结构总览补充 threads |
| 数据库设计 | 2026_06_06 | 2026_06_04 | tasks 表状态枚举回退对齐代码实际值（todo/planned/in_progress/completed/archived）；移除已废弃列（key_result_id/timebox_id/frequency_type/days_of_week）；v_active_tasks 视图修复（列名+状态值） |
| 界面设计规范 | 2026_06_08 | 2026_05_31 | v1.1→v1.2：新增颜色对比度铁律（WCAG AA 阈值表）；primary/on-primary 可访问性警告及替代方案（primary-active）；text-muted 使用限制（交互元素禁用，统一用 text-body）；C-01/C-06 检查项新增对比度验证 |
| USOM 详细设计 | 2026_06_08 | 2026_06_04 | TaskStatus 枚举对齐代码与数据库（draft|active|on_hold → todo|planned，移除 deprecated scheduled）；状态转换图同步更新；清理 USOMSnapshot 旧状态注释 |
| Nexus 统一设计 | 2026_06_10 | 2026_06_08 | Phase A→A/B/C 三阶段演进归档：追加 Phase B（Thread 写操作 Nexus 统一 + CNUI Surface 注册修复）、Phase C（deleteTask/refineTask/splitTask 分支补全 + 通用成功消息映射）；三阶段全部标记已完成 |
| 界面设计规范 | 2026_06_10 | 2026_06_08 | §1.1 新增 CN-UI 表单标签规则（text-body 禁 text-muted）；§1.5 新增 Scrim 使用规则 + CNUI scrim 语义变量 |
| 数据库设计 | 2026_06_10 | 2026_06_06 | tasks/habits status CHECK 约束补齐 deleted 状态（与 USOM TaskStatus/HabitStatus 对齐）；表结构总览补充 energy_logs |
| 项目宪章 | 2026_06_18 | 2026_06_10 | v1.10.0→v1.11.0：MINOR — 新增「业务事实写入口」治理原则（§III 子章节：SM 重定位为写入口内生命周期组件、新增 Field Executor 写者、字段三分类 Fact/Content/Presentation、两层 API update/execute）；Constraint A 链路终点改为「业务事实写入口」并保留防绕过不变式；§VIII 新增 ValidationResult 判定模型（Passed/Rejected/NeedConfirm 三变体聚合+路由，NeedConfirm 吸收 needsCnuiConfirmation）；onValidate 返回 ValidationResult |
| USOM 详细设计 | 2026_06_18 | 2026_06_08 | §4.4 onValidate 签名由 `{valid,errors}` 改为 `ValidationResult`（Passed/Rejected/NeedConfirm 判别联合）；新增「ValidationResult 判别联合」「字段写入三分类 mutation_mode」两小节；G-07 Nexus 链路终点改为「业务事实写入口」 |
| USOM 详细设计 | 2026_06_19 | 2026_06_18 | [018-G1] habits 写入口切片：§4.4「字段写入三分类」新增「域落地状态」表（tasks✓[018] / habits✓[018-G1] / okrs⏳待独立切片·架构债 / timebox⏳待独立切片·YAGNI）。本切片 commit 范围 b55b891→be28d93，分支 feat/018-g1-habits；6 子任务：M1 manifest 扩 14 字段全集 + FactField/ContentField 标注 + frequencyType enum；F 新建 `createHabitsMutationService` 工厂；V field-executor 增 `type:'time'` HH:MM 校验；H `updateHabit` 迁移 `service.execute` 单事务（修复 F-1 字段覆盖/F-3 原子性/F-2 frequency 合并）；GOV grep 守卫断言 action 层无 habitRepo.update/save 直写；E2E compliance mutation_mode 完整性断言 + 浏览器编辑 E2E。踢出项：okrs（字段执行器路由架构债）、timebox（YAGNI）→ 各自独立切片 |
| USOM 详细设计 | 2026_06_19 | 2026_06_19 | [018-G2] 公共工厂抽象：抽 `createDomainMutationServiceFactory`（tasks/habits 工厂瘦到 ~30 行）；F-6 field-executor 事件名参数化（per-domain fieldUpdatedEventType，tasks=TaskFieldUpdated 零变更，habits=HabitFieldUpdated 修正语义错误）；SystemEventType 新增 HabitFieldUpdated |
| 项目宪章 | 2026_06_19 | 2026_06_18 | §VIII ValidationResult 判定模型补全：三变体→五变体（+PassedWithWarning(warnings)/NeedInput(data)）；聚合偏序扩 5 路全序（Rejected>NeedConfirm>NeedInput>PWW>Passed）；路由新增 PWW→Suspend 警告卡、NeedInput→Suspend 预留；「MVP 试点范围」段重写为「落地范围」（G3 已落地 PWW 接 rule warning，NeedInput/完整 CNUI Suspend 回环待独立切片 ⑥）；「教练而非守门」补充 PWW |
| USOM 详细设计 | 2026_06_19 | 2026_06_19 | [018-G3] 判定模型补全：ValidationResult 3→5 变体（+PassedWithWarning(warnings)/NeedInput(data)）；§4.4 偏序 5 路全序；onValidate 注释同步；ruleResultToValidation 接线 warning→PassedWithWarning（修复「静默吞 warning」缺口）；executeIntent 路由 PWW/NeedInput→Suspend（suspended.reason 联合 need_confirm/need_warning/need_input）；PWW 复用 needsConfirmation surfacing + confirmed=true 降级。NeedInput/Suspend 完整 CNUI 回环推迟独立切片 ⑥ |
| 项目宪章 | 2026_06_20 | 2026_06_19 | v1.11.0→v1.11.1：PATCH — §VIII 新增「规则三层架构（[018-G3]）」治理小节：L1 CNUI realtime（附加提示，fail-OPEN）/ L2 Domain onValidate（权威，聚合 evaluateDomainRules）/ L3 Nexus RuleEngine（全局）；治理约束消灭「realtime-only」规则（phase ∈ {submit,both}，both⟹单字段+纯函数 RealtimeCheck）；id 完整性由 scripts/validate-manifest.ts 强制；异常不对称 realtime fail-OPEN / submit fail-CLOSED |
| OKR/Task Domain 边界设计 | 2026_06_25 | 无 | 创建（office-hours DESIGN，经对抗评审修正）+ [022] OKR Domain 重组启动（`mydocs/dev/022`）。跨域贡献子设计：OKR/Task 分离，OKR 拥有 junction/贡献表（contributorType 多态 task/habit/timebox/...），Task 不感知 OKR；先 junction+读时聚合（Task Context Provider，无 Nexus 变更），后建跨域事件分发器演进事件驱动。考古澄清 Open Q#1：`tasks.key_result_id` 已于 2026_06_06 [015] Task 重构作「废弃列」移除，`habits.key_result_id` 因 [018-G1] 仅做写入口切片被列为踢出项未清理而保留——**非刻意设计的不对称**，[022] 确认 habits 一并迁移 junction。Phase 0 已清理 `app/actions/okr.ts` 三个废弃 KR 处理器（违宪：server action 直调 KeyResultRepository + 硬编码 MVP_USER_ID） |
| 数据库设计 | 2026_06_28 | 2026_06_28 | [024] key_results 新增 confidence 字段（integer NOT NULL DEFAULT 50，CHECK 0-100）+ migration 0021（K7 信心度 schema 支持；G2 KR 信心 UI 显示+inline 编辑+OKRForm KR 行输入；USOM KeyResult.confidence: number；manifest field_metadata 加 confidence；mapped round-trip） |
| [023] A2 Timebox 域重写 | 2026_06_29 | — | [023] A2 全 9 任务 ship-ready（feat/023-a2 10 commits `5dae976..c6b41a3`）：T1 数据层（timeboxes 加 `activity_archetype_id` / `task_ids` / `habit_ids` 3 列 + 迁移 0023/0024 + USOM `Timebox` 扩 3 字段 + `TimeboxSummary.archetypeName?` 派生）→ T2 写路径（`createTimeboxMutationService` + 5 server actions 直调 + 迁移 0024 `timebox_templates`/`user_audit_log` 2 表）→ T3 `/schedule` standalone page + `ScheduleWorkspace` + DayView/TimeboxList/TimeboxCard 三层 `onEdit` 透传 + `getTimeboxById` 读 action → T4 `TimeboxDrawer` Sheet 原语 + Archetype 选择器 + 4 维 EnergyCost accordion + AlertDialog needs_confirm → T5 createTimebox CNUI surface（手写，逐条走 Nexus）→ T6 adjustSchedule CNUI surface（diff 提交 + running/ended 禁取消 + `_orig*` 注入）→ T7 logTimebox CNUI surface（三态批量打卡）→ T8 `/timebox-templates` 配置页（7 段生存时间 + pull 订阅源 + audit 事务性 + A3 owner-check）→ T9 manifest 清理（`view_routes.createTimebox` 移除 OV#P3-#6 + ESLint `no-restricted-imports` 缩窄到 `scheduling-handler`）。**治理变更**：CNUI 读侧（`cnui/handlers.ts`）直 import tasks/habits repository 做读聚合是合法范式（与 tasks 一致），**不在 ESLint 禁止范围**；原 §1-A2「重构读侧走 context provider」**已撤回**。**TODO 登记（不实现）**：perf 4 项（N+1 解析/date 索引/批插/eventRepo 实例化）+ [021] drawer 迁 Sheet 一致性。触动 usom-design/database-design/domain-development-guide |
| [023] A3.1 tasks/habits 接入 Activity Archetype + 删 energyProfile（D11 B→C） | 2026_06_30 | 2026_06_29 | A3.1 全 4 任务 ship-ready（feat/023-a3-archetype-integration 4 commits `f258b93..a16dea2` + 1 docs commit）：A3.1.1 M1 迁移（tasks/habits 加 `activity_archetype_id` FK + 索引 + D4 backfill `energy_profile → activity_archetype_id`）+ A3.1.2 USOM + mapper + interface + repository 加 `activityArchetypeId`（TDD）+ A3.1.3 删 `energyProfile` 全清 + M2 迁移 + A3.1.4 §IX 文档同步（[R9] D4 映射表永久嵌入 database-design.md，5 行：deep→深度专注/creative→方案设计/admin→日常事务/light→日常事务/reactive→响应式工作，admin+light 合并到日常事务为不可逆决策永久可追溯）。设计 doc `docs/superpowers/specs/2026-06-30-023-a3-archetype-integration-design.md` + plan `docs/superpowers/plans/2026-06-30-023-a3-1-tasks-habits-archetype.md` + 迁移 `0025_a3_m1_tasks_habits_archetype_id.sql` (M1) + `0026_a3_m2_drop_tasks_energy_profile.sql` (M2)。**D4 永久映射表**：见 `docs/database-design.md` §4.5.1。触动 usom-design/database-design/manifest |
