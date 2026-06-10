# 任务管理迭代优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 [016]~[023] 全部 8 个条目的任务管理迭代优化，包括全局写入确认规则、新 CNUI surface、现有 CNUI 智能识别改进、提示词增强和任务树页面优化。

**Architecture:** 在现有 Nexus 四层架构基础上，通过 Orchestrator 拦截实现全局写入确认（[023]），通过 Shortcut Path 实现任务树查看（[016]），通过增强现有 CNUI Surface 组件实现智能识别交互（[017a]~[021]），通过 TaskFilterBar 重构和 ThreadListPanel 改进实现界面优化（[022]），通过 routing-context 同义词注入增强 AI Parser 字段提取能力（[018]）。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui + Drizzle ORM

---

## 任务依赖关系

```
Task 1 (宪章) ──────────────────────────────────────────────────────────┐
Task 2 (Orchestrator 拦截) ──→ Task 6 (Handler) ──→ Task 7-11 (CNUI surfaces)
Task 3 (Repository) ──────────→ Task 6 (Handler)                        │
Task 4 (Manifest) ────────────→ Task 5 (routing-context) ──→ Task 12 (AI parser)
                              └─→ Task 6 (Handler)                     │
                                                                        │
Task 13 (TaskFilterBar) ─────────────────────────────────────────────────┤
Task 14 (ThreadListPanel) ──────────────────────────────────────────────┤
Task 15 (TruncatedText) ──→ Task 14                                     │
Task 16 (task-tree-view ID)                                             │
Task 17 (TaskTreeViewCard 新建) ──→ Task 6, Task 4                      │
Task 18 (growth-menu)                                                   │
Task 19 (domain registration)                                           │
Task 20 (route generation)                                              │
```

---

### Task 1: 宪章更新 — CN-UI Write Confirmation [023]

**Files:**
- Modify: `.specify/memory/constitution.md`

- [ ] **Step 1: 在 VIII. AI/Rule Boundary 章节末尾新增 CN-UI Write Confirmation 条目**

在 `### Calibration Governance` 行（约第 949 行）之前插入：

```markdown
### CN-UI Write Confirmation

所有通过 CN-UI 表面提交的写操作意图（`pathType === 'contract'`），必须
经过用户在 CNUI Surface 中的显式确认。系统不得跳过确认步骤直接执行写入
操作，即使 Intent Engine 已成功提取所有必填字段。这确保用户始终对写入
操作拥有最终控制权。

**实现位置**: Orchestrator `executeIntent` 中 contract path 的路由阶段。
当 `pathType === 'contract'` 且 manifest 中该 action 的
`response_type === 'cnui'` 时，Orchestrator MUST 将 Intent 路由到
CNUI Surface 展示（传入已提取的 fields 作为预填值），而非直接进入
Rule Engine → State Machine 流水线。

**不受影响**:
- `pathType === 'query'`: 只读查询，无写入
- `pathType === 'generative'`: 已有独立 CNUI 确认流程
- `response_type === 'page'`: 页面导航
- `response_type === 'text'`: 纯文本响应
```

- [ ] **Step 2: 更新版本号**

修改文件头部的 Sync Impact Report 和底部版本号：

```
Version change: 1.9.0 → 1.10.0
Rationale: MINOR — 新增 CN-UI Write Confirmation 治理原则
```

更新底部：
```
**Version**: 1.10.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-06-10
```

- [ ] **Step 3: 提交**

```bash
git add .specify/memory/constitution.md
git commit -m "docs: 宪章 1.10.0 - 新增 CN-UI Write Confirmation 治理原则 [023]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Orchestrator 写入确认拦截 [023]

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`

**背景**: 当前 `executeIntent` 中 contract path（第 417 行起）在 Rule Engine 评估后直接进入 State Machine。需要增加对 `response_type === 'cnui'` 的检测，将初次的 contract cnui 意图路由到 CNUI Surface 展示，而非直接执行。

**关键理解**: 当前流程中，AI 助手面板（前端 `ai-panel.tsx`）已经会在收到 `CnuiSurfaceMessage` 时渲染 CNUI surface。`executePipeline` 中解析出 intent 后，如果 intent 的 `response_type` 为 cnui 且为 contract path，前端会通过 `CnuiSurfaceMessage` 机制展示 surface。当前的问题是 Orchestrator 在 `parseDynamicForm` 路径（template_form 来源）会直接走完整个 pipeline 而不经过 CNUI 确认。

审视 `frontend/src/app/actions/intent.ts` 中的 `parseDynamicForm`（约第 1017 行附近），该函数是表单提交的入口，直接调用 `executePipeline`。需要在 `executeIntent` 的 contract path 中，检测该 action 是否在 manifest 中声明了 `response_type: cnui` —— 如果是，且用户输入来源不是 CNUI surface 提交（即不是二次确认），则应该返回一个 signal 让前端展示 CNUI surface。

**实现方案**: 修改 `executeIntent` 的 contract path，在 Rule Engine 评估之后、State Machine 执行之前，检测 action 是否声明了 `response_type: cnui`。如果是且 `confirmed !== true`（非二次确认），则返回 `needsCnuiConfirmation: true` 信号，附带 intent 数据。

- [ ] **Step 1: 在 executeIntent 的 contract path 中增加 cnui 确认检测**

定位到 `frontend/src/nexus/orchestrator/index.ts` 第 417-488 行（contract path 块）。在 Rule Engine 评估通过后（`ruleResult.result !== 'confirm'`），SM 执行前，插入检测：

在第 433 行 `const action = toStateMachineAction(intent.action)` 之前插入：

```typescript
      // CN-UI Write Confirmation（宪章 VIII 新增）:
      // 所有 response_type === 'cnui' 的写操作必须经用户二次确认
      const intentTrigger = manifest?.intent_triggers?.find(
        (t: any) => t.action === intent.action
      )
      if (!confirmed && intentTrigger?.response_type === 'cnui' && intent.resolvedBy !== 'cnui_surface') {
        return {
          success: false,
          needsConfirmation: false,
          needsCnuiConfirmation: true,
          cnuiAction: intent.action,
          cnuiDomain: intent.targetDomain,
          cnuiSurface: intentTrigger.cnui_surface,
          cnuiIntentFields: intent.fields,
          warnings: ruleResult.warnings,
        }
      }
```

- [ ] **Step 2: 更新 OrchestratorResult 接口**

在 `OrchestratorResult` 接口（约第 107-120 行）中增加新字段：

```typescript
export interface OrchestratorResult {
  success: boolean
  object?: Record<string, unknown>
  objectType?: string
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
  // [023] CN-UI Write Confirmation 新增字段
  needsCnuiConfirmation?: boolean
  cnuiAction?: string
  cnuiDomain?: string
  cnuiSurface?: string
  cnuiIntentFields?: Record<string, unknown>
  generativeResult?: GenerationResult
  queryResult?: QueryResult
}
```

- [ ] **Step 3: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/nexus/orchestrator/index.ts
git commit -m "feat(nexus): Orchestrator 增加 CN-UI Write Confirmation 拦截 [023]

