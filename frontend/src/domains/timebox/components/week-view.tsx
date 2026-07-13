/**
 * @file week-view
 * @brief 时间盒周视图组件
 *
 * 使用 react-big-calendar 展示每周的时间盒事件。
 *
 * [023.12] T13 (AM4) — STATUS_BG 收窄为 3 键（planned/logged/cancelled）。
 *   历史 running/overtime/ended 派生显示态在 023.12 中已废（[023.12] T6 4 态收敛）：
 *   status 字段不再含 'running'|'overtime'|'ended'。派生态（overtime/running）由
 *   `deriveTimeboxDisplayStatus(status, startTime, endTime, now)` 计算，但
 *   日历网格层不做 per-second 派生，渲染时仅基于持久 status 取色。
 *
 * [TZ-2.1] rbc tz 注入：date-fns v4 `format` / `startOfWeek` 通过 `in: tz(tzName)` option
 *   按 user_tz 渲染。`@date-fns/tz` v1.4.1（date-fns v4 官方 tz 包，已装为 peer dep）提供
 *   `tz(timeZone)` factory 函数。MVP Shanghai-only 下浏览器 TZ=Shanghai 巧合 OK；
 *   Tokyo / UTC user 场景下 rbc 按 user_tz 正确显示（[TZ-2] 仍 defer [TZ-2.1] 之外的边界）。
 */
"use client"

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { tz } from "@date-fns/tz"
import type { FormatOptions } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { TimeboxStatus } from "@/usom/types/primitives"
import type { ExecutionRecord } from "@/usom/types/objects"
import { getCardBorderColor } from "@/lib/color-coding"
import { useUserTz } from "@/contexts/user-timezone-context"
import "react-big-calendar/lib/css/react-big-calendar.css"

interface WeekViewProps {
  timeboxes: TimeboxSummary[]
  currentDate: Date
}

const STATUS_BG: Record<TimeboxStatus, string> = {
  planned: "#e6dfd8",
  cancelled: "#d1d5db",
  logged: "#5db872",
}

const BORDER_COLOR_MAP: Record<string, string> = {
  "border-l-coral-400": "#e8a090",
  "border-l-slate-400": "#94a3e8",
  "border-l-amber-400": "#fbbf24",
  "border-l-gray-400": "#9ca3af",
  "border-l-transparent": "transparent",
}

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  status: TimeboxStatus
  executionRecord?: ExecutionRecord
}

const locales = { "zh-CN": zhCN }

export function WeekView({ timeboxes, currentDate }: WeekViewProps) {
  // [TZ-2.1] user_tz 注入：用 `tz(userTz)` 包装 date-fns `format` / `startOfWeek`，
  //   rbc 按 user_tz 渲染事件时间与周界（Tokyo user 看到 Tokyo 9:00 而非浏览器 Shanghai 17:00）。
  //   localizer 用 useMemo 缓存（每次 tz 变化重建，user_tz 来自 DB 几乎不变）。
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

  const events = useMemo<CalendarEvent[]>(
    () =>
      timeboxes.map((tb) => ({
        id: tb.id,
        title: tb.title,
        start: new Date(tb.startTime),
        end: new Date(tb.endTime),
        status: tb.status,
        executionRecord: tb.executionRecord,
      })),
    [timeboxes],
  )

  return (
    <div className="w-full rounded-lg border border-hairline bg-surface-card p-4">
      <style>{`
        .rbc-calendar { font-family: "Inter", sans-serif; }
        .rbc-header { border-bottom-color: #e6dfd8; }
        .rbc-time-view { border-color: #e6dfd8; }
        .rbc-day-bg + .rbc-day-bg, .rbc-header + .rbc-header { border-color: #ebe6df; }
        .rbc-today { background: #f5f0e8; }
        .rbc-off-range-bg { background: #faf9f5; }
        .rbc-event { border: none; border-radius: 4px; font-size: 12px; }
      `}</style>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        date={currentDate}
        style={{ height: 960 }}
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
            backgroundColor: STATUS_BG[event.status] ?? STATUS_BG.planned,
            color: "#141413",
            borderLeft: `4px solid ${BORDER_COLOR_MAP[getCardBorderColor(event.executionRecord)] ?? "transparent"}`,
          },
        })}
        views={["week"]}
        defaultView="week"
        toolbar={false}
      />
    </div>
  )
}