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
    // [022.01] C1 修复：从 hook.objectives + hook.cycles 查找当前 Objective 所属 cycle 状态，
    // 透传至 OKRDetail（最终驱动 ContributionPanel 编辑权限）。
    const detailObj = hook.objectives.find(o => o.id === detailId)
    const detailCycle = detailObj
      ? hook.cycles.find(c => c.id === detailObj.cycleId)
      : undefined
    return (
      <OKRDetail
        objectiveId={detailId}
        onLoad={hook.loadDetail}
        onUpdate={hook.update}
        onAddKR={hook.addKR}
        onUpdateKRProgress={hook.updateKRProgress}
        onDeleteKR={async (krId) => { await hook.updateKR(krId, { discardedAt: new Date().toISOString() }); return true }}
        onBack={() => { setDetailId(null); hook.refresh() }}
        cycleStatus={detailCycle?.status}
      />
    )
  }

  if (showForm) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <h2 className="text-lg font-semibold mb-4">创建新 OKR</h2>
        {/* [023.12] T9 review fix：cycleStatus 未传——
            TODO: 父层未持有 presetCycleId（form 自行收集 cycleId），需重写
            OKRForm 加内联 cycle picker + 即时查 hook.cycles 派生 status 才能闭环。
            当前 OKRForm 的周期字段已迁出（[024] G1），本路径下 cycleId 始终空，
            validate() 必失败——此 call site 实际为死路径，重构需另起 task。 */}
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
        {filtered.map(obj => {
          // [023.12] T9 review fix：父组件透传 cycleStatus 以激活 reviewed 锁定。
          // hook.cycles 已在 C1 修复中加载（line 47-49），此处复用做派生。
          const cycleStatus = hook.cycles.find(c => c.id === obj.cycleId)?.status
          return (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              onClick={id => setDetailId(id)}
              cycleStatus={cycleStatus}
            />
          )
        })}
      </div>
    </div>
  )
}
