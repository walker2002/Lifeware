# Implementation Plan: 时间盒管理优化

**Branch**: `002-timebox-slice` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-timebox-slice/spec.md` + `mydocs/dev/001-时间盒管理优化 202605-01.md`

## Summary

基于已完成的 Nexus 管道（Intent Engine → Rule Engine → State Machine → EventBus → Action Surface Engine），本次优化聚焦于两个方面：

1. **界面调整**：将 Dynamic Tile 从左侧 AI 面板移至 MainContent 上方；MainContent 新增两种展示模式——今日模式（左列时间盒列表 + 右列可视化时间轴）和日历模式（完整日历组件）。
2. **详细运行日志**：设计一个可配置的运行追踪系统，记录 Nexus 管道中每个组件的输入/输出、状态机转换详情，用于调试和系统行为验证。

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3
**Primary Dependencies**: Next.js 16.1.6, Tailwind CSS 4, shadcn/ui, Drizzle ORM 0.45.1
**Storage**: PostgreSQL (已有 schema)
**Testing**: Vitest（已有配置）
**Target Platform**: Web (桌面端 + 移动端响应式)
**Project Type**: Web application
**Performance Goals**: 页面加载 < 1s，时间轴渲染流畅（60fps）
**Constraints**: 不得违反 Constitution 任何约束（Repository Pattern、Domain Passivity 等）
**Scale/Scope**: MVP 单用户，约 50 个时间盒/天

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constraint | Status | Notes |
|---|---|---|
| I. Intent-Driven | PASS | 无新写入路径，仅界面调整和日志追踪 |
| II. Energy-First | PASS | 日志系统不涉及能量校验逻辑 |
| III. Single-Writer | PASS | 日志追踪为只读观察，不修改任何状态 |
| IV. USOM Sovereignty | PASS | 不引入新 USOM 对象 |
| V. Repository Isolation | PASS | 不修改 Repository 层 |
| VI. Domain Passivity | PASS | 不修改 Domain 插件 |
| VII. Bridge Layer | PASS | 无 Bridge Layer 变更 |
| VIII. AI/Rule Boundary | PASS | 日志系统不涉及 AI/Rule 边界 |
| R-01~R-04 | PASS | 不修改数据库访问模式 |
| T-01~T-04 | PASS | 不修改多租户模式 |
| Orchestrator Purity | PASS (re-checked) | 日志追踪通过 `onTrace` 回调注入，Orchestrator 仅在各步骤调用回调，不包含日志处理逻辑 |

**结论**：所有约束通过。日志追踪通过观察者模式（`onTrace` 回调 + EventBus 订阅）实现，不侵入 Orchestrator 的纯调度器角色。回调注册在 Server Action 层完成，不在 Orchestrator 内部。

## Project Structure

### Documentation (this feature)

```text
specs/002-timebox-slice/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── app/
│   ├── page.tsx                          # 修改：重构 MainContent 区域
│   ├── actions/intent.ts                 # 修改：接入日志追踪
│   └── globals.css                       # 可能修改：新增时间轴样式
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx                 # 修改：Tiles 上移到 TopNav 下方
│   │   ├── main-content.tsx              # 不变（模式切换逻辑在 page.tsx 中处理）
│   │   ├── ai-panel.tsx                  # 修改：移除 DynamicTile 区域
│   │   └── top-nav.tsx                   # 修改：添加 onSettingsClick prop（追踪日志开关入口）
│   ├── timebox/
│   │   ├── timebox-timeline.tsx          # 新增：可视化时间轴组件
│   │   ├── today-view.tsx                # 新增：今日模式（列表+时间轴）
│   │   ├── calendar-view.tsx             # 新增：日历模式
│   │   └── view-mode-toggle.tsx          # 新增：模式切换控件
│   ├── dynamic-tile.tsx                  # 不变
│   ├── timebox-list.tsx                  # 修改：适配今日模式左列布局
│   ├── timebox-card.tsx                  # 修改：显示更多字段（时长、状态详情）
│   ├── intent-input.tsx                  # 不变
│   └── intent-form.tsx                   # 不变
├── nexus/
│   ├── infrastructure/
│   │   └── trace-logger/
│   │       ├── index.ts                  # 新增：日志追踪核心
│   │       └── trace-types.ts            # 新增：追踪类型定义
│   ├── orchestrator/
│   │   └── index.ts                      # 修改：接入日志追踪回调
│   └── ... (其他不变)
├── lib/
│   └── config/
│       └── trace-config.ts              # 新增：日志开关配置
└── usom/                                 # 不变
```

**Structure Decision**: 在现有 `frontend/` 目录结构上扩展。新增 `components/timebox/` 子目录放置时间盒视图组件，新增 `nexus/infrastructure/trace-logger/` 放置日志追踪。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | — | — |
