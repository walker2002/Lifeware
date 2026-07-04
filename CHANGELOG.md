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

- 2026_07_03 — [026] Itinerary A3 ship：4 action（create/edit/deleteItinerary 3 CNUI + viewItineraries 1 Page）+ 5 态存储 lifecycle + lazy reconcile + /schedule 锁定合并；ItineraryWorkspace inline Sheet drawer 触发 createItinerary（替换 T12 hash 死链 → T14 I-1 修复）；GrowthMenu 4 intent_trigger 自动归"timebox"组（registry 自动分组，零代码改动）；§3.13 / §4.X 已完整覆盖
- 2026_07_03 — [026] Itinerary 对象（D2 reversal）：5 态存储 + lazy reconcile + 4 transition 时间戳（A1 进行中）
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

- 2026_07_03 — [026] T20 — `user_settings.timezone` 段后新增「部署 TZ 约束」段（reconcile 调度依赖宿主 TZ，跨 TZ 部署需保持 dev/prod TZ 一致，codex #5 落地）
- 2026_07_03 — [026] A3 ship：§4.X itineraries 表 DDL 完整落地 + 迁移 0031 + ItineraryRepository.findActive/findNeedingReconcile + 4 transition（cancel/markInProgress/markExpired）；5 态 storage 全部由 SM transition 推进（lazy reconcile，零 cron）
- 2026_07_03 — [026] §4.X itineraries 表契约：5 态 status enum + 4 transition 时间戳 + 2 索引（DDL 在 T2 迁移 0031 落地）
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

- 2026_07_03 — [026] T21 — §4.1 Sunset 豁免清单移除 timebox 一行（[026] T6 已落地 timebox/rules-registry.ts + itineraryRuleRegistry 双 registry，hooks.ts 调 evaluateDomainRules）；§7 四域现状对照表 timebox L3 状态从 ❌ → ✅ registry+evaluate。validate:structure 仍 0 errors。
- 2026_06_22 — [019.1] CnuiFormAdapter 退役：habits 手写化 + 删 FormRegistry/Adapter/register-form + validator L4-1/L7-2 落地
- 2026_06_21 — Part II 注册步骤对齐 tasks 参考实现（manifest 模板 / hooks / schema / repository / Step 5.5 / Step 13）
- 2026_06_21 — [019] 原 mydocs 注册指南移入 docs/ 并与 Domain 范式整合为单一权威文件

## Domain 路由生成规范（docs/route-generation-spec.md）

- 2026_07_04 — §4.3 幂等写入：generate-routes 写盘前剥离时间戳行比对，业务字段未变则 skip；prod.sh 加 EXIT trap 自动恢复 tsconfig.json（Next.js 启动会注入 .next-prod/types + 重写数组格式）
- 2026_05_26 — 创建：构建时路由生成方案 B；manifest.yaml view_routes.url 字段规范；generate-routes.ts 集成

## Domain 注册指南（已并入 domain-development-guide）

- 2026_05_26 — 构建时路由生成流程说明；废弃手动创建 app/ 路由
- 2026_05_23 — Step 11 query_actions + Step 12 onQuery；manifest 区块 G
- 2026_05_22 — Step 9 Handler 扩展：onGenerate(aiRuntime) 依赖注入 + generation_actions 新字段

## OKR Domain

- 2026_07_03 — [022.01] Phase 3：移除 Objective/KeyResult 独立 status 字段与状态机。编辑/删除权限收敛至 Cycle.status 经 assertEditable 守卫。DB 迁移 0030（DROP objectives.status + key_results.status 列）。
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

### /qa 后 follow-up（[023-01+]）— 实测三场景修复
> 2026_07_01 — /qa 报告 ship-ready 后实测发现 3 个 brief 范围真实 bug 未修：
> 1. `/createTimebox`（单独无输入）→ 显示「未识别到时间盒」（handler.open 空白 draft 未初始化）
> 2. `/createTimebox "上午完成OKR计划"` → ISO 校验失败（MULTI_TASK_PROMPT 无模糊时间默认值）
> 3. `/createTimebox 10:30-12:30 完成OKR计划` → 「任务标题必填」（chat 路径未路由到 parseMultiTask）
>
> 加 1 个失败语义约定（用户额外明确）：
> 4. `/createTimebox [无关payload]` → 显式返回「请输入有效的时间盒标题和事件」（不 silent fall through）

