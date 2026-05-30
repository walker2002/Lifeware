"use client"

import { useState, Fragment } from "react"
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
            <Fragment key={row.habitId}>
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
                      <span className="text-primary">查看历史详情 →</span>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
