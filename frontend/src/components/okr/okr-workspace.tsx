"use client"

import { useState, useCallback } from "react"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
import type { Objective, KeyResult } from "@/usom/types/objects"
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import { OKRDirectory } from "./okr-directory"
import { OKRPanel } from "./okr-panel"
import { useOKRs } from "@/hooks/use-okrs"
import type { OKRFormFields } from "./okr-form"
import { OKRImportPanel } from "./okr-import-panel"
import { OKRImportDialog } from "./okr-import-dialog"
import type { ImportResult } from "@/lib/okr-import/types"
import { saveImportedOKRs } from "@/app/actions/okr-import"

type PanelMode = "empty" | "detail" | "edit" | "create" | "import"

export function OKRWorkspace() {
  const hook = useOKRs()
  const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
    storageKey: "lw-okr-left-width",
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<PanelMode>("empty")
  const [statusFilter, setStatusFilter] = useState<ObjectiveStatus | "all">("all")
  const [detailData, setDetailData] = useState<ObjectiveWithKR | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

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

  const handleImportComplete = useCallback((result: ImportResult) => {
    setImportResult(result)
    setMode("import")
  }, [])

  const handleSaveImport = useCallback(async (markdown: string) => {
    const result = await saveImportedOKRs(markdown)
    if (result.success) {
      setImportResult(null)
      setMode("empty")
      await hook.refresh()
    }
    return result
  }, [hook])

  const handleCancelImport = useCallback(() => {
    setImportResult(null)
    setMode("empty")
  }, [])

  return (
    <div ref={containerRef} className="flex h-full">
      <div
        className="shrink-0 overflow-y-auto"
        style={{ width: leftWidth }}
      >
        <OKRDirectory
          objectives={filteredObjectives}
          selectedId={selectedId}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onImport={() => setImportOpen(true)}
        />
      </div>

      {/* 分隔条 */}
      <div
        className="w-[6px] cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 flex items-center justify-center border-x border-hairline"
        onMouseDown={handleMouseDown}
      >
        <span className="text-[10px] text-muted-foreground select-none leading-none">⋮</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {mode === "import" && importResult ? (
          <OKRImportPanel
            initialMarkdown={importResult.markdown}
            report={importResult.report}
            onSave={handleSaveImport}
            onCancel={handleCancelImport}
          />
        ) : (
          <OKRPanel
            mode={mode === "import" ? "empty" : mode}
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
        )}
      </div>
      <OKRImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
    </div>
  )
}
