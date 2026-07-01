/**
 * @file create-timebox
 * @brief 创建时间盒 CNUI surface（[023] A2，[019.1] 手写范式）
 *
 * AI 助手解析多条 timebox 草稿后展示：左右翻页逐条查看/编辑，「提交全部」
 * 逐条走 Nexus（handler.submit 内循环 submitDynamicIntent）。
 */

'use client'

import { useState } from 'react'

interface TimeboxDraft {
  id: string
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
}

interface CreateTimeboxProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CreateTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateTimeboxProps) {
  const items = (dataModel.items as TimeboxDraft[]) ?? []
  const [page, setPage] = useState(0)

  // [023-01+] RC-A 修复：title 必填校验
  //   之前：提交按钮仅 isLoading 时 disabled，空 title 直接提交 → 触发 rule warning → "1 条失败："用户懵
  //   现在：所有 draft 都必须 title 非空，否则禁用提交按钮（友好前端预防）
  const allTitlesFilled = items.length > 0 && items.every((it) => typeof it.title === 'string' && it.title.trim().length > 0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {items.length} 个时间盒已创建</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">未识别到时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<TimeboxDraft>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">创建时间盒 ({page + 1}/{items.length})</span>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
            <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label htmlFor="ct-title" className="text-xs text-body">标题</label>
          <input id="ct-title" type="text" value={cur.title} onChange={e => update({ title: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="ct-start" className="text-xs text-body">开始</label>
            <input id="ct-start" type="text" value={cur.startTime} onChange={e => update({ startTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="ct-end" className="text-xs text-body">结束</label>
            <input id="ct-end" type="text" value={cur.endTime} onChange={e => update({ endTime: e.target.value })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button
          type="button"
          onClick={() => onConfirm(dataModel)}
          disabled={isLoading || !allTitlesFilled}
          title={!allTitlesFilled ? '请填写所有时间盒的标题' : undefined}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          提交全部
        </button>
      </div>
      {!allTitlesFilled && (
        <p className="pt-1 text-right text-xs text-body/70">请填写所有时间盒的标题</p>
      )}
    </>
  )
}
