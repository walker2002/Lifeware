"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HabitTemplateCard } from "@/components/habit-template-card"
import { HabitTemplateView } from "@/components/habit-template-view"
import { HabitTemplateForm, type TemplateHabitEntry } from "@/components/habit-template-form"
import {
  getTemplates,
  createTemplate,
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

  const handleApply = useCallback(async (templateId: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const result = await applyTemplate(templateId, today)
    if (!result.success) {
      setError(result.error ?? "应用模板失败")
      return
    }
    setError(null)
  }, [])

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
              />
            ))}
          </div>
        )
      ) : (
        <HabitTemplateView templates={tplForView} />
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
            onSubmit={handleCreateTemplate}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
