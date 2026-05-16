"use client"

import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import { zhCN } from "date-fns/locale"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface MiniCalendarProps {
  currentDate: Date
  selectedDate?: Date
  timeboxes: TimeboxSummary[]
  onDateSelect?: (date: Date) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function hasTimeboxOnDate(date: Date, timeboxes: TimeboxSummary[]): boolean {
  return timeboxes.some((tb) => {
    const start = new Date(tb.startTime)
    return isSameDay(start, date)
  })
}

export function MiniCalendar({ currentDate, selectedDate, timeboxes, onDateSelect }: MiniCalendarProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const today = new Date()

  return (
    <div className="rounded-lg border border-hairline bg-surface-card p-3" style={{ maxWidth: 280 }}>
      {/* 月份标题 */}
      <div className="mb-2 text-center text-sm font-medium text-ink">
        {format(currentDate, 'yyyy年M月', { locale: zhCN })}
      </div>

      {/* 星期头 */}
      <div className="mb-1 grid grid-cols-7 gap-0">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1 text-center text-xs text-muted-foreground">
            {wd}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-0">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isToday = isSameDay(day, today)
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : isSameDay(day, currentDate)
          const hasEvent = hasTimeboxOnDate(day, timeboxes)

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!isCurrentMonth}
              onClick={() => onDateSelect?.(day)}
              className={`relative flex items-center justify-center rounded-md py-1 text-xs transition-colors ${
                !isCurrentMonth
                  ? "text-muted-foreground/40"
                  : isSelected
                    ? "bg-primary text-white font-medium"
                    : isToday
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-ink hover:bg-surface-soft"
              }`}
            >
              {format(day, 'd')}
              {hasEvent && isCurrentMonth && (
                <span className={`absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full ${
                  isSelected ? "bg-white" : "bg-primary"
                }`} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
