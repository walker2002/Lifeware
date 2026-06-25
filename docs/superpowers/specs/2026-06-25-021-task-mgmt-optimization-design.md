# [021] 任务管理 Domain 迭代优化 — 设计文档

- **日期**：2026-06-25
- **需求来源**：`mydocs/dev/021-任务管理系统优化.md`
- **范围**：任务管理 Domain 前端组件层优化（4 区块 + 1 共用基础设施）
- **规模定性**：普通任务（多文件、边界清晰），无 DB/USOM schema 变更
- **状态**：设计已确认，待实现计划

---

## 1. 背景与目标

任务管理 Domain 经多轮迭代后，用户在日常使用中提出 4 类优化：创建表单时长输入不一致、任务树 Page 两处交互缺失与一个删除 bug、抽屉式页面面包屑硬编码与子任务刷新 bug、以及清理两个尚未落地 AI 管道的占位 action。

**目标**：消除上述体验断层与 bug，使「创建 → 树形管理 → 抽屉编辑」链路的时长输入、跳转、面包屑、刷新行为一致且正确；移除指向不存在 AI 管道的 action 入口。

**非目标（YAGNI）**：
- 不重构 TaskDetailDrawer 的导航栈/ABCD 区结构
- 不变更 duration 字段单位（仍为分钟）与 USOM/DB schema
- 不删除底层 `clarity`/`decomposition` 字段评估（仅删指向它们的 AI action 入口）
- 不实现真正的 AI 细化/拆分管道（本任务只清理入口）

---

## 2. 需求清单（来自 mydocs/dev/021）

| 编号 | 需求 | 类型 |
|---|---|---|
| 01 | 创建新任务 CNUI 时长改为「xx小时 xx分钟」，与详情页一致 | 体验一致 |
| 02a | 主线列表「...」删除后界面仍显示该主线 | Bug |
| 02b | 「在下方新建子任务」当前提示「即将支持」，应跳转子任务编辑抽屉 | 功能补全 |
| 02c | 快速添加输入框后加「+」按钮，打开任务详细编辑抽屉 | 功能补全 |
| 03a | 抽屉面包屑根节点硬编码「任务树」，应按顶层类型动态显示 | 体验修复 |
| 03b | 抽屉内子任务区「+」按钮应打开详细编辑抽屉（带文本预填） | 功能补全 |
| 03c | 抽屉内加第一个子任务返回后，主任务无法展开子任务，需手动刷新 | Bug |
| 04 | 删除「AI 帮助细化模糊任务」「AI 建议拆分可拆分任务」两个 action（含成长领域菜单、manifest、关联代码、CNUI） | 清理 |

**已确认的关键决策**（通过澄清问答）：
1. 04 删除彻底度：**彻底删除入口与 cue 信号**，保留底层 `calculateClarity`/`calculateDecomposition` 与字段。
2. 03b「+」按钮：**回车保留快速添加（仅标题），+ 按钮改为打开详细编辑抽屉**。
3. 02b/02c 跳转预填：**带已输入文本 + 正确父级关系**。

---

## 3. 现状分析（含 Bug 根因）

### 3.1 时长输入（01）

- `TaskCreationCard.tsx:148-167`：单框 number 输入，label「预估时长（分钟）」，placeholder「60」，`onDataChange` 存原始分钟数。
- 详情页 `task-edit-zone.tsx:441-508` 的 `DurationEdit` 已是「小时 + 分钟」双框。
- `lib/format-duration.ts` 工具齐全：`formatDuration` / `parseDurationToMinutes` / `durationHours` / `durationMinutes`。
- **结论**：函数已具备，CNUI 只需仿照双框 UI + 改用工具函数，无需新建工具。

### 3.2 删除主线 bug（02a）

`thread-list-panel.tsx:323-330` 删除分支：

```tsx
} else if (act.action === 'delete') {
  const targetStatus = ACTION_TO_TARGET_STATUS[act.action]  // ← 'delete' 无映射 → undefined
  if (targetStatus) {                                        // ← false，整块跳过
    await updateThreadStatus(thread.id, targetStatus as Thread['status'])
    toast.success(`${act.label}成功`)
    setLocalRefreshKey(k => k + 1)
  }
}
```

