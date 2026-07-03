/**
 * @file okr-detail
 * @brief OKR 详情组件
 *
 * 展示 OKR 详情，支持编辑、KR 管理。
 * [022.01] Phase 3：移除 Objective.status 字段——状态语义由 Cycle 承载。
 *  - 删除 STATUS_LABELS / statusActions / activate 分支 / 状态 Badge
 *  - 激活权限与编辑权限统一由 cycleStatus 决定（从父组件透传）
 *  - KR 列表不再按 kr.status 过滤（软删已由 repository 层处理）
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository"
import type { Objective, KeyResult } from "@/usom/types/objects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { KRProgress } from "./kr-progress"
import { OKRForm } from "./okr-form"
import type { OKRFormFields } from "./okr-form"
import { ContributionPanel } from "./contribution-panel"

/**
 * OKR 详情组件属性
 */
interface OKRDetailProps {
  /** Objective ID */
  objectiveId: string
  /** 加载详情回调 */
  onLoad: (id: string) => Promise<ObjectiveWithKR | null>
  /** 更新回调 */
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<Objective | null>
  /** 添加 KR 回调 */
  onAddKR: (objectiveId: string, input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  /** 更新 KR 进度回调 */
  onUpdateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  /** 删除 KR 回调 */
  onDeleteKR: (id: string) => Promise<boolean>
  /** 返回回调 */
  onBack: () => void
  /** [022.01] Task 5：父组件透传的 cycle 状态，供下游 KRProgress / ContributionPanel 使用 */
  cycleStatus?: string
}

export function OKRDetail({
  objectiveId, onLoad, onUpdate,
  onAddKR, onUpdateKRProgress, onDeleteKR, onBack,
  cycleStatus,
}: OKRDetailProps) {
  const [data, setData] = useState<ObjectiveWithKR | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isAddingKR, setIsAddingKR] = useState(false)
  const [newKR, setNewKR] = useState({ title: "", targetValue: 100, unit: "%" })
  const [krDeleteId, setKrDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await onLoad(objectiveId)
    setData(result)
    setIsLoading(false)
  }, [objectiveId, onLoad])

  useEffect(() => { load() }, [load])

  if (isLoading) return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-surface-card p-4 space-y-3">
          <div className="h-5 w-1/3 rounded bg-hairline animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-hairline animate-pulse" />
        </div>
      ))}
    </div>
  )
  if (!data) return <div className="p-4 text-center text-muted-foreground">目标不存在</div>

  const obj = data
  const krs = data.keyResults ?? []

  const handleSaveEdit = async (fields: OKRFormFields) => {
    const updateFields: Record<string, unknown> = {
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      priority: fields.priority,
    }
    if (fields.cycleId) updateFields.cycleId = fields.cycleId
    await onUpdate(objectiveId, updateFields)
    setIsEditing(false)
    await load()
  }

  const handleAddKR = async () => {
    if (!newKR.title.trim()) return
    await onAddKR(objectiveId, newKR)
    setNewKR({ title: "", targetValue: 100, unit: "%" })
    setIsAddingKR(false)
    await load()
  }

  if (isEditing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <OKRForm
          initial={{
            title: obj.title,
            description: obj.description,
            okrType: obj.okrType,
            priority: obj.priority,
            cycleId: obj.cycleId,
            keyResults: krs.map(kr => ({
              title: kr.title,
              targetValue: kr.targetValue,
              unit: kr.unit,
            })),
          }}
          onSubmit={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
  }

  // [022.01] Phase 3：KR 列表不再按 kr.status 过滤（findAll 已返回非软删行）。
  const activeKRs = krs

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; 返回</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl">{obj.title}</CardTitle>
              {obj.description && <p className="text-sm text-muted-foreground">{obj.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{obj.okrType === "visionary" ? "愿景型" : "承诺型"}</Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            周期: {obj.period.start} ~ {obj.period.end}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}>编辑</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">关键结果 ({activeKRs.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setIsAddingKR(true)}>+ 添加 KR</Button>
        </div>

        {activeKRs.map((kr, index) => (
          <Card key={kr.id}>
            <CardContent className="pt-4 space-y-2">
              <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable onProgressUpdate={onUpdateKRProgress} />
              <ContributionPanel
                krId={kr.id}
                cycleStatus={cycleStatus ?? "draft"}
                onChange={load}
              />
              <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => setKrDeleteId(kr.id)}>
                删除
              </Button>
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

      {/* KR 删除确认对话框 */}
      <AlertDialog open={!!krDeleteId} onOpenChange={(open) => { if (!open) setKrDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此 Key Result 吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (krDeleteId) { await onDeleteKR(krDeleteId); setKrDeleteId(null); await load() }
            }}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
