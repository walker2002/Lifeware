# 任务管理 Nexus 统一实施计划（Phase A / B / C）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三阶段完成 Tasks Domain 的 Nexus 链路统一和 CNUI Surface 完善。Phase A 消除违宪写入 + 搜索改进；Phase B 统一 Thread 写操作 + Surface 注册修复；Phase C 完善 Task Surface 交互和消息。

**Architecture:** 改造 `executePipeline` 的 `getRepo` 工厂从硬编码改为 Registry 动态查找。所有写操作统一通过 `submitDynamicIntent` → `executePipeline`。CNUI Surface 通过注册中心管理。

**Tech Stack:** Next.js Server Actions, Drizzle ORM, Domain Plugin Registry, CN-UI Protocol

**Architecture:** 改造 `executePipeline` 的 `getRepo` 工厂从硬编码 timebox 改为通过 Domain Registry 动态查找。所有 Tasks/Habits 写操作和 CNUI handler submit 方法统一改为调用 `submitDynamicIntent`。Manifest 新增 delete 相关 lifecycle 定义。搜索通过新增 Repository 方法实现全量匹配 + 祖先路径构建。

**Tech Stack:** Next.js Server Actions, Drizzle ORM, Domain Plugin Registry, CN-UI Protocol

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|---|---|
| 无 | 本次改造仅修改现有文件 |

### 修改文件
| 文件 | 改动内容 |
|---|---|
| `frontend/src/app/actions/intent.ts` | 扩展 `IntentSubmissionResult`；改造 `executePipeline` 的 `getRepo` 多域支持；改造 `ActionSurfaceEngine` 多域；消除 5 个 Habits 独立 Orchestrator 构造 + `deleteHabit` 直接 repo 调用 |
| `frontend/src/app/actions/tasks.ts` | 6 个写操作迁移为调 `submitDynamicIntent` |
| `frontend/src/domains/tasks/cnui/handlers.ts` | `submit` 方法改为调 `submitDynamicIntent` |
| `frontend/src/domains/habits/cnui/handlers.ts` | `submit` 方法改为调 `submitDynamicIntent` |
| `frontend/src/domains/tasks/manifest.yaml` | 新增 `deleteTask` intent_trigger + lifecycle transition |
| `frontend/src/domains/habits/manifest.yaml` | 新增 `deleteHabit` intent_trigger + lifecycle transition |
| `frontend/src/domains/tasks/repository/task.ts` | 新增 `findMatchingWithAncestors` 方法 |
| `frontend/src/domains/tasks/components/task-tree-view.tsx` | 搜索模式改造，支持深层搜索 + 祖先路径展示 |

### 修改文件（补充）
| 文件 | 改动内容 |
|---|---|
| `frontend/src/usom/types/primitives.ts` | `TaskStatus` 和 `HabitStatus` 新增 `deleted` 值 |
| `frontend/src/domains/tasks/transitions.ts` | `taskTransitions` 新增 delete 转换行 |
| `frontend/src/domains/habits/transitions.ts` | `habitTransitions` 新增 delete 转换行 |

**⚠️ 行为变更说明**：`deleteTask`/`deleteHabit` 从**硬删除**（`repo.delete()`）变为**软删除**（`status = 'deleted'`）。这实际上是更好的行为——用户误操作可恢复。所有现有查询（`findActive`、`findByStatus` 等）只查特定状态，不会返回 `deleted` 状态的任务/习惯。

### 不变文件
| 文件 | 原因 |
|---|---|
| `nexus/orchestrator/index.ts` | Orchestrator 核心逻辑不变 |
| `nexus/core/rule-engine/` | Rule Engine 本身不变，只是不再短路 pass |
| `domains/tasks/hooks.ts` | Hooks 逻辑不变 |
| 数据库 Schema | `status` 列为 VARCHAR，无需 migration 即可存储 `'deleted'` |

---

## Task 1: Manifest 补充（A5）

> 前置条件：无。先补齐 manifest，后续任务才能引用新的 lifecycle 定义。

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`
- Modify: `frontend/src/domains/habits/manifest.yaml`

### 1.1 Tasks manifest 新增 deleteTask

- [ ] **Step 1: 在 `intent_triggers` 区块末尾（`viewTaskTree` 之前）新增 `deleteTask` trigger**

在 `frontend/src/domains/tasks/manifest.yaml` 的 `intent_triggers` 区块，在 `archiveTask` 和 `viewTaskTree` 之间插入：

```yaml
  - action: deleteTask
    shortcut: /deleteTask
    description: 删除任务（不可恢复）
    response_type: cnui
    cnui_surface: task-action-panel
    examples:
      - 删除这个任务
    keywords: [删除, delete]
```

- [ ] **Step 2: 在 `lifecycle.task.transitions` 末尾新增 delete 转换**

在 `tasks` manifest 的 `lifecycle.task.transitions` 数组末尾追加，并更新 `terminal_states`：

```yaml
      - from: [todo, planned, in_progress, completed]
        to: deleted
        trigger: intent
        action: delete
        event_type: TaskDeleted
```

将 `terminal_states` 从 `[archived]` 改为 `[archived, deleted]`。

- [ ] **Step 3: 在 `subscribed_events` 新增 TaskDeleted**

```yaml
  - TaskDeleted
```

- [ ] **Step 4: 验证 YAML 格式正确**

Run: `cd frontend && npx yaml-lint src/domains/tasks/manifest.yaml || node -e "require('js-yaml').load(require('fs').readFileSync('src/domains/tasks/manifest.yaml','utf8')); console.log('YAML OK')"`

预期: `YAML OK`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "feat(tasks): manifest 新增 deleteTask intent_trigger + lifecycle + subscribed_event"
```

### 1.1b: USOM 类型更新 — 新增 `deleted` 状态

