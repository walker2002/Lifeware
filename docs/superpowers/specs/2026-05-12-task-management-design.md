# 任务管理功能设计规格

> 日期: 2026-05-12
> 状态: 草案
> 前置依赖: 现有 Task USOM 类型、OKR 导入基础设施、习惯管理时间调度模式

## 1. 概述

为 Lifeware 系统新增任务管理功能，建立"项目-任务-子任务"三层管理结构，支持任务的时间调度、模板系统和 AI 导入。

### 核心目标

- 扩展现有 Task 对象，增加项目归属、子任务层级和时间调度能力
- 新建 Project 实体，作为任务的组织容器
- 支持任务级和项目级模板，提供 AI 辅助导入（参照 OKR 导入模式）
- 支持一次性任务的建议执行时段和周期性任务的每日实例生成

### 范围边界

- MVP 阶段严格两层（任务-子任务），但数据模型支持未来多层扩展
- 项目不直接关联 OKR，后续可通过规则引擎实现软关联
- 12 小时拆解建议为软提示，不强制

## 2. 数据模型

### 2.1 新增表: projects

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 主键 |
| user_id | uuid FK | 多租户用户 ID |
| schema_version | integer | USOM 版本号 |
| name | text NOT NULL | 项目名称 |
| description | text | 项目描述 |
| status | text NOT NULL | 状态枚举（见 2.3） |
| start_date | date | 项目开始日期 |
| end_date | date | 项目截止日期 |
| default_earliest_time | text | 默认最早开始时间 (HH:MM) |
| default_latest_start_time | text | 默认最晚开始时间 (HH:MM) |
| default_duration | integer | 默认时长（分钟） |
| priority | text | 优先级 (P0/P1/P2/P3) |
| color | text | 显示颜色标识 |
| tags | jsonb | 标签数组 |
| notes | text | 备注 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |
| completed_at | timestamp | 完成时间 |
| archived_at | timestamp | 归档时间 |

索引: (user_id, status), (user_id, start_date)

### 2.2 扩展表: tasks

在现有 tasks 表上新增以下字段:

| 新增字段 | 类型 | 说明 |
|---|---|---|
| parent_id | uuid FK→tasks.id (nullable) | 自关联父任务，null 表示顶级任务 |
| project_id | uuid FK→projects.id (nullable) | 所属项目，null 表示独立任务 |
| earliest_time | text | 最早开始时间 (HH:MM)，null 时继承父级 |
| latest_start_time | text | 最晚开始时间 (HH:MM) |
| default_time | text | 默认执行时间 (HH:MM) |
| default_duration | integer | 默认时长（分钟） |
| frequency_type | text | 频率 (once/daily/weekly/custom) |
| days_of_week | jsonb | frequency_type=custom 时生效 |
| start_date | date | 周期性任务的开始日期 |
| end_date | date | 周期性任务的结束日期 |

新增索引: (user_id, project_id), (user_id, parent_id), (project_id, status)

### 2.3 新增表: project_templates

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 主键 |
| user_id | uuid FK | 用户 ID |
| name | text NOT NULL | 模板名称 |
| description | text | 模板描述 |
| default_earliest_time | text | 默认最早时间 |
| default_latest_start_time | text | 默认最晚时间 |
| default_duration | integer | 默认时长 |
| priority | text | 默认优先级 |
| color | text | 颜色标识 |
| tags | jsonb | 标签 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 2.4 新增表: task_templates

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 主键 |
| project_template_id | uuid FK | 所属项目模板（null 为独立任务模板） |
| parent_template_id | uuid FK→task_templates.id | 模板内自关联 |
| title | text NOT NULL | 任务标题 |
| description | text | 任务描述 |
| priority | text | 优先级 |
| energy_required | text | 能量要求 |
| estimated_duration | integer | 预估时长（分钟） |
| earliest_time | text | 最早开始时间 |
| latest_start_time | text | 最晚开始时间 |
| default_time | text | 默认执行时间 |
| default_duration | integer | 默认时长 |
| frequency_type | text | 频率 |
| sort_order | integer | 排序序号 |
| created_at | timestamp | 创建时间 |

### 2.5 关系图

```
projects ──1:N── tasks.project_id    (任务可选归属项目)
tasks ──────1:N── tasks.parent_id    (自关联，支持任意深度)
project_templates ──1:N── task_templates (模板结构)
task_templates ──自关联── task_templates.parent_template_id
```

