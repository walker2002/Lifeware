# Task Domain 重构设计文档

> **版本**: 1.0.0  
> **日期**: 2026-06-03  
> **状态**: 待实现  
> **关联文档**: `mydocs/dev/015-任务管理重构.md`

---

## 1. 设计目标

重构 Tasks Domain，使其承载 Lifeware 的核心产品差异化："任务是演化出来的"。

### 1.1 核心原则

- **双演化轴**：认知轴（用户对任务的理解程度）与执行轴（任务在时间中的状态）完全独立演化
- **主线容器**：用"主线"（Thread）替代"项目"（Project），作为个人成长的叙事容器
- **智能化标签**：多维度标签体系，AI 自动推断 + 用户可管理，支撑后续 AI 智能排程、任务拆分、执行建议

### 1.2 放弃 Project 的理由

- Lifeware 只针对个人管理，无需团队协作概念（里程碑、成员、甘特图）
- 个人成长场景下，"主线"比"项目"更贴合用户心智
- 保留容器能力（颜色、时间范围、上下文关联），去除协作复杂性

---

## 2. 核心架构：双演化轴

### 2.1 认知轴（clarity）— AI 维护

描述用户对任务的理解程度。

```
fuzzy ──→ scoped ──→ actionable
```

| 值 | 定义 | 判断条件 |
|---|---|---|
| `fuzzy` | 模糊念头，只有方向 | `title` 有意义；`description` 缺失或与 title 高度重复（Jaccard > 0.8）或长度 < 10 |
| `scoped` | 有轮廓，知道是什么但无执行计划 | `title` + `description` 有意义；`energy_required` 或 `estimated_duration` 缺失 |
| `actionable` | 可执行，粒度细化到可直接放入时间盒 | 所有核心字段完整（title, description, energy_required, estimated_duration），且 estimated_duration 合理 |

### 2.2 执行轴（status）— 用户/系统

描述任务在时间中的执行状态。

```
todo ──→ planned ──→ in_progress ──→ completed ──→ archived
```

**两个轴完全独立。** 例如：
- `clarity=actionable, status=todo`：已准备好但未排程
- `clarity=fuzzy, status=in_progress`：边做边想清楚

---

## 3. 数据库 Schema

### 3.1 删除的表和字段

| 删除项 | 说明 |
|---|---|
| `projects` 表 | 完全删除 |
| `project_templates` 表 | 完全删除 |
| `tasks.project_id` | 删除外键 |
| `tasks.timebox_id` | 删除（通过 junction table 关联） |
| `tasks.frequency_type` | 删除，由 `recurrence` JSONB 替代 |
| `tasks.days_of_week` | 删除，由 `recurrence` JSONB 替代 |

### 3.2 新增表：threads（主线）

```sql
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version INT NOT NULL DEFAULT 1,

  name TEXT NOT NULL,               -- 主线名称：如"事业进阶"、"健康管理"
  description TEXT,                 -- 主线描述
  color TEXT,                       -- 主线颜色标识（用于 Timebox 视图）
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),

  start_date DATE,                  -- 主线开始时间
  end_date DATE,                    -- 主线结束时间（预期）

  priority TEXT
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  tags JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_threads_user_status ON threads(user_id, status);
CREATE INDEX idx_threads_user_start ON threads(user_id, start_date);
```

