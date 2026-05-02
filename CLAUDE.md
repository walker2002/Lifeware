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
The system brain with four main components:
- **Intent Engine**: Parses user input (AI-driven with template-form fallback)
- **Rule Engine**: Validates proposals and detects conflicts
- **State Machine**: Manages object lifecycles
- **Action Surface Engine**: Determines UI actions (Action Guide, Dynamic Tile, Continuity Cue)
- Location: `frontend/src/nexus/`

### 3. Domain Plugins
Extensible domain-specific logic with standard interface (four hooks):
- `onValidate`: Intent validation
- `onEvent`: Event response, returns metrics and suggestions
- `onActionSurfaceRequest`: Returns action surface candidates
- `onOutboundRequest`: Outbound push declarations (not implemented in MVP)
- Location: `frontend/src/domains/`

### 4. Bridge Layer (Phase 2)
- External access layer via standard protocols (REST API, MCP Server, Webhook/SSE)
- **MVP phase**: Architecture constraints must be followed, implementation in Phase 2

---

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
| 方法论落地设计规范 | `mydocs/methodology/` | Methodology implementation |
| 场景提示词设计方案 | `mydocs/methodology/` | Scenario prompt design |
| 冲突仲裁矩阵 | `mydocs/methodology/` | Conflict arbitration rules |

### 第二层：协同维护 (`docs/`)

| Document | Purpose |
|---|---|
| `docs/usom-design.md` | USOM object definitions |
| `docs/database-design.md` | Database schema design |

**Document Update Rule**: After updating any document, **MUST** update `manifest.md` version history.

---

## Environment Setup

1. Configure `.env.local` with DATABASE_URL
2. Start PostgreSQL: `docker-compose up -d`
3. Run migrations: `npm run db:migrate`
4. Start dev server: `npm run dev`

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
