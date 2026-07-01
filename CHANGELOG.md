# 文档变更日志 (CHANGELOG)

> 项目核心文档的版本演进记录。每次文档级变更后 **MUST** 同步追加。
> 执行细节（commit / 子任务编号 / 技术方案）留在 git、memory、specs/plans；
> 本文件只记**文档级里程碑**。同文档同日多次变更合并为一行。

---

## 项目宪章（.specify/memory/constitution.md）

- v2.1.1 (2026_07_01) — PATCH：version tracking 职责由 manifest.md 迁至 CHANGELOG.md（Tier 3 清单 + 修订流程第 5 步）
- v2.1.0 (2026_06_24) — §IX 约束 2/3 收敛（registry 即 SSOT）；§III 字段三分类正交澄清
- v2.0.0 (2026_06_22) — MAJOR：新增 §IX Domain 开发范式（七层 5 约束）；supersede §CN-UI #4（CnuiFormAdapter 强制复用）
- v1.11.1 (2026_06_20) — §VIII 新增「规则三层架构」治理小节（L1 realtime / L2 onValidate / L3 RuleEngine）
- 2026_06_19 — §VIII ValidationResult 三变体→五变体（+PassedWithWarning / NeedInput）
- v1.11.0 (2026_06_18) — MINOR：新增「业务事实写入口」治理原则（SM 重定位 + Field Executor + 字段三分类）+ §VIII ValidationResult 判定模型
- v1.9.0 (2026_05_31) — MINOR：新增 UI 设计规范治理；Compliance Review 加 C-01~C-07
- v1.7.1 (2026_05_26) — PATCH：view_routes 构建时路由生成细节阐明
- v1.7.0 (2026_05_23) — MINOR：Query Path 三路径路由（+onQuery hook + query_actions manifest block）
- v1.6.0 (2026_05_22) — MINOR：新增 AI Runtime Constraints（7 项）+ CN-UI Protocol Constraints（3 项）

## USOM 详细设计（docs/usom-design.md）

- 2026_06_19 — [018-G3] 判定模型补全：ValidationResult 3→5 变体；ruleResultToValidation 接线 warning→PassedWithWarning
- 2026_06_19 — [018-G2] 公共 `createDomainMutationServiceFactory` 抽象；SystemEventType +HabitFieldUpdated
- 2026_06_19 — [018-G1] habits 写入口切片：字段三分类落地 + `createHabitsMutationService`
- 2026_06_18 — onValidate 签名 `{valid,errors}` → ValidationResult；新增字段三分类 mutation_mode 小节
- 2026_06_08 — TaskStatus 枚举对齐代码与 DB（draft|active|on_hold → todo|planned，移除 deprecated scheduled）
- 2026_06_04 — 清理残留文本（废弃 ProjectTemplate / TaskTemplate 片段）
- 2026_06_03 — Task Domain 重构：Project → Thread；Task 双轴标签系统；SystemEventType Project* → Thread*
- 2026_05_28 — HabitLog 对齐 ExecutionRecord；Task +lastExecutionRecord；ExecutionRecord +sourceType；+TaskExecutionLog 类型
- 2026_05_22 — 新增 AI Runtime / CN-UI / 错误类型（AIRuntimeError / CNUISchemaError）
- 2026_05_16 — 新增 ChatMessage / AISession / AISessionSummary / LLMConfig / UserSettings 及生命周期约束
- 2026_05_12 — 新增 Project / ProjectTemplate / TaskTemplate；TaskStatus +in_progress/on_hold；Task +10 字段

## 数据库设计（docs/database-design.md）

- 2026_06_30 — [024] key_results +confidence（CHECK 0-100）；[023] +activity_archetypes / user_audit_log；A3.3 DROP habit_templates / template_habits（迁移 0027）
- 2026_06_10 — tasks/habits status CHECK 补 deleted 状态（对齐 USOM）
- 2026_06_06 — tasks 状态枚举回退对齐代码（todo/planned/in_progress/completed/archived）；移除废弃列；v_active_tasks 视图修复
- 2026_06_04 — 视图 v_today_pending_habits 修复（hl.status→completion_status）；表结构总览补 threads
- 2026_06_03 — projects → threads 表；删 project_templates / task_templates；tasks +双轴标签列 +8 索引（迁移 0013）
- 2026_05_30 — +user_activities 用户行为埋点表
- 2026_05_28 — habit_logs 字段变更（status→completion_status 等）；+task_execution_logs 表
- 2026_05_16 — +ai_sessions 表（10 列+2 索引）；+user_settings 表（6 列+1 唯一索引）
- 2026_05_12 — +projects / project_templates / task_templates 表；tasks 扩展状态枚举 + 多列索引

## 总体设计（mydocs/core/LW_overall_总体设计_*.md）

