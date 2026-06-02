# 习惯管理迭代优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 habits 域废弃的 `/myHabits`、`/habitStats` action 及关联代码；增强习惯统计日视图详情字段；重新设计月视图为习惯名称列表（4项截断+悬停展开）；同步调整主页时间盒月视图的截断和悬停行为。

**Architecture:** 最小改动方案。数据层扩展 Server Action 返回字段，UI 层修改现有组件。不引入新依赖，利用项目已有的 shadcn/ui Tooltip 组件。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, react-big-calendar (仅时间盒月视图), Drizzle ORM

---

## File Structure

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/domains/habits/manifest.yaml` | 编辑 | 删除 `list_active_habits`、`habit_statistics` 的 intent_triggers 和 query_actions；删除 `habit-list-card` 的 cnui_surfaces |
| `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx` | 删除 | 仅被废弃 action 使用的组件 |
| `frontend/src/domains/habits/cnui/handlers.ts` | 编辑 | 删除 `surfaceHandlers` 中 `habit-list-card` 的映射 |
| `frontend/src/domains/habits/index.ts` | 编辑 | 删除 HabitListCard 的 import 和 cnuiRegistry.register |
| `frontend/src/app/actions/habit-stats.ts` | 编辑 | 扩展 `HabitDayRow` 接口；修改 `getHabitStatsForDay`；修改 `MonthDaySummary` 接口；重写 `getHabitStatsForMonth` |
| `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx` | 编辑 | 展开详情区域追加 3 个字段 |
| `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx` | 编辑 | 重写为习惯名称列表，4项截断+Tooltip |
| `frontend/src/domains/timebox/components/month-view.tsx` | 编辑 | 增加 `components.showMore` 自定义，悬停展示全部事件 |

---

## Task 1: 删除无用 Action — manifest.yaml

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml`

- [ ] **Step 1: 删除 intent_triggers 中的两个废弃 action**

  删除 `intent_triggers` 列表中的 `list_active_habits` 和 `habit_statistics` 条目。

  ```yaml
  # 删除以下两个条目（约第82-100行）：
  # - action: list_active_habits
  #   shortcut: /myHabits
  #   ...
  # - action: habit_statistics
  #   shortcut: /habitStats
  #   ...
  ```

- [ ] **Step 2: 删除 query_actions 中的两个废弃 action**

  删除 `query_actions` 块中的 `list_active_habits` 和 `habit_statistics` 条目。

  ```yaml
  # 删除以下两个条目（约第259-277行）：
  # query_actions:
  #   list_active_habits:
  #     description: ...
  #     ...
  #   habit_statistics:
  #     description: ...
  #     ...
  ```

- [ ] **Step 3: 删除 cnui_surfaces 中的 habit-list-card**

  删除 `cnui_surfaces` 块中的 `habit-list-card` 条目。

  ```yaml
  # 删除以下条目（约第299-301行）：
  # habit-list-card:
  #   description: 在对话中展示活跃习惯列表卡片
  #   handler: ./cnui/handlers
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/domains/habits/manifest.yaml
  git commit -m "chore(habits): [015] 从 manifest 删除废弃的 list_active_habits 和 habit_statistics action"
  ```

---

## Task 2: 删除无用 Action — HabitListCard 组件及相关代码

**Files:**
- Delete: `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx`
- Modify: `frontend/src/domains/habits/cnui/handlers.ts`
- Modify: `frontend/src/domains/habits/index.ts`

- [ ] **Step 1: 删除 HabitListCard.tsx 文件**

  ```bash
  rm /home/walker/lifeware/frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx
  ```

- [ ] **Step 2: 清理 handlers.ts 中的 surfaceHandlers 映射**

  修改 `frontend/src/domains/habits/cnui/handlers.ts`，删除 `surfaceHandlers` 中的 `habit-list-card` 条目。

  ```ts
  // 修改第277-282行，从：
  export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
    'habit-action-panel': habitCnuiHandler,
    'habit-checkin-panel': habitCnuiHandler,
    'habit-creation-card': habitCnuiHandler,
    'habit-list-card': habitCnuiHandler,
  }

  // 改为：
  export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
    'habit-action-panel': habitCnuiHandler,
    'habit-checkin-panel': habitCnuiHandler,
    'habit-creation-card': habitCnuiHandler,
  }
  ```

