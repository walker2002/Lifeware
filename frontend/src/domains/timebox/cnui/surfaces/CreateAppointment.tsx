/**
 * @file CreateAppointment
 * @brief 创建约定 CNUI surface（[026][023.05]）
 *
 * 默认编辑表单（多记录翻页），可切"已有 {scheduled, in_progress} 约定列表"防重复
 * 录入（D2 reversal: 含 in_progress；in_progress 也可再编辑/删除）。
 * 4 字段复用 <AppointmentFormFields>（D4 决议 A）。
 */

'use client'

import { useState } from 'react'
import { AppointmentFormFields, type AppointmentDraftFields } from './AppointmentFormFields'

interface ExistingAppointment { id: string; title: string; startTime: string; status: string }

interface CreateAppointmentProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

export function CreateAppointment({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CreateAppointmentProps) {
  const drafts = (dataModel.items as AppointmentDraftFields[]) ?? []
  const existing = (dataModel.existing as ExistingAppointment[]) ?? []
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'form' | 'list'>('form')

  // [026] RC-A 修复：title 必填校验 — 空 title 直接提交触发 rule warning → 用户懵
  // 所有 draft 都必须 title 非空，否则禁用提交按钮（友好前端预防）
  const allTitlesFilled = drafts.length > 0 && drafts.every(d => typeof d.title === 'string' && d.title.trim().length > 0)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ {drafts.length} 个约定已创建</p>
  if (drafts.length === 0) return <p className="py-8 text-center text-sm text-body/70">未识别到约定</p>

  const cur = drafts[page]
  const update = (patch: Partial<AppointmentDraftFields>) => {
    const next = drafts.map((d, i) => i === page ? { ...d, ...patch } : d)
    onDataChange({ ...dataModel, items: next })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">创建约定 ({page + 1}/{drafts.length})</span>
        <button type="button" onClick={() => setView(v => v === 'form' ? 'list' : 'form')}
          className="text-xs text-body/70 underline">
          {view === 'form' ? '看已有约定（防重复）' : '回到表单'}
        </button>
      </div>

      {view === 'list' ? (
        <div className="rounded-md border border-hairline bg-canvas p-3 space-y-1 max-h-60 overflow-y-auto">
          {existing.length === 0
            ? <p className="py-4 text-center text-xs text-body/70">暂无计划/执行中的约定</p>
            : existing.map(e => (
              <div key={e.id} className="rounded border border-hairline p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink truncate">{e.title}</span>
                  <span className="text-body/70">{e.status === 'in_progress' ? '执行中' : '计划'}</span>
                </div>
                <div className="text-body/70">{new Date(e.startTime).toLocaleString('zh-CN')}</div>
              </div>
            ))}
        </div>
      ) : (
        <>
          {drafts.length > 1 && (
            <div className="mb-1 flex items-center justify-end gap-1.5">
              <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
              <span className="text-xs text-muted">{page + 1}/{drafts.length}</span>
              <button type="button" disabled={page >= drafts.length - 1} onClick={() => setPage(p => p + 1)}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
            </div>
          )}
          {cur && <AppointmentFormFields draft={cur} onChange={update} />}
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)}
          disabled={isLoading || !allTitlesFilled}
          title={!allTitlesFilled ? '请填写所有约定的事件名称' : undefined}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          提交全部
        </button>
      </div>
      {!allTitlesFilled && view === 'form' && (
        <p className="pt-1 text-right text-xs text-body/70">请填写所有约定的事件名称</p>
      )}
    </>
  )
}
