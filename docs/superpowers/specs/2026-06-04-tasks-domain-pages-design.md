# Tasks Domain 页面开发设计文档

> 日期：2026-06-04
> 状态：待审核
> 范围：TaskTreePage、任务详情（抽屉 + 独立页面）、主线详情（抽屉 + 独立页面）
> 上游需求：`mydocs/dev/当前开发内容.md` §001

---

## 1. 整体架构与路由

### 1.1 路由结构

```
/tasks                    → TaskTreePage（唯一入口页面）
/tasks/[id]               → TaskDetailFullPage（独立全屏页面）
/threads/[id]             → ThreadDetailFullPage（独立全屏页面）
```

### 1.2 架构方案：单页 + 状态驱动抽屉

TaskTreePage 是唯一的页面容器。任务详情和主线详情以 **Drawer（抽屉）** 形式在 TaskTreePage 内弹出，由 React 状态驱动，不触发路由切换。

**状态定义**：

```typescript
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string; width: 'narrow' | 'wide' }
  | { type: 'thread'; threadId: string; width: 'narrow' | 'wide' }
```

独立路由 `/tasks/[id]` 和 `/threads/[id]` 复用相同的详情组件，但以全屏方式渲染（不包含主线列表和任务树）。

**可选 URL 同步**：抽屉打开时使用 `history.replaceState` 更新 URL 为 `/tasks?id=xxx`，支持刷新恢复。此为增强功能，不阻塞核心开发。

### 1.3 页面组成

```
┌─ AppShell ──────────────────────────────────────────────────┐
│ TopNav (56px)                                               │
├──────────────┬──────────────────────────────────────────────┤
│  LeftPanel   │  MainContent                                 │
│  (AI 面板)   │  ┌─ TaskTreePage ────────────────────────┐   │
│  300px       │  │ Banner (可折叠)                        │   │
│              │  ├──────────┬─────────────────────────────┤   │
│              │  │ 线程列表  │  任务树 / 空状态           │   │
│              │  │ 260px    │                             │   │
│              │  │          │  [抽屉: 任务详情/主线详情]  │   │
│              │  └──────────┴─────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────────┘
```

### 1.4 数据访问规则

遵循 Constitution V（Repository Interface Isolation）和 Domain Registration Process 的 Page Component Data Access Rules：

| 操作类型 | 路径 | 说明 |
|----------|------|------|
| 只读（列表、详情） | Repository 直接调用 | 不走 Nexus 链路 |
| 写操作（创建、编辑、状态变更、删除） | 构造 `PrebuiltIntent` → Nexus chain | 所有状态变更必须走全链路 |

**禁止**：
- 页面组件直接调用 `hooks.ts`
- 页面组件直接访问 Drizzle Schema
- 页面组件绕过 Repository 接口

### 1.5 新增数据库字段

需要为 tasks 表新增两个字段（Sprint 1 同步完成）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `acceptance_criteria` | `text` | nullable | 验收标准（自由文本） |
| `expected_output` | `text` | nullable | 预期产出物描述 |

**变更链路**（遵循 Constitution IV — USOM 主权）：
1. 更新 `docs/usom-design.md`（Task 对象新增两个字段）
2. 更新 `docs/database-design.md`（tasks 表新增两列）
3. 新增 Drizzle 迁移脚本
4. 更新 Repository 映射

---

## 2. TaskTreePage — 页面框架

### 2.1 可折叠 Banner

页面顶部显示可折叠的 Banner 区域：

- **展开态**：显示任务管理的 banner 图片 + "任务" 标题 + 操作按钮（创建主线、快速添加任务）
- **折叠态**：只显示标题 + 操作按钮 + 展开按钮
- **持久化**：折叠状态存储在 `localStorage`，跨会话保持
- **默认**：展开
- **图片来源**：静态资源文件，存放于 `public/images/tasks-banner.svg`，可后续替换

Banner 使用 `bg-surface-soft` 背景，与下方内容区通过 `border-hairline` 分隔。

### 2.2 左右分栏

左侧面板（主线列表）固定 260px，右侧内容区（任务树）自适应。

分栏使用 `border-r border-hairline` 分隔，不使用可拖拽调整宽度（保持简洁）。

**响应式**：屏幕宽度 < 768px 时，左侧面板收起为抽屉，通过顶部汉堡按钮触发。

---

## 3. 左侧面板：主线列表

### 3.1 数据加载

