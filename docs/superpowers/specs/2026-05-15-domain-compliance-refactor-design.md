# Domain 全面合规重构设计

**日期**: 2026-05-15
**状态**: Draft
**参考文档**: `mydocs/core/LW_domain_注册指南_2026_05_14.md`、`.specify/memory/constitution.md`

---

## 1. 背景

### 当前问题

四个已开发域（timebox、habits、okrs、tasks）存在不同程度的 Nexus 绕过和架构耦合：

| 域 | 走 Nexus 程度 | 规则引擎 | 域插件接入 | 事件发布 |
|---|---|---|---|---|
| timebox | 完整 | 真实规则 | timeboxPlugin 已接入 | 是 |
| habits | 部分（创建/状态变更） | stub（永远 pass） | habitsPlugin 未接入 | 是（部分） |
| okrs | 部分（创建/状态变更） | stub（永远 pass） | okrsPlugin 未接入 | 是（部分） |
| tasks | 完全绕过 | 未调用 | tasksPlugin 未接入 | 否 |

### 架构耦合

1. **State Machine**：仅服务 timebox，habit/OKR 状态转换在 Orchestrator 中硬编码
2. **Orchestrator**：含 `executeHabitIntent()`、`executeOKRIntent()` 等域专属方法，内嵌字段映射、KR 联动、激活校验等业务逻辑
3. **转换表**：四个域的转换表全部硬编码在 `nexus/core/state-machine/transitions.ts`
4. **Action 映射**：`toHabitAction()`、`toOKRAction()`、`toLifecycleAction()` 硬编码在 Orchestrator

### 目录结构差距

- 仅 timebox 和 tasks 有旧格式 manifest（无六区块 A–F）
- habits 和 okrs 无 manifest
- 无 `hooks.ts`（钩子混在 `index.ts`）
- 无 `domains/registry.ts`
- Repository 在 `lib/db/repositories/`，不在域目录
- UI 组件分散在 `components/` 和 `app/`

---

## 2. 目标

按照 `LW_domain_注册指南` 的 8 步流程，将四个域全面合规化：

1. 每个域具备完整 manifest.yaml（六区块 A–F，含 view_routes）
2. 每个域具备独立 hooks.ts（纯函数）
3. State Machine 通用化：从 manifest.lifecycle 读取转换规则
4. Orchestrator 去领域化：统一 `executeIntent()` 入口
5. 每个域具备 `domains/{domain}/repository.ts`
6. 每个域具备 `domains/{domain}/pages/` 目录
7. 创建 `domains/registry.ts` 统一注册
8. 所有写操作通过 PrebuiltIntent → Nexus 链路

**不变量**：重构后现有页面和功能不发生用户可感知的变化。

---

## 3. 设计方案

### 3.1 Phase 1：声明层补齐

#### 3.1.1 manifest.yaml（四域并行）

为每个域创建/升级完整 manifest.yaml，包含六区块：

**区块 A — intent_triggers**：声明每个 action 的描述、示例、关键词、signals、excludes。同时声明 `view_routes`（type: view_route），如实反映当前页面组件：

- **habits**：`view_list`（`/?tab=habits` → HabitLibraryView）、`view_templates`（`/?tab=templates` → HabitTemplateManager）
- **okrs**：`view_workspace`（`/?tab=okrs` → OKRWorkspace）、`view_detail`（`/?tab=okrs&objectiveId=:id` → OKRDetail）
- **tasks**：`view_list`（`/projects` → ProjectsView）、`view_detail`（`/projects?selectedId=:id` → DetailPanel）
- **timebox**：`view_schedule`（`/?tab=schedule` → DayView/WeekView/MonthView）

**区块 B — lifecycle**：从当前 `transitions.ts` 迁移，增加 `initial_state`、`terminal_states`、`trigger` 类型（`intent` | `time`）。

**区块 C — field_metadata**：标注每个字段的 editable、required、input_type、edit_requires_confirm。

**区块 D — list_actions**：声明列表行操作按钮（如完成、归档、重新激活）及其 condition 表达式。

**区块 E — required_fields + templates**：声明创建/编辑时的必填字段和表单模板。

**区块 F — subscribed_events**：声明本域关注的事件类型。

#### 3.1.2 hooks.ts 分离

将每个域 `index.ts` 中的四个钩子实现提取到 `hooks.ts`：

```
domains/habits/hooks.ts    ← onValidate, onEvent, onActionSurfaceRequest, onOutboundRequest
domains/okrs/hooks.ts      ← 同上
domains/tasks/hooks.ts     ← 同上
domains/timebox/hooks.ts   ← 同上
```

约束：
- 纯函数，无数据库调用，无外部 IO
- `index.ts` 仅导出域插件对象（组合 manifest + hooks）

