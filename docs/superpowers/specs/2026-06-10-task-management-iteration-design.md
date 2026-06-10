# 任务管理迭代优化设计文档

**版本**: 1.0.0
**日期**: 2026-06-10
**状态**: 待审核
**涵盖条目**: [016] ~ [023]

---

## 1. 概述

本文档覆盖 `mydocs/dev/当前开发内容.md` 中 [016]~[023] 共 8 个条目的设计。这些条目围绕任务管理 Domain 的三个核心维度：

1. **新 Action + CNUI Surface**：查看任务树、提升为主线、修改主线信息
2. **现有 CNUI Surface 改进**：创建任务、更新任务、完成任务、归档任务、删除任务
3. **界面优化 + 全局行为**：任务树页面搜索/筛选改进、AI 助手写入确认规则

### 架构决策摘要

| 决策 | 选择 | 理由 |
|---|---|---|
| CNUI Surface 复用模式 | 共享组件模式（增强现有 surface） | 符合 CN-UI 约束 4（Form Reuse），减少组件膨胀 |
| [023] 写入确认实现位置 | Orchestrator 层拦截 | 集中控制，与调度器定位一致 |
| [016] 查看任务树路径 | Query Shortcut Path | 纯展示无需 Handler，匹配 Constitution Query Path Constraints |
| [018] 字段提取方式 | 混合（LLM 语义 + 规则验证） | 同义词/主线匹配由 LLM，结构验证/默认值由规则 |

---

## 2. [023] 全局写入确认规则（宪章级变更）

### 2.1 规则定义

**名称**：CN-UI Write Confirmation Invariant（CN-UI 写入确认不变量）

**规则**：所有 `response_type === 'cnui'` 且 `pathType === 'contract'` 的意图，**必须**进入 CNUI Surface 供用户二次确认后执行。无论 Intent Engine Phase B 提取的字段是否完整，都不得跳过确认步骤直接执行写入。

### 2.2 实现位置

在 Orchestrator 的 `executePipeline` 函数路径分发阶段：

```
Intent 解析完成
  → pathType === 'contract' && response_type === 'cnui'
  → 始终路由到 CNUI Surface（传入已提取的 fields 作为预填值）
  → 用户在 CNUI 中确认/修改
  → submit → State Machine 执行
```

### 2.3 不受影响的路径

- `pathType === 'query'`：只读查询，无写入
- `pathType === 'generative'`：已有独立 CNUI 确认流程
- `response_type === 'page'`：页面导航
- `response_type === 'text'`：纯文本响应

### 2.4 宪章修改

在 Constitution VIII. AI/Rule Boundary 章节末尾新增：

> **CN-UI Write Confirmation**: 所有通过 CN-UI 表面提交的写操作意图（`pathType === 'contract'`），必须经过用户在 CNUI Surface 中的显式确认。系统不得跳过确认步骤直接执行写入操作，即使 Intent Engine 已成功提取所有必填字段。

### 2.5 影响范围

- **Domains**: Habits（createHabit、activateHabit、suspendHabit、archiveHabit、reactivateHabit、deleteHabit、logHabit）、Tasks（createTask、updateTask、completeTask、archiveTask、deleteTask、promoteToThread、splitTask、refineTask 及所有 thread 操作）
- **未来 Domain**: 所有 `response_type: cnui` 的写操作自动适用

---

## 3. [016] 查看任务树 Action

### 3.1 Intent Trigger

```yaml
# manifest.yaml intent_triggers 新增
- action: viewTree
  shortcut: /viewTree
  description: 查看任务树
  response_type: cnui
  cnui_surface: task-tree-view
  examples:
    - 查看任务树
    - 看看我的任务
    - 展示所有任务
  keywords: [任务树, 查看任务, 展示]
```

### 3.2 Query Action

```yaml
# manifest.yaml query_actions 新增
query_actions:
  viewTree:
    action: viewTree
    description: 查看任务树（纯展示，含主线和任务的树形结构）
    response_mode: cnui
    cnui_surface: task-tree-view
    context_capabilities: []
```

### 3.3 CNUI Surface: `task-tree-view`

