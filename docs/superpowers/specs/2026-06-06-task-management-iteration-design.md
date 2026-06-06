# 任务管理迭代优化 — 设计文档

**日期**：2026-06-06
**版本**：1.0
**状态**：已确认

---

## 概述

本文档涵盖任务管理模块的三项迭代优化需求，均属于 MVP 阶段 UI 层改动，不涉及 Nexus 核心组件或 USOM 对象变更。

| ID | 需求 | 改动范围 |
|---|---|---|
| [005] | 任务/主线彻底删除的校验逻辑 | 两个 Drawer 组件 + 删除按钮状态 |
| [006] | 任务 Detail 交互升级 | TaskDetailDrawer + SubtaskList + 新增 Server Action |
| [007] | 任务列表多层次显示 + 主线提示 | TaskTreeView + TaskTreeRow |

**治理合规**：
- 所有改动均在 Domain Plugin 的 Page 组件层，符合宪章 Domain Registration Process 的 Page component data access rules
- 删除操作的前端校验属于 UI 层即时反馈，不替代后续 Bridge Layer 接入时的后端校验
- 无 USOM 对象变更，无 Repository 接口变更，无 Nexus 组件改动

---

## [005] 任务彻底删除的校验逻辑

### 业务规则

**Thread（主线）删除**：
- 条件：不存在下级任务
- 不限 Thread 自身状态（active / paused / completed / archived 均可删除）

**Task（普通任务）删除**：
- 条件：状态为 `todo` 或 `archived` 且不存在子任务
- 其他状态（planned / in_progress / completed）不允许删除

### 实现方案：前端校验

**理由**：MVP 阶段所有操作通过 UI 触发，前端校验足够。后续 Bridge Layer 接入时再补后端校验。

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-detail-drawer.tsx` | 删除按钮增加状态 + 子任务前置校验 |
| `thread-detail-drawer.tsx` | 新增「彻底删除」按钮 + 下级任务校验 |

### Task 校验流程

```
用户点击「彻底删除」
  → 检查 task.status
    → 非 todo/archived → 按钮禁用 + title 提示"仅待办/已归档任务可删除"
    → todo/archived → 检查子任务数量（从已有的 childCounts 获取）
      → 有子任务 → 按钮禁用 + title 提示"存在子任务，无法删除"
      → 无子任务 → 弹出 AlertDialog 确认 → 执行 deleteTask
```

### Thread 校验流程

```
用户点击「彻底删除」
  → 调用 getTasks({ threadId }) 检查下级任务
    → 有下级任务 → 按钮禁用 + title 提示"存在下级任务，无法删除"
    → 无下级任务 → 弹出 AlertDialog 确认 → 执行 deleteThread
```

### 实现细节

1. **TaskDetailDrawer**：
   - 加载 task 数据时，同时调用 `getChildCounts([taskId])` 获取子任务数量
   - 删除按钮根据 `(status === 'todo' || status === 'archived') && childCount === 0` 决定是否可用
   - 禁用时使用 `title` 属性提示原因（无需额外 tooltip 组件）
   - 更新 AlertDialog 描述文字，移除"子任务将变为独立任务"

2. **ThreadDetailDrawer**：
   - 详情模式已有 `counts.taskCount` 数据（从 `findByIdWithCount` 获取），直接复用
   - 新增删除按钮，位于底部操作栏（与现有归档按钮并列）
   - 条件：`counts.taskCount === 0` 时可用
   - 调用已有的 `deleteThread(threadId)` Server Action

### 不改动

- `deleteTask` / `deleteThread` Server Action 无需改动
- Repository 层无改动
- USOM / Schema 无改动

---

## [006] 任务 Detail 交互升级

### 核心机制：任务导航栈

`TaskDetailDrawer` 内部维护一个导航栈，支持在同一个抽屉内进行任务间导航。

```typescript
/** 导航栈条目 */
interface NavEntry {
  taskId: string
  task: Task | null
  hasUnsavedChanges: boolean
}
```

- 打开抽屉时，初始化栈为 `[{ taskId, task: null, hasUnsavedChanges: false }]`
- 点击子任务 → push 新条目，抽屉内容切换
- 点击面包屑层级 → pop 到该层级
- 面包屑路径 = 栈中所有条目的 task.title

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-detail-drawer.tsx` | 引入导航栈；新增面包屑组件；修改关闭逻辑拦截未保存修改 |
| `subtask-list.tsx` | `onOpenTask` 回调连接到导航栈的 push |
| `actions/tasks.ts` | 新增 `getTaskAncestors` Server Action |

### 子功能 1 — 面包屑路径

**布局**：抽屉顶部（操作栏下方、内容区上方）显示路径导航。

```
任务树 > 父任务A > 当前任务B
```

- 「任务树」为固定文本，可点击（效果等同于关闭抽屉）
- 中间层级显示 task.title，可点击（在抽屉内切换到该任务）
- 当前层级（最后一项）显示为加粗文本，不可点击

**数据来源**：

- 新增 Server Action `getTaskAncestors(taskId)`：沿 `parentId` 向上递归查询，返回 `Array<{ id: string, title: string }>`
- 打开抽屉时调用一次构建初始面包屑
- 导航栈中已访问过的层级直接从栈中读取标题，无需重复请求