- [ ] **Step 3: 清理 index.ts 中的导入和注册**

  修改 `frontend/src/domains/habits/index.ts`：

  1. 删除 HabitListCard 的 import：

  ```ts
  // 删除第19行：
  // import { HabitListCard } from './cnui/surfaces/HabitListCard'
  ```

  2. 删除 cnuiRegistry.register 调用：

  ```ts
  // 删除第39-42行：
  // cnuiRegistry.register('habits', 'habit-list-card', {
  //   component: HabitListCard,
  //   handlerModulePath,
  // })
  ```

- [ ] **Step 4: 验证无残留引用**

  ```bash
  cd /home/walker/lifeware/frontend
  grep -r "HabitListCard" src/ --include="*.ts" --include="*.tsx" || echo "No references found"
  grep -r "habit-list-card" src/ --include="*.ts" --include="*.tsx" --include="*.yaml" || echo "No references found"
  grep -r "list_active_habits" src/ --include="*.ts" --include="*.tsx" --include="*.yaml" || echo "No references found"
  grep -r "habit_statistics" src/ --include="*.ts" --include="*.tsx" --include="*.yaml" || echo "No references found"
  ```

  Expected: 所有 grep 都输出 "No references found"

- [ ] **Step 5: 运行路由生成验证**

  ```bash
  cd /home/walker/lifeware/frontend
  npx tsx scripts/generate-routes.ts
  ```

  Expected: 无报错，正常退出。

- [ ] **Step 6: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/domains/habits/cnui/surfaces/HabitListCard.tsx
  git add src/domains/habits/cnui/handlers.ts
  git add src/domains/habits/index.ts
  git commit -m "chore(habits): [015] 删除废弃的 HabitListCard 组件及关联注册代码"
  ```

---

## Task 3: 日视图数据层 — 扩展 HabitDayRow 和 getHabitStatsForDay

**Files:**
- Modify: `frontend/src/app/actions/habit-stats.ts`

- [ ] **Step 1: 扩展 HabitDayRow 接口**

  修改 `frontend/src/app/actions/habit-stats.ts`，在 `HabitDayRow` 接口中追加 3 个字段：

  ```ts
  // 修改第25-36行，从：
  export interface HabitDayRow {
    /** 习惯 ID */
    habitId: string
    /** 习惯标题 */
    title: string
    /** 当前连续打卡天数 */
    streak: number
    /** 7天完成率 */
    completionRate7d: number
    /** 最近5天的打卡状态 */
    recent5Days: Array<{ date: string; status: HabitLog['completionStatus'] | null }>
  }

  // 改为：
  export interface HabitDayRow {
    /** 习惯 ID */
    habitId: string
    /** 习惯标题 */
    title: string
    /** 习惯开始时间（ISO 日期 yyyy-MM-dd） */
    startDate: string
    /** 历史打卡总次数 */
    totalLogs: number
    /** 历史最长连续打卡天数 */
    longestStreak: number
    /** 当前连续打卡天数 */
    streak: number
    /** 7天完成率 */
    completionRate7d: number
    /** 最近5天的打卡状态 */
    recent5Days: Array<{ date: string; status: HabitLog['completionStatus'] | null }>
  }
  ```

- [ ] **Step 2: 修改 getHabitStatsForDay 函数**

  修改 `frontend/src/app/actions/habit-stats.ts` 第44-81行的 `getHabitStatsForDay` 函数。在每个 habit 的 map 中，追加查询 3 个新字段：

  ```ts
  // 将第61-80行的 return 语句块替换为：
  return Promise.all(habits.map(async habit => {
    const logs = recentLogs.get(habit.id) ?? []
    const recent5 = eachDayOfInterval({ start: subDays(date, 4), end: date }).map(d => {
      const dateStr = format(d, 'yyyy-MM-dd')
      const log = logs.find(l => l.date === dateStr)
      return { date: dateStr, status: log?.completionStatus ?? null }
    })

    const completedDates = (streakLogs.get(habit.id) ?? [])
      .filter(l => l.completionStatus === 'completed')
      .map(l => l.date)

    // 并行查询额外字段
    const [allLogs, longestStreak] = await Promise.all([
      logRepo.findByHabit(habit.id, MVP_USER_ID),
      habitRepo.calculateLongestStreak(habit.id, MVP_USER_ID),
    ])

    return {
      habitId: habit.id,
      title: habit.title,
      startDate: habit.startDate ?? '',
      totalLogs: allLogs.length,
      longestStreak,
      streak: calculateStreak(completedDates, today),
      completionRate7d: calculateCompletion7d(completedDates, today) / 7,
      recent5Days: recent5,
    }
  }))
  ```

  > 注意：将 `habits.map` 改为 `Promise.all(habits.map(async ...))` 以支持异步查询。

- [ ] **Step 3: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/app/actions/habit-stats.ts
  git commit -m "feat(habits): [016] 日视图数据层扩展 HabitDayRow，追加 startDate/totalLogs/longestStreak"
  ```

