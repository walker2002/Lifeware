/**
 * @file okr-list
 * @brief OKR 列表组件
 *
 * 展示 OKR 列表，支持创建和详情查看。
 * [022.01] Phase 3：删除 STATUS_ORDER / STATUS_LABELS / ObjectiveStatus tabs
 * —Objective 状态语义由 Cycle 承载，目录页由 okr-directory 替代。
 *
 * @remarks
 *  - 当前仅从 components/index.ts barrel 导出，零活跃 import 路径。
 *  - 创建/详情流仍保留以兼容旧链接；目录页使用 okr-workspace。
 */

"use client"

import { useState } from "react"
import type { KeyResult } from "@/usom/types/objects"
import { Button } from "@/components/ui/button"
import { ObjectiveCard } from "./objective-card"
import { OKRForm } from "./okr-form"
import type { OKRFormFields } from "./okr-form"
import { OKRDetail } from "./okr-detail"
import { useOKRs } from "@/hooks/use-okrs"

export function OKRList() {
  const hook = useOKRs()
  const [showForm, setShowForm] = useState(false)
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
        onAddKR={hook.addKR}
        onUpdateKRProgress={hook.updateKRProgress}
        onDeleteKR={async (krId) => { await hook.updateKR(krId, { discardedAt: new Date().toISOString() }); return true }}
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

  // [022.01] Phase 3：仅展示未软删除的目标（不再按 objective.status 过滤/分组）
  const filtered = hook.objectives.filter(o => !o.archivedAt && !o.discardedAt)

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">OKR 管理目标</h2>
        <Button onClick={() => setShowForm(true)}>+ 新建 OKR</Button>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          暂无 OKR，点击右上角创建第一个目标
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(obj => (
          <ObjectiveCard key={obj.id} objective={obj} onClick={id => setDetailId(id)} />
        ))}
      </div>
    </div>
  )
}
