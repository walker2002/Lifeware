# Feature Specification: Domain 全面合规重构

**Feature Branch**: `006-domain-compliance-refactor`
**Created**: 2026-05-15
**Status**: Draft
**Input**: 架构重大修改，按照 Domain 注册指南将四个已开发域全面合规化

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 开发者注册新 Domain 无需修改 Nexus (Priority: P1)

作为 Lifeware 的开发者，我希望新增一个 Domain 时只需在 `domains/` 目录下完成注册指南的 8 步操作，不需要修改任何 Nexus 核心组件（State Machine、Orchestrator、Intent Engine），这样域的开发是自包含的。

**Why this priority**: 这是架构的核心价值主张——可扩展性。如果每个新域都要改 Nexus，注册指南就失去了意义。

**Independent Test**: 可以通过创建一个空壳测试域（mock domain），按注册指南 8 步完成注册，验证 Intent Engine 能正确路由、State Machine 能正确执行状态转换，全程不触及 Nexus 代码。

**Acceptance Scenarios**:

1. **Given** Nexus 系统正常运行，**When** 开发者按注册指南完成新域注册（manifest + hooks + registry），**Then** 新域的意图能被 Intent Engine 正确路由到对应 action
2. **Given** 新域已注册且 manifest 声明了 lifecycle，**When** Orchestrator 收到该域的 StructuredIntent，**Then** State Machine 从 manifest.lifecycle 读取转换规则并正确执行
3. **Given** 新域已注册，**When** 开发者搜索 Nexus 核心组件代码，**Then** 不存在任何引用新域名称的硬编码逻辑

---

### User Story 2 - 所有域的写操作统一走 Nexus 链路 (Priority: P1)

作为系统维护者，我希望所有四个域（timebox、habits、okrs、tasks）的写操作（创建、更新、删除、状态变更）都通过统一的 Nexus 链路执行，这样系统状态变更具有完整的可追踪性和一致性保证。

**Why this priority**: 当前 tasks 域完全绕过 Nexus、habits/okrs 半绕过，这违反了宪章的 Single-Writer Invariant (III) 和 Intent-Driven (I) 原则。

**Independent Test**: 对每个域执行写操作，验证：系统事件被正确发布、状态转换符合 manifest 声明、ActionSurface 被正确生成。

**Acceptance Scenarios**:

1. **Given** tasks 域已合规化，**When** 用户创建一个新任务，**Then** 系统发布 TaskCreated 事件且任务状态为 manifest 声明的 initial_state
2. **Given** habits 域已合规化且规则引擎真实初始化，**When** 用户激活一个习惯，**Then** onValidate 钩子被调用、状态机执行 draft→active 转换、HabitActivated 事件发布
3. **Given** okrs 域已合规化，**When** 用户激活一个 Objective，**Then** KR 联动激活（draft→active）通过 onEvent 钩子执行、事件发布
4. **Given** 任意域的写操作，**When** Orchestrator 处理 StructuredIntent，**Then** 不存在 stub 规则引擎（全部使用真实 Rule Engine）

---

### User Story 3 - 每个域具备完整声明文件 (Priority: P2)

作为开发者，我希望每个域都有完整的 manifest.yaml（六区块 A–F）和独立的 hooks.ts，这样我能通过阅读声明文件就理解一个域的全部能力边界，不需要深入代码。

**Why this priority**: 声明完整性是注册指南的核心要求，直接影响新开发者的上手效率和代码可维护性。

**Independent Test**: 检查四个域目录，验证每个都有 manifest.yaml（含六区块）和 hooks.ts（含四个纯函数钩子）。

**Acceptance Scenarios**:

1. **Given** 四个域均已完成声明层补齐，**When** 开发者阅读任一域的 manifest.yaml，**Then** 能看到 intent_triggers（A）、lifecycle（B）、field_metadata（C）、list_actions（D）、required_fields/templates（E）、subscribed_events（F）
2. **Given** 四个域均已完成 hooks.ts 分离，**When** 开发者检查 hooks.ts 文件，**Then** 四个钩子函数均为纯函数（无数据库调用、无外部 IO）
3. **Given** 域 manifest 声明了 view_routes，**When** 用户通过 Intent Engine 输入导航意图（如"查看习惯列表"），**Then** Intent Engine 能正确路由到对应页面

---

### User Story 4 - 文件目录结构符合注册指南 (Priority: P3)