**特性**：
- 纯展示，无状态管理，永不过期
- 显示搜索组件 + 任务树（主线和任务均显示 ID）
- 任务树可展开/收起
- 复用 `components/task-tree-view.tsx` 的渲染逻辑，封装为 CNUI 卡片形式

**Surface Handler**（`domains/tasks/cnui/handlers.ts` 新增 `viewTree` 分支）：

```
open('viewTree')
  → 查询所有未归档主线及其下任务
  → 返回树形结构 dataSnapshot: { threads: [...], tasks: [...] }
  → 搜索框过滤（前端本地过滤）

submit('viewTree')
  → 无操作（纯展示没有 submit）
```

**Surface 组件**（新建 `domains/tasks/cnui/surfaces/TaskTreeViewCard.tsx`）：
- 顶部搜索框（按标题/ID 过滤）
- 树形列表，每项显示 ID（可复制）+ 标题 + 状态标签
- 主线节点可展开/收起，显示下属任务
- 无确认/取消按钮，只有可选的关闭按钮

### 3.4 Manifest Surface 注册

```yaml
# manifest.yaml cnui_surfaces 新增
cnui_surfaces:
  # ... 已有 surfaces ...
  task-tree-view:
    handler: ./cnui/handlers
```

### 3.5 导航菜单

在 `growth-menu.tsx` 的 tasks Domain 操作列表中添加 `/viewTree` 入口。

---

## 4. [017a] 提升为主线 Action 改进

### 4.1 现状

`promoteToThread` 已有 intent_trigger 和 `thread-promote-card` surface。当前 handler 的 `open()` 返回所有活跃任务列表，未做智能识别。

### 4.2 Intent Engine 增强

Manifest `required_fields.promoteToThread` 增加可选查询字段：

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

AI Parser 在 routing-context 中增加任务识别提示。

### 4.3 CNUI Surface 改进（`ThreadPromoteCard.tsx`）

三场景交互：

| 场景 | 触发条件 | UI 展示 |
|---|---|---|
| A. 已识别唯一任务 | `dataModel.taskId` 存在或 title 模糊匹配到唯一结果 | 任务信息卡片 + "确认提升为主线" / "取消" 按钮 |
| B. 识别到多个候选 | title 模糊匹配到多个结果 | 匹配的任务列表，用户点击选择 |
| C. 未识别 | 无 taskId/title | 搜索框 + 全部有效任务列表（非归档、非子任务） |

搜索框支持按标题和任务 ID 搜索。

### 4.4 Handler 改进

`open('promoteToThread')` 增加智能识别逻辑：
- 有 `taskId` → 查询单个任务，返回 Detail 数据
- 有 `title` → `TaskRepository.searchByTitle()` 模糊匹配
  - 匹配 1 个 → 场景 A
  - 匹配多个 → 场景 B
- 都没有 → 返回全部有效任务（场景 C）

---

## 5. [017b] 修改主线信息 Action 改进

### 5.1 Intent Engine 增强

Manifest `required_fields.updateThread` 增加可选查询字段：

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

### 5.2 CNUI Surface 改进（`ThreadActionPanel.tsx`）

三场景交互：

| 场景 | 触发条件 | UI 展示 |
|---|---|---|
| A. 已识别唯一主线 | `dataModel.threadId` 存在或 name 匹配唯一结果 | 主线 Detail 信息（可编辑字段：名称、描述、颜色、优先级等）+ "保存" / "取消" |
| B. 识别到多个候选 | name 匹配多个结果 | 匹配的主线列表，用户点击选择 |
| C. 未识别 | 无 threadId/name | 搜索框 + 主线清单，选中后切换到 Detail |

### 5.3 Handler 改进

与 [017a] 类似的智能识别逻辑，使用 `ThreadRepository`。

---

## 6. [018] 创建任务 Action 改进

### 6.1 CNUI 界面增加主线选择字段

**TaskCreationCard.tsx 改进**：
- 在预估时长字段之后，增加"主线"下拉选择
- 默认值为"普通任务"（threadId = null）
- 下拉列表包含所有未归档的有效主线

**Handler 改进**：
- `open('createTask')` → 额外查询未归档主线，放入 `dataSnapshot.threads`
- `submit('createTask')` → fields 增加 `threadId` 传递给 `submitDynamicIntent`

