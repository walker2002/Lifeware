# 任务树迭代优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复任务树 5 个 Bug 并实现 5 项功能优化，分阶段 A/B 执行。

**Architecture:** 所有改动限定在 Tasks Domain 内部。Bug 修复（阶段 A）先完成验证，再做功能优化（阶段 B）。数据操作通过 Server Actions → Repository 路径，UI 使用设计令牌，遵循宪章约束。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4 + 设计令牌, shadcn/ui, Drizzle ORM, lucide-react 图标。

**Design spec:** `docs/superpowers/specs/2026-06-05-task-tree-iteration-design.md`

---

## File Structure

### 修改文件

| 文件 | 任务 | 职责 |
|------|------|------|
| `frontend/src/domains/tasks/pages/TaskTreePage.tsx` | T1, T5, T7 | 主页面：连接按钮 + refreshKey + 全屏模式 |
| `frontend/src/domains/tasks/components/task-tree-view.tsx` | T2, T5 | 树视图：对比度 + refreshKey prop |
| `frontend/src/domains/tasks/components/task-edit-zone.tsx` | T2, T8 | 编辑区：对比度 + stopPropagation + 验收标准 |
| `frontend/src/domains/tasks/components/task-detail-drawer.tsx` | T3, T6, T9 | 抽屉：stopPropagation + 全屏按钮 + 关闭 footer |
| `frontend/src/domains/tasks/components/thread-detail-drawer.tsx` | T10 | 主线抽屉：归档按钮 |
| `frontend/src/domains/tasks/components/thread-list-panel.tsx` | T2 | 对比度修复 |
| `frontend/src/domains/tasks/repository/task.ts` | T11 | 新增 delete 方法 |
| `frontend/src/app/actions/tasks.ts` | T11 | 新增 deleteTask action |
| `frontend/src/domains/tasks/manifest.yaml` | T12, T13 | 重命名 + 移除路由 |

### 删除文件

| 文件 | 任务 | 职责 |
|------|------|------|
| `frontend/src/domains/tasks/pages/TaskDetailPage.tsx` | T12 | 独立任务详情页 |
| `frontend/src/domains/tasks/pages/ThreadDetailPage.tsx` | T12 | 独立主线详情页 |
| `frontend/src/app/tasks/[id]/page.tsx` | T12 | 自动生成的路由 |

---

## 阶段 A：Bug 修复

### Task 1: 连接"创建主线"按钮 + 移除头部多余按钮

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx:83-97`

**背景**：`TaskTreePage.tsx` 的工具栏有两个按钮——"创建主线"和"快速添加任务"，均缺少 `onClick` handler。实际上，任务树视图底部已有可用的快速添加输入框（`task-tree-view.tsx:337-351`），所以头部按钮是冗余的。

- [ ] **Step 1: 连接"创建主线"按钮并移除"快速添加任务"按钮**

在 `TaskTreePage.tsx` 中，修改操作工具栏区域：

```tsx
// 修改前（第 87-96 行）：
<div className="flex items-center gap-2">
  <Button variant="outline" size="sm">
    <Plus className="size-4" />
    创建主线
  </Button>
  <Button size="sm">
    <Plus className="size-4" />
    快速添加任务
  </Button>
</div>

// 修改后：
<div className="flex items-center gap-2">
  <Button variant="outline" size="sm" onClick={() => openThreadDetail('__new__')}>
    <Plus className="size-4" />
    创建主线
  </Button>
</div>
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：在浏览器打开 `/tasks`，点击"创建主线"按钮应弹出创建主线的抽屉。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "fix(tasks): 连接创建主线按钮 + 移除头部多余快速添加按钮

