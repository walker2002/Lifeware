"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { HabitList } from "./habit-list"
import { HabitForm, type HabitFormFields } from "./habit-form"
import { useHabits } from "@/hooks/use-habits"

export function HabitLibraryView() {
  const { habits, isLoading, error, createHabit, changeStatus, deleteHabit, updateHabit, checkReferences } = useHabits()
  const [showForm, setShowForm] = useState(false)
  const [editHabitId, setEditHabitId] = useState<string | null>(null)
  const [archiveConfirm, setArchiveConfirm] = useState<{ id: string; hasReferences: boolean } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)

  const handleCreate = useCallback(async (fields: HabitFormFields) => {
    const ok = await createHabit({
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
    })
    if (ok) setShowForm(false)
  }, [createHabit])

  const handleUpdate = useCallback(async (fields: HabitFormFields) => {
    if (!editHabitId) return
    const ok = await updateHabit(editHabitId, {
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
    })
    if (ok) { setShowForm(false); setEditHabitId(null) }
  }, [editHabitId, updateHabit])

  const handleEdit = useCallback((id: string) => {
    setEditHabitId(id)
    setShowForm(true)
  }, [])

  const handleStatusChange = useCallback(async (id: string, action: string) => {
    if (action === "delete") {
      const habit = habits.find(h => h.id === id)
      setDeleteConfirm({ id, title: habit?.title ?? "" })
      return
    }
    if (action === "archive") {
      const refs = await checkReferences(id)
      setArchiveConfirm({ id, hasReferences: refs?.hasReferences ?? true })
      return
    }
    if (action === "suspend") {
      await changeStatus(id, "suspend")
    } else if (action === "activate") {
      await changeStatus(id, "activate")
    } else if (action === "reactivate") {
      await changeStatus(id, "reactivate")
    }
  }, [changeStatus, checkReferences, habits])

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveConfirm) return
    if (archiveConfirm.hasReferences) {
      await changeStatus(archiveConfirm.id, "archive")
    } else {
      await deleteHabit(archiveConfirm.id)
    }
    setArchiveConfirm(null)
  }, [archiveConfirm, changeStatus, deleteHabit])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return
    await deleteHabit(deleteConfirm.id)
    setDeleteConfirm(null)
  }, [deleteConfirm, deleteHabit])

  const listItems = habits.map((h) => ({
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
            onSubmit={editHabitId ? handleUpdate : handleCreate}
            onCancel={() => { setShowForm(false); setEditHabitId(null) }}
            initial={editHabitId ? habits.find(h => h.id === editHabitId) : undefined}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveConfirm} onOpenChange={(open) => { if (!open) setArchiveConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认归档</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveConfirm?.hasReferences
                ? "归档后习惯将进入归档状态，关联的打卡记录等数据将保留。此操作不可撤销。"
                : "该习惯无关联数据，归档后将彻底删除。此操作不可撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              {archiveConfirm?.hasReferences ? "确认归档" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该习惯吗？此操作不可撤销
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