> 必须在 manifest 之后、server actions 迁移之前完成。SM 会通过 lifecycle 定义将 delete 映射为 `updateStatus(id, 'deleted')`，因此类型必须先就绪。

- [ ] **Step 5b.1: 在 `TaskStatus` 和 `HabitStatus` 中新增 `deleted`**

在 `frontend/src/usom/types/primitives.ts` 中：

```typescript
// 将
export type TaskStatus = 'todo' | 'planned' | 'in_progress' | 'completed' | 'archived'
// 改为
export type TaskStatus = 'todo' | 'planned' | 'in_progress' | 'completed' | 'archived' | 'deleted'
```

```typescript
// 将
export type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived'
// 改为
export type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived' | 'deleted'
```

- [ ] **Step 5b.2: 在 `taskTransitions` 中新增 delete 转换**

在 `frontend/src/domains/tasks/transitions.ts` 的 `taskTransitions` 数组末尾追加：

```typescript
  { from: 'todo',        to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'planned',     to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'in_progress', to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
  { from: 'completed',   to: 'deleted', action: 'delete',  eventType: 'TaskDeleted' },
```

- [ ] **Step 5b.3: 在 `habitTransitions` 中新增 delete 转换**

在 `frontend/src/domains/habits/transitions.ts` 的 `habitTransitions` 数组末尾追加：

```typescript
  { from: 'draft',     to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
  { from: 'active',    to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
  { from: 'suspended', to: 'deleted', action: 'delete', eventType: 'HabitDeleted' },
```

- [ ] **Step 5b.4: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 5b.5: Commit**

```bash
git add frontend/src/usom/types/primitives.ts frontend/src/domains/tasks/transitions.ts frontend/src/domains/habits/transitions.ts
git commit -m "feat: USOM TaskStatus/HabitStatus 新增 deleted 状态 + transitions 表新增 delete 转换"
```

### 1.2 Habits manifest 新增 deleteHabit

- [ ] **Step 6: 在 `intent_triggers` 区块新增 `deleteHabit` trigger**

在 `frontend/src/domains/habits/manifest.yaml` 的 `intent_triggers` 区块，在 `logHabit` 和 `view_list` 之间插入：

```yaml
  - action: deleteHabit
    shortcut: /deleteHabit
    description: 删除习惯（不可恢复）
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 删除这个习惯
    keywords: [删除, delete]
```

- [ ] **Step 7: 在 `lifecycle.habit.transitions` 末尾新增 delete 转换，更新 terminal_states**

在 habits manifest 的 `lifecycle.habit.transitions` 末尾追加：

```yaml
      - from: [draft, active, suspended]
        to: deleted
        trigger: intent
        action: delete
        event_type: HabitDeleted
```

将 `terminal_states` 从 `[archived]` 改为 `[archived, deleted]`。

- [ ] **Step 8: 在 `subscribed_events` 新增 HabitDeleted**

```yaml
  - HabitDeleted
```

- [ ] **Step 9: 验证 YAML 格式正确**

Run: `cd frontend && npx yaml-lint src/domains/habits/manifest.yaml || node -e "require('js-yaml').load(require('fs').readFileSync('src/domains/habits/manifest.yaml','utf8')); console.log('YAML OK')"`

预期: `YAML OK`

- [ ] **Step 10: Commit**

```bash
git add frontend/src/domains/habits/manifest.yaml
git commit -m "feat(habits): manifest 新增 deleteHabit intent_trigger + lifecycle + subscribed_event"
```

---

## Task 2: executePipeline 多域扩展（A1）

> 前置条件：Task 1 完成（manifest 需就绪）。这是所有后续迁移的基础。

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`

### 2.1 扩展 IntentSubmissionResult 类型

- [ ] **Step 1: 在 `IntentSubmissionResult` 接口中新增通用字段**

在 `frontend/src/app/actions/intent.ts` 的 `IntentSubmissionResult` 接口（约 line 65）中，在 `timeboxes` 之后新增：

```typescript
export interface IntentSubmissionResult {
  /** 提交是否成功 */
  success: boolean;
  /** 最新的时间盒列表（供前端刷新） */
  timeboxes: TimeboxSummary[];
  /** State Machine 返回的操作对象（Task/Habit/Timebox 等） */
  object?: unknown;
  /** 任务对象（从 object 中提取，方便 tasks server action 使用） */
  task?: import("@/usom/types/objects").Task;
  /** 习惯对象（从 object 中提取，方便 habits server action 使用） */
  habit?: import("@/usom/types/objects").Habit;
  /** 动作面（Action Surface Engine 生成） */
  actionSurface?: ActionSurface;
  /** 错误信息 */
  error?: string;
  /** 规则引擎的警告 */
  warnings?: string[];
  /** 是否需要用户确认 */
  needsConfirmation?: boolean;
  /** 确认提示消息 */
  confirmationMessage?: string;
  /** 追踪会话（仅当 TraceConfig.enabled 时） */
  traceSession?: TraceSession;
}
```

### 2.2 改造 executePipeline 的 getRepo 为多域动态查找

- [ ] **Step 2: 在文件顶部新增 import**

在 `intent.ts` 的 import 区块（约 line 37 附近）新增：

```typescript
import { createTasksGenericRepo } from "@/domains/tasks/repository/generic-repo-adapter";
import { TaskRepository } from "@/domains/tasks/repository/task";
import { ThreadRepository } from "@/domains/tasks/repository/thread";
import { tasksPlugin } from "../../domains/tasks";
import { habitsPlugin } from "../../domains/habits";
```

- [ ] **Step 3: 替换 `executePipeline` 中的 getRepo 实现**

找到 `executePipeline` 函数中 `getRepo` 的定义（约 line 201-208），将：

```typescript
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'timebox') {
          const repo = timeboxRepos[objectType]
          if (!repo) throw new Error(`未找到 Timebox repo: ${objectType}`)
          return repo
        }
        throw new Error(`getRepo: 不支持的域 ${domainId}`)
      },
