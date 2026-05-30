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

        {loading && tab === "day" && <p className="text-sm text-body/40">加载中...</p>}
        {tab === "day" && !loading && <HabitStatsDayView data={dayData} />}
        {tab === "week" && <p className="py-8 text-center text-sm text-body/40">周视图开发中...</p>}
        {tab === "month" && <p className="py-8 text-center text-sm text-body/40">月视图开发中...</p>}
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
