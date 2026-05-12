# Implementation Plan: 任务管理系统

**Branch**: `005-task-management` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-task-management/spec.md` + 设计文档 `docs/superpowers/specs/2026-05-12-task-management-design.md`

## Summary

为 Lifeware 新增"项目-任务-子任务"三层任务管理系统。核心工作包括：新建 Project 实体（含模板）、扩展 Task 实体（新增项目归属、父子层级、时间调度字段）、实现任务状态机（draft→active→in_progress→completed→archived）和项目状态机（planning→active→completed→archived）、支持时间参数继承链（子任务→父任务→项目）、模板系统（保存/从模板创建）、AI 文件导入（复用 OKR 导入管道）。UI 层面复用 OKR 的 Dialog+Panel 组件模式和折叠分组交互。

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: React 19.2.3, Next.js 16.1.6, Tailwind CSS 4, shadcn/ui, Drizzle ORM 0.45.1, date-fns 4.1, openai 6.35（AI 导入）, mammoth 1.12（Word 解析）, xlsx（Excel 解析）
**Storage**: PostgreSQL（Docker Compose 本地开发），Drizzle ORM + Drizzle Kit 迁移
**Testing**: Vitest（单元测试）
**Target Platform**: Web（MVP 仅桌面端）
**Project Type**: web-service（Next.js 全栈应用）
**Performance Goals**: 任务状态切换 <2 秒响应；项目创建→3个任务→子任务流程 <3 分钟
**Constraints**: 遵循 Repository Pattern (R-01~R-04)、Multi-Tenancy (T-01~T-04)、USOM Governance (G-01~G-08)；所有写操作路由通过 Intent Engine
**Scale/Scope**: 单用户多租户；新增 4 张表 + 扩展 1 张表；新增 2 个 Repository；新增 1 个 Domain Plugin

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Intent-Driven, Not Feature-Driven
- ✅ **PASS**: 所有写操作（创建项目/任务、状态变更、模板保存）通过 Intent Engine 路由
- ✅ 不绕过 Intent→Rule→StateMachine 管道

### II. Energy-First Scheduling
- ✅ **PASS**: Task 扩展保留 `energyRequired` 字段；时间调度支持 energy 兼容性验证
- ✅ 任务排入 timebox 时通过 Rule Engine 验证 energy match

### III. Single-Writer Invariant
- ✅ **PASS**: 状态变更由 State Machine 独占写入；Intent Engine 解析用户输入；Action Surface Engine 输出 UI
- ✅ 新增 Repository 不执行状态写入（仅 CRUD 操作）

### IV. USOM Sovereignty & Document Authority
- ⚠️ **PENDING**: 需在 Phase 1 更新 `docs/usom-design.md` 新增 Project 类型、扩展 Task 类型
- ⚠️ 需在 Phase 1 更新 `docs/database-design.md` 新增 4 张表 + 扩展 tasks 表

### V. Repository Interface Isolation
- ✅ **PASS**: 新增 ProjectRepository、TaskTemplateRepository 遵循 R-01~R-04
- ✅ USOM 类型作为输入/输出，不暴露 Drizzle 行类型

### VI. Domain Plugin Passivity
- ✅ **PASS**: 新增 Projects 域插件仅实现四钩子（onValidate/onEvent/onActionSurfaceRequest/onOutboundRequest）
- ✅ 不直接写状态、不自主执行、不跨域访问

### VII. Bridge Layer Readiness
- ✅ **PASS**: Repository 方法签名使用 USOM 类型，不依赖 HTTP context
- ✅ 模板导入的 Server Action 可迁移为 Bridge 接口

### VIII. AI/Rule Boundary
- ✅ **PASS**: AI 仅用于文件导入的文本提取（Intent Engine 辅助），不参与状态机或冲突检测
- ✅ 模板表单作为 AI 导入失败时的降级路径

### Architecture Constraints

- **R-01~R-04**: ✅ 新增 Repository 不直接调用 Drizzle
- **T-01~T-04**: ✅ 所有新表含 `user_id`，查询按 userId 过滤
- **JSONB Usage**: ✅ `tags`、`days_of_week` 使用 jsonb（符合配置/元数据规则）；status、时间字段使用独立列

**Gate Result**: ⚠️ CONDITIONAL PASS — 必须在 Phase 1 完成 USOM 和 DB 文档更新后方可进入 Phase 2 实现。

## Project Structure

### Documentation (this feature)

```text
specs/005-task-management/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出（UI 组件契约）
└── tasks.md             # Phase 2 输出（/speckit-tasks 命令生成）
```

### Source Code (repository root)

```text
frontend/src/
├── lib/db/
│   ├── schema.ts                    # 新增 projects、project_templates、task_templates 表；扩展 tasks 表
│   └── repositories/
│       ├── task.repository.ts       # 扩展：findByProject、findByParent、findByDateRange、updateStatus
│       ├── project.repository.ts    # 新增：CRUD、状态管理、模板转换
│       └── task-template.repository.ts  # 新增：模板 CRUD、模板→实例转换
│
├── usom/
│   ├── types/
│   │   ├── objects.ts              # 新增 Project、ProjectTemplate、TaskTemplate 类型；扩展 Task
│   │   └── primitives.ts           # 新增 ProjectStatus、更新 TaskStatus（scheduled→in_progress+on_hold）
│   └── interfaces/
│       └── irepository.ts          # 新增 IProjectRepository、ITaskTemplateRepository
│
├── domains/
│   └── projects/                    # 新增域插件
│       ├── index.ts                 # onValidate / onEvent / onActionSurfaceRequest / onOutboundRequest
│       └── time-inheritance.ts     # 时间参数向上继承逻辑（纯函数）
│
├── components/
│   └── projects/                    # 新增项目组件
│       ├── project-directory.tsx    # 项目目录页（卡片列表+筛选+独立任务区）
│       ├── project-detail.tsx       # 项目详情页（任务层级+折叠展开）
│       ├── project-form.tsx         # 项目创建/编辑表单
│       ├── task-form.tsx            # 任务创建/编辑表单
│       ├── task-list.tsx            # 可折叠任务列表组件
│       ├── task-import-dialog.tsx   # AI 导入对话框（复用 OKR Dialog 模式）
│       ├── task-import-panel.tsx    # AI 导入预览编辑面板（复用 OKR Panel 模式）
│       ├── template-dialog.tsx      # 保存/管理模板对话框
│       └── status-badge.tsx         # 状态徽标（复用 OKR 组件）
│
├── lib/
│   ├── task-import/
│   │   ├── file-parser.ts          # 复用并扩展 okr-import/file-parser.ts（支持任务模板格式）
│   │   ├── task-extractor.ts       # LLM 调用：从文本提取结构化任务数据
│   │   └── template-markdown.ts    # 模板 Markdown 生成和解析
│   └── time-inheritance.test.ts    # 时间继承链单元测试
│
└── app/
    └── projects/                    # 路由页面
        ├── page.tsx                 # 项目目录页
        └── [id]/
            └── page.tsx             # 项目详情页
```

**Structure Decision**: 单项目结构（Option 1），遵循既有代码组织模式。组件放在 `components/projects/`，域逻辑放在 `domains/projects/`，复用 OKR 模块的 Dialog/Panel 组件模式。

## Complexity Tracking

> 无违反章程的复杂性引入。所有设计决策均基于现有架构模式。
