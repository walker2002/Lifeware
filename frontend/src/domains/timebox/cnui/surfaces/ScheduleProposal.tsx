/**
 * @file schedule-proposal
 * @brief [028] T9 ScheduleProposal CNUI surface — 今日行动计划提案（四源归集 + needConfirm + batch 撤销）
 *
 * 镜像 [023.08] CreateSmartTimebox 范式（[019.1] 手写化），不依赖 CnuiFormAdapter。
 * 数据模型来自 cnui/handlers.ts:scheduleProposal branch（[028] T6 fold + T9 自含 batch recording）。
 *
 * [F5 fold] 暴露 data-testid selector 给 E2E + 验证测试：
 *   - [data-testid=ai-orchestrate-button]（workspace 入口）
 *   - [data-testid=proposal-card]（每个 proposal 卡片）
 *   - [data-testid=reject-btn] / [data-testid=accept-all-btn]（accept/reject 操作）
 *   - [data-testid=revert-batch-btn]（撤销按钮）
 *   - [data-testid=need-confirm-card]（低置信 / Tier0 冲突时显示 ArchetypePicker 候选）
 *
 * [028] T9: action 字段发 'scheduleProposal'（与 manifest intent_triggers.action 同步，
 *   handler submit 分支通过 action === 'scheduleProposal' 路由到自含 batch recording 路径）。
 *
 * 接受 → onConfirm({action:'scheduleProposal', fields:{items, date}})
 * 撤销 → onConfirm({action:'revertSmartTimeboxes', fields:{batchId}})
 *   （revertSmartTimeboxes 路径 K-block 仍复用 create-smart-timebox surface，保留不变）
 */

'use client'

import { useState } from 'react'
import { AIOrchestratePanel } from '../../components/AIOrchestratePanel'
// [028] I-2 polish: SCHEDULE_PROPOSAL_ACTION 常量（防字符串漂移）
import { SCHEDULE_PROPOSAL_ACTION } from '../../constants'

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

interface ArchetypeCandidate {
  id: string
  title: string
  source: 'inferred' | 'appointment' | 'fallback'
  reason: string
}

// [028.2] T1 fix (I-2): re-export ArchetypeCandidate 给 workspace（timeboxes-workspace.tsx）
//   state type 对齐 source union，避免 `as never` lose-cast
export type { ArchetypeCandidate }

interface ScheduleProposalProps {
  surfaceType: string
  dataModel: {
    proposals?: Proposal[]
    revertableBatches?: RevertableBatch[]
    // [028] T6 fold: NL 解析低置信 / Tier0 冲突时,onGenerate 返 needConfirm + 候选
    needConfirm?: boolean
    archetypeCandidates?: ArchetypeCandidate[]
    confirmReason?: string
    handoffHint?: string
    // [028.2] T1: 5 维评分透传 — AIOrchestratePanel 顶部 score 徽章
    score?: number
    dimensions?: Record<string, number>
  }
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function ScheduleProposal({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: ScheduleProposalProps) {
  const proposals = dataModel.proposals ?? []
  const revertableBatches = dataModel.revertableBatches ?? []
  const needConfirm = dataModel.needConfirm ?? false
  const archetypeCandidates = dataModel.archetypeCandidates ?? []
  const confirmReason = dataModel.confirmReason ?? ''
  const handoffHint = dataModel.handoffHint ?? ''
  // [028.2] T1: 5 维评分透传
  const score = dataModel.score
  const dimensions = dataModel.dimensions

  // [023.08] T5：rejected Set 跟踪用户拒绝的 proposal（默认全部接受；点「拒绝」加入 set）
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ AI 编排已应用</p>

  // [028] T6: needConfirm 路径 — NL 解析低置信 / Tier0 冲突 → 显示候选 + 提示
  if (needConfirm) {
    return (
      <div className="space-y-4">
        <div
          data-testid="need-confirm-card"
          className="rounded border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-sm text-amber-900">{confirmReason || '需要您确认候选'}</p>
          {handoffHint && (
            <p className="mt-1 text-xs text-amber-700/80">{handoffHint}</p>
          )}
        </div>

        {archetypeCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-body/60">候选活动</p>
            {archetypeCandidates.map(c => (
              <div
                key={c.id}
                className="rounded border border-canvas-subtle bg-canvas p-2"
              >
                <p className="text-sm font-medium text-ink">{c.title}</p>
                <p className="text-xs text-body/70">{c.reason}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              className="px-4 py-2 text-sm text-body transition-colors hover:bg-canvas-subtle"
              onClick={onCancel}
            >
              关闭
            </button>
          )}
        </div>
      </div>
    )
  }

  const acceptedProposals = proposals.filter(p => !rejected.has(p.id))

  // [028] T9 fold-in: dispatch 发 action: 'scheduleProposal'（与 manifest intent_triggers.action + handler submit 分支名一致）
  // [028.1] ISS-002 修复：workspace.openAiPanel 静态 mock proposals 形为 { id, title, startTime, endTime }，
  //   **不包含 `payload` 字段**（[023.08] T5 placeholder 未替换为真 orchestration-handler.onGenerate）。
  //   原 a24e336 spread `p.payload` 在 no-op（undefined spread 啥也不带）→ items 仅剩 `{ date }` → validator 拒。
  //   修：revert 为 picking 4 字段（title/date/startTime/endTime）。rules-registry.ts:99-138
  //   `timebox_fields_valid` 仅校验 title/startTime/endTime（duration 已被 [023] A2 撤销），sourceObjectId 非必填。
  //   handler.ts:580-585 已就绪 HH:MM + date → ISO UTC convert。
  const handleAcceptClick = () => {
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    onConfirm({
      action: SCHEDULE_PROPOSAL_ACTION,
      fields: {
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
      {/* AI 编排建议面板 + 接受/拒绝按钮
          [028.2] T1: 5 维评分透传（score/dimensions optional,onGenerate 不返时为 undefined） */}
      {proposals.length > 0 && (
        <AIOrchestratePanel
          proposals={proposals}
          rejected={rejected}
          score={score}
          dimensions={dimensions}
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
