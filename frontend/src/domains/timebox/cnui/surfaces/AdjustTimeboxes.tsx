/**
 * @file adjust-timeboxes
 * @brief 调整时间盒 CNUI surface（[023] A2，[019.1] 手写范式，[023.12] T7 (AM8)）
 *
 * AI 助手解析多条 timebox 草稿后展示：按时间序列列当日 timebox，左右切换当前
 * 编辑项，可改 title/startTime/endTime，或勾选「取消此时间盒」。提交时仅
 * 发送有改动的字段（diff 通过 `_origTitle/_origStart/_origEnd` 初始快照比对）。
 * [023.12] T7 (AM8)：cancellable 由「排除 running/ended/logged/cancelled」
 *   改为「cur.status === 'planned'」——新 status union（planned/logged/cancelled）
 *   中只有 planned 可取消，logged/cancelled 已是终态。
 */

'use client'

import { useState } from 'react'

interface AdjustItem {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  /** 标记取消（由 surface 用户勾选；submit 走 deleteTimebox，OV#8 守卫） */
  cancel?: boolean
  /** [023] A2 OV#P2-#3：open 时由 handler 注入初始快照，submit 比对（无改动不触发 updateTimebox） */
  _origTitle?: string
  _origStart?: string
  _origEnd?: string
}

interface AdjustTimeboxesProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function AdjustTimeboxes({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: AdjustTimeboxesProps) {
  const items = ((dataModel.items as AdjustItem[]) ?? [])
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const [page, setPage] = useState(0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 调整已应用</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">今日无时间盒可调整</p>

  const cur = items[Math.min(page, items.length - 1)]
  // [023.12] T7 (AM8)：原 `!['running', 'ended', 'logged', 'cancelled'].includes(cur.status)`
  //   死值检查收敛为 `cur.status === 'planned'`——新 status union
  //   （planned/logged/cancelled）中仅 planned 可取消。
  const cancellable = cur.status === 'planned'
  const update = (patch: Partial<AdjustItem>) => {
    const next = items.map((it) => it.id === cur.id ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">调整时间盒 ({page + 1}/{items.length})</span>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
            <button type="button" disabled={page >= items.length - 1} onClick={() => setPage((p) => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label htmlFor="as-title" className="text-xs text-body">标题</label>
          <input id="as-title" type="text" value={cur.title} onChange={(e) => update({ title: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="as-start" className="text-xs text-body">开始</label>
            <input id="as-start" type="text" value={cur.startTime} onChange={(e) => update({ startTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="as-end" className="text-xs text-body">结束</label>
            <input id="as-end" type="text" value={cur.endTime} onChange={(e) => update({ endTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">状态：{cur.status}</span>
          {cancellable ? (
            <label className="flex items-center gap-1 text-xs text-body">
              <input type="checkbox" checked={!!cur.cancel} onChange={(e) => update({ cancel: e.target.checked })} /> 取消此时间盒
            </label>
          ) : (
            <span className="text-xs text-muted">执行中/已结束，不可取消</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">应用修改</button>
      </div>
    </>
  )
}