```

替换为：

```typescript
      getRepo: (domainId: string, objectType: string) => {
        // Timebox 域
        if (domainId === 'timebox') {
          const repo = timeboxRepos[objectType]
          if (!repo) throw new Error(`未找到 Timebox repo: ${objectType}`)
          return repo
        }
        // Tasks 域
        if (domainId === 'tasks') {
          const taskRepo = new TaskRepository()
          const threadRepo = new ThreadRepository()
          const tasksRepos = createTasksGenericRepo({
            taskRepo: taskRepo as any,
            threadRepo: threadRepo as any,
          })
          const repo = tasksRepos[objectType]
          if (!repo) throw new Error(`未找到 Tasks repo: ${objectType}`)
          return repo
        }
        // Habits 域
        if (domainId === 'habits') {
          const habitRepo = new HabitRepository()
          const habitsRepos = createHabitsGenericRepo({
            habitRepo: habitRepo as any,
            habitLogRepo: undefined as any,
          })
          const repo = habitsRepos[objectType]
          if (!repo) throw new Error(`未找到 Habits repo: ${objectType}`)
          return repo
        }
        throw new Error(`getRepo: 不支持的域 ${domainId}`)
      },
```

**注意**：当前每次调用 `getRepo` 都会 new Repository 实例。这在 MVP 阶段可接受（每次 intent 执行调 getRepo 1-2 次），后续可优化为缓存。

- [ ] **Step 4: 替换 `actionSurfaceEngine` 为多域支持**

找到 `createActionSurfaceEngine(timeboxPlugin)` 调用（约 line 200），替换为根据 intent 的 `targetDomain` 动态查找：

```typescript
      actionSurfaceEngine: (() => {
        // 从 parseResult 中提取目标域
        const targetDomain = parseResult.intent?.targetDomain ?? 'timebox'
        const plugin = targetDomain === 'tasks' ? tasksPlugin
          : targetDomain === 'habits' ? habitsPlugin
          : timeboxPlugin
        return createActionSurfaceEngine(plugin)
      })(),
```

- [ ] **Step 5: 在 executePipeline 返回结果中携带 `object`**

在 `executePipeline` 成功返回处（约 line 237），将：

```typescript
    return {
      success: true,
      timeboxes,
      actionSurface: result.actionSurface,
      warnings: result.warnings,
      traceSession: logger?.getSessions()[0],
    };
```

改为：

```typescript
    return {
      success: true,
      timeboxes,
      object: result.object,
      actionSurface: result.actionSurface,
      warnings: result.warnings,
      traceSession: logger?.getSessions()[0],
    };
```

- [ ] **Step 6: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

预期: 无类型错误（或仅有预存的无关错误）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "refactor(nexus): executePipeline 多域扩展 — getRepo/tasks/habits + actionSurfaceEngine 动态查找 + IntentSubmissionResult 通用 object 字段"
```

---

## Task 3: Habits Server Actions 迁移（A3）

> 前置条件：Task 2 完成。消除 5 个独立 Orchestrator 构造 + deleteHabit 直接 repo 调用。

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`（Habits Server Actions 区块，约 line 622-946）

### 3.1 迁移 submitHabitIntent

- [ ] **Step 1: 将 `submitHabitIntent` 函数体替换为调 `submitDynamicIntent`**

找到 `submitHabitIntent` 函数（约 line 651-708），替换整个函数体为：

```typescript
/** 创建新习惯 */
export async function submitHabitIntent(
  input: CreateHabitInput,
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'createHabit', { ...input })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.CREATE_FAILED;
    return { success: false, error: message };
  }
}
```

### 3.2 迁移 updateHabitStatus

- [ ] **Step 2: 将 `updateHabitStatus` 函数体替换**

找到 `updateHabitStatus` 函数（约 line 711-773），替换整个函数体为：

```typescript
/** 更新习惯状态（暂停/恢复/归档） */
export async function updateHabitStatus(
  habitId: string,
  action: "activate" | "suspend" | "reactivate" | "archive",
): Promise<HabitActionResult> {
  try {
    const actionMap: Record<string, string> = {
      activate: "activateHabit",
      suspend: "suspendHabit",
      reactivate: "reactivateHabit",
      archive: "archiveHabit",
    }
    const result = await submitDynamicIntent('habits', actionMap[action], { habitId })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.STATUS_UPDATE_FAILED;
    return { success: false, error: message };
  }
}
```

### 3.3 迁移 deleteHabit

- [ ] **Step 3: 将 `deleteHabit` 函数体替换**

找到 `deleteHabit` 函数（约 line 776-787），替换整个函数体为：

```typescript
/** 删除习惯 */
export async function deleteHabit(
  habitId: string,
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'deleteHabit', { habitId })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.DELETE_FAILED;
    return { success: false, error: message };
  }
}
```

### 3.4 迁移 logHabit

- [ ] **Step 4: 将 `logHabit` 函数体替换**

找到 `logHabit` 函数（约 line 804-865），替换整个函数体为：

```typescript
/** 记录习惯打卡 */
export async function logHabit(
  habitId: string,
  fields?: {
    actualDuration?: number
    completionRating?: number
    energyLevel?: number
    note?: string
  },
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'logHabit', { habitId, ...fields })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '打卡失败' }
  }
}
```

### 3.5 保留 updateHabit（字段更新不走 SM）

- [ ] **Step 5: 保留 `updateHabit` 函数，仅更新注释**

与 Tasks 的 `updateTask` 同理，`updateHabit` 是字段更新而非状态转换。SM 不支持字段更新。保留现有的独立 Orchestrator 构造，仅更新注释说明原因：

将 `updateHabit` 函数的注释更新为：

```typescript
/**
 * 更新习惯信息
 *
 * 注意：SM 只支持 create/updateStatus，不支持字段更新。
 * 保留独立 Orchestrator 构造。待 SM 扩展后可迁移至 submitDynamicIntent。
 *
 * @param habitId - 习惯 ID
 * @param input - 更新数据
 * @returns 操作结果
 */