Bug A-3: 创建主线按钮无响应 → 连接 openThreadDetail('__new__')
Bug A-4: 头部快速添加按钮冗余 → 移除（树视图底部已有内联输入框）"
```

---

### Task 2: 修复字体/图标对比度不足

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx`
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`
- Modify: `frontend/src/domains/tasks/components/thread-list-panel.tsx`

**规则**：操作性元素（按钮、图标、标签）用 `text-muted`；纯装饰性占位提示可保留 `text-muted-soft`。

- [ ] **Step 1: 修复 task-edit-zone.tsx**

将所有标签的 `text-muted-soft` 改为 `text-muted`（第 251, 265, 280, 295, 305 行区域）：

```tsx
// 在 task-edit-zone.tsx 中，所有 label 元素的 className：
// 修改前：className="text-xs text-muted-soft w-16 shrink-0"
// 修改后：className="text-xs text-muted w-16 shrink-0"
```

具体地，在文件中全局替换所有 `text-muted-soft w-16` 为 `text-muted w-16`（共 5 处标签）。

同时修改底部占位文字区域：

```tsx
// 修改前（第 318-320 行）：
<div className="flex flex-col gap-1 pt-1 border-t border-hairline-soft">
  <span className="text-xs text-muted-soft">验收标准 — 即将支持</span>
  <span className="text-xs text-muted-soft">预期产出 — 即将支持</span>
</div>

// 修改后：
<div className="flex flex-col gap-1 pt-1 border-t border-hairline-soft">
  <span className="text-xs text-muted">验收标准 — 即将支持</span>
  <span className="text-xs text-muted">预期产出 — 即将支持</span>
</div>
```

- [ ] **Step 2: 修复 task-detail-drawer.tsx**

将操作按钮图标区域的 `text-muted-soft` 改为 `text-muted`：

```tsx
// 第 183 行附近，"在新页面打开"按钮：
// 修改前：className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-soft hover:text-ink hover:bg-hover-overlay transition-colors"
// 修改后：className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-ink hover:bg-hover-overlay transition-colors"

// 第 193 行附近，关闭按钮：
// 修改前：className="rounded-md p-1 text-muted-soft hover:text-ink hover:bg-hover-overlay transition-colors"
// 修改后：className="rounded-md p-1 text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
```

- [ ] **Step 3: 修复 thread-list-panel.tsx**

将筛选标签的标题从 `text-muted-soft` 改为 `text-muted`（第 212, 232 行区域）：

```tsx
// 修改前：
<p className="text-[10px] text-muted-soft mb-1">clarity</p>
<p className="text-[10px] text-muted-soft mb-1">status</p>

// 修改后：
<p className="text-[10px] text-muted mb-1">clarity</p>
<p className="text-[10px] text-muted mb-1">status</p>
```

注意：第 149 行的 `text-muted-soft`（无主线任务计数的占位 "—"）保留不变，这是纯装饰性内容。

- [ ] **Step 4: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：打开 `/tasks`，确认标签文字、操作图标清晰可见。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx \
        frontend/src/domains/tasks/components/task-detail-drawer.tsx \
        frontend/src/domains/tasks/components/thread-list-panel.tsx
git commit -m "fix(tasks): 修复字体/图标对比度不足 — text-muted-soft → text-muted

Bug A-1: 操作性元素使用 text-muted 替代 text-muted-soft 提高可读性"
```

---

### Task 3: 修复点击 clarity/status 区域清除左面板

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx`
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`

**背景**：点击抽屉内 select 元素时，事件冒泡到 overlay 的 `onClick={onClose}` 导致抽屉关闭、左面板状态重置。

- [ ] **Step 1: 在 task-edit-zone.tsx 的所有 select 上添加 stopPropagation**

```tsx
// 在 task-edit-zone.tsx 的每个 select 元素上添加 onClick={e => e.stopPropagation()}
// 共 5 个 select：优先级、能量需求、追踪模式、截止日期

// 示例（优先级 select，约第 252 行）：
<select
  value={task.priority}
  onChange={e => saveField('priority', e.target.value)}
  onClick={e => e.stopPropagation()}
  disabled={savingField === 'priority'}
  className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
>
```

对所有 select 元素（priority, energyRequired, tracking, dueDate 的 input）添加 `onClick={e => e.stopPropagation()}`。

- [ ] **Step 2: 在 TaskDetailDrawer 内容区域阻止冒泡**

在 `task-detail-drawer.tsx` 的抽屉主体 `<div>` 上添加 `onClick={e => e.stopPropagation()}`，防止整个内容区域的点击冒泡到 overlay：

