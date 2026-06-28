"use client"

import { useState } from "react"
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository"
import type { Objective, KeyResult, Cycle } from "@/usom/types/objects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { KRProgress } from "./kr-progress"
import { OKRForm } from "./okr-form"
import type { OKRFormFields } from "./okr-form"

type PanelMode = "empty" | "detail" | "edit" | "create"

interface OKRPanelProps {
  mode: PanelMode
  data: ObjectiveWithKR | null
  isCreating?: boolean
  onBack: () => void
  onEdit: () => void
  onSaveCreate: (fields: OKRFormFields) => void
  onSaveEdit: (fields: OKRFormFields) => void
  onActivate: (id: string) => Promise<void>
  onChangeStatus: (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive") => Promise<void>
  onAddKR?: (input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  onUpdateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  /** [024] G2 信心度更新回调 */
  onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>
  onDeleteKR: (id: string) => Promise<boolean>
  onReload?: () => Promise<void>
  /** [022] 周期列表（透传至 OKRForm） */
  cycles?: Cycle[]
  /** [022] 周期列表加载中 */
  isLoadingCycles?: boolean
  /** [022] 新建周期回调 */
  onCreateCycle?: (cycle: Cycle) => Promise<Cycle>
  /** [022] 3A-T2：触发外部 OKRImportDialog（由 OKRWorkspace 注入） */
  onImportTrigger?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", active: "进行中", paused: "已暂停",
  completed: "已完成", discarded: "已废弃", archived: "已归档",
}

const PRIORITY_LABELS: Record<string, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  P0: { label: "P0 必须", variant: "destructive" },
  P1: { label: "P1 应该", variant: "default" },
  P2: { label: "P2 余力", variant: "outline" },
}

export function OKRPanel({
  mode, data, isCreating, onBack, onEdit, onSaveCreate, onSaveEdit,
  onActivate, onChangeStatus, onAddKR, onUpdateKRProgress, onConfidenceUpdate, onDeleteKR, onReload,
  cycles = [], isLoadingCycles = false, onCreateCycle = async (c) => c,
  onImportTrigger,
}: OKRPanelProps) {
  const [isAddingKR, setIsAddingKR] = useState(false)
  const [newKR, setNewKR] = useState({ title: "", targetValue: 100, unit: "%" })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string; message: string } | null>(null)
  const [krDeleteId, setKrDeleteId] = useState<string | null>(null)

