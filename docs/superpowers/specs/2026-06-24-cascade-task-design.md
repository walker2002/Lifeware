# [025] 任务级联处理设计文档

**日期**：2026-06-24
**状态**：已确认
**前置依赖**：✅ [018] 业务事实写入口 (1.11.0) · ✅ [019.1] Domain 范式收尾 · ✅ [020] 规则三层架构 R0-R3 (constitution v2.1.0)

---

## 1. 概述

当用户完成/归档/删除一个主线（Thread）或任务（Task）时，如果该对象下存在子任务，系统需要**级联处理**这些子任务（连带完成/归档/删除），而非孤立操作父对象后留下孤儿。

### 1.1 已锁定决策（来自 brainstorming 2026-06-13）

| # | 决策 | 细节 |
|---|------|------|
| 1 | 机制 = Plan C | onValidate → Orchestrator 级联检测 → RuleEngine confirm → Orchestrator 拆分 Intent → 逐个走完整 Nexus 链路 |
| 2 | 新建任务 = 双重约束 | 同时校验 threadId（主线状态）+ parentId（父任务状态），completed/archived 下禁止新建 |
| 3 | 触发范围 = CNUI + Page | submitDynamicIntent 全覆盖 |
| 4 | 提示深度 = 一级+统计 | "3 个直接子任务，另有 5 个孙级任务" |
| 5 | 删除 = 软删除级联 | 连带软删所有下级（状态→deleted） |
| 6 | 级联对象 = 只有 Task | Thread 自身不走级联（严格手动 lifecycle）；completeThread/archiveThread/deleteThread 级联其下所有 Task |
| 7 | 确认语义 = 仅「连带下级」/「取消」 | 无「仅本项」选项 |
| 8 | lifecycle = 新增 cascade_ 转换 | cascade_complete / cascade_archive / cascade_delete（仅 Task） |
| 9 | 架构 = Plan C | 级联检测在 Orchestrator（有 repos 访问）；Rule Engine cascade-confirm 规则格式化确认消息；Orchestrator 拆分执行 |

### 1.2 关键设计调整说明

原 Plan C 文本写「onValidate 做前置检查」，但当前 `evaluateDomainRules` 接收的 `ServerRuleCtx.repos` 为空对象 `{}`（hooks 在 import 时创建，无 repos 注入）。级联检测需要 `TaskRepository` 查子任务。

**调整**：级联检测作为 Orchestrator 内部步骤（`cascadeCheck`），利用 Orchestrator 已有的 `deps.getRepo` 创建仓储。这是纯调度职责，不属业务逻辑，合规。Rule Engine 的 cascade-confirm 规则（格式化确认消息）保持不变。

---

## 2. 整体链路

```
用户操作: completeTask / archiveTask / deleteTask
          completeThread / archiveThread / deleteThread
                              │
                              ▼
                    Orchestrator.executeIntent
                              │
          ┌───────────────────┼───────────────────┐
          │ 1. onValidate                           │
          │    evaluateDomainRules（字段校验等）      │
          │                                          │
          │ 2. cascadeCheck（Orchestrator 新增）      │
          │    识别 cascade-eligible action           │
          │    → 查子任务（TaskRepository）            │
          │    → 有子任务：NeedConfirm(CascadePreview) │
          │    → 无子任务/cascade_ action：Passed      │
          │                                          │
          │ 3. RuleEngine                            │
          │    └─ cascade_confirm 规则                │
          │       格式化确认消息 (OrchestratorResult)   │
          │                                          │
          │ 4. Aggregate → NeedConfirm               │
          │    → 返回确认卡给用户                      │
          │       「连带 N 个下级」/「取消」            │
          │                                          │
          │ 5. confirmed=true 重新进入                │
          │    cascadeCheck:                          │
          │      cascade_ action → Passed（不递归）     │
          │                                          │
          │ 6. 父 Intent → 走完整 SM + 写入口          │
          │                                          │
          │ 7. Orchestrator 拆分子 Intent             │
          │    每个子任务 → cascade_xxx action          │
          │    → executeIntent（完整 Nexus 链路）       │
          │    → 每个子任务也经 cascadeCheck = Passed   │
          └──────────────────────────────────────────┘
```

---

## 3. 切片划分

| # | 切片 | 内容 | 预估复杂度 |
|---|------|------|-----------|
| **S1** | manifest + lifecycle | `tasks/manifest.yaml`：cascade_rules 区块、cascade_ 转换、事件类型 | 低 |
| **S2** | Orchestrator cascadeCheck | `orchestrator/index.ts`：cascade 检测函数 + 拆分执行 + 确认消息 | 中 |
| **S3** | 双重约束规则 | `rules-registry.ts`：createTask 校验 threadId/parentId 状态（SubmitCheck） | 低 |
| **S4** | 清理旧 cascade.ts | 移除 tasks 域在 SM 中的级联调用路径，测试迁移/删除 | 中 |
| **S5** | 集成测试 + E2E | cascade 闭环测试 + browser 验证 | 中 |

