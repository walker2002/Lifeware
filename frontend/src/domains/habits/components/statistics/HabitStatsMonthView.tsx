"use client"

import type { MonthDaySummary } from "@/app/actions/habit-stats"

interface HabitStatsMonthViewProps {
  data: MonthDaySummary[]
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function HabitStatsMonthView({ data }: HabitStatsMonthViewProps) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const firstDayOfWeek = new Date(data[0] ? parseInt(data[0].date.slice(0, 4)) : today.getFullYear(), data[0] ? parseInt(data[0].date.slice(5, 7)) - 1 : today.getMonth(), 1).getDay()
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
                return (
                  <td key={day.date} className={`py-1.5 text-center ${isToday ? 'bg-primary/5 rounded' : ''}`}>
                    <div className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-ink'}`}>{day.day}</div>
                    {day.habitNames.length > 0 && (
                      <span className="mt-0.5 inline-block rounded px-1 text-[10px] bg-emerald-50 text-emerald-600">
                        {day.habitNames.length}项
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