- **fix(timebox)** handler.open createTimebox 空白 draft 初始化 — `intentFields.drafts` 为空时初始化单条空白（uuid + 当前时间 + 1h 区间），content 切换「请填写时间盒信息」
- **feat(intent)** 新增 `parseTimeboxBatchIntentOnly` server action（dry-run 模式，仅解析返回 drafts 不提交）
- **feat(ai-parser)** MULTI_TASK_PROMPT 强化：上午=09:00-11:00 / 下午=14:00-16:00 / 晚上=19:00-21:00 / 中午=12:00-13:00 / 凌晨=02:00-03:00；新增 2 个 few-shot 示例覆盖问题2/3
- **feat(hook)** chat 路径把 `/createTimebox [payload]` 路由到 `parseTimeboxBatchIntentOnly`，成功→打开 CNUI with drafts，失败→「请输入有效的时间盒标题和事件」
- 测试：handlers.test +4 / intent.test +3 / ai-parser-migration.test +3 = +10 PASS（base 18 failed = head 18 failed，零新增）
- 4 commits（`bfe6713` / `1a147d0` / `e45f67f` / `f854185`）接 [023-01] 14 commits 落地

### [023-01+] 二次修复（v2）— 上一轮 7 commits 未解决的真正根因
> 2026_07_01 — 用户再次实测，3 场景仍未解决。systematic-debugging 重新调查发现：
> 上一轮 Commit 4（chat 路由到 parseMultiTask）是**死代码**——其路由条件
> `(resolvedDomainId === "timebox")` 依赖 `resolveShortcut`，而 `matchShortcut`
> 正则以 `$` 结尾 + 传整条 rawInput，**任何 `/cmd [payload]` 都解析为 null**，
> 导致条件恒 false，chat 落到 `submitIntent → parseWithAI`（非确定性）→
> 时灵时不灵地路由到 tasks 域（"任务标题必填"）/ 失败（"处理失败"）。
> 复现：`matchShortcut("/createTimebox 晚上 21:00-23:00 外出看电影")` → `undefined`。

- **fix(intent) RC-1（核心）** `resolveShortcut` 取首个空白前的 command token 再 `matchShortcut`，使 `/createTimebox [payload]` 正确解析出 timebox/createTimebox。仅 resolveShortcut payload-aware；`matchShortcut`/`parse` 保持精确匹配（保留 parse()「纯快捷方式→template_form」vs「带 payload→AI 解析」语义），零回归。
- **fix(ai-parser) RC-2** `parseMultiTask` 过滤器不再硬要求 `duration`：缺 duration 时从 `(endTime - startTime)` 反推（显式区间场景如 21:00-23:00 LLM 常漏 duration 被丢弃）。
- **feat(timebox cnui) RC-4 时区** 新增 `time-input-helpers.ts`（`isoToLocalDatetimeInput` / `localDatetimeInputToIso`）；`CreateTimebox.tsx` 开始/结束改 `<input type="datetime-local">`，用户按本地时区输入/查看，后台仍存 ISO。
- **问题1（/createTimebox 无输入）**：路由原语经复现确认**当前已正确**（matchShortcut 无 payload 时命中 timebox → openCnuiSurface → RC-C 空白 draft）。用户此前看到的校验报错为 dev server 未重启（Next.js server action 不热重载），修复后须重启 `npm run dev` 再测。
- 测试：intent.test +4（resolveShortcut payload）/ ai-parser-migration.test +1（RC-2 duration 反推）/ time-input-helpers.test +8 = +13 PASS；vitest base 19 = head 18（零新增）；tsc 我改文件零新增。