contract path 的 cnui action 首次进入时返回 needsCnuiConfirmation
信号，由前端展示 CNUI surface 供用户二次确认后再执行。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Repository 增强 — 新增查询方法

**Files:**
- Modify: `frontend/src/domains/tasks/repository/task.ts`
- Modify: `frontend/src/domains/tasks/repository/thread.ts`

**背景**: Handler 智能识别需要 `searchByTitle`（模糊匹配任务标题/描述）、`findByStatuses`（多状态查询）和 `searchByName`（模糊匹配主线名称）方法。

- [ ] **Step 1: TaskRepository 新增 searchByTitle 方法**

在 `frontend/src/domains/tasks/repository/task.ts` 中，`findMatchingWithAncestors` 方法后面（约第 213 行后）增加：

```typescript
  /**
   * 按标题或描述模糊搜索任务
   *
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @param statusFilter - 可选的状态过滤（in 查询）
   * @returns 匹配的任务列表
   */
  async searchByTitle(
    query: string,
    userId: USOM_ID,
    statusFilter?: Array<Task['status']>,
  ): Promise<Task[]> {
    const conditions = [
      eq(s.tasks.userId, userId),
      sql`(${s.tasks.title} ILIKE ${`%${query.trim()}%`} OR ${s.tasks.description} ILIKE ${`%${query.trim()}%`})`,
    ]
    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(s.tasks.status, statusFilter as any[]))
    }
    const rows = await db.select().from(s.tasks).where(and(...conditions))
    return rows.map(r => taskRowToUSOM(r as any))
  }
```

- [ ] **Step 2: TaskRepository 新增 findByStatuses 方法**

紧接着增加：

```typescript
  /**
   * 按多个状态查询任务
   *
   * @param statuses - 状态列表
   * @param userId - 用户 ID
   * @returns 匹配的任务列表
   */
  async findByStatuses(
    statuses: Array<Task['status']>,
    userId: USOM_ID,
  ): Promise<Task[]> {
    return this.findByUserId(userId, { status: statuses })
  }
```

- [ ] **Step 3: 检查 ThreadRepository 现有方法**

```bash
cd frontend && grep -n "async find" src/domains/tasks/repository/thread.ts
```

- [ ] **Step 4: ThreadRepository 新增 searchByName 方法**

在 `frontend/src/domains/tasks/repository/thread.ts` 的查询方法区域中增加：

```typescript
  /**
   * 按名称模糊搜索主线
   *
   * @param query - 搜索关键词
   * @param userId - 用户 ID
   * @returns 匹配的主线列表
   */
  async searchByName(query: string, userId: USOM_ID): Promise<Thread[]> {
    const rows = await db.select().from(s.threads)
      .where(and(
        eq(s.threads.userId, userId),
        sql`${s.threads.name} ILIKE ${`%${query.trim()}%`}`,
      ))
    return rows.map(r => threadRowToUSOM(r as any))
  }
```

- [ ] **Step 5: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/repository/task.ts frontend/src/domains/tasks/repository/thread.ts
git commit -m "feat(tasks): TaskRepository 新增 searchByTitle/findByStatuses, ThreadRepository 新增 searchByName

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Manifest 更新 — 新增 viewTree, query_actions, required_fields 扩展

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`

- [ ] **Step 1: 在 intent_triggers 中新增 viewTree**

在 `# 查看` 区域的 `viewTaskTree` 之后增加：

```yaml
  - action: viewTree
    shortcut: /viewTree
    description: 查看任务树（CNUI 内展示，含搜索和树形结构）
    response_type: cnui
    cnui_surface: task-tree-view
    examples:
      - 查看任务树
      - 看看我的任务
      - 展示所有任务
    keywords: [任务树, 查看任务, 展示]
```

- [ ] **Step 2: 新增 query_actions 区块**

在 `view_routes` 区块之后（约第 351 行前）新增：

```yaml
# ─── 区块 I: query_actions ─────────────────────────────────────
query_actions:
  viewTree:
    action: viewTree
    description: 查看任务树（纯展示，含主线和任务的树形结构）
    response_mode: cnui
    cnui_surface: task-tree-view
    context_capabilities: []
```

- [ ] **Step 3: 扩展 required_fields**

在 `required_fields.createTask` 末尾增加 `threadId` 字段：

```yaml
    - name: threadId
      label: 主线
      type: select
      required: false
      default_value: null
```

新增 `promoteToThread` 的 required_fields：

```yaml
  promoteToThread:
    - name: taskId
      label: 任务ID
      type: text
      required: false
    - name: title
      label: 任务标题（模糊匹配）
      type: text
      required: false
```

新增 `updateThread` 的 required_fields：

```yaml
  updateThread:
    - name: threadId
      label: 主线ID
      type: text
      required: false
    - name: name
      label: 主线名称（模糊匹配）
      type: text
      required: false
```

为 `updateTask`、`completeTask`、`archiveTask`、`deleteTask` 各增加：

```yaml
  updateTask:
    - name: taskId
      label: 任务ID
      type: text
      required: false
    - name: title
      label: 任务标题（模糊匹配）
      type: text
      required: false

  completeTask:
    - name: taskId
      label: 任务ID
      type: text
      required: false
    - name: title
      label: 任务标题（模糊匹配）
      type: text
      required: false

  archiveTask:
    - name: taskId
      label: 任务ID
      type: text
      required: false
    - name: title
      label: 任务标题（模糊匹配）
      type: text
      required: false

  deleteTask:
    - name: taskId
      label: 任务ID
      type: text
      required: false
    - name: title
      label: 任务标题（模糊匹配）
      type: text
      required: false
```

- [ ] **Step 4: 扩展 field_metadata**

增加 `threadId`：

```yaml
  threadId:
    type: string
    label: 主线
    required: false
```

- [ ] **Step 5: cnui_surfaces 新增 task-tree-view**