---

## 4. 数据结构

### 4.1 CascadePreview

```typescript
/** 级联预览 — 由 cascadeCheck 产出，携带在 NeedConfirm.data 中 */
interface CascadePreview {
  /** 触发的父 action */
  parentAction: string
  /** 父对象 ID */
  parentId: USOM_ID
  /** 父对象标题 */
  parentTitle: string
  /** 父对象类型 */
  parentType: 'task' | 'thread'
  /** 直接子任务列表 */
  directChildren: Array<{ id: string; title: string; status: string }>
  /** 所有后代任务列表（含孙级） */
  allDescendants: Array<{ id: string; title: string; status: string; parentId: string }>
  /** 直接子任务数 */
  directCount: number
  /** 所有后代总数 */
  totalCount: number
  /** 目标 action（cascade_xxx） */
  cascadeAction: string
}
```

### 4.2 确认消息格式

```
确认完成「主线名称」吗？
3 个直接子任务，另有 2 个孙级任务将一并完成。

[连带下级: 5 个任务一起完成]  [取消]
```

---

## 5. 各切片详细设计

### 5.1 S1: manifest + lifecycle

**文件**：`frontend/src/domains/tasks/manifest.yaml`

#### 5.1.1 cascade_rules 区块（新增）

```yaml
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

#### 5.1.2 lifecycle 新增转换（仅 task）

```yaml
# 新增 3 条 cascade_ 转换。cascade_delete 的 from 已包含 archived（现行 delete 不含）
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

#### 5.1.3 subscribed_events 新增

```yaml
subscribed_events:
  # ... 现有事件 ...
  - TaskCascadeCompleted
  - TaskCascadeArchived
  - TaskCascadeDeleted
```

#### 5.1.4 intent_triggers 新增（供 CNUI/page 触发，现有已覆盖）

现有的 completeTask/archiveTask/deleteTask/completeThread/archiveThread/deleteThread 六条 intent_trigger 保持不变。级联由 Orchestrator 内部触发，不需要新增对外 intent_trigger。

但需新增 `cascade_complete` / `cascade_archive` / `cascade_delete` 的 **action mapping**（在 `lifecycle-configs.ts` 的 action→lifecycle 映射中注册），确保 Orchestrator 拆分的子 Intent 能路由到正确的 SM transition。

### 5.2 S2: Orchestrator cascadeCheck

**文件**：`frontend/src/nexus/orchestrator/index.ts`

#### 5.2.1 新增函数

```typescript
/**
 * 级联检测 — 识别 complete/archive/delete Thread/Task 的 action，
 * 查子任务并构造 CascadePreview。
 *
 * 这是 Orchestrator 调度职责（分发阶段），不属业务逻辑。
 *
 * @returns Passed（无子任务或 cascade_ action 直通）| NeedConfirm（有子任务）
 */
async function cascadeCheck(
  intent: StructuredIntent,
  userId: USOM_ID,
  getRepo: OrchestratorDeps['getRepo'],
  manifest: DomainManifest | null,
): Promise<ValidationResult>
```

#### 5.2.2 检测逻辑

1. 提取 action，若以 `cascade_` 开头 → 返回 `Passed`（防递归）
2. 匹配 cascade 白名单：`completeTask | archiveTask | deleteTask | completeThread | archiveThread | deleteThread`
3. 不在白名单 → 返回 `Passed`
4. 从 manifest.cascade_rules 找匹配规则
5. 用 `getRepo('tasks', 'task')` 获取 TaskRepository
6. 查询子任务：
   - Thread action → `findByThread(parentId, userId)` 递归查所有后代
   - Task action → `findByParent(parentId, userId)` 递归查所有后代
7. 无子任务 → 返回 `Passed`
8. 构造 `CascadePreview` → 返回 `NeedConfirm({ source: 'cascade', cascadePreview })`

#### 5.2.3 递归查询算法

```typescript
/** 递归收集所有后代任务（BFS，按层级遍历） */
async function collectAllDescendants(
  parentId: USOM_ID,
  repo: GenericRepo,
  userId: USOM_ID,
): Promise<Task[]>
```

实现：
1. `queue = [parentId]`, `result = []`
2. 循环：取出队首 → `findByParent(id, userId)` → 将子任务加入 result 和 queue
3. 返回 result

备忘：`TaskRepository.findByParent` 已存在（第61行），`findByThread` 可通过 `findByUserId({ threadId })` 实现。

