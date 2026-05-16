# Tasks: Domain 全面合规重构

**Input**: Design documents from `/specs/006-domain-compliance-refactor/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, research.md, quickstart.md

**附加要求**: 每个任务 5-15 分钟，包含 Given-When-Then 验收测试，包含文件路径

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

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，立即开始
- **Phase 2 (Timebox)**: 依赖 Phase 1 的 registry 和类型定义
- **Phase 3-5 (其他域声明层)**: 依赖 Phase 2 作为模板，三个域可并行
- **Phase 6-7 (核心引擎)**: 依赖 Phase 2-5 所有声明层完成；Phase 6 和 7 必须顺序执行
- **Phase 8-9 (文件搬迁)**: 依赖 Phase 7 完成；8 和 9 可部分并行（Repository 先行）
- **Phase 10 (验证)**: 依赖所有前序 Phase 完成

### Parallel Opportunities

- Phase 3/4/5（habits/okrs/tasks 声明层）可完全并行
- Phase 8 的 T029-T032（四个域 Repository 搬迁）可完全并行
- Phase 9 的 T035-T037（三个域 UI 搬迁）可完全并行

### Within Each Phase

- 声明层 Phase (2-5): manifest → hooks → transitions → index.ts 顺序执行
- Phase 6-7: State Machine → Orchestrator → Actions → ActionSurface → 删除旧文件 → 构建验证 顺序执行

## Implementation Strategy

### MVP (Phase 1 + Phase 2)

完成 registry 和 timebox 域声明层，验证模板正确性。

### Increment 1 (Phase 3-5)

三个域声明层并行完成。

### Increment 2 (Phase 6-7) — 核心改动

State Machine 通用化 + Orchestrator 去领域化 + Actions 对接，原子完成。

### Increment 3 (Phase 8-9)

文件搬迁，按域并行。

### Final (Phase 10)

完整验证。
