"use client"

/**
 * @file HabitStatsMonthView
 * @brief 习惯统计月视图组件
 *
 * 以日历形式展示每月各日的已打卡习惯名称列表，
 * 每天最多显示 4 项，超出部分通过 Tooltip 悬停展开。
 */

import type { MonthDaySummary } from "@/app/actions/habit-stats"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** 月视图属性 */
interface HabitStatsMonthViewProps {
  /** 月视图数据 */
  data: MonthDaySummary[]
}

/** 星期标题 */
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 每天最多显示的习惯名称数量 */
const MAX_DISPLAY = 4

/**
 * 习惯统计月视图
 *
 * @param props - 组件属性
 * @returns 月视图 JSX
 */
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