**Manifest 更新**：

```yaml
# required_fields.createTask 增加
- name: threadId
  label: 主线
  type: select
  required: false
  default_value: null

# field_metadata 增加
threadId:
  type: string
  label: 主线
  required: false
```

### 6.2 提示词上下文处理能力增强

**混合方式**：LLM 处理语义理解，规则处理结构验证。

#### LLM 层改进

在 `routing-context.ts` 的 `formatRoutingContextForPrompt` 中增加同义词提示：

```typescript
/** 字段同义词映射 — 帮助 LLM 识别自然语言中的字段引用 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  dueDate: ['deadline', '截止日期', '结束日期', '到期日'],
  estimatedDuration: ['预计时长', '时长', '用时', '耗时'],
  priority: ['优先级', '紧急程度'],
  threadId: ['主线', '所属主线', '关联主线'],
  title: ['标题', '名称', '任务名'],
  description: ['描述', '说明', '详情'],
}
```

在字段提示中注入同义词：
```
字段: dueDate(截止日期, date, 同义词: deadline/截止日期/结束日期/到期日)
```

#### 上下文注入

AI Parser 调用时，将 handler `open()` 返回的主线列表作为额外上下文注入 prompt，使 LLM 能匹配 "lifeware app MVP 开发" → 具体 threadId。

#### 规则层

- `validateResponse`：结构验证（字段类型、必填检查）— 已实现
- Handler `submit`：默认值补全（未选主线 → threadId = null）— 新增

---

## 7. [019a] 更新任务信息 + [019b] 完成任务 + [020] 归档任务 + [021] 删除任务

### 7.1 共享交互模式

四个 action 统一为三阶段流程：

```
阶段 1：意图识别
  → Intent Engine 识别 taskId、title 或其他查询条件

阶段 2：CNUI Surface 展示
  场景 A：已识别唯一任务 → 任务 Detail + 操作确认
  场景 B：识别出多个候选 → 匹配列表供选择
  场景 C：未识别 → 搜索框 + 任务树清单 → 选中后 Detail

阶段 3：用户确认 → submit → Nexus 链路
```

### 7.2 各 Action 差异

| Action | 可操作任务范围 | Surface | Detail 附加功能 |
|---|---|---|---|
| updateTask | 非 archived/deleted | `task-edit-card` | 可编辑字段 + **增加子任务** |
| completeTask | todo/planned/in_progress | `task-action-panel` | 只读 + 确认完成 |
| archiveTask | completed | `task-action-panel` | 只读 + 确认归档 |
| deleteTask | todo/planned/in_progress/completed | `task-action-panel` | 只读 + 确认删除（不可恢复警告） |

### 7.3 Handler 统一改进

`taskCnuiHandler.open()` 为所有四个 action 增加智能识别。

**注意**：当前 `CnuiSurfaceHandler.open(action)` 签名仅接收 `action` 字符串。Intent 提取的 fields（taskId、title 等）需要通过扩展 `open` 签名或通过其他机制传递。实现时有两种方式：
1. **扩展 open 签名**：`open(action, intentFields?)` — 新增可选的 `intentFields` 参数
2. **通过 surface data 传递**：Orchestrator 在创建 CNUI surface 时，将 Intent fields 注入初始 `dataModel`

推荐方式 2，因为它不需要修改 `CnuiSurfaceHandler` 接口，与现有 CNUI 协议兼容。Orchestrator 将 Intent Engine 提取的 fields 作为 `dataSnapshot` 的一部分传递给 Surface 组件。

