# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lifeware** is an intent-driven personal growth system. It aims to convert life meaning into executable, reviewable time structures by integrating career planning, personal OKRs, tasks/habits, timeboxing, and reflection into a unified "life operating system."

**Core Philosophy**: 从用户的个人事务流水账中进行行为建模，陪伴用户完成从「知道」到「做到」再到「持续做到」的完整成长闭环，是个人的“成长陪跑教练”和“意义协商伙伴”

## Technology Stack

- **Frontend**: Next.js 16.1.6, React 19.2.3, TypeScript 5
- **UI**: Tailwind CSS 4, shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM 0.45.1
- **Build**: Drizzle Kit for migrations, Docker Compose for PostgreSQL

## Development Commands

```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Drizzle Studio
```

首次准备：在 `.env.local` 配置 `DATABASE_URL`，再 `docker-compose up -d` 启动 PostgreSQL。

---

## Architecture: The Nexus Pattern

This is not a traditional MVC application. Lifeware uses a custom four-layer Nexus architecture.

### 1. USOM (Unified Semantic & Object Model)
Foundation layer: object structures, schemas, and versioning. Location: `frontend/src/usom/`

### 2. Nexus (Core Engine)
Seven components: Intent Engine, Rule Engine, State Machine, Action Surface Engine, Context Engine, AI Runtime, Orchestrator. **AI Runtime** is dependency-injected into Handlers; the **Orchestrator** is a pure dispatcher that never calls AI directly. Location: `frontend/src/nexus/`

### 3. Domain Plugins
Extensible domain logic with a dual-track model:
- **Reactive Track**: `onValidate` / `onEvent` / `onActionSurfaceRequest` / `onOutboundRequest`
- **Generative Track**: `onGenerate(request, aiRuntime)` via injected AI Runtime, plus read-only Context Providers

Location: `frontend/src/domains/`

### 4. Bridge Layer (Phase 2)
External access (REST, MCP, Webhook/SSE). Architecture constraints apply from MVP; implementation in Phase 2.

> Hook signatures, cross-component contracts, and the AI/Rule boundary live in `.specify/memory/constitution.md`.

---

## 语言规范
- 所有对话、注释和文档必须使用**简体中文**。


## Governance Reference

> **All architectural constraints, development rules, and governance principles
> are defined in a single authoritative source:**
>
> **`.specify/memory/constitution.md`**
>
> When in doubt about any constraint (Repository Pattern, Multi-Tenancy,
> JSONB usage, Bridge Layer, USOM governance, AI/Rule boundary, etc.),
> refer to the constitution. This file only summarizes code-level conventions.

### Constraint Quick Reference (IDs defined in constitution)

The following constraint IDs are referenced throughout the codebase. Their full
definitions and rationale live in the constitution:

- **R-01 ~ R-04**: Repository Pattern (database layer isolation)
- **T-01 ~ T-04**: Multi-Tenancy (user_id handling)
- **A ~ D**: Bridge Layer constraints (effective from MVP)
- **G-01 ~ G-08**: USOM Governance rules

---

## Database Schema

Schema lives in `frontend/src/lib/db/schema.ts`; full design in `docs/database-design.md`. Tables span user data, Domain objects (tasks/habits/OKRs/timeboxes), system processing (intentions/state_proposals/action_surfaces), and AI/memory (`ai_sessions`/`memory_episodes`).

---

## 界面设计要求

- **权威规范**：`docs/UI-DESIGN-SPEC.md` — 所有 UI 相关开发必须遵守
- 视觉风格参照 DESIGN.md（品牌设计令牌来源）
- 组件库使用 shadcn/ui
- Web 端布局为 Notion 风格三栏（顶部导航 + 左侧 AI 面板 + 右侧主内容区）
- 颜色必须使用 CSS 变量令牌（`bg-canvas`、`text-ink` 等），禁止 Tailwind 默认颜色类
- PR 审查必须通过 UI-DESIGN-SPEC §14 检查清单（C-01~C-07）

---

## Project Status

**Current Phase**: MVP Development (Stage 1 of 6)


