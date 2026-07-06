"use client"

/**
 * @file month-view
 * @brief 时间盒月视图组件
 *
 * 使用 react-big-calendar 展示每月各日的时间盒事件，
 * 自行控制每天最多显示 4 项事件 + "+x more" Tooltip。
 */

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay, startOfDay } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { TimeboxStatus } from "@/usom/types/primitives"
import type { ExecutionRecord } from "@/usom/types/objects"
import { getCardBorderColor } from "@/lib/color-coding"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import "react-big-calendar/lib/css/react-big-calendar.css"

/** 时间盒月视图属性 */
interface MonthViewProps {
  /** 时间盒列表 */
  timeboxes: TimeboxSummary[]
  /** 当前日期 */
  currentDate: Date
}

/** 每天最多显示的事件数量 */
const MAX_VISIBLE = 4

/** 状态背景色映射（CSS 变量令牌，自动适配亮/暗色模式） */
// [023.12] T13 (AM4) — 收窄为 3 键（planned/logged/cancelled）。running/overtime/ended
//   不再是持久 status（[023.12] T6 4 态收敛），日历层不做 per-second 派生。
const STATUS_BG: Record<TimeboxStatus, string> = {
  planned: "var(--status-planned-bg)",
  cancelled: "var(--status-cancelled-bg)",
  logged: "var(--status-logged-bg)",
}

/** 边框颜色映射（CSS 变量令牌，自动适配亮/暗色模式） */
const BORDER_COLOR_MAP: Record<string, string> = {
  "border-l-coral-400": "var(--border-coral)",
  "border-l-slate-400": "var(--border-slate)",
  "border-l-amber-400": "var(--border-amber)",
  "border-l-gray-400": "var(--border-gray)",
  "border-l-transparent": "transparent",
}

/** 日历事件 */
interface CalendarEvent {
  /** 唯一标识 */
  id: string
  /** 显示标题 */
  title: string
  /** 开始时间 */
  start: Date
  /** 结束时间 */
  end: Date
  /** 状态 */
  status: TimeboxStatus
  /** 执行记录 */
  executionRecord?: ExecutionRecord
  /** 是否为 "+x more" 占位事件 */
  isMore?: boolean
  /** isMore 时，被隐藏的事件列表 */
  hiddenEvents?: CalendarEvent[]
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
 * 对 "+x more" 类型的事件渲染带 Tooltip 的按钮。
 */
function TimeboxEvent({ event }: { event: CalendarEvent }) {
  if (event.isMore && event.hiddenEvents) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">
              +{event.hiddenEvents.length} more
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            <div className="flex flex-col gap-1">
              {event.hiddenEvents.map((evt, i) => (
                <span key={i} className="text-xs truncate">
                  {evt.title}
                </span>
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
 * 时间盒月视图
 *
 * @param props - 组件属性
 * @returns 月视图 JSX
 */
export function MonthView({ timeboxes, currentDate }: MonthViewProps) {
  const events = useMemo<CalendarEvent[]>(() => {
    // 原始事件转换
    const rawEvents: CalendarEvent[] = timeboxes.map((tb) => ({
      id: tb.id,
      title: tb.title,
      start: new Date(tb.startTime),
      end: new Date(tb.endTime),
      status: tb.status,
      executionRecord: tb.executionRecord,
    }))

    // 按开始日期分组
    const byDay = new Map<string, CalendarEvent[]>()
    for (const evt of rawEvents) {
      const dayKey = format(startOfDay(evt.start), "yyyy-MM-dd")
      const list = byDay.get(dayKey) ?? []
      list.push(evt)
      byDay.set(dayKey, list)
    }

    const visible: CalendarEvent[] = []
    const moreEvents: CalendarEvent[] = []

    for (const [dayKey, dayEvents] of byDay) {
      // 按开始时间排序
      dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
      const top = dayEvents.slice(0, MAX_VISIBLE)
      const hidden = dayEvents.slice(MAX_VISIBLE)

      visible.push(...top)

      if (hidden.length > 0) {
        const baseDate = new Date(dayKey)
        baseDate.setHours(23, 59, 59, 0)
        moreEvents.push({
          id: `${dayKey}-more`,
          title: `+${hidden.length} more`,
          start: new Date(baseDate),
          end: new Date(baseDate),
          status: "planned",
          isMore: true,
          hiddenEvents: hidden,
        })
      }
    }

    // 去重（同一事件可能在多天出现，但通常时间盒不跨天）
    const uniqueVisible = [...new Map(visible.map((e) => [e.id, e])).values()]

    return [...uniqueVisible, ...moreEvents]
  }, [timeboxes])

  return (
    <div className="timebox-month-calendar w-full rounded-lg border border-hairline bg-surface-card p-4">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        date={currentDate}
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
        eventPropGetter={(event: CalendarEvent) => ({
          style: {
            backgroundColor: event.isMore
              ? "transparent"
              : STATUS_BG[event.status] ?? STATUS_BG.planned,
            color: event.isMore ? "var(--ink)" : "var(--ink)",
            border: "none",
            borderLeft: event.isMore
              ? "none"
              : `4px solid ${BORDER_COLOR_MAP[getCardBorderColor(event.executionRecord)] ?? "transparent"}`,
            borderRadius: "4px",
            padding: "2px 4px",
            fontSize: "12px",
            lineHeight: "16px",
            minHeight: "16px",
            cursor: event.isMore ? "pointer" : "default",
          },
        })}
        views={["month"]}
        defaultView="month"
        toolbar={false}
        components={{
          event: TimeboxEvent,
        }}
      />
    </div>
  )
}