调用 `ThreadRepository.findAll(userId, { excludeStatus: ['archived'] })`，返回值需包含聚合字段 `taskCount` 和 `completedTaskCount`（通过 Repository 层 LEFT JOIN + COUNT 计算而非前端二次查询）。前端排序：

1. `status`：`active` > `paused` > `completed`
2. 同 status 内 `priority`：`critical` > `high` > `medium` > `low` > null
3. 同 priority 内 `updatedAt` 降序

### 3.2 固定入口（列表顶部）

两个虚拟项，不可移除：

| 项 | 标识 | 行为 |
|----|------|------|
| 全部任务 | `__all__` | 右侧显示所有未归档根任务 |
| 无主线任务 | `__orphan__` | 右侧显示 `threadId === null` 的根任务 |

### 3.3 主线列表项

```
┌─────────────────────────────────┐
│ ▌ 主线名称              已暂停  │
│   5个任务 · 2个已完成           │
└─────────────────────────────────┘
```

- **色块**：`thread.color` 作为 4px 竖条，`border-l-4`
- **任务计数**：`X个任务 · Y个已完成`，caption 字号，`text-muted`
- **状态角标**：仅 `status === 'paused'` 显示，Pill Badge，`bg-surface-card text-muted`
- **选中态**：`bg-surface-soft` 背景，色块加粗到 `border-l-[6px]`
- **hover**：Hover Overlay 叠加

**右键菜单**（DropdownMenu）：

| 操作 | 条件 |
|------|------|
| 编辑主线 | 始终 |
| 暂停主线 | status === active |
| 恢复主线 | status === paused |
| 完成主线 | status === active 或 paused |
| 归档主线 | status === completed |
| ── 分隔线 ── | |
| 在此新建任务 | 始终 |

### 3.4 筛选栏（底部）

使用 Toggle Group 组件（shadcn/ui ToggleGroup）：

```
clarity:  [全部] [模糊] [有轮廓] [可执行]
status:   [全部] [待办] [计划中] [进行中] [已完成]
```

- 多个维度 AND 组合
- 状态存储在 URL query params（`?clarity=fuzzy&status=todo`）
- 使用 `useSearchParams` 读取，`router.push` 更新

### 3.5 创建主线入口

点击 Banner 的「+ 创建主线」按钮 → 打开右侧 Drawer 表单。

表单字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | text | 是 | 最多 50 字符 |
| color | color-picker | 是 | 预设 8 色 + 自定义 |
| priority | select | 否 | critical / high / medium / low |
| startDate | date | 否 | 开始日期 |
| endDate | date | 否 | 不早于 startDate |
| description | textarea | 否 | 最多 500 字符 |

预设颜色：`#E74C3C #E67E22 #F1C40F #2ECC71 #1ABC9C #3498DB #9B59B6 #95A5A6`

表单复用 `ThreadCreationCard` 的 FormAdapter（遵循 CN-UI Constraint 4: Form Component Reuse）。

---

## 4. 右侧内容区：任务树

### 4.1 数据加载

| 选中项 | Repository 调用 |
|--------|----------------|
| 全部任务 | `TaskRepository.findRoots(userId, filters)` |
| 无主线任务 | `TaskRepository.findRoots(userId, { threadId: null, ...filters })` |
| 某条主线 | `TaskRepository.findRoots(userId, { threadId, ...filters })` |

初始只加载根节点（`parentId === null`），子节点在展开时按需加载（`TaskRepository.findByParent(parentId)`）。每个树节点需包含 `childCount` 字段（通过 Repository 层 COUNT 查询计算），用于判断是否显示展开箭头。

### 4.2 任务树节点

```
[展开箭头] [status圆圈] [clarity圆点] 任务标题  [priority] [due_date] [能量图标] [...]
```

**各元素规格**：

| 元素 | 实现 | 尺寸 | 颜色令牌 |
|------|------|------|----------|
| 展开箭头 | `ChevronRight` (lucide)，展开时旋转 90° | 16px | `text-muted` |
| status 圆圈 | 16px 圆形，可点击 | 16px | 见下方映射 |
| clarity 圆点 | 8px 小圆点，hover tooltip | 8px | 见下方映射 |
| 标题 | body 字号，`font-body` | 14px | `text-ink` |
| priority 角标 | Pill Badge | caption | 见下方映射 |
| due_date | caption 字号，`MM-DD` 格式 | 12px | 见下方映射 |
| 能量图标 | lucide 图标 | 16px | `text-muted` |
| 更多菜单 | `MoreHorizontal` (lucide)，hover 显示 | 16px | `text-muted` |