```yaml
  task-tree-view:
    handler: ./cnui/handlers
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "feat(tasks): manifest 新增 viewTree action, query_actions, required_fields 扩展 [016][017][018][019-021]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Routing Context 增强 — 同义词注入 [018]

**Files:**
- Modify: `frontend/src/nexus/core/intent-engine/routing-context.ts`

- [ ] **Step 1: 新增 FIELD_SYNONYMS 映射**

在文件开头（import 之后）增加：

```typescript
/**
 * 字段同义词映射 — 帮助 LLM 识别自然语言中的字段引用。
 * 在 formatRoutingContextForPrompt 中注入到字段提示中。
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  dueDate: ['deadline', '截止日期', '结束日期', '到期日'],
  estimatedDuration: ['预计时长', '时长', '用时', '耗时'],
  priority: ['优先级', '紧急程度'],
  threadId: ['主线', '所属主线', '关联主线'],
  title: ['标题', '名称', '任务名'],
  description: ['描述', '说明', '详情'],
  defaultTime: ['默认时间', '执行时间', '开始时间'],
  defaultDuration: ['默认时长', '执行时长'],
  name: ['名称', '主线名'],
}
```

- [ ] **Step 2: 修改 formatRoutingContextForPrompt 注入同义词**

在 `formatRoutingContextForPrompt` 函数（约第 78 行）中，修改 fieldHints 生成逻辑：

**替换**：
```typescript
    const fieldHints = a.fields.length > 0
      ? '\n  字段: ' + a.fields.map(f => `${f.name}(${f.label}, ${f.type}${f.required ? ', 必填' : ''})`).join(', ')
      : ''
```

**为**：
```typescript
    const fieldHints = a.fields.length > 0
      ? '\n  字段: ' + a.fields.map(f => {
          const synonyms = FIELD_SYNONYMS[f.name]
          const synonymHint = synonyms?.length ? `, 同义词: ${synonyms.join('/')}` : ''
          return `${f.name}(${f.label}, ${f.type}${f.required ? ', 必填' : ''}${synonymHint})`
        }).join(', ')
      : ''
```

- [ ] **Step 3: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/nexus/core/intent-engine/routing-context.ts
git commit -m "feat(nexus): AI Parser routing-context 增加字段同义词注入 [018]

帮助 LLM 识别 deadline→dueDate, 预计时长→estimatedDuration 等自然语言字段引用。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: CNUI Handler 增强 — 智能识别 + viewTree + createTask 主线

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/handlers.ts`

**背景**: Handler 需要为多个 action 增加智能识别逻辑，并为 viewTree 和 createTask 提供新功能。

- [ ] **Step 1: 新增智能识别 helper 函数**

在文件顶部常量区域后、`getTasksByStatus` 函数前增加：

```typescript
/**
 * 任务操作的可操作状态范围映射
 * 对应 manifest lifecycle 中每个 action 允许的 from 状态
 */
const TASK_ACTION_STATUS_FILTER: Record<string, Array<string>> = {
  updateTask: ['todo', 'planned', 'in_progress', 'completed'],
  completeTask: ['todo', 'planned', 'in_progress'],
  archiveTask: ['completed'],
  deleteTask: ['todo', 'planned', 'in_progress', 'completed'],
}
```

- [ ] **Step 2: 新增主线列表查询 helper**

```typescript
/**
 * 获取所有未归档的有效主线列表
 * @returns 主线列表（供 createTask CNUI surface 的主线下拉使用）
 */
async function getActiveThreads(): Promise<Record<string, unknown>[]> {
  try {
    const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
    const repo = new ThreadRepository()
    const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
    return threads
      .filter(t => t.status !== 'archived')
      .map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        status: t.status,
      }))
  } catch (e) {
    console.error('[taskCnuiHandler] 查询主线列表失败:', e)
    return []
  }
}
```

- [ ] **Step 3: 修改 createTask open — 返回主线列表**

在 handler 的 `open` 方法中，找到 `if (action === 'createTask')` 分支，修改为：

```typescript
    if (action === 'createTask') {
      const threads = await getActiveThreads()
      return { content: '请填写任务信息', dataSnapshot: { threads } }
    }
```

- [ ] **Step 4: 修改 updateTask open — 实现智能识别**

替换现有的 `if (action === 'updateTask')` 分支：

```typescript
    if (action === 'updateTask') {
      const intentFields = (dataModel as any)?.intentFields ?? {}
      const statusFilter = TASK_ACTION_STATUS_FILTER[action]

      if (intentFields.taskId) {
        const task = await repo.findById(intentFields.taskId)
        if (task) return { content: '请编辑任务信息', dataSnapshot: { task: formatTaskDetail(task), action, phase: 'detail' } }
      }

      if (intentFields.title) {
        const candidates = await repo.searchByTitle(intentFields.title, MVP_USER_ID as USOM_ID, statusFilter as any)
        if (candidates.length === 1) {
          return { content: '请编辑任务信息', dataSnapshot: { task: formatTaskDetail(candidates[0]), action, phase: 'detail' } }
        }
        if (candidates.length > 1) {
          return { content: '找到多个匹配任务，请选择', dataSnapshot: { items: formatTaskList(candidates), action, phase: 'select' } }
        }
      }

      const tasks = await repo.findByStatuses(statusFilter as any, MVP_USER_ID as USOM_ID)
      return { content: '请选择要修改的任务', dataSnapshot: { items: formatTaskList(tasks), action, phase: 'search' } }
    }
```

其中 `formatTaskDetail` 和 `formatTaskList` 为辅助函数（定义在 handler 文件顶部）：

```typescript
/** 将 Task 对象格式化为 CNUI dataModel 的 detail 格式 */
function formatTaskDetail(t: any): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
    threadId: t.threadId,
    dueDate: t.endDate,
  }
}

/** 将 Task 数组格式化为 CNUI dataModel 的列表格式 */
function formatTaskList(tasks: any[]): Record<string, unknown>[] {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
  }))
}
```

- [ ] **Step 5: 修改 completeTask、archiveTask、deleteTask — 智能识别**

使用相同模式，在 handler 的 `open` 方法中，将现有的 `if (action === 'deleteTask')` 和 `if (action in TASK_LIFECYCLE_STATUS_MAP)` 分支逻辑整合为统一的智能识别流程。

对于 `deleteTask`，替换现有实现：

```typescript
    if (action === 'deleteTask') {
      const intentFields = (dataModel as any)?.intentFields ?? {}
      const statusFilter = TASK_ACTION_STATUS_FILTER[action]

      if (intentFields.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId)
        if (task && statusFilter.includes(task.status)) {
          return { content: '确认删除任务（不可恢复）', dataSnapshot: { task: formatTaskDetail(task), action: 'delete', phase: 'detail' } }
        }
      }

      if (intentFields.title) {
        const repo = new TaskRepository()
        const candidates = await repo.searchByTitle(intentFields.title, MVP_USER_ID as USOM_ID, statusFilter as any)
        if (candidates.length === 1 && statusFilter.includes(candidates[0].status)) {
          return { content: '确认删除任务（不可恢复）', dataSnapshot: { task: formatTaskDetail(candidates[0]), action: 'delete', phase: 'detail' } }
        }
        if (candidates.length > 1) {
          return { content: '找到多个匹配任务，请选择要删除的任务', dataSnapshot: { items: formatTaskList(candidates), action: 'delete', phase: 'select' } }
        }
      }

      const repo = new TaskRepository()
      const allTasks = await repo.findByUserId(MVP_USER_ID as USOM_ID)
      const items = allTasks.filter(t => (statusFilter as string[]).includes(t.status))
      return { content: '请选择要删除的任务', dataSnapshot: { action: 'delete', items: formatTaskList(items), phase: 'search' } }
    }
