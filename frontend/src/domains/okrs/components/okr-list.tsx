/**
 * @file okr-list
 * @brief OKR 列表组件
 * 
 * 展示 OKR 列表，支持筛选、创建和详情查看
 */

"use client"

import { useState } from "react"
import type { Objective, KeyResult } from "@/usom/types/objects"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import { Button } from "@/components/ui/button"
import { ObjectiveCard } from "./objective-card"
import { OKRForm } from "./okr-form"
import type { OKRFormFields } from "./okr-form"
import { OKRDetail } from "./okr-detail"
import { useOKRs } from "@/hooks/use-okrs"

/** 状态顺序 */
const STATUS_ORDER: ObjectiveStatus[] = ["active", "draft", "paused", "completed", "discarded"]
/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  all: "全部", active: "进行中", draft: "草稿", paused: "已暂停",
  completed: "已完成", discarded: "已废弃",
}

export function OKRList() {
  const hook = useOKRs()
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ObjectiveStatus | "all">("all")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  if (hook.isLoading) return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-surface-card p-4 space-y-3">
          <div className="h-5 w-1/3 rounded bg-hairline animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-hairline animate-pulse" />
        </div>
      ))}
    </div>
  )
  if (hook.error) return <div className="p-4 text-center text-destructive">{hook.error}</div>

  if (detailId) {
    return (
      <OKRDetail
        objectiveId={detailId}
        onLoad={hook.loadDetail}
        onUpdate={hook.update}
        onActivate={hook.activate}
        onChangeStatus={hook.changeStatus}
        onAddKR={hook.addKR}
        onUpdateKRProgress={hook.updateKRProgress}
        onDeleteKR={hook.deleteKR}
        onBack={() => { setDetailId(null); hook.refresh() }}
      />
    )
  }

  if (showForm) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <h2 className="text-lg font-semibold mb-4">创建新 OKR</h2>
        <OKRForm
          onSubmit={async (fields: OKRFormFields) => {
            setIsCreating(true)
            const obj = await hook.create({
              title: fields.title,
              description: fields.description,
              okrType: fields.okrType,
              priority: fields.priority,
              cycleId: fields.cycleId,
            })
            if (obj) {
              // 创建 KR
              for (const kr of fields.keyResults) {
                await hook.addKR(obj.id, kr)
              }
              setShowForm(false)
              setDetailId(obj.id)
            }
            setIsCreating(false)
          }}
          onCancel={() => setShowForm(false)}
          isLoading={isCreating}
        />
      </div>
    )
  }

  const filtered = statusFilter === "all"
    ? hook.objectives.filter(o => o.status !== "archived")
    : hook.objectives.filter(o => o.status === statusFilter)

  const grouped = STATUS_ORDER
    .filter(s => statusFilter === "all" || statusFilter === s)
    .filter(s => filtered.some(o => o.status === s))
    .map(status => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      objectives: filtered.filter(o => o.status === status),
    }))

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">OKR 管理目标</h2>
        <Button onClick={() => setShowForm(true)}>+ 新建 OKR</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(STATUS_LABELS) as (ObjectiveStatus | "all")[]).map(key => (
          <Button key={key} variant={statusFilter === key ? "default" : "outline"} size="sm"
            onClick={() => { setStatusFilter(key); hook.refresh(key === "all" ? undefined : key) }}>
            {STATUS_LABELS[key]}
          </Button>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          暂无 OKR，点击右上角创建第一个目标
        </div>
      )}

      {grouped.map(group => (
        <div key={group.status}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{group.label} ({group.objectives.length})</h3>
          <div className="space-y-2">
            {group.objectives.map(obj => (
              <ObjectiveCard key={obj.id} objective={obj} onClick={id => setDetailId(id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
