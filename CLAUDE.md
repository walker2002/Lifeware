# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lifeware** is an intent-driven personal growth system built with Next.js and Drizzle ORM. It aims to convert life meaning into executable, reviewable time structures by integrating career planning, personal OKRs, tasks/habits, timeboxing, and reflection into a unified "life operating system."

**Core Philosophy**: Energy-first scheduling - the system respects biological rhythms and helps users arrange high-energy tasks during peak hours.

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

Database setup:
```bash
docker-compose up -d  # Start PostgreSQL
```

---

## Architecture: The Nexus Pattern

This is not a traditional MVC application. Lifeware uses a custom four-layer Nexus architecture:

### 1. USOM (Unified Semantic & Object Model)
- Foundation layer defining object structures
- Contains all core object types and schemas
- Versioning mechanism for object evolution
- Location: `frontend/src/usom/`

### 2. Nexus (Core Engine)
The system brain with seven main components:
- **Intent Engine**: Parses user input (AI-driven with template-form fallback)
- **Rule Engine**: Validates proposals and detects conflicts
- **State Machine**: Manages object lifecycles
- **Action Surface Engine**: Determines UI actions (Action Guide, Dynamic Tile, Continuity Cue)
- **Context Engine**: Assembles cross-Domain context data for generative operations
- **AI Runtime**: Unified AI infrastructure (LLM routing, Session management, Token budget, CN-UI protocol) — dependency-injected into Handlers, not called by Orchestrator
- **Orchestrator**: Pure dispatcher — routes Reactive/Generative/Time Trigger paths, coordinates components, never calls AI directly
- Location: `frontend/src/nexus/`

### 3. Domain Plugins
Extensible domain-specific logic with dual-track model:

**Reactive Track** (four hooks):
- `onValidate`: Intent validation
- `onEvent`: Event response, returns metrics and suggestions
- `onActionSurfaceRequest`: Returns action surface candidates
- `onOutboundRequest`: Outbound push declarations (not implemented in MVP)

**Generative Track** (Handler + Context Providers):
- `onGenerate(request, aiRuntime)`: AI-powered planning via injected AI Runtime
- Handler owns prompt design, tool use, and CN-UI output decisions
- Context Providers expose read-only Domain data for cross-Domain consumption

- Location: `frontend/src/domains/`

### 4. Bridge Layer (Phase 2)
- External access layer via standard protocols (REST API, MCP Server, Webhook/SSE)
- **MVP phase**: Architecture constraints must be followed, implementation in Phase 2

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

Located in `frontend/src/lib/db/schema/` with core tables:
- `users`, `user_calibration` - User and calibration
- `tasks`, `habits`, `habit_logs`, `timeboxes` - Domain objects
- `objectives`, `key_results` - OKR objects
- `reviews` - Review objects
- `timebox_tasks`, `timebox_habits` - Junction tables
- `context_snapshots`, `system_events`, `action_surfaces`, `derived_signals` - System tables
- `energy_logs` - Energy calibration logs

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
- Target: Complete planning and MVP by 2026-03-31
- Key metrics: Daily usage, 2+ meaningful tasks/day, 85% AI accuracy, 60% weekly closure rate

---

## Documentation

### 文档归属模型

| 归属层 | 目录 | 维护者 |
|---|---|---|
| 第一层：用户所有 | `mydocs/` | 用户编辑，Claude 只读 |
| 第二层：协同维护 | `docs/` | 用户定义意图，Claude 保证与代码一致 |
| 第三层：Claude 自动维护 | 根目录 + `.specify/` | Claude 维护，用户审批 |

完整索引见 `manifest.md`（项目根目录）。

### 第一层：用户所有 (`mydocs/`)

| Document | Location | Purpose |
|---|---|---|
| 项目开发必读 | `mydocs/core/` | Product vision and decisions |
| 总体设计 | `mydocs/core/` | Architecture design |
| 技术栈设计演进 | `mydocs/core/` | Tech stack evolution |
| 意图驱动场景示例 | `mydocs/core/` | Intent-driven scenario examples |


### 第二层：协同维护 (`docs/`)

| Document | Purpose |
|---|---|
| `docs/usom-design.md` | USOM object definitions |
| `docs/database-design.md` | Database schema design |
| `docs/UI-DESIGN-SPEC.md` | Visual & interaction design specification |

**Document Update Rule**: 以上文档若有修改, **MUST** 更新 `manifest.md` 版本历史记录。

---

## Environment Setup

1. Configure `.env.local` with DATABASE_URL
2. Start PostgreSQL: `docker-compose up -d`
3. Run migrations: `npm run db:migrate`
4. Start dev server: `npm run dev`

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/009-ai-runtime-upgrade/plan.md`.
<!-- SPECKIT END -->


## Coding Guidelines

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
