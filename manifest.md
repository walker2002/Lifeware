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
LW_domain_注册指南_2026_05_14.md               # Domain 注册操作指南（manifest/hooks/repository/schema 全流程）
```

### 第二层：协同维护 (`docs/`)

```
docs/
usom-design.md           # USOM 对象定义文档（由 LW_USOM_详细设计 演化）
database-design.md       # 数据库表结构与设计规范（由 LW_database_数据库设计 演化）
route-generation-spec.md # Domain 路由生成规范（构建时自动生成 app/ 路由文件）
UI-DESIGN-SPEC.md        # 界面设计规范（色彩/排版/间距/组件/布局/交互/响应式/暗色模式/检查清单）
code-commenting-guide.md # 代码注释规范（文件头、模块分隔、JSDoc、特殊标记）
UI-REDESIGN.md           # 界面改版设计（Phase 1~3 视觉升级方案）
```

### 第三层：Claude 自动维护

```
/manifest.md                                # 本文件 — 文档索引与版本追踪
/CLAUDE.md                                  # Claude Code 开发指引
/.specify/memory/constitution.md            # 项目宪章
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