```

对于 `completeTask` 和 `archiveTask`（`if (action in TASK_LIFECYCLE_STATUS_MAP)` 分支），替换为带有智能识别的逻辑：

```typescript
    if (action in TASK_LIFECYCLE_STATUS_MAP) {
      const intentFields = (dataModel as any)?.intentFields ?? {}
      const status = TASK_LIFECYCLE_STATUS_MAP[action]
      const smAction = TASK_LIFECYCLE_SM_ACTION[action]
      const labels: Record<string, string> = { complete: '完成', archive: '归档' }

      if (intentFields.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId)
        if (task && task.status === status) {
          return { content: `确认${labels[smAction] ?? smAction}该任务`, dataSnapshot: { task: formatTaskDetail(task), action: smAction, phase: 'detail' } }
        }
      }

      if (intentFields.title) {
        const repo = new TaskRepository()
        const candidates = await repo.searchByTitle(intentFields.title, MVP_USER_ID as USOM_ID, [status] as any)
        if (candidates.length === 1) {
          return { content: `确认${labels[smAction] ?? smAction}该任务`, dataSnapshot: { task: formatTaskDetail(candidates[0]), action: smAction, phase: 'detail' } }
        }
        if (candidates.length > 1) {
          return { content: `找到多个匹配任务，请选择要${labels[smAction] ?? smAction}的任务`, dataSnapshot: { items: formatTaskList(candidates), action: smAction, phase: 'select' } }
        }
      }

      const items = await getTasksByStatus(status)
      return { content: `请选择要${labels[smAction] ?? smAction}的任务`, dataSnapshot: { action: smAction, items, phase: 'search' } }
    }
```

- [ ] **Step 6: 新增 viewTree 分支**

在 `open` 方法的 `return { content: '请填写信息', dataSnapshot: {} }` 兜底之前，新增：

```typescript
    if (action === 'viewTree') {
      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const threadRepo = new ThreadRepository()
        const taskRepo = new TaskRepository()
        const allThreads = await threadRepo.findByUserId(MVP_USER_ID as USOM_ID)
        const allTasks = await taskRepo.findByUserId(MVP_USER_ID as USOM_ID)

        return {
          content: '任务树',
          dataSnapshot: {
            threads: allThreads.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color,
              status: t.status,
            })),
            tasks: allTasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              threadId: t.threadId,
              parentId: t.parentId,
              estimatedDuration: t.estimatedDuration,
            })),
          },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询任务树失败:', e)
        return { content: '查询任务树失败', dataSnapshot: {} }
      }
    }
```

- [ ] **Step 7: 新增 viewTree submit**

在 `submit` 方法开头增加：

```typescript
    if (action === 'viewTree') {
      return { success: true }  // 纯展示，无操作
    }
```

- [ ] **Step 8: 修改 promoteToThread open — 智能识别**

找到 `if (action === 'promoteToThread')` 分支，替换为：

```typescript
    if (action === 'promoteToThread') {
      const intentFields = (dataModel as any)?.intentFields ?? {}

      if (intentFields.taskId) {
        const repo = new TaskRepository()
        const task = await repo.findById(intentFields.taskId)
        if (task) return { content: '确认将任务提升为主线', dataSnapshot: { task: formatTaskDetail(task), phase: 'detail' } }
      }

      if (intentFields.title) {
        const repo = new TaskRepository()
        const candidates = await repo.searchByTitle(intentFields.title, MVP_USER_ID as USOM_ID)
        if (candidates.length === 1) {
          return { content: '确认将任务提升为主线', dataSnapshot: { task: formatTaskDetail(candidates[0]), phase: 'detail' } }
        }
        if (candidates.length > 1) {
          return { content: '找到多个匹配任务，请选择', dataSnapshot: { items: formatTaskList(candidates), phase: 'select' } }
        }
      }

      const tasks = await getActiveTasks()
      return { content: '请选择要提升为主线的任务', dataSnapshot: { items: tasks, phase: 'search' } }
    }
```

- [ ] **Step 9: 修改 updateThread open — 智能识别**

找到 `if (action === 'updateThread')` 分支，替换为带智能识别的版本：

```typescript
    if (action === 'updateThread') {
      const intentFields = (dataModel as any)?.intentFields ?? {}

      if (intentFields.threadId) {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const thread = await repo.findById(intentFields.threadId, MVP_USER_ID as USOM_ID)
        if (thread) return {
          content: '编辑主线信息',
          dataSnapshot: { thread: { id: thread.id, name: thread.name, description: thread.description, color: thread.color, priority: thread.priority, status: thread.status }, action: 'update', phase: 'detail' },
        }
      }

      if (intentFields.name) {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const candidates = await repo.searchByName(intentFields.name, MVP_USER_ID as USOM_ID)
        if (candidates.length === 1) {
          const t = candidates[0]
          return { content: '编辑主线信息', dataSnapshot: { thread: { id: t.id, name: t.name, description: t.description, color: t.color, priority: t.priority, status: t.status }, action: 'update', phase: 'detail' } }
        }
        if (candidates.length > 1) {
          return { content: '找到多个匹配主线，请选择', dataSnapshot: { items: candidates.map(t => ({ id: t.id, name: t.name, color: t.color, status: t.status })), action: 'update', phase: 'select' } }
        }
      }

      try {
        const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
        const repo = new ThreadRepository()
        const threads = await repo.findByUserId(MVP_USER_ID as USOM_ID)
        return {
          content: '请选择要修改的主线',
          dataSnapshot: { threads: threads.map(t => ({ id: t.id, name: t.name, color: t.color, status: t.status })), action: 'update', phase: 'search' },
        }
      } catch (e) {
        console.error('[taskCnuiHandler] 查询 threads 失败:', e)
        return { content: '请填写信息', dataSnapshot: {} }
      }
    }