#### 3.1.3 转换表下沉到域目录

从 `nexus/core/state-machine/transitions.ts` 提取转换表到各域：

- `habitTransitions` → `domains/habits/transitions.ts`（Phase 2 后由 manifest.lifecycle 替代）
- `objectiveTransitions` + `keyResultTransitions` → `domains/okrs/transitions.ts`
- `timeboxTransitions` → `domains/timebox/transitions.ts`
- tasks 域新建 `domains/tasks/transitions.ts`

`transitions.ts` 保留为过渡期文件，Phase 2 State Machine 通用化后从 manifest.yaml 读取。

#### 3.1.4 创建 Registry

创建 `domains/registry.ts`：

```typescript
import type { DomainPlugin } from '@/usom/types/process'
import { habitsDomain } from './habits'
import { okrsDomain } from './okrs'
import { tasksDomain } from './tasks'
import { timeboxDomain } from './timebox'

export const domainRegistry: DomainPlugin[] = [
  habitsDomain,
  okrsDomain,
  tasksDomain,
  timeboxDomain,
]

export function findDomain(domainId: string): DomainPlugin | undefined {
  return domainRegistry.find(d => d.manifest.id === domainId)
}
```

Nexus 启动时从 registry 加载所有 manifest 和 hooks。

---

### 3.2 Phase 2：核心引擎通用化

#### 3.2.1 State Machine 通用化

**当前**：`createTimeboxStateMachine()` 硬编码 `Timebox` 类型、`ITimeboxRepository`。

**改为**：通用 `createStateMachine(deps)`:

```typescript
interface GenericStateMachineDeps {
  repo: IRepository              // 通用 Repository 接口
  eventRepo: ISystemEventRepository
  getLifecycle(objectType: string): LifecycleDefinition  // 从 manifest 读取
}

interface GenericStateMachine {
  execute(
    proposal: StateProposal,
    eventBus: EventBus,
    userId: USOM_ID,
  ): Promise<StateMachineResult>
}
```

执行逻辑：

1. 接收 `StateProposal`
2. 调用 `getLifecycle(proposal.targetObject.type)` 获取 manifest 中的 lifecycle 声明
3. 加载已有对象（非 create 路径）获取 `fromState`
4. 在 lifecycle.transitions 中查找合法跃迁（from → to）
5. 校验 terminal_states 不可回退约束
6. 构造更新后的对象（通用 spread：`{ ...existing, status: transition.to, updatedAt: now }`）
7. 调用 `repo.save()` 持久化
8. 构造 SystemEvent（eventType 从 transition 中获取）并发布

**关键**：State Machine 不再 import 任何具体 USOM 对象类型。

#### 3.2.2 Orchestrator 去领域化

**当前**：`execute()`、`executeHabitIntent()`、`executeOKRIntent()` 三个入口，各含域专属逻辑。

**改为**：统一 `executeIntent(intent, userId, confirmed?)` 单一入口：

```typescript
async executeIntent(
  intent: StructuredIntent,
  userId: USOM_ID,
  confirmed?: boolean,
): Promise<OrchestratorResult>
```

流程：

```
1. 从 registry 查找 intent.targetDomain 对应的域插件
2. 调用 plugin.onValidate(intent, snapshot) 校验
3. 调用 ruleEngine.evaluate(intent, snapshot) 规则评估
4. 如需确认且未确认，返回 needsConfirmation
5. 构造 StateProposal，传给通用 State Machine 执行
6. EventBus.publish(event)
7. 调用 actionSurfaceEngine.generate()（如有）
8. 返回结果
```

**领域逻辑迁移**：

| 当前位置（Orchestrator 内） | 迁移到 |
|---|---|
| 习惯字段映射（title, frequencyType, daysOfWeek...） | State Machine create 路径通用处理 `intent.fields` |
| OKR 激活前置校验（至少 1 个 KR） | OKR 域 `onValidate()` |
| KR 联动状态同步（Objective 激活 → KR 激活） | OKR 域 `onEvent()` |
| OKR 创建时构造 Objective 对象 | State Machine create 路径通用处理 |
| `toHabitAction()`、`toOKRAction()` 映射 | 删除，intent.action 直接对应 manifest lifecycle action |

#### 3.2.3 Rule Engine 去硬编码

**当前**：`actions/intent.ts` 和 `actions/okr.ts` 中 stub 规则引擎（永远返回 pass）。

**改为**：

- Phase 1：初始化真实 Rule Engine，注册现有规则（timebox-overlap、habit-conflict、timebox-duration 等）
- 新域暂无专属规则时，Rule Engine 自然返回 `pass`
- 后续各域按需添加规则

#### 3.2.4 Action Surface Engine 统一接入