- 2026_05_26 — 新增 4.4 构建时路由生成机制（Domain 独立性保证）
- 2026_05_23 — 新增 Query Path 执行链；Orchestrator 三路径识别（Reactive/Generative/Query）
- 2026_05_22 — Nexus 基础设施层 +AI Runtime 组件；Generative Path 依赖注入模型
- 2026_05_02 — 增加附录 TODO（下一步核心扩展设计，非 MVP）

## 技术栈设计演进（mydocs/core/LW_overall_技术栈设计演进_*.md）

- 2026_03_18 — 追加 Bridge Layer 实现时序 + 约束 5 + 风险表 2 条

## AI Runtime 架构设计（mydocs/core/LW_AI_Runtime_Architecture_Design.md）

- 2026_05_23 — V3.1：统一 single_shot 命名；+中国 Provider（DashScope/DeepSeek/智谱）；Intent Engine 纳入统一路由；Section 10 重排

## Nexus 统一设计

- 2026_06_10 — Phase A → A/B/C 三阶段演进归档（B：Thread 写操作统一 + CNUI Surface 注册修复；C：deleteTask/refineTask/splitTask 分支补全）

## 界面设计规范（docs/UI-DESIGN-SPEC.md）

- 2026_06_13 — §十一 CN-UI 大幅修订：单层容器架构 + header prop + §11.10 新增 Surface 自测 CUC-01~CUC-12
- 2026_06_10 — §1.1 CN-UI 表单标签规则；§1.5 Scrim 使用规则 + CNUI scrim 语义变量
- 2026_06_08 — v1.2：颜色对比度铁律（WCAG AA）；primary/on-primary 可访问性；text-muted 使用限制
- 2026_05_31 — 创建：色彩令牌 / 排版 / 组件 / 三栏布局 / 导航 / 交互 / 响应式 / 暗色模式 / C-01~C-07

## 界面改版设计（docs/UI-REDESIGN.md）

- 2026_05_31 — 创建：Phase 1~3 视觉升级方案（三栏优化 / 欢迎页 AI 引导 / 任务·习惯卡片改版）

## 代码注释规范（docs/code-commenting-guide.md）

- 2026_06_01 — 创建：文件头 @file/@brief、模块分隔、JSDoc、特殊标记、简体中文要求

## Domain 开发权威指南（docs/domain-development-guide.md）

- 2026_06_22 — [019.1] CnuiFormAdapter 退役：habits 手写化 + 删 FormRegistry/Adapter/register-form + validator L4-1/L7-2 落地
- 2026_06_21 — Part II 注册步骤对齐 tasks 参考实现（manifest 模板 / hooks / schema / repository / Step 5.5 / Step 13）
- 2026_06_21 — [019] 原 mydocs 注册指南移入 docs/ 并与 Domain 范式整合为单一权威文件

## Domain 路由生成规范（docs/route-generation-spec.md）

- 2026_05_26 — 创建：构建时路由生成方案 B；manifest.yaml view_routes.url 字段规范；generate-routes.ts 集成

## Domain 注册指南（已并入 domain-development-guide）

- 2026_05_26 — 构建时路由生成流程说明；废弃手动创建 app/ 路由
- 2026_05_23 — Step 11 query_actions + Step 12 onQuery；manifest 区块 G
- 2026_05_22 — Step 9 Handler 扩展：onGenerate(aiRuntime) 依赖注入 + generation_actions 新字段

## OKR Domain

- 2026_06_26 — [022] 收尾：QA/Review/Defer 修复（use server boundary / updateProgress 原子性 / KR owner-check / OnEventDispatchFailed 持久化 等）
- 2026_06_26 — [022] Phase 3：/okrs 工作台 + OKRForm ModeSwitcher + TemplateSelector + ContributionPanel + 事件驱动 recompute
- 2026_06_26 — [022] Phase 2：contributions junction + KeyResult.currentValue 派生 + CompletedTasksProvider + habits.key_result_id 迁移
- 2026_06_26 — [022] Phase 1：Cycle 升格一级对象（cycles 表）+ §III 写入口扶正 + FactField / FieldExecutor
- 2026_06_25 — OKR/Task 边界设计（office-hours）：分离 + OKR 拥有 junction，先读时聚合后建跨域分发器

## Timebox 域优化（[023-01]）

> 2026_07_01 — 根因修复 + 9 个增量 Task（基线 5085813）。**根因反转**：plan 原本以为 timebox 路由错乱，经 codex 独立验证 + Claude subagent dual-voice 评审共识，**真实病根**是 `registerAllProviders` 死代码（6 capability 从未注册），导致 activeHabits 拉取失败，进而 timebox 路由 fallback；其他 8 个 Task 围绕 SSOT 显式化、守门员、可观察性、链路完整性收尾。spec/plan/design 三件套同步更新到 `docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md`。

