"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HabitCard } from "@/components/habit-card"
import { cn } from "@/lib/utils"

interface HabitItem {
  id: string
  title: string
  trackable: boolean
  defaultTime: string
  earliestTime: string
  latestEndTime: string
  defaultDuration: number
  minDuration: number
  streak: number
  status: string
  frequencyType?: string
}

type FilterType = "all" | "trackable" | "timeonly"

interface HabitListProps {
  /** 习惯列表 */
  habits: HabitItem[]
  /** 新建习惯回调 */
  onCreate: () => void
  /** 编辑回调 */
  onEdit: (id: string) => void
  /** 状态切换回调 */
  onStatusChange: (id: string, action: string) => void
}

const filterLabels: { value: FilterType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "trackable", label: "可追踪" },
  { value: "timeonly", label: "仅占时" },
]

export function HabitList({ habits, onCreate, onEdit, onStatusChange }: HabitListProps) {
  const [filter, setFilter] = useState<FilterType>("all")

  const filtered = habits.filter((h) => {
    if (filter === "trackable") return h.trackable
    if (filter === "timeonly") return !h.trackable
    return true
  })

  const activeCount = habits.filter((h) => h.status === "active" || h.status === "draft").length

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {activeCount} 个习惯
        </span>
        <Button size="sm" onClick={onCreate}>
          + 新建习惯
        </Button>
      </div>

      {/* 筛选标签 */}
      <div className="flex items-center gap-1">
        {filterLabels.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 习惯卡片列表 */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {habits.length === 0
            ? "还没有习惯，点击「新建习惯」开始"
            : "当前筛选条件下没有习惯"}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((habit) => (
            <HabitCard
              key={habit.id}
              title={habit.title}
              trackable={habit.trackable}
              defaultTime={habit.defaultTime}
              earliestTime={habit.earliestTime}
              latestEndTime={habit.latestEndTime}
              defaultDuration={habit.defaultDuration}
              minDuration={habit.minDuration}
              streak={habit.streak}
              status={habit.status}
              frequencyType={habit.frequencyType}
              onEdit={() => onEdit(habit.id)}
              onStatusChange={(action) => onStatusChange(habit.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
