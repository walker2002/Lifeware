# UI Layout Contract

**Feature**: 002-timebox-slice
**Date**: 2026-05-06（更新）

## 概述

Lifeware 界面框架，基于 Notion 风格两栏布局 + DESIGN.md 设计令牌体系。
2026-05-06 更新：Tiles 上移至 TopNav 下方横幅区域；MainContent 支持 Today/Calendar 双模式。

## 布局结构

```
┌─────────────────── TopNav (64px) ───────────────────┐
│  [Logo] Lifeware                [图标导航] [设置⚙]  │
├──────────── TilesBanner (全宽, 条件渲染) ───────────┤
│  DynamicTile[] (行动提示磁贴)                        │
├────────────┬────────────────────────────────────────┤
│  AiPanel   │  MainContent                           │
│  (320px)   │  (flex-1, min-width: 0)                │
│            │                                        │
│  输入区    │  [今日模式 | 日历模式] ← ViewModeToggle │
│  表单区    │                                        │
│            │  ── 今日模式 ──                         │
│            │  ┌─────────┬──────────────────┐        │
│            │  │ 列表    │  可视化时间轴     │        │
│            │  │ (50%)   │  (50%)           │        │
│            │  └─────────┴──────────────────┘        │
│            │                                        │
│            │  ── 日历模式 ──                         │
│            │  ┌────────────────────────────┐        │
│            │  │  CalendarView              │        │
│            │  │  (月/周/日视图)             │        │
│            │  └────────────────────────────┘        │
├────────────┴────────────────────────────────────────┤
├─────── TracePanel (底部可折叠, 默认隐藏) ────────────┤
│  调用链步骤列表 (可展开查看 I/O)                      │
└─────────────────────────────────────────────────────┘
```

## 设计令牌映射

### 颜色（DESIGN.md → Tailwind CSS 变量）

| 令牌 | 值 | Tailwind 用途 |
|---|---|---|
| canvas | #faf9f5 | `--color-background`（页面背景） |
| ink | #141413 | `--color-foreground`（主文本） |
| primary | #cc785c | `--color-primary`（按钮、链接） |
| primary-active | #a9583e | `--color-primary-hover` |
| surface-card | #efe9de | `--color-card`（卡片背景） |
| surface-dark | #181715 | `--color-surface-dark` |
| muted | #6c6a64 | `--color-muted`（次要文本） |
| hairline | #e6dfd8 | `--color-border`（边框） |
| success | #5db872 | `--color-success` |
| warning | #d4a017 | `--color-warning` |
| error | #c64545 | `--color-destructive` |

### 字体

| 用途 | 字体栈 | Tailwind class |
|---|---|---|
| Display（h1-h3） | Cormorant Garamond, serif | `font-display` |
| Body（正文、UI） | Inter, sans-serif | `font-body` |
| Code | JetBrains Mono, monospace | `font-code` |

### 圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| md | 8px | 按钮、输入框 |
| lg | 12px | 卡片 |
| pill | 9999px | Badge、Tag |

## 响应式断点

| 断点 | 宽度 | 布局变化 |
|---|---|---|
| Desktop | ≥ 768px | 两栏：左 320px + 右 flex |
| Mobile | < 768px | 单栏：AI 面板折叠为 Sheet 抽屉 |

## 组件合约

### TopNav

```typescript
interface TopNavProps {
  onMenuClick?: () => void
  onSettingsClick?: () => void  // 新增：设置按钮回调
}
// 固定高度 64px, 背景 canvas, 底部 hairline 边框
// 右侧新增设置按钮，控制追踪日志面板开关
```

### TilesBanner（新增）

```typescript
interface TilesBannerProps {
  candidates: ActionCandidate[]  // USOM 类型（R-04）
}
// 全宽横幅区域，位于 TopNav 下方、两栏 Grid 上方
// candidates 为空时不渲染
// 背景 surface-soft, 内部 padding: 12px 16px
// 水平滚动展示多个 Tile
```

### AiPanel

```typescript
interface AiPanelProps {
  children: React.ReactNode  // 输入框 + 表单（不再包含 Tiles）
}
// 固定宽度 320px (desktop), 全屏 Sheet (mobile)
// 右侧 hairline 分隔线
// 内部 padding: 16px
```

### MainContent

```typescript
interface MainContentProps {
  children: React.ReactNode  // ViewModeToggle + 视图内容
}
// flex-1, padding: 24px
// 最大内容宽度 960px 居中
```

### ViewModeToggle（新增）

```typescript
type ViewMode = 'today' | 'calendar'

interface ViewModeToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
}
// 类别标签切换样式（DESIGN.md category-tab）
// 两个选项：今日模式、日历模式
```

### TodayView（新增）

```typescript
interface TodayViewProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
}
// CSS Grid 两栏布局（各 50%）
// 左列：TimeboxList（列表视图，显示开始时间、时长、状态、标题）
// 右列：TimeboxTimeline（可视化时间轴）
// 移动端折叠为单栏（时间轴在下）
```

### TimeboxTimeline（新增）

```typescript
interface TimeboxTimelineProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
}
// 垂直时间轴组件
// 左侧：时间刻度（06:00-23:00）
// 右侧：时间盒色块（宽度=时长，位置=开始时间）
// 色块颜色：planned=hairline, running=primary, paused=warning, ended=muted, logged=success
// 当前时间指示线
```

### CalendarView（新增）

```typescript
interface CalendarViewProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
}
// 基于 react-big-calendar 的日历组件
// 支持月/周/日视图切换
// 事件块使用项目设计令牌颜色
// 高度至少 500px
```

### TimeboxCard（更新）

```typescript
interface TimeboxCardProps {
  timebox: TimeboxSummary  // USOM 类型（R-04）
  compact?: boolean  // 新增：紧凑模式（用于今日模式左列）
}
// 背景 surface-card, 圆角 lg
// 标准模式：标题(display-sm), 时间范围(body-sm), 状态 badge
// 紧凑模式：单行显示，标题 + 时间 + 状态徽章
```

### TracePanel（新增）

```typescript
interface TracePanelProps {
  sessions: TraceSession[]
  visible: boolean
  onToggle: () => void
}
// 底部可折叠面板，高度 300px（可拖拽调整）
// 背景 surface-dark, 文字 on-dark
// 显示结构化调用链，每个步骤可展开查看输入/输出
// 默认隐藏，通过 TopNav 设置开关控制
```

### DynamicTile

```typescript
interface DynamicTileProps {
  candidates: ActionCandidate[]  // USOM 类型（R-04）
}
// 渲染为列表，每个候选为可点击卡片
// 背景 canvas, 圆角 md, hairline 边框
// 位置已从 AiPanel 移至 TilesBanner
```