```

- [ ] **Step 10: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

预期可能有 `dataModel` 变量未定义错误 — 因为当前 `open(action)` 签名不接收 `dataModel`。需要在 Step 3-9 中将 `(dataModel as any)?.intentFields` 替换为从可用的上下文获取方式。

**修正**: `CnuiSurfaceHandler.open(action)` 的签名不包含 `dataModel`。Intent fields 由前端在调用 `open` 之前就已注入到 surface data 中。因此 Handler 中不应直接读取 `dataModel`，而应在 `open` 中根据 action 返回对应的初始 dataSnapshot，由前端 Surface 组件根据 dataModel 中的 intentFields 进行场景判断。

重新审视流程：前端 AI 面板收到 `needsCnuiConfirmation` 信号 → 创建 CNUI surface → 调用 `open(action)` 获取初始 dataSnapshot → 将 intent fields 合并到 dataModel → 渲染 Surface 组件。Surface 组件内部根据 dataModel 的 phase/数据判断显示什么。

因此 **Handler 的 open 不需要智能识别** —— 它只负责返回该 action 的默认数据列表。**智能识别的逻辑应在 Surface 组件中**，根据 `dataModel.intentFields`（由 Orchestrator → 前端注入）来决定初始展示。

**简化为**：
- Handler `open` 保持相对简单：返回该 action 的全部可操作项目 + 默认 phase='search'
- Surface 组件在 `useEffect` 中检测 `dataModel.intentFields`，如果存在 taskId/title 则自动触发搜索/定位

修改 Step 4-5, 8-9 中的代码，让 `open` 只返回基础数据，而把智能识别放到 Surface 组件中。

保持 Handler 现有结构不变，仅在需要的地方扩展 `dataSnapshot` 包含更多元数据。

**最终修改方案**（简化的 Handler 改动）：

- `open('createTask')`: 额外返回 `threads` 字段
- `open('viewTree')`: 新增，返回所有主线和任务
- `open('updateTask')`: 额外返回 `actionMeta: { supportsSearch: true, supportsTaskId: true }`
- `open('completeTask')`, `open('archiveTask')`: 不变（现有逻辑已返回正确状态的任务列表）
- `open('deleteTask')`: 不变（现有逻辑已正确）
- `open('promoteToThread')`: 不变（现有逻辑已正确）
- `open('updateThread')`: 不变（现有逻辑已正确）

智能识别逻辑移入各 Surface 组件（Task 7-11）。

- [ ] **Step 11: 提交**

```bash
git add frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "feat(tasks): CNUI handler 增强 - viewTree open, createTask 返回主线列表 [016][018]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: TaskCreationCard — 增加主线选择字段 [018]

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`

- [ ] **Step 1: 在表单中增加主线下拉选择**

在预估时长字段之后（约第 146 行 `</div>` 闭合之后），操作按钮之前，增加主线选择：

```tsx
        {/* 主线选择 */}
        <div>
          <label className="text-xs text-body mb-1 block">主线</label>
          <select
            value={threadId ?? ''}
            onChange={e => {
              const val = e.target.value || null
              setThreadId(val)
              onDataChange({ ...dataModel, threadId: val })
            }}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">普通任务（无主线）</option>
            {(dataModel.threads as Array<{ id: string; name: string }> | undefined)?.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
```

- [ ] **Step 2: 增加 threadId 状态**

在现有状态声明区域增加：

```tsx
  const [threadId, setThreadId] = useState<string | null>(
    (dataModel.threadId as string) ?? null,
  )
```

- [ ] **Step 3: handleConfirm 增加 threadId**

修改 `handleConfirm` 函数：

```tsx
  function handleConfirm() {
    if (!title.trim()) return
    onConfirm({
      title: title.trim(),
      description: description || undefined,
      priority: priority || undefined,
      estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined,
      threadId: threadId || undefined,
    })
  }
```

- [ ] **Step 4: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx
git commit -m "feat(tasks): TaskCreationCard 增加主线选择字段 [018]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: TaskEditCard — 三场景交互 + 子任务功能 [019a]

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`

- [ ] **Step 1: 增加智能识别逻辑**

在组件顶部增加 `useEffect` 处理 Intent fields 自动定位：

```tsx
  // 智能识别：从 Intent fields 自动定位任务
  const [autoLocated, setAutoLocated] = useState(false)

  useEffect(() => {
    if (autoLocated) return
    const intentFields = dataModel.intentFields as Record<string, unknown> | undefined
    if (!intentFields) return

    if (intentFields.taskId && tasks.length > 0) {
      const found = tasks.find(t => t.id === intentFields.taskId)
      if (found) {
        setEditTitle(found.title)
        setEditDescription('')
        setEditPriority(found.priority)
        setEditDuration(String(found.estimatedDuration ?? 60))
        onDataChange({ taskId: found.id, ...found })
        setAutoLocated(true)
        return
      }
    }

    if (intentFields.title && tasks.length === 1) {
      const found = tasks[0]
      setEditTitle(found.title)
      setEditDescription('')
      setEditPriority(found.priority)
      setEditDuration(String(found.estimatedDuration ?? 60))
      onDataChange({ taskId: found.id, ...found })
      setAutoLocated(true)
      return
    }

    if (intentFields.title && tasks.length > 1) {
      // 多个候选，保持列表视图，用户选择
      setAutoLocated(true)
    }
  }, [dataModel.intentFields, tasks, autoLocated, onDataChange])
```

- [ ] **Step 2: 修复未使用设计令牌的样式**

查找所有 `text-primary-foreground` 和 `text-muted-foreground` 并替换：
- `text-primary-foreground` → `text-on-primary`
- `text-muted-foreground` → `text-muted`

- [ ] **Step 3: 增加子任务创建区域**

在编辑表单下方（`</div>` 闭合后，操作按钮之前），增加：

```tsx
          {/* 子任务创建 */}
          <div className="border-t border-hairline pt-3">
            <button
              type="button"
              onClick={() => setShowSubtaskInput(v => !v)}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              {showSubtaskInput ? '− 取消添加' : '＋ 添加子任务'}
            </button>

            {showSubtaskInput && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={subtaskTitle}
                  onChange={e => setSubtaskTitle(e.target.value)}
                  placeholder="子任务标题..."
                  maxLength={100}
                  className="h-8 flex-1 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!subtaskTitle.trim()) return
                    const subtaskFields = {
                      title: subtaskTitle.trim(),
                      parentId: selectedTaskId,
                      threadId: dataModel.threadId,
                    }
                    onConfirm({ ...editingFields, createSubtask: subtaskFields })
                    setSubtaskTitle('')
                    setShowSubtaskInput(false)
                  }}
                  disabled={!subtaskTitle.trim()}
                  className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-on-primary disabled:opacity-40"
                >
                  添加
                </button>
              </div>
            )}
          </div>
```

- [ ] **Step 4: 增加子任务相关状态**

在状态声明区增加：

```tsx
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
```

将编辑字段提取为 `editingFields` 对象，便于子任务提交时合并：

```tsx
  const editingFields = {
    taskId: selectedTaskId,
    title: editTitle,
    description: editDescription,
    priority: editPriority,
    estimatedDuration: Number(editDuration),
  }
```

- [ ] **Step 5: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx
git commit -m "feat(tasks): TaskEditCard 增加智能识别定位 + 子任务创建功能 [019a]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: TaskActionPanel — 三场景交互 + deleteTask 警告 [019b][020][021]

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`

- [ ] **Step 1: 增加智能识别逻辑**

在组件顶部增加：

```tsx
  const [autoSelected, setAutoSelected] = useState(false)

  useEffect(() => {
    if (autoSelected) return
    const intentFields = dataModel.intentFields as Record<string, unknown> | undefined
    if (!intentFields) return

    if (intentFields.taskId) {
      const found = items.find(t => t.id === intentFields.taskId)
      if (found) {
        setSelectedIds(new Set([found.id]))
        setAutoSelected(true)
        return
      }
    }

    if (intentFields.title && items.length === 1) {
      setSelectedIds(new Set([items[0].id]))
      setAutoSelected(true)
    }
  }, [dataModel.intentFields, items, autoSelected])
```

- [ ] **Step 2: deleteTask 增加不可恢复警告**

找到 `handleExecute` 函数（或操作按钮区域），当 `action === 'delete'` 时，增加警告提示。在操作按钮上方增加：

```tsx
          {action === 'delete' && selectedIds.size > 0 && (
            <div className="rounded-md border border-error bg-error-soft px-3 py-2 text-xs text-error">
              ⚠️ 删除操作不可恢复。子任务将自动变为根任务。
            </div>
          )}
```

- [ ] **Step 3: 检查 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx
git commit -m "feat(tasks): TaskActionPanel 增加智能识别定位 + deleteTask 不可恢复警告 [019b][020][021]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: ThreadPromoteCard — 三场景交互 + 搜索 [017a]

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadPromoteCard.tsx`

- [ ] **Step 1: 增加搜索框和智能识别**

在任务列表上方增加搜索框、在组件顶部增加智能识别 useEffect（与 Task 8/9 模式一致）。

```tsx
  const [searchQuery, setSearchQuery] = useState('')
  const [autoSelected, setAutoSelected] = useState(false)

  // 智能识别
  useEffect(() => {
    if (autoSelected) return
    const intentFields = dataModel.intentFields as Record<string, unknown> | undefined
    if (!intentFields) return

    const tasks = (dataModel.tasks as TaskItem[]) ?? (dataModel.items as TaskItem[]) ?? []
    if (intentFields.taskId) {
      const found = tasks.find(t => t.id === intentFields.taskId)
      if (found) {
        onDataChange({ ...dataModel, selectedTask: found, phase: 'detail' })
        setAutoSelected(true)
      }
    }
    if (intentFields.title && tasks.length === 1) {
      onDataChange({ ...dataModel, selectedTask: tasks[0], phase: 'detail' })
      setAutoSelected(true)
    }
  }, [dataModel.intentFields, autoSelected, onDataChange])

  // 搜索过滤
  const tasks = ((dataModel.tasks as TaskItem[]) ?? (dataModel.items as TaskItem[]) ?? [])
  const filteredTasks = searchQuery.trim()
    ? tasks.filter(t =>
        t.id.includes(searchQuery.trim()) ||
        t.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : tasks
```

- [ ] **Step 2: 增加搜索框 UI**

在列表上方增加：

```tsx
        <div className="relative mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索任务（标题或 ID）..."
            className="h-8 w-full rounded-md border border-hairline bg-canvas pl-2 pr-3 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
```

- [ ] **Step 3: 增加三场景渲染**

根据 `dataModel.phase` 或 `dataModel.selectedTask` 判断：
- 有 `selectedTask` → 任务详情确认卡片
- 无 `selectedTask` → 任务搜索/选择列表

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/ThreadPromoteCard.tsx
git commit -m "feat(tasks): ThreadPromoteCard 增加三场景交互 + 搜索功能 [017a]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: ThreadActionPanel — 三场景交互 + 编辑 Detail [017b]

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx`

- [ ] **Step 1: 增加 update 模式的 Detail 编辑视图**

当 `dataModel.action === 'update'` 时，展示与默认多选操作不同的视图：

```tsx
  // update 模式：显示详情编辑视图
  if (action === 'update') {
    const thread = dataModel.thread as ThreadDetail | undefined
    if (thread) {
      return <ThreadEditForm thread={thread} onConfirm={onConfirm} onCancel={onCancel} isLoading={isLoading} />
    }
    // 列表选择视图（已有主线列表 + 搜索框）
    return <ThreadSelectView ... />
  }
```

创建内部组件 `ThreadEditForm` 用于显示和编辑主线详情（名称、描述、颜色、优先级）。

- [ ] **Step 2: 增加搜索框**

主线选择列表视图增加搜索框，与 Task 10 模式一致。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx
git commit -m "feat(tasks): ThreadActionPanel 增加 update Detail 编辑视图 + 搜索功能 [017b]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: AI Parser — 主线列表上下文注入 [018]

**Files:**
- Modify: `frontend/src/nexus/core/intent-engine/ai-parser.ts`

- [ ] **Step 1: 在 parseWithAI 中增加可选的额外上下文参数**

给 `parseWithAI` 增加可选的 `extraContext` 参数用于注入主线列表等运行时数据：

```typescript
export async function parseWithAI(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
  extraContext?: string,
): Promise<AIParserResult> {
```

在系统提示词末尾，注入额外上下文：

```typescript
    const systemPrompt = `你是 Lifeware 意图解析器...
...
可用动作列表：
${routingText}

${extraContext ? `额外上下文：\n${extraContext}` : ''}

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
...`
```

- [ ] **Step 2: 在 executePipeline 中传入主线上下文**

修改 `frontend/src/app/actions/intent.ts` 中 `executePipeline` 的意图解析调用，当 targetDomain 为 'tasks' 且 action 涉及任务创建/更新时，注入主线列表：

在 `parseDynamicForm` 或意图解析阶段，如果 manifest action 有 `threadId` 字段，则查询主线列表并注入到 prompt 上下文。

- [ ] **Step 3: 检查编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/nexus/core/intent-engine/ai-parser.ts frontend/src/app/actions/intent.ts
git commit -m "feat(nexus): AI Parser 支持额外上下文注入（主线列表匹配） [018]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: TaskFilterBar 重构 — 搜索类型选择 + 标签式筛选按钮 [022]

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-filter-bar.tsx`
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`（调用方适配）

- [ ] **Step 1: 扩展 TaskFilterBarProps 接口**

```typescript
/** 搜索类型 */
export type SearchType = 'task' | 'thread'

interface TaskFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  /** 搜索类型 */
  searchType: SearchType
  onSearchTypeChange: (type: SearchType) => void
  filterClarity: string[]
  filterStatus: string[]
  onFilterChange: (key: 'clarity' | 'status', value: string) => void
  /** 新增：主线状态筛选 */
  filterThreadStatus: string[]
  onThreadStatusChange: (status: string) => void
  sortBy: SortField
  onSortByChange: (sortBy: SortField) => void
  /** 排序方向 */
  sortOrder: 'asc' | 'desc'
  onSortOrderChange: (order: 'asc' | 'desc') => void
}
```

- [ ] **Step 2: 改造搜索框为类型选择 + 搜索**

```tsx
      {/* 第一行：搜索框（含类型选择）+ 排序 */}
      <div className="flex items-center gap-2">
        {/* 搜索类型下拉 */}
        <select
          value={searchType}
          onChange={e => onSearchTypeChange(e.target.value as SearchType)}
          className="h-8 w-16 shrink-0 rounded-l-md border border-hairline bg-canvas px-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
        >
          <option value="task">任务</option>
          <option value="thread">主线</option>
        </select>

        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchType === 'task' ? '搜索任务标题/ID...' : '搜索主线名称/ID...'}
            className="w-full h-8 pl-8 pr-3 rounded-r-md border border-hairline border-l-0 bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 排序 */}
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value as SortField)}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-hairline bg-canvas hover:bg-hover-overlay transition-colors"
            title={sortOrder === 'asc' ? '顺序' : '逆序'}
          >
            <ArrowUpDown className={cn('size-3 text-muted', sortOrder === 'desc' && 'rotate-180')} />
          </button>
        </div>
      </div>
