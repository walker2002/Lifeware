# Tasks: Domain 全面合规重构

**Input**: Design documents from `/specs/006-domain-compliance-refactor/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, research.md, quickstart.md

**附加要求**: 每个任务 5-15 分钟，包含 Given-When-Then 验收测试，包含文件路径

> **注**: T001-T041 已在前一轮完成（声明层补齐 + State Machine 通用化 + Orchestrator 去领域化 + 文件搬迁）。
> T043 起为新增任务，覆盖 US5（Manifest 运行时消费）和 US6（YAML 运行时校验）。

## Phase 1: Setup — 声明层基础设施

**Purpose**: 创建域注册表和共享类型，为四个域的声明层补齐提供基础

- [X] T001 创建 `frontend/src/domains/registry.ts` 域注册表，导入四个域插件，导出 `domainRegistry` 数组和 `findDomain()` 函数
  - **Files**: `frontend/src/domains/registry.ts`
  - **Test**: Given registry 已创建, When 调用 findDomain('habits'), Then 返回 habitsDomain 插件对象

- [X] T002 [P] 创建 `frontend/src/usom/types/domain-types.ts`，定义 DomainManifest、LifecycleDefinition、LifecycleTransition、IntentTrigger、FieldMetadata、ListAction 等 TypeScript 接口
  - **Files**: `frontend/src/usom/types/domain-types.ts`
  - **Test**: Given 接口文件已创建, When import DomainManifest 类型, Then TypeScript 编译无错误

---

## Phase 2: Foundational — Timebox 域声明层（基准域）

**Purpose**: 以 timebox 为基准域完成声明层合规化，作为其他三个域的参考模板

**⚠️ CRITICAL**: 先完成 timebox 的完整声明，其他域以此为模板复制

- [X] T003 编写 `frontend/src/domains/timebox/manifest.yaml`，包含六区块：A（intent_triggers 含 view_schedule view_route）、B（lifecycle 含 states/transitions/terminal_states，数据来源 current timeboxTransitions）、C（field_metadata）、D（list_actions）、E（required_fields + templates）、F（subscribed_events）
  - **Files**: `frontend/src/domains/timebox/manifest.yaml`
  - **Test**: Given manifest 已创建, When 解析 YAML, Then 包含 intent_triggers/lifecycle/field_metadata/list_actions/required_fields/subscribed_events 六个顶级 key

- [X] T004 提取 `frontend/src/domains/timebox/hooks.ts`，从 index.ts 中分离四个钩子函数（onValidate、onEvent、onActionSurfaceRequest、onOutboundRequest）为纯函数，无 db/fetch 调用。index.ts 重构后仅保留域插件入口（导入 manifest + hooks，组合导出 timeboxDomain），原有业务逻辑全部移入 hooks 或 repository 层
  - **Files**: `frontend/src/domains/timebox/hooks.ts`, `frontend/src/domains/timebox/index.ts`
  - **Test**: Given hooks.ts 已创建, When 检查 import 列表, Then 不包含 db/drizzle/repository 等数据库相关导入

- [X] T005 将 `frontend/src/nexus/core/state-machine/transitions.ts` 中的 timeboxTransitions 复制到 `frontend/src/domains/timebox/transitions.ts`，原文件保留（Phase 7 再删除）
  - **Files**: `frontend/src/domains/timebox/transitions.ts`, `frontend/src/nexus/core/state-machine/transitions.ts`
  - **Test**: Given transitions 已复制, When 对比两个文件的 timeboxTransitions 导出, Then 内容完全一致

- [X] T006 重构 `frontend/src/domains/timebox/index.ts`，仅保留域插件入口：导入 manifest（从 YAML 或内联对象）、导入 hooks、组合导出 timeboxDomain 插件对象
  - **Files**: `frontend/src/domains/timebox/index.ts`
  - **Test**: Given 重构完成, When import { timeboxDomain } from index, Then timeboxDomain.manifest 和 timeboxDomain.hooks 均存在

**Checkpoint**: timebox 域声明层完成，manifest 六区块齐备，hooks 纯函数，index.ts 仅入口

---

## Phase 3: User Story 3 (P2) — Habits 域声明层

**Goal**: habits 域具备完整 manifest.yaml 和 hooks.ts

**Independent Test**: 检查 domains/habits/ 目录包含 manifest.yaml（六区块）和 hooks.ts（四个纯函数）

- [X] T007 [P] 编写 `frontend/src/domains/habits/manifest.yaml`，六区块：A（intent_triggers 含 createHabit/activateHabit/suspendHabit/archiveHabit/reactivateHabit + view_list/view_templates view_routes）、B（lifecycle 从 habitTransitions 迁移）、C（field_metadata 含 title/frequencyType/daysOfWeek 等）、D（list_actions）、E（required_fields）、F（subscribed_events）
  - **Files**: `frontend/src/domains/habits/manifest.yaml`
  - **Test**: Given manifest 已创建, When 检查 lifecycle.transitions, Then 包含 draft→active/active→suspended/suspended→active/suspended→archived 五个转换

- [X] T008 [P] 提取 `frontend/src/domains/habits/hooks.ts`，从 index.ts 中分离四个钩子函数为纯函数。习惯特有的 streak 计算逻辑（streak-calculator.ts）不进入 hooks，保留在 habits/ 目录下由 repository 层调用。index.ts 重构后仅保留域插件入口
  - **Files**: `frontend/src/domains/habits/hooks.ts`, `frontend/src/domains/habits/index.ts`
  - **Test**: Given hooks.ts 已创建, When 检查 onValidate 函数签名, Then 接受 (StructuredIntent, USOMSnapshot) 返回 { valid: boolean; errors: string[] }

- [X] T009 将 habitTransitions 从 `frontend/src/nexus/core/state-machine/transitions.ts` 复制到 `frontend/src/domains/habits/transitions.ts`
  - **Files**: `frontend/src/domains/habits/transitions.ts`
  - **Test**: Given transitions 已复制, When 对比 habitTransitions, Then 内容与原文件一致

- [X] T010 重构 `frontend/src/domains/habits/index.ts`，仅保留域插件入口导出
  - **Files**: `frontend/src/domains/habits/index.ts`
  - **Test**: Given 重构完成, When import habitsDomain, Then habitsDomain.manifest.id === 'habits'

**Checkpoint**: habits 域声明层完成

---

## Phase 4: User Story 3 (P2) — OKRs 域声明层

**Goal**: okrs 域具备完整 manifest.yaml 和 hooks.ts，含 KR 联动逻辑迁移

**Independent Test**: 检查 domains/okrs/ 目录，验证 onEvent 包含 KR 联动逻辑、onValidate 包含激活前置校验

- [X] T011 [P] 编写 `frontend/src/domains/okrs/manifest.yaml`，六区块：A（intent_triggers 含 createObjective/activateObjective/pauseObjective/resumeObjective/completeObjective/discardObjective/archiveObjective + KR 操作 + view_workspace/view_detail view_routes）、B（lifecycle 含 objective 和 keyResult 两个对象定义）、C-F 对应区块
  - **Files**: `frontend/src/domains/okrs/manifest.yaml`
  - **Test**: Given manifest 已创建, When 检查 lifecycle, Then 包含 objective 和 key_result 两个对象的状态定义

- [X] T012 提取 `frontend/src/domains/okrs/hooks.ts`，从 index.ts 分离四个钩子。关键迁移：将 Orchestrator 中的 KR 联动逻辑（Objective 激活→KR draft→active）写入 onEvent，将激活前置校验（至少 1 个 KR、周期日期）写入 onValidate。index.ts 重构后仅保留域插件入口
  - **Files**: `frontend/src/domains/okrs/hooks.ts`, `frontend/src/domains/okrs/index.ts`
  - **Test**: Given hooks.ts 已创建, When 调用 onValidate({ action: 'activateObjective', fields: { objectiveId: 'x' } }, snapshot 无 KR), Then 返回 { valid: false, errors: ['至少需要 1 个关键结果'] }

- [X] T013 将 objectiveTransitions + keyResultTransitions 复制到 `frontend/src/domains/okrs/transitions.ts`
  - **Files**: `frontend/src/domains/okrs/transitions.ts`
  - **Test**: Given transitions 已复制, When 对比两个导出, Then 与原文件一致

- [X] T014 重构 `frontend/src/domains/okrs/index.ts`，仅保留域插件入口导出
  - **Files**: `frontend/src/domains/okrs/index.ts`
  - **Test**: Given 重构完成, When import okrsDomain, Then okrsDomain.manifest.lifecycle 含 objective 和 key_result

**Checkpoint**: okrs 域声明层完成，KR 联动逻辑已迁移到 onEvent

---

## Phase 5: User Story 3 (P2) — Tasks 域声明层

**Goal**: tasks 域 manifest 从旧格式升级到六区块，新建 hooks.ts

**Independent Test**: 检查 domains/tasks/ 目录，验证 manifest 包含六区块且含 task 和 project 两个 lifecycle 定义

- [X] T015 [P] 重写 `frontend/src/domains/tasks/manifest.yaml`，从旧格式（仅 supportedIntents/requiredFields/subscribedEvents）升级到六区块：A（intent_triggers 含 CreateTask/UpdateTask/CompleteTask/ArchiveTask/CreateProject/UpdateProject/ArchiveProject + view_list/view_detail view_routes）、B（lifecycle 含 task 和 project 两个对象）、C-F 对应区块
  - **Files**: `frontend/src/domains/tasks/manifest.yaml`
  - **Test**: Given manifest 已升级, When 检查 lifecycle, Then 包含 task (draft/active/completed/archived) 和 project 两个对象定义

- [X] T016 [P] 新建 `frontend/src/domains/tasks/hooks.ts`，实现四个纯函数钩子。onValidate 检查 task 必填字段（title）和 project 必填字段（name）；onEvent 返回空 metrics/suggestions（MVP 阶段无跨域联动需求）
  - **Files**: `frontend/src/domains/tasks/hooks.ts`
  - **Test**: Given hooks 已创建, When 调用 onValidate({ action: 'CreateTask', fields: {} }), Then 返回 { valid: false, errors: ['title 不能为空'] }

- [X] T017 新建 `frontend/src/domains/tasks/transitions.ts`，定义 taskTransitions（null→draft、draft→active、active→completed、active→archived）和 projectTransitions
  - **Files**: `frontend/src/domains/tasks/transitions.ts`
  - **Test**: Given transitions 已创建, When 调用 findTransition(taskTransitions, null, 'create'), Then 返回 { to: 'draft', eventType: 'TaskCreated' }

- [X] T018 重构 `frontend/src/domains/tasks/index.ts`，仅保留域插件入口导出
  - **Files**: `frontend/src/domains/tasks/index.ts`
  - **Test**: Given 重构完成, When import tasksDomain, Then tasksDomain.hooks.onValidate 为函数

**Checkpoint**: 四个域声明层全部完成，manifest 六区块齐备

---

## Phase 6: User Story 1+2 (P1) — State Machine 通用化

**Goal**: State Machine 从 timebox 专用改为通用执行器，从 manifest.lifecycle 读取转换规则

**⚠️ CRITICAL**: 这是 Phase 2 的核心改动，影响所有域，必须原子完成

**Independent Test**: 通用 State Machine 能正确执行 timebox/habit/objective/task 四种对象的状态转换

- [X] T019 重写 `frontend/src/nexus/core/state-machine/index.ts`，将 createTimeboxStateMachine 改为 createGenericStateMachine。接收通用 deps（getRepository/getLifecycle/eventRepo），execute 方法从 manifest.lifecycle 查找合法跃迁，create 路径直接 spread intent.fields。manifest field_metadata 中声明为 lifecycle_timestamp 类型的字段（如 startedAt、endedAt、overtimeAt）由 SM 自动设置当前时间戳
  - **Files**: `frontend/src/nexus/core/state-machine/index.ts`
  - **Test**: Given 通用 SM 已创建, When 执行 create proposal (targetObject.type='timebox', fields={title:'test'}), Then 从 timebox lifecycle 读取转换，创建 status='planned' 的对象; When 执行 overtime→ended 转换, Then overtimeAt 时间戳被自动设置为当前时间

- [X] T020 更新 `frontend/src/nexus/core/state-machine/__tests__/state-machine.test.ts`，新增通用化测试用例：测试 habit draft→active 转换、objective create 转换、非法转换被拒绝、terminal_states 不可回退、timebox overtime→ended 路径（含 overtimeAt 时间戳设置）、lifecycle_timestamp 字段自动填充
  - **Files**: `frontend/src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts`
  - **Test**: Given 测试已更新, When 运行 vitest, Then 所有测试通过（含 overtime→ended 和 lifecycle_timestamp 用例）

**Checkpoint**: State Machine 通用化完成，不再引用任何具体域类型

---

## Phase 7: User Story 1+2 (P1) — Orchestrator 去领域化

**Goal**: Orchestrator 提供统一 executeIntent() 入口，删除所有域专属方法

**⚠️ CRITICAL**: 与 Phase 6 配合完成，是 Phase 2 的另一半

**Independent Test**: Orchestrator 源码无 Habit/Objective/Task/Project 等硬编码引用

- [X] T021 重写 `frontend/src/nexus/orchestrator/index.ts`：删除 executeHabitIntent/executeOKRIntent/toHabitAction/toOKRAction/toLifecycleAction，新增统一 executeIntent(intent, userId, confirmed?) 方法，流程为 registry 查找域插件→onValidate→ruleEngine.evaluate→通用 StateMachine→onEvent（同步）→EventBus.publish→ActionSurfaceEngine
  - **Files**: `frontend/src/nexus/orchestrator/index.ts`
  - **Test**: Given Orchestrator 已重写, When grep "executeHabitIntent\|executeOKRIntent\|toHabitAction\|toOKRAction" 文件, Then 无匹配结果

- [X] T022 更新 `frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts`，新增测试：executeIntent 对 habits 域的 createIntent 正确路由到 habitsPlugin.onValidate；executeIntent 对 tasks 域的 createIntent 正确执行 State Machine
  - **Files**: `frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts`
  - **Test**: Given 测试已更新, When 运行 vitest, Then executeIntent 路由测试通过

- [X] T023 更新 `frontend/src/app/actions/intent.ts`，将 submitHabitIntent 和 executeHabitIntent 中的 stub 规则引擎替换为真实 Rule Engine 初始化，调用方式从 orchestrator.executeHabitIntent() 改为 orchestrator.executeIntent()
  - **Files**: `frontend/src/app/actions/intent.ts`
  - **Test**: Given actions 已更新, When 搜索 "evaluate: async () => ({ result: 'pass'", Then 无匹配（stub 已清除）

- [X] T024 更新 `frontend/src/app/actions/okr.ts`，将所有 OKR 操作从 createOKROrchestrator+executeOKRIntent 改为统一 orchestrator.executeIntent()，删除 stub 规则引擎
  - **Files**: `frontend/src/app/actions/okr.ts`
  - **Test**: Given actions 已更新, When 搜索 "executeOKRIntent", Then 无匹配

- [X] T025 重写 `frontend/src/app/projects/actions.ts`，将所有直接 repo 调用（createProject/createTask/updateTaskStatus 等）改为构造 PrebuiltIntent 并调用 orchestrator.executeIntent()。bulkCreate 场景改为循环提交多个 PrebuiltIntent。
  - **Files**: `frontend/src/app/projects/actions.ts`
  - **Test**: Given actions 已重写, When 创建任务, Then 系统发布 TaskCreated 事件且状态为 manifest 声明的 initial_state

- [X] T026 确认四个域的 onActionSurfaceRequest 钩子返回真实候选行动（非空数组），更新 `frontend/src/nexus/orchestrator/index.ts` 中 ActionSurfaceEngine 调用链路：executeIntent 成功后同步调用域插件 onActionSurfaceRequest 并将结果传递给 ActionSurfaceEngine
  - **Files**: `frontend/src/nexus/orchestrator/index.ts`, `frontend/src/domains/*/hooks.ts`
  - **Test**: Given Orchestrator 执行写操作成功, When 调用 onActionSurfaceRequest, Then 返回的 candidates 数组非空且包含合法 ActionSurface 类型

- [X] T027 删除 `frontend/src/nexus/core/state-machine/transitions.ts`（转换表已下沉到各域目录），删除 `frontend/src/nexus/core/intent-engine/habit-defaults.ts`（习惯默认值移到域目录）
  - **Files**: `frontend/src/nexus/core/state-machine/transitions.ts`, `frontend/src/nexus/core/intent-engine/habit-defaults.ts`, `frontend/src/domains/habits/habit-defaults.ts`
  - **Test**: Given 文件已删除, When 运行 npx tsc --noEmit, Then 零错误

- [X] T028 运行 `npm run build` 验证整体构建通过，修复所有编译错误
  - **Files**: `frontend/`
  - **Test**: Given 代码已修改, When 运行 npm run build, Then 构建成功无错误

**Checkpoint**: Orchestrator 去领域化完成，四域统一走 executeIntent 链路

---

## Phase 8: User Story 4 (P3) — Repository 搬迁

**Goal**: 域 Repository 文件从 lib/db/repositories/ 搬迁到 domains/{domain}/repository/

**Independent Test**: 每个域目录包含 repository.ts 或 repository/ 子目录

- [X] T029 [P] 搬迁 timebox: `lib/db/repositories/timebox.repository.ts` → `domains/timebox/repository.ts`，更新所有 import 路径
  - **Files**: `frontend/src/domains/timebox/repository.ts`, `frontend/src/lib/db/repositories/timebox.repository.ts`, `frontend/src/lib/db/repositories/index.ts`
  - **Test**: Given 搬迁完成, When 搜索 "from.*lib/db/repositories/timebox", Then 仅 index.ts 中的 re-export 引用

- [X] T030 [P] 搬迁 habits: `lib/db/repositories/habit.repository.ts` → `domains/habits/repository/habit.ts`，`habit-log.repository.ts` → `repository/habit-log.ts`，`habit-template.repository.ts` → `repository/habit-template.ts`
  - **Files**: `frontend/src/domains/habits/repository/`, `frontend/src/lib/db/repositories/index.ts`
  - **Test**: Given 搬迁完成, When import from domains/habits/repository/habit, Then HabitRepository 类可正常使用

- [X] T031 [P] 搬迁 okrs: `lib/db/repositories/objective.repository.ts` → `domains/okrs/repository/objective.ts`，`key-result.repository.ts` → `domains/okrs/repository/key-result.ts`
  - **Files**: `frontend/src/domains/okrs/repository/`, `frontend/src/lib/db/repositories/index.ts`
  - **Test**: Given 搬迁完成, When import from domains/okrs/repository/objective, Then ObjectiveRepository 类可正常使用

- [X] T032 [P] 搬迁 tasks: `lib/db/repositories/task.repository.ts` → `domains/tasks/repository/task.ts`，`project.repository.ts` → `repository/project.ts`，`task-template.repository.ts` → `repository/task-template.ts`
  - **Files**: `frontend/src/domains/tasks/repository/`, `frontend/src/lib/db/repositories/index.ts`
  - **Test**: Given 搬迁完成, When import from domains/tasks/repository/task, Then TaskRepository 类可正常使用

- [X] T033 更新 `frontend/src/lib/db/repositories/index.ts`，重新导出所有仓库（从新位置 re-export），确保外部 import 不中断
  - **Files**: `frontend/src/lib/db/repositories/index.ts`
  - **Test**: Given index 已更新, When 运行 npm run build, Then 构建成功

**Checkpoint**: Repository 搬迁完成，lib/db/repositories/ 仅保留系统级仓库

---

## Phase 9: User Story 4 (P3) — UI 组件搬迁

**Goal**: 域 UI 组件从 components/ 搬迁到 domains/{domain}/pages/ + components/

**Independent Test**: 每个域目录包含 pages/ 和 components/ 子目录，app/ 路由仅做薄壳导入

- [X] T034 搬迁 timebox UI 组件：`components/timebox/` → `domains/timebox/components/`，`components/timebox-card.tsx` 等 → `domains/timebox/components/`。创建 `domains/timebox/components/index.ts` barrel export
  - **Files**: `frontend/src/domains/timebox/components/`, `frontend/src/app/page.tsx`
  - **Test**: Given 搬迁完成, When 运行 npx tsc --noEmit, Then 无 timebox 相关错误

- [X] T035 [P] 搬迁 habits UI 组件：`components/habit-*.tsx` (9 个文件) → `domains/habits/components/`
  - **Files**: `frontend/src/domains/habits/components/`, `frontend/src/app/page.tsx`
  - **Test**: Given 搬迁完成, When 运行 npx tsc --noEmit, Then 无 habit 相关错误

- [X] T036 [P] 搬迁 okrs UI 组件：`components/okr/` (10 个文件) → `domains/okrs/components/`
  - **Files**: `frontend/src/domains/okrs/components/`, `frontend/src/app/page.tsx`
  - **Test**: Given 搬迁完成, When 运行 npx tsc --noEmit, Then 无 okr 相关错误

- [X] T037 [P] 搬迁 tasks UI 组件：`components/projects/` (12 个文件) → `domains/tasks/components/`
  - **Files**: `frontend/src/domains/tasks/components/`, `frontend/src/app/projects/page.tsx`
  - **Test**: Given 搬迁完成, When 运行 npx tsc --noEmit, Then 无 project 相关错误

- [X] T038 更新 `frontend/src/app/page.tsx` 所有 import 路径，指向新的域目录位置
  - **Files**: `frontend/src/app/page.tsx`
  - **Test**: Given import 已更新, When 运行 npx tsc --noEmit, Then 构建成功

**Checkpoint**: UI 组件搬迁完成，app/ 仅薄壳导入

---

## Phase 10: Polish & 验证

**Purpose**: 最终验证和清理

- [X] T039 验证四个域 manifest.yaml 完整性：逐一检查六区块（A-F）是否齐全、lifecycle.transitions 与 transitions.ts 一致、required_fields 覆盖所有必填字段
  - **Files**: `frontend/src/domains/*/manifest.yaml`, `frontend/src/domains/*/transitions.ts`
  - **Test**: Given 四个 manifest 已创建, When 逐域解析 YAML 检查六区块, Then 每个域均包含完整六区块且 transitions 数量与 transitions.ts 一致

- [X] T040 运行完整测试套件 `npm test`，修复所有失败的 import 路径和测试用例
  - **Files**: `frontend/src/domains/**/__tests__/`, `frontend/src/nexus/**/__tests__/`
  - **Test**: Given 所有代码已修改, When 运行 npm test, Then 所有测试通过（444 passed）

- [X] T041 运行 `npx tsc --noEmit` 最终构建验证，确保零错误
  - **Files**: `frontend/`
  - **Test**: Given 所有改动完成, When 运行 npx tsc --noEmit, Then 零 TypeScript 错误

- [ ] T042 手动验证四个域的核心功能：主页 schedule tab 创建/启动/结束 timebox（含 overtime→ended 路径验证）、habits tab 创建/激活习惯、okrs tab 创建/激活 Objective（含 KR 联动）、/projects 页面创建/完成任务
  - **Files**: `frontend/`
  - **Test**: Given 系统运行中, When 逐域执行 CRUD 操作, Then 所有操作正常且系统事件被正确发布
  - **NOTE**: 需启动 dev server 手动验证，留待用户测试

---

## Phase 11: Setup — Manifest Runtime 依赖安装

**Purpose**: 安装 yaml 和 zod 依赖，为 ManifestLoader 提供基础

- [X] T043 在 `frontend/` 目录执行 `npm install yaml zod`，安装 YAML 1.2 解析器和运行时校验库
  - **Files**: `frontend/package.json`, `frontend/package-lock.json`
  - **Test**: Given 依赖已安装, When 在 server-side 代码中执行 `import { parse } from 'yaml'` 和 `import { z } from 'zod'`, Then TypeScript 编译无错误且运行时模块可正常加载

---

## Phase 12: Foundational — ManifestLoader 基础设施 (US6)

**Purpose**: 创建 manifest 加载、解析、校验的完整基础设施。所有后续域改造依赖此 Phase。

**⚠️ CRITICAL**: Phase 13-15 的所有任务依赖此 Phase 完成

- [X] T044 创建 `frontend/src/domains/manifest-loader/errors.ts`，定义 `ManifestLoadError` 类型（含 domainId、filePath、phase、message、line?、column?、fieldPath? 字段）和 `formatManifestError(error)` 格式化函数
  - **Files**: `frontend/src/domains/manifest-loader/errors.ts`
  - **Test**: Given ManifestLoadError 已定义, When 构造 `{ domainId: 'timebox', filePath: '/path/manifest.yaml', phase: 'syntax', message: 'bad indentation', line: 15 }` 并调用 formatManifestError, Then 输出字符串包含 "timebox"、文件路径、"line 15" 和 "bad indentation"

- [X] T045 创建 `frontend/src/domains/manifest-loader/schema.ts`，用 Zod 定义 manifest 六区块的完整 schema：`ManifestSchema`（id, version, name, description, intent_triggers, lifecycle, field_metadata, list_actions, required_fields, templates?, subscribed_events），用 `z.infer` 导出 `DomainManifest` 类型
  - **Files**: `frontend/src/domains/manifest-loader/schema.ts`
  - **Test**: Given schema 已定义, When 用合法的 timebox manifest 数据（JS 对象）调用 `ManifestSchema.parse(data)`, Then 返回类型安全的对象；When 缺少 lifecycle 区块, Then 抛出 ZodError 且 error.issues[0].path 包含 ['lifecycle']

- [X] T046 创建 `frontend/src/domains/manifest-loader/validator.ts`，实现 `validateSemantics(manifest)` 函数：校验 lifecycle.transitions 中 from/to 状态均在 states 列表中、initial_state 在 states 中、terminal_states 是 states 子集、required_fields 中引用的字段在 field_metadata 中有声明
  - **Files**: `frontend/src/domains/manifest-loader/validator.ts`
  - **Test**: Given validator 已实现, When 传入 lifecycle 含 transition `from: 'draft' to: 'active'` 但 states 不含 'active', Then 返回 `[{ fieldPath: ['lifecycle', 'task', 'transitions', 0, 'to'], message: '状态 active 不在 states 列表中' }]`

- [X] T047 创建 `frontend/src/domains/manifest-loader/loader.ts`，实现 `loadDomainManifest(domainDir: string)` 函数：用 fs.readFileSync 读取 manifest.yaml → yaml.parse（捕获 YAMLParseError 转为结构化错误）→ ManifestSchema.parse（捕获 ZodError）→ validateSemantics → 缓存到模块级 Map → 返回 ManifestLoadResult
  - **Files**: `frontend/src/domains/manifest-loader/loader.ts`
  - **Test**: Given loader 已实现, When 调用 `loadDomainManifest('domains/timebox')`, Then 返回 `{ success: true, manifest: DomainManifest }` 且 manifest.id === 'timebox'；When YAML 含语法错误, Then 返回 `{ success: false, errors: [{ phase: 'syntax', line: ... }] }`

- [X] T048 创建 `frontend/src/domains/manifest-loader/index.ts`，统一导出 `loadDomainManifest`、`ManifestSchema`、`DomainManifest` 类型、`ManifestLoadError`、`formatManifestError`
  - **Files**: `frontend/src/domains/manifest-loader/index.ts`
  - **Test**: Given index.ts 已创建, When 执行 `import { loadDomainManifest, type DomainManifest } from '@/domains/manifest-loader'`, Then TypeScript 编译无错误

**Checkpoint**: ManifestLoader 基础设施就绪，可以加载和校验 manifest.yaml 文件

---

## Phase 13: User Story 5 (P1) — plugin-factory + 四域 index.ts 改造

**Purpose**: 消除四个域 index.ts 中的硬编码 requiredFields/subscribedEvents，改为从 manifest 运行时加载

**Independent Test**: 四个域 index.ts 中不存在与 manifest.yaml 值重复的内联常量

- [X] T049 创建 `frontend/src/domains/plugin-factory.ts`，实现 `createDomainPlugin(rawManifest: DomainManifest)` 工厂函数：从 manifest 提取 process 层 DomainManifest（domainId、version、requiredFields、subscribedEvents），构建运行时辅助数据（subscribedEvents Set、lifecycleMap、actionTimestampMap），返回 `{ manifest, onValidate, onEvent, onActionSurfaceRequest }` 对象，其中 hooks 通过闭包访问 manifest 数据
  - **Files**: `frontend/src/domains/plugin-factory.ts`
  - **Test**: Given factory 已创建, When 调用 `createDomainPlugin(timeboxManifest)`, Then 返回的 plugin.manifest.domainId === 'timebox'，plugin.manifest.subscribedEvents 为数组且包含 'TimeboxCreated'

- [X] T050 重构 `frontend/src/domains/timebox/index.ts`：删除内联的 timeboxManifest 常量（requiredFields/subscribedEvents），改为调用 `loadDomainManifest(__dirname)` 获取 manifest，然后调用 `createDomainPlugin(manifest)` 构建插件对象并导出。确保 loadDomainManifest 失败时输出 console.error 但不阻止模块加载
  - **Files**: `frontend/src/domains/timebox/index.ts`
  - **Test**: Given index.ts 已重构, When 搜索 `requiredFields:` 或 `subscribedEvents:`, Then 无匹配（常量已删除）；When import timeboxPlugin, Then timeboxPlugin.manifest.subscribedEvents 包含 'TimeboxCreated'

- [X] T051 [P] 重构 `frontend/src/domains/habits/index.ts`：同 T050 模式，删除内联 habitsManifest 常量，改用 loadDomainManifest + createDomainPlugin
  - **Files**: `frontend/src/domains/habits/index.ts`
  - **Test**: Given index.ts 已重构, When 搜索 `requiredFields:` 或 `subscribedEvents:`, Then 无匹配；When import habitsPlugin, Then habitsPlugin.manifest.subscribedEvents 包含 'HabitCreated'

- [X] T052 [P] 重构 `frontend/src/domains/okrs/index.ts`：同 T050 模式
  - **Files**: `frontend/src/domains/okrs/index.ts`
  - **Test**: Given index.ts 已重构, When 搜索 `requiredFields:` 或 `subscribedEvents:`, Then 无匹配；When import okrsPlugin, Then okrsPlugin.manifest.subscribedEvents 包含 'ObjectiveCreated'

- [X] T053 [P] 重构 `frontend/src/domains/tasks/index.ts`：同 T050 模式
  - **Files**: `frontend/src/domains/tasks/index.ts`
  - **Test**: Given index.ts 已重构, When 搜索 `requiredFields:` 或 `subscribedEvents:`, Then 无匹配；When import tasksPlugin, Then tasksPlugin.manifest.subscribedEvents 包含 'TaskCreated'

**Checkpoint**: 四域 index.ts 硬编码消除完成，manifest 数据从 YAML 运行时加载

---

## Phase 14: User Story 5 (P1) — 四域 hooks.ts 改造

**Purpose**: 消除四个域 hooks.ts 中的 SUBSCRIBED_EVENTS、TASK_TRANSITIONS、VALID_FREQUENCY_TYPES 等硬编码常量

**Independent Test**: hooks.ts 中不存在与 manifest.yaml 值重复的常量定义

- [X] T054 重构 `frontend/src/domains/timebox/hooks.ts`：将四个独立导出的钩子函数改为导出 `createTimeboxHooks(manifest: DomainManifest)` 工厂函数。函数内部：用 `new Set(manifest.subscribed_events)` 替代 `SUBSCRIBED_EVENTS` 常量；闭包捕获 manifest 数据。保留 MIN_DURATION/MAX_DURATION/UPCOMING_THRESHOLD_MS 等验证常量（不在本轮 scope）
  - **Files**: `frontend/src/domains/timebox/hooks.ts`
  - **Test**: Given hooks.ts 已重构, When 搜索 `const SUBSCRIBED_EVENTS`, Then 无匹配；When 调用 `createTimeboxHooks(timeboxManifest)`, Then 返回的对象包含 onValidate/onEvent/onActionSurfaceRequest 三个函数

- [X] T055 [P] 重构 `frontend/src/domains/habits/hooks.ts`：导出 `createHabitsHooks(manifest)` 工厂函数。消除 `SUBSCRIBED_EVENTS` 和 `VALID_FREQUENCY_TYPES` 硬编码——subscribedEvents 改从 manifest.subscribed_events 构建，VALID_FREQUENCY_TYPES 改从 manifest.field_metadata.frequencyType.options 动态获取
  - **Files**: `frontend/src/domains/habits/hooks.ts`
  - **Test**: Given hooks.ts 已重构, When 搜索 `const SUBSCRIBED_EVENTS` 或 `VALID_FREQUENCY_TYPES`, Then 无匹配；When 调用 createHabitsHooks 后 onValidate 验证 frequencyType='daily', Then 验证通过

- [X] T056 [P] 重构 `frontend/src/domains/okrs/hooks.ts`：导出 `createOkrsHooks(manifest)` 工厂函数。消除 `SUBSCRIBED_EVENTS` 硬编码和 okrType 验证值硬编码（`'visionary' | 'committed'`）——改从 manifest.field_metadata.okrType.options 动态获取
  - **Files**: `frontend/src/domains/okrs/hooks.ts`
  - **Test**: Given hooks.ts 已重构, When 搜索 `const SUBSCRIBED_EVENTS` 或 `'visionary' | 'committed'`, Then 无匹配；When 调用 createOkrsHooks 后 onValidate 验证 okrType='visionary', Then 验证通过

- [X] T057 [P] 重构 `frontend/src/domains/tasks/hooks.ts`：导出 `createTasksHooks(manifest)` 工厂函数。消除 `SUBSCRIBED_EVENTS`、`TASK_TRANSITIONS`、`PROJECT_TRANSITIONS` 硬编码——subscribedEvents 改从 manifest.subscribed_events 构建，transitions 改从 manifest.lifecycle.task / manifest.lifecycle.project.transitions 动态构建转换查找 Map
  - **Files**: `frontend/src/domains/tasks/hooks.ts`
  - **Test**: Given hooks.ts 已重构, When 搜索 `const SUBSCRIBED_EVENTS` 或 `TASK_TRANSITIONS` 或 `PROJECT_TRANSITIONS`, Then 无匹配；When 调用 createTasksHooks 后 onEvent 处理 'TaskCreated' 事件, Then 返回结果（非 undefined）

- [X] T058 更新 `frontend/src/domains/plugin-factory.ts`：将 `createDomainPlugin` 中 hooks 的调用方式从直接引用 hooks 函数改为调用各域的工厂函数（`createTimeboxHooks(manifest)` 等），根据 manifest.id 选择对应工厂函数
  - **Files**: `frontend/src/domains/plugin-factory.ts`, `frontend/src/domains/*/hooks.ts`
  - **Test**: Given factory 已更新, When 调用 `createDomainPlugin(timeboxManifest)`, Then 内部调用 createTimeboxHooks(manifest) 并返回四个钩子函数；When 调用 `createDomainPlugin(tasksManifest)`, Then 内部调用 createTasksHooks(manifest)

**Checkpoint**: 四域 hooks.ts 硬编码消除完成，hooks 通过工厂函数接收 manifest 数据

---

## Phase 15: User Story 5 (P1) — Nexus 核心硬编码消除

**Purpose**: 消除 Orchestrator ACTION_MAP、lifecycle-configs.ts、State Machine actionTimestampMap 中的域专属硬编码

**Independent Test**: Nexus 源码中不存在域名称或域专属值的硬编码引用

- [ ] T059 重构 `frontend/src/nexus/orchestrator/lifecycle-configs.ts`：将 `getTimeboxLifecycle()` 等函数改为从 manifest 动态加载。新增 `getLifecycleFromManifest(domainId: string, objectType: string)` 函数，从 registry 中查找域插件并读取 manifest.lifecycle[objectType]。保留旧函数作为 wrapper 调用新函数（过渡期兼容），标记 @deprecated
  - **Files**: `frontend/src/nexus/orchestrator/lifecycle-configs.ts`, `frontend/src/domains/registry.ts`
  - **Test**: Given 重构完成, When 调用 `getLifecycleFromManifest('timebox', 'timebox')`, Then 返回的 states 数组与 timebox/manifest.yaml 中 lifecycle.timebox.states 一致

- [ ] T060 重构 `frontend/src/nexus/core/state-machine/index.ts` 中的 `actionTimestampMap`：将硬编码的 action→timestamp 映射（如 `'start_timebox' → 'startedAt'`）改为从 manifest.field_metadata 中 `type: 'lifecycle_timestamp'` 字段动态构建。新增 `buildActionTimestampMap(manifest: DomainManifest)` 工具函数，在 manifest-loader 或 plugin-factory 中实现
  - **Files**: `frontend/src/nexus/core/state-machine/index.ts`, `frontend/src/domains/plugin-factory.ts`
  - **Test**: Given 重构完成, When 搜索 State Machine 源码中的 `'startedAt'` 或 `'endedAt'` 等硬编码字符串, Then 仅出现在注释中；When 对 timebox manifest 调用 buildActionTimestampMap, Then 返回 `{ start_timebox: { startedAt: 'now' }, end_timebox: { endedAt: 'now' } }` 类似结构

- [X] T061 重构 `frontend/src/nexus/orchestrator/index.ts` 中的 `ACTION_MAP`：将 40+ 条硬编码 action→shortAction 映射改为从 registry 中各域 manifest.intent_triggers 动态构建。实现 `buildActionMap(plugins: DomainPlugin[]): Record<string, string>` 函数，规则：遍历每个 plugin 的 manifest.intent_triggers，按 action 名称下划线分割取第一段作为 shortAction
  - **Files**: `frontend/src/nexus/orchestrator/index.ts`
  - **Test**: Given 重构完成, When 搜索 `ACTION_MAP` 关键词, Then 无硬编码映射表残留；When 调用 buildActionMap 后查 'create_timebox', Then 返回 'create'；查 'activate_habit', Then 返回 'activate'

- [X] T062 清理废弃代码：标记 `lifecycle-configs.ts` 中的旧内联对象为 @deprecated；检查各域 `transitions.ts` 文件是否仍被引用，若已完全由 manifest.lifecycle 替代则标记 @deprecated
  - **Files**: `frontend/src/nexus/orchestrator/lifecycle-configs.ts`, `frontend/src/domains/*/transitions.ts`
  - **Test**: Given 清理完成, When 搜索 `timeboxLifecycle` 或 `habitTransitions` 非废弃引用, Then 仅在 @deprecated 标记的函数中存在

**Checkpoint**: Nexus 核心硬编码消除完成，所有域数据从 manifest 运行时加载

---

## Phase 16: 集成验证 + Success Criteria 检查

**Purpose**: 端到端验证，确保 US5 和 US6 的所有 Success Criteria 满足

- [X] T063 更新 `frontend/src/domains/registry.ts`：确保四个域均通过 `loadDomainManifest()` 加载 manifest 并通过 `createDomainPlugin()` 注册。加载失败的域跳过注册并输出 console.warn
  - **Files**: `frontend/src/domains/registry.ts`
  - **Test**: Given registry 已更新, When 加载成功, Then domainRegistry 长度为 4 且每个 plugin 的 manifest.id 正确；When 某域 manifest 有语法错误, Then 该域不进入 registry 但其余 3 个域正常注册

- [X] T064 验证 SC-008 ~ SC-012：逐一检查五个 Success Criteria：SC-008（修改 manifest subscribed_events 后 onEvent 自动响应）、SC-009（index.ts 无内联常量）、SC-010（Orchestrator 无 ACTION_MAP 硬编码）、SC-011（YAML 语法错误输出结构化错误）、SC-012（缺失区块报告缺失名称）
  - **Files**: `frontend/src/domains/*/index.ts`, `frontend/src/domains/*/hooks.ts`, `frontend/src/nexus/orchestrator/index.ts`, `frontend/src/domains/manifest-loader/`
  - **Test**: Given 代码已改造, When 执行以下 grep 检查——`grep 'requiredFields:' domains/*/index.ts`（应为空）、`grep 'ACTION_MAP' nexus/orchestrator/index.ts | grep -v buildActionMap`（应为空）、故意制造 YAML 错误后加载（应输出结构化错误）——Then 所有检查通过

- [X] T065 运行 `npm run build` 最终构建验证，修复所有编译错误。确保无客户端 bundle 引入 yaml/zod（通过搜索 build 输出确认）
  - **Files**: `frontend/`
  - **Test**: Given 所有改动完成, When 运行 npm run build, Then 构建成功无错误；When 检查 .next/ 构建输出, Then yaml/zod 包不在客户端 chunk 中

---

## Phase 17: 消除剩余硬编码（修复 speckit-analyze HIGH 问题）

**Purpose**: 消除 `speckit-analyze` 发现的两处 HIGH 级别问题：I1（命名约定与 spec 不一致）和 I2（Orchestrator 中残留域专属硬编码）。

- [X] T066 重构 `frontend/src/nexus/orchestrator/index.ts` 中的 `getObjectType()` 函数（line 156-162），改为调用 `lifecycle-configs.ts` 中新增的 `resolveObjectType(domainId: string, action: string): string` 函数。新函数从域 manifest.lifecycle 的键（snake_case 对象类型名）动态推导目标对象类型：单键域直接返回该键；多键域（如 okrs 有 objective 和 key_result）将每个键转为 PascalCase 后在 action 名中匹配。替代原有的 `domain === 'okrs'` 硬编码分支和 `domain.replace(/s$/, '')` 通用规则。
  - **Files**: `frontend/src/nexus/orchestrator/lifecycle-configs.ts`, `frontend/src/nexus/orchestrator/index.ts`
  - **Test**: Given okrs 域 action=`createKeyResult`, When 调用 `resolveObjectType('okrs', 'createKeyResult')`, Then 返回 `'key_result'`；Given tasks 域 action=`completeTask`, When 调用 `resolveObjectType('tasks', 'completeTask')`, Then 返回 `'task'`；Given timebox 域 action=`startTimebox`, When 调用 `resolveObjectType('timebox', 'startTimebox')`, Then 返回 `'timebox'`

- [X] T067 消除 `frontend/src/nexus/orchestrator/index.ts` 中对域 transitions 文件的直接导入（`habitTransitions`、`objectiveTransitions`、`keyResultTransitions`、`taskTransitions`、`projectTransitions`）。在 `lifecycle-configs.ts` 中新增 `getTransitionFromManifest(domainId: string, objectType: string, fromState: string | null, action: string): LifecycleTransition | undefined` 函数，内部通过 `getLifecycleFromManifest()` 加载目标对象类型的 lifecycle，遍历 `transitions` 查找匹配的转换规则。将 orchestrator 中所有 `findTransition(xxxTransitions, fromState, action)` 调用替换为 `getTransitionFromManifest(domainId, objectType, fromState, action)`。删除 orchestrator 顶部的域 transitions 导入语句。
  - **Files**: `frontend/src/nexus/orchestrator/lifecycle-configs.ts`, `frontend/src/nexus/orchestrator/index.ts`
  - **Test**: Given habits 域 habit 对象 fromState=`'draft'` action=`'activate'`, When 调用 `getTransitionFromManifest('habits', 'habit', 'draft', 'activate')`, Then 返回 `{ to: 'active', event_type: 'HabitActivated', ... }`；Given tasks 域 task 对象非法转换 fromState=`'completed'` action=`'activate'`, Then 返回 `undefined`

- [X] T068 更新 `specs/006-domain-compliance-refactor/spec.md` Clarifications 中 Session 2026-05-16 关于 action 命名约定的说明：补充文档化实际的短名提取算法——同时支持 camelCase（剥离已知域对象名）和 snake_case（下划线分割取首段）两种约定。使 spec 与 `buildActionMap()` 的实现行为一致，消除 "spec 只描述了下划线约定但 manifest 使用 camelCase" 的不一致。
  - **Files**: `specs/006-domain-compliance-refactor/spec.md`
  - **Test**: Given spec 已更新, When 阅读 Clarifications 关于 ACTION_MAP 命名约定的说明, Then 明确记录了两种命名约定的支持及各自的提取算法

**Checkpoint**: Orchestrator 中 getObjectType 和域 transitions 导入均已动态化，spec 与实现命名约定一致。

### Phase Dependencies

- **Phase 1-10**: 前一轮已完成
- **Phase 11 (Setup)**: 无依赖，立即开始
- **Phase 12 (ManifestLoader)**: 依赖 Phase 11 yaml+zod 安装
- **Phase 13 (四域 index.ts)**: 依赖 Phase 12 ManifestLoader 就绪
- **Phase 14 (四域 hooks.ts)**: 依赖 Phase 13 完成
- **Phase 15 (Nexus 硬编码)**: 依赖 Phase 13-14 完成
- **Phase 16 (集成验证)**: 依赖 Phase 12-15 全部完成
- **Phase 17 (消除剩余硬编码)**: 依赖 Phase 15 完成（需要 `buildActionMap` 和 `getLifecycleFromManifest` 已就绪）

### Parallel Opportunities

- Phase 13 的 T051/T052/T053（habits/okrs/tasks index.ts）可与 T050 并行
- Phase 14 的 T055/T056/T057（habits/okrs/tasks hooks.ts）可与 T054 并行

### Within Each Phase

- 声明层 Phase (2-5): manifest → hooks → transitions → index.ts 顺序执行
- Phase 6-7: State Machine → Orchestrator → Actions → ActionSurface → 删除旧文件 → 构建验证 顺序执行

## Implementation Strategy

### 已完成 (Phase 1-10)

声明层补齐 + State Machine 通用化 + Orchestrator 去领域化 + 文件搬迁 + 验证。

### Increment 4 (Phase 11-12) — Manifest 基础设施

安装依赖 + ManifestLoader 实现，为运行时消费提供基础。

### Increment 5 (Phase 13-14) — 四域运行时消费

按域逐步消除 index.ts 和 hooks.ts 中的硬编码，可按域并行。

### Increment 6 (Phase 15) — Nexus 核心消除

Orchestrator ACTION_MAP + lifecycle-configs + State Machine actionTimestampMap 动态化。

### Final (Phase 16)

SC-008 ~ SC-012 逐条验证 + 构建通过。

### Increment 7 (Phase 17) — 消除剩余硬编码

修复 speckit-analyze 发现的 HIGH 问题：`getObjectType()` 动态化 + 消除域 transitions 导入 + spec 命名约定补充。
