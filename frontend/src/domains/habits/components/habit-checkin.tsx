"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface CheckinHabit {
  id: string
  title: string
  defaultTime: string
  streak: number
  todayLogged: boolean
  trackable: boolean
}

interface HabitCheckinProps {
  habits: CheckinHabit[]
  onLog: (habitId: string) => void
  onSkip: (habitId: string) => void
}

export function HabitCheckin({ habits, onLog, onSkip }: HabitCheckinProps) {
  const trackableHabits = habits.filter(h => h.trackable)
  const pending = trackableHabits.filter(h => !h.todayLogged)
  const completed = trackableHabits.filter(h => h.todayLogged)

  if (trackableHabits.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        没有需要打卡的习惯
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm font-medium text-ink">
        今日打卡 ({completed.length}/{trackableHabits.length})
      </div>

      {/* 待打卡 */}
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">待打卡</div>
          {pending.map(habit => (
            <Card key={habit.id}>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{habit.title}</span>
                  <span className="text-xs text-muted-foreground">{habit.defaultTime}</span>
                  {habit.streak > 0 && (
                    <Badge variant="outline">{habit.streak} 天连续</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onLog(habit.id)}>
                    完成
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onSkip(habit.id)}>
                    跳过
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 已完成 */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">已完成</div>
          {completed.map(habit => (
            <Card key={habit.id} className="opacity-60">
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{habit.title}</span>
                  <Badge variant="default">{habit.streak} 天连续</Badge>
                </div>
                <span className="text-xs text-success">已打卡</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