#### 5.2.4 拆分执行

在 `executeIntent` 中，`aggregated.kind === 'NeedConfirm'` 且 `data.source === 'cascade'`，`confirmed=true` 时：

```typescript
// 伪代码
const preview = (aggregated.data as any).cascadePreview as CascadePreview

// 1. 父 Intent 走完整链路
const parentResult = await sm.execute(proposal, eventBus, userId)
if (!parentResult.success) return { success: false, error: parentResult.error }

// 2. 遍历所有后代，逐个构造 cascade_ Intent
const childResults: OrchestratorResult[] = []
for (const child of preview.allDescendants) {
  const childIntent: StructuredIntent = {
    id: crypto.randomUUID(),
    intentionId: intent.intentionId,
    targetDomain: 'tasks',
    action: preview.cascadeAction,     // 'cascade_complete' | 'cascade_archive' | 'cascade_delete'
    fields: { taskId: child.id, title: child.title },
    confidence: 1.0,
    resolvedBy: 'template_form',
    pathType: 'contract',
    createdAt: new Date().toISOString(),
  }
  const r = await orchestrator.executeIntent(childIntent, userId)
  childResults.push(r)
}

// 3. 聚合结果
const allSuccess = childResults.every(r => r.success)
return {
  success: allSuccess,
  object: parentResult.object,
  objectType: parentResult.objectType,
  warnings: [`级联操作完成：${preview.totalCount} 个子任务已处理`],
}
```

### 5.3 S3: 双重约束规则

**文件**：`frontend/src/domains/tasks/rules-registry.ts`

注意：SubmitCheck 在 `evaluateDomainRules` 中执行，当前 `repos: {}`。双重约束校验需要查 Thread/Task 状态。

**方案**：由于 SubmitCheck 无法获取 repos，将双重约束实现为一个独立的 **onValidate 前置校验**，在 `createTasksHooks` 中通过注入 repos 完成。这与级联检测在 Orchestrator 中的理由相同——需要 DB 访问。

但更简单的做法是：在 `createTasksHooks` 的签名中新增可选的 `repos` 参数（仿 habits 的 `HabitsEventRepos`），在 onValidate 中调用 `evaluateDomainRules` 之前先做双重约束检查。

**调整后的 hooks.ts**：

```typescript
export interface TasksHookRepos {
  taskRepo: TaskRepository
  threadRepo: ThreadRepository
}

export function createTasksHooks(
  manifest: DomainManifest,
  repos?: TasksHookRepos,
) {
  // ...
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    const normalizedFields = normalizeFieldValues(intent.fields)
    const normalizedIntent = { ...intent, fields: normalizedFields }

    // 双重约束检查（需要 repos）
    if (repos && intent.action === 'createTask') {
      const errors: string[] = []
      const threadId = normalizedFields.threadId as string | undefined
      const parentId = normalizedFields.parentId as string | undefined

      if (threadId) {
        const thread = await repos.threadRepo.findById(threadId, snapshot.userId)
        if (thread && ['completed', 'archived'].includes(thread.status)) {
          errors.push('无法在已完成/已归档的主线下创建任务')
        }
      }
      if (parentId) {
        const parent = await repos.taskRepo.findById(parentId, snapshot.userId)
        if (parent && ['completed', 'archived', 'deleted'].includes(parent.status)) {
          errors.push('无法在已完成/已归档/已删除的任务下创建子任务')
        }
      }
      if (errors.length > 0) return validationRejected(errors)
    }

    return evaluateDomainRules('tasks', normalizedIntent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, taskRuleRegistry)
  }
}
```

**tasks/index.ts 调整**：repos 注入时机——当前 `createTasksHooks` 在 import 时无参数调用。需要改为延迟创建或在运行时注入。由于 DomainPlugin 在 import 时创建，最简方案是**在 Orchestrator 的 executeIntent 中也处理双重约束**（对称于 cascadeCheck），但这分散了职责。

**最终方案**：双重约束放在 Orchestrator 的 `cascadeCheck` 同层（另一个 step 函数 `parentConstraintCheck`），因为 Orchestrator 有 repos 访问，且属于调度前置校验。这样避免改变 hooks 签名。

### 5.4 S4: 清理旧 cascade.ts

**文件**：`frontend/src/nexus/core/state-machine/cascade.ts`

#### 变更内容

1. `executeCascade` 函数保留（okrs 域 Objective→KR 可能未来复用），但：
   - 在 tasks 域不再被调用
   - 确认 Orchestrator 不再通过 `getCascadeRules` 传 cascade_rules 给 SM（因为级联执行现在在 Orchestrator 拆分阶段完成，SM 只处理单对象转换）