作为开发者，我希望所有域的文件按照注册指南的目录结构组织（repository、pages、components 在域目录下），这样域是真正的自包含单元。

**Why this priority**: 影响长期可维护性，但不影响运行时行为。Phase 3 最后执行以降低风险。

**Independent Test**: 检查目录结构，验证每个域目录包含 manifest.yaml、hooks.ts、repository.ts（或 repository/ 目录）、pages/ 目录。

**Acceptance Scenarios**:

1. **Given** 文件搬迁完成，**When** 检查 `domains/tasks/` 目录，**Then** 包含 manifest.yaml、hooks.ts、repository/（task.ts、project.ts、task-template.ts）、pages/、components/
2. **Given** 文件搬迁完成，**When** 检查 `app/projects/page.tsx`，**Then** 文件内容仅包含从域目录导入的薄壳代码
3. **Given** 文件搬迁完成，**When** 运行项目构建，**Then** 构建成功且现有功能无变化

---

---

### User Story 5 - Manifest 运行时消费：消除硬编码 (Priority: P1)

作为 Lifeware 开发者，我希望修改 `manifest.yaml` 后无需修改任何 TypeScript 代码即可生效，这样 manifest 才是真正的运行时配置而非开发时文档。

**Why this priority**: 宪章 v1.4.0 已将 "Manifest Runtime Consumption" 确立为架构约束。当前四个域的 manifest 值被大量硬编码为 TypeScript 常量（subscribed events、required fields、action maps、lifecycle states），修改 manifest 无实际效果。这直接破坏了注册指南"零代码 Domain 配置更新"的核心价值。

**Independent Test**: 修改某个域 manifest.yaml 中的 subscribed_events（增删一个事件），重新加载后验证 onEvent 钩子是否自动响应新事件，全程不修改 TypeScript 代码。

**Acceptance Scenarios**:

1. **Given** manifest 加载器已实现，**When** 系统启动，**Then** 四个域的 index.ts 从 manifest.yaml 动态加载 domainId、requiredFields、subscribedEvents，而非内联常量
2. **Given** 四个域的 hooks.ts，**When** 检查 SUBSCRIBED_EVENTS 常量，**Then** 该常量从 manifest.subscribed_events 动态构建，而非手动枚举
3. **Given** Nexus Orchestrator 的 ACTION_MAP，**When** 检查其内容，**Then** action→短名映射从各域 manifest.intent_triggers 动态构建，而非硬编码 30+ 条映射
4. **Given** lifecycle-configs.ts，**When** 检查 timeboxLifecycle 定义，**Then** lifecycle 数据从 manifest.lifecycle 动态加载，而非内联 TypeScript 对象
5. **Given** tasks 域 hooks.ts 中的 TASK_TRANSITIONS / PROJECT_TRANSITIONS，**When** 检查其内容，**Then** 转换映射从 manifest.lifecycle 动态构建，而非硬编码状态转换表
6. **Given** State Machine 的 actionTimestampMap，**When** 检查其内容，**Then** 时间戳字段映射从各域 manifest.field_metadata 中 type=lifecycle_timestamp 的字段动态构建

---

### User Story 6 - Manifest YAML 运行时校验 (Priority: P2)

作为系统维护者，我希望 manifest.yaml 文件在加载时自动校验语法和结构合规性，这样因意外编辑导致的 manifest 错误能在启动时被捕获，而不是在运行时产生难以定位的异常。

**Why this priority**: manifest 成为运行时配置后，其正确性直接影响系统行为。缺少校验意味着一个 YAML 语法错误可能导致整个域静默失效。

**Independent Test**: 故意在一个域的 manifest.yaml 中制造一个语法错误（如缩进错误），启动系统时验证是否输出明确的错误信息并阻止该域注册，而非静默失败或运行时崩溃。

**Acceptance Scenarios**:

1. **Given** manifest 加载器，**When** 加载一个包含 YAML 语法错误的 manifest，**Then** 加载器抛出结构化错误（含文件路径、行号、错误描述），系统拒绝注册该域
2. **Given** manifest 加载器，**When** 加载一个缺少必需区块的 manifest（如缺少 lifecycle），**Then** 加载器报告缺失区块名称并拒绝注册
3. **Given** manifest 加载器，**When** 加载一个 lifecycle.transitions 中包含无效状态名的 manifest，**Then** 加载器报告无效状态名（不在 states 列表中）并拒绝注册
4. **Given** manifest 加载器，**When** 加载一个合法的 manifest，**Then** 加载成功且不产生任何警告

