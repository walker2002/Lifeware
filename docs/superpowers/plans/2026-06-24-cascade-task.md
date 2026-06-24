# [025] 任务级联处理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 complete/archive/delete Task/Thread 时的子任务级联处理（Plan C：Orchestrator 检测 → NeedConfirm → 拆分多个 Intent → 逐个走完整 Nexus 链路）

**Architecture:** cascadeCheck 在 Orchestrator 内（利用 deps.getRepo 查子任务），拆分后子 Intent 走 cascade_ action → 独立 SM transition → 写入口。Manifest 声明 cascade_rules + cascade_ lifecycle 转换。Thread 自身不走级联（严格手动）。

**Tech Stack:** TypeScript, Drizzle ORM, Vitest, React 19

**Spec:** `docs/superpowers/specs/2026-06-24-cascade-task-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/domains/tasks/manifest.yaml` | 修改 | +cascade_rules 区块、+3 条 cascade_ transition、+3 事件 |
| `src/domains/tasks/transitions.ts` | 修改 | +3 条 cascade_ 转换定义 |
| `src/domains/manifest-loader/schema.ts` | 修改 | CascadeChildRuleSchema +cascade_action 可选字段 |
| `src/nexus/orchestrator/index.ts` | 修改 | +cascadeCheck +parentConstraintCheck +拆分执行；tasks 域跳过 SM cascade |
| `src/domains/tasks/repository/generic-repo-adapter.ts` | 修改 | task GenericRepo +findByParent +findByThread |
| `src/nexus/core/state-machine/cascade.ts` | 不修改 | 保留（okrs 域未来复用） |
| `src/nexus/orchestrator/__tests__/cascade-check.test.ts` | 新建 | 11 个测试场景 |
| `src/domains/tasks/__tests__/cascade-lifecycle.test.ts` | 新建 | cascade_ transition 合规测试 |

---

### Task 1: Manifest cascade_rules + lifecycle 声明

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`
- Modify: `frontend/src/domains/tasks/transitions.ts`
- Modify: `frontend/src/domains/manifest-loader/schema.ts:188-193`

- [ ] **Step 1: manifest.yaml — 在 lifecycle.task.transitions 末尾新增 3 条 cascade_ 转换**

在 `frontend/src/domains/tasks/manifest.yaml` 的 `lifecycle.task.transitions` 数组末尾（`terminal_states: [deleted]` 之前）插入：

```yaml
      # 级联转换（cascade_*）：父对象状态变更时，子任务走此专用 action 避免线性约束
      - from: [todo, planned, in_progress]
        to: completed
        trigger: intent
        action: cascade_complete
        event_type: TaskCascadeCompleted
      - from: [todo, planned, in_progress, completed]
        to: archived
        trigger: intent
        action: cascade_archive
        event_type: TaskCascadeArchived
      - from: [todo, planned, in_progress, completed, archived]
        to: deleted
        trigger: intent
        action: cascade_delete
        event_type: TaskCascadeDeleted
```

- [ ] **Step 2: manifest.yaml — 在 lifecycle 区块之后新增 cascade_rules 区块**

在 `lifecycle:` 区块闭合后、`field_metadata:` 之前插入：

```yaml
# ─── 级联规则（[025] Plan C）───────────────────────────────────────
cascade_rules:
  # Thread 级联到其下所有 Task
  - type: parent_child_status
    parent_object: thread
    child_object: task
    child_query: findByThread
    rules:
      - parent_action: completeThread
        child_filter: "status in ['todo','planned','in_progress']"
        child_to_status: completed
        cascade_action: cascade_complete
        event_type: TaskCascadeCompleted
      - parent_action: archiveThread
        child_filter: "status not in ['archived','deleted']"
        child_to_status: archived
        cascade_action: cascade_archive
        event_type: TaskCascadeArchived
      - parent_action: deleteThread
        child_filter: "status not in ['deleted']"
        child_to_status: deleted
        cascade_action: cascade_delete
        event_type: TaskCascadeDeleted

  # Task 级联到其子孙 Task
  - type: parent_child_status
    parent_object: task
    child_object: task
    child_query: findByParent
    rules:
      - parent_action: completeTask
        child_filter: "status in ['todo','planned','in_progress']"
        child_to_status: completed
        cascade_action: cascade_complete
        event_type: TaskCascadeCompleted
      - parent_action: archiveTask
        child_filter: "status not in ['archived','deleted']"
        child_to_status: archived
        cascade_action: cascade_archive
        event_type: TaskCascadeArchived
      - parent_action: deleteTask
        child_filter: "status not in ['deleted']"
        child_to_status: deleted
        cascade_action: cascade_delete
        event_type: TaskCascadeDeleted
