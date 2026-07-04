/**
 * @file mini-calendar
 * @brief 月历缩略图（[026] A3.2 适配 kind 分支）
 *
 * 显示当月日历网格，标记有事件的日期。
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → TimeboxesEvent[]。
 * - 有任意 kind 的事件（timebox/itinerary）都标点
 * - 纯 timebox-only 输入（含空 itinerary）时与 T13 改动前字节级一致（IRON RULE 守护）
 *
 * [023.03] T4：route /schedule → /timeboxes，类型 ScheduleEvent → TimeboxesEvent。
 *
 * 拆分规则：调用方传 TimeboxesEvent[]，本组件按 e.kind 派生态不分支（仅判断有无）。
 */
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
import type { TimeboxesEvent } from "./timeboxes-event"

interface MiniCalendarProps {
  currentDate: Date
  selectedDate?: Date
  events: TimeboxesEvent[]
  onDateSelect?: (date: Date) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 判断指定日期是否有任意事件（timebox 或 itinerary） */
function hasEventOnDate(date: Date, events: TimeboxesEvent[]): boolean {
  return events.some((e) => {
    const start = new Date(e.start)
    return isSameDay(start, date)
  })
}

export function MiniCalendar({ currentDate, selectedDate, events, onDateSelect }: MiniCalendarProps) {
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
          const hasEvent = hasEventOnDate(day, events)

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
