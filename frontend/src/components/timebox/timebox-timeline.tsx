"use client"

import type { TimeboxSummary } from "@/usom/types/summaries"
import type { TimeboxStatus } from "@/usom/types/primitives"
import { getCardBorderColor } from "@/lib/color-coding"

interface TimeboxTimelineProps {
  timeboxes: TimeboxSummary[]
}

// 时间轴范围
const TIMELINE_START = 6   // 06:00
const TIMELINE_END = 23    // 23:00
const HOURS = TIMELINE_END - TIMELINE_START

// 状态颜色映射
const STATUS_COLORS: Record<TimeboxStatus, string> = {
  planned: "bg-hairline-soft border-hairline",
  running: "bg-primary/20 border-primary",
  overtime: "bg-orange-500/20 border-orange-500",
  ended: "bg-hairline-soft border-hairline",
  cancelled: "bg-gray-300/20 border-gray-300",
  logged: "bg-success/20 border-success",
}

/** 将 ISO 时间戳转换为小时数（小数） */
function timestampToHours(ts: string): number {
  const d = new Date(ts)
  return d.getHours() + d.getMinutes() / 60
}

/** 计算时长（小时） */
function durationHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
}

/** 格式化小时为 HH:MM */
function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`
}

/**
 * TimeboxTimeline — 垂直可视化时间轴
 *
 * 左侧 06:00-23:00 时间刻度，右侧时间盒色块。
 */
export function TimeboxTimeline({ timeboxes }: TimeboxTimelineProps) {
  if (timeboxes.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-hairline bg-surface-card p-8">
        <p className="text-sm text-body">暂无时间安排</p>
      </div>
    )
  }

  const currentHour = new Date().getHours() + new Date().getMinutes() / 60
  const nowPercent = Math.max(0, Math.min(100, ((currentHour - TIMELINE_START) / HOURS) * 100))

  return (
    <div className="relative rounded-lg border border-hairline bg-surface-card p-4">
      {/* 时间刻度 + 时间盒色块 */}
      <div className="relative" style={{ height: `${HOURS * 40}px` }}>
        {/* 小时刻度线 */}
        {Array.from({ length: HOURS + 1 }, (_, i) => {
          const hour = TIMELINE_START + i
          const top = (i / HOURS) * 100
          return (
            <div key={hour} className="absolute left-0 right-0" style={{ top: `${top}%` }}>
              <span className="absolute -left-0 -translate-y-1/2 text-xs text-body">
                {formatHour(hour)}
              </span>
              <div className="ml-10 -translate-y-1/2 border-t border-hairline" />
            </div>
          )
        })}

        {/* 当前时间指示线 */}
        {nowPercent > 0 && nowPercent < 100 && (
          <div
            className="absolute left-10 right-0 z-10 border-t-2 border-primary"
            style={{ top: `${nowPercent}%` }}
          >
            <div className="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
          </div>
        )}

        {/* 时间盒色块 */}
        {timeboxes.map((tb) => {
          const startH = timestampToHours(tb.startTime)
          const durH = durationHours(tb.startTime, tb.endTime)
          const top = ((startH - TIMELINE_START) / HOURS) * 100
          const height = (durH / HOURS) * 100
          const colorClass = STATUS_COLORS[tb.status] ?? STATUS_COLORS.planned
          const borderColor = getCardBorderColor(tb.executionRecord)

          return (
            <div
              key={tb.id}
              className={`absolute left-12 right-2 rounded-md border-l-4 px-2 py-1 ${colorClass} ${borderColor} border-t border-r border-b`}
              style={{ top: `${top}%`, height: `${Math.max(height, 2)}%` }}
            >
              <p className="truncate text-xs font-medium text-ink">{tb.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
