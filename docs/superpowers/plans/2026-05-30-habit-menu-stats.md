# [013] 成长领域菜单优化 + [014] 习惯统计页面 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为成长领域菜单添加操作类型图标，并新增习惯打卡可视化统计页面（日/周/月视图）。

**Architecture:** [013] 纯前端改动——GrowthMenu 组件读取 manifest 已有的 response_type 渲染图标。[014] 新增 Domain view_route——manifest 注册 + Repository 查询 + Server Actions + 页面组件，数据走 Repository 只读路径（不经过 Nexus 链）。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Tailwind CSS 4, Lucide Icons, date-fns

---

## Task 1: [013] GrowthMenu 添加 response_type 图标

**Files:**
- Modify: `frontend/src/components/layout/growth-menu.tsx`

- [ ] **Step 1: 更新 DomainAction 接口并添加图标映射**

在 `growth-menu.tsx` 中：

1. 更新 import，增加三个 Lucide 图标：
```tsx
import { CheckSquare, Clock, Repeat, Target, Pin, PinOff, ChevronDown, MessageSquare, LayoutGrid, FileText } from "lucide-react"
```

2. 更新 `DomainAction` 接口，增加 `response_type`：
```tsx
interface DomainAction {
  action: string
  shortcut?: string
  description: string
  response_type?: 'cnui' | 'page' | 'text'
}
```

3. 在 `DOMAIN_META` 之后添加图标映射常量：
```tsx
const RESPONSE_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cnui: MessageSquare,
  page: LayoutGrid,
  text: FileText,
}
```

4. 在 pinned 和 unpinned 的 action 按钮中，在描述文字 `<span>` 之前添加图标：
```tsx
// 在 <span className="truncate">{act.description}</span> 之前：
{(() => {
  const RespIcon = RESPONSE_TYPE_ICON[(act as any).response_type ?? '']
  return RespIcon ? <RespIcon className="size-3.5 shrink-0 text-body/40" /> : null
})()}
```

两处 action 按钮都要改（pinnedActions 和 unpinnedActions 的 `.map`）。

- [ ] **Step 2: 验证图标显示**

运行: `cd frontend && npm run dev`

打开浏览器，点击左侧面板的"成长领域"标签，确认每个操作前出现对应图标：
- 习惯管理 → LayoutGrid（page）
- 创建新习惯 → MessageSquare（cnui）
- 习惯统计 → FileText（text）
- 打卡 → MessageSquare（cnui）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/layout/growth-menu.tsx
git commit -m "feat: 成长领域菜单添加 response_type 图标区分 [013]"
```

---

## Task 2: [014] Manifest 注册 + 路由

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml`
- Create: `frontend/src/app/habits/statistics/page.tsx`
- Modify: `frontend/src/app/page.tsx` (VIEW_PAGE_COMPONENTS)

- [ ] **Step 1: 更新 manifest.yaml — intent_triggers 新增 view_statistics**

在 `intent_triggers` 数组末尾（`habit_statistics` 条目之后）添加：
```yaml
  - action: view_statistics
    shortcut: /habitStatsView
    description: 习惯统计
    response_type: page
    keywords: [统计, 打卡统计, 习惯数据]
    view_route: /habits/statistics
```

- [ ] **Step 2: 更新 manifest.yaml — view_routes 新增 view_statistics**

在 `view_routes` 区块中 `view_templates` 之后添加：
```yaml
  view_statistics:
    component: domains/habits/pages/HabitStatisticsPage
    url: /habits/statistics
```

- [ ] **Step 3: 创建路由文件**

创建 `frontend/src/app/habits/statistics/page.tsx`：
```tsx
// Auto-generated from domains/habits/manifest.yaml
// DO NOT EDIT MANUALLY
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage"
export default function Page() {
  return <HabitStatisticsPage />
}
```

- [ ] **Step 4: 更新 app/page.tsx 的 VIEW_PAGE_COMPONENTS**

在 `VIEW_PAGE_COMPONENTS` 的 `habits` 对象中增加 `view_statistics`：
```tsx
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,  // 新增
  },
};
```

同时在文件顶部的 import 区域增加：
```tsx
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage";
```

注意：此时 `HabitStatisticsPage` 还未创建，先创建一个占位文件：

创建 `frontend/src/domains/habits/pages/HabitStatisticsPage.tsx`：
```tsx
"use client"

export function HabitStatisticsPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-bold">习惯统计</h1>
      <p className="text-sm text-body/60 mt-2">开发中...</p>
    </div>
  )
}
```