```typescript
// 伪代码：Handler 内部根据 dataSnapshot 中的 Intent fields 进行识别
async open(action: string): Promise<CnuiSurfaceOpenResult> {
  // Intent fields 由 Orchestrator 注入到初始 dataModel 中
  const intentFields = {} // 从上下文获取 Intent 提取的字段
  const statusFilter = getStatusFilter(action) // 各 action 的可操作状态范围

  // 已有 taskId → 直接查 Detail
  if (intentFields.taskId) {
    const task = await repo.findById(intentFields.taskId)
    return { content: '请确认操作', dataSnapshot: { task, action, phase: 'detail' } }
  }

  // 有 title → 模糊匹配
  if (intentFields.title) {
    const candidates = await repo.searchByTitle(intentFields.title, statusFilter)
    if (candidates.length === 1) {
      return { content: '请确认操作', dataSnapshot: { task: candidates[0], action, phase: 'detail' } }
    }
    return { content: '请选择任务', dataSnapshot: { items: candidates, action, phase: 'select' } }
  }

  // 无识别信息 → 全量可操作任务
  const items = await repo.findByStatuses(statusFilter)
  return { content: '请选择任务', dataSnapshot: { items, action, phase: 'search' } }
}
```

### 7.4 [019a] 增加子任务功能

`TaskEditCard` 的 Detail 阶段增加"添加子任务"功能：
- 在编辑表单下方增加"＋ 添加子任务"按钮
- 点击后展开子任务创建区域（标题输入 + 确认）
- 创建时复用 `createTask` Nexus 链路，自动填充 `parentId`

### 7.5 Manifest 更新

四个 action 的 `required_fields` 均增加可选查询字段：

```yaml
# updateTask、completeTask、archiveTask、deleteTask 各增加
- name: taskId
  label: 任务ID
  type: text
  required: false
- name: title
  label: 任务标题（模糊匹配）
  type: text
  required: false
```

---

## 8. [022] 任务树界面优化

### 8.1 搜索功能改进

#### 搜索框改造

搜索框最左边增加类型下拉选择：

| 选项 | 搜索范围 | 默认 |
|---|---|---|
| 任务 | 搜索所有任务的标题/ID | ✓ |
| 主线 | 搜索所有主线的名称/ID | |

#### 筛选条件行

搜索框下方，横向排列标签式筛选按钮（参考截图样式）：

| 按钮 | 类型 | 选项 | 默认值 |
|---|---|---|---|
| **排序** | 单选下拉 | 开始时间（顺序/逆序）、标题、优先级 | 开始时间（顺序） |
| **主线状态** | 多选下拉 | active、paused、completed、archived | 不含 archived |
| **任务状态** | 多选下拉 | todo、planned、in_progress、completed、archived | 不含 archived |
| **任务清晰度** | 多选下拉 | fuzzy、scoped、actionable | 全选 |

按钮样式规范：
- 标签式（pill/chip），圆角，带下拉箭头
- 选中项有背景色高亮
- 点击展开下拉菜单：选项列表 + 底部"清除"按钮
- 下拉菜单有轻微阴影

### 8.2 左侧主线列表改进

#### 操作按钮改为 "..." 菜单

- 主线名称右侧只显示一个 "⋮"（三个点）按钮
- 点击展开上下文菜单
- 菜单项根据主线当前状态动态显示（从 manifest `lifecycle.thread.transitions` 读取）
- 操作项示例：
  - active → "暂停"、"完成"
  - paused → "恢复"
  - completed → "归档"

#### 悬停显示完整信息

- 主线名称、描述等字段截断时，鼠标悬停显示 tooltip
- **全局规则**：所有使用 `truncate` / `text-overflow: ellipsis` 的组件，必须支持悬停 tooltip
- 实现方式：新建 `TruncatedText` 通用包装组件
  - 内部使用 `useRef` + `scrollWidth > clientWidth` 检测内容是否溢出
  - 溢出时自动渲染 shadcn/ui `Tooltip` 组件
  - 无溢出时不渲染额外 DOM

---

## 9. 宪章变更清单

### 新增条目

在 Constitution **VIII. AI/Rule Boundary** 章节末尾新增：

> **CN-UI Write Confirmation**: 所有通过 CN-UI 表面提交的写操作意图（`pathType === 'contract'`），必须经过用户在 CNUI Surface 中的显式确认。系统不得跳过确认步骤直接执行写入操作，即使 Intent Engine 已成功提取所有必填字段。这确保用户始终对写入操作拥有最终控制权。

### 版本变更

1.9.0 → 1.10.0（MINOR：新增治理原则）

---

## 10. 涉及文件清单

### 宪章 & 治理