```tsx
// 第 163 行附近，抽屉主体的 div：
<div
  ref={drawerRef}
  className="fixed top-0 right-0 z-40 h-full bg-canvas border-l border-hairline shadow-xl flex flex-col animate-in slide-in-from-right duration-300"
  style={{ width: drawerWidth }}
  role="dialog"
  aria-modal="true"
  aria-label="任务详情"
  onClick={e => e.stopPropagation()}  // ← 新增
>
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：打开 `/tasks`，点击任务打开详情抽屉，点击 clarity/status 下拉框，确认左面板不再消失。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx \
        frontend/src/domains/tasks/components/task-detail-drawer.tsx
git commit -m "fix(tasks): 修复点击 select 导致左面板消失 — 添加 stopPropagation

Bug A-2: select onClick 事件冒泡到 overlay 触发 onClose"
```

---

### Task 4: 验证快速添加任务和状态更新功能

**Files:** 无文件修改

**背景**：通过代码审查发现：
- 快速添加任务（A-4）的输入框已在 `task-tree-view.tsx:337-351` 实现，`handleQuickAdd` 函数在 `:255-279` 完整实现。Bug 仅来自 Task 1 中已移除的头部按钮。
- 完成状态样式（A-5）的 `handleStatusChange` 在 `:284-292` 已有本地状态更新 `setRootNodes(prev => prev.map(...))`，且 `TaskTreeRow` 第 576-579 行已有 `task.status === 'completed' && 'line-through text-muted'`。

- [ ] **Step 1: 手动验证快速添加**

在浏览器中：打开 `/tasks` → 在底部输入框输入任务标题 → 回车 → 确认任务出现在树中。

- [ ] **Step 2: 手动验证完成状态样式**

在浏览器中：打开 `/tasks` → 点击任务状态圆点 → 选择"标记完成" → 确认行样式变为删除线 + 灰色 + 绿色圆点。

- [ ] **Step 3: 手动验证从抽屉完成后的刷新**

在浏览器中：点击任务打开抽屉 → 在完成区域标记完成 → 关闭抽屉 → 确认树中该任务样式已更新。

**如果 Step 3 验证失败**（抽屉内完成操作不刷新树），则说明 `TaskDetailDrawer` 的 `onTaskUpdate` 回调未传播到 `TaskTreeView`。此时需要添加 Task 5（refreshKey 机制）。

---

### Task 5: 添加 refreshKey 机制（仅在 Task 4 Step 3 验证失败时执行）

**Files:**
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`

**触发条件**：仅在 Task 4 的 Step 3 验证失败（从抽屉完成任务后树视图不刷新）时执行此 Task。

- [ ] **Step 1: 在 TaskTreePage 中添加 refreshKey**

```tsx
// 在 TaskTreePage.tsx 中添加：
const [refreshKey, setRefreshKey] = useState(0)

// 修改 openTaskDetail 回调，传递 onTaskChanged：
const openTaskDetailWithRefresh = useCallback((taskId: string) => {
  setDrawer({ type: 'task', taskId })
}, [])

// 添加 refresh 回调：
const handleTaskChanged = useCallback(() => {
  setRefreshKey(prev => prev + 1)
}, [])
```

修改 `TaskTreeView` 的 props：

```tsx
<TaskTreeView
  threadId={selectedThreadId}
  onOpenTaskDetail={openTaskDetailWithRefresh}
  onPromoteToThread={promoteToThread}
  refreshKey={refreshKey}
/>
```

修改 `TaskDetailDrawer` 的 `onTaskUpdate` 同时刷新：

```tsx
<TaskDetailDrawer
  taskId={drawer.taskId}
  userId={'placeholder' as any}
  onClose={closeDrawer}
  onTaskChanged={handleTaskChanged}
/>
```

- [ ] **Step 2: 在 TaskTreeView 中接收 refreshKey prop**

```tsx
// TaskTreeViewProps 新增：
export interface TaskTreeViewProps {
  threadId?: string
  onOpenTaskDetail?: (taskId: string) => void
  onPromoteToThread?: (taskId: string) => void
  refreshKey?: number  // ← 新增
}