### 核心根因修复（Task 0）
- **fix(context-engine)** 通电 capability 注册体系 — `ensureProvidersRegistered()` 接入 orchestrator 生成型路径入口（`nexus/orchestrator/index.ts`），幂等保护；修复原 `registerAllProviders` 死代码导致 6 capability 从未注册、生成型路径全部走 fallback 的根因。
- **spec Section 2 回填** — 根因反转写入 spec（plan 原本假设 timebox 路由错乱，实为 capability 注册死代码 + Task 0 通电修复，方向 A）。

### 增量 Task（Task 1-8，按依赖顺序）
- **Task 1** — `manifest.yaml viewSchedule` 补 `response_type:page`；validate-manifest 守门员新增规则 `A-view-route-needs-page`，CI 防回退
- **Task 2** — `resolveContext` 错误消息附带已注册列表，提升生成型路径失败可观察性
- **Task 3** — orchestrator 生成型路径加 dev-warn（纯可观察性，不改行为 — 行为本就回落 contract）
- **Task 4** — /browse 端到端验证 Task 0 修复（activeHabits 真能拉到 + smartSchedule capability 全注册）+ spec Section 2 根因回填 commit
- **Task 5** — `MULTI_TASK_PROMPT` 加 few-shot：含空格标题「上午10:30-12:30 OKR 季度计划」+ 全角分号「；」切分守护（chat 走 parseWithAI 不读 MULTI_TASK_PROMPT → LLM 路由 createTimebox 而非 createTask）
- **Task 6** — 新建 `usom/manifest-utils.ts`，显式声明 SSOT（getResponseType / getActionSurface），**删 view_routes fallback**（与显式声明哲学冲突 + 读不同字段：intent_triggers[].view_route vs 顶层 view_routes 块）
- **Task 7** — `getActionResponse` 委派 manifest-utils SSOT，返回类型从 `string` 收紧为 `'cnui' | 'page' | 'text' | 'unimplemented'`；`use-intent-handler.ts` 加 `'unimplemented'` 分支弹「该功能（${domainId}/${action}）待开发」+ 3 条 narrowing smoke test
- **Task 8** — FAB label 同步联动 `manifest.description`（**删异步化过度设计**：`getActionDescription` 是同步函数，无需 useEffect；FALLBACK_LABEL 兜底 + 4 条 vitest）

### autoplan dual-voice 评审吸收（共 9 finding）
- ✅ **F1 CRITICAL**（codex 三重验证）`registerAllProviders` 死代码 → Task 0 通电修复
- ✅ **F2 HIGH**（codex + Claude subagent 共识）Task 3 守门员只 dev warn → 诚实命名为「可观察性」，根因归 Task 0
- ✅ **F3 HIGH**（Claude subagent H-2 + codex Point 3）`view_routes` fallback 冲突 → Task 6 删 fallback
- ✅ **F4 HIGH**（Claude subagent H-3）FAB 异步化过度设计 → Task 8 同步化
- ✅ **F5 MEDIUM**（Claude subagent H-1/M-2）Task 4 应在修复后验证 + R1 分支诚实标注为「届时新开」
- ✅ **F6 MEDIUM**（codex Point 5）Task 7 type narrowing 需 smoke test + Task 8 需 vitest
- ✅ **F7**（codex Point 4 + Claude 共识实测）守门员 A-view-route-needs-page 零误伤（仅 timebox 有 view_route），规则保留
- ✅ **F8 MEDIUM**（codex 战略盲点 2）commit message 含 why → Global Constraints + 各 task commit message
- ✅ **F9 MEDIUM**（Claude subagent M-3）Task 6→Task 1 隐性依赖未声明 → Task 6 显式声明依赖；Task 5 Step 2 修正预期

## Timebox / Activity Archetype（[023]）

- 2026_06_30 — A3.3 habitsTemplates 硬删（消费者 → 生产者 → DB DROP，迁移 0027）
- 2026_06_30 — A3.2 CNUI 表单接入 + 详情只读（ArchetypePicker / EnergyCostAccordion 三域复用）+ Codex prod 债清理
- 2026_06_30 — A3.1 tasks/habits 接入 activity_archetype + 删 energyProfile（D11 B→C；D4 永久映射表嵌入 database-design §4.5.1）
- 2026_06_29 — A2 Timebox 域重写（timeboxes +3 列 + createTimeboxMutationService + /schedule 工作台 + 3 CNUI surface + /timebox-templates）

## 系统规则管理重设计（[020]）

- 2026_06_24 — plan：去 C/L 范式重构（registry 即 SSOT，7 Phase/~20 Task）；constitution MINOR 2.0.0 → 2.1.0
- 2026_06_23 — DESIGN（office-hours）：规则三分类（Business/Governance/Policy）+ D1/D2/D3 决策锁定

## 统一执行记录模型设计

- 2026_05_28 — 创建：ExecutionRecord 跨 domain 共享；HabitLog 对齐；+TaskExecutionLog；Domain manifest +cascade_rules

## 用户行为埋点设计

- 2026_05_30 — 创建：user_activities 表 + recordActivity + 时间衰减聚合 + /analytics 页面
