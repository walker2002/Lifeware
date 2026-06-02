"use client"

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
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

interface MonthViewProps {
  timeboxes: TimeboxSummary[]
  currentDate: Date
}

const STATUS_BG: Record<TimeboxStatus, string> = {
  planned: "#e6dfd8",
  running: "#cc785c",
  overtime: "#f97316",
  ended: "#8e8b82",
  cancelled: "#d1d5db",
  logged: "#5db872",
}

const BORDER_COLOR_MAP: Record<string, string> = {
  "border-l-coral-400": "#e8a090",
  "border-l-slate-400": "#94a3b8",
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
        executionRecord: tb.executionRecord,
      })),
    [timeboxes],
  )

  return (
    <div className="w-full rounded-lg border border-hairline bg-surface-card p-4">
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
            borderLeft: `4px solid ${BORDER_COLOR_MAP[getCardBorderColor(event.executionRecord)] ?? "transparent"}`,
            fontSize: '11px',
            lineHeight: '14px',
            minHeight: '16px',
          },
        })}
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
                    {remainingEvents.map((evt: CalendarEvent, i: number) => (
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