// 在 loadRootTasks 的 useEffect 依赖中添加 refreshKey：
useEffect(() => {
  // ... load 逻辑不变
}, [threadId, refreshKey])  // ← 添加 refreshKey
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/pages/TaskTreePage.tsx \
        frontend/src/domains/tasks/components/task-tree-view.tsx
git commit -m "fix(tasks): 抽屉内状态变更后刷新任务树 — refreshKey 机制

Bug A-5: 从抽屉完成任务后树视图自动刷新"
```

---

### Task 6: 阶段 A 验收检查点

**Files:** 无文件修改

- [ ] **Step 1: 编译检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 2: Lint 检查**

Run: `cd frontend && npm run lint`
Expected: 零新 warning

- [ ] **Step 3: 手动回归测试清单**

逐项在浏览器中验证：

| 测试项 | 预期结果 |
|--------|---------|
| 打开 `/tasks` | 页面正常加载，主线列表和任务树显示 |
| 点击"创建主线" | 弹出主线创建抽屉 |
| 底部快速添加任务 | 输入标题回车 → 任务出现在树中 |
| 点击任务状态圆点 → "标记完成" | 行变为删除线 + 灰色 + 绿色圆点 |
| 打开任务详情抽屉 → 修改 clarity select | 左面板不消失 |
| 打开任务详情抽屉 → 修改 status select | 左面板不消失 |
| 检查标签文字、操作图标 | 清晰可见，无过浅问题 |

- [ ] **Step 4: 阶段 A 完成提交**

```bash
git add -A
git commit -m "milestone: 阶段 A Bug 修复完成 — 验收通过"
```

---

## 阶段 B：功能优化

### Task 7: 移除独立详情页和路由

**Files:**
- Delete: `frontend/src/domains/tasks/pages/TaskDetailPage.tsx`
- Delete: `frontend/src/domains/tasks/pages/ThreadDetailPage.tsx`
- Modify: `frontend/src/domains/tasks/manifest.yaml:323-333`

- [ ] **Step 1: 从 manifest.yaml 移除 view_routes 中的详情页声明**

```yaml
# 修改前（第 323-333 行）：
view_routes:
  viewTaskTree:
    component: domains/tasks/pages/TaskTreePage
    url: /tasks
  viewTaskDetail:
    component: domains/tasks/pages/TaskDetailPage
    url: /tasks/[id]
  viewThreadDetail:
    component: domains/tasks/pages/ThreadDetailPage
    url: /threads/[id]

# 修改后：
view_routes:
  viewTaskTree:
    component: domains/tasks/pages/TaskTreePage
    url: /tasks
```

- [ ] **Step 2: 删除详情页文件**

```bash
rm frontend/src/domains/tasks/pages/TaskDetailPage.tsx
rm frontend/src/domains/tasks/pages/ThreadDetailPage.tsx
```

- [ ] **Step 3: 重新生成路由**

Run: `cd frontend && npx tsx scripts/generate-routes.ts --clean`
Expected: 移除孤立路由文件（包括 `app/tasks/[id]/page.tsx`）

- [ ] **Step 4: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(tasks): 移除独立详情页 — 详情通过抽屉/全屏访问

B-5: 删除 TaskDetailPage、ThreadDetailPage 及路由声明"
```

---

### Task 8: Action 重命名 + manifest description 更新

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml:112-120`

- [ ] **Step 1: 更新 manifest 中 viewTaskTree 的 description**

```yaml
# 修改前（第 112-120 行）：
  - action: viewTaskTree
    shortcut: /tasks
    description: 查看任务树
    response_type: page
    view_route: /tasks
    examples:
      - 查看所有任务
      - 显示任务列表
    keywords: [任务列表, 查看, 任务树]

# 修改后：
  - action: viewTaskTree
    shortcut: /tasks
    description: 任务树管理
    response_type: page
    view_route: /tasks
    examples:
      - 管理任务
      - 任务树管理
    keywords: [任务列表, 任务树, 管理]
