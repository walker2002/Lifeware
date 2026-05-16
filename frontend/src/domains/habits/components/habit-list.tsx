"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HabitCard } from "./habit-card"
import { cn } from "@/lib/utils"

interface HabitItem {
  id: string
  title: string
  trackable: boolean
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  streak: number
  status: string
  frequencyType?: string
  description?: string
  longestStreak?: number
  completionRate7d?: number
}

type FilterType = "all" | "trackable" | "timeonly"
type StatusFilter = "all" | "draft" | "active" | "suspended" | "archived"

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

const statusLabels: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "active", label: "活跃" },
  { value: "suspended", label: "暂停" },
  { value: "archived", label: "归档" },
]

export function HabitList({ habits, onCreate, onEdit, onStatusChange }: HabitListProps) {
  const [typeFilter, setTypeFilter] = useState<FilterType>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  // 组合筛选：取交集
  const filtered = habits.filter((h) => {
    // 类型筛选
    if (typeFilter === "trackable" && !h.trackable) return false
    if (typeFilter === "timeonly" && h.trackable) return false
    // 状态筛选
    if (statusFilter !== "all" && h.status !== statusFilter) return false
    return true
  })

  // 按 trackable 分组，每组内按 defaultTime 排序
  const trackableGroup = filtered
    .filter((h) => h.trackable)
    .sort((a, b) => a.defaultTime.localeCompare(b.defaultTime))

  const timeOnlyGroup = filtered
    .filter((h) => !h.trackable)
    .sort((a, b) => a.defaultTime.localeCompare(b.defaultTime))

  const activeCount = habits.filter((h) => h.status === "active" || h.status === "draft").length

  return (
    <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {activeCount} 个习惯
        </span>
        <Button size="sm" onClick={onCreate}>
          + 新建习惯
        </Button>
      </div>

      {/* 类型筛选标签 */}
      <div className="flex items-center gap-1">
        {filterLabels.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 状态筛选标签 */}
      <div className="flex items-center gap-1">
        {statusLabels.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === s.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 习惯卡片列表（分组渲染） */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {habits.length === 0
            ? "还没有习惯，点击「新建习惯」开始"
            : "当前筛选条件下没有习惯"}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 可追踪分组 */}
          {trackableGroup.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <h3 className="text-sm font-medium text-muted-foreground col-span-full">可追踪</h3>
              {trackableGroup.map((habit) => (
                <HabitCard
                  key={habit.id}
                  title={habit.title}
                  trackable={habit.trackable}
                  defaultTime={habit.defaultTime}
                  earliestTime={habit.earliestTime}
                  latestStartTime={habit.latestStartTime}
                  defaultDuration={habit.defaultDuration}
                  minDuration={habit.minDuration}
                  streak={habit.streak}
                  description={habit.description}
                  longestStreak={habit.longestStreak}
                  completionRate7d={habit.completionRate7d}
                  status={habit.status}
                  frequencyType={habit.frequencyType}
                  onEdit={() => onEdit(habit.id)}
                  onStatusChange={(action) => onStatusChange(habit.id, action)}
                />
              ))}
            </div>
          )}

          {/* 仅占时分组 */}
          {timeOnlyGroup.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <h3 className="text-sm font-medium text-muted-foreground col-span-full">仅占时</h3>
              {timeOnlyGroup.map((habit) => (
                <HabitCard
                  key={habit.id}
                  title={habit.title}
                  trackable={habit.trackable}
                  defaultTime={habit.defaultTime}
                  earliestTime={habit.earliestTime}
                  latestStartTime={habit.latestStartTime}
                  defaultDuration={habit.defaultDuration}
                  minDuration={habit.minDuration}
                  streak={habit.streak}
                  description={habit.description}
                  longestStreak={habit.longestStreak}
                  completionRate7d={habit.completionRate7d}
                  status={habit.status}
                  frequencyType={habit.frequencyType}
                  onEdit={() => onEdit(habit.id)}
                  onStatusChange={(action) => onStatusChange(habit.id, action)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
