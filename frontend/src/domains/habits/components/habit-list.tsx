/**
 * @file habit-list
 * @brief 习惯列表组件
 * 
 * 展示和管理习惯列表，支持分组、筛选和操作
 */

"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { HabitCard } from "./habit-card"
import { HabitForm, type HabitFormFields } from "./habit-form"
import { ChevronDown, ChevronRight } from "lucide-react"
import { getArchetypes } from "@/app/actions/activity-archetype"
import type { ActivityArchetype } from "@/usom/activity-archetype/types"

/**
 * 习惯列表项
 */
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
  /** [023] A3.2：关联 Activity Archetype ID（[023] I-1 type narrowing: 统一为 string | undefined，对齐 USOM 源类型） */
  activityArchetypeId?: string
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
  /** 快速打卡 */
  onLogHabit?: (habitId: string) => Promise<void>
  /** 详情打卡 */
  onDetailLogHabit?: (habitId: string, fields: import('./habit-checkin-detail').HabitLogFields) => Promise<void>
  /** 今日已打卡的 habit id 集合 */
  todayLoggedIds?: Set<string>
  autoOpenCreate?: boolean
  initialFields?: Partial<HabitFormFields>
}

type PanelMode = null | "create" | string

export function HabitList({ habits, onCreate, onStatusChange, onUpdateHabit, onRefresh, autoOpenCreate, initialFields, onLogHabit, onDetailLogHabit, todayLoggedIds }: HabitListProps) {
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)

  // [023] A3.2：mount-time 拉一次 archetype 全集，构造 id→archetype 映射供 HabitCard 解析 l2Name
  const [archetypeMap, setArchetypeMap] = useState<Record<string, ActivityArchetype>>({})
  useEffect(() => {
    let cancelled = false
    getArchetypes()
      .then(r => {
        if (cancelled) return
        const list = r.success && r.data ? r.data : []
        const map: Record<string, ActivityArchetype> = {}
        for (const a of list) map[a.id] = a
        setArchetypeMap(map)
      })
      .catch((err) => {
        // [023] M-1: 静默失败 + dev 警告。生产环境无 archetype 不阻塞列表，但 dev 需可观察。
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[HabitList] getArchetypes failed:', err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (autoOpenCreate && panelMode === null) {
      setPanelMode("create")
    }
  }, [autoOpenCreate, panelMode])

  const editingHabit = typeof panelMode === "string" && panelMode !== "create"
    ? habits.find((h) => h.id === panelMode) ?? null
    : null

  function toggleSelectOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getSelectedInGroup(groupKey: string): Set<string> {
    const groupHabits = habits.filter(h => h.status === groupKey)
    const groupIds = new Set(groupHabits.map(h => h.id))
    return new Set([...selectedIds].filter(id => groupIds.has(id)))
  }

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
        activityArchetypeId: editingHabit.activityArchetypeId,
      }
    : undefined

  const groupedHabits = useMemo(() =>
    STATUS_GROUPS.map(group => ({
      ...group,
      habits: habits
        .filter(h => h.status === group.key)
        .sort((a, b) => a.defaultTime.localeCompare(b.defaultTime)),
    })),
    [habits],
  )

  return (
    <>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">{habits.length} 个习惯</span>
          <Button size="sm" onClick={() => setPanelMode("create")}>
            + 新建习惯
          </Button>
        </div>

        {/* 状态分组 */}
        <div className="flex flex-col gap-4">
          {groupedHabits.map((group) => {
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
                  {group.label} ({group.habits.length})
                </button>

                {/* draft: 激活所选 */}
                {!isCollapsed && group.key === "draft" && habits.filter(h => h.status === "draft").some(h => selectedIds.has(h.id)) && (
                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={async () => {
                      const ids = [...selectedIds].filter(id => habits.find(h => h.id === id)?.status === "draft")
                      setIsBatchProcessing(true)
                      for (const id of ids) {
                        await onStatusChange(id, "activate")
                      }
                      setSelectedIds(new Set())
                      setIsBatchProcessing(false)
                      await onRefresh()
                    }}
                    className="ml-2 rounded bg-success px-2 py-0.5 text-xs text-on-primary hover:bg-success/90 disabled:opacity-50"
                  >
                    激活所选 ({getSelectedInGroup("draft").size})
                  </button>
                )}
                {/* active: 打卡所选 */}
                {!isCollapsed && group.key === "active" && onLogHabit && habits.filter(h => h.status === "active").some(h => selectedIds.has(h.id)) && (
                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={async () => {
                      const ids = [...selectedIds].filter(id => habits.find(h => h.id === id)?.status === "active")
                      setIsBatchProcessing(true)
                      for (const id of ids) {
                        try {
                          await onLogHabit(id)
                        } catch {
                          // continue on individual failures
                        }
                      }
                      setSelectedIds(new Set())
                      setIsBatchProcessing(false)
                      await onRefresh()
                    }}
                    className="ml-2 rounded bg-success px-2 py-0.5 text-xs text-on-primary hover:bg-success/90 disabled:opacity-50"
                  >
                    打卡所选 ({getSelectedInGroup("active").size})
                  </button>
                )}
                {/* active: 暂停所选 */}
                {!isCollapsed && group.key === "active" && habits.filter(h => h.status === "active").some(h => selectedIds.has(h.id)) && (
                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={async () => {
                      const ids = [...selectedIds].filter(id => habits.find(h => h.id === id)?.status === "active")
                      setIsBatchProcessing(true)
                      for (const id of ids) {
                        await onStatusChange(id, "suspend")
                      }
                      setSelectedIds(new Set())
                      setIsBatchProcessing(false)
                      await onRefresh()
                    }}
                    className="ml-2 rounded bg-warning px-2 py-0.5 text-xs text-on-primary hover:bg-warning/90 disabled:opacity-50"
                  >
                    暂停所选 ({getSelectedInGroup("active").size})
                  </button>
                )}
                {/* suspended: 恢复所选 + 归档所选 */}
                {!isCollapsed && group.key === "suspended" && habits.filter(h => h.status === "suspended").some(h => selectedIds.has(h.id)) && (
                  <>
                    <button
                      type="button"
                      disabled={isBatchProcessing}
                      onClick={async () => {
                        const ids = [...selectedIds].filter(id => habits.find(h => h.id === id)?.status === "suspended")
                        setIsBatchProcessing(true)
                        for (const id of ids) {
                          await onStatusChange(id, "reactivate")
                        }
                        setSelectedIds(new Set())
                        setIsBatchProcessing(false)
                        await onRefresh()
                      }}
                      className="ml-2 rounded bg-primary px-2 py-0.5 text-xs text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                      恢复所选 ({getSelectedInGroup("suspended").size})
                    </button>
                    <button
                      type="button"
                      disabled={isBatchProcessing}
                      onClick={async () => {
                        const ids = [...selectedIds].filter(id => habits.find(h => h.id === id)?.status === "suspended")
                        setIsBatchProcessing(true)
                        for (const id of ids) {
                          await onStatusChange(id, "archive")
                        }
                        setSelectedIds(new Set())
                        setIsBatchProcessing(false)
                        await onRefresh()
                      }}
                      className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-on-primary hover:bg-muted/80 disabled:opacity-50"
                    >
                      归档所选 ({getSelectedInGroup("suspended").size})
                    </button>
                  </>
                )}

                {!isCollapsed &&
                  (group.habits.length === 0 ? (
                    <p className="text-xs text-body/70 py-2 pl-6">暂无习惯</p>
                  ) : (
                    <div className="grid gap-3 pl-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {group.habits.map((habit) => (
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
                          archetypeLabel={habit.activityArchetypeId ? archetypeMap[habit.activityArchetypeId]?.l2Name : undefined}
                          onEdit={() => setPanelMode(habit.id)}
                          onStatusChange={(action) => onStatusChange(habit.id, action)}
                          onLog={onLogHabit ? (() => onLogHabit(habit.id)) : undefined}
                          todayLogged={todayLoggedIds?.has(habit.id)}
                          selectable
                          selected={selectedIds.has(habit.id)}
                          onSelectToggle={() => toggleSelectOne(habit.id)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* 编辑/创建抽屉 */}
      <Sheet open={panelMode !== null} onOpenChange={(open) => { if (!open) handlePanelClose() }}>
        <SheetContent side="right" className="sm:max-w-[560px] px-6 py-6">
          <SheetHeader>
            <SheetTitle>
              {panelMode === "create" ? "新建习惯" : "编辑习惯"}
            </SheetTitle>
          </SheetHeader>

          {submitError && (
            <div className="mb-4 rounded-lg border border-error bg-error-soft px-3 py-2 text-xs text-error">
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
        </SheetContent>
      </Sheet>
    </>
  )
}
