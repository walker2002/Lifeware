# 任务树迭代优化设计

> 版本：v1.0 | 日期：2026-06-05
> 来源：`mydocs/dev/当前开发内容.md` — [003] 任务树 Bug 修复 + [004] 任务树功能优化
> 宪章合规：遵循 `.specify/memory/constitution.md` 所有约束

---

## 概述

本文档覆盖任务树模块的两个迭代阶段：

- **阶段 A**：修复 5 个已知 Bug（优先执行）
- **阶段 B**：实现 5 项功能优化

所有改动限定在 **Tasks Domain 内部**，不涉及 Nexus 核心组件、不新增 Domain、不修改 manifest 结构。

---

## 阶段 A：Bug 修复

### A-1：字体/图标过浅

**现象**：页面中删除字体、说明字体过浅，符号（如删除符号等）看不清楚。

**根因**：代码中过度使用 `text-muted-soft`（`#8e8b82`，极淡辅助文字）令牌。该令牌设计用于纯装饰性提示，但被误用于操作性元素（删除图标、操作按钮等），导致对比度不足。

**修复方案**：

审查以下文件中所有 `text-muted-soft` 的使用场景，按规则调整：

| 场景 | 当前 | 应改为 |
|------|------|--------|
| 操作性按钮/图标（删除、编辑等） | `text-muted-soft` | `text-muted` |
| 标签文字（优先级、能量等 label） | `text-muted-soft` | `text-muted` |
| 纯装饰性占位提示 | `text-muted-soft` | 保持不变 |

涉及文件：
- `domains/tasks/components/task-edit-zone.tsx` — 标签文字
- `domains/tasks/components/task-detail-drawer.tsx` — 操作按钮图标
- `domains/tasks/components/task-tree-view.tsx` — 行内操作图标
- `domains/tasks/components/thread-list-panel.tsx` — 辅助文字

**UI-DESIGN-SPEC 合规**：不需要修改规范文件。令牌体系本身合理，问题在于使用层面。修复后的对比度符合暗色模式 ≥ 4.5:1 要求（C-07）。

---

### A-2：点击 clarity/status 区域清除左面板

**现象**：在任务详情抽屉中点击 clarity、status 的 select 区域时，左侧主线列表面板消失。

**根因分析**：`select` 元素的 `onChange` 触发 `saveField` → `updateTask` → `onTaskUpdate` 回调链。在 `TaskDetailDrawer` 中 `onTaskUpdate` 通过 `setTask(updated)` 更新状态。由于 `TaskTreePage` 的 `TaskDetailDrawer` 是 `drawer.type === 'task'` 条件渲染的，状态更新可能导致组件重渲染时遮罩层 `onClick` 被意外触发（事件冒泡到 overlay）。

**修复方案**：

1. 在 `task-edit-zone.tsx` 的所有 `select` 元素上添加 `onClick={e => e.stopPropagation()}`，防止事件冒泡到抽屉遮罩层
2. 在 `TaskDetailDrawer` 的内容区域添加 `onClick={e => e.stopPropagation()}`，防止整个内容区域的点击事件冒泡到 overlay
3. 验证修复后 clarity/status 的 select 操作不再影响左面板状态

---

### A-3："创建主线"按钮无响应

**现象**：点击页面头部"创建主线"按钮没有任何反应。

**根因**：`TaskTreePage.tsx:89` 的 Button 缺少 `onClick` handler。

**修复方案**：

```tsx
// 修改前（TaskTreePage.tsx）：
<Button variant="outline" size="sm">
  <Plus className="size-4" />
  创建主线
</Button>

// 修改后：
<Button variant="outline" size="sm" onClick={() => openThreadDetail('__new__')}>
  <Plus className="size-4" />
  创建主线
</Button>
```

复用已有的 `ThreadDetailDrawer` 创建模式（`threadId === '__new__'`）。无需新增组件。

---

### A-4："快速添加任务"创建失败

**现象**：在"快速添加任务"输入信息后提示"创建任务失败，请重试"。

**根因**：`TaskTreePage.tsx:93` 的"快速添加任务"Button 同样缺少 `onClick` handler，且没有关联的输入框。

**修复方案**：

在 `TaskTreeView` 底部添加内联快速创建输入框：

1. 在 `TaskTreeView` 组件中添加一个底部输入区域
2. 输入框使用 `text-ink` + `border-hairline` 样式，placeholder 为"输入任务标题，回车创建..."
3. 回车触发调用 `createTask` action，自动关联当前选中的 `threadId`
4. 成功后刷新任务树（递增 `refreshKey` 或重新调用 `loadRootTasks`）
5. 失败时通过 `toast.error` 提示

