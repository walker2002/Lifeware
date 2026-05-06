# UI Layout Contract

**Feature**: 002-timebox-slice
**Date**: 2026-05-07（更新）

## 概述

Lifeware 界面框架，基于 Notion 风格两栏布局 + DESIGN.md 设计令牌体系。
2026-05-07 更新：主内容区采用统一三栏时间盒视图（日/周/月），取代"今日模式/日历模式"切换。

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
│  输入区    │  ◀ 2026年5月7日 ▶  [日|周|月] ← DateNav│
│  表单区    │                                        │
│            │  ── 日视图（默认）──                    │
│            │  ┌──────┬──────────┬──────┐            │
│            │  │ 列表 │ 时间轴   │ 日历 │            │
│            │  │ 30%  │ 40%      │ 30%  │            │
│            │  └──────┴──────────┴──────┘            │
│            │                                        │
│            │  ── 周视图 ──                           │
│            │  ┌────────────────────────────┐        │
│            │  │  WeekView (周日历时间表格)  │        │
│            │  └────────────────────────────┘        │
│            │                                        │
│            │  ── 月视图 ──                           │
│            │  ┌────────────────────────────┐        │
│            │  │  MonthView (月日历网格)     │        │
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
| Desktop | ≥ 1024px | 两栏：左 AiPanel 320px + 右 MainContent flex；日视图三栏 |
| Tablet | 768–1024px | 两栏收紧；日视图两栏（隐藏 MiniCalendar） |
| Mobile | < 768px | 单栏：AI 面板折叠为 Sheet 抽屉；DateNav 隐藏"周"；日视图单栏 |

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
  children: React.ReactNode  // DateNav + 视图内容
}
// flex-1, padding: 24px
// 最大内容宽度 960px 居中
```

### DateNav（新增，取代 ViewModeToggle）

```typescript
type DateViewMode = 'day' | 'week' | 'month'

interface DateNavProps {
  mode: DateViewMode
  currentDate: Date
  onModeChange: (mode: DateViewMode) => void
  onNavigate: (direction: 'prev' | 'next') => void
}
// 日期导航栏，位于 MainContent 顶部
// 左侧：前进/后退箭头按钮 + 当前日期/周/月文本
// 右侧：日/周/月三个切换按钮（DESIGN.md category-tab 样式）
// 移动端隐藏"周"按钮
```

### DayView（新增，取代 TodayView）

```typescript
interface DayViewProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
  currentDate: Date            // 当前选中日期
}
// CSS Grid 三栏布局（30% / 40% / 30%）
// 左列：TimeboxList（compact 模式，按 startTime 排序）
// 中列：TimeboxTimeline（小时时间轴 06:00-23:00）
// 右列：MiniCalendar（月历小日历，高亮当前日期）
// 移动端折叠为单栏（时间轴在下，隐藏 MiniCalendar）
```

### WeekView（新增）

```typescript
interface WeekViewProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
  currentDate: Date            // 当前选中周内的日期
}
// 全宽周日历时间表格
// 基于 react-big-calendar week view
// 事件块使用项目设计令牌颜色
// 高度至少 500px
```

### MonthView（新增）

```typescript
interface MonthViewProps {
  timeboxes: TimeboxSummary[]  // USOM 类型（R-04）
  currentDate: Date            // 当前选中月内的日期
}
// 全宽月日历网格
// 基于 react-big-calendar month view
// 事件块使用项目设计令牌颜色
// 高度至少 500px
```

### MiniCalendar（新增）

```typescript
interface MiniCalendarProps {
  currentDate: Date
  selectedDate?: Date
  timeboxes: TimeboxSummary[]
  onDateSelect?: (date: Date) => void
}
// 小型月历组件（用于日视图右列）
// 显示当月日历网格，有事件的日期显示标记点
// 高亮当前日期和选中日期
// 点击日期可选切换日视图的日期
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

### CalendarView（已重构为 WeekView + MonthView）

```typescript
// CalendarView 已拆分为 WeekView 和 MonthView 两个独立组件
// react-big-calendar 不再同时承载多种模式
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