---

## Task 4: 日视图 UI 层 — 扩展展开详情区域

**Files:**
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`

- [ ] **Step 1: 扩展展开详情区域的字段显示**

  修改 `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`，将展开详情区域（第57-65行）的渲染内容从 2 个字段扩展为 5 个字段：

  ```tsx
  // 将第59-64行从：
  <div className="flex items-center gap-6 text-xs text-body/60">
    <span>当前连续：<strong className="text-ink">{row.streak}</strong> 天</span>
    <span>7日完成率：<strong className="text-ink">{Math.round(row.completionRate7d * 100)}%</strong></span>
  </div>

  // 改为：
  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-body/60">
    <span>当前连续：<strong className="text-ink">{row.streak}</strong> 天</span>
    <span>7日完成率：<strong className="text-ink">{Math.round(row.completionRate7d * 100)}%</strong></span>
    <span>开始时间：<strong className="text-ink">{row.startDate}</strong></span>
    <span>打卡总次数：<strong className="text-ink">{row.totalLogs}</strong></span>
    <span>最长连续：<strong className="text-ink">{row.longestStreak}</strong> 天</span>
  </div>
  ```

  > 将 `gap-6` 改为 `gap-x-6 gap-y-1` 并添加 `flex-wrap`，使 5 个字段在窄屏下自动换行。

- [ ] **Step 2: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/domains/habits/components/statistics/HabitStatsDayView.tsx
  git commit -m "feat(habits): [016] 日视图展开详情追加 startDate/totalLogs/longestStreak 字段"
  ```

---

## Task 5: 月视图数据层 — 重写 MonthDaySummary 和 getHabitStatsForMonth

**Files:**
- Modify: `frontend/src/app/actions/habit-stats.ts`

- [ ] **Step 1: 修改 MonthDaySummary 接口**

  修改 `frontend/src/app/actions/habit-stats.ts` 第138-142行：

  ```ts
  // 从：
  export interface MonthDaySummary {
    date: string
    day: number
    completedCount: number
  }

  // 改为：
  export interface MonthDaySummary {
    date: string
    day: number
    /** 当日已打卡习惯名称列表 */
    habitNames: string[]
  }
  ```