---

### Edge Cases

- 当 State Machine 通用化后，timebox 原有的 overtime→ended 路径是否仍正常工作（含 `overtimeAt` 时间戳设置）？
- 当 OKR 域的 KR 联动从 Orchestrator 迁移到 onEvent 后，activate 动作的 KR 批量状态变更是否保持原子性？
- 当 tasks 域从直接 repo 调用改为 Nexus 链路后，bulkCreate 场景（如任务导入）是否仍能正常工作？
- 当 habits 域的 recalculateHabitMetrics 从 Orchestrator 方法变为独立流程后，指标计算是否仍被正确触发？
- Manifest 加载失败时（YAML 解析错误），是阻止整个系统启动还是仅阻止故障域注册？（倾向后者）
- Orchestrator ACTION_MAP 动态化后，intent action 的短名提取规则是否需要统一约定？
- 当前部分值（如 MIN_DURATION=5、MAX_DURATION=480）未在 manifest 中声明，是否需要在 manifest 中新增 validation_rules 区块？

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 四个域均具备 manifest.yaml 文件，包含六区块：intent_triggers（含 view_routes）、lifecycle、field_metadata、list_actions、required_fields/templates、subscribed_events
- **FR-002**: 四个域均具备独立的 hooks.ts 文件，实现 onValidate、onEvent、onActionSurfaceRequest、onOutboundRequest 四个纯函数钩子
- **FR-003**: State Machine 成为通用执行器，从 manifest.lifecycle 读取转换规则，不再持有任何域的硬编码转换表。create 路径直接将 intent.fields spread 为对象属性，不做域专属字段映射
- **FR-004**: Orchestrator 提供统一的 executeIntent() 入口，不再包含 executeHabitIntent()、executeOKRIntent() 等域专属方法
- **FR-005**: Orchestrator 不再包含 toHabitAction()、toOKRAction()、toLifecycleAction() 等域专属 action 映射函数
- **FR-006**: 四个域的写操作均通过 PrebuiltIntent → Orchestrator → RuleEngine → StateMachine → EventBus 完整链路执行
- **FR-007**: 规则引擎不再使用 stub（永远返回 pass），而是初始化真实 Rule Engine 实例
- **FR-008**: 四个域的域插件（habitsPlugin、okrsPlugin、tasksPlugin、timeboxPlugin）均接入 Orchestrator，onValidate 和 onEvent 在链路中被调用
- **FR-009**: 创建 domains/registry.ts 统一注册四个域插件
- **FR-010**: 转换表从 nexus/core/state-machine/transitions.ts 下沉到各域目录
- **FR-011**: Repository 文件搬迁到对应域目录（domains/{domain}/repository.ts 或 domains/{domain}/repository/）
- **FR-012**: UI 组件搬迁到对应域目录（domains/{domain}/pages/ 和 domains/{domain}/components/）
- **FR-013**: Next.js app/ 路由文件仅做薄壳导入，不包含业务逻辑
- **FR-014**: OKR 域的 KR 联动逻辑（Objective 状态变更 → KR 批量状态同步）从 Orchestrator 迁移到 OKR 域的 onEvent 钩子，在 State Machine 成功后、EventBus.publish 前同步执行，保证同一调用内完成联动
- **FR-015**: OKR 域的激活前置校验（至少 1 个 KR、周期起止日期）从 Orchestrator 迁移到 OKR 域的 onValidate 钩子
- **FR-016**: 四个域的 ActionSurfaceEngine 均统一接入，各域 onActionSurfaceRequest 返回候选行动
- **FR-017**: 现有页面和功能在重构后不发生用户可感知的变化
- **FR-018**: onValidate 返回 invalid 时，Orchestrator 终止链路并返回错误给调用方；onEvent 抛出异常时，记录日志但不回滚已完成的状态变更
- **FR-019**: 迁移采用渐进式部署：Phase 1 和 Phase 3 按域逐步完成，Phase 2（Orchestrator/State Machine 通用化）作为共享基础设施原子完成
- **FR-020**: 四个域的 `index.ts` 中不再内联 `requiredFields` 和 `subscribedEvents` 常量，改为从 `manifest.yaml` 加载后动态构建 DomainManifest 对象
- **FR-021**: 四个域的 `hooks.ts` 中不再硬编码 `SUBSCRIBED_EVENTS` 常量，改为接收 manifest 加载后的数据（或通过闭包/工厂函数注入）
- **FR-022**: Orchestrator 的 `ACTION_MAP` 不再硬编码 30+ 条域专属 action→短名映射，改为从 registry 中各域 manifest 的 `intent_triggers` 动态构建
- **FR-023**: `lifecycle-configs.ts` 不再内联 `timeboxLifecycle` 等 TypeScript 对象，改为从对应域 manifest 的 `lifecycle` 区块动态加载
- **FR-024**: tasks 域 `hooks.ts` 中的 `TASK_TRANSITIONS` / `PROJECT_TRANSITIONS` 硬编码状态转换表，改为从 manifest `lifecycle` 动态构建
- **FR-025**: State Machine 的 `actionTimestampMap` 不再硬编码 action→timestamp 字段映射，改为从域 manifest 的 `field_metadata` 中 `type: lifecycle_timestamp` 字段动态构建
- **FR-026**: 实现 manifest 加载器（`ManifestLoader`），在系统启动时读取并解析所有 `domains/*/manifest.yaml` 文件，提供结构化访问接口
- **FR-027**: Manifest 加载器执行 YAML 语法校验，解析失败时输出包含文件路径和错误描述的结构化错误信息
- **FR-028**: Manifest 加载器执行结构校验：验证六区块（A–F）必需字段存在性、lifecycle.transitions 中引用的状态名均在 states 列表中、required_fields 中引用的字段在 field_metadata 中有对应声明
- **FR-029**: Manifest 加载失败的域被阻止注册（不进入 registry），系统其余域正常运行；加载器输出警告日志列出被阻止的域及原因
- **FR-030**: habits 域 `hooks.ts` 中的 `VALID_FREQUENCY_TYPES` 硬编码枚举，改为从 manifest `field_metadata` 中 `frequencyType` 字段的 `options` 动态获取
- **FR-031**: OKRs 域 `hooks.ts` 中的 okrType 硬编码校验（`'visionary' | 'committed'`），改为从 manifest `field_metadata` 中 `okrType` 字段的 `options` 动态获取