- `ACTION_TO_TARGET_STATUS`（:69-74）仅含 `pause/resume/complete/archive`，**无 `delete`**。
- 故 `targetStatus=undefined` → `if(targetStatus)` 静默跳过，主线从未被删除。
- 文件顶部已 `import { deleteThread }`（:15）却从未使用。
- 即便走到 `updateThreadStatus(id,'deleted')`，其 `THREAD_STATUS_TO_ACTION`（tasks.ts:499-504）同样无 `deleted` 映射，会抛「不支持的线程目标状态」。
- 正确入口：`deleteThread(threadId)`（tasks.ts:661，走 SM `archived→deleted` 软删）。
- **验证点**：`getThreads`→`findAllWithCount` 是否过滤 `status='deleted'` 的 thread；若不过滤，删除后列表仍显示，需在仓储层补过滤。

### 3.3 子任务刷新 bug（03c）

- `subtask-list.tsx:104-119` `handleAdd` 添加子任务后仅 `await loadSubtasks()`（刷新抽屉内部列表）。
- `TaskDetailDrawer` 的 `onTaskChanged`（→ TaskTreePage `handleDataChanged` → `refreshKey++` → 任务树重载）**仅在 `handleTaskUpdate`（TaskEditZone 更新）时触发**。
- 故抽屉内加子任务 → `refreshKey` 不递增 → 右侧 `task-tree-view` 不重载 → 主任务 `childCount` 仍为 0 → 无展开箭头，需手动刷新页面。
- 刷新机制本身健全（`refreshKey` 贯穿 tree + 主线列表），缺的只是 SubtaskList → drawer 的变更通知。

### 3.4 面包屑硬编码（03a）

`task-detail-drawer.tsx:216-248` `breadcrumbItems` 根节点硬编码「任务树」（:226）。`ancestors` 来自 `getTaskAncestors`（沿 parentId 递归，返回 `{id,title}[]`）。
- **验证点**：子任务 threadId 继承情况。`subtask-list` 创建子任务传 `threadId: undefined`，子任务可能无 threadId；判断顶层归属时可能需回溯 ancestors 链顶端 root task。

### 3.5 新建抽屉缺口（02b/02c/03b 共性）

- `TaskTreePage.openTaskDetail(taskId)`（:75）只能打开**已存在**任务的 `TaskDetailDrawer`。
- 三个入口（02b 子任务、02c 顶层新任务、03b 抽屉内子任务）都需要「打开新建编辑抽屉」，当前无此能力。
- `task-tree-view` 有 `onDataChanged` 回调，但无「打开新建抽屉」入口 prop。

### 3.6 待删 AI action（04）

`refineTask` / `splitTask` 散布于：

| 位置 | 内容 |
|---|---|
| `manifest.yaml:89-107` | 两个 action 的 intentTriggers |
| `manifest.yaml:520-525` | `task-action-panel` / `task-split-card` 两个 cnui_surfaces |
| `cnui/handlers.ts:254-283` | refineTask/splitTask 处理 |
| `cnui/handlers.ts:441-449` | 两个 action 的提交处理 |
| `cnui/handlers.ts:511` | `task-split-card` handler 导出 |
| `cnui/surfaces/TaskActionPanel.tsx` | refine 分支与标签（同时承载 complete/archive/delete） |
| `cnui/surfaces/TaskSplitCard.tsx` | 整文件（占位 UI「AI 拆分功能开发中」） |
| `index.ts:19-20,44-51` | 组件 import + registry 注册 |
| `hooks.ts:247-269` | onActionSurfaceRequest 中 `refine_task`/`split_task` cue |
| `hooks/use-intent-handler.ts:325-326` | 两个 action 的成功消息 |
| `components/system-cognition-panel.tsx:172-177` | decomposition splittable 提示 |

**注意**：`task-action-panel` surface 同时承载 completeTask/archiveTask/deleteTask，**不能整体删除**，仅移除 refine 分支。

