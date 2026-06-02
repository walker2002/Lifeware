# 习惯管理迭代优化设计文档

**日期**: 2026-06-02
**主题**: 习惯管理迭代优化 — 删除无用 Action + 习惯统计增强
**范围**: 前端 Domain 层（Habits）、Server Actions、UI 组件
**状态**: 待实现

---

## 目录

- [1. 概述](#1-概述)
- [2. 需求分解](#2-需求分解)
- [3. 设计决策](#3-设计决策)
- [4. 删除无用 Action（[015]）](#4-删除无用-action015)
- [5. 习惯统计日视图增强（[016]）](#5-习惯统计日视图增强016)
- [6. 习惯统计月视图重新设计（[016]）](#6-习惯统计月视图重新设计016)
- [7. 主页时间盒月视图修改（[016]）](#7-主页时间盒月视图修改016)
- [8. 数据变更](#8-数据变更)
- [9. 界面规范](#9-界面规范)
- [10. 测试策略](#10-测试策略)
- [11. 实现顺序](#11-实现顺序)

---

## 1. 概述

本文档定义习惯管理模块的迭代优化，包含两个需求：

- **[015] 删除无用 Action**: 清理 `/myHabits`、`/habitStats` 两个已废弃的意图触发器及其关联代码
- **[016] 习惯统计增强**: 日视图追加详情字段，月视图改为显示习惯名称列表并支持截断 + 悬停展开

---

## 2. 需求分解

### 2.1 [015] 删除无用 Action

| Action | 快捷方式 | 当前状态 | 处理方式 |
|--------|---------|---------|---------|
| `list_active_habits` | `/myHabits` | 在 manifest 中声明为 CNUI 响应 | 删除 intent_trigger、query_action、CNUI Surface `habit-list-card` |
| `habit_statistics` | `/habitStats` | 在 manifest 中声明为 text 响应 | 删除 intent_trigger、query_action |

> **注意**: `/habits/statistics` 页面路由（`view_statistics` → `/habitStatsView`）**保留**，不受影响。

### 2.2 [016] 习惯统计增强

#### 日视图

- 列表行点击展开详情区域，追加 3 个字段：
  - 习惯开始时间（`startDate`）
  - 打卡总次数（`totalLogs`）
  - 最长连续打卡次数（`longestStreak`）
- 现有字段（当前连续 `streak`、7日完成率 `completionRate7d`）**保留**

#### 月视图

- 不再显示已完成数量数字标签
- 在日历每个日期格子内显示已打卡的习惯名称列表
- 每天最多显示 **4** 项，超出显示 `+x more`
- 鼠标悬停 `+x more` 时，Tooltip 展示当日全部打卡习惯

#### 主页时间盒月视图

- 截断数量从当前动态值改为最多显示 **4** 项
- 增加悬停显示当日全部事件的功能

---

## 3. 设计决策

### 3.1 方案选择

采用**最小改动方案（方案 A）**：

- 不引入新依赖（react-big-calendar 已在时间盒中使用，习惯统计月视图手写实现）
- 习惯统计月视图和时间盒月视图的数据模型差异大，不强行统一
- 固定 4 项截断逻辑简单，手写即可
- 删除操作 straightforward，风险低

### 3.2 关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 月视图是否保留 completedCount | 不保留 | 用户需求明确要求替换为习惯名称列表 |
| 日视图新字段是替换还是追加 | 追加 | 用户要求保留现有字段 |
| 时间盒月视图截断方式 | 保持 react-big-calendar，仅增加 Tooltip | 侵入库内部逻辑风险高，动态截断与固定 4 项用户感知差异不大 |
| 悬停组件选择 | 项目已有 Tooltip | shadcn/ui 已提供，无需新依赖 |

---

## 4. 删除无用 Action（[015]）

### 4.1 manifest.yaml 变更

**文件**: `frontend/src/domains/habits/manifest.yaml`

删除以下条目：

- `intent_triggers` 中的 `list_active_habits` 和 `habit_statistics`
- `query_actions` 中的 `list_active_habits` 和 `habit_statistics`

> `cnui_surfaces` 中的 `habit-list-card` 同步删除。

### 4.2 代码文件删除/清理

| 文件/代码 | 操作 | 说明 |
|-----------|------|------|
| `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx` | 删除 | 仅被 `list_active_habits` 使用 |
| `frontend/src/domains/habits/cnui/handlers.ts` | 清理 | 删除 `open`/`submit` 中对 `habit-list-card` 的处理分支 |
| `frontend/src/domains/habits/cnui/index.ts` | 清理 | 删除 `habit-list-card` 的注册 |
| `handlers/statistics-handler.ts` | 检查 | 若存在仅被 `habit_statistics` 调用的代码，一并删除 |

### 4.3 验证清单

- [ ] 删除后运行 `npm run generate:routes` 无报错
- [ ] 全局搜索 `/myHabits`、`/habitStats`、`habit-list-card`、`list_active_habits`、`habit_statistics` 无残留引用
- [ ] `/habits/statistics` 页面正常访问

---

## 5. 习惯统计日视图增强（[016]）

### 5.1 数据接口变更

**文件**: `frontend/src/app/actions/habit-stats.ts`

```ts
export interface HabitDayRow {
  habitId: string
  title: string
  startDate: string        // ← 新增：习惯开始时间（ISO 日期字符串 yyyy-MM-dd）
  totalLogs: number        // ← 新增：历史打卡总次数
  longestStreak: number    // ← 新增：历史最长连续打卡天数
  streak: number           // 现有：当前连续打卡天数
  completionRate7d: number // 现有：7日完成率
  recent5Days: Array<{ date: string; status: HabitLog['completionStatus'] | null }>
}
```

### 5.2 Server Action 修改

**函数**: `getHabitStatsForDay`

对每个习惯，在现有查询基础上追加：

1. `habit.startDate` → 直接取 habit 对象已有字段
2. `totalLogs` → 调用 `logRepo.findByHabit(habit.id, userId)` 获取全部历史记录，计数
3. `longestStreak` → 调用 `habitRepo.calculateLongestStreak(habit.id, userId)`（Repository 接口已定义）

### 5.3 UI 组件修改

**文件**: `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`

展开详情区域（`expanded === row.habitId` 时渲染的 `<tr>`）修改为显示 5 个字段：

```tsx
<div className="flex items-center gap-6 text-xs text-body/60 flex-wrap">
  <span>当前连续：<strong className="text-ink">{row.streak}</strong> 天</span>
  <span>7日完成率：<strong className="text-ink">{Math.round(row.completionRate7d * 100)}%</strong></span>
  <span>开始时间：<strong className="text-ink">{row.startDate}</strong></span>
  <span>打卡总次数：<strong className="text-ink">{row.totalLogs}</strong></span>
  <span>最长连续：<strong className="text-ink">{row.longestStreak}</strong> 天</span>
</div>
```

保持现有样式（`bg-surface-soft/30` 背景、`text-xs` 文字大小）。

---

## 6. 习惯统计月视图重新设计（[016]）

### 6.1 数据接口变更

**文件**: `frontend/src/app/actions/habit-stats.ts`

```ts
export interface MonthDaySummary {
  date: string
  day: number
  habitNames: string[]  // ← 替换 completedCount：当日已打卡习惯名称列表
}
```

### 6.2 Server Action 修改

**函数**: `getHabitStatsForMonth`

修改逻辑：

1. 按月查询所有 `completed` 状态的打卡记录
2. 对每个习惯，获取其标题（`habit.title`）
3. 按日期聚合，每个日期对应一个习惯名称数组
4. 返回 `{ date, day, habitNames }[]`

实现要点：

- 需要同时查询 habit 表获取标题，或确保 log 关联信息中包含标题
- 若 `HabitLog` 不直接包含标题，可通过 `habitRepo.findByUserId` 先获取习惯列表建立 id→title 映射

### 6.3 UI 组件重写

**文件**: `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx`

日历格子渲染逻辑：

```
每个 <td> 结构：
├── <div> 日期数字（isToday 时高亮）</div>
├── 最多 4 个 <span> 习惯名称标签 </span>
└── （超出时）<span> +{n} more </span>
```

**截断规则**：

```ts
const MAX_DISPLAY = 4
const displayed = day.habitNames.slice(0, MAX_DISPLAY)
const remaining = day.habitNames.length - MAX_DISPLAY
```

**样式规范**：

- 习惯名称标签：`text-[10px]`、`bg-surface-soft`、`rounded`、`px-1.5 py-0.5`、`truncate`
- `+x more`：同尺寸、`text-primary`、`cursor-pointer`
- Tooltip 使用 `@/components/ui/tooltip`：竖排列表，每项一行

**悬停实现**：

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// 超出时渲染
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="text-[10px] text-primary cursor-pointer">+{remaining} more</span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[200px]">
      <div className="flex flex-col gap-1">
        {day.habitNames.map((name, i) => (
          <span key={i} className="text-xs">{name}</span>
        ))}
      </div>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## 7. 主页时间盒月视图修改（[016]）

### 7.1 修改范围

**文件**: `frontend/src/domains/timebox/components/month-view.tsx`

### 7.2 截断调整

`react-big-calendar` 的截断数量是动态计算的（基于行高和事件高度）。需求要求从当前约 2 项改为接近 4 项。

**实现方式**：通过调整事件样式高度，使动态计算结果趋向 4 项。

```tsx
eventPropGetter={(event: CalendarEvent) => ({
  style: {
    // 现有样式...
    fontSize: '11px',  // 保持或微调以控制高度
    lineHeight: '14px',
    minHeight: '16px',
  },
})}
```

### 7.3 悬停显示全部事件

通过 `components.showMore` 自定义 `+ more` 按钮，包裹在 Tooltip 中：

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

<Calendar
  components={{
    showMore: ({ count, events, remainingEvents }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="rbc-button-link rbc-show-more">
              +{count} more
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            <div className="flex flex-col gap-1">
              {remainingEvents.map((evt, i) => (
                <span key={i} className="text-xs truncate">{evt.title}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  }}
/>
```

> 注意：`react-big-calendar` 的 `showMore` 组件默认是点击触发（`onClick`）， Tooltip 悬停展示需要确保不破坏原有的点击展开行为（如有）。若两者冲突，以悬停展示为主。

---

## 8. 数据变更

### 8.1 数据库 Schema

无 Schema 变更。所有改动在 Server Action 数据组装层，不触及数据库表结构。

### 8.2 接口变更汇总

| 接口 | 变更类型 | 说明 |
|------|---------|------|
| `HabitDayRow` | 扩展 | 新增 `startDate`、`totalLogs`、`longestStreak` 3 个字段 |
| `MonthDaySummary` | 替换字段 | `completedCount: number` → `habitNames: string[]` |

### 8.3 向后兼容性

- `MonthDaySummary.completedCount` 被删除，需要同步更新所有消费该接口的组件
- 唯一消费者是 `HabitStatsMonthView`，已在本设计中同步修改

---

## 9. 界面规范

### 9.1 颜色令牌

所有颜色必须使用项目 CSS 变量令牌：

| 元素 | 令牌 |
|------|------|
| 习惯名称标签背景 | `bg-surface-soft` |
| 习惯名称文字 | `text-ink` |
| `+x more` 文字 | `text-primary` |
| 展开详情背景 | `bg-surface-soft/30` |
| 展开详情文字 | `text-body/60` |
| 强调数值 | `text-ink` |

### 9.2 尺寸规范

| 元素 | 尺寸 |
|------|------|
| 习惯名称标签 | `text-[10px]`、`px-1.5 py-0.5` |
| 日期数字 | `text-xs` |
| 展开详情文字 | `text-xs` |
| Tooltip 内容 | `text-xs`、最大宽度 `200px` |

### 9.3 布局规范

- 日历表格保持现有的 `w-full` 宽度
- 每个日期格子内容左对齐，习惯名称标签垂直堆叠
- 日期数字与习惯名称之间间距 `mt-0.5`
- 习惯名称标签之间间距 `gap-0.5`

---

## 10. 测试策略

### 10.1 单元测试

- `getHabitStatsForDay`: 验证新字段（`startDate`、`totalLogs`、`longestStreak`）正确返回
- `getHabitStatsForMonth`: 验证 `habitNames` 数组正确聚合

### 10.2 组件测试

- `HabitStatsDayView`: 验证点击展开后显示 5 个字段
- `HabitStatsMonthView`: 验证 4 项截断、`+x more` 渲染、空数组不显示标签

### 10.3 集成测试

- 验证 `/habits/statistics` 页面三种视图模式切换正常
- 验证删除 `list_active_habits` 和 `habit_statistics` 后页面无报错

---

## 11. 实现顺序

```
步骤 1: 删除无用 Action
  ├── 修改 manifest.yaml
  ├── 删除 HabitListCard.tsx
  ├── 清理 cnui/handlers.ts
  ├── 清理 cnui/index.ts
  └── 运行 npm run generate:routes 验证

步骤 2: 日视图增强
  ├── 修改 habit-stats.ts: HabitDayRow 接口 + getHabitStatsForDay
  └── 修改 HabitStatsDayView.tsx: 展开详情区域

步骤 3: 月视图重新设计
  ├── 修改 habit-stats.ts: MonthDaySummary 接口 + getHabitStatsForMonth
  └── 重写 HabitStatsMonthView.tsx

步骤 4: 时间盒月视图修改
  └── 修改 month-view.tsx: 截断 + 悬停 Tooltip

步骤 5: 验证
  ├── 运行 npm run dev 验证页面渲染
  ├── 运行测试
  └── 运行 npm run lint 检查
```

---

## 附录 A: 修改文件清单

| # | 文件路径 | 操作 |
|---|---------|------|
| 1 | `frontend/src/domains/habits/manifest.yaml` | 编辑 |
| 2 | `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx` | 删除 |
| 3 | `frontend/src/domains/habits/cnui/handlers.ts` | 编辑 |
| 4 | `frontend/src/domains/habits/cnui/index.ts` | 编辑 |
| 5 | `frontend/src/app/actions/habit-stats.ts` | 编辑 |
| 6 | `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx` | 编辑 |
| 7 | `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx` | 编辑 |
| 8 | `frontend/src/domains/timebox/components/month-view.tsx` | 编辑 |
