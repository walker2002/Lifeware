"use client"

import { HomeBanner } from "@/components/layout/home-banner"
import { DateNav } from "@/domains/timebox/components/date-nav"
import { DayView } from "@/domains/timebox/components/day-view"
import { WeekView } from "@/domains/timebox/components/week-view"
import { MonthView } from "@/domains/timebox/components/month-view"
import { timeboxToEvent, type ScheduleEvent } from "@/domains/timebox/components/schedule-event"
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
  // [026] A3.2: DayView 接 ScheduleEvent[]，从 TimeboxSummary[] 透传 timeboxToEvent
  // 映射。home page 当前不显 itinerary（T14 GrowthMenu 集成阶段再加），所以
  // 此处仅含 kind='timebox'，保证 IRON RULE（纯 timebox-only 输入字节级一致）。
  const dayEvents: ScheduleEvent[] = timeboxes.map(timeboxToEvent)

  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner onAction={onAction} />
      <DateNav mode={dateMode} currentDate={currentDate} onModeChange={onDateModeChange} onNavigate={onNavigate} />
      {dateMode === "day" && <DayView events={dayEvents} currentDate={currentDate} onDateSelect={onDateSelect} onAction={onTimeboxAction} />}
      {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
      {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
    </div>
  )
}