---

## 4. 设计方案

### 4.0 共用基础设施：新建任务抽屉 `TaskCreateDrawer`

**选址理由**：`TaskDetailDrawer` 为查看/编辑已存在任务设计（导航栈 + 面包屑 + A/B/C/D 区 + 自动保存），混入 createMode 会产生大量无意义条件分支。新建独立 `TaskCreateDrawer` 职责单一。

**组件契约**：

```tsx
interface TaskCreateDefaults {
  title?: string         // 预填标题（来自快速添加框已输入文本）
  threadId?: string      // 预填主线归属
  parentId?: string      // 预填父任务（02b/03b 子任务入口）
}

interface TaskCreateDrawerProps {
  defaults: TaskCreateDefaults
  userId: USOM_ID
  onClose: () => void
  onCreated: (task: Task) => void   // 创建成功回调 → 触发父页面刷新
}
```

- **外壳**：复用 `TaskDetailDrawer` 的滑入动画、可拖拽宽度（400-800px）、ESC 关闭、遮罩层样式（保持视觉一致）。
- **表单字段集**：对齐 `TaskCreationCard`——`title`*(必填)、`description`、`priority`、`estimatedDuration`（双框，复用 `format-duration`）、`threadId`（下拉，默认 `defaults.threadId`）、`parentId`（来自 defaults，只读展示或隐藏）。
- **校验**：复用 `useManifestRules` + `taskRuleRegistry`（与 TaskCreationCard 一致的 realtime blur 校验）。
- **提交**：`createTask({ title, description, priority, estimatedDuration, threadId, parentId })`。
- **`DrawerState` 扩展**（TaskTreePage.tsx:32）：

```tsx
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string }
  | { type: 'thread'; threadId: string }
  | { type: 'fullscreen'; taskId: string }
  | { type: 'create'; defaults: TaskCreateDefaults }   // ← 新增
```

### 4.1 区块 01 — 时长双框

`TaskCreationCard.tsx`：
- `estimatedDuration` state（string 单值）→ 拆为 `durHours` / `durMinutes`（string），用 `durationHours`/`durationMinutes` 从 `dataModel.estimatedDuration` 初始化。
- 输入区改为双框 + 「小时」「分钟」label，视觉对齐 `DurationEdit`。
- `onDataChange` / `handleConfirm` 存 `parseDurationToMinutes(durHours, durMinutes)`（>0 才存，否则 undefined）。
- label「预估时长（分钟）」→「预估时长」。

### 4.2 区块 02 — 任务树 Page

**02a 删除主线 bug**（`thread-list-panel.tsx:323-330`）：

```tsx
} else if (act.action === 'delete') {
  await deleteThread(thread.id)          // ← 改调 deleteThread（已 import）
  toast.success(`${act.label}成功`)
  setLocalRefreshKey(k => k + 1)
}
```

- 删除「无意义的 `ACTION_TO_TARGET_STATUS[delete]` + `if(targetStatus)` 守卫」。
- 实现时验证 `findAllWithCount` 过滤 deleted；若不过滤则在 `ThreadRepository.findAllWithCount` 补 `status != 'deleted'` 条件。

**02b 「在下方新建子任务」**（`task-tree-view.tsx` 菜单项）：
- `TaskTreeViewProps` 新增 `onCreateSubtask?: (parentTaskId: string) => void`。
- 菜单项 `toast.info(...)` → `onCreateSubtask?.(task.id)`。
- TaskTreePage 实现：打开 `TaskCreateDrawer`，`defaults={ parentId: parentTaskId, threadId: 父任务 threadId }`（父任务 threadId 从 task 数据取，若父任务无 threadId 则子任务也无）。

**02c 快速添加 + 按钮**（`task-tree-view.tsx:622-636`）：
- 输入框后新增 + 按钮（图标 `Plus`）。
- onClick → `onOpenTaskCreate?.({ title: quickAddText, threadId: 当前列表归属 })`。
- `TaskTreeViewProps` 新增 `onOpenTaskCreate?: (defaults: TaskCreateDefaults) => void`。
- 「当前列表归属」：`threadId` prop（`__all__`/`__orphan__`/具体 id）映射——`__orphan__`→无 thread，具体 id→该 thread，`__all__`→无预填（用户在抽屉选）。
- 回车保持现状（仅标题快速创建）。