**当前**：仅 timeboxPlugin 接入 ActionSurfaceEngine。

**改为**：四个域插件均接入，各自 `onActionSurfaceRequest()` 返回候选行动。ActionSurfaceEngine 统一排序后输出。

---

### 3.3 Phase 3：文件搬迁与 UI 重组

#### 3.3.1 Repository 搬迁

```
lib/db/repositories/habit.repository.ts          → domains/habits/repository.ts
lib/db/repositories/habit-log.repository.ts      → domains/habits/repository/habit-log.ts
lib/db/repositories/habit-template.repository.ts → domains/habits/repository/habit-template.ts
lib/db/repositories/objective.repository.ts      → domains/okrs/repository/objective.ts
lib/db/repositories/key-result.repository.ts     → domains/okrs/repository/key-result.ts
lib/db/repositories/task.repository.ts           → domains/tasks/repository/task.ts
lib/db/repositories/project.repository.ts        → domains/tasks/repository/project.ts
lib/db/repositories/task-template.repository.ts  → domains/tasks/repository/task-template.ts
lib/db/repositories/timebox.repository.ts        → domains/timebox/repository.ts
```

保留在 `lib/db/repositories/` 的系统级仓库：
- `system-event.repository.ts`
- `context-snapshot.repository.ts`
- `derived-signals.repository.ts`
- `energy-log.repository.ts`
- `user.repository.ts`、`user-calibration.repository.ts`
- `intention.repository.ts`、`structured-intent.repository.ts`
- `action-surface.repository.ts`
- `review.repository.ts`
- `index.ts`（重新导出所有仓库）
- `mappers.ts`

#### 3.3.2 UI 组件搬迁

每个域的 `pages/` 目录存放页面级组件，`components/` 存放子组件：

```
domains/habits/
  pages/
    HabitLibraryPage.tsx       ← 原 components/habit-library-view.tsx
    HabitTemplatePage.tsx      ← 原 components/habit-template-manager.tsx
  components/
    habit-card.tsx
    habit-checkin.tsx
    habit-form.tsx
    habit-list.tsx
    habit-template-card.tsx
    habit-template-form.tsx
    habit-template-view.tsx

domains/okrs/
  pages/
    OKRWorkspacePage.tsx       ← 原 components/okr/okr-workspace.tsx
  components/
    objective-card.tsx
    okr-detail.tsx
    okr-directory.tsx
    okr-form.tsx
    okr-import-dialog.tsx
    okr-import-panel.tsx
    okr-list.tsx
    okr-panel.tsx
    kr-progress.tsx

domains/tasks/
  pages/
    ProjectsListPage.tsx       ← 原 app/projects/projects-client.tsx
  components/
    project-detail.tsx
    project-form.tsx
    project-tree.tsx
    projects-view.tsx
    detail-panel.tsx
    task-form.tsx
    task-import-dialog.tsx
    task-import-panel.tsx
    task-list.tsx
    template-dialog.tsx
    status-badge.tsx
    split-warning.tsx

domains/timebox/
  pages/
    TimeboxSchedulePage.tsx    ← 新建，组合 DayView/WeekView/MonthView
  components/
    date-nav.tsx
    day-view.tsx
    week-view.tsx
    month-view.tsx
    timebox-timeline.tsx
    timebox-card.tsx
    timebox-draft-editor.tsx
    timebox-list.tsx
```

#### 3.3.3 Next.js 路由更新

`app/` 目录的路由文件仅做薄壳导入：

```typescript
// app/projects/page.tsx
import { ProjectsListPage } from '@/domains/tasks/pages/ProjectsListPage'
export default ProjectsListPage
```

主页 `app/page.tsx` 的 import 路径更新指向新的域目录。

#### 3.3.4 hooks 文件搬迁

```
hooks/use-habits.ts  → domains/habits/hooks/use-habits.ts
hooks/use-okrs.ts    → domains/okrs/hooks/use-okrs.ts
```

#### 3.3.5 Nexus 清理

搬迁完成后清理：
- 删除 `nexus/core/state-machine/transitions.ts`（转换表已下沉到域）
- 删除 Orchestrator 中 `executeHabitIntent()`、`executeOKRIntent()` 方法
- 删除 `toHabitAction()`、`toOKRAction()`、`toLifecycleAction()` 映射函数
- 删除 `nexus/core/intent-engine/habit-defaults.ts`（习惯默认值移到域目录）

---

## 4. 数据流变更

### 当前（四条不同路径）

```
tasks:    UI → Server Action → repo.save()                    [完全绕过]
habits:   UI → Server Action → Orchestrator.executeHabitIntent() → 硬编码逻辑 [半绕过]
okrs:     UI → Server Action → Orchestrator.executeOKRIntent()  → 硬编码逻辑 [半绕过]
timebox:  UI → Server Action → Orchestrator.execute()          → State Machine [合规]
```