**Clarity 视觉映射**：

| clarity | 样式 | CSS 令牌 |
|---------|------|----------|
| `fuzzy` | 灰色虚线圆点 | `border-2 border-dashed border-muted` |
| `scoped` | 橙色实心圆点 | `bg-warning` |
| `actionable` | 绿色实心圆点 | `bg-success` |

**Status 视觉映射**：

| status | 样式 | CSS 令牌 |
|--------|------|----------|
| `todo` | 空心圆圈 | `border-2 border-muted` |
| `planned` | 蓝色圆圈 | `border-2 border-info bg-info-soft` |
| `in_progress` | 蓝色填充 | `bg-info`，可选 pulse 动画 |
| `completed` | 绿色勾选 | `bg-success`，内含 `Check` 图标 |
| `archived` | 灰色填充 | `bg-surface-card` |

**Priority 角标**：

| priority | 显示 | CSS 令牌 |
|----------|------|----------|
| `critical` | Pill Badge "紧急" | `bg-error-soft text-error` |
| `high` | Pill Badge "高" | `bg-warning-soft text-warning` |
| 其他 | 不显示 | — |

**Due Date 颜色规则**：

| 状态 | 条件 | CSS 令牌 |
|------|------|----------|
| 正常 | > 3 天 | `text-muted` |
| 即将到期 | ≤ 3 天 | `text-warning` |
| 逾期 | < 今天 | `text-error` |

**能量图标映射**：

| energyProfile | lucide 图标 |
|---------------|-------------|
| `deep` | `Brain` |
| `light` | `Cloud` |
| `admin` | `ClipboardList` |
| `creative` | `Sparkles` |
| `reactive` | `Flame` |

**缩进**：每层 20px，最多展示 5 层，第 6 层起显示「展开更深层级（X 个任务）」。

### 4.3 状态变更快捷菜单

点击 status 圆圈弹出 DropdownMenu，只显示合法跃迁项：

| 当前状态 | 可选操作 |
|----------|----------|
| `todo` | [计划中] [开始执行] [归档] |
| `planned` | [开始执行] [回到待办] [归档] |
| `in_progress` | [标记完成] [暂停回待办] [归档] |
| `completed` | [归档] |

**「标记完成」按 tracking 级别处理**：

- `none`：直接完成，无弹窗
- `check_in`：弹出 TaskCompleteDialog（实际用时输入）
- `log`：弹出 TaskCompleteDialog（实际用时 + 产出描述）
- `review`：跳转到任务详情抽屉，在 D 区完成

### 4.4 更多菜单 (`[...]`)

| 操作 | 条件 |
|------|------|
| 在此下方新建子任务 | 始终 |
| 提升为主线 | `parentId === null && threadId === null` |
| 关联到主线... | 始终（弹出 ThreadSelector） |
| 移出主线 | `threadId !== null` |
| ── 分隔线 ── | |
| 编辑任务 | 始终（打开详情抽屉） |
| 复制任务 | 始终 |
| ── 分隔线 ── | |
| 归档任务 | 始终 |
| 删除任务 | 始终（二次确认） |

### 4.5 行内创建任务

- Header 「+ 快速添加任务」或任务树底部「+ 添加任务」
- 插入行内输入框，回车创建（`captureMode='ad_hoc'`）
- 创建后显示 1-2 秒 loading 态（骨架行），后台重新计算 clarity 等标签后刷新

### 4.6 空状态

遵循 UI-DESIGN-SPEC §6.6 EmptyState 规范：

| 场景 | 图标 | 标题 | 描述 | 操作按钮 |
|------|------|------|------|----------|
| 主线下无任务 | `ListTodo` | 这条主线还没有任务 | 在这里添加第一个任务 | + 添加任务 |
| 筛选后无结果 | `Filter` | 当前筛选条件下没有任务 | — | 清除筛选 |
| 无主线任务为空 | `CheckCircle` | 所有任务都已关联到主线了 | — | — |

### 4.7 拖拽排序

Sprint 4 实现。节点支持拖拽改变同层级顺序，以及拖拽至其他节点下成为子任务。推荐使用 `@dnd-kit/core` 库。

### 4.8 批量操作

Sprint 4 实现。Checkbox 多选后可批量归档、批量修改 priority。

### 4.9 键盘快捷键

Sprint 4 实现：