同时在 `TaskTreePage.tsx` 中移除头部的"快速添加任务"按钮（功能已内联到树视图中）。

---

### A-5：完成任务后样式未刷新

**现象**：任务标记为"完成"后，任务树列表样式不刷新，应显示 ✅ 和删除线。

**根因**：`TaskTreeView` 的数据在初始加载后不自动刷新。`TaskDetailDrawer` 中完成操作调用 `onTaskUpdate` 时，更新仅停留在抽屉内部，未传递到树视图。

**修复方案**：

1. 在 `TaskTreePage` 中新增 `onTaskChanged` 回调，递增 `refreshKey` 状态
2. 将 `refreshKey` 传递给 `TaskTreeView` 作为 `useEffect` 依赖，触发重新加载
3. 在 `TaskTreeRow` 中根据 `task.status === 'completed'` 渲染：
   - 标题添加 `line-through text-muted` 样式（删除线 + 灰色）
   - 状态指示器替换为 ✅ 图标（使用 `text-success` 颜色）
4. 修改 `TaskDetailDrawer` 的 `onTaskUpdate` 同时调用 `TaskTreePage` 提供的 `onTaskChanged`

---

## 阶段 B：功能优化

### B-1：任务详情页改进

#### 取消/保存按钮

在 `TaskDetailDrawer` 底部添加固定 footer：

- **取消**按钮：`variant="secondary"`，点击关闭抽屉
- **保存**按钮：`variant="primary"`，仅在字段有修改时激活
- 实现 dirty 检测：将初始 task 快照与当前 task 比较
- Footer 使用 `border-t border-hairline` 分隔，固定在抽屉底部

#### 全屏模式

替换"在新页面打开"为全屏图标：

1. 在 `TaskTreePage` 的 `DrawerState` 中新增 `fullscreen` 类型：
   ```tsx
   type DrawerState =
     | { type: 'closed' }
     | { type: 'task'; taskId: string }
     | { type: 'thread'; threadId: string }
     | { type: 'fullscreen'; taskId: string }  // 新增
   ```

2. 将 `TaskDetailDrawer` 顶部的"在新页面打开"（`ExternalLink` 图标）替换为"全屏"（`Maximize2` 图标）

3. 点击全屏按钮：
   - 关闭抽屉（`setDrawer({ type: 'closed' })`）
   - 设置全屏状态（`setDrawer({ type: 'fullscreen', taskId })`）

4. 全屏模式下，主内容区渲染任务详情组件：
   - 顶部固定栏：返回按钮（`ArrowLeft` + "返回任务树"）+ 任务标题
   - 内容区域复用 `TaskEditZone`、`SystemCognitionPanel`、`SubtaskList`、`TaskCompleteZone`

5. 点击"返回任务树"：`setDrawer({ type: 'closed' })`

#### 验收标准/预期产出

在 `TaskEditZone` 的占位区域实现两个 `InlineTextarea` 字段：

- **验收标准**：映射到 Task.notes 字段（复用现有字段承载，不新增数据库列）
- **预期产出**：同上，以分隔符区分两个部分

移除原有的"即将支持"占位文字。

---

### B-2：任务删除操作

支持归档 + 硬删除双操作：

**归档操作**（默认）：
- 在任务详情抽屉底部（footer 区域）添加"归档"按钮
- 调用已有的 `archiveTask(taskId)` action
- 成功后关闭抽屉，刷新任务树
- 样式：`variant="secondary"` + `Archive` 图标

**彻底删除**（需二次确认）：
- 在归档按钮旁添加"彻底删除"文字链接
- 样式：`text-error hover:text-error` + `Trash2` 图标
- 点击后弹出确认对话框（`AlertDialog`）："此操作不可撤销，确认彻底删除？"
- 确认后调用 `deleteTask(taskId)` action
- **新增**：在 `TaskRepository` 中实现 `delete` 方法（当前只有 `archive`）
- **新增**：在 `app/actions/tasks.ts` 中添加 `deleteTask` action

**Repository 变更**：
```typescript
// TaskRepository 新增方法
async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
  await db.delete(s.tasks)
    .where(and(eq(s.tasks.id, id), eq(s.tasks.userId, userId)))
}
```

---

### B-3：Action 重命名

将导航/侧边栏中的"查看任务树"重命名为"任务树管理"：

- 检查 `manifest.yaml` 中 `intent_triggers` 的 `description` 字段
- 更新侧边栏导航配置中的显示名称
- 确保重命名后所有引用一致