### [023-01+] v3 — CNUI 创建 timebox 后列表不刷新（误判"没保存"）
> 2026_07_01 — 用户报"操作成功但查看时间盒没保存"。systematic-debugging + 真实 DB 集成实测确认
> **落库路径正常**（submitDynamicIntent → DB 有行，/schedule 能查到），根因是 `handleCnuiConfirm`
> 成功后**不刷新 `tb.timeboxes`**（对比 `handleSubmit` 会调 `loadTimeboxes`，CNUI 路径漏了）。
> 导致用户点 Home/成长领域 查看时主面板仍显旧数据，误以为没保存。
>
> 另：CNUI 提交有"确定要保存吗？"二次确认框，须点「确认」才真正落库（之前 /browse 实测按 Escape
> 会静默取消提交）。

- **fix(hook)** `handleCnuiConfirm` 成功分支对 `domainId === 'timebox'` 调 `deps.loadTimeboxes()`，让 `tb.timeboxes` 即时刷新，Home/主面板 schedule 视图立刻反映新时间盒（无需整页刷新）。
- /browse 实测：chat 创建 `ZZTEST-REFRESH-*` → "操作成功" → 点「回到主页」→ schedule 视图 DOM 含新标题（无 full reload）。tsc 零新增。

### [023-01+] v4 — 未注册 slash 命令误路由 + 跨域列表刷新
> 2026_07_01 — 用户报两个问题：(1) `/createTime 19:30-20:00看世界杯` 弹出「习惯信息」CNUI（应为 timebox）；
> (2) 补跨域刷新（v3 只修了 timebox，其他域 CNUI 提交后列表仍 stale）。

**问题1 根因（systematic-debugging）**：`/createTime` 不在注册表（注册的是 `/createTimebox`），`getActionByShortcut` 精确匹配返回 undefined → `resolveShortcut` 返回 null。但 `resolveSlashCommand` 仍按语法解析为合法 slash 命令（`action:'createTime'`），timebox 路由条件（`action === 'createTimebox'`）不满足 → **落入 `parseHabitIntentOnly`**，习惯 LLM 解析器把"看世界杯"误判为习惯 → 弹错误域的 CNUI。防御缺口：未注册命令被当成「无域」放行进任意域解析器。

- **fix(lib)** 新增 `suggestShortcut(action, shortcuts)` 纯函数：唯一前缀匹配返回该 shortcut（createTime→/createTimebox），多义/无匹配返回 undefined。+7 单测。
- **fix(hook)** `handleConversationSend` slash 分支加守卫：`!shortcut && !resolvedDomainId` → 拦截，给「未识别的命令 /xxx。你是否想输入 /yyy？」提示，不进任何域管道。（产品决策：未注册命令一律提示，不自动补全。）`intentTriggers` 入 deps 防闭包 stale。
- **fix(refresh)** `handleCnuiConfirm` 成功后广播 `window` 事件 `lifeware:data-changed`（detail `{domainId, action}`）。`ActionView` 经 `mainViewState.type==='action'` **内联挂载** `HabitListPage`/`TaskTreePage` 于 page.tsx（非独立路由），CNUI 提交时仍 mounted → 之前 stale。现各加 `useEffect` 监听器按 `domainId` 自行 reload（habits→loadHabits / tasks→handleDataChanged）。timebox 仍走 `deps.loadTimeboxes`。OKR 无 create 快捷方式 + 刷新入口深埋 → defer。

## Itinerary 域（[026]）

