# 任务管理迭代修正 — 设计文档

> 版本：v1.0 | 日期：2026-06-10
> 上游：`mydocs/dev/当前开发内容未达预期修正意见.md`
> 下游：`docs/superpowers/plans/2026-06-10-task-management-iteration-fix-plan.md`（待编写）

---

## 一、概述

基于 [016]-[023] 任务管理迭代实现后的验证反馈，本文档定义系统性修正方案。共 6 个修正类别，15+ 改动点，跨 10+ 文件。

### 修正类别总览

| 类别 | 严重程度 | 问题数 |
|------|----------|--------|
| 1. 对比度系统性修复 | 体验 | 4+ 处 |
| 2. 状态机/Handler 修复 | 阻断 | 5 个 bug |
| 3. 筛选与数据增强 | 功能 | 4 个改进 |
| 4. viewTree → viewTaskTree 改名 | 清理 | 多文件同步 |
| 5. 自然语言解析增强 | 功能 | 3 层增强 |
| 6. 默认排序 + 面板操作 | 配置 | 3 处改动 |

---

## 二、状态机/Handler 修复（阻断性 Bug）

### Bug 1: ThreadListPanel action→status 映射错误

**根因**: `ThreadListPanel` 的 "..." 菜单将 manifest lifecycle action（`'pause'`、`'complete'`、`'archive'`）直接作为 `Thread['status']`（期望 `'paused'`、`'completed'`、`'archived'`）传递给 `updateThreadStatus()`，导致 `THREAD_STATUS_TO_ACTION['pause']` 查找失败，抛出 "不支持的线程目标状态: pause"。

**修正文件**: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

**修正内容**: 新增 `ACTION_TO_TARGET_STATUS` 映射，将 manifest action 转换为目标状态值：

```typescript
const ACTION_TO_TARGET_STATUS: Record<string, string> = {
  pause: 'paused',
  resume: 'active',
  complete: 'completed',
  archive: 'archived',
}
```

在 handleClick 中修改调用：
```typescript
// 修改前（错误）
await updateThreadStatus(thread.id, act.action as Thread['status'])

// 修改后
const targetStatus = ACTION_TO_TARGET_STATUS[act.action]
if (targetStatus) {
  await updateThreadStatus(thread.id, targetStatus as Thread['status'])
}
```

### Bug 2: task-tree-view handler 未注册

**根因**: `handlers.ts` 的 `surfaceHandlers` 导出映射中缺少 `'task-tree-view'` 条目，但 manifest `cnui_surfaces` 已声明、客户端组件已注册（`register-client-surfaces.ts` 和 `domains/tasks/index.ts`）。Handler 查找时匹配不到，报 "Handler 未找到: task-tree-view"。

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`

**修正内容**: 在 `surfaceHandlers` 中添加：
```typescript
'task-tree-view': taskCnuiHandler,
```

### Bug 3: updateTask/updateThread CNUI submit 走错路径

**根因**: CNUI handler 的 `submit` 方法将所有 action 统一走 `submitDynamicIntent` → Nexus State Machine，但 SM 只支持生命周期状态转换（create/plan/start/complete/archive/delete），不支持字段更新（updateTask/updateThread）。触发 "非法状态转换: action='update', fromState='todo'"。

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`

**修正内容**: 在 `submit` 中增加判断 — 字段更新 action 走直接 repo 调用：

```typescript
// updateTask: 字段更新走直接 repo（非 SM 状态转换）
if (action === 'updateTask') {
  const { updateTask } = await import('@/app/actions/tasks')
  const task = await updateTask(fields.taskId as string, fields)
  return { success: true, data: { object: task } }
}

// updateThread: 字段更新走直接 repo（非 SM 状态转换）
if (action === 'updateThread') {
  const { updateThread } = await import('@/app/actions/tasks')
  const thread = await updateThread(fields.threadId as string, fields)
  return { success: true, data: { object: thread } }
}
```