| 快捷键 | 行为 |
|--------|------|
| `n` | 快速创建新任务（焦点在内容区时） |
| `Enter` | 打开任务详情 |
| `Space` | 展开/折叠子节点 |
| `Escape` | 取消行内编辑 / 关闭抽屉 |

---

## 5. 任务详情（抽屉 + 独立页面）

### 5.1 抽屉行为

- **触发**：点击任务树节点的标题
- **默认宽度**：480px（窄模式）
- **可拖拽调整**：最小 400px，最大 800px
- **窄模式**（< 640px）：只显示 A 区（任务信息）
- **宽模式**（≥ 640px）：显示 A/B/C/D 全部四区
- **右上角按钮**：「在新页面打开」→ 跳转 `/tasks/[id]`
- **关闭**：点击遮罩 / Escape / 关闭按钮

### 5.2 A 区：任务信息（编辑区）

所有字段采用「点击编辑」模式（inline editing），每个字段独立保存。

| 字段 | 展示形式 | 编辑形式 | 必填 |
|------|----------|----------|------|
| title | Display 字号 (32px)，`font-display` | 单行 input | 是 |
| description | Markdown 渲染 | textarea + 预览切换 | 否 |
| priority | 彩色 Pill Badge | Select 下拉 | 是 |
| energyRequired | 图标 + 文字 | 三段选择（高/中/低） | 是 |
| energyProfile | 图标 + 文字 | Select 下拉 | 否 |
| schedulingConstraint | 文字标签 | Select 下拉 | 否 |
| tracking | 文字标签 | Select 下拉 | 是 |
| estimatedDuration | 「预估 X 分钟」 | 数字 input + 快选 (30/60/90/120) | 否 |
| dueDate | 日期文字 | DatePicker | 否 |
| threadId | 主线名称 + 色块 | ThreadSelector | 否 |
| 更多信息（折叠区） | — | startDate、endDate、captureMode、notes | — |

**未实现字段占位**（UI 显示但功能不可用）：

- `acceptanceCriteria`：「验收标准 — 即将支持」，`text-muted-soft`
- `expectedOutput`：「预期产出 — 即将支持」，`text-muted-soft`

**编辑保存逻辑**：

```
用户修改字段 → 失焦 / 回车
→ 构造 PrebuiltIntent { action: 'editTask', fields: { id, [changedField]: newValue } }
→ 乐观更新 UI（立即反映修改）
→ 后台提交 Intent
→ 失败时回滚 UI + 显示 Error Toast
```

**title 特殊处理**：修改后后台自动重新计算 clarity，B 区认知面板刷新。

### 5.3 B 区：系统认知面板（只读）

**标题**：「系统认知」

**关键原则**：B 区是系统对任务的「理解报告」，用户不能直接修改其中任何值，只能通过修改 A 区字段间接影响。

**子区块**：

**5.3.1 Clarity 进度条**

```
●──────●──────○
模糊   有轮廓  可执行

当前：有轮廓
缺少：预估时长
→ 填写「预估时长」后可升级
```

三段进度条，使用 `bg-surface-card` 为底色，已达到的阶段使用 `bg-success` 填充。显示升级至下一级所需的条件。

**5.3.2 Complexity 标签**

显示 AI 识别的 complexity 标签数组，每个标签为 Pill Badge（`bg-surface-card text-body`），hover 显示定义。

**5.3.3 Decomposition 状态**

| decomposition | 显示 |
|---------------|------|
| `atomic` | 「可直接执行，无需拆分」 |
| `splittable` | 「建议拆分」+ 「AI 建议拆分方案」按钮 |
| `splitting_in_progress` | 显示进度 |
| `decomposed` | 「已拆分为 X 个子任务，完成 Y/X」 |

**5.3.4 AI 推荐标签对比**

当用户设置值与 AI 推荐值不同时显示：

```
energy_profile:  你设置「轻量」  AI 推荐「深度工作」  [采纳建议]
```

「采纳建议」按钮构造 PrebuiltIntent 更新对应字段。

### 5.4 C 区：子任务列表

- 显示 `parentId === 当前任务ID` 的直接子任务，不递归
- 每行：`[status圆圈] [clarity圆点] 子任务标题  [priority] [due_date] [→详情]`
- 排序：`in_progress > planned > todo > completed`，同 status 按 priority
- 顶部显示完成率：`已完成 X / Y 个子任务` + 进度条
- 底部「+ 添加子任务」行内输入