### 3.3 重构：tasks 表

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version INT NOT NULL DEFAULT 1,

  -- 层级关联
  parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,

  -- 执行轴状态
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'planned', 'in_progress', 'completed', 'archived')),

  -- 核心字段
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  energy_required TEXT NOT NULL DEFAULT 'medium'
    CHECK (energy_required IN ('high', 'medium', 'low')),
  estimated_duration INT,           -- 预估时长（分钟），nullable 支持模糊任务
  actual_duration INT,              -- 实际时长（分钟）

  due_date DATE,                    -- 截止日期
  start_date DATE,                  -- 开始日期
  end_date DATE,                    -- 结束日期（预期）

  -- 周期性（有限次，区别于 Habit）
  recurrence JSONB,

  tags JSONB NOT NULL DEFAULT '[]',
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  -- ═══════════════════════════════════════════
  -- AI 维护标签（独立列 + enum + 索引）
  -- ═══════════════════════════════════════════
  clarity TEXT NOT NULL DEFAULT 'fuzzy'
    CHECK (clarity IN ('fuzzy', 'scoped', 'actionable')),
  complexity JSONB NOT NULL DEFAULT '[]',
    -- 非排他标签数组：['routine', 'structure_unknown', 'multi_step', 'exploratory', 'creative']
  decomposition TEXT
    CHECK (decomposition IN ('atomic', 'splittable', 'splitting_in_progress', 'decomposed')),

  -- ═══════════════════════════════════════════
  -- 用户管理标签（独立列 + enum + 索引）
  -- AI 推荐，用户可修改
  -- ═══════════════════════════════════════════
  capture_mode TEXT NOT NULL DEFAULT 'ad_hoc'
    CHECK (capture_mode IN ('scheduled', 'ad_hoc', 'retrospective')),
  energy_profile TEXT
    CHECK (energy_profile IN ('light', 'deep', 'admin', 'creative', 'reactive')),
  scheduling_constraint TEXT
    CHECK (scheduling_constraint IN ('hard_deadline', 'soft_target', 'opportunistic', 'recurring')),
  tracking TEXT NOT NULL DEFAULT 'check_in'
    CHECK (tracking IN ('none', 'check_in', 'log', 'review')),

  -- AI 辅助扩展数据（JSONB）
  ai_tags JSONB NOT NULL DEFAULT '{}',
    -- complexity_confidence, decomposition_progress 等预留字段

  CONSTRAINT check_tasks_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- 索引
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_clarity ON tasks(user_id, clarity);
CREATE INDEX idx_tasks_user_parent ON tasks(user_id, parent_id);
CREATE INDEX idx_tasks_user_thread ON tasks(user_id, thread_id);
CREATE INDEX idx_tasks_user_priority ON tasks(user_id, priority);
CREATE INDEX idx_tasks_user_energy ON tasks(user_id, energy_profile);
CREATE INDEX idx_tasks_user_constraint ON tasks(user_id, scheduling_constraint);
CREATE INDEX idx_tasks_user_tracking ON tasks(user_id, tracking);
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date);
```

### 3.4 主线 vs 任务边界

| 特征 | 主线 (Thread) | 任务 (Task) |
|---|---|---|
| 能否直接执行 | ❌ 不能（纯容器） | ✅ 能 |
| 能否放入时间盒 | ❌ 不能 | ✅ 能 |
| 颜色标识 | ✅ 有 color 字段 | ❌ 无（继承主线颜色） |
| 时间范围 | start_date / end_date | due_date / start_date / end_date |
| 层级 | 顶层容器 | 可有 parent_id（嵌套） |
| 状态机 | active / paused / completed / archived | todo / planned / in_progress / completed / archived |

---

## 4. 标签体系详细定义

### 4.1 🤖 AI 维护标签（系统全权管理，用户只读）

#### 4.1.1 认知清晰度（clarity）— 排他性

| 值 | 定义 | 计算指标 | 判断条件 |
|---|---|---|---|
| `fuzzy` | 模糊念头，只有方向 | 字段完整度 + 语义分析 | `title` 有意义；`description` 缺失或与 title 高度重复（Jaccard > 0.8）或长度 < 10 |
| `scoped` | 有轮廓，知道是什么 | 字段完整度 | `title` + `description` 有意义；`energy_required` 或 `estimated_duration` 缺失 |
| `actionable` | 可执行，能放入时间盒 | 字段完整度 | 所有核心字段完整（title, description, energy_required, estimated_duration），且 estimated_duration > 0 |

**计算触发时机**：每次 `save()`、`updateStatus()`、子任务变更后自动调用 `recalculateClarity()`。

**父子独立原则**：每个任务的 clarity 独立计算。当所有子任务都达到 `actionable` 时，父任务推荐升级（作为 Continuity Cue），但不自动执行。

#### 4.1.2 复杂度（complexity）— 非排他性

| 值 | 定义 | 计算指标 | 判断条件 |
|---|---|---|---|
| `routine` | 重复性、结构化明确 | AI 语义分析 | **[预留]** 描述含"每天"、"每周"等词且 duration < 60 |
| `structure_unknown` | 目标明确但路径不清 | AI 语义分析 | **[预留]** 含"研究"、"调研"、"了解"等探索性词汇 |
| `multi_step` | 多步骤、有依赖 | estimated_duration + 子任务结构 | `estimated_duration > 180` 或 `子任务数 > 2` |
| `exploratory` | 探索性、结果不确定 | AI 语义分析 | **[预留]** 含"尝试"、"看看"、"探索"等词 |
| `creative` | 需要创造性思维 | AI 语义分析 | **[预留]** 含"设计"、"创作"、"构思"等词 |

**自下而上推荐**：父任务的推荐 complexity = 所有子任务 complexity 的并集。用户可一键确认添加。

#### 4.1.3 拆分建议状态（decomposition）— 排他性

| 值 | 定义 | 计算指标 | 判断条件 |
|---|---|---|---|
| `atomic` | 不可拆分，直接执行 | estimated_duration + 子任务数 | `estimated_duration <= 120` 且 `子任务数 == 0` |
| `splittable` | 可拆分但尚未拆分 | estimated_duration + 子任务数 | `estimated_duration > 120` 且 `子任务数 == 0` |
| `splitting_in_progress` | 正在拆分中 | 子任务完成率 | `子任务数 > 0` 且 `子任务完成率 < 100%` |
| `decomposed` | 已完全拆分 | 子任务完成率 | `子任务数 > 0` 且 `子任务完成率 >= 100%` |

### 4.2 👤 用户管理标签（AI 推荐，用户可修改）

#### 4.2.1 来源方式（capture_mode）— 排他性 · 主/子独立

| 值 | 定义 | AI 推荐条件 |
|---|---|---|
| `scheduled` | 有计划时间 | 用户输入含明确时间词，或 `due_date` 已填 |
| `ad_hoc` | 临时插入 | 快捷命令、语音输入、GrowthMenu 快速创建 |
| `retrospective` | 事后补录 | 创建时 `status === 'completed'` 或用户声明"已做完" |

#### 4.2.2 能量属性（energy_profile）— 排他性 · 主/子约束

| 值 | 定义 | AI 推荐条件 |
|---|---|---|
| `light` | 轻量事务，低能量 | `estimated_duration < 30` 且含 routine 词汇 |
| `deep` | 深度工作，需长时间专注 | `estimated_duration >= 90` 且含"分析"、"写作"、"编程"等词 |
| `admin` | 事务性工作 | 含"回复"、"审批"、"整理"、"提交"等词 |
| `creative` | 创造性工作 | **[预留]** 含"设计"、"创意"、"构思"等词 |
| `reactive` | 响应性工作 | `scheduling_constraint === 'hard_deadline'` 且含"紧急"、"响应"等词 |

**主/子关系约束**：子任务 energy 原则上不超过主任务。如子任务 energy 总和/最高值超过主任务，主任务 energy 推荐升级。

#### 4.2.3 调度约束（scheduling_constraint）— 排他性 · 主/子约束

| 值 | 定义 | AI 推荐条件 |
|---|---|---|
| `hard_deadline` | 硬截止 | 含"必须"、"deadline"、"截止"等词，或 `due_date < 今天+3天` |
| `soft_target` | 软目标 | `due_date` 已填但不满足 hard_deadline |
| `opportunistic` | 择机 | `due_date === null` 且不满足 hard_deadline |
| `recurring` | 周期性（有限次） | `recurrence !== null` |

**主/子关系约束**：子任务 `due_date` 原则上不超出主任务 `end_date`。

#### 4.2.4 跟踪模式（tracking）— 排他性 · 默认继承

| 模式 | 执行要求 | 完成后要求 | AI 推荐条件 |
|---|---|---|---|
| `none` | 标记完成 | 无 | `duration < 30` 且 routine |
| `check_in` | 标记完成 + 实际用时 | 无 | 默认推荐（不满足 none 且 `duration < 60`） |
| `log` | 同上 | 一句话产出描述 | `duration >= 60` 且 `duration < 120` |
| `review` | 同上 | 结构化复盘：产出、方法、经验、改进点 | `duration >= 120` 或 complexity 含 multi_step/exploratory/creative |

**继承规则**：子任务创建时默认复制父任务/主线的 tracking，但可独立修改。

---

## 5. 主线创建方式（混合模式）

### 5.1 方式一：显式创建

用户在任务树中点击"创建主线"，输入名称、颜色、时间范围。创建后在该主线下添加子任务。

### 5.2 方式二：自动提升

用户创建普通任务 → 添加子任务 → 系统检测到"此任务有子任务且无父任务"，推荐提升为主线。用户一键确认。

### 5.3 方式三：从现有任务提升

用户在任务详情页点击"提升为主线"，选择颜色、时间范围，原任务变为该主线的第一个子任务。

**设计意图**：降低用户创建主线的认知门槛——用户可以从一个模糊的想法开始，先创建一个任务，随着想法清晰化、子任务增多，自然地"生长"成一条主线。

---

## 6. Manifest 关键 Action 定义

```yaml
intent_triggers:
  # ── 主线相关 ──
  - action: createThread
    shortcut: /createThread
    description: 创建一条新主线
    response_type: cnui
    cnui_surface: thread-creation-card

  - action: promoteToThread
    shortcut: /promoteToThread
    description: 将现有任务提升为主线
    response_type: cnui
    cnui_surface: thread-promote-card

  # ── 任务相关 ──
  - action: createTask
    shortcut: /createTask
    description: 创建新任务（可关联主线）
    response_type: cnui
    cnui_surface: task-creation-card

  - action: refineTask
    shortcut: /refineTask
    description: AI 帮助细化模糊任务
    response_type: cnui
    # 将 fuzzy 任务通过 AI 对话逐步变为 scoped/actionable

  - action: splitTask
    shortcut: /splitTask
    description: AI 建议拆分可拆分任务
    response_type: cnui
    cnui_surface: task-split-card

  - action: viewTaskTree
    shortcut: /tasks
    description: 查看任务树（主线 + 嵌套任务）
    response_type: page
    view_route: /tasks

  - action: viewTaskDetail
    shortcut: /taskDetail
    description: 查看任务详情（含系统认知面板）
    response_type: page
    view_route: /tasks/[id]

  - action: viewThreadDetail
    shortcut: /threadDetail
    description: 查看主线详情
    response_type: page
    view_route: /threads/[id]

