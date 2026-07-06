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
  onAddKR?: (input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  onUpdateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  /** [024] G2 信心度更新回调 */
  onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>
  onDeleteKR: (id: string) => Promise<boolean>
  onReload?: () => Promise<void>
  /** [024] G1：预设周期 ID，create 模式下透传至 OKRForm（来自工作台 CycleCreateDrawer 旁的「为该周期创建 OKR」入口） */
  presetCycleId?: string
  /** [022] 3A-T2：触发外部 OKRImportDialog（由 OKRWorkspace 注入） */
  onImportTrigger?: () => void
  /** [023.12] T9 review fix：父周期状态，由 OKRWorkspace 从 hook.cycles 派生后透传；
   *  reviewed 时激活 OKRForm 整表锁（与 guard.ts ALLOWED['reviewed']={} 对齐）。
   *  detail 模式：data.cycleId 对应 cycle.status；create 模式：presetCycleId 对应 cycle.status。 */
  cycleStatus?: Cycle["status"]
}

/**
 * [022.01] C1 修复：原 cycleStatus prop 已在 Phase 3 移除——
 *   OKRPanel 不渲染 ContributionPanel（主路径 OKRWorkspace → OKRPanel → KRProgress）；
 *   KR 进度编辑权限由 KRProgress.editable 控制，本组件不消费 cycleStatus。
 *   ContributionPanel 由 OKRDetail 渲染，cycleStatus 在 OKRList → OKRDetail 路径上透传。
 * [023.12] T9 review fix：恢复 cycleStatus 透传——OKRForm 内 reviewed 锁定
 *   必须由父组件提供 status（OKRPanel 自身无 hook.cycles 引用）。
 */

const PRIORITY_LABELS: Record<string, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  P0: { label: "P0 必须", variant: "destructive" },
  P1: { label: "P1 应该", variant: "default" },
  P2: { label: "P2 余力", variant: "outline" },
}

export function OKRPanel({
  mode, data, isCreating, onBack, onEdit, onSaveCreate, onSaveEdit,
  onAddKR, onUpdateKRProgress, onConfidenceUpdate, onDeleteKR, onReload,
  presetCycleId,
  onImportTrigger,
  cycleStatus,
}: OKRPanelProps) {
  const [isAddingKR, setIsAddingKR] = useState(false)
  const [newKR, setNewKR] = useState({ title: "", targetValue: 100, unit: "%" })
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
        <OKRForm onSubmit={onSaveCreate} isLoading={isCreating} presetCycleId={presetCycleId} onImportTrigger={onImportTrigger} cycleStatus={cycleStatus} />
      </div>
    )
  }

  if (!data) return null

  const obj = data
  const krs = data.keyResults ?? []
  // [022.01] Phase 3：KR 列表不再按 kr.status 过滤（findAll 已返回非软删行）。
  const activeKRs = krs

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
          onImportTrigger={onImportTrigger}
          cycleStatus={cycleStatus}
        />
      </div>
    )
  }

  // mode === "detail"
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
            <Badge variant="outline" className="text-xs">{obj.okrType === "visionary" ? "愿景" : "承诺"}</Badge>
            <Badge variant={priorityInfo.variant} className="text-xs">{priorityInfo.label}</Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          周期: {obj.period.start} ~ {obj.period.end}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>编辑</Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">关键结果 ({activeKRs.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setIsAddingKR(true)}>+ 添加 KR</Button>
        </div>

        {activeKRs.map((kr, index) => (
          <Card key={kr.id} className="border-hairline">
            <CardContent className="pt-4 space-y-2">
              <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable onProgressUpdate={onUpdateKRProgress} onConfidenceUpdate={onConfidenceUpdate} />
              <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => setKrDeleteId(kr.id)}>
                删除
              </Button>
            </CardContent>
          </Card>
        ))}

        {isAddingKR && (
          <Card className="border-hairline">
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
