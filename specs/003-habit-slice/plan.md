# Implementation Plan: 习惯管理切片

**Branch**: `003-habit-slice` | **Date**: 2026-05-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-habit-slice/spec.md`

## Summary

习惯管理切片为 Lifeware 提供习惯库管理、习惯模板与每日计划、AI 意图解析、打卡追踪（streak）等完整功能。基于 Nexus 四层架构（USOM → Nexus → Domain → Bridge），使用 Repository Pattern 隔离数据层，Domain Plugin 四钩子模型保持习惯域的被动性。

**已实现**: Bug 修复（[001]-[005]）、US4（指标自动计算）、US5（习惯库列表优化）、US6（卡片布局与交互优化）、US7（模板编辑与删除）

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3
**Primary Dependencies**: Next.js 16.1.6, Drizzle ORM 0.45.1, shadcn/ui, Tailwind CSS 4
**Storage**: PostgreSQL (Docker Compose), Drizzle Kit for migrations
**Testing**: Vitest
**Target Platform**: Web (MVP 阶段仅 Web 端)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: streak 指标 1 秒内完成更新，习惯库页面即时加载
**Constraints**: Repository Pattern（Nexus 不直接访问 Drizzle）、Domain Plugin 被动性（不直接写状态）、USOM 文档优先于代码
**Scale/Scope**: 单用户桌面端 Web 应用，习惯数量 < 100

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Intent-Driven | ✅ PASS | 所有写操作通过 Intent Engine / Server Actions |
| II. Energy-First | ⬜ N/A | 本切片不涉及能量调度 |
| III. Single-Writer | ✅ PASS | State Machine 管理状态转换，Repository 管理持久化 |
| IV. USOM Sovereignty | ✅ PASS | USOM 类型定义在 `usom/types/objects.ts`，文档优先 |
| V. Repository Isolation | ✅ PASS | 所有 DB 访问通过 Repository 接口，UI 仅接收 USOM 对象 |
| VI. Domain Passivity | ✅ PASS | Domain onEvent 返回 metrics 标记，Orchestrator 持久化 |
| VII. Bridge Readiness | ✅ PASS | Server Actions 封装 Nexus 调用，无 HTTP 上下文依赖 |
| VIII. AI/Rule Boundary | ⬜ N/A | [010] 不涉及 AI 解析 |

**Post-design check**: 修复仅涉及 Orchestrator 层时间拼接逻辑，不改变架构模式。

## Project Structure

### Documentation (this feature)

```text
specs/003-habit-slice/
├── spec.md              # 功能规格
├── plan.md              # 本文件
├── research.md          # 技术决策研究
├── data-model.md        # 数据模型定义
├── quickstart.md        # 验证指南
├── checklists/          # 质量检查清单
│   └── requirements.md
└── tasks.md             # 任务列表
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── habit-card.tsx              # US6: 网格布局样式 + 删除确认 + 激活按钮
│   ├── habit-list.tsx              # US6: 网格容器 + 响应式
│   ├── habit-library-view.tsx      # US6: 删除确认 AlertDialog
│   ├── habit-template-card.tsx     # US7: 编辑/删除按钮
│   ├── habit-template-form.tsx     # US7: 编辑模式 + 自动填充
│   └── habit-template-manager.tsx  # US7: 模板管理
├── hooks/
│   ├── use-habits.ts               # 习惯 Hook
│   └── use-templates.ts            # US7: 模板 Hook
├── app/actions/
│   └── intent.ts                   # US7: updateTemplate/deleteTemplate
├── nexus/orchestrator/index.ts     # [010] BUG: 时区拼接错误
├── lib/db/repositories/
│   ├── habit.repository.ts         # 习惯仓库
│   └── habit-template.repository.ts # 模板仓库
└── domains/habits/
    ├── index.ts                    # Domain Plugin
    └── streak-calculator.ts        # 纯函数 streak 计算
```

## Complexity Tracking

无需额外复杂度说明。

---

## Phase A-E: 已完成 (T001-T067)

- Phase A: Bug 修复与迁移 [001]-[005] ✅
- Phase B: US4 打卡指标自动计算 ✅
- Phase C: US5 习惯库列表优化 ✅
- Phase D: US6 卡片布局与交互优化 ✅
- Phase E: US7 模板编辑与删除 ✅

---

## Phase F: [010] 时区错位 Bug 修复 (NEW)

**Requirements**: 修复"用习惯模板安排今天"时，时间被错误转换为 UTC 的问题
**Root Cause**: `orchestrator/index.ts` 第 472-473 行将本地时间 HH:MM 拼接了 `Z`（UTC）后缀，而非 `+08:00`（本地时区）
**Impact**: 07:30 本地时间被存为 UTC 07:30 → 前端显示为 15:30（偏移 8 小时）

### F1: 修复时间拼接（核心修复）

**涉及文件**:
- `frontend/src/nexus/orchestrator/index.ts` — 第 472-473 行

**方案**: 将 `Z` 后缀改为 `+08:00`，与 `template-parser.ts` 的 `toISO8601()` 函数保持一致。

```typescript
// 修复前（错误）:
startTime: `${date}T${startTime}:00Z` as Timestamp,
endTime: `${date}T${endTime}:00Z` as Timestamp,

// 修复后（正确）:
startTime: `${date}T${startTime}:00+08:00` as Timestamp,
endTime: `${date}T${endTime}:00+08:00` as Timestamp,
```

### F2: 修复幂等性检查的时区范围

**涉及文件**:
- `frontend/src/nexus/orchestrator/index.ts` — 第 428-429 行

**方案**: 同样将 `Z` 改为 `+08:00`，确保查询范围是本地时间的全天。

```typescript
// 修复前（错误 - UTC 范围不等于本地范围）:
const dayStart = `${date}T00:00:00Z` as Timestamp
const dayEnd = `${date}T23:59:59Z` as Timestamp

// 修复后（正确 - 本地时间范围）:
const dayStart = `${date}T00:00:00+08:00` as Timestamp
const dayEnd = `${date}T23:59:59+08:00` as Timestamp
```

### 验证

1. 创建一个模板，添加一个 defaultTime=07:30 的习惯
2. 点击"用模板安排今天"
3. 确认生成的时间盒开始时间为 07:30（而非 15:30）

---

## Dependencies & Execution Order

```
Phase F: F1 → F2（同一文件，顺序执行）
```

无外部依赖，可立即开始。约 5-10 分钟。

## Implementation Strategy

### 建议执行顺序

1. Phase F (T070-T071): 时区修复 — ~10 分钟
2. 集成验证 — ~5 分钟

### 长期规划

MVP 阶段硬编码 `+08:00`。Phase 2 Bridge Layer 实现时，应从用户侧传入时区偏移量（通过 Intl.DateTimeFormat 或类似 API 获取），替换硬编码值。