新建子任务继承父任务的 `tracking`、`threadId`、`priority`。

### 5.5 D 区：执行记录与完成总结

按 `tracking` 级别动态渲染：

**tracking === `none`**：D 区不显示。

**tracking === `check_in`**：

```
执行记录
实际用时：[ ___ ] 分钟
[标记完成]
```

**tracking === `log`**：

```
执行记录
实际用时：[ ___ ] 分钟
本次产出：[ _________________ ]
[标记完成]
```

**tracking === `review`**：

```
结构化复盘
实际用时：[ ___ ] 分钟

产出成果：[ ____________________________]
执行方法：[ ____________________________]
经验与收获：[ ____________________________]
改进点：[ ____________________________]

[保存草稿]  [完成并提交复盘]
```

- 复盘可保存草稿（status 不变为 completed），草稿存储在 `TaskExecutionLogRepository`
- 已完成任务展示只读版本的复盘内容
- 复盘数据（产出成果、执行方法、经验收获、改进点）存储为 JSONB 格式，与 `actualDuration` 一起记录在执行日志中

### 5.6 独立全屏页面

`/tasks/[id]` 路由渲染 TaskDetailFullPage，复用 A/B/C/D 四区组件，但：

- 包含面包屑导航：`任务 / [主线名] / [父任务标题] / 当前标题`
- 包含顶部操作栏：`[← 返回]  [归档]  [...]`
- 无抽屉容器，全屏渲染

### 5.7 事后补录模式

当 `captureMode === 'retrospective'`，A 区顶部显示提示横幅（使用 lucide `Zap` 图标 + 文字）：

```
[Zap 图标] 事后补录模式 — 此任务为事后追加，请填写实际执行信息
```

D 区的「实际用时」变为必填，额外显示：

```
实际执行时间：[ 日期 ] [ 开始时间 ] — [ 结束时间 ]
```

---

## 6. 主线详情（抽屉 + 独立页面）

### 6.1 抽屉内容

```
[← 返回] ▌ 主线名称                       [在新页面打开]
状态 · 优先级 · 时间范围
描述文字

概览
X 个任务 · Y 个已完成 · Z% 完成率
[进度条]

clarity 分布：模糊 2 · 轮廓 3 · 可执行 5

[+ 在此主线添加任务]

任务树（复用 TaskTree 组件，限定 threadId）
```

### 6.2 主线信息编辑

点击「编辑主线」打开侧边 Drawer 表单，与创建主线相同的表单字段（预填当前值）。

保存构造 `PrebuiltIntent { action: 'editThread', fields: {...} }`。

### 6.3 主线状态操作

| 当前 status | 按钮显示 |
|-------------|----------|
| `active` | [暂停主线] + [...] 内含 [完成主线] |
| `paused` | [恢复主线] + [...] 内含 [完成主线] |
| `completed` | [...] 内含 [归档主线] |

### 6.4 独立全屏页面

`/threads/[id]` 路由渲染 ThreadDetailFullPage，布局与抽屉内容相同但全屏渲染，包含面包屑导航和返回按钮。

---

## 7. 全局组件

### 7.1 ThreadSelector（主线选择器）

Modal 弹窗，复用于：
- 任务详情页「关联到主线」
- 任务创建时关联主线
- 「提升为主线」操作

```
┌─────────────────────────────┐
│ 选择主线              [搜索] │
├─────────────────────────────┤
│ ● 事业进阶（蓝）            │
│ ● 健康管理（绿）            │
│ ● 个人学习（紫）            │
├─────────────────────────────┤
│ + 新建主线                  │
└─────────────────────────────┘
```

搜索过滤主线名称，支持键盘导航（↑↓ 选择，Enter 确认）。

### 7.2 TaskCompleteDialog（任务完成弹窗）

根据 `tracking` 级别动态渲染（内容见 §5.5），复用于：
- 任务树节点状态快捷菜单「标记完成」
- 任务详情页 D 区「标记完成」

### 7.3 Toast 通知规范

| 场景 | 类型 | 文案 |
|------|------|------|
| 任务创建成功 | success | 「任务已创建」 |
| 任务完成 | success | 「任务已完成 ✓」 |
| 操作失败 | error | 「操作失败，请重试」 |
| clarity 自动升级 | info | 「任务已可执行 ✨」 |
| 主线创建成功 | success | 「主线已创建」 |

---

## 8. 边界情况与错误处理

