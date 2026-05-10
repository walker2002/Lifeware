"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { HabitTemplateCard } from "@/components/habit-template-card"
import { HabitTemplateView } from "@/components/habit-template-view"
import { HabitTemplateForm, type TemplateHabitEntry } from "@/components/habit-template-form"
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addHabitToTemplate,
  removeHabitFromTemplate,
  applyTemplate,
  getHabits,
} from "@/app/actions/intent"
import type { HabitTemplate, Habit } from "@/usom/types/objects"

export function HabitTemplateManager() {
  const [templates, setTemplates] = useState<HabitTemplate[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<"cards" | "compare">("cards")

  // 编辑模式状态
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  // 删除确认状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [tplResult, habitResult] = await Promise.all([getTemplates(), getHabits()])
      if (tplResult.success && tplResult.templates) setTemplates(tplResult.templates)
      if (habitResult.success && habitResult.habits) setHabits(habitResult.habits)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreateTemplate = useCallback(async (data: {
    templateId?: string
    name: string
    applicableDays: number[]
    habits: TemplateHabitEntry[]
  }) => {
    const result = await createTemplate({ name: data.name, applicableDays: data.applicableDays })
    if (!result.success || !result.template) {
      setError(result.error ?? "创建模板失败")
      return
    }

    // 添加习惯到模板
    for (const entry of data.habits) {
      await addHabitToTemplate(
        result.template.id,
        entry.habitId,
        { timeOverride: entry.timeOverride, durationOverride: entry.durationOverride },
      )
    }

    setShowForm(false)
    await refresh()
  }, [refresh])

  const handleUpdateTemplate = useCallback(async (data: {
    templateId?: string
    name: string
    applicableDays: number[]
    habits: TemplateHabitEntry[]
  }) => {
    if (!editingTemplateId) return

    // 1. 更新模板基本信息
    const updateResult = await updateTemplate(editingTemplateId, {
      name: data.name,
      applicableDays: data.applicableDays,
    })
    if (!updateResult.success) {
      setError(updateResult.error ?? "更新模板失败")
      return
    }

    // 2. 移除旧习惯，添加新习惯
    const existing = templates.find(t => t.id === editingTemplateId)
    if (existing) {
      for (const h of existing.habits) {
        await removeHabitFromTemplate(editingTemplateId, h.habitId)
      }
    }
    for (const entry of data.habits) {
      await addHabitToTemplate(
        editingTemplateId,
        entry.habitId,
        { timeOverride: entry.timeOverride, durationOverride: entry.durationOverride },
      )
    }

    setEditingTemplateId(null)
    await refresh()
  }, [editingTemplateId, templates, refresh])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return
    const result = await deleteTemplate(deleteConfirm.id)
    if (!result.success) {
      setError(result.error ?? "删除模板失败")
      setDeleteConfirm(null)
      return
    }
    setDeleteConfirm(null)
    await refresh()
  }, [deleteConfirm, refresh])

  const handleApply = useCallback(async (templateId: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const result = await applyTemplate(templateId, today)
    if (!result.success) {
      setError(result.error ?? "应用模板失败")
      return
    }
    setError(null)
  }, [])

  // 获取当前编辑的模板数据
  const editingTemplate = editingTemplateId
    ? templates.find(t => t.id === editingTemplateId)
    : null

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
  }

  const tplForView = templates.map(t => ({
    name: t.name,
    habits: t.habits.map(h => {
      const habit = habits.find(hb => hb.id === h.habitId)
      return {
        title: habit?.title ?? "未知",
        startTime: habit?.defaultTime ?? "00:00",
        duration: habit?.defaultDuration ?? 30,
        timeOverride: h.timeOverride,
        durationOverride: h.durationOverride,
      }
    }),
  }))

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-md bg-muted p-1">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "cards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            卡片
          </button>
          <button
            type="button"
            onClick={() => setViewMode("compare")}
            className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "compare" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            对比视图
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          + 新建模板
        </button>
      </div>

      {/* 编辑模式 */}
      {editingTemplate ? (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-medium">编辑模板</h3>
          <HabitTemplateForm
            availableHabits={habits.map(h => ({
              id: h.id,
              title: h.title,
              defaultTime: h.defaultTime,
              defaultDuration: h.defaultDuration,
            }))}
            initial={{
              templateId: editingTemplate.id,
              name: editingTemplate.name,
              applicableDays: editingTemplate.applicableDays,
              habits: editingTemplate.habits.map(h => {
                const habit = habits.find(hb => hb.id === h.habitId)
                return {
                  habitId: h.habitId,
                  title: habit?.title ?? "未知",
                  sortOrder: h.sortOrder,
                  timeOverride: h.timeOverride ?? habit?.defaultTime,
                  durationOverride: h.durationOverride,
                }
              }),
            }}
            onSubmit={handleUpdateTemplate}
            onCancel={() => setEditingTemplateId(null)}
          />
        </div>
      ) : (
        <>
          {/* 内容区 */}
          {viewMode === "cards" ? (
            templates.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                还没有模板，点击「新建模板」开始
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {templates.map(tpl => (
                  <HabitTemplateCard
                    key={tpl.id}
                    name={tpl.name}
                    applicableDays={tpl.applicableDays}
                    habits={tpl.habits.map(h => {
                      const habit = habits.find(hb => hb.id === h.habitId)
                      return {
                        title: habit?.title ?? "未知",
                        defaultTime: h.timeOverride ?? habit?.defaultTime ?? "00:00",
                        defaultDuration: h.durationOverride ?? habit?.defaultDuration ?? 30,
                      }
                    })}
                    onApply={() => handleApply(tpl.id)}
                    onEdit={() => setEditingTemplateId(tpl.id)}
                    onDelete={() => setDeleteConfirm({ id: tpl.id, name: tpl.name })}
                  />
                ))}
              </div>
            )
          ) : (
            <HabitTemplateView templates={tplForView} />
          )}
        </>
      )}

      {/* 新建模板对话框 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建模板</DialogTitle>
          </DialogHeader>
          <HabitTemplateForm
            availableHabits={habits.map(h => ({
              id: h.id,
              title: h.title,
              defaultTime: h.defaultTime,
              defaultDuration: h.defaultDuration,
            }))}
            habits={habits}
            onSubmit={handleCreateTemplate}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除该模板吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销。模板「{deleteConfirm?.name}」将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
