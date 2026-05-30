"use client"

import { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, addWeeks, addMonths } from "date-fns"
import { zhCN } from "date-fns/locale"
import { HabitStatsDayView } from "../components/statistics/HabitStatsDayView"
import { HabitStatsWeekView } from "../components/statistics/HabitStatsWeekView"
import { HabitStatsMonthView } from "../components/statistics/HabitStatsMonthView"
import { getHabitStatsForDay, getHabitStatsForWeek, getHabitStatsForMonth, type HabitDayRow, type HabitWeekMatrix, type MonthDaySummary } from "@/app/actions/habit-stats"

type ViewMode = "day" | "week" | "month"

export function HabitStatisticsPage() {
  const [tab, setTab] = useState<ViewMode>("day")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dayData, setDayData] = useState<HabitDayRow[]>([])
  const [weekData, setWeekData] = useState<HabitWeekMatrix[]>([])
  const [monthData, setMonthData] = useState<MonthDaySummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tab !== "day") return
    setLoading(true)
    getHabitStatsForDay(currentDate).then(d => { setDayData(d); setLoading(false) })
  }, [tab, currentDate])

  useEffect(() => {
    if (tab !== "week") return
    setLoading(true)
    getHabitStatsForWeek(currentDate).then(d => { setWeekData(d); setLoading(false) })
  }, [tab, currentDate])

  useEffect(() => {
    if (tab !== "month") return
    setLoading(true)
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth() + 1
    getHabitStatsForMonth(y, m).then(d => { setMonthData(d); setLoading(false) })
  }, [tab, currentDate])

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-lg font-bold text-ink mb-4">习惯统计</h1>

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

        {loading && <p className="text-sm text-body/40">加载中...</p>}
        {tab === "day" && !loading && <HabitStatsDayView data={dayData} />}
        {tab === "week" && !loading && (
          <HabitStatsWeekView
            data={weekData}
            weekLabel={`${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')} — ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')}`}
            onPrev={() => setCurrentDate(addWeeks(currentDate, -1))}
            onNext={() => setCurrentDate(addWeeks(currentDate, 1))}
          />
        )}
        {tab === "month" && !loading && (
          <HabitStatsMonthView
            data={monthData}
            year={currentDate.getFullYear()}
            month={currentDate.getMonth() + 1}
            onPrev={() => setCurrentDate(addMonths(currentDate, -1))}
            onNext={() => setCurrentDate(addMonths(currentDate, 1))}
          />
        )}
      </div>

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