# ── 生命周期 ──
lifecycle:
  task:
    states: [todo, planned, in_progress, completed, archived]
    initial_state: todo
    transitions:
      - from: null
        to: todo
        trigger: intent
        action: create
        event_type: TaskCreated
      - from: todo
        to: planned
        trigger: intent
        action: plan
        event_type: TaskPlanned
      - from: planned
        to: in_progress
        trigger: intent
        action: start
        event_type: TaskStarted
      - from: in_progress
        to: completed
        trigger: intent
        action: complete
        event_type: TaskCompleted
      - from: completed
        to: archived
        trigger: intent
        action: archive
        event_type: TaskArchived
      - from: todo
        to: in_progress
        trigger: intent
        action: start
        event_type: TaskStarted
    terminal_states: [archived]

  thread:
    states: [active, paused, completed, archived]
    initial_state: active
    transitions:
      - from: null
        to: active
        trigger: intent
        action: create
        event_type: ThreadCreated
      - from: active
        to: paused
        trigger: intent
        action: pause
        event_type: ThreadPaused
      - from: paused
        to: active
        trigger: intent
        action: resume
        event_type: ThreadResumed
      - from: active
        to: completed
        trigger: time
        action: auto_complete
        event_type: ThreadCompleted
      - from: completed
        to: archived
        trigger: intent
        action: archive
        event_type: ThreadArchived
    terminal_states: [archived]

