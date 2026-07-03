/**
 * @file timebox-timeline
 * @brief 垂直可视化时间轴（[026] A3.2 适配 kind 分支）
 *
 * 左侧 06:00-23:00 时间刻度，右侧事件色块。
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → ScheduleEvent[]。
 * - kind='timebox'：既有渲染路径（**与改动前字节级一致**，IRON RULE 守护）
 * - kind='itinerary'：行程色块（border-l-primary 锁定视觉）
 *
 * 拆分规则：调用方传 ScheduleEvent[]，本组件按 e.kind 分支渲染。
 */
"use client"

import type { ScheduleEvent } from "./schedule-event"
import type { TimeboxStatus } from "@/usom/types/primitives"
import { getCardBorderColor } from "@/lib/color-coding"

interface TimeboxTimelineProps {
  events: ScheduleEvent[]
}

// 时间轴范围
const TIMELINE_START = 0   // 00:00
const TIMELINE_END = 24    // 24:00
const HOURS = TIMELINE_END - TIMELINE_START

// 时间盒状态颜色映射（与 T13 改动前完全一致，IRON RULE 守护）
const STATUS_COLORS: Record<TimeboxStatus, string> = {
  planned: "bg-surface-soft border-hairline",
  running: "bg-primary/20 border-primary",
  overtime: "bg-warning/20 border-warning",
  ended: "bg-surface-soft border-hairline",
  cancelled: "bg-muted/20 border-muted",
  logged: "bg-success/20 border-success",
}

/** itinerary 行程色块样式（border-l-primary 锁定视觉） */
const ITINERARY_COLOR = "bg-primary/10 border-primary"

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
 * [026] A3.2 IRON RULE：纯 timebox-only 输入（含空 itinerary）时，
 * 渲染输出与 T13 改动前字节级一致——T15 回归测试会守护。
 */
export function TimeboxTimeline({ events }: TimeboxTimelineProps) {
  if (events.length === 0) {
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
      {/* 时间刻度 + 事件色块 */}
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

        {/* 事件色块（按 kind 分支） */}
        {events.map((e) => {
          const startH = timestampToHours(e.start)
          const durH = durationHours(e.start, e.end)
          const top = ((startH - TIMELINE_START) / HOURS) * 100
          const height = (durH / HOURS) * 100

          if (e.kind === "timebox") {
            const tb = e.source
            const colorClass = STATUS_COLORS[tb.status as TimeboxStatus] ?? STATUS_COLORS.planned
            const borderColor = getCardBorderColor(tb.executionRecord)
            return (
              <div
                key={e.id}
                className={`absolute left-12 right-2 rounded-md border-l-4 px-2 py-1 ${colorClass} ${borderColor} border-t border-r border-b`}
                style={{ top: `${top}%`, height: `${Math.max(height, 2)}%` }}
              >
                <p className="truncate text-xs font-medium text-ink">{tb.title}</p>
              </div>
            )
          }

          // kind === "itinerary"
          return (
            <div
              key={e.id}
              className={`absolute left-12 right-2 rounded-md border-l-4 px-2 py-1 ${ITINERARY_COLOR} border-t border-r border-b`}
              style={{ top: `${top}%`, height: `${Math.max(height, 2)}%` }}
            >
              <p className="truncate text-xs font-medium text-ink">{e.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