### 目标（统一链路）

```
UI → 构造 PrebuiltIntent → Orchestrator.executeIntent()
  → Registry 查找域插件 → plugin.onValidate()
  → RuleEngine.evaluate()
  → 通用 StateMachine（读取 manifest.lifecycle）
  → EventBus.publish()
  → ActionSurfaceEngine.generate()
```

所有四个域走同一条链路，差异完全由 manifest 和 hooks 驱动。

### 页面组件数据访问

| 操作类型 | 路径 | 理由 |
|---|---|---|
| 只读（列表、详情） | Repository 直接查询 | 无状态变更，Rule Engine 无介入价值 |
| 写操作（创建、更新、删除、生命周期） | PrebuiltIntent → Nexus 链路 | 所有状态变更必须经过完整链路保证一致性 |

---

## 5. 影响范围

### 涉及文件（按 Phase 分组）

**Phase 1 — 新增**：
- `domains/habits/manifest.yaml`
- `domains/okrs/manifest.yaml`
- `domains/timebox/manifest.yaml`（升级）
- `domains/tasks/manifest.yaml`（升级）
- `domains/habits/hooks.ts`
- `domains/okrs/hooks.ts`
- `domains/tasks/hooks.ts`
- `domains/timebox/hooks.ts`
- `domains/registry.ts`

**Phase 1 — 修改**：
- `domains/habits/index.ts`（提取 hooks，仅保留入口导出）
- `domains/okrs/index.ts`
- `domains/tasks/index.ts`
- `domains/timebox/index.ts`

**Phase 2 — 修改**：
- `nexus/core/state-machine/index.ts`（通用化）
- `nexus/orchestrator/index.ts`（去领域化）

**Phase 2 — 删除**：
- `nexus/core/state-machine/transitions.ts`
- `nexus/core/intent-engine/habit-defaults.ts`

**Phase 2 — 修改**：
- `app/actions/intent.ts`（对接新 Orchestrator 入口）
- `app/actions/okr.ts`（对接新 Orchestrator 入口）
- `app/projects/actions.ts`（从直接 repo 调用改为 PrebuiltIntent）

**Phase 3 — 搬迁**（文件移动 + import 路径更新）：
- 9 个 Repository 文件
- 约 30 个 UI 组件文件
- 2 个 hooks 文件
- 所有引用这些文件的 import 路径

### 不涉及的文件

- 数据库 schema（`db/schema/`）不变
- USOM 类型定义（`usom/types/`）不变（除非发现新增需求）
- 系统级仓库（event、snapshot、signals 等）不变
- Drizzle 配置不变

---

## 6. 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| State Machine 通用化可能破坏 timebox 现有功能 | 先写测试覆盖现有 timebox 转换路径，通用化后回归验证 |
| Repository 搬迁涉及大量 import 变更 | 使用 IDE 重构工具（Find & Replace），搬迁后全量 lint |
| OKR KR 联动逻辑迁移到 onEvent 可能有时序问题 | 确保 onEvent 在 State Machine 成功后同步调用，不是异步 |
| 全面搬迁 UI 组件可能引入回归 | Phase 3 最后执行，搬迁后手动验证每个页面 |
| tasks 域从直接 repo 调用改为 Nexus 链路，行为可能变化 | 先确保 Nexus 链路对 tasks 域的 write 操作产生与当前等价的结果 |

---

## 7. 验证标准

### Phase 1 完成标准

- [ ] 四个域均有 manifest.yaml，包含六区块 A–F
- [ ] 四个域均有 hooks.ts，四个钩子为纯函数
- [ ] `domains/registry.ts` 注册四个域
- [ ] 转换表已从 Nexus 移到各域目录
- [ ] 现有功能无变化

### Phase 2 完成标准

- [ ] State Machine 不 import 任何具体 USOM 对象类型
- [ ] Orchestrator 无 `executeHabitIntent`、`executeOKRIntent` 方法
- [ ] Orchestrator 无 `toHabitAction`、`toOKRAction`、`toLifecycleAction` 函数
- [ ] 所有写操作通过 `executeIntent()` 统一入口
- [ ] tasks 域写操作走 Nexus 链路（不再直接 repo 调用）
- [ ] 现有功能无变化

### Phase 3 完成标准

- [ ] Repository 文件已搬迁到域目录
- [ ] UI 组件已搬迁到域 pages/components 目录
- [ ] `app/` 路由文件仅做薄壳导入
- [ ] `nexus/core/state-machine/transitions.ts` 已删除
- [ ] `npm run build` 通过
- [ ] 现有功能无变化