```

函数体不变。

### 3.6 清理未使用的 import

- [ ] **Step 6: 移除 Habits 区块不再需要的 import 和函数**

检查以下 import 是否仍有其他函数使用：
- `createHabitsGenericRepo` — 如果所有 Habits 函数都已迁移，此 import 可移除
- `createOrchestrator` — 检查是否还有其他地方使用（template 部分仍在用），保留

**注意**：`createHabitsGenericRepo` 在 `executePipeline` 的 getRepo 中已直接导入使用，但 Habits Server Actions 区块中的导入是独立引用。如果该区块不再使用，移除区块内的 `import` 即可。但这里 `createHabitsGenericRepo` 在顶部 import（line 25），如果在文件其他位置仍有引用则保留。

实际上 `createHabitsGenericRepo` 在 line 25 全局导入，在 Habits 函数中已被引用。迁移后这些 Habits 函数不再需要它。但 `executePipeline` 的 getRepo（Task 2 中已添加）不使用此全局 import（它内联 new 了 Repo），所以如果 template 部分也没有使用，可以安全移除。

检查 `applyTemplate` 函数（约 line 1054）——它不使用 `createHabitsGenericRepo`。

所以可以安全移除 line 25 的 `import { createHabitsGenericRepo } from "@/domains/habits/repository/generic-repo-adapter"`。

同理检查 `createOrchestrator`：`applyTemplate` 仍在使用，保留。

- [ ] **Step 7: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 8: 手动烟雾测试**

Run: `cd frontend && npm run dev`

在浏览器中访问 `/habits`，测试：
1. 创建一个新习惯 → 应成功
2. 激活该习惯 → 应成功
3. 打卡该习惯 → 应成功
4. 删除该习惯 → 应成功（走新 Nexus 链路）

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "refactor(habits): 5+1 server actions 迁移至 submitDynamicIntent — 消除独立 Orchestrator 构造 + deleteHabit 走 Nexus"
```

---

## Task 4: Tasks Server Actions 迁移（A2）

> 前置条件：Task 2 完成。将写操作改为走 Nexus。
>
> **重要说明**：`updateTask`（字段更新）保留为直接 repo 调用。原因：SM 只支持 `create` 和 `updateStatus`，不支持任意字段更新。字段更新不是状态转换，不需要 lifecycle 验证。保留 TODO 标记，待 SM 扩展字段更新能力后迁移。

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts`

### 4.1 添加 import

- [ ] **Step 1: 在文件顶部添加 `submitDynamicIntent` 的导入**

在 `frontend/src/app/actions/tasks.ts` 的 import 区块末尾添加：

```typescript
import { submitDynamicIntent } from './intent'
```

### 4.2 迁移 createTask

- [ ] **Step 2: 替换 `createTask` 函数**

找到 `createTask` 函数（约 line 78-88），替换为：

```typescript
/**
 * 创建新任务（通过 Nexus 链路）
 * @param input - 创建输入
 * @returns 新创建的任务
 */
export async function createTask(input: CreateTaskInput & { title: string }): Promise<Task> {
  const result = await submitDynamicIntent('tasks', 'createTask', input)
  if (!result.success) {
    throw new Error(result.error ?? '创建任务失败')
  }
  return result.object as Task
}
```

### 4.3 保留 updateTask（字段更新不走 SM）

- [ ] **Step 3: 保留 `updateTask` 函数不变，仅更新注释**

`updateTask` 保留直接 repo 调用。将注释更新为说明原因：

```typescript
/**
 * 更新任务字段（直接 repo 调用）
 *
 * 注意：SM 只支持 create/updateStatus，不支持字段更新。
 * 字段更新不是状态转换，保留直接 repo 调用。
 * TODO: 待 SM 扩展字段更新能力后迁移至 Nexus 链路。
 *
 * @param taskId - 任务 ID
 * @param input - 更新数据
 * @returns 更新后的任务
 */
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const repo = new TaskRepository()
  return repo.update(taskId as USOM_ID, input, MVP_USER_ID as USOM_ID)
}
```

### 4.4 迁移 updateTaskStatus

- [ ] **Step 4: 替换 `updateTaskStatus` 函数**

找到 `updateTaskStatus` 函数（约 line 108-111），替换为：

```typescript
/**
 * 更新任务状态（通过 Nexus 链路）
 *
 * 将目标状态映射为 manifest lifecycle action：
 * - planned → planTask (SM action: plan)
 * - in_progress → startTask (SM action: start)
 * - completed → completeTask (SM action: complete)
 * - archived → archiveTask (SM action: archive)
 * - deleted → deleteTask (SM action: delete)
 *
 * @param taskId - 任务 ID
 * @param status - 新状态
 * @returns 更新后的任务
 */
export async function updateTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
  const STATUS_TO_ACTION: Record<string, string> = {
    planned: 'planTask',
    in_progress: 'startTask',
    completed: 'completeTask',
    archived: 'archiveTask',
    deleted: 'deleteTask',
  }
  const action = STATUS_TO_ACTION[status]
  if (!action) {
    throw new Error(`不支持的目标状态: ${status}`)
  }
  const result = await submitDynamicIntent('tasks', action, { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '状态更新失败')
  }
  return result.object as Task
}
```

### 4.5 迁移 completeTask

- [ ] **Step 5: 替换 `completeTask` 函数**

找到 `completeTask` 函数（约 line 139-146），替换为：

```typescript
/**
 * 完成任务：通过 Nexus 链路执行状态转换
 * @param taskId - 任务 ID
 * @param extraFields - 额外字段（actualDuration, notes 等）
 * @returns 更新后的任务
 */