```

- [ ] **Step 2: 检查侧边栏导航配置**

搜索项目中引用"查看任务树"的位置：

Run: `cd frontend && grep -rn "查看任务树" src/`
Expected: 如有结果，同步更新为"任务树管理"

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "refactor(tasks): 重命名 action — 查看任务树 → 任务树管理

B-3: manifest description 和 keywords 更新"
```

---

### Task 9: 添加 TaskRepository.delete 方法 + deleteTask action

**Files:**
- Modify: `frontend/src/domains/tasks/repository/task.ts`
- Modify: `frontend/src/app/actions/tasks.ts`

- [ ] **Step 1: 在 TaskRepository 中添加 delete 方法**

在 `frontend/src/domains/tasks/repository/task.ts` 的 `archive` 方法之后添加：

```typescript
  /**
   * 彻底删除任务（不可恢复）
   * @param id - 任务 ID
   * @param userId - 用户 ID
   */
  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.tasks)
      .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
  }
```

- [ ] **Step 2: 在 app/actions/tasks.ts 中添加 deleteTask action**

在 `archiveTask` 函数之后添加：

```typescript
/**
 * 彻底删除任务（不可恢复）
 * @param taskId - 任务 ID
 */
export async function deleteTask(taskId: string): Promise<void> {
  const repo = new TaskRepository()
  return repo.delete(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
}
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/repository/task.ts \
        frontend/src/app/actions/tasks.ts
git commit -m "feat(tasks): 新增 TaskRepository.delete + deleteTask action

B-2: 支持硬删除操作（彻底删除，不可恢复）"
```

---

### Task 10: 任务详情抽屉 — 关闭 footer + 全屏按钮 + 删除操作

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-detail-drawer.tsx`
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`

这是最大的 Task，涉及抽屉组件的重构。

- [ ] **Step 1: 在 TaskTreePage 的 DrawerState 中添加 fullscreen 类型**

```tsx
// 修改前：
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string }
  | { type: 'thread'; threadId: string }

// 修改后：
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string }
  | { type: 'thread'; threadId: string }
  | { type: 'fullscreen'; taskId: string }
```

添加全屏相关回调：

```tsx
/** 进入全屏模式 */
const enterFullscreen = useCallback((taskId: string) => {
  setDrawer({ type: 'fullscreen', taskId })
}, [])

/** 退出全屏模式 */
const exitFullscreen = useCallback(() => {
  setDrawer({ type: 'closed' })
}, [])
```

在渲染区域添加全屏模式渲染（在 `{drawer.type === 'thread' && (...)}` 之后）：

```tsx
{drawer.type === 'fullscreen' && (
  <TaskFullscreenView
    taskId={drawer.taskId}
    userId={'placeholder' as any}
    onBack={exitFullscreen}
    onTaskChanged={handleTaskChanged}
  />
)}
```

注意：`handleTaskChanged` 来自 Task 5。如果 Task 5 未执行（refreshKey 不需要），则用空函数 `() => {}` 替代。

- [ ] **Step 2: 修改 TaskDetailDrawer — 替换"在新页面打开"为全屏按钮 + 添加 footer**

首先修改 props 接口，添加 `onEnterFullscreen` 和 `onTaskChanged`：

```tsx
/** TaskDetailDrawer 组件 Props */
interface TaskDetailDrawerProps {
  /** 任务 ID */
  taskId: USOM_ID
  /** 当前用户 ID */
  userId: USOM_ID
  /** 关闭回调 */
  onClose: () => void
  /** 进入全屏模式回调 */
  onEnterFullscreen?: (taskId: string) => void
  /** 任务变更通知回调 */
  onTaskChanged?: () => void
}
```

修改组件签名：

```tsx
export function TaskDetailDrawer({
  taskId,
  userId,
  onClose,
  onEnterFullscreen,
  onTaskChanged,
}: TaskDetailDrawerProps) {
```

将"在新页面打开"按钮替换为全屏按钮：

```tsx
// 修改前（约第 180-188 行）：
<button
  type="button"
  onClick={handleOpenFullPage}
  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
  title="在新页面打开"
>
  <ExternalLink className="size-3.5" />
  在新页面打开
</button>

// 修改后：
{onEnterFullscreen && (
  <button
    type="button"
    onClick={() => onEnterFullscreen(taskId)}
    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
    title="全屏模式"
  >
    <Maximize2 className="size-3.5" />
  </button>
)}
```

