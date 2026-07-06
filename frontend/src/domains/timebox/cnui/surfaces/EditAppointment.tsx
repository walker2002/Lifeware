/**
 * @file EditAppointment
 * @brief 修改约定 CNUI surface（[026][023.05] D2 reversal / [023.12] T10 清理 in_progress 引用）
 *
 * 默认 {scheduled} 列表（用户可改计划），选中切编辑表单。
 * 4 字段复用 <AppointmentFormFields>（D4 决议 A）。
 * 终态 cancelled/completed 不在列表（不可改，UI 自然隐藏）。
 * [023.12] T10 (AM8)：in_progress 不再持久化，list 仅由 findActive 返回的 scheduled，
 * 列表项「执行中/计划」分支删除（恒为 scheduled → 「计划」）。
 */

'use client'

import { useState } from 'react'
import { AppointmentFormFields, type AppointmentDraftFields } from './AppointmentFormFields'

interface EditAppointmentProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

export function EditAppointment({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditAppointmentProps) {
  const items = (dataModel.items as (AppointmentDraftFields & { status: string })[]) ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<(AppointmentDraftFields & { status: string }) | null>(null)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 约定已更新</p>

  const selected = items.find(i => i.id === selectedId)

  if (selected && draft) {
    const update = (patch: Partial<AppointmentDraftFields>) => setDraft(d => d ? { ...d, ...patch } : d)
    const back = () => { setSelectedId(null); setDraft(null) }
    const submit = () => {
      onDataChange({ ...dataModel, selected: draft })
      onConfirm({ ...dataModel, selected: draft })
    }
    const titleFilled = typeof draft.title === 'string' && draft.title.trim().length > 0
    return (
      <>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">编辑约定（计划）</span>
          <button type="button" onClick={back} className="text-xs text-body/70 underline">返回列表</button>
        </div>
        <AppointmentFormFields draft={draft} onChange={update} />
        <div className="flex items-center justify-end gap-2 pt-2">
          {onCancel && <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
          <button type="button" onClick={submit} disabled={isLoading || !titleFilled}
            title={!titleFilled ? '请填写事件名称' : undefined}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            保存
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="mb-2"><span className="text-sm font-medium text-ink">选择要修改的约定（仅计划）</span></div>
      {items.length === 0
        ? <p className="py-8 text-center text-sm text-body/70">暂无计划中的约定</p>
        : <div className="space-y-1 max-h-72 overflow-y-auto">
            {items.map(it => (
              <button key={it.id} type="button"
                onClick={() => { setSelectedId(it.id); setDraft(it) }}
                className="w-full text-left rounded-md border border-hairline bg-canvas p-2 hover:bg-hover-overlay">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                  <span className="text-xs text-body/70">计划</span>
                </div>
                <div className="text-xs text-body/70">{new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分</div>
              </button>
            ))}
          </div>}
      {onCancel && <div className="flex justify-end pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>
      </div>}
    </>
  )
}