export async function completeTask(taskId: string, extraFields?: Record<string, unknown>): Promise<Task> {
  const fields: Record<string, unknown> = { taskId }
  if (extraFields && Object.keys(extraFields).length > 0) {
    Object.assign(fields, extraFields)
  }
  const result = await submitDynamicIntent('tasks', 'completeTask', fields)
  if (!result.success) {
    throw new Error(result.error ?? '完成任务失败')
  }
  return result.object as Task
}
```

### 4.6 迁移 archiveTask

- [ ] **Step 6: 替换 `archiveTask` 函数**

找到 `archiveTask` 函数（约 line 118-121），替换为：

```typescript
/**
 * 归档任务（通过 Nexus 链路）
 * @param taskId - 任务 ID
 */
export async function archiveTask(taskId: string): Promise<void> {
  const result = await submitDynamicIntent('tasks', 'archiveTask', { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '归档任务失败')
  }
}
```

### 4.7 迁移 deleteTask

- [ ] **Step 7: 替换 `deleteTask` 函数**

找到 `deleteTask` 函数（约 line 128-131），替换为：

```typescript
/**
 * 删除任务（通过 Nexus 链路，软删除 → status = 'deleted'）
 *
 * 注意：删除操作走 SM lifecycle 转换，将 status 设为 'deleted'（非硬删除）。
 * deleted 状态的任务不会出现在任何常规查询中。
 * @param taskId - 任务 ID
 */
export async function deleteTask(taskId: string): Promise<void> {
  const result = await submitDynamicIntent('tasks', 'deleteTask', { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '删除任务失败')
  }
}
```

### 4.8 验证

- [ ] **Step 8: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 9: 手动烟雾测试**

Run: `cd frontend && npm run dev`

在浏览器中访问 `/tasks`，测试：
1. 创建一个新任务 → 应成功
2. 修改任务标题 → 应成功
3. 点击"开始"按钮（状态变 in_progress）→ 应成功
4. 点击"完成"按钮 → 应成功
5. 点击"归档"按钮 → 应成功

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/actions/tasks.ts
git commit -m "refactor(tasks): 6 个写操作迁移至 submitDynamicIntent — 走完整 Nexus 链路"
```

---

## Task 5: CNUI Handler 迁移（A4）

> 前置条件：Task 2 完成。CNUI handler 的 submit 方法改为调 `submitDynamicIntent`。

### 5.1 Tasks CNUI Handler 迁移

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/handlers.ts`

- [ ] **Step 1: 移除直接 repo import，添加 submitDynamicIntent 导入**

将文件顶部的：

```typescript
import { TaskRepository } from '@/domains/tasks/repository/task'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { taskTransitions, findTransition } from '@/domains/tasks/transitions'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'
```

替换为：

```typescript
import { TaskRepository } from '@/domains/tasks/repository/task'
import type { USOM_ID } from '@/usom/types/primitives'
```

（移除 `SystemEventRepository`、`taskTransitions`、`findTransition`、`Timestamp`、`SystemEvent`、`SystemEventType` 的导入，因为 submit 方法不再直接使用它们。保留 `TaskRepository` 因为 `open` 方法仍需查询。）

- [ ] **Step 2: 替换 `submit` 方法整体实现**

将 `taskCnuiHandler` 对象的 `submit` 方法（约 line 94-224）整体替换为：

```typescript
  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    try {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const result = await submitDynamicIntent('tasks', action, fields)
      return { success: result.success, error: result.error }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      return { success: false, error: msg }
    }
  },
```

**注意**：使用 `await import()` 动态导入避免循环依赖（handlers.ts → intent.ts → handlers.ts）。

- [ ] **Step 3: 移除 submit 方法不再需要的辅助常量**

移除 `LIFECYCLE_STATUS_MAP` 和 `LIFECYCLE_SM_ACTION` 常量（它们只在 submit 方法中使用，open 方法不使用它们）。同时移除 `MVP_USER_ID` 常量（open 方法中的 `getTasksByStatus` 和 `getActiveTasks` 函数仍需要它——保留）。

实际上检查一下：`getTasksByStatus` 和 `getActiveTasks` 仍使用 `MVP_USER_ID`。保留该常量。

最终 `submit` 不再使用 `LIFECYCLE_STATUS_MAP` 和 `LIFECYCLE_SM_ACTION`，可以移除：

```typescript
// 移除以下两个常量：
// const LIFECYCLE_STATUS_MAP: Record<string, string> = { ... }
// const LIFECYCLE_SM_ACTION: Record<string, string> = { ... }
```

- [ ] **Step 4: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "refactor(tasks): CNUI handler submit 迁移至 submitDynamicIntent — 不再直接调 Repository"
```

### 5.2 Habits CNUI Handler 迁移

**Files:**
- Modify: `frontend/src/domains/habits/cnui/handlers.ts`

- [ ] **Step 6: 移除 submit 不再需要的 import**

将文件顶部的：

```typescript
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { validateHabitFields } from '@/domains/habits/validation'
import { habitTransitions, findTransition } from '@/domains/habits/transitions'
import type { CreateHabitInput } from '@/usom/interfaces/irepository'
import type { Habit, HabitFrequency } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'
```

替换为：

```typescript
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { Habit } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
```

（保留 `HabitRepository`、`HabitLogRepository` 因为 `open` 方法中的 `getItemsByStatus` 和 `getTrackableHabits` 仍使用它们。移除 submit 专用导入。）