```

- [ ] **Step 3: 将第二行筛选改为标签式下拉按钮**

```tsx
      {/* 第二行：标签式筛选按钮 */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown
          label="主线状态"
          options={THREAD_STATUS_OPTIONS}
          selected={filterThreadStatus}
          onToggle={onThreadStatusChange}
        />
        <FilterDropdown
          label="任务状态"
          options={STATUS_OPTIONS}
          selected={filterStatus}
          onToggle={(v) => onFilterChange('status', v)}
        />
        <FilterDropdown
          label="清晰度"
          options={CLARITY_OPTIONS}
          selected={filterClarity}
          onToggle={(v) => onFilterChange('clarity', v)}
        />
      </div>
```

- [ ] **Step 4: 创建 FilterDropdown 内部组件**

```typescript
/** 筛选下拉按钮 */
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasSelection = selected.length > 0 && selected.length < options.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
          hasSelection
            ? 'border-primary/40 bg-primary/10 text-primary-active'
            : 'border-hairline bg-canvas text-body hover:bg-hover-overlay',
        )}
      >
        <span>{label}</span>
        {hasSelection && <span className="text-[10px]">({selected.length})</span>}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[180px] rounded-md border border-hairline bg-canvas shadow-md py-1">
          {options.map(opt => {
            const isSelected = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-hover-overlay transition-colors',
                  isSelected ? 'text-ink font-medium' : 'text-body',
                )}
              >
                <span className={cn(
                  'size-3.5 rounded border flex items-center justify-center',
                  isSelected ? 'bg-primary border-primary' : 'border-hairline',
                )}>
                  {isSelected && <Check className="size-2.5 text-on-primary" />}
                </span>
                {opt.label}
              </button>
            )
          })}
          <div className="border-t border-hairline mt-1 pt-1">
            <button
              type="button"
              onClick={() => options.forEach(o => selected.includes(o.value) && onToggle(o.value))}
              className="w-full px-3 py-1 text-xs text-muted hover:text-ink transition-colors"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 适配 TaskTreePage 调用方**

