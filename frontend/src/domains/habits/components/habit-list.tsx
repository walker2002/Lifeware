"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { HabitCard } from "./habit-card"
import { HabitForm, type HabitFormFields } from "./habit-form"
import { ChevronDown, ChevronRight, X } from "lucide-react"
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
  startDate: string
  endDate?: string
  daysOfWeek?: number[]
}

const STATUS_GROUPS = [
  { key: "draft", label: "草稿", defaultOpen: true },
  { key: "active", label: "活跃", defaultOpen: true },
  { key: "suspended", label: "暂停", defaultOpen: false },
  { key: "archived", label: "归档", defaultOpen: false },
] as const

interface HabitListProps {
  habits: HabitItem[]
  onCreate: (fields: HabitFormFields) => Promise<{ success: boolean; error?: string }>
  onStatusChange: (id: string, action: string) => void
  onUpdateHabit: (id: string, fields: HabitFormFields) => Promise<{ success: boolean; error?: string }>
  onRefresh: () => Promise<void>
  autoOpenCreate?: boolean
  initialFields?: Partial<HabitFormFields>
}

type PanelMode = null | "create" | string

export function HabitList({ habits, onCreate, onStatusChange, onUpdateHabit, onRefresh, autoOpenCreate, initialFields }: HabitListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const g of STATUS_GROUPS) {
      init[g.key] = !g.defaultOpen
    }
    return init
  })

  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (autoOpenCreate && panelMode === null) {
      setPanelMode("create")
    }
  }, [autoOpenCreate])

  const editingHabit = typeof panelMode === "string" && panelMode !== "create"
    ? habits.find((h) => h.id === panelMode) ?? null
    : null

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCreateSave = useCallback(async (fields: HabitFormFields) => {
    setIsSubmitting(true)
    setSubmitError(null)
    const result = await onCreate(fields)
    if (result.success) {
      setPanelMode(null)
      await onRefresh()
    } else {
      setSubmitError(result.error ?? "创建失败")
    }
    setIsSubmitting(false)
  }, [onCreate, onRefresh])

  const handleEditSave = useCallback(async (fields: HabitFormFields) => {
    if (typeof panelMode !== "string" || panelMode === "create") return
    setIsSubmitting(true)
    setSubmitError(null)
    const result = await onUpdateHabit(panelMode, fields)
    if (result.success) {
      setPanelMode(null)
      await onRefresh()
    } else {
      setSubmitError(result.error ?? "更新失败")
    }
    setIsSubmitting(false)
  }, [panelMode, onUpdateHabit, onRefresh])

  const handlePanelClose = useCallback(() => {
    setPanelMode(null)
    setSubmitError(null)
  }, [])

  const editInitial: Partial<HabitFormFields> | undefined = editingHabit
    ? {
        title: editingHabit.title,
        description: editingHabit.description,
        defaultTime: editingHabit.defaultTime,
        earliestTime: editingHabit.earliestTime,
        latestStartTime: editingHabit.latestStartTime,
        defaultDuration: editingHabit.defaultDuration,
        minDuration: editingHabit.minDuration,
        trackable: editingHabit.trackable,
        frequencyType: (editingHabit.frequencyType as "daily" | "weekly" | "custom") ?? "daily",
        daysOfWeek: editingHabit.daysOfWeek,
        startDate: editingHabit.startDate,
        endDate: editingHabit.endDate,
      }
    : undefined

  return (
    <div className="flex gap-0 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* 左侧：卡片列表 */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          panelMode ? "flex-1 min-w-0 pr-4" : "w-full",
        )}
      >
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">{habits.length} 个习惯</span>
          <Button size="sm" onClick={() => setPanelMode("create")}>
            + 新建习惯
          </Button>
        </div>

        {/* 状态分组 */}
        <div className="flex flex-col gap-4">
          {STATUS_GROUPS.map((group) => {
            const groupHabits = habits
              .filter((h) => h.status === group.key)
              .sort((a, b) => a.defaultTime.localeCompare(b.defaultTime))
            const isCollapsed = collapsed[group.key]

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center gap-1.5 mb-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {group.label} ({groupHabits.length})
                </button>

                {!isCollapsed &&
                  (groupHabits.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 pl-6">暂无习惯</p>
                  ) : (
                    <div
                      className={cn(
                        "grid gap-3 pl-6 transition-all",
                        panelMode
                          ? "grid-cols-1 sm:grid-cols-2"
                          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                      )}
                    >
                      {groupHabits.map((habit) => (
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
                          onEdit={() => setPanelMode(habit.id)}
                          onStatusChange={(action) => onStatusChange(habit.id, action)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧：编辑/创建面板 */}
      {panelMode && (
        <div className="w-[480px] shrink-0 border-l px-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 sticky top-0 bg-background py-2">
            <h3 className="text-sm font-medium">
              {panelMode === "create" ? "新建习惯" : "编辑习惯"}
            </h3>
            <button
              type="button"
              onClick={handlePanelClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {submitError && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              {submitError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setSubmitError(null)}
              >
                关闭
              </button>
            </div>
          )}

          <HabitForm
            key={panelMode}
            initial={panelMode === "create" ? initialFields : editInitial}
            onSubmit={panelMode === "create" ? handleCreateSave : handleEditSave}
            onCancel={handlePanelClose}
            isLoading={isSubmitting}
          />
        </div>
      )}
    </div>
  )
}