**project_id 冗余存储策略**: 每个 task 行直接带 project_id，不做层级推导。查询"某项目所有任务"只需 `WHERE project_id = X`。应用层保证一致性——创建子任务时继承父任务的 project_id。

## 3. 状态模型

三个实体各自独立的状态生命周期:

### 3.1 Project 状态

```
planning → active → completed → archived
              ↓
            paused → active
```

- `planning`: 规划中，尚未正式开始
- `active`: 进行中
- `paused`: 暂停
- `completed`: 已完成
- `archived`: 已归档

项目完成条件提示: 当项目下所有任务都 completed 时，UI 提示用户可标记项目为 completed（软提示，不自动）。

### 3.2 Task 状态

```
draft → active → in_progress → completed → archived
              ↓
          on_hold → active
```

- `draft`: 草稿
- `active`: 已激活，待执行
- `in_progress`: 执行中（新增，区分"已激活"和"正在做"）
- `on_hold`: 暂停
- `completed`: 已完成
- `archived`: 已归档

现有 `scheduled` 状态由 `in_progress` 替代，更直观地表达"正在做"。

### 3.3 Sub-task 状态

与 Task 相同的状态机，独立管理。Sub-task 和 Task 通过 `parent_id` 区分，共享同一张表和同一状态枚举。

## 4. 时间调度

### 4.1 时间继承链

子任务无显式时间设置时，沿层级向上查找:

```
Task/SubTask.earliestTime
  ?? parentTask.earliestTime
    ?? project.defaultEarliestTime
```

同理适用于 `latestStartTime`、`defaultTime`、`defaultDuration`。

### 4.2 一次性任务

- `frequency_type = 'once'`
- `earliestTime`/`latestStartTime`/`defaultTime` 为建议执行时段
- 用于每日计划生成时自动排入合适的时间盒

### 4.3 周期性任务

- `frequency_type` 支持 daily/weekly/custom
- 每日自动生成任务实例（与习惯的 log 机制类似）
- 实例记录可存储在现有的 `timebox_tasks` 关联表中

## 5. 模板系统

### 5.1 模板类型

- **项目级模板**: 包含项目属性 + 任务/子任务结构
- **任务级模板**: 单个任务（可含子任务），`project_template_id = null`

### 5.2 模板操作

- **保存为模板**: 从现有项目/任务复制结构到模板表（不含实际日期、状态）
- **从模板创建**: 复制模板结构到实际 projects/tasks 表，填入新日期
- **模板管理**: 列表展示，支持编辑和删除

### 5.3 AI 导入

复用 OKR 导入架构（file-parser → LLM extraction → markdown rendering）。

#### 导入流程

1. 用户下载模板文件（.md 格式）
2. 编辑模板，填入项目和任务信息
3. 上传文件 → 前端预处理 → Server Action → LLM 提取结构化数据
4. 用户在编辑面板中预览和调整
5. 确认保存 → 创建 project + tasks（draft 状态）

#### 模板 Markdown 格式

```markdown
# 项目任务导入模板

> **字段说明**
> - **优先级**: `P0`（紧急）| `P1`（高）| `P2`（中，默认）| `P3`（低）
> - **能量要求**: `high`（高）| `medium`（中）| `low`（低）
> - **时间格式**: `HH:MM`，如 `09:00`
> - **时长格式**: 数字 + 单位，如 `4h` 表示 4 小时，`30m` 表示 30 分钟
> - **频率**: `once`（一次性，默认）| `daily`（每天）| `weekly`（每周）

---

## 项目: 重构认证模块
<!-- 优先级: P0 | P1 | P2 | P3 -->
- **优先级**: P1
- **默认开始时间**: 09:00
- **默认截止时间**: 12:00
- **描述**: 将认证模块从 Session 迁移到 JWT

### 任务: 设计 JWT 方案
<!-- 优先级: P0 | P1 | P2 | P3 -->
<!-- 能量要求: high | medium | low -->
<!-- 频率: once | daily | weekly -->
- **预估时长**: 4h
- **优先级**: P0
- **能量要求**: high
- **频率**: once

#### 子任务: 调研现有方案
- **预估时长**: 2h

#### 子任务: 编写设计文档
- **预估时长**: 2h

### 任务: 实现迁移
- **预估时长**: 16h
- **优先级**: P1

#### 子任务: 编写迁移脚本
- **预估时长**: 4h

#### 子任务: 更新中间件
- **预估时长**: 6h

#### 子任务: 编写测试
- **预估时长**: 6h
```