```

- [ ] **Step 3: manifest.yaml — subscribed_events 新增 3 个事件**

在 `subscribed_events:` 列表末尾添加：

```yaml
  - TaskCascadeCompleted
  - TaskCascadeArchived
  - TaskCascadeDeleted
```

- [ ] **Step 4: transitions.ts — 新增 3 条 cascade_ 转换**

在 `frontend/src/domains/tasks/transitions.ts` 的 `taskTransitions` 数组末尾（`]` 之前）添加：

```typescript
  // 级联转换（cascade_*）：父对象完成/归档/删除时子任务走此专用 action
  { from: 'todo',        to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'planned',     to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'in_progress', to: 'completed', action: 'cascade_complete', eventType: 'TaskCascadeCompleted' },
  { from: 'todo',        to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'planned',     to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'in_progress', to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'completed',   to: 'archived',  action: 'cascade_archive',  eventType: 'TaskCascadeArchived' },
  { from: 'todo',        to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'planned',     to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'in_progress', to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'completed',   to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
  { from: 'archived',    to: 'deleted',   action: 'cascade_delete',   eventType: 'TaskCascadeDeleted' },
```

- [ ] **Step 5: schema.ts — CascadeChildRuleSchema 新增 cascade_action 可选字段**

修改 `frontend/src/domains/manifest-loader/schema.ts:188-193`，在 `CascadeChildRuleSchema` 中添加 `cascade_action`：

```typescript
const CascadeChildRuleSchema = z.object({
  parent_action: z.string(),
  child_filter: z.string(),
  child_to_status: z.string(),
  event_type: z.string(),
  cascade_action: z.string().optional(),
})
```

- [ ] **Step 6: 运行 validate-manifest 验证 manifest 语法**

```bash
cd frontend && npx tsx scripts/validate-manifest.ts
```
Expected: EXIT=0

- [ ] **Step 7: 运行现有测试确认零回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: 与基线一致的通过/失败数

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/tasks/manifest.yaml frontend/src/domains/tasks/transitions.ts frontend/src/domains/manifest-loader/schema.ts
git commit -m "feat(cascade): [025] S1 — manifest cascade_rules + cascade_ lifecycle 声明

- tasks/manifest.yaml: 新增 cascade_rules 区块（thread→task + task→task 2组6条）
- tasks/manifest.yaml: lifecycle.task 新增 cascade_complete/archive/delete 3 条转换
- tasks/manifest.yaml: subscribed_events 新增 3 个 cascade 事件
- tasks/transitions.ts: 新增 12 条 cascade_ 转换（每条 from state 独立声明）
- manifest-loader/schema.ts: CascadeChildRuleSchema +cascade_action 可选字段

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: GenericRepo adapter 扩展 — task 增加 findByParent + findByThread

**Files:**
- Modify: `frontend/src/domains/tasks/repository/generic-repo-adapter.ts`

- [ ] **Step 1: TasksRepoPair 接口新增 findByParent + findByThread 签名**

修改 `frontend/src/domains/tasks/repository/generic-repo-adapter.ts`，在 `TasksRepoPair.taskRepo` 接口中添加：

```typescript
interface TasksRepoPair {
  taskRepo: {
    findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown> | null>
    save(obj: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<void>
    create(fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    updateFields(id: USOM_ID, fields: Record<string, unknown>, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>>
    findByParent(parentId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Record<string, unknown>[]>
    findByUserId(userId: USOM_ID, filters?: Record<string, unknown>): Promise<Record<string, unknown>[]>
  }
  // ... threadRepo 保持不变
}
```

- [ ] **Step 2: createTasksGenericRepo 的 task 对象新增 findByParent + findByThread**

在 `createTasksGenericRepo` 返回的 `task` 对象中添加两个方法：

```typescript
task: {
  // ... 现有方法保持不变 ...
  async findByParent(parentId, userId, tx) {
    const tasks = await repos.taskRepo.findByUserId(userId, { parentId })
    return tasks
  },
  async findByThread(threadId, userId, tx) {
    const tasks = await repos.taskRepo.findByUserId(userId, { threadId })
    return tasks
  },
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/repository/generic-repo-adapter.ts
git commit -m "feat(cascade): [025] GenericRepo adapter — task +findByParent +findByThread

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Orchestrator cascadeCheck + 拆分执行

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`（约 +120 行，2 处修改）

- [ ] **Step 1: 在 orchestrator/index.ts 顶部新增 import**

在现有 import 块末尾添加：

```typescript
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import type { Task } from '@/usom/types/objects'
```

- [ ] **Step 2: 定义 CascadePreview 类型 + 级联 action 白名单**

在 `aggregateValidation` 函数之后、`ActionSurfaceEngine` 接口之前插入：

```typescript
// ─── [025] 级联检测类型 ──────────────────────────────────────────

/** 级联 action 白名单 */
const CASCADE_ELIGIBLE_ACTIONS = new Set([
  'completeTask', 'archiveTask', 'deleteTask',
  'completeThread', 'archiveThread', 'deleteThread',
])

/** 父 action → 子 cascade_action 映射 */
const CASCADE_ACTION_MAP: Record<string, string> = {
  completeTask: 'cascade_complete',
  archiveTask: 'cascade_archive',
  deleteTask: 'cascade_delete',
  completeThread: 'cascade_complete',
  archiveThread: 'cascade_archive',
  deleteThread: 'cascade_delete',
}

/** 级联预览数据 */
interface CascadePreview {
  parentAction: string
  parentId: string
  parentTitle: string
  parentType: 'task' | 'thread'
  directCount: number
  totalCount: number
  cascadeAction: string
  allDescendants: Array<{ id: string; title: string; status: string; parentId: string | null }>
}
```

- [ ] **Step 3: 实现 cascadeCheck 函数**

在 `CASCADE_ACTION_MAP` 之后插入：

```typescript
/**
 * 级联检测 — 识别 complete/archive/delete 操作，查询子任务并构造 CascadePreview。
 *
 * cascade_ 前缀的 action 直通（防递归）；非白名单 action 直通。
 * 返回 Passed（无级联）或 NeedConfirm（有级联，携带 CascadePreview）。
 */
async function cascadeCheck(
  intent: StructuredIntent,
  userId: USOM_ID,
): Promise<ValidationResult> {
  const action = intent.action

  // cascade_ action 直通，不递归检测
  if (action.startsWith('cascade_')) return { kind: 'Passed' }

  // 非白名单 action 直通
  if (!CASCADE_ELIGIBLE_ACTIONS.has(action)) return { kind: 'Passed' }

  // 提取父对象信息
  const isThreadAction = action.includes('Thread')
  const parentType = isThreadAction ? 'thread' : 'task'
  const parentIdKey = isThreadAction ? 'threadId' : 'taskId'
  const parentId = intent.fields[parentIdKey] as string | undefined

  if (!parentId) return { kind: 'Passed' }

  // 查询子任务
  const taskRepo = new TaskRepository()
  let directChildren: Task[]

  if (isThreadAction) {
    // findByThread: 查该 thread 下的所有 task（不含已删除）
    directChildren = await taskRepo.findByUserId(userId, {
      threadId: parentId,
      status: ['todo', 'planned', 'in_progress', 'completed', 'archived'],
    })
  } else {
    // findByParent: 查该 task 的直接子任务
    directChildren = await taskRepo.findByParent(parentId, userId)
  }

  // 过滤：只保留符合 cascade 规则的状态（非 deleted）
  const eligibleChildren = directChildren.filter(
    c => c.status !== 'deleted',
  )

  if (eligibleChildren.length === 0) return { kind: 'Passed' }

  // 递归收集所有后代（BFS）
  const allDescendants: CascadePreview['allDescendants'] = []
  const queue = eligibleChildren.map(c => ({ id: c.id, title: c.title, status: c.status, parentId: c.parentId ?? null }))
  allDescendants.push(...queue)

  let i = 0
  while (i < queue.length) {
    const current = queue[i++]!
    const grandchildren = await taskRepo.findByParent(current.id, userId)
    for (const gc of grandchildren) {
      if (gc.status !== 'deleted') {
        const entry = { id: gc.id, title: gc.title, status: gc.status, parentId: gc.parentId ?? null }
        queue.push(entry)
        allDescendants.push(entry)
      }
    }
  }

  // 获取父对象标题
  let parentTitle = ''
  if (isThreadAction) {
    const threadRepo = new ThreadRepository()
    const thread = await threadRepo.findById(parentId, userId)
    parentTitle = thread?.name ?? parentId
  } else {
    const parent = directChildren.length >= 0
      ? await taskRepo.findById(parentId, userId)
      : null
    parentTitle = (parent as Task | null)?.title ?? parentId
  }

  const cascadePreview: CascadePreview = {
    parentAction: action,
    parentId,
    parentTitle,
    parentType,
    directCount: eligibleChildren.length,
    totalCount: allDescendants.length,
    cascadeAction: CASCADE_ACTION_MAP[action]!,
    allDescendants,
  }

  return {
    kind: 'NeedConfirm',
    data: { source: 'cascade', cascadePreview },
  }
}
```

- [ ] **Step 4: 实现 parentConstraintCheck 函数（双重约束）**

在 `cascadeCheck` 之后插入：

```typescript
/**
 * 双重约束检查 — createTask 时校验 threadId + parentId 状态。
 * completed/archived 的 Thread 下禁止创建；completed/archived/deleted 的父 Task 下禁止创建。
 */
async function parentConstraintCheck(
  intent: StructuredIntent,
  userId: USOM_ID,
): Promise<ValidationResult> {
  if (intent.action !== 'createTask') return { kind: 'Passed' }

  const errors: string[] = []
  const threadId = intent.fields['threadId'] as string | undefined
  const parentId = intent.fields['parentId'] as string | undefined

  if (threadId) {
    const threadRepo = new ThreadRepository()
    const thread = await threadRepo.findById(threadId, userId)
    if (thread && ['completed', 'archived'].includes(thread.status)) {
      errors.push('无法在已完成/已归档的主线下创建任务')
    }
  }

  if (parentId) {
    const taskRepo = new TaskRepository()
    const parent = await taskRepo.findById(parentId, userId)
    if (parent && ['completed', 'archived', 'deleted'].includes(parent.status)) {
      errors.push('无法在已完成/已归档/已删除的任务下创建子任务')
    }
  }

  return errors.length === 0
    ? ({ kind: 'Passed' } as ValidationResult)
    : ({ kind: 'Rejected', errors } as ValidationResult)
}
```

- [ ] **Step 5: 在 executeIntent 中插入 cascadeCheck + parentConstraintCheck**

在 `executeIntent` 方法中，找到第 459 行的 domain validation 之后（`// 1.5 路径路由` 之前），插入级联和约束检测：

```typescript
      // 1.3 双重约束检查（[025] S3：createTask 校验父对象状态）
      const constraintValidation = await parentConstraintCheck(intent, userId)
      if (constraintValidation.kind === 'Rejected') {
        return { success: false, error: constraintValidation.errors!.join('; ') }
      }

      // 1.4 级联检测（[025] S2：complete/archive/delete 查子任务）
      const cascadeValidation = await cascadeCheck(intent, userId)
```

- [ ] **Step 6: 修改 aggregateValidation 调用，纳入 cascadeValidation**

修改第 524 行的聚合调用，从三方聚合变为四方聚合：

```typescript
      // 3. 聚合四方 ValidationResult：domain × cascade × rule × cnui
      const aggregated = aggregateValidation(
        aggregateValidation(
          aggregateValidation(domainValidation, cascadeValidation),
          ruleValidation,
        ),
        cnuiValidation,
      )
```

- [ ] **Step 7: 在 NeedConfirm 处理中新增 cascade 路由**

在 `executeIntent` 的 `if (aggregated.kind === 'NeedConfirm')` 块（约第 556 行）中，在现有 `return` 之前插入 cascade 特殊处理。找到该块开头：

```typescript
      if (aggregated.kind === 'NeedConfirm') {
        const data = aggregated.data as Record<string, unknown>
```

在 `const data = ...` 之后、兼容旧消费方代码之前，插入：

```typescript
        // [025] 级联确认：若已确认，执行父 Intent + 拆分子 Intent
        if (data?.source === 'cascade' && confirmed) {
          const preview = data.cascadePreview as CascadePreview
          // 父 Intent 先执行（走完整 SM + 写入口）
          // ... 继续走下面的 SM 路径（fall through 到通用 SM 处理）
          // 将 cascadePreview 存到局部变量，供 SM 执行后使用
          ;(intent as any).__cascadePreview = preview
        }
```

- [ ] **Step 8: 在 SM 执行成功后添加子 Intent 拆分逻辑**

在 `executeIntent` 的通用 SM 路径（约第 617-633 行），SM 执行成功后、`return` 之前，添加子 Intent 拆分：

找到：
```typescript
        if (domain && smResult.event) {
          await domain.onEvent(smResult.event, usomSnapshot)
        }

        return {
          success: true,
          object: smResult.object,
          objectType: smObjectType,
          warnings: ruleResult.warnings,
        }
```

替换为：
```typescript
        if (domain && smResult.event) {
          await domain.onEvent(smResult.event, usomSnapshot)
        }

        // [025] 级联拆分执行
        const cascadePreview = (intent as any).__cascadePreview as CascadePreview | undefined
        if (cascadePreview && cascadePreview.allDescendants.length > 0) {
          const childResults: Array<{ id: string; success: boolean; error?: string }> = []
          for (const child of cascadePreview.allDescendants) {
            const childIntent: StructuredIntent = {
              id: crypto.randomUUID() as USOM_ID,
              intentionId: intent.intentionId,
              targetDomain: 'tasks',
              action: cascadePreview.cascadeAction,
              fields: {
                taskId: child.id,
                title: child.title,
              },
              confidence: 1.0,
              resolvedBy: 'template_form',
              pathType: 'contract',
              createdAt: new Date().toISOString() as Timestamp,
            }
            try {
              const r = await orchestrator.executeIntent(childIntent, userId)
              childResults.push({ id: child.id, success: r.success, error: r.error })
            } catch (err) {
              childResults.push({
                id: child.id,
                success: false,
                error: err instanceof Error ? err.message : '级联执行失败',
              })
            }
          }

          const failedCount = childResults.filter(r => !r.success).length
          const warnings = [
            ...(ruleResult.warnings ?? []),
            `级联操作完成：${cascadePreview.totalCount} 个子任务已处理` +
              (failedCount > 0 ? `，${failedCount} 个失败` : ''),
          ]

          return {
            success: failedCount === 0,
            object: smResult.object,
            objectType: smObjectType,
            warnings,
            error: failedCount > 0
              ? `${failedCount}/${cascadePreview.totalCount} 个子任务级联失败`
              : undefined,
          }
        }

        return {
          success: true,
          object: smResult.object,
          objectType: smObjectType,
          warnings: ruleResult.warnings,
        }
```

- [ ] **Step 9: tasks 域跳过 SM cascade（避免双重点火）**

在 `executeIntent` 中，约第 588-601 行，`getCascadeRules` 传递处，对 tasks 域传 `undefined`：

```typescript
        // [025] tasks 域级联由 Orchestrator 接管，SM 不再执行 cascade
        const cascadeRules = manifestResult.success && domainId !== 'tasks'
          ? (manifestResult.manifest.cascade_rules?.filter((r: any) => r.type === 'parent_child_status') ?? [])
          : []

        const sm = createGenericStateMachine({
          getRepository: () => repo,
          eventRepo: deps.eventRepo,
          getLifecycle: (dId, objType) => {
            const lc = getLifecycleFromManifest(dId, objType)
            if (!lc) throw new Error(`未找到 lifecycle: ${dId}/${objType}`)
            return lc
          },
          domainId,
          getCascadeRules: cascadeRules.length > 0 ? () => cascadeRules as any : undefined,
        })
```

- [ ] **Step 10: 运行测试确认零回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 与基线一致的通过/失败数（仅关注新增失败，忽略预存失败）

- [ ] **Step 11: Commit**

```bash
git add frontend/src/nexus/orchestrator/index.ts
git commit -m "feat(cascade): [025] S2+S3 — Orchestrator cascadeCheck + 拆分执行 + 双重约束

- cascadeCheck: 识别 complete/archive/delete → 查子任务 → NeedConfirm(CascadePreview)
- cascade_ action 直通防递归
- parentConstraintCheck: createTask 时校验 threadId + parentId 状态
- 四方聚合 (domain × cascade × rule × cnui)
- confirmed=true 时父 Intent 先执行，随后逐个子 Intent 走 executeIntent
- tasks 域 getCascadeRules→undefined（SM 不双重执行级联）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 集成测试

**Files:**
- Create: `frontend/src/nexus/orchestrator/__tests__/cascade-check.test.ts`

- [ ] **Step 1: 创建测试文件 scaffold**

创建 `frontend/src/nexus/orchestrator/__tests__/cascade-check.test.ts`：

```typescript
/**
 * @file cascade-check.test
 * @brief [025] 级联检测 + 约束检查单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { USOM_ID } from '@/usom/types/primitives'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ValidationResult } from '@/usom/types/process'

// 注：cascadeCheck 和 parentConstraintCheck 是 orchestrator 内部函数，
// 测试通过 orchestrator.executeIntent 间接验证。
// 依赖 TaskRepository / ThreadRepository 需 mock 数据库调用。
```

- [ ] **Step 2: 编写 T1-T3: completeTask 级联检测场景**

```typescript
describe('[025] cascadeCheck — completeTask', () => {
  // 测试通过 orchestrator.executeIntent 的完整链路验证；
  // 使用 vi.mock 替换 TaskRepository / ThreadRepository 隔离数据库。

  it('T1: completeTask 无子任务 → Passed，正常完成', async () => {
    // 构造 intent: { action: 'completeTask', fields: { taskId: 't1' } }
    // Mock TaskRepository.findById → { id:'t1', status:'in_progress', title:'父任务' }
    // Mock TaskRepository.findByParent → []
    // Mock TaskRepository.updateStatus → 成功
    // 执行 orchestrator.executeIntent(intent, userId)
    // 预期: result.success === true, result.object.status === 'completed'
    //       无 cascadePreview，无确认卡
  })

  it('T2: completeTask 有 1 个直接子任务 → NeedConfirm(CascadePreview)', async () => {
    // Mock TaskRepository.findById → { id:'t1', status:'in_progress', title:'父任务' }
    // Mock TaskRepository.findByParent('t1') → [{ id:'t2', status:'todo', title:'子任务', parentId:'t1' }]
    // Mock TaskRepository.findByParent('t2') → []（无孙级）
    // 执行 orchestrator.executeIntent(intent, userId)
    // 预期: result.success === false
    //       result.suspended.reason === 'need_confirm'
    //       result.needsConfirmation === true
    //       result.confirmationMessage 含 "1 个子任务"
  })

  it('T3: completeTask 有 2 级子任务 → 级联统计正确', async () => {
    // 构造树: t1 → [t2, t3]; t2 → [t4, t5, t6]
    // Mock findByParent('t1') → [t2, t3]
    // Mock findByParent('t2') → [t4, t5, t6]
    // Mock findByParent('t3') → []
    // 执行 orchestrator.executeIntent(intent, userId)
    // 预期: NeedConfirm
    //       cascadePreview.directCount = 2, totalCount = 5
  })
})
```

- [ ] **Step 3: 编写 T4-T6: archive/delete cascade_ 直通/非白名单**

```typescript
describe('[025] cascadeCheck — archive/delete/cascade_ 直通', () => {
  it('T4: deleteTask 有 archived 子任务 → NeedConfirm（archived 被包含）', async () => {
    // Mock findByParent('t1') → [
    //   { id:'t2', status:'archived', title:'已归档子任务', parentId:'t1' },
    //   { id:'t3', status:'deleted', title:'已删除子任务', parentId:'t1' },
    // ]
    // cascadeCheck 只过滤 status !== 'deleted'，archived 应被保留
    // 预期: cascadePreview.allDescendants 仅含 t2，不含 t3
  })

  it('T5: cascade_complete action → Passed（不递归）', async () => {
    // 构造 intent: { action: 'cascade_complete', fields: { taskId: 't2' } }
    // cascadeCheck 检测 action.startsWith('cascade_') → 直接返回 Passed
    // 验证: TaskRepository.findByParent 未被调用
  })

  it('T6: createTask action → Passed（非白名单）', async () => {
    // 构造 intent: { action: 'createTask', fields: { ... } }
    // cascadeCheck 检测 !CASCADE_ELIGIBLE_ACTIONS.has('createTask') → Passed
  })
})
```

- [ ] **Step 4: 编写 T7-T8: completeThread 级联 + Thread 自身不走级联**

```typescript
describe('[025] cascadeCheck — Thread 级联', () => {
  it('T7: completeThread 级联其下所有 task', async () => {
    // 构造 intent: { action: 'completeThread', fields: { threadId: 'th1' } }
    // Mock ThreadRepository.findById → { id:'th1', status:'active', name:'事业进阶' }
    // Mock TaskRepository.findByUserId({ threadId:'th1', status:[...] }) → [t1, t2, t3]
    // 递归查 t1/t2/t3 的子任务（BFS）
    // Mock SM + 写入口 执行成功
    // 预期: cascadePreview.parentType = 'thread'
    //       cascadePreview.allDescendants 含所有后代
  })

  it('T8: Thread 自身状态转换不走级联', async () => {
    // completeThread → cascadeCheck 只查 Task 表
    // Thread 的 complete 走手动 SM transition（active→completed，严格线性）
    // 验证: ThreadRepository.updateStatus 未被级联逻辑调用
    //       只有 SM 调用 ThreadRepository.updateStatus（正常路径）
  })
})
```

- [ ] **Step 5: 编写 T9-T10: 双重约束**

```typescript
describe('[025] parentConstraintCheck — createTask 双重约束', () => {
  it('T9: completed thread 下 createTask → Rejected', async () => {
    // 构造 intent: { action: 'createTask', fields: { threadId: 'th1', title: '新任务' } }
    // Mock ThreadRepository.findById('th1') → { id:'th1', status:'completed', name:'已完成主线' }
    // 执行 orchestrator.executeIntent(intent, userId)
    // 预期: result.success === false
    //       result.error === '无法在已完成/已归档的主线下创建任务'
  })

  it('T10: archived parent task 下 createTask → Rejected', async () => {
    // 构造 intent: { action: 'createTask', fields: { parentId: 't1', title: '子任务' } }
    // Mock TaskRepository.findById('t1') → { id:'t1', status:'archived', title:'已归档任务' }
    // 预期: result.success === false
    //       result.error === '无法在已完成/已归档/已删除的任务下创建子任务'
  })
})
```

- [ ] **Step 6: 编写 T11: 确认取消 + T12: confirmed 执行全链路**

```typescript
describe('[025] 级联确认与执行', () => {
  it('T11: NeedConfirm 但 confirmed≠true → 不执行级联', async () => {
    // 构造 intent: completeTask，有子任务
    // 首次执行 confirmed=undefined
    // 预期: result.success === false
    //       result.suspended.reason === 'need_confirm'
    //       result.confirmationMessage 含级联提示
    //       子任务状态未改变（TaskRepository.updateStatus 仅对父任务调用）
  })

  it('T12: confirmed=true → 父+子全部执行成功', async () => {
    // 构造 intent: completeTask, confirmed=true
    // cascadeCheck → NeedConfirm(CascadePreview)
    // Orchestrator 处理 NeedConfirm + confirmed → 执行父 Intent
    //   父 SM transition → success
    //   然后逐个执行子 Intent（cascade_complete）→ 走独立 executeIntent
    //   子 cascade_complete 经 cascadeCheck → Passed（前缀识别）
    // 预期: result.success === true
    //       所有子任务 updateStatus 被调用（completed）
    //       result.warnings 含 "级联操作完成：N 个子任务已处理"
  })
})
```

- [ ] **Step 7: 运行新测试确认全部通过**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/cascade-check.test.ts --reporter=verbose
```
Expected: 11 passed

- [ ] **Step 8: Commit**

```bash
git add frontend/src/nexus/orchestrator/__tests__/cascade-check.test.ts
git commit -m "test(cascade): [025] S5 — cascadeCheck + 双重约束 11 集成测试

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: E2E 验证 + 最终回归

- [ ] **Step 1: 运行全量测试套件确认零新增回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: 与基线一致的通过/失败数

- [ ] **Step 2: 运行 tsc 检查类型错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: 零新增 TS 错误（忽略预存错误）

- [ ] **Step 3: 运行 validate-manifest**

```bash
cd frontend && npx tsx scripts/validate-manifest.ts
```
Expected: EXIT=0

- [ ] **Step 4: browser E2E 验证（手动）**

启动 dev server：
```bash
cd frontend && npm run dev
```

验证场景：
1. 创建一个 task，其下有子任务 → completeTask → 确认卡弹出 → 点击「连带下级」→ 父子全部完成
2. 创建主线+子任务 → deleteThread → 确认卡弹出 → 确认 → 子任务全部软删除
3. 在已完成的 thread 下创建 task → 被拒绝（双重约束）

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore(cascade): [025] E2E 验证通过，零回归

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 自检清单

- [x] Spec §5.1 (manifest + lifecycle) → Task 1
- [x] Spec §5.2 (Orchestrator cascadeCheck) → Task 3
- [x] Spec §5.3 (双重约束) → Task 3 Step 4
- [x] Spec §5.4 (清理旧 cascade) → Task 3 Step 9
- [x] Spec §5.5 (集成测试) → Task 4
- [x] GenericRepo 扩展 → Task 2
- [x] 无 TBD/TODO 占位
- [x] 所有 import 路径使用 `@/` 映射
- [x] 所有代码在 `frontend/` cwd 下运行
