# Implementation Plan: US12 全宽模式修正

**Branch**: `002-timebox-slice` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: 用户截图反馈 — 日视图三栏集中在中间，两侧大量空白，卡片拥挤

## Summary

US12 已实现的可收起侧边栏（AppShell Flexbox 布局）结构正确，但 `MainContent` 组件中的 `max-w-[960px] mx-auto` 将内容宽度硬限制为 960px 居中，导致主内容区无法如 spec 要求填充可用宽度。修正方案：移除 MainContent 的宽度约束，并确保日/周/月视图正确响应全宽。

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.3, Next.js 16.1.6
**Primary Dependencies**: Tailwind CSS 4, shadcn/ui
**Storage**: N/A（纯前端布局修复）
**Testing**: 浏览器视觉验证
**Target Platform**: Web 端（桌面 >=768px）
**Project Type**: Web 前端
**Performance Goals**: 布局过渡 300ms 内完成，无闪烁
**Constraints**: 仅桌面端受影响，移动端保持 Sheet 抽屉模式不变
**Scale/Scope**: 5 个文件修改，纯 CSS/Tailwind 变更

## Root Cause Analysis

```
AppShell (.grid.h-screen ...)
  └─ Desktop Row (.hidden.md:flex) → 主内容区 flex-1 ✓ 正确
      └─ MainContent (main.flex-1.min-w-0.overflow-y-auto)
          └─ <div className="mx-auto max-w-[960px]">  ← 根因！
              └─ {children} → 日/周/月视图被限制在 960px 内
```

AppShell 的 Flexbox 可收起侧边栏结构（`flex-1` + `transition-all duration-300`）工作正常。问题只在于 `MainContent` 内部加了一个 `max-w-[960px] mx-auto` 的容器，把内容"锁"在 960px 以内居中。

## Constitution Check

*GATE: 纯 CSS/布局修复，不涉及架构变更，无违规。*

## Fix Plan

### Phase 0: Research — 宽度约束策略

**Decision**: 移除 `max-w-[960px]`，改用 `w-full max-w-none`，让内容撑满 flex 容器
**Rationale**: FR-020 要求"主内容区自动填充剩余宽度"，FR-024 要求视图"充分利用可用空间"。960px 限制直接违反这两个需求。
**Alternatives**: 
- 改为 `max-w-[1440px]` — 仍有浪费
- 改为 `max-w-[1800px]` — 2K/4K 屏幕上合理，但不符合"完全全宽"
- 直接移除（采用）— 符合 spec，日视图三栏百分比自动分配

### Phase 1: 实现变更

#### 1.1 MainContent — 移除宽度约束（PRIMARY）

**文件**: `frontend/src/components/layout/main-content.tsx`

```diff
- <div className="mx-auto max-w-[960px]">{children}</div>
+ <div className="w-full">{children}</div>
```

#### 1.2 DayView — 确保三栏填满可用宽度

**文件**: `frontend/src/components/timebox/day-view.tsx`

三栏百分比 `grid-template-columns: 30% 40% 30%` 在全宽下会正常分配。但需要确保 grid 容器本身为 `w-full`：

```diff
- <div className="grid gap-4 md:[grid-template-columns:30%_40%_30%] max-md:grid-cols-1">
+ <div className="grid w-full gap-4 md:[grid-template-columns:30%_40%_30%] max-md:grid-cols-1">
```

#### 1.3 WeekView — 确保日历填满容器

**文件**: `frontend/src/components/timebox/week-view.tsx`

```diff
- <div className="rounded-lg border border-hairline bg-surface-card p-4">
+ <div className="w-full rounded-lg border border-hairline bg-surface-card p-4">
```

#### 1.4 MonthView — 确保日历填满容器

**文件**: `frontend/src/components/timebox/month-view.tsx`

```diff
- <div className="rounded-lg border border-hairline bg-surface-card p-4">
+ <div className="w-full rounded-lg border border-hairline bg-surface-card p-4">
```

#### 1.5 页面容器 — 添加 w-full

**文件**: `frontend/src/app/page.tsx`

```diff
- <div className="flex flex-col gap-4">
+ <div className="flex w-full flex-col gap-4">
```

### 预期效果

| 状态 | 主内容区可用宽度 | 之前 (960px) | 修复后 |
|------|-----------------|-------------|--------|
| 面板展开 | ~1440px (1920-320-留白) | 960px 居中 | 1440px 填满 |
| 面板收起 | ~1760px (1920-留白) | 960px 居中 | 1760px 填满 |
| 日视图左栏 | — | ~288px (30%) | ~432px (30% of 1440) |
| 日视图中栏 | — | ~384px (40%) | ~576px (40% of 1440) |
| 日视图右栏 | — | ~288px (30%) | ~432px (30% of 1440) |
