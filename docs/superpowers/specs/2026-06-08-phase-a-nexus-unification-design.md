# 任务管理 Nexus 统一设计文档（Phase A / B / C）

> 版本: 2.0.0 | 日期: 2026-06-10 | 状态: Phase A ✅ / Phase B ✅ / Phase C ✅

## 1. 背景与动机

### 1.1 问题概述

当前项目中存在多处绕过 Nexus 链路直接操作 Repository 的违宪代码，违反宪章 Bridge Layer 约束 A（"所有外部写入 MUST 穿越完整 Nexus 链路"）和 Page Component Data Access Rules（"写操作必须走 PrebuiltIntent → Nexus chain"）。

具体违宪点：

| 位置 | 问题类型 | 严重程度 |
|---|---|---|
| `app/actions/tasks.ts` — 6 个写操作 | 完全绕过 Nexus，直接调 Repository | 🔴 高 |
| `domains/tasks/cnui/handlers.ts` — submit | 直接调 Repository + SystemEventRepository | 🔴 高 |
| `domains/habits/cnui/handlers.ts` — submit | 直接调 Repository + SystemEventRepository | 🔴 高 |
| `app/actions/intent.ts` — deleteHabit | 直接调 repo.delete()，绕过 Nexus | 🔴 高 |
| `app/actions/intent.ts` — 5 个 Habits 函数 | 独立构造 Orchestrator，Rule Engine 短路 pass | 🟡 中 |
| `executePipeline` — getRepo | 硬编码 timebox domain，多域意图会失败 | 🟡 中 |
| 任务树搜索 | 仅过滤已加载节点，无法搜索深层子任务 | 🟡 中 |

### 1.2 改造目标

1. **所有写操作统一走 `submitDynamicIntent` → `executePipeline` → Nexus 链路**
2. **消除 Habits server actions 中的重复 Orchestrator 构造**
3. **CNUI handler 的 submit 通过 `submitDynamicIntent` 走 Nexus**
4. **`executePipeline` 支持多域（tasks、habits、timebox）**
5. **任务树搜索支持深层子任务，展示完整祖先路径**

## 2. 架构设计

### 2.1 改造前后对比

```
改造前:
  TaskTreePage ──→ app/actions/tasks.ts ──→ TaskRepository（违宪）
  HabitListPage ──→ app/actions/intent.ts ──→ 独立构造 Orchestrator ×5
  CNUI handler ──→ Repository 直接写入（违宪）
  executePipeline ──→ getRepo 只认 timebox

改造后:
  所有页面写操作 ──→ submitDynamicIntent(domainId, action, fields)
  所有 CNUI submit ──→ submitDynamicIntent(domainId, action, fields)
                              │
                      executePipeline（多域 getRepo）
                              │
                      Domain Registry 动态查找
                      ┌───────┼───────┐
                     tasks   habits  timebox
```

### 2.2 executePipeline 多域扩展

**核心变更**：`getRepo` 工厂从硬编码改为 Domain Registry 动态查找。

```typescript
// app/actions/intent.ts — executePipeline 内部
getRepo: (domainId: string, objectType: string) => {
  const plugin = domainRegistry.find(p => p.manifest.domainId === domainId)
  if (!plugin) throw new Error(`未注册的域: ${domainId}`)
  const repo = plugin.getRepo(objectType)
  if (!repo) throw new Error(`域 ${domainId} 未提供 ${objectType} 的 Repository`)
  return repo
}
```

**前置条件**：每个 Domain Plugin 必须在注册时声明 `getRepo(objectType)` 工厂方法。需检查现有 `domains/registry.ts` 的 Plugin 接口是否已支持。

**ActionSurfaceEngine 改造**：从硬编码 `timeboxPlugin` 改为根据意图的 `targetDomain` 从 Registry 查找对应 Plugin。

**Rule Engine 改造**：不再短路返回 pass，而是真正调用目标域 hooks 的 onValidate。

**`IntentSubmissionResult` 扩展**：当前返回类型中的 `timeboxes: TimeboxSummary[]` 是面向 timebox 的。改造后需扩展为通用结果：

```typescript
export interface IntentSubmissionResult {
  success: boolean
  // 通用操作结果
  object?: unknown        // State Machine 返回的操作对象（Task/Habit/Timebox）
  // 领域特定结果（向后兼容）
  timeboxes: TimeboxSummary[]
  task?: Task             // 新增
  habit?: Habit           // 新增
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
  traceSession?: TraceSession
}
```

每个 server action 包装函数负责从 `object` 中提取并返回具体类型，保持对外签名不变。

### 2.3 Tasks Server Actions 迁移

**迁移原则**：写操作全部改为 `submitDynamicIntent`，读操作保留不变（宪章允许）。

**需要迁移的 6 个写操作**：

| 函数 | 迁移后调用 |
|---|---|
| `createTask(input)` | `submitDynamicIntent('tasks', 'createTask', input)` |
| `updateTask(taskId, input)` | `submitDynamicIntent('tasks', 'updateTask', { taskId, ...input })` |
| `updateTaskStatus(taskId, status)` | `submitDynamicIntent('tasks', action, { taskId, targetStatus: status })` |
| `completeTask(taskId, extraFields?)` | `submitDynamicIntent('tasks', 'completeTask', { taskId, ...extraFields })` |
| `archiveTask(taskId)` | `submitDynamicIntent('tasks', 'archiveTask', { taskId })` |
| `deleteTask(taskId)` | `submitDynamicIntent('tasks', 'deleteTask', { taskId })` |

**保持不变的读操作**：`getTasks`、`getTask`、`getSubtasks`、`getTaskAncestors`。

**改造后每个函数的典型代码**（从 ~15 行缩减到 ~5 行）：

```typescript
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const result = await submitDynamicIntent('tasks', 'createTask', input)
  if (!result.success) throw new Error(result.error)
  return result.task // 从 pipeline 结果中提取
}
```

### 2.4 Habits Server Actions 重复构造消除

**迁移原则**：5 个独立构造 Orchestrator 的函数 + 1 个 deleteHabit，统一改为 `submitDynamicIntent`。

| 函数 | 当前问题 | 迁移后 |
|---|---|---|
| `submitHabitIntent` | 独立构造 Orchestrator ~50行 | `submitDynamicIntent('habits', 'createHabit', input)` |
| `updateHabit` | 独立构造 Orchestrator ~50行 | `submitDynamicIntent('habits', 'updateHabit', { habitId, ...input })` |
| `updateHabitStatus` | 独立构造 Orchestrator ~50行 | `submitDynamicIntent('habits', actionMap[action], { habitId })` |
| `logHabit` | 独立构造 Orchestrator ~50行 | `submitDynamicIntent('habits', 'logHabit', { habitId, ...fields })` |
| `deleteHabit` | 直接调 repo.delete() | `submitDynamicIntent('habits', 'deleteHabit', { habitId })` |
| `batchLogHabits` | 循环调 logHabit | 保持不变（内部调已改造的 logHabit） |

**保持不变的读操作**：`getHabits`、`checkHabitReferences`。

### 2.5 CNUI Handler 迁移（Tasks + Habits 统一）

**迁移原则**：`submit` 方法改为调用 `submitDynamicIntent`，`open` 方法保持不变（只读）。

**Tasks CNUI handler 改造**（`domains/tasks/cnui/handlers.ts`）：

```typescript
// 改造前
async submit(action, fields) {
  const taskRepo = new TaskRepository()
  await taskRepo.save(...)  // 直接写入
}

// 改造后
async submit(action, fields) {
  const { submitDynamicIntent } = await import('@/app/actions/intent')
  const result = await submitDynamicIntent('tasks', action, fields)
  return { success: result.success, error: result.error }
}
```

**Habits CNUI handler 改造**（`domains/habits/cnui/handlers.ts`）同理。

**open 方法不变**：`open` 是纯读取操作（查询任务/习惯列表用于展示），可以直接调 Repository。

### 2.6 Manifest 补充

#### Tasks manifest 新增

```yaml
# 新增 intent_trigger
intent_triggers:
  # ... 现有 triggers 不变 ...

  - action: deleteTask
    shortcut: /deleteTask
    description: 删除任务（不可恢复）
    response_type: cnui
    cnui_surface: task-action-panel
    examples:
      - 删除这个任务
    keywords: [删除, delete]

# lifecycle 新增 delete 转换
lifecycle:
  task:
    transitions:
      # ... 现有 transitions 不变 ...
      - from: [todo, planned, in_progress, completed]
        to: deleted
        trigger: intent
        action: delete
        event_type: TaskDeleted
    terminal_states: [archived, deleted]
```

#### Habits manifest 新增

```yaml
# 新增 intent_trigger
intent_triggers:
  # ... 现有 triggers 不变 ...

  - action: deleteHabit
    shortcut: /deleteHabit
    description: 删除习惯（不可恢复）
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 删除这个习惯
    keywords: [删除, delete]

# lifecycle 新增 delete 转换
lifecycle:
  habit:
    transitions:
      # ... 现有 transitions 不变 ...
      - from: [draft, active, suspended]
        to: deleted
        trigger: intent
        action: delete
        event_type: HabitDeleted
    terminal_states: [archived, deleted]
```

### 2.7 任务搜索改进（[014]）

**当前问题**：`TaskTreeView` 中的 `filterTreeBySearch` 仅过滤已加载的树节点，无法搜索到未展开的子任务。

**改造方案**：

1. **Repository 新增方法**：

```typescript
// domains/tasks/repository/task.ts
async findMatchingWithAncestors(
  query: string,
  userId: USOM_ID,
  filters?: { threadId?: string; clarity?: string[]; status?: string[] }
): Promise<{
  matches: Task[]
  ancestorMap: Map<string, Task[]>  // taskId → 祖先链
}>
```

实现逻辑：
- 查询所有符合条件的任务（含深层子任务），对 title/description 做 LIKE 匹配
- 对每个匹配任务，沿 parentId 向上递归获取完整祖先链
- 返回匹配列表 + 祖先映射

2. **TaskTreeView 搜索模式改造**：

```typescript
// 搜索激活时
if (searchQuery.trim()) {
  // 调用 findMatchingWithAncestors 获取结果
  // 构建包含匹配节点的完整树，自动展开匹配路径
  // 非匹配但为祖先的节点以"路径"样式显示
}

// 搜索清空时
// 恢复懒加载模式
```

3. **UI 行为**：
   - 匹配的任务高亮显示
   - 匹配任务的祖先路径自动展开
   - 非主线筛选条件（clarity、status）仍然生效
   - 搜索结果中显示任务的完整上级路径（如 "主线A > 任务B > **匹配的子任务C**"）

## 3. 不变更的部分

以下组件/文件**不需要修改**：

| 类别 | 说明 |
|---|---|
| Nexus 核心组件 | Orchestrator、State Machine、Context Engine、Intent Engine 核心逻辑不变 |
| USOM 类型定义 | Task、Thread、Habit 等接口不变 |
| 数据库 Schema | 无新增表或字段 |
| Domain hooks | tasks/hooks.ts、habits/hooks.ts 的 onValidate、onEvent、onActionSurfaceRequest 逻辑不变 |
| Domain transitions | tasks/transitions.ts、habits/transitions.ts 的转换定义不变（manifest 新增 delete，但 transitions.ts 本身的 findTransition 逻辑不变） |
| 页面布局 | TaskTreePage、HabitListPage 的布局和交互流程不变 |
| 读操作 | 所有 get/find/query 类函数保持不变 |
| CNUI surface 组件 | TaskActionPanel、TaskCreationCard、TaskEditCard 等组件的 UI 不变 |

## 4. 实现计划概览

```
阶段 A 子任务:
├── A1: executePipeline 多域扩展
│   ├── A1.1: Domain Plugin 接口确认/补充 getRepo 方法
│   ├── A1.2: getRepo 改为 Registry 动态查找
│   ├── A1.3: ActionSurfaceEngine 多域支持
│   └── A1.4: Rule Engine 真正调用域 hooks onValidate
│
├── A2: Tasks server actions 迁移（6 个写操作）
│
├── A3: Habits server actions 重复构造消除（5 + 1 个函数）
│
├── A4: CNUI handler 迁移（Tasks + Habits）
│   ├── A4.1: tasks/cnui/handlers.ts submit → submitDynamicIntent
│   └── A4.2: habits/cnui/handlers.ts submit → submitDynamicIntent
│
├── A5: Manifest 补充
│   ├── A5.1: tasks manifest 新增 deleteTask
│   └── A5.2: habits manifest 新增 deleteHabit
│
└── A6: 搜索改进
    ├── A6.1: TaskRepository.findMatchingWithAncestors()
    └── A6.2: TaskTreeView 搜索模式改造
```