| 文件 | 变更类型 |
|---|---|
| `.specify/memory/constitution.md` | 修改（VIII 章新增 CN-UI Write Confirmation） |

### Domain Manifest

| 文件 | 变更类型 |
|---|---|
| `domains/tasks/manifest.yaml` | 修改（新增 viewTree intent_trigger、query_actions、cnui_surfaces、required_fields 扩展） |

### Nexus 核心

| 文件 | 变更类型 |
|---|---|
| `nexus/orchestrator/index.ts` | 修改（executePipeline 增加写入确认拦截） |
| `nexus/core/intent-engine/routing-context.ts` | 修改（FIELD_SYNONYMS + 主线上下文注入） |
| `nexus/core/intent-engine/ai-parser.ts` | 修改（主线列表上下文传入 parseWithAI） |

### Tasks Domain — CNUI

| 文件 | 变更类型 |
|---|---|
| `domains/tasks/cnui/handlers.ts` | 修改（viewTree open + 智能识别逻辑 + createTask 返回主线列表） |
| `domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 修改（增加主线选择字段） |
| `domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 修改（三场景交互 + 增加子任务功能） |
| `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 修改（三场景交互 + deleteTask 不可恢复警告） |
| `domains/tasks/cnui/surfaces/ThreadPromoteCard.tsx` | 修改（三场景交互 + 搜索） |
| `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 修改（三场景交互 + 编辑 Detail） |
| `domains/tasks/cnui/surfaces/TaskTreeViewCard.tsx` | **新建**（任务树查看 CNUI surface） |

### Tasks Domain — Repository

| 文件 | 变更类型 |
|---|---|
| `domains/tasks/repository/task.ts` | 修改（新增 searchByTitle、findByStatuses 方法） |
| `domains/tasks/repository/thread.ts` | 修改（新增 searchByName 方法） |

### Tasks Domain — 页面组件

| 文件 | 变更类型 |
|---|---|
| `domains/tasks/components/TaskFilterBar.tsx` | **重构**（搜索类型选择 + 标签式筛选按钮） |
| `domains/tasks/components/ThreadListPanel.tsx` | 修改（"..." 菜单 + TruncatedText） |
| `domains/tasks/components/task-tree-view.tsx` | 修改（ID 显示） |

### 公共组件

| 文件 | 变更类型 |
|---|---|
| `components/common/TruncatedText.tsx` | **新建**（通用截断文本 tooltip 包装组件） |

### 导航

| 文件 | 变更类型 |
|---|---|
| `components/layout/growth-menu.tsx` | 修改（添加 viewTree 入口） |

### Tasks Domain — 注册

| 文件 | 变更类型 |
|---|---|
| `domains/tasks/index.ts` | 修改（注册新 CNUI surface） |

---

## 11. Constitution 合规性检查

| 约束 | 合规状态 | 说明 |
|---|---|---|
| I. Intent-Driven | ✅ | 所有写入操作通过 Intent Engine，[023] 进一步强化 |
| III. Single-Writer | ✅ | CNUI submit 仍走 State Machine，无绕过 |
| V. Repository Isolation | ✅ | CNUI Handler 通过 Repository 查询数据，不直接调 Drizzle |
| VI. Domain Plugin | ✅ | 新 surface 在 Domain 目录内，通过 CnuiSurfaceRegistry 注册 |
| VII. Bridge Layer | ✅ | Nexus 方法签名不依赖 HTTP 上下文 |
| VIII. AI/Rule Boundary | ✅ | 同义词/主线匹配由 LLM，验证/默认值由规则 |
| CN-UI Constraint 4 (Form Reuse) | ✅ | 增强现有 surface 而非创建重复组件 |
| CN-UI Constraint 5 (Domain Surface Ownership) | ✅ | 所有 surface 在 `domains/tasks/cnui/` 内 |
| Query Path Constraints | ✅ | viewTree 遵循 Shortcut Path，只读无状态变更 |
| Manifest Runtime Consumption | ✅ | 筛选选项从 manifest lifecycle 读取，不硬编码 |
| UI-DESIGN-SPEC (C-01~C-07) | ✅ | 使用设计令牌，遵循组件约定 |
