# 文档变更日志 (CHANGELOG)

> 项目核心文档的版本演进记录。每次文档级变更后 **MUST** 同步追加。
> 执行细节（commit / 子任务编号 / 技术方案）留在 git、memory、specs/plans；
> 本文件只记**文档级里程碑**。同文档同日多次变更合并为一行。
>
> 历史归档见文末「## 历史归档 (≤ 2026-05-31)」。

---

## 项目宪章（.specify/memory/constitution.md）

- v2.1.1 (2026_07_01) — PATCH：version tracking 职责由 manifest.md 迁至 CHANGELOG.md（Tier 3 清单 + 修订流程第 5 步）
- v2.1.0 (2026_06_24) — §IX 约束 2/3 收敛（registry 即 SSOT）；§III 字段三分类正交澄清
- v2.0.0 (2026_06_22) — MAJOR：新增 §IX Domain 开发范式（七层 5 约束）；supersede §CN-UI #4（CnuiFormAdapter 强制复用）
- v1.11.1 (2026_06_20) — §VIII 新增「规则三层架构」治理小节（L1 realtime / L2 onValidate / L3 RuleEngine）
- 2026_06_19 — §VIII ValidationResult 三变体→五变体（+PassedWithWarning / NeedInput）
- v1.11.0 (2026_06_18) — MINOR：新增「业务事实写入口」治理原则（SM 重定位 + Field Executor + 字段三分类）+ §VIII ValidationResult 判定模型

## USOM 详细设计（docs/usom-design.md）

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

> 2026_07_05 — **WIP**：Tier 2 docs 先行（Task 1/11 完成）。本 section 为 ship 时回填占位。

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

### Ship 时回填

- commit hash / diff stat（`git diff --stat 4d6e7ca..HEAD`）
- 验证：tsc / vitest base=head / validate:manifest 0 errors / validate:domain-structure ✓ / /appointments HTTP 200
- 任何 follow-up / defer

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