**建议执行顺序**：A1 → A5 → A2 → A3 → A4 → A6

- A1（管道扩展）是所有后续任务的基础
- A5（manifest 补充）在 A2/A3 之前，确保 lifecycle 定义就绪
- A2/A3/A4 可以并行但建议顺序执行，每完成一个域即验证
- A6（搜索）独立于其他任务，可最后执行

## 5. 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| submitDynamicIntent 返回类型与现有调用方不兼容 | 保留每个 server action 函数的签名不变，内部实现改为调 submitDynamicIntent + 结果转换 |
| delete 操作需补充 lifecycle，State Machine 需识别新状态 | 在 manifest 中声明 delete 转换，State Machine 通过 manifest lifecycle 泛化执行，无需改代码 |
| 搜索全量加载可能影响性能 | MVP 阶段任务量有限（<1000 条），内存过滤可接受；后续可加数据库层限制 |
| CNUI handler 改为异步导入 submitDynamicIntent | 使用 `await import()` 动态导入，避免循环依赖 |

## 6. Phase A 验收标准

1. ✅ `app/actions/tasks.ts` 中所有写操作通过 `submitDynamicIntent` 走 Nexus
2. ✅ `app/actions/intent.ts` 中 Habits 写操作无独立 Orchestrator 构造
3. ✅ `deleteHabit` 和 `deleteTask` 走 Nexus 链路
4. ✅ Tasks 和 Habits CNUI handler submit 通过 `submitDynamicIntent` 走 Nexus
5. ✅ `executePipeline` 的 `getRepo` 支持多域
6. ✅ Rule Engine 真正调用域 hooks onValidate（不再短路 pass）
7. ✅ 任务搜索可搜索深层子任务并展示祖先路径
8. ✅ 所有现有测试通过
9. ✅ 无 Nexus 核心组件（Orchestrator、State Machine、Rule Engine）的直接修改

---

# Phase B：Thread 写操作 Nexus 统一 + CNUI Surface 注册修复

> 版本: 1.0.0 | 日期: 2026-06-10（事后归档）| 状态: ✅ 已完成

## B.1 背景与动机

Phase A 完成了 Tasks/Habits 写操作统一走 Nexus 链路，但 Thread（主线）相关操作存在两个遗留问题：

1. **Thread 写操作未走 Nexus**：`createThread`、`promoteToThread` 等操作的 submit 路径仍直接调用 Repository
2. **CNUI Surface 注册缺失**：`register-client-surfaces.ts` 中只注册了部分 surface，导致 Thread 相关的 CNUI 界面无法渲染

## B.2 架构设计

### B.2.1 Thread 生命周期操作统一

在 `domains/tasks/cnui/handlers.ts` 中新增 Thread 专用的生命周期映射：

```typescript
/** 主线生命周期状态映射 — 用于查询对应状态的主线列表 */
const THREAD_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  pauseThread: 'active',
  resumeThread: 'paused',
  completeThread: 'active',
  archiveThread: 'completed',
}

/** 主线生命周期状态机动作映射 */
const THREAD_LIFECYCLE_SM_ACTION: Record<string, string> = {
  pauseThread: 'pause',
  resumeThread: 'resume',
  completeThread: 'complete',
  archiveThread: 'archive',
}
```

**submit() 分支设计**：

| 操作 | 路径 | 说明 |
|------|------|------|
| `promoteToThread` | 专用 server action | 多阶段编排（创建主线 + 关联任务），不走 SM 单步转换 |
| `createThread` | `submitDynamicIntent` | 标准 Nexus 链路 |
| `pauseThread` / `resumeThread` / `completeThread` / `archiveThread` | `submitDynamicIntent`（批量） | 支持 `selectedIds` 数组，逐个调用 |

批量操作模式：

