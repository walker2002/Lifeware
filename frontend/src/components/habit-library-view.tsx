"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HabitList } from "@/components/habit-list"
import { HabitForm, type HabitFormFields } from "@/components/habit-form"
import { useHabits } from "@/hooks/use-habits"

export function HabitLibraryView() {
  const { habits, isLoading, error, createHabit, changeStatus, deleteHabit, updateHabit } = useHabits()
  const [showForm, setShowForm] = useState(false)
  const [editHabitId, setEditHabitId] = useState<string | null>(null)

  const handleCreate = useCallback(async (fields: HabitFormFields) => {
    const ok = await createHabit({
      title: fields.title,
      description: fields.description,
      defaultTime: fields.defaultTime,
      earliestTime: fields.earliestTime,
      latestEndTime: fields.latestEndTime,
      defaultDuration: fields.defaultDuration,
      minDuration: fields.minDuration,
      trackable: fields.trackable,
      frequencyType: fields.frequencyType,
      daysOfWeek: fields.daysOfWeek,
      startDate: fields.startDate,
      endDate: fields.endDate,
    })
    if (ok) setShowForm(false)
  }, [createHabit])

  const handleEdit = useCallback((id: string) => {
    setEditHabitId(id)
    // MVP 简化：编辑时打开新建表单（后续可改为编辑模式）
    setShowForm(true)
  }, [])

  const handleStatusChange = useCallback(async (id: string, action: string) => {
    if (action === "archive") {
      await changeStatus(id, "archive")
    } else if (action === "suspend") {
      await changeStatus(id, "suspend")
    } else if (action === "reactivate") {
      await changeStatus(id, "reactivate")
    }
  }, [changeStatus])

  const listItems = habits.map((h) => ({
    id: h.id,
    title: h.title,
    trackable: h.trackable,
    defaultTime: h.defaultTime,
    earliestTime: h.earliestTime,
    latestEndTime: h.latestEndTime,
    defaultDuration: h.defaultDuration,
    minDuration: h.minDuration,
    streak: h.streak,
    status: h.status,
    frequencyType: h.frequency.type,
  }))

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">加载中...</div>
  }

  if (error) {
    return <div className="py-12 text-center text-sm text-destructive">{error}</div>
  }

  return (
    <>
      <HabitList
        habits={listItems}
        onCreate={() => setShowForm(true)}
        onEdit={handleEdit}
        onStatusChange={handleStatusChange}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editHabitId ? "编辑习惯" : "新建习惯"}</DialogTitle>
          </DialogHeader>
          <HabitForm
            onSubmit={handleCreate}
            onCancel={() => { setShowForm(false); setEditHabitId(null) }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