### 4.3 区块 03 — 抽屉

**03a 面包屑动态根**（`task-detail-drawer.tsx:216-248`）：
- 根节点 label 计算：优先用「整树所属主线」。
- 数据来源策略：`currentTask.threadId` 存在 → `getThreadById(threadId).name`；不存在 → 若有 ancestors，回溯 ancestors 顶端 root task 查其 threadId；仍无 → 「普通任务」。
- 实现时先验证子任务 threadId 继承：若 createTask intent 已从 parent 继承 threadId，则直接用 `currentTask.threadId` 即可，无需回溯（最简）。
- drawer 内新增 `rootLabel` state（loadTask 时一并设置），面包屑根节点用 `rootLabel` 替代硬编码「任务树」。

**03b 子任务区 + 按钮**（`subtask-list.tsx:201-212`）：
- `SubtaskListProps` 新增 `onOpenSubtaskCreate?: (defaults: { parentId: string; title?: string }) => void`。
- 现有 + 按钮 `onClick={handleAdd}` → 改为 `onClick={() => onOpenSubtaskCreate?.({ parentId: taskId, title: newTitle })}`。
- 回车（`onKeyDown Enter`）保留 `handleAdd` 快速添加（按决策 2）。
- drawer 将 `onOpenSubtaskCreate` 转发到 TaskTreePage 打开 `TaskCreateDrawer`。

**03c 子任务刷新**（`subtask-list.tsx` + `task-detail-drawer.tsx`）：
- `SubtaskListProps` 新增 `onChanged?: () => void`。
- `handleAdd` 成功后调用 `onChanged?.()`（在 `loadSubtasks()` 之后）。
- drawer 传 `onChanged={() => onTaskChanged?.()}` → 触发 `refreshKey++` → 任务树重载（主任务 `childCount` 更新 → 出现展开箭头）。

### 4.4 区块 04 — 删两个 AI action（彻底删入口 + cue）

| 文件 | 操作 |
|---|---|
| `manifest.yaml` | 删 refineTask/splitTask intentTriggers（:89-107）；删 `task-split-card` surface（:524-525）；**保留 `task-action-panel` surface** |
| `cnui/handlers.ts` | 删 refineTask/splitTask 处理（:254-283）+ 提交分支（:441-449）+ task-split-card 导出（:511）；task-action-panel handler 保留 |
| `cnui/surfaces/TaskActionPanel.tsx` | 移除 refine 分支与 `refine` 标签定义；保留 complete/archive/delete |
| `cnui/surfaces/TaskSplitCard.tsx` | **删整个文件** |
| `index.ts` | 删 TaskSplitCard import（:19-20）+ registry 注册（:48-51）；task-action-panel 注册保留 |
| `hooks.ts` | 删 onActionSurfaceRequest 中 `refine_task`/`split_task` cue（:247-269） |
| `hooks/use-intent-handler.ts` | 删 refineTask/splitTask 成功消息（:325-326） |
| `components/system-cognition-panel.tsx` | 移除与 refine/split 直接相关的提示（:172-177 拆分提示）；clarity 字段纯展示保留 |
| **保留** | `tag-calculator.ts` 的 `calculateClarity`/`calculateDecomposition` + clarity/decomposition 字段 |

---

## 5. 改动文件清单

**新增**：
- `domains/tasks/components/task-create-drawer.tsx`（TaskCreateDrawer）

