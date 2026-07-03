/**
 * @file day-view
 * @brief 当日视图（[026] A3.2 适配 kind 分支）
 *
 * 三栏布局：左 TimeboxList（紧凑列），中 TimeboxTimeline（日时间轴），右 MiniCalendar。
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → ScheduleEvent[]。
 * - 排序由 mergeEvents()（schedule-event.ts）完成，本组件不再排序
 * - 三个子组件接 events: ScheduleEvent[]
 *
 * IRON RULE：纯 timebox-only 输入（含空 itinerary）时，
 * 渲染输出与 T13 改动前字节级一致——T15 回归测试会守护。
 */
"use client"

import { TimeboxList } from "./timebox-list"
import { TimeboxTimeline } from "./timebox-timeline"
import { MiniCalendar } from "./mini-calendar"
import type { ScheduleEvent } from "./schedule-event"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface DayViewProps {
  events: ScheduleEvent[]
  currentDate: Date
  onDateSelect?: (date: Date) => void
  onAction?: (timeboxId: string, action: string) => void
  onEdit?: (tb: TimeboxSummary) => void   // [023] A2 C1：卡片标题点击进入编辑
}

export function DayView({ events, currentDate, onDateSelect, onAction, onEdit }: DayViewProps) {
  return (
    <div className="grid w-full gap-4 md:[grid-template-columns:30%_40%_30%] max-md:grid-cols-1">
      <TimeboxList events={events} compact onAction={onAction} onEdit={onEdit} />
      <TimeboxTimeline events={events} />
      <div className="hidden md:block">
        <MiniCalendar
          currentDate={currentDate}
          selectedDate={currentDate}
          events={events}
          onDateSelect={onDateSelect}
        />
      </div>
    </div>
  )
}