> **备注 (临时方案)**: 以上为临时性处理。SM 支持的字段更新范围，后续通过专题统一规范。届时所有字段更新将迁移至 Nexus 链路。

### Bug 4: updateThread CNUI 列表视图缺少 action 标识

**根因**: handler `updateThread` 的 `open` 方法在列出全部主线时（既无 `intentFields.threadId` 也无 `intentFields.name`），`dataSnapshot` 中未设置 `action: 'update'`，导致 `ThreadActionPanel` 默认解析为 `action: 'pause'`，显示"暂停主线"而非"编辑主线"。

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`

**修正内容**: 在 `updateThread` 的全部主线列表分支（约 line 199-212）的 `dataSnapshot` 中添加：
```typescript
dataSnapshot: {
  action: 'update',  // ← 新增
  threads: threads.map(...)
}
```

### Bug 5: 已归档主线业务规则

**根因**: 已归档主线不应再接受新任务关联。需在任务创建时校验目标主线的状态。

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`

**修正内容**: `createTask` 的 `open` handler 中，`getActiveThreads()` 已过滤 `archived` 状态主线，确认逻辑正确。额外在 `submit` 中增加校验：
```typescript
if (action === 'createTask' && fields.threadId) {
  const { ThreadRepository } = await import('@/domains/tasks/repository/thread')
  const repo = new ThreadRepository()
  const thread = await repo.findById(fields.threadId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (thread?.status === 'archived') {
    return { success: false, error: '已归档的主线不允许添加任务' }
  }
}
```

---

## 三、对比度系统性修复

### 根因

代码中多处交互元素使用 `text-muted`（`--muted: #6c6a64`），在 `bg-canvas`（`#faf9f5`）背景上对比度约 4.6:1，在 `--hairline`（`#e6dfd8`）背景上仅 4.1:1，低于或接近 WCAG AA 正常文本标准（4.5:1）。UI-DESIGN-SPEC §1.1 已有禁止规则但未形成"禁止清单"，导致违规反复出现。

### 代码层面修正

| 文件 | 行号 | 元素 | 当前类 | 修正为 |
|------|------|------|--------|--------|
| `TaskFilterBar.tsx` | :211 | Search 图标 | `text-muted` | `text-body` |
| `TaskFilterBar.tsx` | :238 | ArrowUpDown 图标 | `text-muted` | `text-body` |
| `ThreadListPanel.tsx` | :257 | "..." 按钮 | `text-muted hover:text-ink` | `text-body hover:text-ink` |
| `TaskTreeView.tsx` | :95 | CNUI Search 图标 | `text-muted` | `text-body` |
| `TaskTreeView.tsx` | :129-130 | Chevron 图标 | `text-muted` | `text-body` |
| `TaskTreeView.tsx` | :139 | ID badge | `text-muted-soft` | `text-body` |
| CNUI 所有 `<label>` | 全局 | 表单标签 | 检查并替换 `text-muted` | `text-body` |

### 规范层面修正

**修正文件**: `docs/UI-DESIGN-SPEC.md`

在 §1.6 之后新增 §1.7：

```markdown
### 1.7 禁止使用的颜色类（交互元素）

以下 Tailwind 类 **禁止** 用于任何可交互或需阅读的元素：

| 禁止类 | 适用场景 | 原因 | 替代 |
|--------|----------|------|------|
| `text-muted` | 图标、按钮、链接、select 文字 | 对比度仅 4.1:1，低于 AA 4.5:1 正常文本标准 | `text-body` |
| `text-muted-soft` | 任何可见元素（除 `placeholder:` 伪类） | 对比度仅 3.5:1，远低于 AA 标准 | `text-muted`（仅限纯装饰辅助文字） |
| `text-muted-foreground` | 任何元素 | 非规范令牌，无对应 CSS 变量 | `text-body` |

> **豁免**: `placeholder:text-muted-soft` — 占位符本身是装饰性提示，用户输入后会消失，可继续使用。
```