> 2026_07_03 — A3 ship（14 commits：4 action + 5 态存储 + lazy reconcile + /schedule 锁定合并 + I-1 修复 + Tier 2 docs）。**[026] 全闭环 ship-ready**：`Itinerary` 作 timebox 域内二级对象，5 态存储 lifecycle，零 cron，AI 锁。
>
> 2026_07_03 — **T23 (P3, codex #1 follow-up) ship**：field_metadata per-objectType 嵌套重构。消除 timebox itinerary 与其它域同名字段潜在冲突（timebox.timebox.* + timebox.itinerary.* 各自独立 namespace）。4 commits `dc29a6c` / `935a547` / `908f25a` / docs commit：(1) 5 域 manifest 全嵌套化 + schema 升级 `z.record(z.record(...))`；(2) 3 生产消费者（factory.getFieldMetadata / orchestrator field 判定 / okrs.hooks validOkrTypes）+ 9 测试 mock 改读嵌套；(3) validator 区块 C 启发式（C-flat-field-metadata 拒绝平铺）+ 5 新测试；(4) docs/usom-design + domain-development-guide + CHANGELOG 同步。4 域 baseline 持平（validate-manifest 0 errors / 2 warns / 2 info）。

### 设计决策（关键）

- **D2 reversal（Cycle 模式）**：原 spec D2=C "读时算 status"被用户推翻。改用 Cycle 模式：状态全部存 DB（`status` enum + 4 transition 时间戳列），SM 驱动 transition；`reconcileItineraryStatuses()` 在页面 server component 加载时 lazy 触发（零 cron 守护进程）。**收益**：可直接 SQL 查询 `WHERE status = 'expired'` 做"未实施的计划"统计（spec §7.4 OQ-7）；集成 codex D5 + D6 修复（双重 reconcile / `ReconcileAction.kind` 判别名陷阱）后稳定。
- **决议 A（拆双 mutation service）**：plan-eng-review 决议。A1.4 落地为 `createTimeboxMutationService` vs `createItineraryMutationService`，事件类型分离（`TimeboxFieldUpdated` vs `ItineraryFieldUpdated`），避免字段语义串扰。
- **D4 决议 A（共享表单组件）**：抽 `<ItineraryFormFields>` 公共组件（D4 决议 A），3 surface（CreateItinerary / EditItinerary / DeleteItinerary）共用，避免 3 处重复字段定义 + 多端修正。T10 落地。

### 架构按 §IX 7 层覆盖

- L1 数据模型：`Itinerary` USOM 接口 + `ItineraryStatus` 5 态枚举（T1）
- L2 仓储 + 写入口：`ItineraryRepository` 5 方法（findById/save/updateFields/findByDateRange/findNeedingReconcile）+ 双 mutation service（T4 + 决议 A）
- L3 规则/校验：`timebox/rules-registry.ts` 加 `itinerary` 字段规则（T6）
- L4 Surface 渲染：`CreateItinerary` / `EditItinerary` / `DeleteItinerary` 3 surface（`response_type: cnui`）+ `<ItineraryFormFields>` 公共组件（T10）
- L5 页面路由：`/itineraries` 独立 Next.js page route，server component 加载时调 reconcileAndAdvanceItineraries（T12）
- L6 CNUI 处理：`timebox/cnui/handlers.ts` 3 branch + `surfaceHandlers` 注册（T11）
- L7 schema 守门员：manifest 4 intent_triggers（createItinerary/editItinerary/deleteItinerary/viewItineraries）+ lifecycle 5 态 + 6 transitions；`validate-manifest.ts` 跑通 0 errors（T5）

### 写入口 + 跨字段红线

- 5 server action 走完整 Nexus（`submitDynamicIntent` → Orchestrator → `resolveObjectType` 路由 → `createTasksGenericRepo({timeboxRepo, itineraryRepo})` → SM transition）：`createItinerary` / `updateItinerary` / `deleteItinerary` / `markInProgressItinerary` / `markExpiredItinerary`（T7 落地，T1.7 字段白名单 `ITINERARY_UPDATE_ALLOWED` 防绕过状态机写 status/时间戳列 — 对应 [project-server-action-field-write-needs-allowlist]）。
- 关系人（people）保留 `string[]` 纯文本（D1=A），`jsonb` 存，`@` 前缀 + 中文逗号分隔输入 — 与 CycleCreateDrawer 同模式。
- `/schedule` 跨域合并：A3.2 引入 `ScheduleEvent` 联合类型（`kind: 'timebox' | 'itinerary'`），`ScheduleWorkspace.loadDay` 用 `Promise.all` 并行拉 timebox + itinerary 后 `mergeEvents` 合并；Status 来自 DB（不做读时算）— D2 reversal 一致性兑现。`/schedule` 显陈旧状态可接受 MVP（codex #8 follow-up → SWR 缓存 defer [023.4]）。

### GrowthMenu 自动归组（registry SSOT 兑现）

- manifest 4 intent_trigger（`createItinerary` / `editItinerary` / `deleteItinerary` / `viewItineraries`）`domainId: timebox`
- `getAllDomainActions()` 按 `plugin.manifest.domainId` 自动分组（registry.ts:87-93）
- GrowthMenu（`components/layout/growth-menu.tsx`）纯展示组件，从 `domainActions` prop 拿到分组后按 `DOMAIN_META['timebox'] = {icon: Clock, label: '时间盒'}` 映射
- **4 个 itinerary action 自动归"时间盒"组**，零代码改动。TDD：既有 `growth-menu.test.tsx` 8 case 已验证按 domainName 分组（D4 同期既有）。
- T11 修复后 manifest validator 4 domain 0 errors / 2 warns（既有 tasks）+ 2 INFO（既有 habits/timebox redundant cnui_surface）

### T14 I-1 修复（与 GrowthMenu 集成）

- T12 hash trigger (`window.location.hash = 'createItinerary'`) 是死链：ItineraryWorkspace 是 standalone page 不在 chat 流；`useIntentHandler` hook 需 Chat 流 deps（setTimeboxes/addChatMessage/saveCurrentConversation/ensureConversationView 等），不能直挂；surface 必须 ConversationView 挂载才能渲染
- T14 修复为内联 Sheet-based Drawer（同 TimeboxDrawer 范式）：复用 `<ItineraryFormFields>` 公共组件 + `createItinerary` server action（走完整 Nexus + SM create transition）+ AlertDialog 二次确认（needs_confirm）；Cmd/Ctrl+Enter 快捷提交；删除成功 `router.refresh()` 让 server component 重跑（reconcile + 列表 fresh read，取代本地 setItems filter 防 stale）
- 文件：`domains/timebox/components/itinerary-workspace.tsx`（commit `c4c4332`）

### IRON RULE 守护

- T15 必做：A3.2 ScheduleEvent 联合把 DayView/TimeboxList/TimeboxTimeline/MiniCalendar 改为按 `kind` 分支渲染 — 若 timebox 分支回归损坏既有 /schedule 时间盒渲染会 0 报警。3 个共享组件须补"渲染 TimeboxSummary-only 输入"字节级 snapshot 回归测试（baseline = git main 实现渲染一次保存）。**不退化**是 [026] A3.2 IRON RULE — 必须先做。

### 已知 follow-up（保留给 [027] / P2 / P3）

- ~~[P3] **codex #1** `field_metadata` per-objectType 嵌套（timebox/itinerary 同名字段需不同校验场景）— T23~~ ✅ T23 已 ship（见 [026] section 顶部）
- [P3] **codex #3** `reconcileAndAdvanceItineraries` 走单 `mutationService.execute()`（绕开完整 intent 流水线）— T22
- [P2] **codex #5** `localDayKey` 跨 TZ 单元测试（依赖容器 `TZ=Asia/Shanghai`）+ 部署文档 env 必填 — T20
- [P2] **codex #6** GrowthMenu 单测覆盖 4 itinerary action 自动归"timebox"组 — T19
- [P3] **codex #7** `domain-development-guide §4.1` 移除 timebox L3 豁免（[023] A0 已建 rules-registry，理由不成立）— T21
- [P3] **codex #8** ItineraryWorkspace 客户端 state 落后 — 加 SWR / router refresh（仿 [023.4] H4）— T14 阶段已用 `router.refresh()` 临时覆盖完整 SWR
- **[027]** `markCompleted` transition + 智能编排归集行程（timebox 打卡 → itinerary.completed + scheduler 读 itinerary）；/itineraries 月视图（MonthView 复用 A3.2 ScheduleEvent 联合）；ContextSnapshot 加 `ItinerarySummary[]`

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
