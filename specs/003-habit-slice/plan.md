# Implementation Plan: 习惯管理切片

**Branch**: `003-habit-slice` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-habit-slice/spec.md`
**Design Ref**: `docs/superpowers/specs/2026-05-09-habit-management-design.md`

## Summary

习惯管理切片为 Lifeware 新增个人每日习惯的定义、模板编排和每日计划生成能力。用户通过习惯库管理可追踪/纯占时两类习惯，通过习惯模板将习惯组装为场景化方案（工作日/休息日），一键生成每日时间盒计划。功能遵循 Nexus 四层架构，通过 habits 域插件（四钩子）与系统深度集成。分三阶段实施：P1 习惯库基础 → P2 模板系统 → P3 AI/Streak 高级功能。

## Technical Context

**Language/Version**: TypeScript 5
**Primary Dependencies**: Next.js 16.1.6, React 19.2.3, Drizzle ORM 0.45.1, Tailwind CSS 4, shadcn/ui
**Storage**: PostgreSQL (Drizzle ORM)
**Testing**: Vitest
**Target Platform**: Web (MVP only)
**Project Type**: Web application (Nexus 四层架构)
**Performance Goals**: 习惯库列表加载 < 500ms，模板生成每日计划 < 1s
**Constraints**: 遵循 Constitution 所有架构约束（Repository 隔离、域插件被动性、USOM 主权等）
**Scale/Scope**: 单用户 MVP，习惯数 < 50，模板数 < 10

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Intent-Driven | ✅ PASS | 习惯创建/打卡/模板操作均通过 Intent Engine |
| II. Energy-First | ✅ PASS | 习惯时间安排需验证精力兼容性（Phase 2 规则引擎） |
| III. Single-Writer | ✅ PASS | State Machine 独占习惯状态写入 |
| IV. USOM Sovereignty | ✅ PASS | Habit/HabitTemplate 类型先定义于 USOM 文档，再映射到 schema |
| V. Repository Isolation | ✅ PASS | Habit Repository 封装 Drizzle，输入输出为 USOM 对象 |
| VI. Domain Passivity | ✅ PASS | habits 域插件仅实现四钩子，不写状态 |
| VII. Bridge Readiness | ✅ PASS | Nexus 方法签名不依赖 HTTP 上下文 |
| VIII. AI/Rule Boundary | ✅ PASS | AI 仅参与意图解析，规则引擎处理冲突检测 |
| T-01~T-04 Multi-Tenancy | ✅ PASS | habits/habit_templates/template_habits 均含 user_id |
| R-01~R-04 DB Access | ✅ PASS | Nexus 不直接调用 Drizzle，通过 Repository |
| JSONB 规范 | ✅ PASS | applicableDays 用 JSONB（配置型），时间字段用独立列 |

## Project Structure

### Documentation (this feature)

```text
specs/003-habit-slice/
├── plan.md              # 本文件
├── spec.md              # 功能规格
├── research.md          # Phase 0 研究输出
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速上手
├── contracts/           # Phase 1 接口契约
│   ├── habit-domain.md
│   └── template-generation.md
├── checklists/
│   └── requirements.md  # 质量检查清单
└── tasks.md             # Phase 2 任务（/speckit-tasks 生成）
```

### Source Code (repository root)

```text
frontend/src/
├── lib/db/
│   ├── schema.ts                          # habits 表扩展 + 新增 habit_templates/template_habits
│   ├── migrations/                        # Drizzle migration SQL
│   └── repositories/
│       ├── habit.repository.ts            # NEW: Habit CRUD + mapper
│       ├── habit-template.repository.ts   # NEW: Template CRUD + mapper
│       └── mappers.ts                     # 扩展: Habit/Template DB↔USOM 映射
├── usom/types/
│   ├── objects.ts                         # 扩展: Habit 类型 + 新增 HabitTemplate/TemplateHabitItem
│   └── summaries.ts                      # 扩展: HabitSummary 增加 trackable/defaultTime
├── domains/habits/
│   ├── index.ts                           # NEW: 四钩子实现
│   ├── manifest.yaml                      # NEW: 域插件声明
│   └── __tests__/
│       └── habit-domain.test.ts           # NEW: 域插件测试
├── nexus/core/
│   ├── intent-engine/ai-parser.ts         # 扩展: habit 意图解析
│   ├── rule-engine/rules/habit-conflict.ts # NEW: 习惯冲突检测规则
│   ├── state-machine/transitions.ts       # 扩展: habit 状态转换
│   └── orchestrator/index.ts              # 扩展: habit 意图分发
├── components/
│   ├── habit-card.tsx                     # NEW: 习惯卡片组件
│   ├── habit-list.tsx                     # NEW: 习惯库列表
│   ├── habit-form.tsx                     # NEW: 习惯创建/编辑表单
│   ├── habit-template-view.tsx            # NEW: 模板对比视图（纵向时间轴）
│   └── habit-template-card.tsx            # NEW: 模板卡片
├── hooks/
│   └── use-habits.ts                      # NEW: 习惯数据 hook
└── app/
    └── actions/
        └── intent.ts                      # 扩展: habit 相关 Server Actions
```

**Structure Decision**: 遵循现有项目结构。habits domain 空目录已存在，在其内实现。UI 组件放在 components/ 根目录（与 timebox-card.tsx 等一致）。

## Complexity Tracking

无违规需要记录。所有设计均符合 Constitution 约束。
