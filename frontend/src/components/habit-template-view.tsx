"use client"

import { cn } from "@/lib/utils"

interface TemplateHabitBlock {
  title: string
  startTime: string // HH:MM
  duration: number
  timeOverride?: string
  durationOverride?: number
}

interface Template {
  name: string
  habits: TemplateHabitBlock[]
}

interface HabitTemplateViewProps {
  templates: Template[]
}

/** HH:MM 转分钟 */
function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

/** 分钟转 HH:MM */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// 时间刻度: 06:00 到 24:00, 每小时一个刻度
const TIME_START = 6 * 60
const TIME_END = 24 * 60
const TIME_RANGE = TIME_END - TIME_START

export function HabitTemplateView({ templates }: HabitTemplateViewProps) {
  const hours: number[] = []
  for (let h = 6; h <= 24; h++) hours.push(h)

  return (
    <div className="flex gap-0 overflow-x-auto">
      {/* 左侧时间刻度 */}
      <div className="w-16 shrink-0">
        <div className="h-8" /> {/* 表头占位 */}
        <div className="relative" style={{ height: `${TIME_RANGE / 2}px` }}>
          {hours.map(h => (
            <div
              key={h}
              className="absolute right-2 text-xs tabular-nums text-muted-foreground -translate-y-1/2"
              style={{ top: `${((h * 60 - TIME_START) / TIME_RANGE) * 100}%` }}
            >
              {String(h % 24).padStart(2, "0")}:00
            </div>
          ))}
        </div>
      </div>

      {/* 模板列 */}
      {templates.map((tpl, colIdx) => (
        <div key={colIdx} className="flex-1 min-w-[200px] border-l px-2">
          {/* 列头 */}
          <div className="mb-2 text-center text-sm font-medium text-ink">{tpl.name}</div>

          {/* 时间轴 */}
          <div className="relative" style={{ height: `${TIME_RANGE / 2}px` }}>
            {/* 水平参考线 */}
            {hours.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-dashed border-muted"
                style={{ top: `${((h * 60 - TIME_START) / TIME_RANGE) * 100}%` }}
              />
            ))}

            {/* 习惯块 */}
            {tpl.habits.map((habit, i) => {
              const startTime = habit.timeOverride ?? habit.startTime
              const duration = habit.durationOverride ?? habit.duration
              const startMin = toMin(startTime) - TIME_START
              const top = (startMin / TIME_RANGE) * 100
              const height = (duration / TIME_RANGE) * 100
              const hasOverride = habit.timeOverride && habit.timeOverride !== habit.startTime

              return (
                <div
                  key={i}
                  className={cn(
                    "absolute left-1 right-1 rounded-md px-2 py-0.5 text-xs font-medium overflow-hidden",
                    "bg-primary/20 text-primary border border-primary/30",
                    hasOverride && "bg-amber-100 text-amber-800 border-amber-300",
                  )}
                  style={{ top: `${top}%`, height: `${Math.max(height, 1)}%` }}
                >
                  <span className="truncate">{habit.title}</span>
                  {hasOverride && (
                    <span className="ml-1 text-[10px] text-amber-600">
                      覆盖: {habit.timeOverride}
                    </span>
                  )}
                </div>
              )
            })}

            {/* 空白区域显示自由时间 */}
            {tpl.habits.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                — 自由时间 —
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 无模板时 */}
      {templates.length === 0 && (
        <div className="flex-1 py-12 text-center text-sm text-muted-foreground">
          还没有模板，请先创建习惯模板
        </div>
      )}
    </div>
  )
}