- [ ] **Step 2: 重写 getHabitStatsForMonth 函数**

  修改 `frontend/src/app/actions/habit-stats.ts` 第144-167行：

  ```ts
  export async function getHabitStatsForMonth(year: number, month: number): Promise<MonthDaySummary[]> {
    const habitRepo = new HabitRepository()
    const logRepo = new HabitLogRepository()

    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const startDate = `${monthStr}-01` as DateOnly
    const endDate = `${monthStr}-${new Date(year, month, 0).getDate()}` as DateOnly

    const [logsByHabit, habits] = await Promise.all([
      logRepo.findByDateRange(MVP_USER_ID, startDate, endDate),
      habitRepo.findByUserId(MVP_USER_ID),
    ])

    // 建立 habitId -> title 映射
    const habitTitleMap = new Map(habits.map(h => [h.id, h.title]))

    // 按日期聚合 completed 状态的 habit 名称
    const namesByDate = new Map<string, string[]>()
    for (const [habitId, logs] of logsByHabit.entries()) {
      const title = habitTitleMap.get(habitId) ?? '未知习惯'
      for (const log of logs) {
        if (log.completionStatus === 'completed') {
          const existing = namesByDate.get(log.date) ?? []
          existing.push(title)
          namesByDate.set(log.date, existing)
        }
      }
    }

    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
      return { date: dateStr, day, habitNames: namesByDate.get(dateStr) ?? [] }
    })
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/app/actions/habit-stats.ts
  git commit -m "feat(habits): [016] 月视图数据层改为返回 habitNames 列表"
  ```

---

## Task 6: 月视图 UI 层 — 重写 HabitStatsMonthView

**Files:**
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx`

- [ ] **Step 1: 重写整个组件**

  将 `frontend/src/domains/habits/components/statistics/HabitStatsMonthView.tsx` 的内容完全替换为：

  ```tsx
  "use client"

  import type { MonthDaySummary } from "@/app/actions/habit-stats"
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "@/components/ui/tooltip"

  interface HabitStatsMonthViewProps {
    data: MonthDaySummary[]
  }

  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
  const MAX_DISPLAY = 4

  export function HabitStatsMonthView({ data }: HabitStatsMonthViewProps) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const firstDayOfWeek = new Date(
      data[0] ? parseInt(data[0].date.slice(0, 4)) : today.getFullYear(),
      data[0] ? parseInt(data[0].date.slice(5, 7)) - 1 : today.getMonth(),
      1,
    ).getDay()
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

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
      <div>
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
                  const displayed = day.habitNames.slice(0, MAX_DISPLAY)
                  const remaining = day.habitNames.length - MAX_DISPLAY
                  const hasMore = remaining > 0

                  return (
                    <td key={day.date} className={`py-1.5 px-0.5 text-center ${isToday ? 'bg-primary/5 rounded' : ''}`}>
                      <div className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-ink'}`}>{day.day}</div>
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        {displayed.map((name, i) => (
                          <span
                            key={i}
                            className="inline-block truncate rounded bg-surface-soft px-1.5 py-0.5 text-[10px] text-ink"
                            title={name}
                          >
                            {name}
                          </span>
                        ))}
                        {hasMore && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-primary">
                                  +{remaining} more
                                </span>
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
                        )}
                      </div>
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