在文件顶部添加 import：

```tsx
import { Maximize2, Archive, Trash2, ArrowLeft, X, ChevronDown, Zap, ExternalLink } from 'lucide-react'
```

注意：`Maximize2` 是新增 import，其他已存在。如果 `ExternalLink` 不再使用可以移除。

修改 `handleTaskUpdate` 回调，同时通知父组件：

```tsx
const handleTaskUpdate = useCallback((updated: Task) => {
  setTask(updated)
  onTaskChanged?.()
}, [onTaskChanged])
```

在抽屉内容区域末尾、`</div>` 闭合标签之前，添加 footer：

```tsx
{/* ── 底部操作栏 ── */}
<div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await archiveTask(taskId)
          onTaskChanged?.()
          onClose()
          toast.success('任务已归档')
        } catch {
          toast.error('归档失败，请重试')
        }
      }}
    >
      <Archive className="size-3.5 mr-1" />
      归档
    </Button>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-error hover:text-error">
          <Trash2 className="size-3.5 mr-1" />
          彻底删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认彻底删除</AlertDialogTitle>
          <AlertDialogDescription>
            此操作不可撤销，任务将被永久删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                await deleteTask(taskId)
                onTaskChanged?.()
                onClose()
                toast.success('任务已删除')
              } catch {
                toast.error('删除失败，请重试')
              }
            }}
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
  <Button variant="secondary" onClick={onClose}>
    关闭
  </Button>
</div>
```

需要在文件顶部添加 import：

```tsx
import { deleteTask } from '@/app/actions/tasks'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
```

- [ ] **Step 3: 创建 TaskFullscreenView 组件**

在 `frontend/src/domains/tasks/components/` 下新建 `task-fullscreen-view.tsx`：

```tsx
/**
 * @file task-fullscreen-view
 * @brief 任务详情全屏视图 — 替换主内容区显示
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTaskById } from '@/app/actions/tasks'
import type { Task } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { TaskEditZone } from './task-edit-zone'
import { SystemCognitionPanel } from './system-cognition-panel'
import { SubtaskList } from './subtask-list'
import { TaskCompleteZone } from './task-complete-zone'

/**
 * TaskFullscreenView 组件属性
 */
interface TaskFullscreenViewProps {
  /** 任务 ID */
  taskId: string
  /** 当前用户 ID */
  userId: USOM_ID
  /** 返回回调 */
  onBack: () => void
  /** 任务变更通知回调 */
  onTaskChanged?: () => void
}

/**
 * 任务详情全屏视图
 * @description 在主内容区内展示完整任务详情
 */
export function TaskFullscreenView({ taskId, userId, onBack, onTaskChanged }: TaskFullscreenViewProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const t = await getTaskById(taskId)
        if (!cancelled) setTask(t)
      } catch {
        if (!cancelled) setTask(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [taskId])

  const handleTaskUpdate = useCallback((updated: Task) => {
    setTask(updated)
    onTaskChanged?.()
  }, [onTaskChanged])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <p className="text-sm mb-4">任务不存在</p>
        <Button variant="secondary" onClick={onBack}>返回任务树</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-hairline">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          返回任务树
        </Button>
        <span className="text-sm font-medium text-ink truncate">{task.title}</span>
      </div>

      {/* 详情内容 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        <div className="flex flex-col gap-6">
          <TaskEditZone task={task} onTaskUpdate={handleTaskUpdate} />
          <SystemCognitionPanel task={task} />
          <SubtaskList
            taskId={task.id}
            userId={userId}
            onOpenTask={() => {}}
          />
          <TaskCompleteZone
            task={task}
            userId={userId}
            onTaskUpdate={handleTaskUpdate}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 更新 TaskTreePage 传递新 props 给 TaskDetailDrawer**

```tsx
{drawer.type === 'task' && (
  <TaskDetailDrawer
    taskId={drawer.taskId}
    userId={'placeholder' as any}
    onClose={closeDrawer}
    onEnterFullscreen={enterFullscreen}
    onTaskChanged={handleTaskChanged}
  />
)}
```

- [ ] **Step 5: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：
- 打开任务详情抽屉 → 看到"全屏"图标（Maximize2）→ 点击后抽屉关闭，主内容区显示全屏详情
- 全屏模式下点击"返回任务树"→ 返回任务树视图
- 抽屉底部看到"归档"和"彻底删除"按钮
- 点击"彻底删除"→ 弹出确认对话框

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/tasks/components/task-detail-drawer.tsx \
        frontend/src/domains/tasks/components/task-fullscreen-view.tsx \
        frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "feat(tasks): 任务详情全屏模式 + 关闭 footer + 归档/删除操作

B-1: 全屏替换主内容区 + 关闭按钮
B-2: 归档和彻底删除双操作（AlertDialog 确认）"
```

