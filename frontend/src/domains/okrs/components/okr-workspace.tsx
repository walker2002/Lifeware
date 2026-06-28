"use client"

import { useState, useCallback, useEffect } from "react"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
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

interface OKRWorkspaceProps {
  /** 独立页面模式：全高布局 + PageBanner；默认 false（内嵌模式） */
  standalone?: boolean
  /** 初始展开的 Objective ID（来自 ?detail= 查询参数） */
  initialDetailId?: string
}

export function OKRWorkspace({ standalone = false, initialDetailId }: OKRWorkspaceProps) {
  const hook = useOKRs()
  const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
    storageKey: "lw-okr-left-width",
  })
  // [022] 用 initialDetailId 作为 selectedId 的初始化值，
  // 避免 useEffect 触发的 1-frame 闪烁。
  const [selectedId, setSelectedId] = useState<string | null>(initialDetailId ?? null)
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
      cycleId: fields.cycleId,
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      priority: fields.priority,
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

  /**
   * [022] 编辑保存：若 cycleId 变化则传入新值。
   * update 经 mutation-service，周期不可改为空。
   */
  const handleSaveEdit = useCallback(async (fields: OKRFormFields) => {
    if (!selectedId) return
    const updateFields: Record<string, unknown> = {
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      priority: fields.priority,
    }
    if (fields.cycleId && fields.cycleId !== detailData?.cycleId) {
      updateFields.cycleId = fields.cycleId
    }
    const updated = await hook.update(selectedId, updateFields)
    if (updated) {
      const data = await hook.loadDetail(selectedId)
      setDetailData(data)
      setMode("detail")
    }
  }, [selectedId, hook, detailData])

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

  // [022] standalone 模式下根据 ?detail= 自动展开详情。
  // selectedId 已通过 useState initializer 同步设置，避免 1-frame 闪烁；
  // 此 effect 仅负责在 objectives 首次加载完成后调用 loadDetail 加载详情数据。
  useEffect(() => {
    if (
      initialDetailId &&
      hook.objectives.length > 0 &&
      hook.objectives.some((o) => o.id === initialDetailId) &&
      detailData?.id !== initialDetailId
    ) {
      void handleSelect(initialDetailId)
    }
  }, [initialDetailId, hook.objectives, detailData, handleSelect])

  return (
    <>
      {standalone && (
        <div className="border-b border-hairline px-5 py-3 flex items-center gap-2 bg-canvas">
          <h1 className="text-base font-semibold text-ink">OKR 工作台</h1>
        </div>
      )}
      <div ref={containerRef} className={`flex ${standalone ? "flex-1 min-h-0" : "h-full"}`}>
      <div
        className="shrink-0 overflow-y-auto min-h-0 lw-scrollbar-thin"
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
            /** [024] G2 信心度更新：仅在选中 OKR 时启用回调 */
            onConfidenceUpdate={selectedId ? (krId, v) => hook.updateKR(krId, { confidence: v }) : undefined}
            onReload={selectedId ? async () => { const data = await hook.loadDetail(selectedId); setDetailData(data) } : undefined}
            /** [024] G1 presetCycleId：T13 wiring 时由 CycleCreateDrawer 旁入口传入 */
            presetCycleId={undefined}
            onImportTrigger={() => setImportOpen(true)}
          />
        )}
      </div>
      <OKRImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
      </div>
    </>
  )
}