### Key Entities

- **DomainManifest**: 六区块声明文件，定义域的意图触发、生命周期、字段元数据、列表操作、表单模板、事件订阅
- **DomainPlugin**: 域插件对象，组合 manifest + hooks，通过 registry 注册
- **GenericStateMachine**: 通用状态机，接收 StateProposal + manifest.lifecycle 执行状态转换
- **Orchestrator (重构后)**: 统一管道协调器，通过 registry 查找域插件执行统一链路
- **PrebuiltIntent**: UI 组件构造的结构化意图，跳过 Intent Engine 直接进入 Rule Engine
- **ManifestLoader**: 运行时 manifest 加载器，负责读取、解析、校验 manifest.yaml 并提供结构化访问接口
- **ManifestSchema**: manifest.yaml 的运行时类型定义，包含六区块（A–F）的结构约束

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 新增一个空壳测试域时，不需要修改 Nexus 核心目录下任何文件（零耦合验证）
- **SC-002**: 四个域的所有写操作均产生系统事件（通过事件表记录验证），当前 tasks 域零事件发布
- **SC-003**: 四个域的 manifest.yaml 均通过注册指南完成检查清单的全部检查项
- **SC-004**: hooks.ts 中无任何数据库或外部 IO 调用（通过静态分析 import 语句验证）
- **SC-005**: Orchestrator 源码中不存在 "Habit"、"Objective"、"Task"、"Project" 等域对象名称的硬编码引用
- **SC-006**: 项目构建（npm run build）通过，现有功能无用户可感知的变化
- **SC-007**: 四个域目录结构完全符合注册指南的文件目录规范
- **SC-008**: 修改任一域 manifest.yaml 的 subscribed_events 后重新加载，onEvent 钩子自动响应新事件，无需修改 TypeScript 代码
- **SC-009**: 四个域的 `index.ts` 中不存在与 manifest.yaml 值重复的内联常量（requiredFields、subscribedEvents 等）
- **SC-010**: Orchestrator 源码中不存在 `ACTION_MAP` 等域专属硬编码映射表
- **SC-011**: Manifest 加载器在遇到 YAML 语法错误时输出结构化错误（含文件路径和错误行号），并阻止故障域注册
- **SC-012**: Manifest 加载器在遇到结构不完整的 manifest（缺少必需区块）时输出缺失区块名称，并阻止故障域注册

