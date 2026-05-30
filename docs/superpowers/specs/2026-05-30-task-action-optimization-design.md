# 任务管理 Action 优化设计

**日期**: 2026-05-30
**状态**: 已确认
**范围**: tasks domain CNUI surface 实现 + 基础设施补全

## 背景

tasks domain 的 manifest 和 hooks 已完整实现，但以下方面缺失：

1. GrowthMenu 中所有 tasks domain action 点击无响应
2. AI 助手的任务相关意图无法执行（提示非法状态转换）
3. 缺少 CNUI surface 组件和 handler
4. handler 未注册到 registry，无法被 Orchestrator 调用
5. manifest 声明的 pages 目录不存在

## 需求

### 1. 创建任务 — CNUI 表面

在 AI 对话中弹出任务创建表单，用户在对话内完成创建。复用已有 `task-form.tsx`，通过 `CnuiFormAdapter` 适配。

### 2. 更新任务 — CNUI 表面（智能判断）

- 上下文已包含具体任务 ID → 直接弹出编辑表单
- 上下文未指定 → 先展示任务列表，用户选择后弹出编辑表单

### 3. 归档任务 — CNUI 确认型面板

显示任务摘要（标题、状态、优先级）+ 确认/取消按钮。

### 4. 查看列表 — GrowthMenu 页面导航

GrowthMenu 中 view_list action 点击后导航到已有 /projects 页面。

### 5. 基础设施补全

- handler 注册到 registry
- 迁移旧 handler 接口
- 补全 CNUI surface 注册

## 方案

采用按功能拆分 surface 的模式（与 habits domain 一致），3 个独立 surface + 1 个统一 handler。

## 设计

### 目录结构

```
frontend/src/domains/tasks/
├── cnui/
│   ├── surfaces/
│   │   ├── TaskCreationCard.tsx    # 创建任务
│   │   ├── TaskEditCard.tsx        # 编辑任务（含选择器）
│   │   └── TaskActionPanel.tsx     # 完成/归档确认面板
│   ├── handlers.ts                # CnuiSurfaceHandler 实现
│   └── __tests__/
│       └── handlers.test.ts
├── pages/
│   ├── TaskFormPage.tsx           # view_routes 页面包装
│   └── ProjectFormPage.tsx        # view_routes 页面包装
├── handlers/
│   ├── create.ts                  # 已有，更新接口
│   └── index.ts                   # 新增，handler 注册入口
└── index.ts                       # 更新，注册 CNUI surfaces
```

### CNUI Surface 组件

#### TaskCreationCard

- 复用 `task-form.tsx`，通过 `CnuiFormAdapter` 包装
- `domainId="tasks"`, `action="createTask"`
- handler.open 返回空 dataSnapshot（新建模式）
- 提交流程：onConfirm(fields) → handler.validate → TaskRepository.create

#### TaskEditCard

两种状态，智能切换：

**状态 1 — 选择任务**（dataModel 无 taskId）：
- 展示从 handler.open 获取的 active tasks 列表
- 用户点击选择 → onDataChange({ taskId, ...taskData })

**状态 2 — 编辑表单**（dataModel 有 taskId）：
- CnuiFormAdapter 包装 task-form，action="updateTask"
- 预填选中任务数据
- 提交：onConfirm(fields) → handler.validate → TaskRepository.update

#### TaskActionPanel

确认型面板，用于 completeTask 和 archiveTask：

- 无 taskId → 先展示任务列表选择
- 有 taskId → 显示任务摘要（标题、状态、优先级）+ 确认/取消按钮
- 确认后：onConfirm → handler.submit → repository 状态更新

三个 surface 共享交互模式：上下文未指定任务时，先展示列表让用户选择。

### Handler 设计

#### cnui/handlers.ts — open(action)

| action | 返回内容 | dataSnapshot |
|--------|---------|-------------|
| createTask | "请填写任务信息" | `{}` |
| updateTask | "请选择要修改的任务" | `{ tasks: activeTasks[] }` |
| completeTask | "请选择要完成的任务" | `{ tasks: activeTasks[] }` |
| archiveTask | "请选择要归档的任务" | `{ tasks: completedTasks[] }` |

#### cnui/handlers.ts — submit(action, fields)

| action | 验证 | 执行 |
|--------|------|------|
| createTask | title 必填, estimatedDuration > 0 | TaskRepository.create() |
| updateTask | taskId 存在, 字段合法 | TaskRepository.update() |
| completeTask | taskId 存在, 状态为 active | 状态更新 + system_event |
| archiveTask | taskId 存在, 状态为 completed | 状态更新 + system_event |

### Manifest 变更

intent_triggers 中每个 action 新增 `response_type`：

| action | response_type | cnui_surface |
|--------|--------------|-------------|
| createTask | cnui | task-creation-card |
| updateTask | cnui | task-edit-card |
| completeTask | cnui | task-action-panel |
| archiveTask | cnui | task-action-panel |
| createProject | page | — |
| updateProject | page | — |
| archiveProject | page | — |
| view_list | page | — |
| view_detail | page | — |

新增 `cnui_surfaces` 块：

```yaml
cnui_surfaces:
  task-creation-card:
    handler: domains/tasks/cnui/handlers
  task-edit-card:
    handler: domains/tasks/cnui/handlers
  task-action-panel:
    handler: domains/tasks/cnui/handlers
```

### GrowthMenu 集成

`app/page.tsx` 中 `VIEW_PAGE_COMPONENTS` 新增 tasks 映射：

```typescript
tasks: {
  view_list: ProjectsView,
  view_detail: ProjectDetail,
}
```

response_type=page 的 action 走页面导航路径，response_type=cnui 的走 CNUI 对话表面路径。

### Pages 补全

**TaskFormPage.tsx** / **ProjectFormPage.tsx**：包装已有的 task-form.tsx / project-form.tsx，接收 params.mode，补全 manifest view_routes 声明一致性。

### 基础设施修复

| 修复项 | 问题 | 方案 |
|--------|------|------|
| registry.ts loadHandlers | 缺少 tasks case | 新增 case 分支 |
| handlers/create.ts | 旧接口，userId 占位 | 迁移到新接口 |
| domain index.ts | 未注册 CNUI surfaces | 新增 cnuiRegistry.register() |
| register-client-surfaces.ts | 未包含 tasks | 新增 tasks surface 注册 |

### 不在范围内

- createProject/updateProject/archiveProject 的 CNUI 表面（response_type 为 page）
- 数据库 schema 变更
- Nexus 核心组件修改
- onGenerate handler

## 宪法合规性

- **Principle VI**: Handler 通过 CnuiSurfaceHandler 接口实现，不直接写状态，submit 返回结果后由 Orchestrator 路由
- **CN-UI Constraint 4**: 通过 CnuiFormAdapter 复用 task-form.tsx，不维护独立验证逻辑
- **CN-UI Constraint 5**: surface 组件置于 `domains/tasks/cnui/`，通过 CnuiSurfaceRegistry 注册
- **Manifest Runtime Consumption**: response_type 和 cnui_surfaces 通过 registry 运行时消费，不硬编码
- **Domain Registration Process**: 遵循 Step 15（CNUI surface 注册）