- [ ] **Step 5: 验证路由可访问**

运行: `cd frontend && npm run dev`

在浏览器打开 `http://localhost:3000`，点击成长领域菜单中的"习惯统计"，确认跳转到显示"开发中..."的页面。

同时在成长领域菜单中确认"习惯统计"前面出现了 LayoutGrid 图标（因为 response_type=page）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/habits/manifest.yaml frontend/src/app/habits/statistics/page.tsx frontend/src/domains/habits/pages/HabitStatisticsPage.tsx frontend/src/app/page.tsx
git commit -m "feat: 习惯统计页面 manifest 注册 + 路由 [014]"
```

---

## Task 3: [014] Repository 查询方法

**Files:**
- Modify: `frontend/src/domains/habits/repository/habit-log.ts`

- [ ] **Step 1: 添加 getHabitLogsByDateRange 方法**

在 `HabitLogRepository` 类中添加：

```ts
import { eq, and, gte, lte, asc } from 'drizzle-orm'

/**
 * 查询指定日期范围内用户的所有打卡记录
 * @returns 按 habitId 分组的记录 Map
 */
async findByDateRange(userId: USOM_ID, startDate: DateOnly, endDate: DateOnly): Promise<Map<string, HabitLog[]>> {
  const rows = await db.select().from(s.habitLogs)
    .where(and(
      eq(s.habitLogs.userId, userId),
      gte(s.habitLogs.date, startDate),
      lte(s.habitLogs.date, endDate),
    ))
    .orderBy(asc(s.habitLogs.date))

  const grouped = new Map<string, HabitLog[]>()
  for (const row of rows) {
    const log = habitLogRowToUSOM(row as any)
    const existing = grouped.get(log.habitId) ?? []
    existing.push(log)
    grouped.set(log.habitId, existing)
  }
  return grouped
}
```

更新文件顶部的 import：
```ts
import { eq, and, gte, lte, asc } from 'drizzle-orm'
```

- [ ] **Step 2: 验证编译通过**

运行: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

确认无类型错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/habits/repository/habit-log.ts
git commit -m "feat: HabitLogRepository 添加按日期范围查询方法 [014]"
```

---

## Task 4: [014] Server Actions

**Files:**
- Create: `frontend/src/app/actions/habit-stats.ts`

- [ ] **Step 1: 创建 habit-stats.ts Server Actions**

创建 `frontend/src/app/actions/habit-stats.ts`：