## Clarifications

### Session 2026-05-16

- Q: Manifest 加载失败时，是阻止整个系统启动还是仅阻止故障域注册？ → A: 仅阻止故障域注册，输出警告日志，其余域正常启动。前端需能检测到缺失的域并隐藏对应 UI 入口。
- Q: 当前部分验证常量（如 MIN_DURATION=5, MAX_DURATION=480）未在 manifest.yaml 中声明，是否需要在 manifest 中新增 validation_rules 区块？ → A: 本轮不扩展 manifest 结构，验证常量保留在代码中。validation_rules 区块的纳入在后续迭代中统一考虑。
- Q: Orchestrator ACTION_MAP 动态化后，intent action 的短名提取规则（如 create_timebox → create）是否需要在 manifest 中显式声明 short_action 字段？ → A: 在 manifest intent_triggers 的 action 字段中约定下划线前缀格式（{short_action}_{domain_object}），运行时按约定提取 short_action，无需新增字段
- Q: manifest 中使用 camelCase 的 action 名（如 `createTimebox`）与 spec 中描述的下划线约定不一致，系统如何处理？ → A: `buildActionMap()` 同时支持两种约定——(1) **camelCase 剥离**：将已知域对象名（PascalCase 形式，从 manifest.lifecycle 键推导）从 action 名中剥离得到短名，如 `createTimebox` 剥离 `Timebox` → `create`；(2) **snake_case 分割**：以下划线分割取首段，如 `create_timebox` 取 `create` → `create`；(3) **复合名补丁**：对 manifest.intent_triggers 中无法通过剥离规则处理的多对象名 action（如 `updateKeyResultProgress`），尝试剥离已知对象名后保留剩余部分作为短名

### Session 2026-05-15

- Q: 当 onValidate() 返回 invalid 或 onEvent() 抛出异常时，系统如何响应？ → A: onValidate 失败直接返回错误给用户（终止链路）；onEvent 异常记录日志但不回滚状态变更（事件响应不阻塞主流程）
- Q: OKR KR 联动执行时序？ → A: 同步执行——onEvent 在 State Machine 成功后、EventBus.publish 前调用，同一 Orchestrator 调用内完成联动，无不一致窗口
- Q: 通用 State Machine create 路径如何处理域专属字段？ → A: intent.fields 直接 spread 为对象属性，State Machine 不做字段映射，字段校验交给 onValidate
- Q: tasks bulkCreate 场景如何处理？ → A: 调用方循环提交多个 PrebuiltIntent，每个走完整 Nexus 链路，保持行为一致性
- Q: 迁移部署策略？ → A: 渐进式——Phase 1 按域逐步完成，Phase 2（Orchestrator/State Machine 通用化）原子完成，Phase 3 按域逐步搬迁

## Assumptions

- 数据库 schema 不变（`db/schema/` 不需要修改）
- USOM 类型定义不变（`usom/types/` 不需要新增或修改类型）
- 系统级仓库（event、snapshot、signals、calibration 等）保留在 `lib/db/repositories/` 不搬迁
- State Machine 通用化后的 create 路径使用 `intent.fields` 通用构造对象，特殊时间戳字段（如 `startedAt`、`endedAt`）通过 manifest 的 field_metadata 声明 lifecycle_timestamp 类型来驱动
- tasks 域的 bulkCreate 场景通过循环提交多个 PrebuiltIntent 实现，每个走完整 Nexus 链路，保持功能等价
- habits 域的 recalculateHabitMetrics 功能作为 onEvent 的副作用重新接入
- 现有测试文件需要更新 import 路径以匹配新的文件位置
- Manifest 加载在应用启动时执行一次（非每次请求），加载结果缓存在内存中
- hooks.ts 的工厂函数模式：由于 hooks 需要访问 manifest 数据（如 subscribed_events），钩子改为工厂函数，接收 manifest 数据作为参数后返回四个钩子
- YAML 解析使用 js-yaml 或同等成熟库，不自行实现解析器
- 未在 manifest 中声明的验证常量（MIN_DURATION 等）暂时保留在代码中，后续可考虑扩展 manifest 的 validation_rules 区块
