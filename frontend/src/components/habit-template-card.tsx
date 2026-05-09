"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface HabitTemplateCardProps {
  name: string
  applicableDays: number[]
  habits: { title: string; defaultTime: string; defaultDuration: number }[]
  onApply?: () => void
  onEdit?: () => void
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"]

function formatDays(days: number[]): string {
  if (days.length === 7) return "每天"
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return "工作日"
  if (days.length === 2 && [0, 6].every(d => days.includes(d))) return "周末"
  return days.map(d => `周${DAY_LABELS[d]}`).join("、")
}

export function HabitTemplateCard({ name, applicableDays, habits, onApply, onEdit }: HabitTemplateCardProps) {
  const totalMinutes = habits.reduce((sum, h) => sum + h.defaultDuration, 0)

  // 计算时间范围
  const earliestMin = habits.length > 0
    ? Math.min(...habits.map(h => { const [hr, min] = h.defaultTime.split(":").map(Number); return hr * 60 + min }))
    : 0
  const latestMin = habits.length > 0
    ? Math.max(...habits.map(h => { const [hr, min] = h.defaultTime.split(":").map(Number); return hr * 60 + min + h.defaultDuration }))
    : 0

  // 迷你时间轴
  const dayStart = 6 * 60 // 06:00
  const dayEnd = 24 * 60 // 24:00
  const range = dayEnd - dayStart || 1

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{name}</span>
            <Badge variant="outline">{formatDays(applicableDays)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{habits.length} 个习惯 · {totalMinutes} 分钟</span>
        </div>

        {/* 迷你时间轴 */}
        <div className="relative h-3 rounded-full bg-muted">
          {habits.map((habit, i) => {
            const [h, m] = habit.defaultTime.split(":").map(Number)
            const start = h * 60 + m - dayStart
            const width = habit.defaultDuration
            return (
              <div
                key={i}
                className="absolute top-0 h-full rounded-full bg-primary/60"
                style={{
                  left: `${(start / range) * 100}%`,
                  width: `${(width / range) * 100}%`,
                }}
                title={`${habit.title} ${habit.defaultTime} (${habit.defaultDuration}min)`}
              />
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {onApply && (
            <Button size="sm" onClick={onApply}>用模板安排今天</Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>编辑</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
