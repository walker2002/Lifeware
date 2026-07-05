/**
 * @file DeleteAppointment
 * @brief 删除约定 CNUI surface（[026][023.05] D2 reversal）
 *
 * 列表筛 {scheduled, in_progress}（expired/cancelled/completed 不可删，UI 自然隐藏）。
 * 多选 → executeIntent(cancel)。SM 守卫 enforce from {scheduled, in_progress}。
 */

'use client'

import { useState } from 'react'

interface DeleteItem { id: string; title: string; startTime: string; status: string }

interface DeleteAppointmentProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

export function DeleteAppointment({ dataModel, onConfirm, onCancel, isLoading, isDone }: DeleteAppointmentProps) {
  const items = (dataModel.items as DeleteItem[]) ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {items.length} 个约定已删除</p>

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <>
      <div className="mb-2"><span className="text-sm font-medium text-ink">选择要删除的约定（仅计划/执行中，可多选）</span></div>
      {items.length === 0
        ? <p className="py-8 text-center text-sm text-body/70">暂无计划/执行中的约定（过期/已完成不可删）</p>
        : <div className="space-y-1 max-h-72 overflow-y-auto">
            {items.map(it => {
              const checked = selected.has(it.id)
              return (
                <button key={it.id} type="button" onClick={() => toggle(it.id)}
                  className={`w-full text-left rounded-md border p-2 ${checked ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'} hover:bg-hover-overlay`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex size-4 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-hairline'}`}>
                      {checked && '✓'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                        <span className="text-xs text-body/70">{it.status === 'in_progress' ? '执行中' : '计划'}</span>
                      </div>
                      <div className="text-xs text-body/70">{new Date(it.startTime).toLocaleString('zh-CN')}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm({ ...dataModel, selectedIds: [...selected] })}
          disabled={isLoading || selected.size === 0}
          className="rounded-md bg-destructive px-4 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50">
          删除选中（{selected.size}）
        </button>
      </div>
    </>
  )
}