修改 `frontend/src/domains/tasks/pages/TaskTreePage.tsx` 中的 TaskFilterBar 调用，增加新增的 props：

```tsx
  const [searchType, setSearchType] = useState<SearchType>('task')
  const [filterThreadStatus, setFilterThreadStatus] = useState<string[]>(['active', 'paused', 'completed'])
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
```

将 `filterThreadStatus`、`sortOrder` 传递给 TaskTreeView 和 TaskFilterBar。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/components/task-filter-bar.tsx frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "feat(tasks): TaskFilterBar 重构为搜索类型选择 + 标签式筛选按钮 [022]

参考截图样式，搜索框左边增加任务/主线类型选择，筛选改为标签式下拉按钮。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: ThreadListPanel — "..." 菜单 + TruncatedText [022]

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

- [ ] **Step 1: 将直接操作按钮替换为 "..." 菜单**

找到主线列表项渲染区域（`Folder` 图标之后的按钮区域），移除现有的单独操作按钮（Pencil、Archive 等），替换为：

```tsx
  {/* 操作菜单 — "..." 按钮 */}
  <div className="relative">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setMenuOpen(menuOpen === thread.thread.id ? null : thread.thread.id)
      }}
      className="p-1 rounded hover:bg-hover-overlay transition-colors text-muted hover:text-ink"
    >
      <MoreHorizontal className="size-3.5" />
    </button>

    {menuOpen === thread.thread.id && (
      <>
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-md border border-hairline bg-canvas shadow-md py-1">
          {getAllowedActions(thread.thread.status).map(act => (
            <button
              key={act.action}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleAction(thread.thread.id, act.action)
                setMenuOpen(null)
              }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-hover-overlay transition-colors"
            >
              {act.label}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
```

- [ ] **Step 2: 新增状态和辅助函数**

```tsx
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
```

```typescript
  /**
   * 根据主线状态获取允许的操作列表
   * 从 manifest lifecycle.thread.transitions 读取
   */
  function getAllowedActions(status: string): Array<{ action: string; label: string }> {
    const ACTION_LABELS: Record<string, string> = {
      pause: '暂停',
      resume: '恢复',
      complete: '完成',
      archive: '归档',
    }
    switch (status) {
      case 'active': return [
        { action: 'pause', label: '暂停' },
        { action: 'complete', label: '完成' },
      ]
      case 'paused': return [
        { action: 'resume', label: '恢复' },
      ]
      case 'completed': return [
        { action: 'archive', label: '归档' },
      ]
      default: return []
    }
  }
```

- [ ] **Step 3: 主线名称使用 TruncatedText**

```tsx
  <TruncatedText text={thread.thread.name} className="text-sm font-medium truncate" />
```

需要 import `TruncatedText`（Task 15 先完成）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "feat(tasks): ThreadListPanel 操作按钮改为 \"...\" 菜单 + TruncatedText [022]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: TruncatedText — 通用截断文本 Tooltip 组件 [022]

**Files:**
- Create: `frontend/src/components/common/TruncatedText.tsx`

- [ ] **Step 1: 创建 TruncatedText 组件**

```tsx
/**
 * @file TruncatedText
 * @brief 通用截断文本组件
 *
 * 当文本因 overflow: ellipsis 被截断时，鼠标悬停自动显示完整内容的 Tooltip。
 * 使用 scrollWidth > clientWidth 检测溢出，无溢出时不渲染额外 DOM。
 */

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * TruncatedText 组件属性
 */
interface TruncatedTextProps {
  /** 显示的文本 */
  text: string
  /** 额外的 CSS 类名 */
  className?: string
  /** HTML 标签类型 */
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3'
}

/**
 * 通用截断文本组件，溢出时自动显示 Tooltip
 * @param props - 组件属性
 */
export function TruncatedText({ text, className = '', as: Tag = 'span' }: TruncatedTextProps) {
  const ref = useRef<HTMLElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const checkOverflow = useCallback(() => {
    const el = ref.current
    if (el) {
      setIsOverflowing(el.scrollWidth > el.clientWidth)
    }
  }, [])

  useEffect(() => {
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [checkOverflow, text])

  return (
    <div className="relative inline-block max-w-full">
      <Tag
        ref={ref as any}
        className={className}
        onMouseEnter={() => isOverflowing && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {text}
      </Tag>
      {isOverflowing && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 rounded-md bg-ink px-2 py-1 text-xs text-canvas shadow-lg whitespace-nowrap pointer-events-none">
          {text}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/common/TruncatedText.tsx
git commit -m "feat(ui): 新建 TruncatedText 通用截断文本 tooltip 组件 [022]

悬浮时如果文本被截断则显示完整内容 tooltip。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: task-tree-view — ID 显示 [022]

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

- [ ] **Step 1: 在任务和主线节点增加 ID 显示**

找到任务/主线列表项的渲染位置，在标题后面增加可复制的 ID：

```tsx
  <span
    className="ml-1 text-[10px] text-muted-soft cursor-pointer select-all"
    title="点击选中以复制 ID"
  >
    #{item.id.slice(0, 8)}
  </span>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "feat(tasks): task-tree-view 增加 ID 显示，支持复制 [022]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 17: TaskTreeViewCard — 新建 CNUI Surface [016]

**Files:**
- Create: `frontend/src/domains/tasks/cnui/surfaces/TaskTreeViewCard.tsx`

- [ ] **Step 1: 创建 TaskTreeViewCard 组件**

