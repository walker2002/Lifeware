/**
 * @file EditTimeboxes
 * @brief [023.04] T4 修改/取消/删除时间盒 CNUI surface（解析优先模式 + 全字段表单 + 删除按钮）
 *
 * 三模式：
 * - selecting：列当日时间盒，用户点选进 editing
 *   - [T-eng-5] 顶部 originalPrompt echo（用户在 AI 输入的原始 prompt）
 *   - [T-eng-5] unsure 降级时显示解析失败 reason
 * - editing：全字段表单（title/startTime/endTime/activityArchetypeId/notes/tags/taskIds/habitIds）
 *   - 顶部「返回列表」退回 selecting
 *   - 底部「删除该时间盒」按钮（仅 planned 状态，OV#8 守卫）
 *   - 保存 → onConfirm payload.operation='update'
 *   - 删除 → onConfirm payload.operation='delete'
 *   - [T-eng-2] needsConfirm=true 时保存触发 AlertDialog 二次确认，确认后 payload.confirmed=true
 *
 * handler.submit 端按 operation 字段分支调 updateTimebox / deleteTimebox。
 * handler.open 端通过 parseTimeboxesIntent 解析用户 prompt；
 *   解析成功 → mode='editing' 注入 prefill；
 *   解析失败 → mode='selecting' + parseReason。
 */

'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import type { TimeboxSummary } from '@/usom/types/summaries'

/** [023.04] T4 表单字段模型 — 与 TimeboxDraft 同构 */
interface TimeboxDraft {
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
  notes?: string
  tags?: string[]
  taskIds?: string[]
  habitIds?: string[]
}

interface EditTimeboxesProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