HTML 注释（`<!-- -->`）在解析时被忽略，仅作为用户参考。块引用（`>`）作为模板头部的统一字段说明。

## 6. USOM 类型扩展

### 6.1 新增 Project 类型

在 `frontend/src/usom/types/objects.ts` 中新增:

```typescript
export interface Project {
  id: string
  status: ProjectStatus
  name: string
  description?: string
  startDate?: string
  endDate?: string
  defaultEarliestTime?: string    // HH:MM
  defaultLatestStartTime?: string // HH:MM
  defaultDuration?: number        // minutes
  priority?: Priority
  color?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  archivedAt?: string
}
```

### 6.2 扩展 Task 类型

在现有 Task 接口上新增:

```typescript
// 新增字段
parentId?: string
projectId?: string
earliestTime?: string       // HH:MM
latestStartTime?: string    // HH:MM
defaultTime?: string        // HH:MM
defaultDuration?: number    // minutes
frequencyType?: 'once' | 'daily' | 'weekly' | 'custom'
daysOfWeek?: number[]       // 0-6
startDate?: string          // 周期性任务开始日期
endDate?: string            // 周期性任务结束日期
```

### 6.3 新增枚举

```typescript
type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived'
type TaskStatus = 'draft' | 'active' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
```

## 7. UI 设计

### 7.1 页面结构

采用与 OKR 目录一致的组件模式:

- **项目目录页**: 项目卡片列表 + 独立任务区域
- **项目详情页**: 项目信息头部 + 折叠式任务列表
- **导入面板**: 复用 OKR 的 Dialog + Panel 组合

### 7.2 项目目录

- 顶部操作栏: "+ 新建项目" / "+ 新建任务" / "📥 导入模板"
- 状态筛选标签: 全部 / 进行中 / 已完成 / 已归档
- 项目卡片: 名称、状态徽标、优先级、进度条、时间信息
- 底部独立任务区: 列表式展示不归属项目的独立任务

### 7.3 项目详情

- 顶部: 返回按钮 + 项目名称 + 默认时间 + 日期范围 + 编辑按钮
- 任务列表: 折叠/展开交互
  - 展开时显示子任务列表（缩进 + 左侧竖线）
  - 折叠时显示子任务数量
- 超时提示: 预估 > 12h 的任务显示黄色 "⚠ 建议拆分" 提示
- 操作: "+ 添加任务" 按钮

### 7.4 表单

项目和任务的创建/编辑表单使用 shadcn/ui 组件:

- 项目表单: 名称、描述、状态、日期范围、默认时间、优先级、颜色、标签
- 任务表单: 标题、描述、状态、优先级、能量、预估时长、时间调度、频率、截止日期
- 子任务表单: 简化版任务表单（标题、预估时长为主）

## 8. 技术实现要点

### 8.1 架构遵循

- Repository Pattern (R-01 ~ R-04): 新增 ProjectRepository，扩展现有 TaskRepository
- Multi-Tenancy (T-01 ~ T-04): 所有查询按 userId 过滤
- Domain Plugin: 新增 Projects 域插件，实现四钩子接口
- USOM Governance (G-01 ~ G-08): 新增 Project 类型，扩展 Task 类型，版本号递增

### 8.2 迁移策略

1. 创建 projects 表
2. 创建 project_templates + task_templates 表
3. 在 tasks 表新增字段 (parent_id, project_id, earliest_time, latest_start_time, default_time, default_duration, frequency_type, days_of_week, start_date, end_date)
4. 更新 TaskStatus 枚举（新增 in_progress, on_hold，保留 scheduled 兼容）
5. 更新 USOM 类型和 mappers

### 8.3 组件复用

- OKR 导入流程的 Dialog + Panel 组件可直接复用/改造
- 习惯管理的时间字段验证逻辑（HH:MM regex）可复用
- 状态徽标、进度条等 UI 组件可从 OKR 模块复用

## 9. 12 小时拆解提示

当任务创建或编辑时 `estimated_duration > 720`（分钟），UI 显示黄色提示:

> "⚠ 预估时长超过 12 小时，建议拆分为子任务"

提示为纯 UI 层软提醒，不阻塞保存操作。提示显示在任务表单和任务列表中。
