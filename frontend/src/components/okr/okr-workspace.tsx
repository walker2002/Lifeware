"use client"

import { useState, useCallback } from "react"
import type { Objective, KeyResult } from "@/usom/types/objects"
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import { OKRDirectory } from "./okr-directory"
import { OKRPanel } from "./okr-panel"
import { useOKRs } from "@/hooks/use-okrs"
import type { OKRFormFields } from "./okr-form"

type PanelMode = "empty" | "detail" | "edit" | "create"

export function OKRWorkspace() {
  const hook = useOKRs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<PanelMode>("empty")
  const [statusFilter, setStatusFilter] = useState<ObjectiveStatus | "all">("all")
  const [detailData, setDetailData] = useState<ObjectiveWithKR | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const filteredObjectives = statusFilter === "all"
    ? hook.objectives.filter(o => o.status !== "archived")
    : hook.objectives.filter(o => o.status === statusFilter)

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id)
    const data = await hook.loadDetail(id)
    setDetailData(data)
    setMode("detail")
  }, [hook])

  const handleEdit = useCallback(() => {
    setMode("edit")
  }, [])

  const handleCreate = useCallback(() => {
    setSelectedId(null)
    setDetailData(null)
    setMode("create")
  }, [])

  const handleSaveCreate = useCallback(async (fields: OKRFormFields) => {
    setIsCreating(true)
    const obj = await hook.create({
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      priority: fields.priority,
      periodType: fields.periodType,
      periodStart: fields.periodStart,
      periodEnd: fields.periodEnd,
    })
    if (obj) {
      for (const kr of fields.keyResults) {
        await hook.addKR(obj.id, kr)
      }
      const data = await hook.loadDetail(obj.id)
      setDetailData(data)
      setSelectedId(obj.id)
      setMode("detail")
    }
    setIsCreating(false)
  }, [hook])

  const handleSaveEdit = useCallback(async (fields: OKRFormFields) => {
    if (!selectedId) return
    const updated = await hook.update(selectedId, {
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      priority: fields.priority,
      period: { type: fields.periodType, start: fields.periodStart, end: fields.periodEnd },
    })
    if (updated) {
      const data = await hook.loadDetail(selectedId)
      setDetailData(data)
      setMode("detail")
    }
  }, [selectedId, hook])

  const handleBack = useCallback(() => {
    setMode("detail")
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await hook.changeStatus(id, "discard")
    if (selectedId === id) {
      setSelectedId(null)
      setDetailData(null)
      setMode("empty")
    }
  }, [selectedId, hook])

  const handleStatusChange = useCallback(async (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive") => {
    await hook.changeStatus(id, action)
    if (selectedId === id) {
      const data = await hook.loadDetail(id)
      setDetailData(data)
    }
  }, [selectedId, hook])

  const handleActivate = useCallback(async (id: string) => {
    await hook.activate(id)
    if (selectedId === id) {
      const data = await hook.loadDetail(id)
      setDetailData(data)
    }
  }, [selectedId, hook])

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r overflow-y-auto">
        <OKRDirectory
          objectives={filteredObjectives}
          selectedId={selectedId}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleCreate}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <OKRPanel
          mode={mode}
          data={detailData}
          isCreating={isCreating}
          onBack={handleBack}
          onEdit={handleEdit}
          onSaveCreate={handleSaveCreate}
          onSaveEdit={handleSaveEdit}
          onActivate={handleActivate}
          onChangeStatus={handleStatusChange}
          onAddKR={selectedId ? (input) => hook.addKR(selectedId, input) : undefined}
          onUpdateKRProgress={hook.updateKRProgress}
          onDeleteKR={hook.deleteKR}
          onReload={selectedId ? async () => { const data = await hook.loadDetail(selectedId); setDetailData(data) } : undefined}
        />
      </div>
    </div>
  )
}
