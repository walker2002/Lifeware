# Implementation Plan: 时间盒管理优化

**Branch**: `002-timebox-slice` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-timebox-slice/spec.md` + `mydocs/dev/001-时间盒管理优化 202605-01.md` + `mydocs/dev/001-时间盒管理优化 202605-02.md`

## Summary

基于已完成的 Nexus 管道（Intent Engine → Rule Engine → State Machine → EventBus → Action Surface Engine），本次优化聚焦于三个方面：

1. **界面调整**：将 Dynamic Tile 从左侧 AI 面板移至 MainContent 上方（TilesBanner）。
2. **三栏时间盒视图**：取代"今日模式/日历模式"切换，主内容区统一为日/周/月三模式视图。日视图三栏（左列表 + 中间时间轴 + 右侧日历），顶部日期导航支持翻页和模式切换。
3. **详细运行日志**：可配置的运行追踪系统，记录 Nexus 管道中每个组件的输入/输出，用于调试和系统行为验证。

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3
**Primary Dependencies**: Next.js 16.1.6, Tailwind CSS 4, shadcn/ui, Drizzle ORM 0.45.1, react-big-calendar, date-fns
**Storage**: PostgreSQL (已有 schema)
**Testing**: Vitest（已有配置）
**Target Platform**: Web (桌面端 + 移动端响应式)
**Project Type**: Web application
**Performance Goals**: 页面加载 < 1s，视图切换 < 1s，时间轴渲染流畅（60fps）
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
| Orchestrator Purity | PASS | 日志追踪通过 `onTrace` 回调注入，Orchestrator 仅在各步骤调用回调，不包含日志处理逻辑 |

**结论**：所有约束通过。

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
│   ├── page.tsx                          # 修改：重构 MainContent 为三栏视图
│   ├── actions/intent.ts                 # 修改：接入日志追踪 + 日期范围查询
│   └── globals.css                       # 不变
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx                 # 修改：Tiles 上移到 TopNav 下方
│   │   ├── tiles-banner.tsx              # 已完成：全宽 Tiles 横幅
│   │   ├── ai-panel.tsx                  # 不变
│   │   └── top-nav.tsx                   # 修改：添加 onSettingsClick prop
│   ├── timebox/
│   │   ├── types.ts                      # 修改：ViewMode 扩展为 'day'|'week'|'month'
│   │   ├── date-nav.tsx                  # 新增：日期导航栏（日/周/月切换 + 翻页）
│   │   ├── day-view.tsx                  # 新增：日视图三栏（列表 + 时间轴 + 日历）
│   │   ├── week-view.tsx                 # 新增：周视图（周日历时间表格）
│   │   ├── month-view.tsx                # 新增：月视图（月日历网格）
│   │   ├── timebox-timeline.tsx          # 已完成：可视化时间轴
│   │   ├── mini-calendar.tsx             # 新增：月历小日历（日视图右侧）
│   │   ├── view-mode-toggle.tsx          # 删除：被 date-nav.tsx 取代
│   │   ├── today-view.tsx                # 删除：被 day-view.tsx 取代
│   │   └── calendar-view.tsx             # 重构：拆分为 week-view + month-view
│   ├── timebox-card.tsx                  # 已完成：compact 模式
│   ├── timebox-list.tsx                  # 已完成：compact 模式
│   ├── trace-panel.tsx                   # 已完成：底部调试面板
│   ├── intent-input.tsx                  # 不变
│   └── intent-form.tsx                   # 不变
├── nexus/
│   ├── infrastructure/
│   │   └── trace-logger/
│   │       ├── index.ts                  # 已完成：日志追踪核心
│   │       └── trace-types.ts            # 已完成：追踪类型定义
│   ├── orchestrator/
│   │   └── index.ts                      # 已完成：onTrace 回调
│   └── ... (其他不变)
├── lib/
│   └── config/
│       └── trace-config.ts              # 已完成：日志开关配置
└── usom/                                 # 不变
```

**Structure Decision**: 在现有目录结构上扩展。三栏视图组件放在 `components/timebox/` 子目录，复用已有的 timebox-timeline、timebox-card、timebox-list 组件。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | — | — |
