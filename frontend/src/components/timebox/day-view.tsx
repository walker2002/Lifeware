"use client"

import { TimeboxList } from "@/components/timebox-list"
import { TimeboxTimeline } from "./timebox-timeline"
import { MiniCalendar } from "./mini-calendar"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface DayViewProps {
  timeboxes: TimeboxSummary[]
  currentDate: Date
  onDateSelect?: (date: Date) => void
}

export function DayView({ timeboxes, currentDate, onDateSelect }: DayViewProps) {
  const sorted = [...timeboxes].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  return (
    <div className="grid gap-4 md:[grid-template-columns:30%_40%_30%] max-md:grid-cols-1">
      <TimeboxList timeboxes={sorted} compact />
      <TimeboxTimeline timeboxes={sorted} />
      <div className="hidden md:block">
        <MiniCalendar
          currentDate={currentDate}
          selectedDate={currentDate}
          timeboxes={sorted}
          onDateSelect={onDateSelect}
        />
      </div>
    </div>
  )
}
