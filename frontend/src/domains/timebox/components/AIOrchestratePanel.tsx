/**
 * @file AIOrchestratePanel
 * @brief [023.08] T5 AI 编排建议展示面板 — proposal 卡片 + 接受/拒绝按钮
 *
 * 与 CreateSmartTimebox.tsx 配套的纯展示组件：
 * - 接受态：卡片有边框 + 「拒绝」按钮
 * - 拒绝态：卡片 opacity-50 + 「接受」按钮（用户可一键恢复）
 *
 * [F5 fold] 暴露 [data-testid=proposal-card] + [data-testid=reject-btn] 给 E2E。
 *
 * [028.2] T1：5 维评分透传 — 顶部 score 徽章（综合分）+ 5 维细目 grid。
 *   - 评分来自 TimeboxOrchestrationHandler.onGenerate 的 5 维评分（[028] T7 scoreSchedule）。
 *   - score/dimensions optional：onGenerate 不返时为 undefined（不显示徽章）。
 *   - 维度细目设计原则（design P6）：「不 block」— 数据透传即可，不强制用户理解每个维度含义。
 */

'use client'

export interface Proposal {
  id: string
  title: string
  startTime: string
  endTime: string
}

interface AIOrchestratePanelProps {
  proposals: Proposal[]
  rejected: Set<string>
  onAccept: (id: string) => void
  onReject: (id: string) => void
  // [028.2] T1：5 维评分透传
  score?: number
  dimensions?: Record<string, number>
}

// [028.2] T1：5 维度中文标签（避免英文 key 直显；维度名固定为 scoreSchedule 内部常量顺序）
const DIMENSION_LABELS: Record<string, string> = {
  energy: '能量匹配',
  conflict: '冲突检测',
  balance: '时段平衡',
  priority: '优先级',
  buffer: '缓冲合理',
}

export function AIOrchestratePanel({ proposals, rejected, onAccept, onReject, score, dimensions }: AIOrchestratePanelProps) {
  if (proposals.length === 0) return null

  return (
    <div className="space-y-2">
      {/* [028.2] T1：5 维评分徽章（综合分 + 维度细目）。
          仅在 score 是 number 时显示；dimensions 可选,空对象时不显示细目 grid */}
      {typeof score === 'number' && (
        <div data-testid="score-badge" className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-body/60">今日方案综合分</span>
            <span className="text-lg font-semibold text-primary" data-testid="score-value">
              {score.toFixed(1)} / 10
            </span>
          </div>
          {dimensions && Object.keys(dimensions).length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-body/70">
              {Object.entries(dimensions).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{DIMENSION_LABELS[k] ?? k}</span>
                  <span className="font-mono">{typeof v === 'number' ? v.toFixed(1) : v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-xs uppercase tracking-wide text-body/60">AI 编排建议</p>
      {proposals.map(p => {
        const isRejected = rejected.has(p.id)
        return (
          <div
            key={p.id}
            data-testid="proposal-card"
            className={`rounded border p-3 transition-opacity ${
              isRejected
                ? 'border-canvas-subtle bg-canvas-subtle/30 opacity-50'
                : 'border-primary/30 bg-primary/5'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{p.title}</p>
                <p className="text-sm text-body/70">{p.startTime} – {p.endTime}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {isRejected ? (
                  <button
                    type="button"
                    onClick={() => onAccept(p.id)}
                    className="text-xs text-primary underline"
                  >
                    接受
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="reject-btn"
                    onClick={() => onReject(p.id)}
                    className="rounded bg-canvas-subtle px-2 py-1 text-xs text-body transition-colors hover:bg-hover-overlay"
                  >
                    拒绝
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}