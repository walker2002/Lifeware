# Implementation Plan: OKR 管理增强 (004-okr-core)

**Branch**: `004-okr-core` | **Date**: 2026-05-11 (updated 2026-05-11) | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification + enhancement design `docs/superpowers/specs/2026-05-11-okr-enhancement-design.md`
**Base**: 004a-okr-core 基础实现已完成 (T001-T044)，本计划为追加增强 + UI 优化

## Summary

在已完成的 OKR 核心管理基础上，修复 3 个 Bug，新增目标编号/重要程度/半年度周期字段，将 UI 从列表+详情页模式重设计为双栏联动工作区（OKRWorkspace），修复 KR 添加/删除后不即时显示的 Bug，并优化右栏面板占满屏幕宽度。

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3
**Primary Dependencies**: Next.js 16.1.6, Drizzle ORM 0.45.1, shadcn/ui, Tailwind CSS 4
**Storage**: PostgreSQL (Drizzle ORM)
**Testing**: Vitest (领域插件单元测试)
**Target Platform**: Web (MVP)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: 编辑保存后局部更新 < 1s，编号生成无延迟
**Constraints**: Repository Pattern (R-01~R-04), Multi-Tenancy (T-01~T-04), Tier 2 文档同步
**Scale/Scope**: 单用户 MVP，~20 个文件变更

## Constitution Check

| 约束 | 状态 | 说明 |
|------|------|------|
| I. Intent-Driven | PASS | 状态转换仍走 Orchestrator，新增编号生成在 Repository 层 |
| III. Single-Writer | PASS | 状态写入仍通过 State Machine，无绕过 |
| IV. USOM Sovereignty | PASS | 新增字段先更新 USOM 文档再改代码 |
| V. Repository Isolation | PASS | 新增 findAll 方法在 Repository 接口层 |
| VI. Domain Passivity | PASS | 领域插件不变 |
| VII. Bridge Readiness | PASS | 无 HTTP 上下文依赖 |
| T-01~T-04 Multi-Tenancy | PASS | findAll 和编号生成均包含 userId 过滤 |
| R-01~R-04 Repository Pattern | PASS | UI 不直接调用 Drizzle |
| Tier 2 文档同步 | PASS | USOM/DB 变更先更新 docs/ |

**Result**: ALL GATES PASS.

## Enhancement Phases

### Phase A: Bug 修复（已实施 T045-T049）

| ID | Bug | 修复范围 |
|----|-----|----------|
| B1 | "全部"筛选只显示"进行中" | `irepository.ts` 新增 findAll, `objective.repository.ts` 实现, `actions/okr.ts` 调用 findAll |
| B2 | 编辑草稿 OKR 时 KR 空白 | `okr-detail.tsx` 编辑模式传入 keyResults 到 OKRForm initial prop |
| B3 | 编辑返回后列表空白 | `use-okrs.ts` 重构为局部更新模式 |

### Phase B: 数据模型扩展（已实施 T050-T059）

| 变更 | 文件 |
|------|------|
| PeriodType 新增 SemiAnnual | `usom/types/primitives.ts` |
| Objective 新增 objectiveNumber/priority | `usom/types/objects.ts` |
| schema objectives 新增列 | `lib/db/schema.ts` |
| Mapper 新增字段映射 | `lib/db/repositories/mappers.ts` |
| Repository 编号生成 | `lib/db/repositories/objective.repository.ts` |
| 数据库迁移 | `lib/db/migrations/0004_okr_enhance.sql` |
| Tier 2 文档同步 | `docs/usom-design.md`, `docs/database-design.md` |

### Phase C: UI 重设计（已实施 T060-T071）

| 变更 | 文件 |
|------|------|
| OKRWorkspace 双栏容器 | `components/okr/okr-workspace.tsx` |
| OKRDirectory 左栏目录 | `components/okr/okr-directory.tsx` |
| OKRPanel 右栏面板 | `components/okr/okr-panel.tsx` |
| OKRForm 新增字段 + 周期自动填充 | `components/okr/okr-form.tsx` |
| ObjectiveCard 编号/优先级显示 | `components/okr/objective-card.tsx` |
| 确认弹窗（AlertDialog） | `components/okr/okr-detail.tsx`, `okr-panel.tsx` |
| useOKRs hook 适配 | `hooks/use-okrs.ts` |
| 页面入口更新 | `app/page.tsx` |

### Phase D: UI 优化（新增 FR-031~FR-033）

**来源**: `mydocs/dev/当前开发内容.md` [003] 和 [004]

| ID | 需求 | 修复范围 |
|----|------|----------|
| FR-031 | KR 添加后即时显示 | `okr-panel.tsx` 添加 KR 成功后重新加载详情数据 |
| FR-032 | KR 删除后即时消失 | `okr-panel.tsx` 删除 KR 成功后重新加载详情数据 |
| FR-033 | 右栏占满屏幕宽度 | `okr-workspace.tsx` 移除 OKRPanel 内部 max-width 约束，或调整布局 |

## Dependency Order

```
Phase A (Bug 修复) → Phase B (数据模型) → Phase C (UI 重设计) → Phase D (UI 优化)
```

- Phase D 依赖 Phase C 完成（需要 OKRPanel 和 OKRWorkspace 已存在）
- Phase D 内部：FR-033（布局）和 FR-031/FR-032（即时刷新）可并行

## Complexity Tracking

无违规需要记录。
