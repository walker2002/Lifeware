/**
 * @file okr-workspace
 * @brief OKR 工作台顶层容器
 *
 * 整合 OKRDirectory（左侧目录）+ OKRPanel（右侧详情/编辑）+ 周期抽屉与删除确认。
 * [024] G1 wiring：周期创建抽屉、目标添加到指定周期、删除周期确认、目标状态菜单。
 */

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
import { CycleCreateDrawer } from "./cycle-create-drawer"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  // [024] G1 wiring：周期抽屉、预选周期、待删除周期。
  const [cycleDrawerOpen, setCycleDrawerOpen] = useState(false)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [deleteCycleTarget, setDeleteCycleTarget] = useState<string | null>(null)

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
    setSelectedCycleId(null)
    setMode("create")
  }, [])

  const handleSaveCreate = useCallback(async (fields: OKRFormFields) => {
    setIsCreating(true)
    // [024] G1：presetCycleId 模式下 fields.cycleId 来自 presetCycleId；
    // 用户在表单内未填时回退到 selectedCycleId。
    const cycleId = fields.cycleId || selectedCycleId
    if (!cycleId) {
      setIsCreating(false)
      return
    }
    const obj = await hook.create({
      cycleId,
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
      setSelectedCycleId(null)
    }
    setIsCreating(false)
  }, [hook, selectedCycleId])

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

  /**
   * [024] G1 wiring：从目录中"添加到该周期"按钮触发。
   * 预选周期后进入 create 模式，OKRPanel 通过 presetCycleId 锁定周期字段。
   */
  const handleAddObjectiveToCycle = useCallback((cycleId: string) => {
    setSelectedCycleId(cycleId)
    setSelectedId(null)
    setDetailData(null)
    setMode("create")
  }, [])

  /**
   * [024] G1 wiring：确认删除周期。前端已禁用含目标的删除入口，后端兜底。
   */
  const handleConfirmDeleteCycle = useCallback(async () => {
    if (!deleteCycleTarget) return
    const ok = await hook.deleteCycle(deleteCycleTarget)
    setDeleteCycleTarget(null)
    if (!ok) return
  }, [deleteCycleTarget, hook])

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
      {/* [024.1] B5：AppShell 路径用 absolute inset-0 绕过 Chromium 顽固 bug——
        被 stretch 的 flex item 的子元素 height:%/flex-basis:% 不解析为确定高度
        （overflow-hidden + h-full + 去 flex-col 组合都救不了）。main 是 relative，
        absolute inset-0 直接填满 main (712px)，彻底绕开 flex 百分比解析。standalone
        路径保留 flex flex-1 min-h-0（父级是 explicit h-screen flex-col，无此 bug，
        且有 header 兄弟需取剩余高度，h-full 会重叠 header）。 */}
      <div ref={containerRef} className={`${standalone ? "flex flex-1 min-h-0" : "absolute inset-0 flex"}`}>
      <div
        className="shrink-0 overflow-y-auto min-h-0 lw-scrollbar-thin"
        style={{ width: leftWidth }}
      >
        <OKRDirectory
          cycles={hook.cycles}
          objectives={filteredObjectives}
          selectedId={selectedId}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onCreateCycleClick={() => setCycleDrawerOpen(true)}
          onAddObjectiveToCycle={handleAddObjectiveToCycle}
          onDeleteCycle={(cycleId) => setDeleteCycleTarget(cycleId)}
          onChangeObjectiveStatus={(id, action) => { void handleStatusChange(id, action as "pause" | "resume" | "complete" | "discard" | "archive") }}
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
            /** [024] G1 presetCycleId：仅在 create 模式透传 selectedCycleId */
            presetCycleId={mode === "create" ? selectedCycleId ?? undefined : undefined}
            onImportTrigger={() => setImportOpen(true)}
          />
        )}
      </div>
      <OKRImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
      <CycleCreateDrawer
        open={cycleDrawerOpen}
        onOpenChange={setCycleDrawerOpen}
        onCreateCycle={hook.createCycle}
        isLoading={false}
      />
      <AlertDialog
        open={!!deleteCycleTarget}
        onOpenChange={(o) => { if (!o) setDeleteCycleTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除周期</AlertDialogTitle>
            <AlertDialogDescription>确定删除此周期吗？仅无目标的周期可删，操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteCycle}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </>
  )
}