**样式**：
- 使用 `text-muted` 颜色，hover 时变为 `text-ink`
- 层级间用 `>` 符号分隔
- 遵循 UI-DESIGN-SPEC 的色彩令牌（text-ink / text-muted / text-primary）

### 子功能 2 — 子任务跳转

- `SubtaskList` 的 `onOpenTask` 回调从空函数改为实际的导航函数
- 点击子任务 → push 新 `NavEntry` → 抽屉内容切换到新 task
- 面包屑自动延伸（新 task 的 title 追加到路径末尾）
- 新 task 的 `hasUnsavedChanges` 初始为 `false`

### 子功能 3 — 未保存修改拦截

**脏数据检测**：

- `TaskEditZone` 新增 `onDirtyChange?: (dirty: boolean) => void` 回调
- 当用户修改表单字段时调用 `onDirtyChange(true)`，保存成功后调用 `onDirtyChange(false)`
- `NavEntry.hasUnsavedChanges` 由回调更新

**关闭拦截逻辑**：

触发关闭时（遮罩点击 / ESC / 关闭按钮）：
1. 检查当前 `NavEntry.hasUnsavedChanges`
2. `false` → 直接关闭
3. `true` → 弹出 AlertDialog：
   - 标题：「未保存的修改」
   - 内容：「关闭将丢失当前编辑内容，确认关闭？」
   - 按钮：「继续编辑」/「放弃修改」

**遮罩层改动**：

- 当前：`<div onClick={onClose}>`
- 改后：`<div onClick={handleCloseAttempt}>`（`handleCloseAttempt` 内含脏数据检查）

**ESC 键改动**：

- 当前：直接调用 `onClose()`
- 改后：调用 `handleCloseAttempt()`

---

## [007] 任务列表多层次显示 + 主线提示

### 子功能 1 — 修复多层次展开

**根因**：`TaskTreeRow` 构建子节点时 `childCount` 硬编码为 `0`（`task-tree-view.tsx:460`），导致第三层及以下无法展开。

**修复**：

1. 新增 state：`const [childCountMap, setChildCountMap] = useState<Map<string, number>>(new Map())`

2. `handleToggle` 中加载子任务后，额外调用 `getChildCounts(childrenIds)` 获取每个子节点的子任务计数：

```typescript
if (!loadedIds.has(id) && node.childCount > 0) {
  const children = await getSubtasks(id)
  setChildData(prev => { const next = new Map(prev); next.set(id, children); return next })

  // 获取子节点的子任务计数
  const childrenIds = children.map(c => c.id)
  if (childrenIds.length > 0) {
    const counts = await getChildCounts(childrenIds)
    setChildCountMap(prev => {
      const next = new Map(prev)
      childrenIds.forEach(cid => next.set(cid, counts[cid] ?? 0))
      return next
    })
  }
}
```

3. `TaskTreeRow` 构建 children 时从 `childCountMap` 读取：

```typescript
const cnt = childCountMap.get(t.id) ?? 0  // 替代硬编码 0
```

4. 将 `childCountMap` 传递给递归的 `TaskTreeRow`

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-tree-view.tsx` | 新增 `childCountMap` state；`handleToggle` 获取子节点计数；传递给 `TaskTreeRow` |

### 子功能 2 — 行内主线标签

**数据加载**：

- `TaskTreeView` 初始化时调用 `getThreads()` 获取所有主线数据
- 构建映射表：`Map<threadId, { name: string, color: string }>`
- 传递给 `TaskTreeRow`

**渲染规则**：

| 条件 | 显示 |
|---|---|
| `task.threadId` 有值且映射表存在 | 颜色圆点 + 主线名称（紧凑标签） |
| `task.threadId` 为空 | 不显示 |
| 列表已按主线筛选（`threadId !== '__all__'`） | 隐藏标签（避免冗余） |

**标签样式**：

```
[颜色圆点] 主线名称
```

- 圆点：6px，使用主线 `color` 属性
- 文字：9px，使用 `text-muted` 颜色
- 容器：`rounded px-1.5 py-0.5`，半透明背景
- 位于任务标题右侧，优先级徽章之后

### 改动文件

| 文件 | 改动内容 |
|---|---|
| `task-tree-view.tsx` | 加载主线映射；`TaskTreeRow` 渲染主线标签；按筛选条件控制显示 |

### 不改动

- `thread-list-panel.tsx` 无需改动
- Repository 层无改动
- USOM / Schema 无改动

---

## 实现优先级

建议实现顺序：

1. **[005] 删除校验** — 独立，改动最小，可先行
2. **[007] 多层次 + 主线标签** — 独立，修复 bug + 增强展示
3. **[006] Detail 交互升级** — 改动最大，涉及导航栈和面包屑，放最后

每个需求可独立测试和提交。

---

## 风险与约束

| 风险 | 缓解措施 |
|---|---|
| 删除校验仅前端，后端无保护 | MVP 可接受，Bridge Layer 阶段补充后端校验 |
| 导航栈可能累积大量缓存 | 限制栈深度（超过 10 层时弹出最早条目） |
| 主线映射表全量加载 | MVP 阶段主线数量有限（通常 < 20），无性能问题 |
| `getTaskAncestors` 递归查询 | 5 层深度最多 5 次查询，可接受；后续可优化为单次 CTE 查询 |