| 场景 | 处理方式 |
|------|----------|
| 任务不存在 (404) | 显示「任务不存在或已删除」+ 返回按钮 |
| 主线不存在 (404) | 同上 |
| 子任务数量 > 50 | 默认加载前 20 条，底部「加载更多」 |
| 任务树层级 > 5 | 第 6 层起折叠，显示「展开更深层级（X 个任务）」 |
| 删除有子任务的父任务 | 二次确认：「删除后，X 个子任务将变为独立任务，确认继续？」 |
| 子任务 due_date > 父任务 end_date | 行内警告，允许保存但显示警告 |
| 离线写操作 | Toast「当前离线，操作将在联网后同步」 |

---

## 9. UI 设计规范合规

所有 UI 实现必须通过 UI-DESIGN-SPEC §14 检查清单：

### C-01 色彩合规
- 所有颜色使用 CSS 变量令牌（`text-ink`、`bg-canvas`、`bg-surface-soft` 等）
- 无硬编码颜色类
- 语义色使用正确（error/warning/success/info 各归其位）

### C-02 组件规范
- 按钮使用 shadcn/ui Button 正确变体和尺寸
- 图标统一使用 `lucide-react`，无内联 SVG / Emoji
- 加载状态使用骨架屏或 Spinner
- 空状态包含图标 + 标题 + 描述 + 操作按钮

### C-03 间距与排版
- 间距为 4px 整数倍
- H1 使用 `font-display`，H2+ 使用 `font-body`
- 字号遵循规范定义的层级

### C-04 交互
- 无浏览器原生弹窗
- 破坏性操作有确认对话框
- 异步操作按钮 disabled + loading 态
- 动画尊重 `prefers-reduced-motion`

### C-05 响应式
- 移动端可用（左侧面板收起为抽屉）
- 触控目标 ≥ 44px
- 移动优先写法

### C-06 暗色模式
- 所有新增组件暗色模式可读
- 文字对比度 ≥ 4.5:1

### C-07 可访问性
- 交互元素有 `aria-label`
- 表单输入有 `<label>`
- 键盘可导航

---

## 10. Sprint 规划

### Sprint 1：基础框架

- 新增 DB 字段 `acceptance_criteria` + `expected_output` + 迁移脚本
- 更新 USOM/DB 设计文档
- Repository 查询方法完善（findRoots with filters、childCount 计算、taskCount 聚合）
- TaskTreePage 布局骨架（Banner + 左右分栏）
- 左侧主线列表（只读展示 + 选中切换 + 虚拟入口）
- 右侧任务树（只读展示 + 懒加载展开 + Clarity/Status 视觉映射）
- 空状态组件
- 响应式布局（移动端左侧面板收起）

**验收标准**：可以浏览所有主线和任务树，展开折叠子节点，查看 Clarity/Status 视觉标识。

### Sprint 2：核心写操作

- 快速创建任务（行内输入 + clarity 后台计算）
- 创建主线（Drawer 表单 + ThreadCreationCard FormAdapter 复用）
- 任务状态变更（快捷菜单 + 合法跃迁校验）
- 任务完成弹窗（三个 tracking 级别）
- 提升为主线
- 右键菜单（主线编辑/暂停/恢复/完成/归档）
- Toast 通知

**验收标准**：可以创建任务和主线，变更状态，完成任务（含 tracking 流程）。

### Sprint 3：详情页

- 任务详情抽屉（Drawer 容器 + A/B/C/D 四区布局）
- A 区：所有字段 inline editing + 乐观更新
- B 区：系统认知面板（Clarity 进度条 + Complexity 标签 + Decomposition 状态 + AI 推荐对比）
- C 区：子任务列表 + 新建子任务 + 完成率
- D 区：review tracking 完整流程
- 独立全屏页面 `/tasks/[id]`（复用组件）
- ThreadSelector 组件
- 事后补录模式

**验收标准**：可以在抽屉内完整编辑任务、查看系统认知、管理子任务、完成 review 复盘。

### Sprint 4：主线详情 + 完善

- 主线详情抽屉（概览数据 + 任务树）
- 独立全屏页面 `/threads/[id]`
- 筛选功能（URL query params + ToggleGroup）
- 拖拽排序（`@dnd-kit/core`）
- 批量操作（Checkbox 多选）
- 键盘快捷键
- 可折叠 Banner
- 边界情况处理
- 未实现字段占位（acceptanceCriteria / expectedOutput）

**验收标准**：完整功能可用，包括筛选、拖拽、快捷键、边界处理。
