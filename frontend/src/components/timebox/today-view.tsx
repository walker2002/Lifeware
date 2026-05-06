"use client"

import { TimeboxList } from "@/components/timebox-list"
import { TimeboxTimeline } from "./timebox-timeline"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface TodayViewProps {
  timeboxes: TimeboxSummary[]
}

/**
 * TodayView — 今日模式视图
 *
 * CSS Grid 两栏：左列列表 + 右列时间轴。
 * 移动端折叠为单列。
 */
export function TodayView({ timeboxes }: TodayViewProps) {
  const sorted = [...timeboxes].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TimeboxList timeboxes={sorted} compact />
      <TimeboxTimeline timeboxes={sorted} />
    </div>
  )
}