2. **Orchestrator 变更**：`executeIntent` 中现有的 cascade 传参逻辑：

```typescript
// 现有代码（需移除/条件跳过 tasks 域）：
const cascadeRules = manifestResult.success
  ? (manifestResult.manifest.cascade_rules?.filter(...) ?? [])
  : []

const sm = createGenericStateMachine({
  // ...
  getCascadeRules: cascadeRules.length > 0 ? () => cascadeRules as any : undefined,
})
```

对于 tasks 域，`getCascadeRules` 应传 `undefined`（因为级联执行已由 Orchestrator 接管）。对于 okrs 域（未来），可保留旧路径。

#### cascade.test.ts

现有 4 个测试针对 okrs 域的 Objective→KeyResult 场景。保留这些测试，确保不因 tasks 域变更而破坏 okrs 域旧路径。

### 5.5 S5: 集成测试

**文件**：`frontend/src/nexus/orchestrator/__tests__/cascade-check.test.ts`（新建）

测试场景：

| # | 场景 | 预期 |
|---|------|------|
| T1 | completeTask 无子任务 | cascadeCheck → Passed，正常完成 |
| T2 | completeTask 有 1 个直接子任务 | cascadeCheck → NeedConfirm(CascadePreview: directCount=1, totalCount=1) |
| T3 | completeTask 有 2 级子任务 | cascadeCheck → NeedConfirm(CascadePreview: directCount=2, totalCount=5) |
| T4 | deleteTask 有 archived 子任务 | cascadeCheck → NeedConfirm（filter 包含 archived） |
| T5 | cascade_complete action 直通 | cascadeCheck → Passed（不递归） |
| T6 | createTask action 不触发 | cascadeCheck → Passed |
| T7 | confirmed=true + 有子任务 | 父+子全部执行成功 |
| T8 | completeThread 级联其下所有 task | findByThread 查询 + 递归 |
| T9 | 双重约束：completed thread 下 createTask | → Rejected |
| T10 | 双重约束：archived parent 下 createTask | → Rejected |
| T11 | 确认取消 | confirmed≠true → 不执行 |

---

## 6. 文件变更清单

| 文件 | 切片 | 操作 | 说明 |
|------|------|------|------|
| `domains/tasks/manifest.yaml` | S1 | 修改 | +cascade_rules 区块、+cascade_ 转换、+3 事件类型 |
| `domains/tasks/subscribed_events` (manifest) | S1 | 修改 | +3 cascade 事件 |
| `domains/tasks/transitions.ts` | S1 | 修改 | +3 cascade 转换定义 |
| `nexus/orchestrator/index.ts` | S2, S4 | 修改 | +cascadeCheck、+parentConstraintCheck、+拆分执行；tasks 域跳过 SM cascade |
| `nexus/orchestrator/__tests__/cascade-check.test.ts` | S5 | 新建 | 11 个测试场景 |
| `nexus/core/state-machine/cascade.ts` | S4 | 不变 | 保留（okrs 未来复用） |
| `domains/manifest-loader/schema.ts` | S1 | 可能修改 | CascadeChildRuleSchema +cascade_action 字段；意图 action→cascade_action 映射 |

---

## 7. 风险与边界

### 7.1 不在本次范围

- **CNUI Suspend 完整回环**（⑥）：cascade confirm 复用现有 `needsConfirmation`/`confirmationMessage` surfacing，不持久化挂起 Intent
- **complete/archive 级联**的 CNUI 入口：现有 ThreadActionPanel / TaskTreeView 等 surface 已覆盖
- **okrs 域级联**（Objective→KR）：旧 cascade.ts 路径保留，本设计不改变
- **级联回滚**：若部分子任务失败，已执行的不回滚（与现有行为一致）

### 7.2 关键约束

- Thread 自身状态转换**不走级联**，严格手动 lifecycle
- 父对象必须先于子对象执行（父成功后才级联子）
- cascade_ 子 Intent 不触发递归级联检测（action 前缀跳过）
- 所有子 Intent 通过 submitDynamicIntent 间接走完整 Nexus 链路（onValidate → RuleEngine → SM → 写入口）

---

## 8. 验收标准

1. `completeTask` 有子任务时弹出确认卡，确认后父子全部完成
2. `archiveThread` 级联归档其下所有未归档未删除 task
3. `deleteTask` 级联软删所有后代（含 archived 状态）
4. `cascade_` action 不触发二次级联检测
5. 双重约束生效：completed/archived thread 下无法 createTask
6. 现有 okrs cascade 测试保持通过
7. tsc 零新增错误、已有测试零回归
8. browser E2E：complete → 确认卡弹出 → 确认 → 任务树子任务状态已更新