---

## Documentation

### 文档归属模型

| 归属层 | 目录 | 维护者 |
|---|---|---|
| 第一层：用户所有 | `mydocs/` | 用户编辑，Claude 只读 |
| 第二层：协同维护 | `docs/` | 用户定义意图，Claude 保证与代码一致 |
| 第三层：Claude 自动维护 | 根目录 + `.specify/` | Claude 维护，用户审批 |

完整文档索引与版本历史见 `manifest.md`（项目根目录）。`docs/` 与 `mydocs/` 下各文档（usom-design、database-design、UI-DESIGN-SPEC 等）若有修改，**MUST** 同步更新 `manifest.md`。

---

## gstack

```
1. 所有网页浏览均使用 gstack 中的/browse 功能，绝不要使用 mcp__claude-in-chrome__*工具。
2. 主要规划skill包括: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /autoplan, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa
```



## 开发流程插件协作

### 插件能力

- **gstack**：负责决策和外部能力
```
  决策层 — /office-hour, /autoplan 
  外部层 — /browse, /qa,  /ship, /land-and-deploy, /canary
```

- **superpowers**：负责思考与开发执行流程 

  ```
  包含 brainstorming → plan  → Subagent-driven-dev+TDD  →  review  →  finish
  ```

  

### 任务分流

先判断规模，再定流程深度

####  轻量级任务（单文件、明确bug、配置）

1. 直接实现
2. 人工验证，必要是 /browse

#### 普通任务（多文件、边界清晰的新功能/重构）

1. `/superpowers:brainstorming`
2. `/superpowers:writing-plans`
3. `/superpowers:subagent-driven-dev+TDD`
4. gstack: `/browse+/qa`
5. `/superpowers:requesting-code-review`
6. 人工验证 + `/superpowers:systematic-debugging`
7. `/superpowers:finishing-a-development-branch`

#### 复杂任务（跨模块、共享逻辑、架构变动、公共 API）

1. gstack: `/office-hours`（战略拷问 → 产出 design doc 到 `~/.gstack/`；随后 `cd frontend && npm run adopt:design -- <topic>` 拷入 `docs/superpowers/specs/` 作为 SSOT）
2. `/superpowers:writing-plans`（design doc + 代码现状 → 产出 spec + plan）
3. gstack: `/autoplan` 或 `/plan-eng-review`（评审上一步的 spec/plan → 追加 GSTACK REVIEW REPORT）
4. `/superpowers:subagent-driven-dev+TDD`
5. gstack: `/browse+/qa`
6. gstack: `/review`
7. 人工验证 + `/superpowers:systematic-debugging`
8. `/lifeware-neat`
9. `/superpowers:finishing-a-development-branch`
10. 如果需要部署生产环境，继续 `/ship → /land-and-deploy → /canary`



### Change Delivery Gate（声明完成前必须）

验证已执行并如实报告 · 过质量门禁 · 无法执行的验证明确说明原因 · 禁止虚构命令输出 · 无证据不得声称完成。



---

## Coding Guidelines

### 1. Think Before Coding
Don't assume or hide confusion — surface tradeoffs. State assumptions explicitly; if multiple interpretations exist, present them instead of picking silently; push back when a simpler approach exists.

### 2. Simplicity First
Minimum code that solves the problem — nothing speculative. No features, abstractions, or "flexibility" beyond what was asked. If 200 lines could be 50, rewrite.

### 3. Surgical Changes
Touch only what you must; clean up only your own mess. Match existing style; don't refactor what isn't broken. Every changed line should trace directly to the request.

### 4. Goal-Driven Execution
Define verifiable success criteria and loop until they pass: "fix the bug" → "write a test that reproduces it, then make it pass". For multi-step tasks, state a brief step → verify plan.

### 5. 代码注释规范

详见 `docs/code-commenting-guide.md`。关键约束：每个 TS/JS 文件必须有 `/** @file ... @brief ... */` 文件头注释；所有注释使用**简体中文**。新建或修改文件时必须同步更新注释，确保与代码逻辑一致。