---

## 四、筛选与数据增强

### 4.1 promoteToThread 筛选条件

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`

**修正内容**: `promoteToThread` 的 `open` handler 中，兜底列表增加筛选：
- `parentId === null`（仅顶级任务）
- `status NOT IN ('paused', 'completed', 'archived')`（排除已终止/暂停的任务）

```typescript
// promoteToThread 兜底列表（无 intentFields 匹配时）
const repo = new TaskRepository()
const allTasks = await repo.findByUserId(MVP_USER_ID as USOM_ID)
const candidates = allTasks.filter(t =>
  !t.parentId &&
  !['paused', 'completed', 'archived'].includes(t.status)
)
```

同步修改 `ThreadPromoteCard` 搜索框的模糊匹配逻辑，`searchByTitle` 结果也需经过相同筛选。

### 4.2 promoteToThread 提升逻辑

**修正文件**: `frontend/src/app/actions/tasks.ts`

**修正内容**: 选项 C — 原顶级任务变主线（清除 parentId），子任务保持层级但全部关联新主线。

在 `promoteToThread` 函数末尾新增：
```typescript
// 处理子任务：关联到新主线
const taskRepo2 = new TaskRepository()
const subtasks = await taskRepo2.findByParent(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
for (const subtask of subtasks) {
  await taskRepo2.update(subtask.id as USOM_ID, {
    threadId: newThread.id
  } as UpdateTaskInput, MVP_USER_ID as USOM_ID)
}

// 清除原任务的 parentId（它已成为主线）
if (task.parentId) {
  await taskRepo2.update(taskId as USOM_ID, {
    parentId: null
  } as UpdateTaskInput, MVP_USER_ID as USOM_ID)
}
```

> **备注**: `taskRepo.update` 为临时直接 repo 调用（同 Bug 3）。

### 4.3 任务列表信息增强

**修正文件**: `frontend/src/domains/tasks/cnui/handlers.ts`、`TaskActionPanel.tsx`、`ThreadPromoteCard.tsx`

**formatTaskList 扩展**:
```typescript
function formatTaskList(tasks: any[]): Record<string, unknown>[] {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedDuration: t.estimatedDuration,
    status: t.status,
    clarity: t.clarity,           // 新增
    startDate: t.startDate,       // 新增
    endDate: t.endDate,           // 新增
    actualDuration: t.actualDuration, // 新增
  }))
}
```

**TaskActionPanel 副行增强** — `TaskItem` 接口扩展和渲染：
```typescript
interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
  clarity?: string        // 新增
  startDate?: string      // 新增
  endDate?: string        // 新增
  actualDuration?: number // 新增
}
```

副行展示逻辑：
```tsx
<div className="text-xs text-muted">
  {STATUS_LABELS[task.status] ?? task.status}
  {task.clarity && ` · ${CLARITY_LABELS[task.clarity]}`}
  {task.startDate && ` · ${task.startDate.slice(0, 10)}`}
  {task.actualDuration && ` · 实际${task.actualDuration}分钟`}
</div>
```

### 4.4 CNUI 列表内搜索

**修正文件**: `TaskActionPanel.tsx`

**修正内容**: 面板顶部新增简易搜索框（`updateTask` 场景的 handler 返回全部可更新任务列表时启用）：

```tsx
const [localSearch, setLocalSearch] = useState('')

const filteredItems = useMemo(() => {
  if (!localSearch.trim()) return items
  const q = localSearch.trim().toLowerCase()
  return items.filter(t => t.title.toLowerCase().includes(q))
}, [items, localSearch])
```

UI：
```tsx
<div className="relative mb-3">
  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
  <input
    type="text" value={localSearch}
    onChange={e => setLocalSearch(e.target.value)}
    placeholder="按标题过滤..."
    className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs"
  />
