/**
 * @file okr-detail
 * @brief OKR 详情组件
 * 
 * 展示 OKR 详情，支持编辑、状态变更和 KR 管理
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
  /** 激活回调 */
  onActivate: (id: string) => Promise<boolean>
  /** 状态变更回调 */
  onChangeStatus: (id: string, action: "pause" | "resume" | "complete" | "discard" | "archive") => Promise<boolean>
  /** 添加 KR 回调 */
  onAddKR: (objectiveId: string, input: { title: string; description?: string; targetValue: number; unit: string }) => Promise<KeyResult | null>
  /** 更新 KR 进度回调 */
  onUpdateKRProgress: (id: string, currentValue: number) => Promise<KeyResult | null>
  /** 删除 KR 回调 */
  onDeleteKR: (id: string) => Promise<boolean>
  /** 返回回调 */
  onBack: () => void
}

/** 状态标签映射 */
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  discarded: "已废弃",
  archived: "已归档",
}

export function OKRDetail({
  objectiveId, onLoad, onUpdate, onActivate, onChangeStatus,
  onAddKR, onUpdateKRProgress, onDeleteKR, onBack,
}: OKRDetailProps) {
  const [data, setData] = useState<ObjectiveWithKR | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isAddingKR, setIsAddingKR] = useState(false)
  const [newKR, setNewKR] = useState({ title: "", targetValue: 100, unit: "%" })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string; message: string } | null>(null)
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

  const handleStatusAction = async (action: "pause" | "resume" | "complete" | "discard" | "archive" | "activate") => {
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
      await onActivate(objectiveId)
    } else {
      await onChangeStatus(objectiveId, action as any)
    }
    setActionLoading(null)
    await load()
  }

  const handleSaveEdit = async (fields: OKRFormFields) => {
    await onUpdate(objectiveId, {
      title: fields.title,
      description: fields.description,
      okrType: fields.okrType,
      period: { type: fields.periodType, start: fields.periodStart, end: fields.periodEnd },
    })
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
            periodType: obj.period.type,
            periodStart: obj.period.start as string,
            periodEnd: obj.period.end as string,
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

  const activeKRs = krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived")
  const allKRCompleted = activeKRs.length > 0 && activeKRs.every(kr => kr.status === "completed")

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
              <Badge variant={obj.status === "active" ? "default" : "secondary"}>
                {STATUS_LABELS[obj.status] ?? obj.status}
              </Badge>
              <Badge variant="outline">{obj.okrType === "visionary" ? "愿景型" : "承诺型"}</Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            周期: {obj.period.start} ~ {obj.period.end}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeKRs.length === 0 && obj.status === "active" && (
            <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
              当前没有 Key Result，建议添加后继续追踪
            </div>
          )}

          {allKRCompleted && obj.status === "active" && (
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
              <Button key={sa.action} variant={sa.action === "discard" || sa.action === "archive" ? "destructive" : "default"}
                onClick={() => handleStatusAction(sa.action)} disabled={actionLoading !== null}>
                {actionLoading === sa.action ? "处理中..." : sa.label}
              </Button>
            ))}
            {obj.status === "draft" && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>编辑</Button>
            )}
            {obj.status === "archived" && (
              <span className="text-sm text-muted-foreground p-2">该 OKR 已归档，不可操作</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">关键结果 ({krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").length})</h3>
          {(obj.status === "draft" || obj.status === "active") && (
            <Button variant="outline" size="sm" onClick={() => setIsAddingKR(true)}>+ 添加 KR</Button>
          )}
        </div>

        {krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived").map((kr, index) => (
          <Card key={kr.id}>
            <CardContent className="pt-4 space-y-2">
              <KRProgress kr={kr} krNumber={obj.objectiveNumber ? `${obj.objectiveNumber}-K${index + 1}` : undefined} editable={obj.status === "active"} onProgressUpdate={onUpdateKRProgress} />
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

      {/* 状态操作确认对话框 */}
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
