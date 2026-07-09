/**
 * @file EditAppointment
 * @brief 修改约定 CNUI surface（[026.01] 对齐 /editTimeboxes 范式）
 *
 * 双视图切换：selecting（默认，分页列表） ↔ editing（5 字段表单 + 删除集成）
 * 解析优先模式：handler.open 注入 mode/selectedId/prefill/items/originalPrompt/parseReason。
 * 4+1 字段复用 <AppointmentFormFields>。终态 expired/cancelled/completed 自然不显示删除按钮。
 */

'use client'

import { useEffect, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { AppointmentStatus } from '@/usom/types/primitives'
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

const PAGE_SIZE = 5

type ViewMode = 'selecting' | 'editing'

export function EditAppointment({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditAppointmentProps) {
  const items = (dataModel.items as (AppointmentDraftFields & { status: AppointmentStatus })[]) ?? []
  const originalPrompt = (dataModel.originalPrompt as string) ?? ''
  const parseReason = (dataModel.parseReason as string) ?? ''
  const initialMode = ((dataModel.mode as string) ?? 'selecting') as ViewMode
  const prefill = dataModel.prefill as (AppointmentDraftFields & { status: AppointmentStatus }) | undefined
  const initialSelectedId = (dataModel.selectedId as string | null) ?? null

  const [view, setView] = useState<ViewMode>(initialMode)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [draft, setDraft] = useState<(AppointmentDraftFields & { status: AppointmentStatus }) | null>(prefill ?? null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // [026.01] post-ship adversarial review fix (防御深度 #4):
  // dataModel 变化时(如 AI panel 第二次 open('editAppointment') 拿到不同 selectedId/prefill)
  // React 不重 mount,useState 初始值仅 mount 时读取一次→旧 state 与新 snapshot 不同步。
  // 跟随 initialSelectedId/prefill prop 变化 resync(view/selectedId/draft)。
  useEffect(() => {
    setView(initialMode)
    setSelectedId(initialSelectedId)
    setDraft(prefill ?? null)
    // page 故意保留:用户上次选中的页数,典型 PAG-1。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId, prefill])

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 约定已更新</p>

  // ─── editing 视图 ───────────────────────────────────────
  if (view === 'editing' && selectedId && draft) {
    const selected = items.find(i => i.id === selectedId) ?? draft
    const update = (patch: Partial<AppointmentDraftFields>) => setDraft(d => d ? { ...d, ...patch } : d)
    const back = () => {
      setView('selecting')
      setSelectedId(null)
      setDraft(null)
    }
    const submit = () => onConfirm({ ...dataModel, selected: draft, operation: 'update' })
    const performDelete = () => {
      onConfirm({ ...dataModel, selected: draft, operation: 'delete' })
      setConfirmDeleteOpen(false)
    }
    // [026.02.4] TD-022 cast transparency：AppointmentStatus = scheduled | cancelled | completed。
    // 原 canDelete 含 'in_progress' 是 [023.12] 收敛前的旧数据残留，runtime 不可达 → 移除。
    const canDelete = selected.status === 'scheduled'
    const titleFilled = typeof draft.title === 'string' && draft.title.trim().length > 0

    return (
      <>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">
            编辑约定（计划）
          </span>
          <button type="button" onClick={back} className="text-xs text-body/70 underline">返回列表</button>
        </div>
        <AppointmentFormFields draft={draft} onChange={update} />
        <div className="flex items-center justify-between pt-2">
          <div>
            {canDelete && (
              <button type="button" onClick={() => setConfirmDeleteOpen(true)} disabled={isLoading}
                className="rounded-md border border-error/40 px-3 py-1.5 text-xs text-error hover:bg-error/10 disabled:opacity-50">
                删除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && <button type="button" onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
            <button type="button" onClick={submit} disabled={isLoading || !titleFilled}
              title={!titleFilled ? '请填写事件名称' : undefined}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              保存
            </button>
          </div>
        </div>
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除约定</AlertDialogTitle>
              <AlertDialogDescription>「{draft.title}」删除后不可恢复，确认吗？</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={performDelete}>确认删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // ─── selecting 视图 ─────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pagedItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <>
      <div className="mb-2">
        <span className="text-sm font-medium text-ink">选择要修改的约定（仅计划/执行中）</span>
      </div>
      {(originalPrompt || parseReason) && (
        <p className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs text-body/70">
          💡 {parseReason || `尝试匹配「${originalPrompt}」`}
        </p>
      )}
      {items.length === 0
        ? <p className="py-8 text-center text-sm text-body/70">暂无计划/执行中的约定</p>
        : <div className="space-y-1">
            {pagedItems.map(it => (
              <button key={it.id} type="button"
                onClick={() => {
                  setSelectedId(it.id)
                  setDraft({ ...it })
                  setView('editing')
                }}
                className="w-full text-left rounded-md border border-hairline bg-canvas p-2 hover:bg-hover-overlay">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                  <span className="text-xs text-body/70">计划</span>
                </div>
                <div className="text-xs text-body/70">
                  {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分
                </div>
              </button>
            ))}
          </div>}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)}
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">
            ‹ 上一页
          </button>
          <span className="text-xs text-muted">{page + 1}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">
            下一页 ›
          </button>
        </div>
      )}
      {onCancel && <div className="flex justify-end pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>
      </div>}
    </>
  )
}