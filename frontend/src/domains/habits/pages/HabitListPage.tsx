"use client"

import { useState, useEffect, useCallback } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
import {
  getHabits,
  submitHabitIntent,
  updateHabitStatus,
  updateHabit,
  checkHabitReferences,
  deleteHabit,
} from "@/app/actions/intent"

// ─── 类型与辅助函数 ────────────────────────────────────────────────

type PageState = "idle" | "dirty" | "submitting"

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
  }
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

export function HabitListPage() {
  // 核心数据
  const [habits, setHabits] = useState<Habit[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 抽屉状态
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)

  // 页面级脏状态追踪: idle → dirty → submitting
  const [pageState, setPageState] = useState<PageState>("idle")
  const [dirtyLabel, setDirtyLabel] = useState("")

  // 表单错误
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // 退出确认对话框
  const [showExitDialog, setShowExitDialog] = useState(false)

  // 提交状态
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<Habit | null>(null)

  // 外部触发表单提交（退出保存场景）
  const [submitTrigger, setSubmitTrigger] = useState(0)

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

  // ─── 抽屉操作 ──────────────────────────────────────────────────

  const closeDrawer = useCallback(() => {
    setDrawerMode(null)
    setEditingHabit(null)
    setPageState("idle")
    setDirtyLabel("")
    setFieldErrors({})
    setSubmitError(null)
  }, [])

  const openCreateDrawer = useCallback(() => {
    setDrawerMode("create")
    setEditingHabit(null)
    setPageState("idle")
    setDirtyLabel("")
    setFieldErrors({})
    setSubmitError(null)
  }, [])

  const openEditDrawer = useCallback(
    (habitId: string) => {
      const habit = habits.find((h) => h.id === habitId)
      if (!habit) return

      setEditingHabit(habit)
      setDrawerMode("edit")
      setPageState("idle")
      setDirtyLabel("")
      setFieldErrors({})
      setSubmitError(null)
    },
    [habits],
  )

  // ─── 脏状态追踪 ────────────────────────────────────────────────

  const handleFormChange = useCallback(() => {
    if (pageState === "idle") {
      setPageState("dirty")
      setDirtyLabel(editingHabit?.title ?? "新建习惯")
    }
  }, [pageState, editingHabit])

  // ─── 表单提交 ──────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (fields: HabitFormFields) => {
      setIsSubmitting(true)
      setPageState("submitting")
      setSubmitError(null)
      setFieldErrors({})

      try {
        if (drawerMode === "create") {
          const input = formFieldsToCreateInput(fields)
          const result = await submitHabitIntent(input)

          if (!result.success) {
            setSubmitError(result.error ?? "创建习惯失败")
            setPageState("dirty")
            return
          }
        } else if (drawerMode === "edit" && editingHabit) {
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
          const result = await updateHabit(editingHabit.id, input)
          // NOTE: 编辑暂用 updateHabit 直接操作 Repository，
          // 后续 TODO: 完整 Nexus 链支持编辑场景

          if (!result.success) {
            setSubmitError(result.error ?? "更新习惯失败")
            setPageState("dirty")
            return
          }
        }

        // 提交成功：关闭抽屉，刷新数据
        closeDrawer()
        await loadHabits()
      } catch (err) {
        const message = err instanceof Error ? err.message : "操作失败"
        setSubmitError(message)
        setPageState("dirty")
      } finally {
        setIsSubmitting(false)
      }
    },
    [drawerMode, editingHabit, closeDrawer, loadHabits],
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
            const { habitLogs, templateHabits, timeboxHabits } = refResult.references
            const total = habitLogs + templateHabits + timeboxHabits
            if (total > 0) {
              setSubmitError(
                `该习惯有 ${habitLogs} 条打卡记录、${templateHabits} 个模板关联、${timeboxHabits} 个时间盒关联，将归档而非删除。`
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

  // ─── 取消 / 退出确认 ───────────────────────────────────────────

  const handleCancel = useCallback(() => {
    if (pageState === "dirty") {
      setShowExitDialog(true)
    } else {
      closeDrawer()
    }
  }, [pageState, closeDrawer])

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCancel()
      }
    },
    [handleCancel],
  )

  const handleExitSave = useCallback(() => {
    setShowExitDialog(false)
    // 递增触发计数器，HabitForm 内部会通过 submitTrigger 的 useEffect 触发 requestSubmit
    setSubmitTrigger((n) => n + 1)
  }, [])

  const handleExitDiscard = useCallback(() => {
    setShowExitDialog(false)
    closeDrawer()
  }, [closeDrawer])

  const handleExitContinue = useCallback(() => {
    setShowExitDialog(false)
    // 不做任何操作，留在表单继续编辑
  }, [])

  // ─── 浏览器关闭防护 ────────────────────────────────────────────

  useEffect(() => {
    if (pageState === "dirty") {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ""
      }
      window.addEventListener("beforeunload", handler)
      return () => window.removeEventListener("beforeunload", handler)
    }
  }, [pageState])

  // ─── 渲染 ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  const habitItems: HabitItem[] = habits.map(habitToItem)

  const editInitial = editingHabit
    ? {
        title: editingHabit.title,
        description: editingHabit.description,
        defaultTime: editingHabit.defaultTime,
        earliestTime: editingHabit.earliestTime,
        latestStartTime: editingHabit.latestStartTime,
        defaultDuration: editingHabit.defaultDuration,
        minDuration: editingHabit.minDuration,
        trackable: editingHabit.trackable,
        frequencyType: editingHabit.frequency.type,
        daysOfWeek: editingHabit.frequency.daysOfWeek,
        startDate: editingHabit.startDate,
        endDate: editingHabit.endDate,
      }
    : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* 1. 脏状态指示条 */}
      {pageState !== "idle" && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
            pageState === "dirty"
              ? "bg-yellow-50 border-yellow-300 text-yellow-800"
              : "bg-blue-50 border-blue-300 text-blue-800"
          }`}
        >
          <span>
            {pageState === "dirty"
              ? `有未保存的修改 — ${dirtyLabel}`
              : "正在保存..."}
          </span>
          {pageState === "dirty" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-yellow-200 px-3 py-1 text-xs font-medium hover:bg-yellow-300 transition-colors"
                onClick={() => setSubmitTrigger((n) => n + 1)}
              >
                全部提交
              </button>
              <button
                type="button"
                className="rounded-md bg-yellow-200 px-3 py-1 text-xs font-medium hover:bg-yellow-300 transition-colors"
                onClick={handleExitDiscard}
              >
                放弃修改
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. 错误横幅 */}
      {submitError && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>{submitError}</span>
          <button
            type="button"
            className="rounded-md bg-red-200 px-3 py-1 text-xs font-medium hover:bg-red-300 transition-colors"
            onClick={() => setSubmitError(null)}
          >
            关闭
          </button>
        </div>
      )}

      {/* 3. 习惯列表 */}
      <HabitList
        habits={habitItems}
        onCreate={openCreateDrawer}
        onEdit={openEditDrawer}
        onStatusChange={handleStatusChange}
      />

      {/* 4. 新建/编辑抽屉 */}
      <Sheet open={drawerMode !== null} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {drawerMode === "create" ? "新建习惯" : "编辑习惯"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <HabitForm
              key={drawerMode === "edit" ? editingHabit?.id : "create"}
              initial={editInitial}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSubmitting}
              onDirtyChange={handleFormChange}
              submitTrigger={submitTrigger}
            />
          </div>
          {/* 字段级错误 */}
          {Object.keys(fieldErrors).length > 0 && (
            <div className="mt-4 space-y-1">
              {Object.entries(fieldErrors).map(([field, msg]) => (
                <p key={field} className="text-xs text-red-600">
                  {field}: {msg}
                </p>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 5. 退出确认对话框（三选项） */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyLabel} 有未提交的修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleExitSave}>
              保存并退出
            </AlertDialogAction>
            <AlertDialogCancel onClick={handleExitDiscard}>
              放弃修改
            </AlertDialogCancel>
            <AlertDialogCancel onClick={handleExitContinue}>
              取消，继续编辑
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 6. 删除确认对话框 */}
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
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              确认
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
              取消
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