</div>
```

### 4.5 各 action 筛选条件修正

| Action | 当前筛选 | 修正为 |
|--------|----------|--------|
| `completeTask` | `status='active'`（可能返回空） | 查询 `in_progress` 状态的任务 |
| `archiveTask` | `status='completed'` | 保持不变（仅已完成可归档） |
| `deleteTask` | `['todo','planned','in_progress','completed']` | 仅 `['archived']`（只有归档后可删除） |

对应修改 `TASK_LIFECYCLE_STATUS_MAP` 和 `DELETABLE_TASK_STATUSES`：
```typescript
const TASK_LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'in_progress',  // 修正：进行中→完成
  archiveTask: 'completed',     // 不变：已完成→归档
}
const DELETABLE_TASK_STATUSES = ['archived']  // 修正：仅归档可删
```

> **注意**: `deleteTask` 原来使用 `DELETABLE_TASK_STATUSES` 多状态列表而非 `TASK_LIFECYCLE_STATUS_MAP`。修正后符合 manifest lifecycle 规则：任务可从 `[todo, planned, in_progress, completed]` → `deleted`（manifest 定义），但业务规则要求"仅归档后可删除"。因此 handler 中需同时修改查询条件为仅 `archived`，与 manifest 的 SM transition `from` 定义保持独立。

---

## 五、viewTree → viewTaskTree 改名

### 改动清单

| 文件 | 改动 |
|------|------|
| `manifest.yaml` | `action: viewTree` → `viewTaskTree`、`shortcut: /viewTree` → `/viewTaskTree`、`query_actions.viewTree` → `query_actions.viewTaskTree` |
| `handlers.ts` | `action === 'viewTree'` → `action === 'viewTaskTree'`（`open` 和 `submit` 各 1 处） |

### 不变部分
- `cnui_surface: task-tree-view`（保持不变）
- 客户端组件注册（保持不变）
- `TaskTreeViewCard` 组件名（保持不变 — 它是 surface 的显示组件，与 action 名无关）

---

## 六、自然语言解析增强

### 6.1 AI prompt 增强

**修正文件**: `frontend/src/nexus/core/intent-engine/routing-context.ts`

在 `formatRoutingContextForPrompt` 的字段描述中追加枚举值映射：

```typescript
const ENUM_VALUE_MAP: Record<string, string> = {
  priority: '选项: critical(紧急)/high(高)/medium(中)/low(低)',
  energyRequired: '选项: high(高能量/需要专注)/medium(中)/low(低/轻松)',
  status: '选项: todo(待办)/planned(已计划)/in_progress(进行中)/completed(已完成)/archived(已归档)',
}
```

在字段 hint 格式中追加：
```typescript
const enumHint = ENUM_VALUE_MAP[f.name]
  ? `(${ENUM_VALUE_MAP[f.name]})`
  : ''