```typescript
const threadActions = Object.keys(THREAD_LIFECYCLE_STATUS_MAP)
if (threadActions.includes(action) && fields.selectedIds) {
  const ids = fields.selectedIds as string[]
  for (const id of ids) {
    const r = await submitDynamicIntent('tasks', action, { threadId: id })
    if (!r.success) return { success: false, error: r.error ?? `${id} 操作失败` }
  }
  return { success: true, data: { selectedIds: ids } }
}
```

### B.2.2 CNUI Surface 注册补全

`register-client-surfaces.ts` 补注册 4 个缺失 surface：

| Surface 类型 | 组件 | Handler |
|-------------|------|---------|
| `thread-creation-card` | `ThreadCreationCard` | `taskCnuiHandler` |
| `thread-promote-card` | `ThreadPromoteCard` | `taskCnuiHandler` |
| `thread-action-panel` | `ThreadActionPanel` | `taskCnuiHandler` |
| `task-action-panel` | `TaskActionPanel` | `taskCnuiHandler` |

注册后 `surfaceHandlers` 映射覆盖所有 7 个 Tasks Domain surface：

```typescript
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
  'thread-creation-card': taskCnuiHandler,
  'thread-promote-card': taskCnuiHandler,
  'thread-action-panel': taskCnuiHandler,
  'task-split-card': taskCnuiHandler,
}
```

## B.3 影响的文件

| 文件 | 改动 |
|------|------|
| `domains/tasks/cnui/handlers.ts` | 新增 `THREAD_LIFECYCLE_STATUS_MAP`、`THREAD_LIFECYCLE_SM_ACTION`；`open()` 新增 Thread 生命周期分支；`submit()` 新增 Thread 批量操作 + `promoteToThread` 专用分支 |
| `domains/tasks/cnui/register-client-surfaces.ts` | 补注册 4 个缺失 surface |
| `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 多选 + 批量确认交互 |
| `domains/tasks/cnui/surfaces/ThreadCreationCard.tsx` | 自包含创建表单 |
| `domains/tasks/cnui/surfaces/ThreadPromoteCard.tsx` | 任务选择 + 提升确认 |

## B.4 验收标准

1. ✅ Thread 所有写操作（create/promote/pause/resume/complete/archive）走 `submitDynamicIntent`
2. ✅ Thread 生命周期操作支持批量（`selectedIds`）
3. ✅ 所有 7 个 Tasks Domain CNUI surface 已注册
4. ✅ `/createThread`、`/promoteToThread` 等命令在 AI 对话中正常工作

---

# Phase C：Task CNUI Surface 完善

> 版本: 1.0.0 | 日期: 2026-06-10（事后归档）| 状态: ✅ 已完成

## C.1 背景与动机

Phase B 完成了 Thread 操作统一和 surface 注册。但 Task 相关的 CNUI surface 仍存在功能缺陷：

| # | 问题 | 严重程度 |
|---|------|---------|
| C-1 | `deleteTask` 在 `TASK_LIFECYCLE_STATUS_MAP` 中无映射，handler 回退空响应 | 🔴 高 |
| C-2 | `refineTask` 在 manifest 有 trigger 但 handler `open()` 无分支 | 🟡 中 |
| C-3 | `TaskSplitCard` 返回 null，用户看到空白 | 🟡 中 |
| C-4 | CNUI 操作成功消息只有 habit 专属逻辑，task/thread 全部显示"操作成功！" | 🟡 中 |

## C.2 架构设计

### C.2.1 deleteTask 生命周期映射

`deleteTask` 的特殊性：不是查询单一状态，而是需要查询多个可删除状态的任务。

```typescript
/** 可删除的任务状态列表 */
const DELETABLE_TASK_STATUSES = ['todo', 'planned', 'in_progress', 'completed']