- [ ] **Step 2: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/domains/habits/components/statistics/HabitStatsMonthView.tsx
  git commit -m "feat(habits): [016] 月视图改为显示习惯名称列表，4项截断+Tooltip悬停展开"
  ```

---

## Task 7: 时间盒月视图 — 增加悬停显示全部事件

**Files:**
- Modify: `frontend/src/domains/timebox/components/month-view.tsx`

- [ ] **Step 1: 导入 Tooltip 组件**

  在 `frontend/src/domains/timebox/components/month-view.tsx` 的 import 区域添加：

  ```tsx
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "@/components/ui/tooltip"
  ```

- [ ] **Step 2: 添加自定义 showMore 组件到 Calendar**

  修改 `frontend/src/domains/timebox/components/month-view.tsx`，在 `<Calendar` 组件的 props 中添加 `components`：

  ```tsx
  // 在 <Calendar 组件的属性中添加 components prop（放在 toolbar={false} 之后）
  <Calendar
    localizer={localizer}
    events={events}
    startAccessor="start"
    endAccessor="end"
    date={currentDate}
    style={{ height: 500 }}
    messages={{
      today: "今天",
      previous: "上一页",
      next: "下一页",
      month: "月",
      week: "周",
      day: "日",
      agenda: "日程",
    }}
    eventPropGetter={(event: CalendarEvent) => ({
      style: {
        backgroundColor: STATUS_BG[event.status] ?? STATUS_BG.planned,
        color: event.status === "running" ? "#ffffff" : "#141413",
        borderLeft: `4px solid ${BORDER_COLOR_MAP[getCardBorderColor(event.executionRecord)] ?? "transparent"}`,
      },
    })}
    views={["month"]}
    defaultView="month"
    toolbar={false}
    components={{
      showMore: ({ count, remainingEvents }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rbc-button-link rbc-show-more">
                +{count} more
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              <div className="flex flex-col gap-1">
                {remainingEvents.map((evt: CalendarEvent, i: number) => (
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

- [ ] **Step 3: Commit**

  ```bash
  cd /home/walker/lifeware/frontend
  git add src/domains/timebox/components/month-view.tsx
  git commit -m "feat(timebox): [016] 月视图 +more 按钮增加 Tooltip 悬停显示全部事件"
  ```

---

## Task 8: 验证与测试

**Files:**
- All modified files

- [ ] **Step 1: TypeScript 类型检查**

  ```bash
  cd /home/walker/lifeware/frontend
  npx tsc --noEmit --pretty 2>&1 | head -50
  ```

  Expected: 无与本次修改相关的类型错误。

- [ ] **Step 2: Lint 检查**

  ```bash
  cd /home/walker/lifeware/frontend
  npm run lint
  ```

  Expected: 无新增 lint 错误。

- [ ] **Step 3: 运行 habits 相关测试**

  ```bash
  cd /home/walker/lifeware/frontend
  npx jest --testPathPattern="habits" --passWithNoTests
  ```

  Expected: 现有测试通过。

- [ ] **Step 4: 手动验证页面**

  ```bash
  cd /home/walker/lifeware/frontend
  npm run dev
  ```

  在浏览器中访问：
  1. `http://localhost:3000/habits/statistics` — 确认日/周/月三种视图正常加载
  2. 日视图：点击某行习惯，确认展开区域显示 5 个字段（当前连续、7日完成率、开始时间、打卡总次数、最长连续）
  3. 月视图：确认日期格子中显示习惯名称（而非数字），超过 4 项显示 `+x more`，悬停展示全部
  4. 主页时间盒月视图：确认 `+x more` 悬停展示全部事件标题

- [ ] **Step 5: 最终 Commit**

  如果有任何修复：

  ```bash
  cd /home/walker/lifeware/frontend
  git add .
  git commit -m "fix(habits): [015][016] 修复类型检查和 lint 问题"
  ```

---

## Self-Review Checklist

### Spec Coverage

| 需求 | 对应 Task |
|------|----------|
| [015] 删除 `/myHabits`、`/habitStats` action | Task 1, Task 2 |
| [015] 删除 `HabitListCard` 组件 | Task 2 |
| [016] 日视图追加 startDate | Task 3, Task 4 |
| [016] 日视图追加 totalLogs | Task 3, Task 4 |
| [016] 日视图追加 longestStreak | Task 3, Task 4 |
| [016] 月视图显示习惯名称列表 | Task 5, Task 6 |
| [016] 月视图 4 项截断 | Task 6 |
| [016] 月视图 +x more 悬停 | Task 6 |
| [016] 时间盒月视图悬停 | Task 7 |

### Placeholder Scan

- [x] 无 "TBD"、"TODO"、"implement later"、"fill in details"
- [x] 无 "Add appropriate error handling" 等模糊描述
- [x] 无 "Similar to Task N" 的跨引用
- [x] 每个步骤包含完整代码

### Type Consistency

- [x] `HabitDayRow` 接口中字段名一致：`startDate`、`totalLogs`、`longestStreak`
- [x] `MonthDaySummary` 接口中 `habitNames` 在数据层和 UI 层一致
- [x] `MAX_DISPLAY = 4` 常量统一
- [x] Tooltip 组件导入路径一致：`@/components/ui/tooltip`