---

### B-4：任务树管理功能

#### 任务升级为主线

已有 `onPromoteToThread` 回调和 `ThreadDetailDrawer` 创建模式。

实现流程：
1. 用户在任务树行上点击"升级为主线"操作
2. 打开 `ThreadDetailDrawer` 创建模式（`__new__`），预填任务标题
3. 用户确认创建后：
   - 调用 `createThread` 创建新主线
   - 调用 `updateTask` 将任务的 `threadId` 设为新主线 ID
4. 刷新任务树

#### 归档主线

在 `ThreadDetailDrawer` 详情模式的操作按钮区域添加"归档主线"按钮：
- 样式：`variant="secondary"` + `Archive` 图标
- 调用已有的 `updateThreadStatus(threadId, 'archived')`
- 成功后刷新主线列表和任务树

#### 归档任务

同 B-2 中的归档操作，在任务树行上也提供归档操作入口（右键菜单或操作图标）。

---

### B-5：移除独立详情页

移除以下无意义的独立页面：

**删除文件**：
- `frontend/src/app/tasks/[id]/page.tsx`（自动生成的路由文件）
- `frontend/src/domains/tasks/pages/TaskDetailPage.tsx`
- `frontend/src/domains/tasks/pages/ThreadDetailPage.tsx`

**配置更新**：
- 从 `manifest.yaml` 的 `view_routes` 中移除 TaskDetail 和 ThreadDetail 的路由声明
- 重新运行 `npm run generate:routes` 清理 `app/` 目录中的孤立路由

**验证**：
- 确认任务详情和主线详情仅通过 `TaskTreePage` 的抽屉/全屏模式访问
- 确认无其他组件引用被删除的页面

---

## 架构合规声明

| 约束 | 合规说明 |
|------|----------|
| Repository Pattern (R-01~R-04) | 所有数据操作通过 `app/actions/tasks.ts` 调用 Repository，Nexus/Domain 不直接 import Drizzle |
| Multi-Tenancy (T-01~T-04) | 所有查询使用 `MVP_USER_ID`，通过 Repository 层注入 |
| Domain Passivity (VI) | 仅修改 Tasks Domain 内部组件，不涉及 Nexus 核心组件 |
| Bridge Layer Readiness (VII) | Server Actions 签名不依赖 HTTP context |
| UI-DESIGN-SPEC (C-01~C-07) | 所有颜色使用设计令牌，对比度符合 C-07 要求 |
| Single-Writer Invariant (III) | 写操作通过 Server Actions → Repository 路径，不绕过 |

---

## 涉及文件清单

### 修改文件

| 文件 | 阶段 | 说明 |
|------|------|------|
| `domains/tasks/components/task-tree-view.tsx` | A-1, A-4, A-5 | 对比度修复 + 快速创建输入框 + 完成样式 |
| `domains/tasks/components/task-edit-zone.tsx` | A-1, A-2 | 对比度修复 + stopPropagation |
| `domains/tasks/components/task-detail-drawer.tsx` | A-2, B-1 | stopPropagation + 全屏 + 取消/保存 + 删除 |
| `domains/tasks/components/thread-detail-drawer.tsx` | B-4 | 归档主线按钮 |
| `domains/tasks/components/thread-list-panel.tsx` | A-1 | 对比度修复 |
| `domains/tasks/pages/TaskTreePage.tsx` | A-3, A-4, A-5, B-1 | 按钮连接 + 状态刷新 + 全屏模式 |
| `domains/tasks/repository/task.ts` | B-2 | 新增 delete 方法 |
| `app/actions/tasks.ts` | B-2 | 新增 deleteTask action |
| `domains/tasks/manifest.yaml` | B-3, B-5 | 重命名 + 移除路由 |

### 删除文件

| 文件 | 阶段 | 说明 |
|------|------|------|
| `app/tasks/[id]/page.tsx` | B-5 | 移除独立详情路由 |
| `domains/tasks/pages/TaskDetailPage.tsx` | B-5 | 移除独立任务详情页 |
| `domains/tasks/pages/ThreadDetailPage.tsx` | B-5 | 移除独立主线详情页 |

---

## 执行顺序

```
阶段 A（Bug 修复）→ 验证全部通过 → 阶段 B（功能优化）
```

阶段 A 内部顺序：A-3 → A-4 → A-2 → A-5 → A-1（先修复功能性 Bug，最后处理视觉问题）

阶段 B 内部顺序：B-5 → B-3 → B-2 → B-1 → B-4（先清理无用页面，再逐项实现功能）
