/**
 * @file timebox-timeline
 * @brief 垂直可视化时间轴（[026] A3.2 适配 kind 分支 + [023.03] T2 重叠布局 / [023.05] PR2 T9 kind='appointment'）
 *
 * 左侧 06:00-23:00 时间刻度，右侧事件色块。
 *
 * [023.03] T2：timebox 块接入 computeOverlapLayout 算法。
 * - 同时间点 active 数 ≤4：等分宽度 + 列偏移
 * - >4：isOvercrowded fallback，width=100%, left=0（仅边框提示）
 * - appointment 仍按现状显示在底层（不参与列分配）
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → TimeboxesEvent[]。
 * - kind='timebox'：既有渲染路径（**与改动前字节级一致**，IRON RULE 守护）
 * - kind='appointment'：约定色块（border-l-primary 锁定视觉）
 *
 * [023.03] T4：route /schedule → /timeboxes，类型 ScheduleEvent → TimeboxesEvent。
 *
 * [023.05] PR2 T9：kind='itinerary' → 'appointment'（运行时判别）；注释「行程」
 * →「约定」；kind === "timebox" 保留；kind === "appointment" 区块标识保留
 * [023.03] T2 历史注释「itinerary 不参与布局」→「appointment 不参与布局」。
 *
 * 拆分规则：调用方传 TimeboxesEvent[]，本组件按 e.kind 分支渲染。
 */
"use client"

import type { TimeboxesEvent } from "./timeboxes-event"
import type { TimeboxStatus } from "@/usom/types/primitives"
import { getCardBorderColor } from "@/lib/color-coding"
import { computeOverlapLayout } from "@/domains/timebox/lib/overlap-layout"
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip"
import { getUserTzHour, getUserTzMinute } from "@/lib/tz"
import { useUserTz } from "@/contexts/user-timezone-context"

interface TimeboxTimelineProps {
  events: TimeboxesEvent[]
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

/** appointment 约定色块样式（border-l-primary 锁定视觉） */
const APPOINTMENT_COLOR = "bg-primary/10 border-primary"

/** 时间轴左侧刻度宽度 + 右侧间距（用于 left/width 计算） */
const AXIS_LEFT_REM = 2.5
const AXIS_RIGHT_REM = 0.5

/** 将 ISO 时间戳转换为小时数（小数，[TZ-2] 按 user_tz 显示，不再用浏览器本地） */
function timestampToHours(ts: string, tz: string): number {
  const d = new Date(ts)
  return getUserTzHour(d, tz) + getUserTzMinute(d, tz) / 60
}

/** 计算时长（小时） */
function durationHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
}

/** 格式化小时为 HH:MM */
function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`
}

export function TimeboxTimeline({ events }: TimeboxTimelineProps) {
  // [TZ-2] user_tz 注入（替代浏览器本地 getHours）
  const { tz } = useUserTz()
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-hairline bg-surface-card p-8">
        <p className="text-sm text-body">暂无时间安排</p>
      </div>
    )
  }

  // [TZ-2] 当前时刻红线也按 user_tz 算（Tokyo 用户看 Tokyo 红线位置）
  const now = new Date()
  const currentHour = getUserTzHour(now, tz) + getUserTzMinute(now, tz) / 60
  const nowPercent = Math.max(0, Math.min(100, ((currentHour - TIMELINE_START) / HOURS) * 100))

  // [023.03] T2：计算重叠布局
  const layouts = computeOverlapLayout(events)
  const layoutByEventId = new Map(layouts.map(l => [l.event.id, l]))

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
          const startH = timestampToHours(e.start, tz)
          const durH = durationHours(e.start, e.end)
          const top = ((startH - TIMELINE_START) / HOURS) * 100
          const height = (durH / HOURS) * 100

          if (e.kind === "timebox") {
            const tb = e.source
            const colorClass = STATUS_COLORS[tb.status as TimeboxStatus] ?? STATUS_COLORS.planned
            const borderColor = getCardBorderColor(tb.executionRecord)
            const layout = layoutByEventId.get(e.id)!
            // [023.03] T2：基于布局计算 left/width
            const widthPct = layout.isOvercrowded ? 100 : 100 / layout.totalCols
            const leftPct = layout.isOvercrowded ? 0 : layout.col * widthPct
            const overlapBorder = layout.totalCols > 1 ? "border-2 border-error" : ""
            const leftStyle = `calc(${AXIS_LEFT_REM}rem + (100% - ${AXIS_LEFT_REM}rem - ${AXIS_RIGHT_REM}rem) * ${leftPct / 100})`
            const widthStyle = `calc((100% - ${AXIS_LEFT_REM}rem - ${AXIS_RIGHT_REM}rem) * ${widthPct / 100})`
            const block = (
              <div
                key={e.id}
                className={`absolute rounded-md border-l-4 px-2 py-1 ${colorClass} ${borderColor} ${overlapBorder} border-t border-r border-b`}
                style={{
                  top: `${top}%`,
                  height: `${Math.max(height, 2)}%`,
                  left: leftStyle,
                  width: widthStyle,
                }}
              >
                <p className="truncate text-xs font-medium text-ink">{tb.title}</p>
              </div>
            )
            if (layout.totalCols > 1) {
              return (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>{block}</TooltipTrigger>
                  <TooltipContent>
                    <p>本时段有 {layout.totalCols} 个时间盒重叠</p>
                  </TooltipContent>
                </Tooltip>
              )
            }
            return block
          }

          // kind === "appointment"（[023.03] T2：appointment 不参与布局，保持 left-12 right-2）
          return (
            <div
              key={e.id}
              className={`absolute left-12 right-2 rounded-md border-l-4 px-2 py-1 ${APPOINTMENT_COLOR} border-t border-r border-b`}
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