```ts
"use server"

import { HabitRepository } from "@/domains/habits/repository/habit"
import { HabitLogRepository } from "@/domains/habits/repository/habit-log"
import { calculateStreak, calculateCompletion7d } from "@/domains/habits/streak-calculator"
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, getDay } from "date-fns"
import type { Habit, HabitLog } from "@/usom/types/objects"
import type { DateOnly } from "@/usom/types/primitives"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001" as any

// ─── 日视图数据 ─────────────────────────────────────────────────

export interface HabitDayRow {
  habitId: string
  title: string
  streak: number
  completionRate7d: number
  recent5Days: Array<{ date: string; status: HabitLog['completionStatus'] | null }>
}

export async function getHabitStatsForDay(date: Date): Promise<HabitDayRow[]> {
  const habitRepo = new HabitRepository()
  const logRepo = new HabitLogRepository()

  const habits = await habitRepo.findActive(MVP_USER_ID)
  const startDate = format(subDays(date, 4), 'yyyy-MM-dd') as DateOnly
  const endDate = format(date, 'yyyy-MM-dd') as DateOnly

  const logsByHabit = await logRepo.findByDateRange(MVP_USER_ID, startDate, endDate)

  return habits.map(habit => {
    const logs = logsByHabit.get(habit.id) ?? []
    const recent5 = eachDayOfInterval({ start: subDays(date, 4), end: date }).map(d => {
      const dateStr = format(d, 'yyyy-MM-dd')
      const log = logs.find(l => l.date === dateStr)
      return { date: dateStr, status: log?.completionStatus ?? null }
    })

    const completedDates = logs
      .filter(l => l.completionStatus === 'completed')
      .map(l => l.date)
    const today = format(date, 'yyyy-MM-dd')

    return {
      habitId: habit.id,
      title: habit.title,
      streak: calculateStreak(completedDates, today),
      completionRate7d: calculateCompletion7d(completedDates, today),
      recent5Days: recent5,
    }
  })
}

// ─── 周视图数据 ─────────────────────────────────────────────────

export interface HabitWeekMatrix {
  habitId: string
  title: string
  weekDays: Array<{ date: string; dayLabel: string; status: HabitLog['completionStatus'] | null }>
  completionRate: number
}

export async function getHabitStatsForWeek(weekStart: Date): Promise<HabitWeekMatrix[]> {
  const habitRepo = new HabitRepository()
  const logRepo = new HabitLogRepository()

  const habits = await habitRepo.findActive(MVP_USER_ID)
  const wStart = startOfWeek(weekStart, { weekStartsOn: 1 })
  const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const startDate = format(wStart, 'yyyy-MM-dd') as DateOnly
  const endDate = format(wEnd, 'yyyy-MM-dd') as DateOnly

  const logsByHabit = await logRepo.findByDateRange(MVP_USER_ID, startDate, endDate)
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  return habits.map(habit => {
    const logs = logsByHabit.get(habit.id) ?? []
    const weekDays = eachDayOfInterval({ start: wStart, end: wEnd }).map((d, i) => {
      const dateStr = format(d, 'yyyy-MM-dd')
      const log = logs.find(l => l.date === dateStr)
      return { date: dateStr, dayLabel: dayLabels[i], status: log?.completionStatus ?? null }
    })

    const completed = weekDays.filter(d => d.status === 'completed').length
    const total = weekDays.filter(d => d.status !== null).length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    return { habitId: habit.title, title: habit.title, weekDays, completionRate }
  })
}

// ─── 月视图数据 ─────────────────────────────────────────────────

export interface MonthDaySummary {
  date: string
  day: number
  completedCount: number
}

export async function getHabitStatsForMonth(year: number, month: number): Promise<MonthDaySummary[]> {
  const logRepo = new HabitLogRepository()

  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const startDate = `${monthStr}-01` as DateOnly
  const endDate = `${monthStr}-${new Date(year, month, 0).getDate()}` as DateOnly

  const logsByHabit = await logRepo.findByDateRange(MVP_USER_ID, startDate, endDate)

  const allLogs = Array.from(logsByHabit.values()).flat()
  const countByDate = new Map<string, number>()
  for (const log of allLogs) {
    if (log.completionStatus === 'completed') {
      countByDate.set(log.date, (countByDate.get(log.date) ?? 0) + 1)
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
    return { date: dateStr, day, completedCount: countByDate.get(dateStr) ?? 0 }
  })
}
```

- [ ] **Step 2: 验证编译通过**

运行: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/actions/habit-stats.ts
git commit -m "feat: 习惯统计 Server Actions（日/周/月视图数据）[014]"
```

---

## Task 5: [014] 日视图组件

**Files:**
- Create: `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitStatisticsPage.tsx`

- [ ] **Step 1: 创建日视图组件**

创建 `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`：

```tsx
"use client"

import { useState } from "react"
import { Check, X, Minus } from "lucide-react"
import type { HabitDayRow } from "@/app/actions/habit-stats"

interface HabitStatsDayViewProps {
  data: HabitDayRow[]
}

type CellStatus = "completed" | "partially_completed" | "not_completed" | null

