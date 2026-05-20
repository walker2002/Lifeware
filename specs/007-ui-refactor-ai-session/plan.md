# Implementation Plan: 界面重构及AI助手会话优化

**Branch**: `007-ui-refactor-ai-session` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-ui-refactor-ai-session/spec.md`

## Summary

本特性涵盖两大改动：(1) 将 `config.ts` 中硬编码的 LLM 提供商列表和模型映射统一到 `.env` 环境变量，消除前端代码常量；(2) 为成长领域菜单的所有 action 实现关联表单/确认界面，基于 manifest `required_fields` 动态生成表单，非创建类 action 展示确认界面。表单提交复用现有 StructuredIntent → Intent Engine → Orchestrator 管道。

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3
**Primary Dependencies**: Next.js 16.1.6, Drizzle ORM 0.45.1, shadcn/ui, Tailwind CSS 4, Zod
**Storage**: PostgreSQL（ai_sessions、structured_intents 表已存在）
**Testing**: Vitest
**Target Platform**: Web 桌面端（浏览器）
**Project Type**: Web application（单项目）
**Performance Goals**: 快捷方式 1s 内触达，分裂视图 3s 内完成
**Constraints**: 单用户个人系统，MVP 阶段
**Scale/Scope**: 4 个域（habits/tasks/okrs/timebox），约 20+ 个 action

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Intent-Driven | ✅ PASS | FR-043 确认表单数据映射为 StructuredIntent，经 Intent Engine 执行 |
| II. Energy-First | ⬜ N/A | 本特性不涉及能量调度 |
| III. Single-Writer | ✅ PASS | 无新写入组件，State Machine 保持唯一状态写入者 |
| IV. USOM Sovereignty | ✅ PASS | StructuredIntent 和 AI Session 为已有 USOM 对象，无新增 |
| V. Repository Isolation | ✅ PASS | 数据访问通过 Repository，前端仅接收 USOM 对象 |
| VI. Domain Passivity | ✅ PASS | 域插件不变，表单组件属 Presentation Layer |
| VII. Bridge Layer | ✅ PASS | Nexus 方法不依赖 HTTP 上下文 |
| VIII. AI/Rule Boundary | ✅ PASS | 表单提交走 template_form 路径（confidence=1.0），AI 不参与规则验证 |
| Manifest Runtime Consumption | ✅ PASS | FR-039/FR-040 从 manifest 运行时读取 required_fields，无硬编码 |
| Domain Registration | ✅ PASS | 新表单组件遵循 view_routes 模式，不修改 Nexus 核心 |
| Multi-Tenancy (T-01~T-04) | ✅ PASS | AI Session 表已有 user_id，新查询均包含 user_id 过滤 |
| Database Access (R-01~R-04) | ✅ PASS | 新数据访问均通过 Repository |

**Gate Result**: PASS — 无违反项，无需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/007-ui-refactor-ai-session/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
frontend/src/
├── lib/
│   ├── llm/
│   │   ├── config.ts              # [MODIFY] 重构：消除硬编码 PROVIDERS，从 env 读取
│   │   ├── client.ts              # [KEEP] OpenAI 客户端封装
│   │   └── index.ts               # [KEEP] 导出接口
│   └── db/
│       ├── schema.ts              # [KEEP] 已有 ai_sessions 表
│       └── repositories/          # [KEEP] 通过 Repository 访问数据
├── nexus/
│   └── core/
│       └── intent-engine/
│           ├── index.ts           # [MODIFY] 新增 parseFromForm() 方法
│           └── template-parser.ts # [MODIFY] 泛化：支持动态字段映射
├── domains/
│   ├── manifest-loader/
│   │   ├── schema.ts              # [KEEP] FieldPrompt schema 已定义全部字段类型
│   │   └── loader.ts              # [KEEP] manifest 加载器
│   ├── registry.ts                # [MODIFY] 新增 getRequiredFields(domainId, action) 方法
│   └── {habits,tasks,okrs,timebox}/
│       └── manifest.yaml          # [KEEP] 已包含 required_fields 定义
├── components/
│   ├── layout/
│   │   ├── main-view-state.ts     # [MODIFY] action 视图状态扩展
│   │   ├── main-content.tsx       # [MODIFY] action 视图渲染动态表单/确认界面
│   │   └── growth-menu.tsx        # [KEEP] 已实现菜单列表
│   └── editor/
│       ├── dynamic-form.tsx       # [NEW] 基于 FieldPrompt[] 动态生成表单
│       └── action-confirm.tsx     # [NEW] 非创建类 action 确认界面
└── app/
    └── actions/
        └── intent.ts              # [MODIFY] submitTemplateIntent 泛化为通用表单提交

frontend/
├── .env.local                     # [MODIFY] 新增 LLM 提供商和模型映射环境变量
└── markdown_templates/            # [KEEP] 已有 markdown 模板目录
```

**Structure Decision**: 单项目结构（Next.js），所有修改在 `frontend/` 目录内。新增 2 个组件文件，修改约 6 个现有文件。
