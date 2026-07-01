/**
 * @file HabitListPage
 * @brief 习惯列表页（含创建/编辑 Drawer、批量操作）；[023] I-1 type narrowing: HabitItem.activityArchetypeId 由 string | null 统一为 string | undefined
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { HabitList } from "../components/habit-list"
import { HabitForm, type HabitFormFields } from "../components/habit-form"
import type { Habit } from "@/usom/types/objects"
import type { CreateHabitInput, UpdateHabitInput } from "@/usom/interfaces/irepository"
import type { HabitLogFields } from "../components/habit-checkin-detail"
import {
  getHabits,
  submitHabitIntent,
  updateHabitStatus,
  updateHabit,
  checkHabitReferences,
  deleteHabit,
  logHabit,
} from "@/app/actions/intent"
import { PageBanner } from "@/components/layout/page-banner"

// ─── 类型与辅助函数 ────────────────────────────────────────────────

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
  activityArchetypeId?: string
}

function habitToItem(h: Habit): HabitItem {
  return {
    id: h.id,
    title: h.title,
    trackable: h.trackable,
    defaultTime: h.defaultTime,
    earliestTime: h.earliestTime,
    latestStartTime: h.latestStartTime,
    defaultDuration: h.defaultDuration,
    minDuration: h.minDuration,
    streak: h.streak,
    status: h.status,
    frequencyType: h.frequency.type,
    description: h.description,
    longestStreak: h.longestStreak,
    completionRate7d: h.completionRate7d,
    startDate: h.startDate,
    endDate: h.endDate,
    daysOfWeek: h.frequency.daysOfWeek,
    activityArchetypeId: h.activityArchetypeId,
  }
}

interface HabitListPageProps {
  autoOpenCreate?: boolean
  initialFields?: Partial<HabitFormFields>
}

function formFieldsToCreateInput(fields: HabitFormFields): CreateHabitInput {
  return {
    title: fields.title,
    description: fields.description,
    defaultTime: fields.defaultTime,
    earliestTime: fields.earliestTime,
    latestStartTime: fields.latestStartTime,
    defaultDuration: fields.defaultDuration,
    minDuration: fields.minDuration,
    trackable: fields.trackable,
    frequencyType: fields.frequencyType,
    daysOfWeek: fields.daysOfWeek,
    startDate: fields.startDate,
    endDate: fields.endDate,
    tags: [],
  }
}

// ─── 组件 ──────────────────────────────────────────────────────────

export function HabitListPage({ autoOpenCreate, initialFields }: HabitListPageProps) {
  // 核心数据
  const [habits, setHabits] = useState<Habit[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 提交错误
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 今日已打卡集合
  const [todayLoggedIds, setTodayLoggedIds] = useState<Set<string>>(new Set())

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<Habit | null>(null)

  // ─── 数据加载 ──────────────────────────────────────────────────

  const loadHabits = useCallback(async () => {
    setIsLoading(true)
    const result = await getHabits()
    if (result.success && result.habits) {
      setHabits(result.habits)
    } else if (result.error) {
      setSubmitError(result.error)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadHabits()
  }, [loadHabits])

  // [023-01+ v4] 跨域刷新：监听 CNUI 在对话面板创建/更新习惯后广播的数据变更事件。
  //   本组件经 ActionView 内联挂载于 page.tsx，CNUI 提交时仍 mounted → 需主动 reload。
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ domainId?: string }>).detail
      if (detail?.domainId === 'habits') {
        void loadHabits()
      }
    }
    window.addEventListener('lifeware:data-changed', handler)
    return () => window.removeEventListener('lifeware:data-changed', handler)
  }, [loadHabits])

  // ─── 创建/更新处理 ──────────────────────────────────────────────

  const handleCreate = useCallback(
    async (fields: HabitFormFields): Promise<{ success: boolean; error?: string }> => {
      const input = formFieldsToCreateInput(fields)
      const result = await submitHabitIntent(input)
      if (result.success) {
        await loadHabits()
      }
      return { success: result.success, error: result.error }
    },
    [loadHabits],
  )

  const handleUpdateHabit = useCallback(
    async (id: string, fields: HabitFormFields): Promise<{ success: boolean; error?: string }> => {
      const input: UpdateHabitInput = {
        title: fields.title,
        description: fields.description,
        defaultTime: fields.defaultTime,
        earliestTime: fields.earliestTime,
        latestStartTime: fields.latestStartTime,
        defaultDuration: fields.defaultDuration,
        minDuration: fields.minDuration,
        trackable: fields.trackable,
        frequencyType: fields.frequencyType,
        daysOfWeek: fields.daysOfWeek,
        startDate: fields.startDate,
        endDate: fields.endDate,
      }
      const result = await updateHabit(id, input)
      return { success: result.success, error: result.error }
    },
    [],
  )

  // ─── 状态变更 ──────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (habitId: string, action: string) => {
      try {
        // HabitCard 发出的 "delete" action → 弹出确认弹窗
        if (action === "delete") {
          const habit = habits.find(h => h.id === habitId)
          if (habit) setDeleteConfirm(habit)
          return
        }

        // 归档前检查引用，展示引用信息
        if (action === "archive") {
          const refResult = await checkHabitReferences(habitId)
          if (refResult.success && refResult.references) {
            const { habitLogs, timeboxHabits } = refResult.references
            const total = habitLogs + timeboxHabits
            if (total > 0) {
              setSubmitError(
                `该习惯有 ${habitLogs} 条打卡记录、${timeboxHabits} 个时间盒关联，将归档而非删除。`
              )
            }
          }
        }

        const mappedAction = action as "activate" | "suspend" | "reactivate" | "archive"
        const result = await updateHabitStatus(habitId, mappedAction)

        if (result.success) {
          await loadHabits()
        } else {
          setSubmitError(result.error ?? "状态更新失败")
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "状态更新失败"
        setSubmitError(message)
      }
    },
    [habits, loadHabits],
  )

  // ─── 打卡处理 ──────────────────────────────────────────────────

  const handleLogHabit = useCallback(async (habitId: string) => {
    const result = await logHabit(habitId)
    if (result.success) {
      setTodayLoggedIds(prev => new Set(prev).add(habitId))
      await loadHabits()
    } else {
      setSubmitError(result.error ?? "打卡失败")
    }
  }, [loadHabits])

  const handleDetailLogHabit = useCallback(async (habitId: string, fields: HabitLogFields) => {
    const result = await logHabit(habitId, fields)
    if (result.success) {
      setTodayLoggedIds(prev => new Set(prev).add(habitId))
      await loadHabits()
    } else {
      setSubmitError(result.error ?? "打卡失败")
    }
  }, [loadHabits])

  // ─── 删除操作 ──────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (habitId: string) => {
      try {
        const refResult = await checkHabitReferences(habitId)

        if (refResult.success && refResult.references?.hasReferences) {
          // 有引用数据：归档而非硬删除
          await updateHabitStatus(habitId, "archive")
        } else {
          // 无引用：硬删除
          await deleteHabit(habitId)
        }

        setDeleteConfirm(null)
        await loadHabits()
      } catch (err) {
        const message = err instanceof Error ? err.message : "删除操作失败"
        setSubmitError(message)
      }
    },
    [loadHabits],
  )

  // ─── 渲染 ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-card p-4">
            <div className="size-5 rounded-full bg-hairline animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-hairline animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-hairline animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const habitItems: HabitItem[] = habits.map(habitToItem)

  return (
    <div className="flex flex-col gap-4">
      <PageBanner domainId="habits" title="习惯管理" />

      {/* 错误横幅 */}
      {submitError && (
        <div className="flex items-center justify-between rounded-lg border border-error bg-error-soft px-4 py-2 text-sm text-error">
          <span>{submitError}</span>
          <button
            type="button"
            className="rounded-md bg-error-soft px-3 py-1 text-xs font-medium hover:bg-error-soft/80 transition-colors"
            onClick={() => setSubmitError(null)}
          >
            关闭
          </button>
        </div>
      )}

      {/* 习惯列表 */}
      <HabitList
        habits={habitItems}
        onCreate={handleCreate}
        onStatusChange={handleStatusChange}
        onUpdateHabit={handleUpdateHabit}
        onRefresh={loadHabits}
        onLogHabit={handleLogHabit}
        onDetailLogHabit={handleDetailLogHabit}
        todayLoggedIds={todayLoggedIds}
        autoOpenCreate={autoOpenCreate}
        initialFields={initialFields}
      />

      {/* 删除确认对话框 */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除习惯「{deleteConfirm?.title}」吗？如有引用数据将自动归档。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
              className="bg-error text-on-primary hover:bg-error/90"
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