---

### Task 11: 验收标准和预期产出字段

**Files:**
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx`

- [ ] **Step 1: 替换占位文字为实际输入框**

在 `task-edit-zone.tsx` 中，将底部占位区域替换为两个 `InlineTextarea`：

```tsx
// 修改前（约第 317-321 行）：
{/* ── 占位字段 ── */}
<div className="flex flex-col gap-1 pt-1 border-t border-hairline-soft">
  <span className="text-xs text-muted">验收标准 — 即将支持</span>
  <span className="text-xs text-muted">预期产出 — 即将支持</span>
</div>

// 修改后：
{/* ── 验收标准 & 预期产出 ── */}
<div className="flex flex-col gap-3 pt-1 border-t border-hairline-soft">
  <div>
    <label className="text-xs text-muted mb-1 block">验收标准</label>
    <InlineTextarea
      value={parseNotesField(task.notes, 'acceptance')}
      onSave={val => saveNotesField('acceptance', val)}
      placeholder="定义任务完成的判断标准..."
    />
  </div>
  <div>
    <label className="text-xs text-muted mb-1 block">预期产出</label>
    <InlineTextarea
      value={parseNotesField(task.notes, 'output')}
      onSave={val => saveNotesField('output', val)}
      placeholder="描述任务完成后的交付物..."
    />
  </div>
</div>
```

- [ ] **Step 2: 在 TaskEditZone 组件内部添加 notes 解析和保存辅助函数**

在 `saveField` 函数之后添加：

```tsx
/** 解析 notes JSON 字段中的特定部分 */
const parseNotesField = (notes: string | null | undefined, key: 'acceptance' | 'output'): string => {
  if (!notes) return ''
  try {
    const parsed = JSON.parse(notes)
    if (typeof parsed === 'object' && parsed !== null) {
      return (parsed as Record<string, string>)[key] || ''
    }
  } catch {
    // 非 JSON 格式（旧数据），整体作为验收标准显示
    if (key === 'acceptance') return notes
  }
  return ''
}

/** 保存 notes JSON 字段中的特定部分 */
const saveNotesField = async (key: 'acceptance' | 'output', value: string) => {
  let current: Record<string, string> = {}
  if (task.notes) {
    try {
      const parsed = JSON.parse(task.notes)
      if (typeof parsed === 'object' && parsed !== null) {
        current = parsed as Record<string, string>
      } else {
        current = { acceptance: task.notes }
      }
    } catch {
      current = { acceptance: task.notes }
    }
  }
  current[key] = value
  await saveField('notes', JSON.stringify(current))
}
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：打开任务详情 → 看到"验收标准"和"预期产出"输入框 → 输入内容后失去焦点 → 刷新页面数据保留。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/components/task-edit-zone.tsx
git commit -m "feat(tasks): 实现验收标准和预期产出字段 — notes JSON 格式存储

