"use client"

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { TimeboxStatus } from "@/usom/types/primitives"
import "react-big-calendar/lib/css/react-big-calendar.css"

interface MonthViewProps {
  timeboxes: TimeboxSummary[]
  currentDate: Date
}

const STATUS_BG: Record<TimeboxStatus, string> = {
  planned: "#e6dfd8",
  running: "#cc785c",
  paused: "#d4a017",
  ended: "#8e8b82",
  logged: "#5db872",
}

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  status: TimeboxStatus
}

const locales = { "zh-CN": zhCN }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

export function MonthView({ timeboxes, currentDate }: MonthViewProps) {
  const events = useMemo<CalendarEvent[]>(
    () =>
      timeboxes.map((tb) => ({
        id: tb.id,
        title: tb.title,
        start: new Date(tb.startTime),
        end: new Date(tb.endTime),
        status: tb.status,
      })),
    [timeboxes],
  )

  return (
    <div className="rounded-lg border border-hairline bg-surface-card p-4">
      <style>{`
        .rbc-calendar { font-family: "Inter", sans-serif; }
        .rbc-header { border-bottom-color: #e6dfd8; }
        .rbc-month-view { border-color: #e6dfd8; }
        .rbc-month-row + .rbc-month-row, .rbc-header + .rbc-header { border-color: #ebe6df; }
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
        eventPropGetter={(event: CalendarEvent) => ({
          style: {
            backgroundColor: STATUS_BG[event.status] ?? STATUS_BG.planned,
            color: event.status === "running" ? "#ffffff" : "#141413",
          },
        })}
        views={["month"]}
        defaultView="month"
        toolbar={false}
      />
    </div>
  )
}