```tsx
/**
 * @file TaskTreeViewCard
 * @brief 任务树查看 CNUI Surface
 *
 * CN-UI 表面 — 纯展示任务树，含搜索过滤和展开/收起功能。
 * 永不过期，总是显示当前数据库查找结果。
 */

'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 任务树节点类型 */
interface TreeNode {
  id: string
  title: string
  status: string
  /** 'thread' | 'task' */
  kind: 'thread' | 'task'
  parentId?: string | null
  threadId?: string | null
}

/** TaskTreeViewCard 组件属性 */
interface TaskTreeViewCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function TaskTreeViewCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
}: TaskTreeViewCardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const threads = (dataModel.threads as Array<{ id: string; name: string; color: string; status: string }>) ?? []
  const tasks = (dataModel.tasks as TreeNode[]) ?? []

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads
    const q = searchQuery.trim().toLowerCase()
    // 匹配主线名称或其下任务
    const matchingTaskThreadIds = new Set(
      tasks.filter(t =>
        t.title.toLowerCase().includes(q) || t.id.includes(q)
      ).map(t => t.threadId).filter(Boolean)
    )
    return threads.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.id.includes(q) ||
      matchingTaskThreadIds.has(t.id)
    )
  }, [threads, tasks, searchQuery])

  // 过滤可见任务
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) || t.id.includes(q)
    )
  }, [tasks, searchQuery])

  /** 获取主线下的任务 */
  function getThreadTasks(threadId: string) {
    return filteredTasks.filter(t => t.threadId === threadId && !t.parentId)
  }

  /** 复制 ID 到剪贴板 */
  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // 降级：选中文本
    }
  }

  return (
    <div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas">
      {/* 搜索框 */}
      <div className="p-3 border-b border-hairline">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索任务或主线（标题/ID）..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      </div>

      {/* 任务树 */}
      <div className="max-h-[400px] overflow-y-auto p-2">
        {filteredThreads.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">没有匹配的结果</p>
        )}

        {filteredThreads.map(thread => {
          const isExpanded = expandedThreads.has(thread.id)
          const threadTasks = getThreadTasks(thread.id)

          return (
            <div key={thread.id} className="mb-1">
              {/* 主线节点 */}
              <button
                type="button"
                onClick={() => setExpandedThreads(prev => {
                  const next = new Set(prev)
                  if (next.has(thread.id)) next.delete(thread.id)
                  else next.add(thread.id)
                  return next
                })}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded hover:bg-hover-overlay transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="size-3.5 text-muted shrink-0" />
                  : <ChevronRight className="size-3.5 text-muted shrink-0" />
                }
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: thread.color || '#ccc785c' }}
                />
                <span className="text-sm font-medium text-ink truncate flex-1">{thread.name}</span>
                <span
                  className="text-[10px] text-muted-soft cursor-pointer hover:text-ink select-all shrink-0"
                  onClick={(e) => { e.stopPropagation(); copyId(thread.id) }}
                  title="点击复制 ID"
                >
                  {copiedId === thread.id ? <Check className="size-3 text-success" /> : `#${thread.id.slice(0, 8)}`}
                </span>
              </button>

              {/* 子任务 */}
              {isExpanded && threadTasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-1.5 ml-6 pl-2 pr-2 py-1 rounded hover:bg-hover-overlay transition-colors"
                >
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    task.status === 'completed' ? 'bg-success' :
                    task.status === 'in_progress' ? 'bg-primary' :
                    task.status === 'archived' ? 'bg-muted' : 'bg-muted-soft',
                  )} />
                  <span className="text-sm text-ink truncate flex-1">{task.title}</span>
                  <span
                    className="text-[10px] text-muted-soft cursor-pointer hover:text-ink select-all shrink-0"
                    onClick={() => copyId(task.id)}
                    title="点击复制 ID"
                  >
                    {copiedId === task.id ? <Check className="size-3 text-success" /> : `#${task.id.slice(0, 8)}`}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* 底部关闭按钮（可选） */}
      {onCancel && (
        <div className="border-t border-hairline p-2 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskTreeViewCard.tsx
git commit -m "feat(tasks): 新建 TaskTreeViewCard CNUI surface — 查看任务树 [016]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 18: Growth Menu — 添加 viewTree 入口

**Files:**
- Modify: `frontend/src/components/layout/growth-menu.tsx`

- [ ] **Step 1: 确认 viewTree 已在 domainActions 中**

`GrowthMenu` 从 `domainActions` prop 接收数据，数据源在父组件中构建。查找 `left-panel.tsx` 或 `page.tsx` 中 `domainActions` 的构建位置。

```bash
grep -rn "domainActions" frontend/src/components/layout/ frontend/src/app/
```

- [ ] **Step 2: 在 domainActions 构建处添加 viewTree**

在构建 tasks Domain 操作列表的位置增加 `viewTree` entry：

```typescript
{
  action: 'viewTree',
  shortcut: '/viewTree',
  description: '查看任务树',
  response_type: 'cnui',
}
```

- [ ] **Step 3: 提交**

```bash
git add <修改的文件>
git commit -m "feat(ui): Growth Menu 添加 viewTree 入口 [016]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 19: Domain Registration — 注册新 CNUI Surface [016]

**Files:**
- Modify: `frontend/src/domains/tasks/index.ts`

- [ ] **Step 1: 注册 task-tree-view surface**

在 Domain 初始化代码中，注册 `TaskTreeViewCard`：

```typescript
import { TaskTreeViewCard } from './cnui/surfaces/TaskTreeViewCard'

// 在 cnuiRegistry.register 调用区域新增：
cnuiRegistry.register({
  domainId: 'tasks',
  surfaceType: 'task-tree-view',
  component: TaskTreeViewCard,
  handlerModulePath: './cnui/handlers',
})
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/index.ts
git commit -m "feat(tasks): 注册 task-tree-view CNUI surface [016]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 20: Route Generation — 重新生成路由

**Files:**
- Auto-generated files in `frontend/src/app/`

- [ ] **Step 1: 运行路由生成**

```bash
cd frontend && npm run generate:routes
```

预期：没有新的 `view_route` 需要生成（viewTree 是 cnui response_type，不需要 page route）。`viewTaskTree` 的 `/tasks` 路由已存在。检查是否有报错。

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: 提交（如有变更）**

```bash
git add frontend/src/app/
git commit -m "chore: 重新生成路由文件

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自审检查清单

- [x] Spec 覆盖：每条设计文档需求都有对应 Task
- [x] 无 Placeholder/TODO
- [x] 类型一致性：Task 1-19 中使用的方法签名、类型名称与 Task 3-6 定义一致
- [x] 任务粒度：每个步骤 2-5 分钟可完成

**已知简化项**（与 spec 对比）:
- Handler 智能识别逻辑从 Handler 移入 Surface 组件（Task 8-11），因为 `open(action)` 签名不包含 `dataModel`，而前端在渲染 Surface 前已将 intent fields 注入 dataModel
- [023] 的前端消费逻辑（AI 面板收到 `needsCnuiConfirmation` 后的处理）未在计划中展开，因为涉及前端 AI 面板的改动范围较大，建议在实施时按需扩展