**修改**：
- `domains/tasks/cnui/surfaces/TaskCreationCard.tsx`（01 时长双框）
- `domains/tasks/components/thread-list-panel.tsx`（02a deleteThread）
- `domains/tasks/components/task-tree-view.tsx`（02b/02c 入口 + props）
- `domains/tasks/pages/TaskTreePage.tsx`（DrawerState 扩展 + 接线 create/subtask 回调）
- `domains/tasks/components/task-detail-drawer.tsx`（03a 面包屑 + 03c onChanged 转发 + 03b onOpenSubtaskCreate 转发）
- `domains/tasks/components/subtask-list.tsx`（03b + 按钮 + 03c onChanged）
- `domains/tasks/manifest.yaml`（04 删 action + surface）
- `domains/tasks/cnui/handlers.ts`（04 删处理）
- `domains/tasks/cnui/surfaces/TaskActionPanel.tsx`（04 删 refine）
- `domains/tasks/index.ts`（04 删注册）
- `domains/tasks/hooks.ts`（04 删 cue）
- `hooks/use-intent-handler.ts`（04 删消息）
- `domains/tasks/components/system-cognition-panel.tsx`（04 删提示）

**删除**：
- `domains/tasks/cnui/surfaces/TaskSplitCard.tsx`

**可能修改（视验证点）**：
- `domains/tasks/repository/thread.ts`（若 findAllWithCount 不过滤 deleted）

---

## 6. 测试策略

- **vitest 单测**（必须在 `frontend` cwd 跑，见 [[feedback_vitest-pitfalls]]）：
  - `thread-list-panel` 删除分支调用 `deleteThread`（mock 验证）
  - `TaskCreateDrawer` 提交 → createTask 入参正确（含 defaults 预填）
  - 面包屑 root label 计算（有/无 threadId 分支）
  - 双框时长解析（`parseDurationToMinutes` 边界）
- **tsc 双验证**（vitest 不做类型检查，见 [[feedback_vitest-pitfalls]]）：全量 `tsc --noEmit`
- **/browse E2E**（真实 PG 落库）：
  - 02a：归档主线 → 删除 → 列表立即消失
  - 02b：「在下方新建子任务」→ 抽屉打开、parentId 预填、提交后子任务出现
  - 02c：快速添加框输入文本 → + 按钮 → 抽屉带文本预填
  - 03a：主线任务抽屉面包屑根=主线名；普通任务根=「普通任务」
  - 03b：抽屉内子任务 + 按钮 → 打开详细抽屉带文本
  - 03c：抽屉加第一个子任务 → 关闭 → 主任务可展开（无需手动刷新）
  - 04：成长领域菜单无「细化」「拆分」；manifest/handlers 无残留引用
- **回归基线**：按 [[feedback_change-gate-baseline]] 用 base/head 失败集合对比，不硬编码失败数。

---

## 7. 风险与验证点

| 风险 | 验证方式 |
|---|---|
| `findAllWithCount` 不过滤 deleted thread → 删除后仍显示 | 实现时读 `ThreadRepository`，必要时补过滤 + 单测 |
| 子任务 threadId 未继承 → 面包屑/新建抽屉归属判断错 | 实现时验证 createTask intent 的 threadId 继承；按 03a 回溯策略兜底 |
| 误删 `task-action-panel` surface → complete/archive/delete 失效 | 04 清单明确保留；tsc + E2E 验证 complete 仍可用 |
| `TaskCreateDrawer` 与 TaskDetailDrawer 外壳代码重复 | 可接受（职责不同）；若重复显著，后续抽公共 DrawerShell（本任务不做，YAGNI） |

---

## 8. 实现顺序建议（供 writing-plans 参考）

1. **04 清理**（独立、低风险，先做减法）：删 action/surface/handlers/cue/提示 → tsc + 回归
2. **01 时长双框**（单文件、独立）：TaskCreationCard 改造 → 单测
3. **基础设施 TaskCreateDrawer**（02b/02c/03b 依赖）：新建组件 + DrawerState 扩展
4. **02a 删主线 bug**（独立）：thread-list-panel + 可能的仓储过滤
5. **03c 刷新**（独立小改）：SubtaskList onChanged 转发
6. **02b/02c/03b 接线**（依赖步骤 3）：task-tree-view/subtask-list/drawer 入口
7. **03a 面包屑**（独立）：drawer rootLabel
8. 全量回归 + /browse E2E