/** 任务生命周期状态机动作映射 */
const TASK_LIFECYCLE_SM_ACTION: Record<string, string> = {
  completeTask: 'complete',
  archiveTask: 'archive',
  deleteTask: 'delete',   // 新增
}
```

`open()` 中 `deleteTask` 分支：查询所有状态在 `DELETABLE_TASK_STATUSES` 中的任务，返回给 `TaskActionPanel`。

### C.2.2 refineTask handler 分支

`open()` 新增 `refineTask` 分支：查询 `clarity === 'fuzzy' || clarity === 'scoped'` 的任务，返回 `{ action: 'refine', items: fuzzyTasks }`。

`TaskActionPanel` 的 `ACTION_LABELS` 同步扩展：

```typescript
const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  complete: { title: '完成任务', button: '完成所选' },
  archive: { title: '归档任务', button: '归档所选' },
  delete: { title: '删除任务', button: '删除所选' },
  refine: { title: '细化任务', button: '细化所选' },
}
```

### C.2.3 TaskSplitCard 占位 UI

从返回 null 改为展示占位卡片：
- 显示可拆分的任务列表
- 提示"AI 拆分功能正在开发中"
- 提供关闭按钮
- `isDone` 状态显示"✅ 拆分请求已提交"

### C.2.4 CNUI 操作专属成功消息

`use-intent-handler.ts` 中将硬编码的 habit 逻辑改为通用的 action → message 映射：

```typescript
const cnuiActionMessages: Record<string, (d: Record<string, unknown>) => string> = {
  createHabit: (d) => { /* habit 专属 */ },
  createTask: (d) => { /* task 专属 */ },
  updateTask: () => '任务更新成功！',
  completeTask: (d) => `已完成 ${d?.selectedIds?.length ?? 1} 个任务`,
  archiveTask: (d) => `已归档 ${d?.selectedIds?.length ?? 1} 个任务`,
  deleteTask: (d) => `已删除 ${d?.selectedIds?.length ?? 1} 个任务`,
  createThread: (d) => { /* thread 专属 */ },
  promoteToThread: () => '任务已提升为主线！',
  pauseThread: (d) => `已暂停 ${d?.selectedIds?.length ?? 1} 条主线`,
  resumeThread: (d) => `已恢复 ${d?.selectedIds?.length ?? 1} 条主线`,
  completeThread: (d) => `已完成 ${d?.selectedIds?.length ?? 1} 条主线`,
  archiveThread: (d) => `已归档 ${d?.selectedIds?.length ?? 1} 条主线`,
  refineTask: () => '细化请求已提交，AI 将分析任务并给出建议',
  splitTask: () => '拆分请求已提交，AI 将分析任务并给出建议',
}
```

## C.3 影响的文件

| 文件 | 改动 |
|------|------|
| `domains/tasks/cnui/handlers.ts` | `open()` 新增 `deleteTask`/`refineTask`/`splitTask` 分支；新增 `DELETABLE_TASK_STATUSES` |
| `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | `ACTION_LABELS` 新增 `delete`/`refine` |
| `domains/tasks/cnui/surfaces/TaskSplitCard.tsx` | 从返回 null 改为占位 UI |
| `hooks/use-intent-handler.ts` | `handleCnuiConfirm` 改为通用 `cnuiActionMessages` 映射 |

## C.4 验收标准

1. ✅ `/deleteTask` 显示可删除任务列表，选择确认后通过 Nexus 删除
2. ✅ `/refineTask` 显示模糊任务列表
3. ✅ `/splitTask` 显示占位卡片而非空白
4. ✅ 所有 CNUI 操作有专属成功消息（非通用"操作成功！"）
5. ✅ `TaskActionPanel` 支持 complete / archive / delete / refine 四种操作

---

# 附录：三阶段演进总览

```
Phase A（基础设施）
  └─ Nexus 链路统一：所有写操作 → submitDynamicIntent → executePipeline
  └─ executePipeline 多域扩展：getRepo 从硬编码改为 Registry 动态查找
  └─ 任务搜索改进：深层子任务搜索 + 祖先路径

Phase B（Thread 统一）
  └─ Thread 写操作走 submitDynamicIntent（含批量操作支持）
  └─ CNUI Surface 注册补全（7 个 Tasks Domain surface）
  └─ ThreadActionPanel / ThreadCreationCard / ThreadPromoteCard 交互完善

Phase C（Surface 完善）
  └─ deleteTask / refineTask / splitTask handler 分支补全
  └─ TaskActionPanel 扩展至 4 种操作
  └─ TaskSplitCard 占位 UI
  └─ 通用成功消息映射（cnuiActionMessages）
```