- [ ] **Step 7: 替换 `submit` 方法整体实现**

将 `habitCnuiHandler` 对象的 `submit` 方法整体替换为：

```typescript
  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    try {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const result = await submitDynamicIntent('habits', action, fields)
      return { success: result.success, error: result.error }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      return { success: false, error: msg }
    }
  },
```

- [ ] **Step 8: 移除 submit 不再需要的辅助常量**

移除以下不再需要的常量：

```typescript
// 移除：
// const LIFECYCLE_STATUS_MAP: Record<string, string> = { ... }
// const LIFECYCLE_SM_ACTION: Record<string, string> = { ... }
```

以及 `getChineseActionLabel` 函数（仅在 lifecycle submit 中使用，open 方法不使用）。

**保留**：`getItemsByStatus` 和 `getTrackableHabits`（open 方法仍使用）。

- [ ] **Step 9: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 10: 手动烟雾测试 — CNUI 路径**

在浏览器中通过 AI 助手发送：
1. "创建一个新任务叫测试任务" → CNUI 面板应弹出，填写后提交应成功
2. "创建一个新习惯叫测试习惯" → 同上
3. "完成测试任务" → CNUI 面板弹出，选择任务后提交应成功

- [ ] **Step 11: Commit**

```bash
git add frontend/src/domains/habits/cnui/handlers.ts
git commit -m "refactor(habits): CNUI handler submit 迁移至 submitDynamicIntent — 不再直接调 Repository"
```

---

## Task 6: 任务搜索改进（A6）

> 前置条件：无（独立于其他任务）。可与其他任务并行执行。

### 6.1 新增 TaskRepository.findMatchingWithAncestors 方法

**Files:**
- Modify: `frontend/src/domains/tasks/repository/task.ts`

- [ ] **Step 1: 在 `TaskRepository` 类中新增 `findMatchingWithAncestors` 方法**

在 `TaskRepository` 类的查询方法区块末尾（`getChildCounts` 方法之后），新增：

```typescript
  /**
   * 搜索匹配查询的任务，并构建祖先链
   * 
   * 对 title/description 做 ILIKE 匹配，返回匹配结果及其完整祖先路径。
   * 用于任务树搜索模式。
   * 
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @param filters - 额外筛选条件
   * @returns 匹配任务列表 + 祖先映射（taskId → 祖先链，从最近父级到根级）
   */
  async findMatchingWithAncestors(
    query: string,
    userId: USOM_ID,
    filters?: { threadId?: string; clarity?: string[]; status?: string[] },
  ): Promise<{
    matches: Task[]
    ancestorMap: Map<string, Task[]>
  }> {
    const conditions = [
      eq(s.tasks.userId, userId),
      sql`(${s.tasks.title} ILIKE ${`%${query}%`} OR ${s.tasks.description} ILIKE ${`%${query}%`})`,
    ]

    if (filters?.threadId) {
      conditions.push(eq(s.tasks.threadId, filters.threadId))
    }
    if (filters?.clarity?.length) {
      conditions.push(inArray(s.tasks.clarity, filters.clarity))
    }
    if (filters?.status?.length) {
      conditions.push(inArray(s.tasks.status, filters.status))
    }

    const rows = await db.select().from(s.tasks)
      .where(and(...conditions))
    const matches = rows.map(r => taskRowToUSOM(r as any))

    // 构建祖先映射
    const ancestorMap = new Map<string, Task[]>()
    const loadedTasks = new Map<string, Task>()

    // 先加载所有匹配任务的祖先链
    for (const match of matches) {
      const ancestors: Task[] = []
      let currentParentId = match.parentId

      for (let i = 0; i < 10 && currentParentId; i++) {
        // 优先从缓存取
        let parent = loadedTasks.get(currentParentId)
        if (!parent) {
          parent = await this.findById(currentParentId as USOM_ID, userId)
          if (parent) loadedTasks.set(currentParentId, parent)
        }
        if (!parent) break
        ancestors.push(parent)
        currentParentId = parent.parentId
      }

      ancestorMap.set(match.id, ancestors)
    }

    return { matches, ancestorMap }
  }
```

需要在文件顶部确认已有 `sql` 的导入。检查 line 3 的 import：

```typescript
import { eq, and, isNull, inArray, gte, lte, sql } from 'drizzle-orm'
```

`sql` 已导入。

- [ ] **Step 2: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/repository/task.ts
git commit -m "feat(tasks): TaskRepository.findMatchingWithAncestors — 搜索匹配 + 祖先路径构建"
```

### 6.2 TaskTreeView 搜索模式改造

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`
- Modify: `frontend/src/app/actions/tasks.ts`（新增 search server action）

- [ ] **Step 4: 在 `app/actions/tasks.ts` 中新增搜索 server action**

在 `getTaskAncestors` 函数之后新增：

```typescript
/**
 * 搜索任务并返回祖先路径
 * @param query - 搜索关键词
 * @param filters - 额外筛选条件
 * @returns 匹配任务 + 祖先映射
 */
export async function searchTasks(
  query: string,
  filters?: { threadId?: string; clarity?: string[]; status?: string[] },
): Promise<{
  matches: Task[]
  ancestorMap: Record<string, Array<{ id: string; title: string }>>
}> {
  const repo = new TaskRepository()
  const { matches, ancestorMap } = await repo.findMatchingWithAncestors(
    query,
    MVP_USER_ID as USOM_ID,
    filters,
  )
  // 将 ancestorMap（Map<Task>）转换为可序列化的 Record<string, {id, title}[]>
  const serializableAncestorMap: Record<string, Array<{ id: string; title: string }>> = {}
  for (const [taskId, ancestors] of ancestorMap.entries()) {
    serializableAncestorMap[taskId] = ancestors.map(a => ({ id: a.id, title: a.title }))
  }
  return { matches, ancestorMap: serializableAncestorMap }
}
```

