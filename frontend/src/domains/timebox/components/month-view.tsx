/**
 * @file month-view
 * @brief 时间盒月视图组件
 *
 * 使用 react-big-calendar 展示每月各日的时间盒事件，
 * 自行控制每天最多显示 4 项事件 + "+x more" Tooltip。
 *
 * [023.12] T13 (AM4) — 收窄为 3 键（planned/logged/cancelled）。running/overtime/ended
 *   不再是持久 status（[023.12] T6 4 态收敛），日历层不做 per-second 派生。
 *
 * [TZ-2.1] rbc tz 注入：date-fns v4 `format` / `startOfWeek` / `startOfDay` 通过
 *   `in: tz(tzName)` option 按 user_tz 渲染（@date-fns/tz v1.4.1，date-fns v4 官方 tz 包）。
 *   分组逻辑（`byDay` 聚合）也按 user_tz 的 Y-M-D 而非浏览器本地。
 *   Tokyo user 在 Shanghai 浏览器：原本会被聚合到昨天的事件，现在按 Tokyo 日期聚合。
 */
"use client"

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay, startOfDay } from "date-fns"
import { tz } from "@date-fns/tz"
import type { FormatOptions } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { TimeboxStatus } from "@/usom/types/primitives"
import type { ExecutionRecord } from "@/usom/types/objects"
import { getCardBorderColor } from "@/lib/color-coding"
import { useUserTz } from "@/contexts/user-timezone-context"
import { tzLocalToUtcMs } from "@/lib/tz"
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
// [023.12] T13 (AM4) — 收窄为 3 键（planned/logged/cancelled）。
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
  // [TZ-2.1] user_tz 注入：rbc localizer 按 user_tz 渲染；byDay 分组按 user_tz Y-M-D。
  const { tz: userTz } = useUserTz()
  const localizer = useMemo(
    () =>
      dateFnsLocalizer({
        format: (date: Date | number, formatStr: string, options?: FormatOptions) =>
          format(date, formatStr, { ...options, in: tz(userTz) }),
        parse,
        startOfWeek: (date: Date | number) =>
          startOfWeek(date, { weekStartsOn: 1, in: tz(userTz) }),
        getDay,
        locales,
      }),
    [userTz],
  )

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

    // [TZ-2.1] 按 user_tz 的 Y-M-DD 分组（而非浏览器本地）：
    //   Tokyo user 在 Shanghai 浏览器：原本会被聚合到昨天的事件（Shanghai 16:00 = UTC 8 / Tokyo 17:00）
    //   现在按 Tokyo 日期聚合（Tokyo 17:00 = "今天"）。
    const byDay = new Map<string, CalendarEvent[]>()
    for (const evt of rawEvents) {
      // [TZ-2.1] startOfDay + format 都传 in: tz(userTz)
      const dayKey = format(startOfDay(evt.start, { in: tz(userTz) }), "yyyy-MM-dd", { in: tz(userTz) })
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
        // [TZ-2.1] "+x more" 占位事件 baseDate 用 user_tz 的 day end (23:59 user_tz)。
        //   用 [TZ-1] lib/tz.ts:tzLocalToUtcMs 直接把 (YYYY-MM-DD 23:59 user_tz) 转 UTC，
        //   与 hhmmToIso 写路径算法一致（保证月视图日界与 timebox 创建时一致）。
        const [y, m, d] = dayKey.split('-').map(Number)
        const dayEndMs = tzLocalToUtcMs(y, m - 1, d, 23, 59, userTz)
        const baseDate = new Date(dayEndMs)
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
  }, [timeboxes, userTz])

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