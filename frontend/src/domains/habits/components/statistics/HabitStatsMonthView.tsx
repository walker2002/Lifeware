"use client"

/**
 * @file HabitStatsMonthView
 * @brief 习惯统计月视图组件
 *
 * 使用 react-big-calendar 展示每月各日的已打卡习惯名称列表，
 * 与时间盒月视图保持一致的日历界面样式。
 *
 * 使用 showAllEvents 绕过 react-big-calendar 的行数测量，
 * 自行控制每天最多显示 4 项习惯 + "+x more" Tooltip。
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

/** 每天最多显示的习惯数量 */
const MAX_VISIBLE = 4

/** 习惯日历事件 */
interface HabitCalendarEvent {
  /** 唯一标识 */
  id: string
  /** 显示标题 */
  title: string
  /** 开始时间 */
  start: Date
  /** 结束时间 */
  end: Date
  /** 是否全天 */
  allDay: boolean
  /** 事件类型：habit 或 showMore */
  type: "habit" | "showMore"
  /** showMore 类型时，被隐藏的习惯名称列表 */
  hiddenNames?: string[]
}

/** 自定义事件渲染组件属性 */
interface HabitEventProps {
  /** 事件对象 */
  event: HabitCalendarEvent
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
 * 自定义事件渲染组件
 *
 * 对 showMore 类型的事件渲染带 Tooltip 的 "+x more" 按钮。
 */
function HabitEvent({ event }: HabitEventProps) {
  if (event.type === "showMore" && event.hiddenNames) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">+{event.hiddenNames.length} more</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            <div className="flex flex-col gap-1">
              {event.hiddenNames.map((name, i) => (
                <span key={i} className="text-xs truncate">{name}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return <span>{event.title}</span>
}

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
      const names = day.habitNames
      const visible = names.slice(0, MAX_VISIBLE)
      const hidden = names.slice(MAX_VISIBLE)

      for (const name of visible) {
        result.push({
          id: `${day.date}-${name}`,
          title: name,
          start: new Date(baseDate),
          end: new Date(baseDate),
          allDay: true,
          type: "habit",
        })
      }

      if (hidden.length > 0) {
        result.push({
          id: `${day.date}-more`,
          title: `+${hidden.length} more`,
          start: new Date(baseDate),
          end: new Date(baseDate),
          allDay: true,
          type: "showMore",
          hiddenNames: hidden,
        })
      }
    }
    return result
  }, [data])

  return (
    <div className="habit-month-calendar w-full rounded-lg border border-hairline bg-surface-card p-4">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        date={data[0] ? new Date(data[0].date) : new Date()}
        style={{ height: 650 }}
        showAllEvents
        messages={{
          today: "今天",
          previous: "上一页",
          next: "下一页",
          month: "月",
          week: "周",
          day: "日",
          agenda: "日程",
        }}
        eventPropGetter={(event: HabitCalendarEvent) => ({
          style: {
            backgroundColor: event.type === "showMore" ? "transparent" : "var(--surface-soft)",
            color: "var(--ink)",
            border: "none",
            borderRadius: "4px",
            padding: "2px 4px",
            fontSize: "12px",
            lineHeight: "16px",
            minHeight: "16px",
            cursor: event.type === "showMore" ? "pointer" : "default",
          },
        })}
        views={["month"]}
        defaultView="month"
        toolbar={false}
        components={{
          event: HabitEvent,
        }}
      />
    </div>
  )
}