function StatusIcon({ status }: { status: CellStatus }) {
  if (status === "completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-emerald-100 text-emerald-600"><Check className="size-3" strokeWidth={3} /></span>
  if (status === "partially_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-amber-100 text-amber-600"><Minus className="size-3" strokeWidth={3} /></span>
  if (status === "not_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-red-50 text-red-400"><X className="size-3" strokeWidth={3} /></span>
  return <span className="inline-flex size-5 items-center justify-center rounded bg-gray-50 text-gray-300"><Minus className="size-3" /></span>
}

function StreakBadge({ streak, completionRate7d }: { streak: number; completionRate7d: number }) {
  if (streak > 0) return <span className="text-xs text-emerald-600">✅ 连续{streak}天</span>
  if (completionRate7d < 0.5) return <span className="text-xs text-red-500">❌ 中断</span>
  return <span className="text-xs text-gray-400">—</span>
}

export function HabitStatsDayView({ data }: HabitStatsDayViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-body/40">暂无活跃习惯</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-hairline">
          <th className="py-2 text-left font-medium text-body/60 w-28">习惯</th>
          <th className="py-2 text-left font-medium text-body/60 w-24">状态</th>
          {data[0]?.recent5Days.map(d => (
            <th key={d.date} className="py-2 text-center font-medium text-body/60 text-xs w-10">{d.date.slice(5)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <>
            <tr
              key={row.habitId}
              className="border-b border-hairline last:border-0 hover:bg-surface-soft/50 cursor-pointer"
              onClick={() => setExpanded(expanded === row.habitId ? null : row.habitId)}
            >
              <td className="py-2.5 text-ink">{row.title}</td>
              <td className="py-2.5"><StreakBadge streak={row.streak} completionRate7d={row.completionRate7d} /></td>
              {row.recent5Days.map(d => (
                <td key={d.date} className="py-2.5 text-center"><StatusIcon status={d.status} /></td>
              ))}
            </tr>
            {expanded === row.habitId && (
              <tr key={`${row.habitId}-detail`}>
                <td colSpan={2 + row.recent5Days.length} className="bg-surface-soft/30 px-4 py-3">
                  <div className="flex items-center gap-6 text-xs text-body/60">
                    <span>当前连续：<strong className="text-ink">{row.streak}</strong> 天</span>
                    <span>7日完成率：<strong className="text-ink">{Math.round(row.completionRate7d * 100)}%</strong></span>
                  </div>
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: 更新 HabitStatisticsPage 为完整日视图**

替换 `frontend/src/domains/habits/pages/HabitStatisticsPage.tsx`：

```tsx
"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { HabitStatsDayView } from "../components/statistics/HabitStatsDayView"
import { getHabitStatsForDay, type HabitDayRow } from "@/app/actions/habit-stats"

type ViewMode = "day" | "week" | "month"

export function HabitStatisticsPage() {
  const [tab, setTab] = useState<ViewMode>("day")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dayData, setDayData] = useState<HabitDayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tab !== "day") return
    setLoading(true)
    getHabitStatsForDay(currentDate).then(d => { setDayData(d); setLoading(false) })
  }, [tab, currentDate])

  return (
    <div className="flex h-full">
      {/* 主内容区 */}
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-lg font-bold text-ink mb-4">习惯统计</h1>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-4 border-b border-hairline">
          {(["day", "week", "month"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-body/50 hover:text-body/70"
              }`}
            >
              {t === "day" ? "日" : t === "week" ? "周" : "月"}
            </button>
          ))}
        </div>

        {loading && tab === "day" && <p className="text-sm text-body/40">加载中...</p>}
        {tab === "day" && !loading && <HabitStatsDayView data={dayData} />}
        {tab === "week" && <p className="py-8 text-center text-sm text-body/40">周视图开发中...</p>}
        {tab === "month" && <p className="py-8 text-center text-sm text-body/40">月视图开发中...</p>}
      </div>

      {/* 右侧边栏 — MiniCalendar 占位 */}
      <div className="hidden md:block w-[280px] border-l border-hairline p-4">
        <div className="rounded-lg border border-hairline bg-surface-card p-3">
          <div className="mb-2 text-center text-sm font-medium text-ink">
            {format(currentDate, 'yyyy年M月', { locale: zhCN })}
          </div>
          <p className="text-center text-xs text-body/30">日历组件</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 验证日视图渲染**

运行: `cd frontend && npm run dev`

打开成长领域菜单 → 习惯统计，确认：
1. Tab 切换正常（日/周/月）
2. 日视图显示习惯表格，每行有状态标签和近5天图标
3. 点击行可展开详情

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx frontend/src/domains/habits/pages/HabitStatisticsPage.tsx
git commit -m "feat: 习惯统计日视图组件 [014]"
```

---

## Task 6: [014] 周视图组件

**Files:**
- Create: `frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitStatisticsPage.tsx`

- [ ] **Step 1: 创建周视图组件**

创建 `frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx`：

```tsx
"use client"

import { useState } from "react"
import { Check, X, Minus, ChevronLeft, ChevronRight } from "lucide-react"
import type { HabitWeekMatrix } from "@/app/actions/habit-stats"

interface HabitStatsWeekViewProps {
  data: HabitWeekMatrix[]
  weekLabel: string
  onPrev: () => void
  onNext: () => void
}

function StatusCell({ status }: { status: string | null }) {
  if (status === "completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-emerald-100 text-emerald-600"><Check className="size-3" strokeWidth={3} /></span>
  if (status === "partially_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-amber-100 text-amber-600"><Minus className="size-3" strokeWidth={3} /></span>
  if (status === "not_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-red-50 text-red-400"><X className="size-3" strokeWidth={3} /></span>
  return <span className="inline-flex size-5 items-center justify-center rounded bg-gray-50 text-gray-300"><Minus className="size-3" /></span>
}

export function HabitStatsWeekView({ data, weekLabel, onPrev, onNext }: HabitStatsWeekViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-body/40">暂无活跃习惯</p>
  }

  return (
    <div className="space-y-3">
      {/* 导航 + 图例 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="rounded p-1 hover:bg-surface-soft"><ChevronLeft className="size-4" /></button>
          <span className="text-sm font-medium text-ink">{weekLabel}</span>
          <button onClick={onNext} className="rounded p-1 hover:bg-surface-soft"><ChevronRight className="size-4" /></button>
        </div>
        <div className="flex items-center gap-3 text-xs text-body/50">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-emerald-100" /> 完成</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-amber-100" /> 部分</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-red-50" /> 未完成</span>
        </div>
      </div>

      {/* 矩阵表格 */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="py-2 text-left font-medium text-body/60 w-28">习惯</th>
            {data[0]?.weekDays.map(d => (
              <th key={d.date} className="py-2 text-center font-medium text-body/60 text-xs">
                <div>{d.dayLabel}</div>
              </th>
            ))}
            <th className="py-2 text-center font-medium text-body/60 w-14 text-xs">完成率</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <>
              <tr
                key={row.habitId}
                className="border-b border-hairline last:border-0 hover:bg-surface-soft/50 cursor-pointer"
                onClick={() => setExpanded(expanded === row.habitId ? null : row.habitId)}
              >
                <td className="py-2.5 text-ink">{row.title}</td>
                {row.weekDays.map(d => (
                  <td key={d.date} className="py-2.5 text-center"><StatusCell status={d.status} /></td>
                ))}
                <td className="py-2.5 text-center text-xs text-body/60">{row.completionRate}%</td>
              </tr>
              {expanded === row.habitId && (
                <tr key={`${row.habitId}-detail`}>
                  <td colSpan={2 + row.weekDays.length} className="bg-surface-soft/30 px-4 py-3">
                    <div className="flex items-center gap-6 text-xs text-body/60">
                      <span>完成率：<strong className="text-ink">{row.completionRate}%</strong></span>
                      <span className="text-primary cursor-pointer">查看历史详情 →</span>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 集成周视图到 HabitStatisticsPage**

在 `HabitStatisticsPage.tsx` 中：

1. 增加 import：
```tsx
import { startOfWeek, endOfWeek, addWeeks, format } from "date-fns"
import { HabitStatsWeekView } from "../components/statistics/HabitStatsWeekView"
import { getHabitStatsForWeek, type HabitWeekMatrix } from "@/app/actions/habit-stats"
```

2. 在组件内增加周视图 state 和 effect：
```tsx
const [weekData, setWeekData] = useState<HabitWeekMatrix[]>([])

useEffect(() => {
  if (tab !== "week") return
  setLoading(true)
  getHabitStatsForWeek(currentDate).then(d => { setWeekData(d); setLoading(false) })
}, [tab, currentDate])
```

3. 替换周视图占位文本为实际组件：
```tsx
{tab === "week" && !loading && (
  <HabitStatsWeekView
    data={weekData}
    weekLabel={`${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')} — ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')}`}
    onPrev={() => setCurrentDate(addWeeks(currentDate, -1))}
    onNext={() => setCurrentDate(addWeeks(currentDate, 1))}
  />
)}
```

- [ ] **Step 3: 验证周视图**

运行: `cd frontend && npm run dev`

切换到周视图 Tab，确认：
1. 打卡矩阵正确渲染
2. 前/后一周导航正常
3. 点击行可展开

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx frontend/src/domains/habits/pages/HabitStatisticsPage.tsx
git commit -m "feat: 习惯统计周视图打卡矩阵 [014]"
```

---

## Task 7: [014] 月视图组件

**Files:**
- Create: `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitStatisticsPage.tsx`

- [ ] **Step 1: 创建月视图组件**

创建 `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx`：

```tsx
"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import type { MonthDaySummary } from "@/app/actions/habit-stats"

interface HabitStatsMonthViewProps {
  data: MonthDaySummary[]
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function HabitStatsMonthView({ data, year, month, onPrev, onNext }: HabitStatsMonthViewProps) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 将日期按周分行（周一起始）
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1  // 周一=0

  const weeks: (MonthDaySummary | null)[][] = []
  let currentWeek: (MonthDaySummary | null)[] = Array(offset).fill(null)

  for (const day of data) {
    currentWeek.push(day)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null)
    weeks.push(currentWeek)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="rounded p-1 hover:bg-surface-soft"><ChevronLeft className="size-4" /></button>
        <span className="text-sm font-medium text-ink">{year}年{month}月</span>
        <button onClick={onNext} className="rounded p-1 hover:bg-surface-soft"><ChevronRight className="size-4" /></button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {WEEKDAYS.map(d => (
              <th key={d} className="py-1.5 text-center font-medium text-body/50 text-xs">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) return <td key={`empty-${di}`} className="py-1.5" />
                const isToday = day.date === todayStr
                return (
                  <td key={day.date} className={`py-1.5 text-center ${isToday ? 'bg-primary/5 rounded' : ''}`}>
                    <div className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-ink'}`}>{day.day}</div>
                    {day.completedCount > 0 && (
                      <span className="mt-0.5 inline-block rounded px-1 text-[10px] bg-emerald-50 text-emerald-600">
                        {day.completedCount}项
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 集成月视图到 HabitStatisticsPage**

在 `HabitStatisticsPage.tsx` 中：

1. 增加 import：
```tsx
import { addMonths } from "date-fns"
import { HabitStatsMonthView } from "../components/statistics/HabitStatsMonthView"
import { getHabitStatsForMonth, type MonthDaySummary } from "@/app/actions/habit-stats"
```

2. 在组件内增加月视图 state 和 effect：
```tsx
const [monthData, setMonthData] = useState<MonthDaySummary[]>([])

useEffect(() => {
  if (tab !== "month") return
  setLoading(true)
  const y = currentDate.getFullYear()
  const m = currentDate.getMonth() + 1
  getHabitStatsForMonth(y, m).then(d => { setMonthData(d); setLoading(false) })
}, [tab, currentDate])
```

3. 替换月视图占位文本：
```tsx
{tab === "month" && !loading && (
  <HabitStatsMonthView
    data={monthData}
    year={currentDate.getFullYear()}
    month={currentDate.getMonth() + 1}
    onPrev={() => setCurrentDate(addMonths(currentDate, -1))}
    onNext={() => setCurrentDate(addMonths(currentDate, 1))}
  />
)}
```

- [ ] **Step 3: 验证月视图**

运行: `cd frontend && npm run dev`

切换到月视图 Tab，确认日历网格正确渲染，当日高亮，有打卡的日子显示"N项"。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx frontend/src/domains/habits/pages/HabitStatisticsPage.tsx
git commit -m "feat: 习惯统计月视图日历 [014]"
```

---

## Task 8: [014] 清理预览页面 + 最终验证

**Files:**
- Delete: `frontend/src/app/habits/statistics/preview/page.tsx`

- [ ] **Step 1: 删除预览页面**

```bash
rm frontend/src/app/habits/statistics/preview/page.tsx
rmdir frontend/src/app/habits/statistics/preview 2>/dev/null; true
```

- [ ] **Step 2: 完整功能验证**

运行: `cd frontend && npm run dev`

验证清单：
1. 成长领域菜单中每个操作前有对应类型图标
2. 点击"习惯统计"进入统计页面
3. 日视图：表格 + 近5天打卡图标 + 行内展开
4. 周视图：打卡矩阵 + 导航 + 行内展开 + 完成率
5. 月视图：月历网格 + 打卡计数
6. Tab 切换正常

- [ ] **Step 3: 提交清理**

```bash
git add -u frontend/src/app/habits/statistics/preview/
git commit -m "chore: 删除习惯统计预览页面 [014]"
```

---

## 自审结果

- **Spec 覆盖**：[013] 菜单图标 → Task 1；[014] manifest → Task 2；Repository → Task 3；Server Actions → Task 4；日/周/月视图 → Task 5/6/7；清理 → Task 8。全部覆盖。
- **占位符扫描**：无 TBD/TODO，每步都有实际代码。
- **类型一致性**：`HabitDayRow`、`HabitWeekMatrix`、`MonthDaySummary` 在 Server Actions 中定义，在组件中 import 使用，类型名称一致。Repository 方法 `findByDateRange` 返回 `Map<string, HabitLog[]>`，Server Actions 中用 `logsByHabit.get()` 访问，一致。
