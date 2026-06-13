"use client"

import { useState, Fragment } from "react"
import { Check, X, Minus } from "lucide-react"
import type { HabitDayRow } from "@/app/actions/habit-stats"

interface HabitStatsDayViewProps {
  data: HabitDayRow[]
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-success-soft text-success"><Check className="size-3" /></span>
  if (status === "partially_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-warning-soft text-warning"><Minus className="size-3" /></span>
  if (status === "not_completed") return <span className="inline-flex size-5 items-center justify-center rounded bg-error-soft text-error"><X className="size-3" /></span>
  return <span className="inline-flex size-5 items-center justify-center rounded bg-surface-card text-muted-foreground/40"><Minus className="size-3" /></span>
}

function StreakBadge({ streak, completionRate7d }: { streak: number; completionRate7d: number }) {
  if (streak > 0) return <span className="text-xs text-success">✅ 连续{streak}天</span>
  if (completionRate7d < 0.3) return <span className="text-xs text-error">❌ 中断</span>
  return <span className="text-xs text-muted-foreground">—</span>
}

export function HabitStatsDayView({ data }: HabitStatsDayViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-body/70">暂无活跃习惯</p>
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
          <Fragment key={row.habitId}>
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
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-body/60">
                    <span>当前连续：<strong className="text-ink">{row.streak}</strong> 天</span>
                    <span>7日完成率：<strong className="text-ink">{Math.round(row.completionRate7d * 100)}%</strong></span>
                    <span>开始时间：<strong className="text-ink">{row.startDate || '未设置'}</strong></span>
                    <span>打卡总次数：<strong className="text-ink">{row.totalLogs}</strong></span>
                    <span>最长连续：<strong className="text-ink">{row.longestStreak}</strong> 天</span>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
