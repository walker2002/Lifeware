"use client"

/**
 * @file HabitStatsMonthView
 * @brief 习惯统计月视图组件
 *
 * 使用 react-big-calendar 展示每月各日的已打卡习惯名称列表，
 * 与时间盒月视图保持一致的日历界面样式。
 */

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { MonthDaySummary } from "@/app/actions/habit-stats"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import "react-big-calendar/lib/css/react-big-calendar.css"

/** 月视图属性 */
interface HabitStatsMonthViewProps {
  /** 月视图数据 */
  data: MonthDaySummary[]
}

/** 日历事件 */
interface HabitCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
}

const locales = { "zh-CN": zhCN }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

/**
 * 习惯统计月视图
 *
 * @param props - 组件属性
 * @returns 月视图 JSX
 */
export function HabitStatsMonthView({ data }: HabitStatsMonthViewProps) {
  const events = useMemo<HabitCalendarEvent[]>(() => {
    const result: HabitCalendarEvent[] = []
    for (const day of data) {
      const baseDate = new Date(day.date)
      baseDate.setHours(0, 0, 0, 0)
      for (const name of day.habitNames) {
        result.push({
          id: `${day.date}-${name}`,
          title: name,
          start: new Date(baseDate),
          end: new Date(baseDate),
          allDay: true,
        })
      }
    }
    return result
  }, [data])

  return (
    <div className="w-full rounded-lg border border-hairline bg-surface-card p-4">
      <style>{`
        .rbc-calendar { font-family: "Inter", sans-serif; }
        .rbc-header { border-bottom-color: #e6dfd8; }
        .rbc-month-view { border-color: #e6dfd8; }
        .rbc-month-row + .rbc-month-row, .rbc-header + .rbc-header { border-color: #ebe6df; }
        .rbc-today { background: #f5f0e8; }
        .rbc-off-range-bg { background: #faf9f5; }
        .rbc-event { border: none; border-radius: 4px; font-size: 11px; line-height: 14px; min-height: 16px; background-color: #f5f0e8 !important; color: #141413 !important; }
        .rbc-event-content { font-size: 11px; }
      `}</style>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        date={data[0] ? new Date(data[0].date) : new Date()}
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
                    {remainingEvents.map((evt: HabitCalendarEvent, i: number) => (
                      <span key={i} className="text-xs truncate">{evt.title}</span>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ),
        }}
      />
    </div>
  )
}
