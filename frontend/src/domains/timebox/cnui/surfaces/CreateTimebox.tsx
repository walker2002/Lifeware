/**
 * @file create-timebox
 * @brief 创建时间盒 CNUI surface（[023] A2 + [023.04] T2，[019.1] 手写范式）
 *
 * AI 助手解析多条 timebox 草稿后展示：左右翻页逐条查看/编辑，「提交全部」
 * 逐条走 Nexus（handler.submit 内循环 submitDynamicIntent）。
 *
 * [023.04] 在此基础上加：
 *   - ArchetypePicker 裸版（活动原型选择，server action getArchetypes）
 *   - assertNoInternalOverlap 内部预检（同日 batch 内多条互判）
 *   - [T-eng-3] page-aware conflict 高亮：与当前 draft 冲突的另一页 title
 *     标注「第 N 页」，提示用户在哪一页去修改
 */

'use client'

import { useState, useMemo } from 'react'
import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
import { assertNoInternalOverlap } from '../../lib/overlap'

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

  // [023-01+] RC-A：所有 draft title 非空，否则禁用提交按钮
  const allTitlesFilled = items.length > 0 && items.every((it) => typeof it.title === 'string' && it.title.trim().length > 0)

  // [023.04] 内部重叠预检（同日 batch 内多条互判）。
  //   useMemo 缓存：items 引用变化才重算；用户翻页/编辑文本框不触发。
  //   dayStart/dayEnd 仅为 API 兼容位（与已有 today 列表的比较在服务端 rule）。
  const overlap = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return assertNoInternalOverlap(items, today + 'T00:00:00+08:00', today + 'T23:59:59+08:00')
  }, [items])
  const hasOverlap = overlap.hasOverlap

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {items.length} 个时间盒已创建</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">未识别到时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<TimeboxDraft>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }

  const canSubmit = !isLoading && allTitlesFilled && !hasOverlap

  // [023.04] [T-eng-3] page-aware conflict 标注。
  //   对每个 conflict title：
  //   - 若它出现在当前页（items[page].title）→ 直接展示「title」
  //   - 若它出现在另一页 → 展示「title(第 N 页)」，N=index+1（人类视角从 1 起计）
  //   失败用例：当前 page 的 title 在 conflictTitles 里，但用户正看着这一页，附「第 N 页」反而冗余。
  const conflictLabel = (title: string): string => {
    if (title === cur.title) return title
    const otherIdx = items.findIndex((it) => it.title === title)
    if (otherIdx < 0) return title
    return `${title}(第 ${otherIdx + 1} 页)`
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
            <input id="ct-start" type="datetime-local" value={isoToLocalDatetimeInput(cur.startTime)} onChange={e => update({ startTime: localDatetimeInputToIso(e.target.value) })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="ct-end" className="text-xs text-body">结束</label>
            <input id="ct-end" type="datetime-local" value={isoToLocalDatetimeInput(cur.endTime)} onChange={e => update({ endTime: localDatetimeInputToIso(e.target.value) })} className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
        {/* [023.04] 补 archetype 选择器（裸版无 h3 label） */}
        <div>
          <label className="text-xs text-body">活动原型</label>
          <div className="mt-0.5">
            <ArchetypePicker
              value={cur.activityArchetypeId}
              onChange={(id) => update({ activityArchetypeId: id })}
            />
          </div>
        </div>
      </div>

      {/* [023.04] 重叠提示：[T-eng-3] page-aware 标签，反向指出对端 page 索引 */}
      {hasOverlap && (
        <p className="pt-1 text-xs text-error">同日时间盒冲突：{overlap.conflictTitles.map(conflictLabel).join('、')}</p>
      )}
      {!allTitlesFilled && !hasOverlap && (
        <p className="pt-1 text-right text-xs text-body/70">请填写所有时间盒的标题</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button
          type="button"
          onClick={() => onConfirm(dataModel)}
          disabled={!canSubmit}
          title={!allTitlesFilled ? '请填写所有时间盒的标题' : hasOverlap ? '同日时间盒冲突' : undefined}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          提交全部
        </button>
      </div>
    </>
  )
}
