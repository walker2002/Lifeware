"use client"

import { HomeBanner } from "@/components/layout/home-banner"
import { DateNav } from "@/domains/timebox/components/date-nav"
import { DayView } from "@/domains/timebox/components/day-view"
import { WeekView } from "@/domains/timebox/components/week-view"
import { MonthView } from "@/domains/timebox/components/month-view"
import type { DateViewMode } from "@/domains/timebox/components/types"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface ScheduleViewProps {
  timeboxes: TimeboxSummary[]
  dateMode: DateViewMode
  currentDate: Date
  onAction: (domainId: string, action: string) => void
  onDateModeChange: (mode: DateViewMode) => void
  onNavigate: (direction: 'prev' | 'next') => void
  onDateSelect: (date: Date) => void
  onTimeboxAction: (timeboxId: string, action: string) => void
}

export function ScheduleView({
  timeboxes, dateMode, currentDate,
  onAction, onDateModeChange, onNavigate, onDateSelect, onTimeboxAction,
}: ScheduleViewProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner onAction={onAction} />
      <DateNav mode={dateMode} currentDate={currentDate} onModeChange={onDateModeChange} onNavigate={onNavigate} />
      {dateMode === "day" && <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={onDateSelect} onAction={onTimeboxAction} />}
      {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
      {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
    </div>
  )
}
