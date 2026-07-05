/**
 * @file AIOrchestratePanel
 * @brief [023.08] T5 AI 编排建议展示面板 — proposal 卡片 + 接受/拒绝按钮
 *
 * 与 CreateSmartTimebox.tsx 配套的纯展示组件：
 * - 接受态：卡片有边框 + 「拒绝」按钮
 * - 拒绝态：卡片 opacity-50 + 「接受」按钮（用户可一键恢复）
 *
 * [F5 fold] 暴露 [data-testid=proposal-card] + [data-testid=reject-btn] 给 E2E。
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
}

export function AIOrchestratePanel({ proposals, rejected, onAccept, onReject }: AIOrchestratePanelProps) {
  if (proposals.length === 0) return null

  return (
    <div className="space-y-2">
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
