"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from "date-fns"
import { zhCN } from "date-fns/locale"
import { MiniCalendar } from "@/domains/timebox/components/mini-calendar"
import { HabitStatsDayView } from "../components/statistics/HabitStatsDayView"
import { HabitStatsWeekView } from "../components/statistics/HabitStatsWeekView"
import { HabitStatsMonthView } from "../components/statistics/HabitStatsMonthView"
import { PageBanner } from "@/components/layout/page-banner"
import { getHabitStatsForDay, getHabitStatsForWeek, getHabitStatsForMonth, type HabitDayRow, type HabitWeekMatrix, type MonthDaySummary } from "@/app/actions/habit-stats"

type ViewMode = "day" | "week" | "month"

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
]

function formatNavLabel(date: Date, mode: ViewMode): string {
  switch (mode) {
    case 'day':
      return format(date, 'yyyy年M月d日', { locale: zhCN })
    case 'week': {
      const ws = startOfWeek(date, { weekStartsOn: 1 })
      const we = endOfWeek(date, { weekStartsOn: 1 })
      return `${format(ws, 'M月d日')} - ${format(we, 'M月d日')}`
    }
    case 'month':
      return format(date, 'yyyy年M月', { locale: zhCN })
  }
}

function navigateDate(date: Date, mode: ViewMode, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  switch (mode) {
    case 'day': return addDays(date, delta)
    case 'week': return addWeeks(date, delta)
    case 'month': return addMonths(date, delta)
  }
}

export function HabitStatisticsPage() {
  const [tab, setTab] = useState<ViewMode>("day")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dayData, setDayData] = useState<HabitDayRow[]>([])
  const [weekData, setWeekData] = useState<HabitWeekMatrix[]>([])
  const [monthData, setMonthData] = useState<MonthDaySummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (tab === "day") {
      getHabitStatsForDay(currentDate).then(d => { setDayData(d); setLoading(false) })
    } else if (tab === "week") {
      getHabitStatsForWeek(currentDate).then(d => { setWeekData(d); setLoading(false) })
    } else {
      getHabitStatsForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1).then(d => { setMonthData(d); setLoading(false) })
    }
  }, [tab, currentDate])

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => navigateDate(prev, tab, direction))
  }, [tab])

  return (
    <div className="flex w-full flex-col gap-4">
      <PageBanner domainId="habits" title="习惯统计" />

      {/* DateNav — 与时间盒页面一致的导航 + Tab */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleNavigate('prev')}
            className="rounded-md p-1.5 text-body hover:bg-surface-soft hover:text-ink transition-colors"
            aria-label="上一页"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-40 text-center text-sm font-medium text-ink">
            {formatNavLabel(currentDate, tab)}
          </span>
          <button
            type="button"
            onClick={() => handleNavigate('next')}
            className="rounded-md p-1.5 text-body hover:bg-surface-soft hover:text-ink transition-colors"
            aria-label="下一页"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex gap-1 rounded-md bg-surface-soft p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setTab(m.value)}
              className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                tab === m.value
                  ? "bg-surface-card text-ink shadow-sm"
                  : "text-body hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-hairline animate-pulse" />
          ))}
        </div>
      )}

      {/* 日视图：左右分栏 + 右侧 MiniCalendar */}
      {tab === "day" && !loading && (
        <div className="grid w-full gap-4 md:[grid-template-columns:1fr_280px] max-md:grid-cols-1">
          <div className="rounded-lg border border-hairline bg-surface-card p-4">
            <HabitStatsDayView data={dayData} />
          </div>
          <div className="hidden md:block">
            <MiniCalendar
              currentDate={currentDate}
              selectedDate={currentDate}
              events={[]}
              onDateSelect={(d) => setCurrentDate(d)}
            />
          </div>
        </div>
      )}

      {/* 周视图：卡片包裹 */}
      {tab === "week" && !loading && (
        <div className="rounded-lg border border-hairline bg-surface-card p-4">
          <HabitStatsWeekView data={weekData} />
        </div>
      )}

      {/* 月视图：卡片包裹 */}
      {tab === "month" && !loading && (
        <div className="rounded-lg border border-hairline bg-surface-card p-4">
          <HabitStatsMonthView data={monthData} />
        </div>
      )}
    </div>
  )
}