# ── 视图路由 ──
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

# ── CNUI Surfaces ──
cnui_surfaces:
  thread-creation-card:
    handler: ./cnui/handlers
  thread-promote-card:
    handler: ./cnui/handlers
  task-creation-card:
    handler: ./cnui/handlers
  task-split-card:
    handler: ./cnui/handlers
```

---

## 7. 关键界面规划

### 7.1 任务树页面 (`/tasks`)

- **左侧**：主线列表（带颜色标识）+ 筛选条件（按 clarity、status、energy_profile 等）
- **右侧**：选中主线的任务树（可嵌套展开/折叠）
- **视觉区分**：主线节点显示颜色条，任务节点显示 clarity 标签

### 7.2 任务详情页 (`/tasks/[id]`)

- **上半部分**：任务信息编辑（title、description、priority、energy_required、estimated_duration、due_date 等）
- **下半部分**：**系统认知面板**（只读，展示 AI 维护的 clarity/complexity/decomposition）
  - 显示当前 AI 对任务的认知评估
  - 当 clarity 可升级时，显示推荐升级提示
  - 当 decomposition == 'splittable' 时，显示"建议拆分"按钮

### 7.3 CNUI 界面

| Surface | 功能 |
|---|---|
| `thread-creation-card` | 创建主线卡片，选颜色、时间范围 |
| `thread-promote-card` | 将任务提升为主线，选颜色、时间范围 |
| `task-creation-card` | 创建任务卡片，AI 自动推荐标签，用户一键确认或修改 |
| `task-split-card` | AI 建议拆分任务，展示建议的子任务列表，用户确认 |

---

## 8. AI 维护标签计算流程

### 8.1 clarity 计算

```typescript
function calculateClarity(task: Task): ClarityLevel {
  // fuzzy: title 有意义，但 description 缺失或无意义
  if (!task.description || isDescriptionMeaningless(task.title, task.description)) {
    return 'fuzzy'
  }

  // scoped: title + description 有意义，但缺少执行参数
  if (task.energy_required === undefined || task.estimated_duration === undefined) {
    return 'scoped'
  }

  // actionable: 所有核心字段完整
  if (task.estimated_duration > 0) {
    return 'actionable'
  }

  return 'fuzzy' // 兜底
}