export function EditTimeboxes({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditTimeboxesProps) {
  // [023.04] I-2 polish: 父 rerender 时若 dataModel.mode 变化,同步 setMode
  //   (useState 仅读第一次的 initialMode,父若换新 prompt 重 open 会带新 mode)
  const initialMode = (dataModel.mode as 'selecting' | 'editing') ?? 'selecting'
  const [mode, setMode] = useState<'selecting' | 'editing'>(initialMode)
  useEffect(() => {
    setMode((dataModel.mode as 'selecting' | 'editing') ?? 'selecting')
  }, [dataModel.mode])
  const items = (dataModel.items as TimeboxSummary[]) ?? []
  const status = dataModel.status as string | undefined
  const selectedId = dataModel.selectedId as string | undefined
  const prefill = (dataModel.prefill as Partial<TimeboxDraft>) ?? {}
  // [T-eng-5] originalPrompt + parseReason（handler.open 透传）
  const originalPrompt = dataModel.originalPrompt as string | undefined
  const parseReason = dataModel.parseReason as string | undefined
  // [T-eng-2] needs_confirm（handler.open 透传或 onConfirm 后返 needs_confirm）
  const initialNeedsConfirm = (dataModel.needsConfirm as boolean | undefined) ?? false

  const [draft, setDraft] = useState<TimeboxDraft>({
    title: prefill.title ?? '',
    startTime: prefill.startTime ?? '',
    endTime: prefill.endTime ?? '',
    activityArchetypeId: prefill.activityArchetypeId,
    notes: prefill.notes ?? '',
    tags: prefill.tags ?? [],
    taskIds: prefill.taskIds ?? [],
    habitIds: prefill.habitIds ?? [],
  })

  // [023.11] 选中记录切换时把 prefill 同步进 draft（原仅 useState 初值读 → 选后空白）
  // 依赖 dataModel.selectedId（不是 prefill 引用）—— 切换记录才重置；用户编辑期间不覆盖
  useEffect(() => {
    setDraft({
      title: prefill.title ?? '',
      startTime: prefill.startTime ?? '',
      endTime: prefill.endTime ?? '',
      activityArchetypeId: prefill.activityArchetypeId,
      notes: prefill.notes ?? '',
      tags: prefill.tags ?? [],
      taskIds: prefill.taskIds ?? [],
      habitIds: prefill.habitIds ?? [],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataModel.selectedId])

  // [T-eng-2] AlertDialog 显示状态
  const [confirmOpen, setConfirmOpen] = useState(false)
  // [T-eng-2] 待确认的 payload（首次 onConfirm 调用被 AlertDialog 截下，确认后重提并加 confirmed=true）
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 已完成</p>

  if (mode === 'selecting') {
    return (
      <>
        {/* [T-eng-5] 顶部 originalPrompt echo + 解析引导 */}
        {originalPrompt && (
          <div className="mb-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-body">
            {parseReason ? (
              <>
                <div className="font-medium text-ink">我们没能识别您要修改哪一条，请选择</div>
                <div className="mt-1 text-error">原因：{parseReason}</div>
                <div className="mt-1 text-body/70">您刚才说：&quot;{originalPrompt}&quot;</div>
              </>
            ) : (
              <>
                <div className="font-medium text-ink">您刚才说：&quot;{originalPrompt}&quot;</div>
                <div className="mt-1 text-body/70">请选择一个时间盒开始修改</div>
              </>
            )}
          </div>
        )}
        {!originalPrompt && parseReason && (
          <div className="mb-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-body">
            <div className="font-medium text-ink">我们没能识别您要修改哪一条，请选择</div>
            <div className="mt-1 text-error">原因：{parseReason}</div>
          </div>
        )}
        {items.length === 0
          ? <p className="py-8 text-center text-sm text-body/70">未匹配到当日时间盒</p>
          : <div className="space-y-1 max-h-72 overflow-y-auto">
              {items.map(it => (
                <button key={it.id} type="button"
                  onClick={() => {
                    const nextDataModel = {
                      ...dataModel,
                      mode: 'editing' as const,
                      selectedId: it.id,
                      prefill: {
                        title: it.title,
                        startTime: it.startTime,
                        endTime: it.endTime,
                        activityArchetypeId: (it as unknown as { activityArchetypeId?: string }).activityArchetypeId,
                        notes: (it as unknown as { notes?: string }).notes,
                        taskIds: it.taskIds,
                        habitIds: it.habitIds,
                      },
                      status: it.status,
                    }
                    setMode('editing')
                    onDataChange(nextDataModel)
                  }}
                  className="w-full text-left rounded-md border border-hairline bg-canvas p-2 hover:bg-hover-overlay">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                    <span className="text-xs text-body/70">{it.status}</span>
                  </div>
                  <div className="text-xs text-body/70">{new Date(it.startTime).toLocaleString('zh-CN')}</div>
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

  // mode === 'editing'
  const update = (patch: Partial<TimeboxDraft>) => setDraft(d => ({ ...d, ...patch }))
  const titleFilled = typeof draft.title === 'string' && draft.title.trim().length > 0

  /** [T-eng-2] 构造 update payload；needsConfirm=true 时先弹 AlertDialog，确认后再提交。 */
  const submitUpdate = () => {
    const payload: Record<string, unknown> = {
      ...dataModel,
      operation: 'update',
      selectedId,
      fields: {
        title: draft.title,
        startTime: draft.startTime,
        endTime: draft.endTime,
        ...(draft.activityArchetypeId ? { activityArchetypeId: draft.activityArchetypeId } : {}),
        ...(draft.notes ? { notes: draft.notes } : {}),
        ...(draft.tags?.length ? { tags: draft.tags } : {}),
        ...(draft.taskIds?.length ? { taskIds: draft.taskIds } : {}),
        ...(draft.habitIds?.length ? { habitIds: draft.habitIds } : {}),
      },
    }
    if (initialNeedsConfirm) {
      setPendingPayload(payload)
      setConfirmOpen(true)
    } else {
      onConfirm(payload)
    }
  }

  const submitDelete = () => {
    onConfirm({
      ...dataModel,
      operation: 'delete',
      selectedId,
    })
  }

  const back = () => {
    setMode('selecting')
    onDataChange({ ...dataModel, mode: 'selecting', prefill: undefined, selectedId: undefined })
  }

  const canDelete = status === 'planned'

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          编辑时间盒{status ? `（${status}）` : ''}
        </span>
        <button type="button" onClick={back} className="text-xs text-body/70 underline">返回列表</button>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div>
          <label htmlFor="et-title" className="text-xs text-body">标题</label>
          <input id="et-title" type="text" value={draft.title}
            onChange={e => update({ title: e.target.value })}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="et-start" className="text-xs text-body">开始</label>
            <input id="et-start" type="datetime-local" value={isoToLocalDatetimeInput(draft.startTime)}
              onChange={e => update({ startTime: localDatetimeInputToIso(e.target.value) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="et-end" className="text-xs text-body">结束</label>
            <input id="et-end" type="datetime-local" value={isoToLocalDatetimeInput(draft.endTime)}
              onChange={e => update({ endTime: localDatetimeInputToIso(e.target.value) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
        <div>
          <label className="text-xs text-body">活动原型</label>
          <div className="mt-0.5">
            <ArchetypePicker value={draft.activityArchetypeId}
              onChange={id => update({ activityArchetypeId: id })} />
          </div>
        </div>
        <div>
          <label htmlFor="et-notes" className="text-xs text-body">备注</label>
          <textarea id="et-notes" value={draft.notes ?? ''}
            onChange={e => update({ notes: e.target.value })}
            rows={2}
            className="mt-0.5 w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink" />
        </div>
        {/* [023.04] T4 fold-in: 任务/习惯 ID 透传（可编辑） */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <label htmlFor="et-taskIds" className="text-xs text-body">任务 ID（逗号分隔）</label>
            <input id="et-taskIds" type="text"
              value={(draft.taskIds ?? []).join(',')}
              onChange={e => update({ taskIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
          <div className="flex-1">
            <label htmlFor="et-habitIds" className="text-xs text-body">习惯 ID（逗号分隔）</label>
            <input id="et-habitIds" type="text"
              value={(draft.habitIds ?? []).join(',')}
              onChange={e => update({ habitIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {canDelete ? (
          <button type="button" onClick={submitDelete}
            className="rounded-md border border-error px-3 py-1.5 text-xs text-error hover:bg-hover-overlay">
            删除该时间盒
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          {onCancel && <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
          <button type="button" onClick={submitUpdate} disabled={isLoading || !titleFilled}
            title={!titleFilled ? '请填写标题' : undefined}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            保存
          </button>
        </div>
      </div>

      {/* [T-eng-2] needs_confirm AlertDialog 二次确认 */}
      <AlertDialog open={confirmOpen} onOpenChange={o => { if (!o) setConfirmOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认修改</AlertDialogTitle>
            <AlertDialogDescription>此修改可能影响当日时间安排，是否继续？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmOpen(false); setPendingPayload(null) }}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingPayload) {
                onConfirm({ ...pendingPayload, confirmed: true })
              }
              setConfirmOpen(false)
              setPendingPayload(null)
            }}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