- [ ] **Step 5: 在 TaskTreeView 中集成搜索模式**

在 `task-tree-view.tsx` 文件中，修改搜索相关逻辑。需要找到当前的 `filterTreeBySearch` 函数和搜索状态处理。

首先确认当前 import 列表中有 `searchTasks`：

在 import 区块的 `import { getTasks, getChildCounts, getSubtasks, createTask, updateTaskStatus as updateTaskStatusAction, archiveTask } from '@/app/actions/tasks'` 中追加 `searchTasks`：

```typescript
import { getTasks, getChildCounts, getSubtasks, createTask, updateTaskStatus as updateTaskStatusAction, archiveTask, searchTasks } from '@/app/actions/tasks'
```

然后修改搜索处理逻辑。找到 `filterTreeBySearch` 函数（约 line 108 附近），在搜索关键词变化时调用 `searchTasks`：

在组件内部，找到搜索状态管理的地方。当 `searchQuery` 非空时，触发搜索并构建包含祖先路径的搜索结果树。

需要新增以下状态和逻辑：

```typescript
// 在组件状态声明区域新增
const [searchResults, setSearchResults] = useState<{
  matches: Task[]
  ancestorMap: Record<string, Array<{ id: string; title: string }>>
} | null>(null)
const [isSearching, setIsSearching] = useState(false)
```

```typescript
// 搜索触发逻辑 — 在搜索关键词变化时
useEffect(() => {
  if (!searchQuery.trim()) {
    setSearchResults(null)
    return
  }

  const timer = setTimeout(async () => {
    setIsSearching(true)
    try {
      const result = await searchTasks(searchQuery.trim(), {
        threadId: threadId === '__all__' ? undefined : threadId === '__orphan__' ? undefined : threadId,
        status: filterStatus?.length ? filterStatus : undefined,
      })
      setSearchResults(result)
    } catch (err) {
      console.error('[TaskTreeView] 搜索失败:', err)
      setSearchResults(null)
    } finally {
      setIsSearching(false)
    }
  }, 300) // 300ms 防抖

  return () => clearTimeout(timer)
}, [searchQuery, threadId, filterStatus])
```

在树渲染逻辑中，当 `searchResults` 非空时，切换到搜索模式渲染：

```typescript
// 在渲染树节点之前，判断搜索模式
if (searchResults && searchQuery.trim()) {
  // 搜索模式：渲染搜索结果列表
  return (
    <div className="space-y-1">
      {isSearching && (
        <div className="text-sm text-[var(--text-muted)] px-3 py-2">搜索中...</div>
      )}
      {!isSearching && searchResults.matches.length === 0 && (
        <div className="text-sm text-[var(--text-muted)] px-3 py-2">未找到匹配的任务</div>
      )}
      {searchResults.matches.map(task => {
        const ancestors = searchResults.ancestorMap[task.id] ?? []
        return (
          <div key={task.id} className="px-2 py-1.5 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer"
               onClick={() => onOpenTaskDetail?.(task.id)}>
            {/* 祖先路径 */}
            {ancestors.length > 0 && (
              <div className="text-xs text-[var(--text-muted)] mb-0.5">
                {ancestors.reverse().map(a => a.title).join(' > ')}
              </div>
            )}
            {/* 匹配的任务 */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-ink)]">{task.title}</span>
              <span className="text-xs text-[var(--text-muted)]">#{task.id.slice(0, 8)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**注意**：具体的 JSX 结构需要与现有 `TaskTreeView` 的视觉风格保持一致（状态圆点、优先级徽章等）。上面的代码是核心逻辑骨架，实际实现时需要复用现有 `TreeNode` 的子元素渲染模式。搜索结果中的匹配关键词应高亮显示。

- [ ] **Step 6: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 7: 手动测试搜索功能**

1. 创建一个主线，在下面创建任务 A，任务 A 下创建子任务 B（标题包含"搜索测试"）
2. 在任务树页面折叠任务 A
3. 在搜索框输入"搜索测试"
4. 预期：应找到子任务 B，并显示路径 "主线名 > 任务A > **子任务B**"

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/actions/tasks.ts frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): 搜索改进 — 支持深层子任务搜索 + 祖先路径展示"
```

---

## Task 7: 最终集成验证

> 前置条件：Task 1-6 全部完成。

### 7.1 完整回归测试

- [ ] **Step 1: 全量编译检查**

Run: `cd frontend && npx tsc --noEmit --pretty`

预期: 0 errors

- [ ] **Step 2: Lint 检查**

Run: `cd frontend && npm run lint`

预期: 0 errors（或仅有预存的无关 warning）

- [ ] **Step 3: 构建检查**

Run: `cd frontend && npm run build`

预期: 构建成功

- [ ] **Step 4: 端到端烟雾测试清单**

在 `npm run dev` 启动后，逐项测试：

| # | 测试项 | 操作 | 预期 |
|---|---|---|---|
| 1 | Tasks: 创建任务 | 在任务树页面点"+"创建新任务 | 成功创建，出现在树中 |
| 2 | Tasks: 修改任务 | 点击任务 → 修改标题 → 保存 | 成功更新 |
| 3 | Tasks: 状态变更 | 点击"开始"按钮 | 状态变为 in_progress |
| 4 | Tasks: 完成任务 | 点击"完成"按钮 | 状态变为 completed |
| 5 | Tasks: 归档任务 | 点击"归档"按钮 | 任务从活跃列表消失 |
| 6 | Tasks: 删除任务 | 在任务详情中点"删除" | 任务被删除 |
| 7 | Tasks: 搜索 | 搜索子任务关键词 | 找到深层子任务，显示路径 |
| 8 | Habits: 创建习惯 | 在习惯页面创建新习惯 | 成功创建 |
| 9 | Habits: 激活习惯 | 点击"激活"按钮 | 状态变为 active |
| 10 | Habits: 打卡 | 点击"打卡"按钮 | 打卡成功 |
| 11 | Habits: 删除习惯 | 点击"删除"按钮 | 习惯被删除 |
| 12 | CNUI: AI 创建任务 | AI 助手中说"创建一个任务" | CNUI 面板弹出，提交成功 |
| 13 | CNUI: AI 创建习惯 | AI 助手中说"创建一个习惯" | CNUI 面板弹出，提交成功 |