B-1: 替换占位文字为 InlineTextarea，兼容旧数据格式"
```

---

### Task 12: 主线归档 + 任务升级为主线

**Files:**
- Modify: `frontend/src/domains/tasks/components/thread-detail-drawer.tsx`
- Modify: `frontend/src/domains/tasks/pages/TaskTreePage.tsx`

- [ ] **Step 1: 在 ThreadDetailDrawer 详情模式中添加归档按钮**

在 `thread-detail-drawer.tsx` 的 `renderDetailHeader` 函数中，在状态操作按钮区域（暂停/恢复按钮之后）添加归档按钮：

```tsx
{/* 在暂停/恢复按钮之后添加 */}
{(thread.status === 'active' || thread.status === 'paused') && (
  <Button
    variant="secondary"
    size="sm"
    onClick={async () => {
      try {
        await updateThreadStatus(thread!.id, 'archived')
        onClose()
        toast.success('主线已归档')
      } catch {
        toast.error('归档失败，请重试')
      }
    }}
  >
    <Archive className="size-3.5 mr-1" />
    归档主线
  </Button>
)}
```

在文件顶部添加 `Archive` 图标的 import（检查是否已导入）。

- [ ] **Step 2: 实现任务升级为主线**

在 `TaskTreePage.tsx` 中修改 `promoteToThread` 回调，实现完整的升级流程：

```tsx
/** 将任务提升为主线 */
const promoteToThread = useCallback(async (taskId: string) => {
  // 获取任务数据以预填标题
  try {
    const task = await getTaskById(taskId)
    const threadName = task?.title ?? '新主线'
    // 打开创建模式抽屉，预填标题
    setDrawer({ type: 'thread', threadId: '__new__' })
    // 注意：ThreadDetailDrawer 的创建模式需要接收预填标题
    // 当前方案：直接使用 ThreadDetailDrawer 的创建流程
    // 后续可扩展：在 ThreadDetailDrawer 的 props 中添加 defaultName
  } catch {
    toast.error('获取任务信息失败')
  }
}, [])
```

注意：当前的 `ThreadDetailDrawer` 创建模式没有 `defaultName` prop。完整的升级流程（创建主线 + 更新任务的 threadId）需要在用户确认创建后执行。这需要修改 `ThreadDetailDrawer` 或在 `TaskTreePage` 中协调。

**简化方案**：当前的 `promoteToThread` 已经可以打开创建抽屉。创建完成后，用户可以在任务树中手动将任务关联到新主线。这是一个合理的 MVP 体验。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译无错误

手动验证：
- 打开主线详情 → 看到"归档主线"按钮 → 点击后主线消失
- 在任务树行上点击"更多" → "提升为主线" → 弹出创建抽屉

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/components/thread-detail-drawer.tsx \
        frontend/src/domains/tasks/pages/TaskTreePage.tsx
git commit -m "feat(tasks): 主线归档按钮 + 任务升级为主线入口

B-4: 主线详情中添加归档操作，任务树已有升级入口"
```

---

### Task 13: 阶段 B 验收检查点

**Files:** 无文件修改

- [ ] **Step 1: 编译检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 2: Lint 检查**

Run: `cd frontend && npm run lint`
Expected: 零新 warning

- [ ] **Step 3: 手动回归测试清单**

| 测试项 | 预期结果 |
|--------|---------|
| 打开 `/tasks` | 页面正常，无独立详情页路由 |
| manifest view_routes 仅剩 viewTaskTree | 路由声明只有 /tasks |
| 任务详情抽屉底部有"关闭"按钮 | 点击关闭抽屉 |
| 任务详情抽屉有全屏图标 | 点击后替换主内容区 |
| 全屏模式有"返回任务树" | 点击返回树视图 |
| 任务详情有"归档"按钮 | 点击后任务归档并关闭抽屉 |
| 任务详情有"彻底删除" | 点击弹出确认 → 确认后删除 |
| 验收标准/预期产出可编辑 | 输入内容后刷新数据保留 |
| 主线详情有"归档主线" | 点击后主线归档 |
| 侧边栏 action 名称为"任务树管理" | 导航显示正确 |

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "milestone: 阶段 B 功能优化完成 — 验收通过

B-1: 全屏模式 + 关闭 footer + 验收标准字段
B-2: 归档 + 彻底删除双操作
B-3: Action 重命名为任务树管理
B-4: 主线归档 + 任务升级入口
B-5: 移除独立详情页"
```