const hint = `${f.name}(${f.label}, ${f.type}${f.required ? ', 必填' : ''}${synonymHint})${enumHint}`
```

### 6.2 后处理规范化

**修正文件**: `frontend/src/domains/tasks/hooks.ts`（Rule Engine `onValidate` 钩子）

在 `onValidate` 中增加字段值规范化步骤，将常见中文表述转换为系统枚举：

```typescript
function normalizeFieldValues(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...fields }

  // 优先级：中文 → 枚举
  if (typeof normalized.priority === 'string') {
    const priorityMap: Record<string, string> = {
      '高': 'high', '高优先级': 'high', '紧急': 'critical', '最重要': 'critical',
      '中': 'medium', '中等': 'medium', '普通': 'medium',
      '低': 'low', '低优先级': 'low', '不急': 'low',
    }
    normalized.priority = priorityMap[normalized.priority] ?? normalized.priority
  }

  // 日期格式规范化：YYYY/MM/DD → YYYY-MM-DD
  if (typeof normalized.dueDate === 'string') {
    normalized.dueDate = (normalized.dueDate as string).replace(/\//g, '-')
  }

  // 主线名称 → threadId 映射（保持现有 LLM+handler 混合方式）
  // ... 由 handler 层处理

  return normalized
}
```

### 6.3 解析失败兜底

**修正文件**: `frontend/src/nexus/core/intent-engine/index.ts`（或 Orchestrator）

当 `parseWithAI` 返回 `success: false` 时，不直接报错，而是构建一个低置信度 intent 触发 CNUI 表单回退：

```typescript
// AI 解析失败时，构建兜底 intent 进入 CNUI 表单模式
const fallbackIntent: StructuredIntent = {
  id: generateUUID(),
  intentionId,
  targetDomain: 'tasks',
  action: parsedAction ?? 'createTask',  // 从原始输入推断或默认
  fields: {},
  confidence: 0.3,
  resolvedBy: 'ai',
  createdAt: new Date().toISOString() as Timestamp,
}
```

Orchestrator 检测到 `confidence < 0.5` 时，自动将 `response_type` 设为 `cnui`，触发 CNUI 表单卡片让用户手动填写，而非直接报错"处理失败"。

---

## 七、默认排序 + 面板操作

### 7.1 默认排序

**修正文件**: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`

```typescript
// 修改前
const [sortBy, setSortBy] = useState<SortField>('title')

// 修改后
const [sortBy, setSortBy] = useState<SortField>('startDate')
```

### 7.2 CNUI TaskTreeView 筛选排序

**修正文件**: `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx`

新增轻量筛选排序能力：
- 状态筛选 pill 按钮组（全部/进行中/已完成/已归档）
- 排序选择（标题/开始时间）+ 升降序切换
- 参照 Page 版 `TaskFilterBar` 但精简（无清晰度筛选，CNUI 内空间有限）

### 7.3 验证

确认 `ThreadListPanel` 的 `getAllowedActions` 中 `completed→archive`、`archived→delete` 按钮在修正 Bug 1 的映射后能正确触发状态转换。

---

## 八、影响文件汇总

| 文件 | 修正类别 | 改动类型 |
|------|----------|----------|
| `domains/tasks/manifest.yaml` | 4 | 改名 |
| `domains/tasks/cnui/handlers.ts` | 2,3,4 | Bug修复+增强+改名 |
| `app/actions/tasks.ts` | 3 | promoteToThread 逻辑增强 |
| `domains/tasks/components/thread-list-panel.tsx` | 1,2,7 | 对比度+action映射 |
| `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 1,3 | 对比度+信息增强+搜索 |
| `domains/tasks/cnui/surfaces/ThreadPromoteCard.tsx` | 1,3 | 对比度+筛选 |
| `domains/tasks/cnui/surfaces/TaskTreeView.tsx` | 1,7 | 对比度+筛选排序 |
| `domains/tasks/components/task-filter-bar.tsx` | 1 | 对比度 |
| `domains/tasks/pages/TaskTreePage.tsx` | 6 | 默认排序 |
| `nexus/core/intent-engine/routing-context.ts` | 5 | prompt增强 |
| `nexus/core/intent-engine/ai-parser.ts` | 5 | 兜底回退 |
| `domains/tasks/hooks.ts` | 5 | 字段规范化 |
| `docs/UI-DESIGN-SPEC.md` | 1 | 禁止清单 |

---

## 九、架构约束（遵循宪章）

- **CN-UI Write Confirmation**: 所有写操作仍走 CNUI 确认（已由 Orchestrator 拦截实现）
- **Repository Pattern**: Bug 3 和 4.2 的 repo 调用为临时方案，符合 R-01~R-04
- **SM Purity**: 字段更新不强行塞入 SM，保持 SM 仅处理生命周期转换
- **USOM Governance**: 无新增对象类型，不触发 G-01~G-08
- **Multi-Tenancy**: MVP_USER_ID 硬编码保持不变