function isDescriptionMeaningless(title: string, desc: string): boolean {
  if (desc.length < 10) return true
  const jaccard = calculateJaccard(title, desc)
  return jaccard > 0.8
}
```

### 8.2 complexity 计算（规则部分）

```typescript
function calculateComplexity(task: Task): ComplexityTag[] {
  const tags: ComplexityTag[] = []

  // multi_step: 基于规则
  if (task.estimated_duration > 180 || task.childCount > 2) {
    tags.push('multi_step')
  }

  // 其余标签通过 AI 语义分析（预留）
  // routine, structure_unknown, exploratory, creative

  return tags
}
```

### 8.3 decomposition 计算

```typescript
function calculateDecomposition(task: Task): DecompositionLevel {
  const hasChildren = task.childCount > 0
  const childCompletionRate = task.childCompletionRate

  if (!hasChildren && (task.estimated_duration || 0) <= 120) {
    return 'atomic'
  }

  if (!hasChildren && (task.estimated_duration || 0) > 120) {
    return 'splittable'
  }

  if (hasChildren && childCompletionRate < 1) {
    return 'splitting_in_progress'
  }

  if (hasChildren && childCompletionRate >= 1) {
    return 'decomposed'
  }

  return 'atomic'
}
```

---

## 9. 预留项清单

以下功能在当前设计中已预留位置，待后续实现：

| # | 预留项 | 位置 | 说明 |
|---|---|---|---|
| 1 | `complexity.routine` | AI 语义分析 | 需要训练数据或关键词匹配 |
| 2 | `complexity.structure_unknown` | AI 语义分析 | 需要语义理解能力 |
| 3 | `complexity.exploratory` | AI 语义分析 | 需要语义理解能力 |
| 4 | `complexity.creative` | AI 语义分析 | 需要语义理解能力 |
| 5 | `energy_profile.creative` | AI 语义分析 | 需要语义理解能力 |
| 6 | `ai_tags.complexity_confidence` | JSONB 扩展 | 记录 AI 对 complexity 判断的置信度 |
| 7 | `ai_tags.decomposition_progress` | JSONB 扩展 | 记录拆分子任务的完成进度 |
| 8 | AI 细化对话（refineTask） | Handler | 将 fuzzy 任务通过多轮对话变为 scoped/actionable |
| 9 | AI 拆分建议（splitTask） | Handler | 将 splittable 任务拆分为子任务 |

---

## 10. 实施策略

采用**大爆炸重构**（方案三），一次性完成：

1. 编写数据迁移脚本（Project → Thread 转换，原数据直接删除）
2. 删除 `projects` 表、`project_templates` 表
3. 创建 `threads` 表
4. 重构 `tasks` 表（新增字段、删除 project_id、删除 timebox_id）
5. 重写 Repository 层
6. 重写 Domain hooks
7. 重写 manifest
8. 重写所有 UI 组件和 CNUI surfaces
9. 生成新的 app/ 路由
10. 一次性发布

---

## 附录：标签父子关系总览

| 标签 | 排他性 | 父子关系 | 说明 |
|---|---|---|---|
| `clarity` | ✅ | **独立** | 父任务所有子 actionable 时推荐升级 |
| `complexity` | ❌ | **推荐继承** | 父 = 子任务并集，用户确认 |
| `decomposition` | ✅ | **独立** | 每个任务独立计算 |
| `capture_mode` | ✅ | **独立** | 每个任务独立设置 |
| `energy_profile` | ✅ | **约束** | 子不高于父，超出时父推荐升级 |
| `scheduling_constraint` | ✅ | **约束** | 子 due_date 不超出父 end_date |
| `tracking` | ✅ | **默认继承** | 子复制父，可独立修改 |