- [ ] **Step 5: 违宪检查 — 确认无直接 repo 写入**

Run: `cd frontend && grep -n "repo\.\(create\|update\|save\|delete\|archive\|updateStatus\)" src/app/actions/tasks.ts src/app/actions/intent.ts src/domains/tasks/cnui/handlers.ts src/domains/habits/cnui/handlers.ts`

预期: `tasks.ts` 和 `intent.ts` 中不应有直接的 repo 写操作（读操作除外）；`handlers.ts` 中不应有 submit 方法内的 repo 写操作。

**允许的例外**：
- `tasks.ts` 中的 `updateTask` — 字段更新，SM 不支持，保留直接 repo 调用（有 TODO 标记）
- `intent.ts` 中的 `updateHabit` — 同理，字段更新保留独立 Orchestrator 构造
- `intent.ts` 中的 `getHabits`、`checkHabitReferences` 等读操作
- `handlers.ts` 中 `open` 方法的读操作
- `tasks.ts` 中的读操作（`getTasks`、`getTaskById`、`getChildCounts`、`getSubtasks`、`getTaskAncestors`、`searchTasks`）

- [ ] **Step 6: Final commit（如有 fixup）**

```bash
git add -A
git commit -m "chore: 阶段 A 最终集成验证通过"
```

---

# Phase B：Thread 写操作 Nexus 统一 + CNUI Surface 注册修复

> **状态：✅ 已完成** | 代码改动在 Phase A 实施期间同步完成，无独立实施计划。

## B.1 完成的改动

### B.1.1 handlers.ts — Thread 生命周期映射

- [x] 新增 `THREAD_LIFECYCLE_STATUS_MAP` 和 `THREAD_LIFECYCLE_SM_ACTION`
- [x] `open()` 新增 Thread 生命周期查询分支（pauseThread/resumeThread/completeThread/archiveThread）
- [x] `submit()` 新增 Thread 批量操作：支持 `selectedIds`，逐个调用 `submitDynamicIntent`
- [x] `submit()` 新增 `promoteToThread` 专用分支（多阶段编排，调 server action）

### B.1.2 CNUI Surface 注册补全

- [x] `register-client-surfaces.ts` 补注册 4 个缺失 surface：`thread-creation-card`、`thread-promote-card`、`thread-action-panel`、`task-action-panel`
- [x] `surfaceHandlers` 映射覆盖全部 7 个 Tasks Domain surface

### B.1.3 Thread Surface 组件完善

- [x] `ThreadActionPanel.tsx` — 多选 + 批量确认交互（参照 TaskActionPanel 模式）
- [x] `ThreadCreationCard.tsx` — 自包含创建表单
- [x] `ThreadPromoteCard.tsx` — 任务选择 + 提升确认

## B.2 验收

- [x] `/createThread`、`/promoteToThread` 命令正常工作
- [x] Thread 生命周期操作支持批量选择
- [x] 所有 7 个 surface 注册正确

---

# Phase C：Task CNUI Surface 完善

> **状态：✅ 已完成** | 代码改动在 Phase A/B 实施期间同步完成。

## C.1 完成的改动

### C.1.1 deleteTask handler 分支

- [x] 新增 `DELETABLE_TASK_STATUSES = ['todo', 'planned', 'in_progress', 'completed']`
- [x] `TASK_LIFECYCLE_SM_ACTION` 新增 `deleteTask: 'delete'`
- [x] `open()` 新增 `deleteTask` 分支：查询多个可删除状态的任务
- [x] `TaskActionPanel` 的 `ACTION_LABELS` 新增 `delete` 映射

### C.1.2 refineTask handler 分支

- [x] `open()` 新增 `refineTask` 分支：查询 `clarity === 'fuzzy' || clarity === 'scoped'` 的任务
- [x] `TaskActionPanel` 的 `ACTION_LABELS` 新增 `refine` 映射

### C.1.3 TaskSplitCard 占位 UI

- [x] 从返回 null 改为展示占位卡片（可拆分任务列表 + 开发中提示 + 关闭按钮）

### C.1.4 通用成功消息

- [x] `use-intent-handler.ts` 新增 `cnuiActionMessages` 映射（覆盖 habit/task/thread 所有操作）
- [x] 替换原有硬编码的 habit 专属逻辑

## C.2 验收

- [x] `/deleteTask` 显示可删除任务列表
- [x] `/refineTask` 显示模糊任务列表
- [x] `/splitTask` 显示占位卡片（非空白）
- [x] 所有 CNUI 操作有专属成功消息

---

# 附录：三阶段完成状态

| Phase | Design | Plan | 代码 | 状态 |
|-------|--------|------|------|------|
| A: Nexus 链路统一 | ✅ §1-6 | ✅ Task 1-8 | ✅ 已合并 | 完成 |
| B: Thread 统一 | ✅ §B.1-B.4 | ✅ §B.1-B.2 | ✅ 已合并 | 完成 |
| C: Surface 完善 | ✅ §C.1-C.4 | ✅ §C.1-C.2 | ✅ 已合并 | 完成 |
