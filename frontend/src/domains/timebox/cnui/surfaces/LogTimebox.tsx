/**
 * @file log-timebox
 * @brief 时间盒打卡 CNUI surface（[023] A2）
 *
 * 批量打卡：每条 ended timebox 三态（完成/未完成/跳过）+ 备注。
 * 「提交打卡」逐条走 Nexus logTimebox。
 */

'use client'

import { useState } from 'react'

type LogState = 'completed' | 'incomplete' | 'skipped'

interface LogItem {
  id: string
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
  state?: LogState
  notes?: string
}

interface LogTimeboxProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

const STATE_BTN: { key: LogState; label: string; cls: string }[] = [
  { key: 'completed', label: '完成', cls: 'bg-success/10 text-success border-success/30' },
  { key: 'incomplete', label: '未完成', cls: 'bg-error/10 text-error border-error/30' },
  { key: 'skipped', label: '跳过', cls: 'bg-muted text-body border-hairline' },
]

export function LogTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: LogTimeboxProps) {
  const items = (dataModel.items as LogItem[]) ?? []
  const [page, setPage] = useState(0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 打卡已提交</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">没有待打卡的时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<LogItem>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">打卡 ({page + 1}/{items.length})</span>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
            <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div className="text-sm font-medium text-ink">{cur.title}</div>
        <div className="text-xs text-muted">{cur.startTime} - {cur.endTime}</div>
        <div className="flex items-center gap-1.5">
          {STATE_BTN.map(s => (
            <button
              key={s.key} type="button"
              onClick={() => update({ state: s.key })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs ${cur.state === s.key ? s.cls : 'border-hairline text-body'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label htmlFor="lt-notes" className="text-xs text-body">备注</label>
        <textarea
          id="lt-notes"
          value={cur.notes ?? ''} onChange={e => update({ notes: e.target.value })} rows={2}
          placeholder="备注（可选）"
          className="w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink resize-none"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">提交打卡</button>
      </div>
    </>
  )
}