  if (mode === "empty") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-3">
          <p className="text-sm">选择左侧 OKR 查看详情</p>
          <p className="text-xs">或创建新的 OKR 目标</p>
        </div>
      </div>
    )
  }

  if (mode === "create") {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">创建新 OKR</h2>
        <OKRForm onSubmit={onSaveCreate} isLoading={isCreating} cycles={cycles} isLoadingCycles={isLoadingCycles} onCreateCycle={onCreateCycle} onImportTrigger={onImportTrigger} />
      </div>
    )
  }

  if (!data) return null

  const obj = data
  const krs = data.keyResults ?? []
  const activeKRs = krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived")

  if (mode === "edit") {
    return (
      <div className="p-4">
        <OKRForm
          initial={{
            title: obj.title,
            description: obj.description,
            okrType: obj.okrType,
            priority: obj.priority,
            cycleId: obj.cycleId,
            keyResults: krs.map(kr => ({ title: kr.title, targetValue: kr.targetValue, unit: kr.unit, confidence: kr.confidence })),
          }}
          onSubmit={onSaveEdit}
          onCancel={onBack}
          cycles={cycles}
          isLoadingCycles={isLoadingCycles}
          onCreateCycle={onCreateCycle}
          onImportTrigger={onImportTrigger}
        />
      </div>
    )
  }

  // mode === "detail"
  const statusActions: { action: "pause" | "resume" | "complete" | "discard" | "archive"; label: string }[] = []
  if (obj.status === "draft") {
    statusActions.push({ action: "discard", label: "废弃" })
  } else if (obj.status === "active") {
    statusActions.push({ action: "pause", label: "暂停" })
    statusActions.push({ action: "complete", label: "完成" })
    statusActions.push({ action: "discard", label: "废弃" })
  } else if (obj.status === "paused") {
    statusActions.push({ action: "resume", label: "恢复" })
    statusActions.push({ action: "discard", label: "废弃" })
  } else if (obj.status === "completed" || obj.status === "discarded") {
    statusActions.push({ action: "archive", label: "归档" })
  }

  const CONFIRM_MESSAGES: Record<string, { label: string; message: string }> = {
    discard: { label: "废弃", message: "确定要废弃此 OKR 吗？所有 Key Result 也将被标记为已废弃。" },
    archive: { label: "归档", message: "确定要归档此 OKR 吗？归档后将从默认视图中隐藏，此操作不可撤销。" },
  }

  const handleStatusAction = async (action: string) => {
    if (CONFIRM_MESSAGES[action]) {
      setConfirmAction({ action, ...CONFIRM_MESSAGES[action] })
      return
    }
    await executeAction(action)
  }

  const executeAction = async (action: string) => {
    setConfirmAction(null)
    setActionLoading(action)
    if (action === "activate") {
      await onActivate(obj.id)
    } else {
      await onChangeStatus(obj.id, action as any)
    }
    setActionLoading(null)
  }

  const handleAddKR = async () => {
    if (!newKR.title.trim() || !onAddKR) return
    await onAddKR(newKR)
    setNewKR({ title: "", targetValue: 100, unit: "%" })
    setIsAddingKR(false)
    if (onReload) await onReload()
  }

  const priorityInfo = PRIORITY_LABELS[obj.priority] ?? PRIORITY_LABELS.P1

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {obj.objectiveNumber && <span className="text-xs font-mono text-muted-foreground">{obj.objectiveNumber}</span>}
              <h2 className="text-lg font-semibold">{obj.title}</h2>
            </div>
            {obj.description && <p className="text-sm text-muted-foreground">{obj.description}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={obj.status === "active" ? "default" : "secondary"} className="text-xs">
              {STATUS_LABELS[obj.status] ?? obj.status}
            </Badge>
            <Badge variant="outline" className="text-xs">{obj.okrType === "visionary" ? "愿景" : "承诺"}</Badge>
            <Badge variant={priorityInfo.variant} className="text-xs">{priorityInfo.label}</Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          周期: {obj.period.start} ~ {obj.period.end}
        </div>
      </div>

      <div className="space-y-2">
        {activeKRs.length === 0 && obj.status === "active" && (
          <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            当前没有 Key Result，建议添加后继续追踪
          </div>
        )}
        {activeKRs.length > 0 && activeKRs.every(kr => kr.status === "completed") && obj.status === "active" && (
          <div className="rounded-md bg-success-soft p-3 text-sm text-success">
            所有 KR 已完成，建议将 Objective 标记为
            <Button variant="link" className="h-auto p-0 text-success underline" onClick={() => handleStatusAction("complete")}>完成</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {obj.status === "draft" && (
            <Button onClick={() => handleStatusAction("activate")} disabled={actionLoading !== null}>
              {actionLoading === "activate" ? "激活中..." : "激活"}
            </Button>
          )}
          {statusActions.map(sa => (
            <Button key={sa.action}
              variant={sa.action === "discard" || sa.action === "archive" ? "destructive" : "default"}
              onClick={() => handleStatusAction(sa.action)} disabled={actionLoading !== null}>
              {actionLoading === sa.action ? "处理中..." : sa.label}
            </Button>
          ))}
          {obj.status === "draft" && (
            <Button variant="outline" onClick={onEdit}>编辑</Button>
          )}
          {obj.status === "archived" && (
            <span className="text-sm text-muted-foreground p-2">该 OKR 已归档，不可操作</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">关键结果 ({activeKRs.length})</h3>
          {(obj.status === "draft" || obj.status === "active") && (
            <Button variant="outline" size="sm" onClick={() => setIsAddingKR(true)}>+ 添加 KR</Button>
          )}
        </div>

        {krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map((kr, index) => (
          <Card key={kr.id}>
            <CardContent className="pt-4 space-y-2">
              <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} onConfidenceUpdate={onConfidenceUpdate} />
              {kr.status === "draft" && (
                <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => setKrDeleteId(kr.id)}>
                  删除
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {isAddingKR && (
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Input placeholder="KR 标题" value={newKR.title} onChange={e => setNewKR({ ...newKR, title: e.target.value })} />
              <div className="flex gap-2">
                <Input type="number" placeholder="目标值" value={newKR.targetValue} onChange={e => setNewKR({ ...newKR, targetValue: Number(e.target.value) })} className="w-24" />
                <Input placeholder="单位" value={newKR.unit} onChange={e => setNewKR({ ...newKR, unit: e.target.value })} className="w-20" />
                <Button size="sm" onClick={handleAddKR}>添加</Button>
                <Button size="sm" variant="ghost" onClick={() => setIsAddingKR(false)}>取消</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{confirmAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmAction && executeAction(confirmAction.action)}>
              确认{confirmAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!krDeleteId} onOpenChange={(open) => { if (!open) setKrDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此 Key Result 吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (krDeleteId) { await onDeleteKR(krDeleteId); setKrDeleteId(null); if (onReload) await onReload() }
            }}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
