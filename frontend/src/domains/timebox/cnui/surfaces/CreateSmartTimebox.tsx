/**
 * @file create-smart-timebox
 * @brief [023.08] T5 CNUI surface — AI 智能推荐 proposals 接受/拒绝 + batch 撤销
 *
 * 镜像 CreateTimebox.tsx 范式（[019.1] 手写化），不依赖 CnuiFormAdapter。
 * 数据模型来自 cnui/handlers.ts:createSmartTimeboxes branch（T4 已扩
 * revertableBatches）。
 *
 * [F5 fold] 暴露 data-testid selector 给 E2E + 验证测试：
 *   - [data-testid=ai-orchestrate-button]（workspace 入口）
 *   - [data-testid=proposal-card]（每个 proposal 卡片）
 *   - [data-testid=reject-btn] / [data-testid=accept-all-btn]（accept/reject 操作）
 *   - [data-testid=revert-batch-btn]（撤销按钮）
 *
 * [G9 fold] 接受 → onConfirm({action:'createTimebox', fields:{items}})
 *          含 HH:MM + date（由 cnui/handlers.ts 转 ISO UTC 落库）。
 */

'use client'

import { useState } from 'react'
import { AIOrchestratePanel } from '../../components/AIOrchestratePanel'

interface Proposal {
  id: string
  title: string
  startTime: string // HH:MM（orchestration 内部 human-friendly）
  endTime: string
}

interface RevertableBatch {
  batchId: string
  acceptedAt: number
  count: number
}

interface CreateSmartTimeboxProps {
  surfaceType: string
  dataModel: {
    proposals?: Proposal[]
    revertableBatches?: RevertableBatch[]
  }
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CreateSmartTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateSmartTimeboxProps) {
  const proposals = dataModel.proposals ?? []
  const revertableBatches = dataModel.revertableBatches ?? []
  // [023.08] T5：rejected Set 跟踪用户拒绝的 proposal（默认全部接受；点「拒绝」加入 set）
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ AI 编排已应用</p>

  const acceptedProposals = proposals.filter(p => !rejected.has(p.id))

  const handleAcceptClick = () => {
    // [023.08] T5：日期 = 今日（AS/Shanghai 取）— 走 handler 的 hhmmToIso 转 UTC 落库
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    // [023.08] T5：_source: 'createSmartTimebox' 标记让 handler 在 createTimebox 分支里识别 batch 上下文，
    //   收拢 succeeded 后调 recordBatchProposals(proposals: realTimeboxIds)（取代 T4 占位 proposals:[]）。
    onConfirm({
      action: 'createTimebox',
      fields: {
        _source: 'createSmartTimebox',
        items: acceptedProposals.map(p => ({
          title: p.title,
          date: todayLocal,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
      },
    })
  }

  // [023.08] T5：保留 onDataChange 钩子让父容器观测 rejected 集合变化（[019.1] 范式）
  void onDataChange

  return (
    <div className="space-y-4">
      {/* AI 编排建议面板 + 接受/拒绝按钮 */}
      {proposals.length > 0 && (
        <AIOrchestratePanel
          proposals={proposals}
          rejected={rejected}
          onAccept={(id) => {
            const next = new Set(rejected)
            next.delete(id)
            setRejected(next)
          }}
          onReject={(id) => {
            const next = new Set(rejected)
            next.add(id)
            setRejected(next)
          }}
        />
      )}

      {/* [023.08] T5：5 分钟内显示的「撤销刚才创建的 N 个时间盒」 */}
      {revertableBatches.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">刚刚创建了 {revertableBatches[0].count} 个时间盒</p>
          <button
            type="button"
            data-testid="revert-batch-btn"
            className="mt-2 rounded bg-amber-600 px-3 py-1 text-sm text-white transition-colors hover:bg-amber-700"
            onClick={() =>
              onConfirm({
                action: 'revertSmartTimeboxes',
                fields: { batchId: revertableBatches[0].batchId },
              })
            }
          >
            撤销刚刚创建的 {revertableBatches[0].count} 个时间盒
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            className="px-4 py-2 text-sm text-body transition-colors hover:bg-canvas-subtle"
            onClick={onCancel}
          >
            取消
          </button>
        )}
        <button
          type="button"
          data-testid="accept-all-btn"
          className="rounded bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          disabled={isLoading || acceptedProposals.length === 0}
          onClick={handleAcceptClick}
        >
          接受 {acceptedProposals.length} 个时间盒
        </button>
      </div>
    </div>
  )
}
