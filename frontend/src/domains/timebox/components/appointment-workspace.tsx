/**
 * @file appointment-workspace
 * @brief 约定管理 Workspace（[026.02] T9 整合 + T9.5 恢复 per-item 动作）
 *
 * server component 加载时已调 reconcileAndAdvanceAppointments 推进非终态约定；
 * 此处纯客户端渲染 + 多选删除 + 内联「新建/编辑约定」Drawer。
 *
 * [026.02] T9 视图架构：
 *   - viewMode (day | month) 切 AppointmentDayView | AppointmentMonthView
 *   - filterStatus + filterRange (filterAppointments 纯函数) → 派生 filtered
 *   - byDate (Map<Y-M-D, AppointmentSummary[]>) 喂 DayView 的右侧日历
 *   - selectedDate (默认 today) 控 DayView 左列与右侧选中态
 *   - MonthView 点击 → setSelectedDate(d) + setViewMode('day') 跳日视图
 *
 * [026.02] T9.5 恢复（修复 DayView 整合后丢失的 inline 动作按钮）：
 *   - 4 个 handler: handleComplete / handleCancel / handleRevert（[023.12] T10 加的）+ handleDelete
 *   - selected set (多选 delete 用) + editingTarget state (开 EditAppointmentDrawer)
 *   - openEditor / toggle helper
 *   - EditAppointmentDrawer inline 组件（[026] 编辑入口）
 *   - DayView 接 onEdit / onComplete / onCancel / onRevert / selected / onToggleSelect
 *
 * 写入口:
 *   - 多选删除走 deleteAppointment server action（[026] T7 落地），走 Nexus
 *     流水线（submitDynamicIntent → Orchestrator → RuleEngine → SM）。
 *   - 新建/编辑约定走内联 CreateAppointmentDrawer / EditAppointmentDrawer →
 *     createAppointment / updateAppointment server action（同 TimeboxDrawer 范式）。
 *   - workspace 不直调 repo —— R-01 仓储隔离 + T-02 多租户透传。
 *
 * [026] T14 I-1 修复：原 hash trigger `window.location.hash = 'createAppointment'`
 *   死链（standalone page 不在 chat 流，useIntentHandler 不监听 hash，且 surface
 *   必须由 ConversationView 挂载才能渲染）。改为内联 Sheet drawer，调
 *   createAppointment server action（走完整 Nexus 流水线 + SM create transition）。
 */
'use client'

import { useState, useCallback, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteAppointment,
  createAppointment,
  updateAppointment,
  completeAppointment,
  revertAppointment,
  type CreateAppointmentInput,
} from '@/app/actions/timebox'
import { getAppointmentsByRange } from '@/app/actions/intent'
import { AppointmentFormFields, type AppointmentDraftFields } from '@/domains/timebox/cnui/surfaces/AppointmentFormFields'
import { AppointmentPageBanner } from './appointment-page-banner'
import { AppointmentViewToggle, type AppointmentViewMode } from './appointment-view-toggle'
import { AppointmentFilterBar } from './appointment-filter-bar'
import { AppointmentDayView } from './appointment-day-view'
import { AppointmentMonthView } from './appointment-month-view'
import { filterAppointments, type AppointmentFilterStatus } from '@/domains/timebox/lib/appointment-filter'
import { ymdKey } from '@/domains/timebox/lib/appointment-date-utils'
import type { AppointmentSummary } from '@/usom/types/summaries'

/** 新建约定 Drawer 默认草稿（明日 9:00 + 1h，与 A2.5 handler 空 draft 同形） */
function defaultDraft(): AppointmentDraftFields {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return {
    id: crypto.randomUUID(),
    title: '',
    startTime: next.toISOString(),
    durationMin: 60,
    detail: null,
    people: [],
  }
}

export function AppointmentWorkspace({ initialItems }: { initialItems: AppointmentSummary[] }) {
  const [items, setItems] = useState<AppointmentSummary[]>(initialItems)
  // [026.02] T9.5 恢复：多选删除用的 selected set
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  // [026.02] T9.5 恢复：editingTarget = 正在被编辑的约定 summary；null = Drawer 关闭
  const [editingTarget, setEditingTarget] = useState<AppointmentSummary | null>(null)
  // [BUG 修复] 列表创建/删除后不刷新：useState(initialItems) 在 mount 后不会因
  //   router.refresh() / RSC payload 变化而 reset（React 行为：useState 初值仅 mount 取一次）。
  //   改用显式 reload() 客户端重拉，覆盖两种入口（独立 page + GrowthMenu ActionView）。
  const [, startReload] = useTransition()

  // [026.02] T9：视图状态 + 筛选 + 选中日期
  const [viewMode, setViewMode] = useState<AppointmentViewMode>('day')
  const [filterStatus, setFilterStatus] = useState<AppointmentFilterStatus>('all')
  // 默认筛选范围 = 本月（month view 主体可观测，day view 看到本月内约定）
  const [filterRange, setFilterRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  })
  // 默认选中日期 = 今天（DayView 左列 + 右侧日历选中态）
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())

  // 派生筛选后列表 + 按 Y-M-D 分桶（[026.02] T9）
  const filtered = useMemo(
    () => filterAppointments(items, filterStatus, filterRange),
    [items, filterStatus, filterRange],
  )
  const byDate = useMemo(() => {
    const m = new Map<string, AppointmentSummary[]>()
    for (const it of filtered) {
      const t = new Date(it.startTime)
      const key = ymdKey(t)
      const arr = m.get(key) ?? []
      arr.push(it)
      m.set(key, arr)
    }
    return m
  }, [filtered])
  const selectedKey = ymdKey(selectedDate)
  const dayAppointments = byDate.get(selectedKey) ?? []

  // 重新拉取窗口内约定（与 /appointments/page.tsx 同步：-90d / +90d —— 7→90 扩窗
  //   避免 day view 选历史日时 reload 把历史数据过滤丢；与 page.tsx 初始加载对齐）
  const reload = useCallback(() => {
    startReload(async () => {
      const start = new Date()
      start.setDate(start.getDate() - 90)  // [026.02] T9: 7→90 扩窗
      const end = new Date()
      end.setDate(end.getDate() + 90)
      try {
        const list = await getAppointmentsByRange(start, end)
        setItems(list)
      } catch (e) {
        console.error('[AppointmentWorkspace] reload failed', e)
        toast.error('约定列表刷新失败')
      }
    })
  }, [])

  // [026.02] T9.5 恢复：selected toggle
  const toggle = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // [026.02] T9.5 恢复：多选删除（[026] T7 已有的 deleteAppointment server action）
  // [026.02.2] M-6: sequential await → Promise.allSettled, 并行 + 部分失败聚合
  const handleDelete = async () => {
    // 快照 selected 防止 await 期间 setSelected 状态变更
    const ids = Array.from(selected)
    const results = await Promise.allSettled(
      ids.map((id) => deleteAppointment(id as any)),
    )
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      // 部分失败聚合提示（不阻断成功项的 reload 刷新）
      console.error('[AppointmentWorkspace] deleteAppointment partial failure', failed)
      toast.error(`${failed.length} 条删除失败`)
    }
    setSelected(new Set())
    // [026] 统一走 client reload —— 涵盖其他客户端并发变更；
    //   独立 page 路径 mount 时已触发 reconcile，删除无需再触发。
    reload()
  }

  // [026.02] T9.5 恢复：完成/取消/回退三个动作（[023.12] T10 加的）
  //   调 [023.12] T5 server actions（submitDynamicIntent → Orchestrator → SM）：
  //     - completeAppointment：scheduled → completed
  //     - deleteAppointment（cancel 语义）：scheduled → cancelled
  //     - revertAppointment：{cancelled, completed} → scheduled
  // TODO [027]: appointment task/habit guard（OQ-1）
  const handleComplete = useCallback(async (id: string) => {
    try {
      const r = await completeAppointment(id as any)
      if (r.status === 'ok') {
        toast.success('约定已完成')
        reload()
      } else {
        toast.error(r.message ?? '完成失败')
      }
    } catch (e) {
      console.error('[AppointmentWorkspace] completeAppointment failed', id, e)
      toast.error(e instanceof Error ? e.message : '完成失败，请重试')
    }
  }, [reload])

  const handleCancel = useCallback(async (id: string) => {
    try {
      const r = await deleteAppointment(id as any)
      if (r.status === 'ok') {
        toast.success('约定已取消')
        reload()
      } else {
        toast.error(r.message ?? '取消失败')
      }
    } catch (e) {
      console.error('[AppointmentWorkspace] deleteAppointment (cancel) failed', id, e)
      toast.error(e instanceof Error ? e.message : '取消失败，请重试')
    }
  }, [reload])

  const handleRevert = useCallback(async (id: string) => {
    try {
      const r = await revertAppointment(id as any)
      if (r.status === 'ok') {
        toast.success('约定已回退')
        reload()
      } else {
        toast.error(r.message ?? '回退失败')
      }
    } catch (e) {
      console.error('[AppointmentWorkspace] revertAppointment failed', id, e)
      toast.error(e instanceof Error ? e.message : '回退失败，请重试')
    }
  }, [reload])

  // [026.02] T9.5 恢复：openEditor — 清掉 selected 多选态避免与编辑触发冲突
  const openEditor = (it: AppointmentSummary) => {
    setSelected(new Set())
    setEditingTarget(it)
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-h-0">
        {/* [026.02] T9：顶部 Banner（沿用 Timebox Domain 图片集） */}
        <AppointmentPageBanner />
        {/* [026.02] T9：左 ViewToggle + 右 新建按钮行；T9.5 增「删除选中」入口 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-hairline gap-2">
          <AppointmentViewToggle viewMode={viewMode} onChange={setViewMode} />
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                <Trash2 className="size-4 mr-1" />
                删除选中（{selected.size}）
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              aria-label="新建约定"
            >
              <Plus className="size-4 mr-1" />
              新建约定
            </Button>
          </div>
        </div>
        {/* [026.02] T9：状态筛选 + 日期范围快捷 */}
        <AppointmentFilterBar
          status={filterStatus}
          range={filterRange}
          onStatusChange={setFilterStatus}
          onRangeChange={setFilterRange}
        />
        {/* [026.02] T9：视图分发 — day → DayView; month → MonthView
            T9.5 修复：DayView 接 onEdit/onComplete/onCancel/onRevert/selected/onToggleSelect
            恢复 per-item 动作按钮 + 多选 toggle */}
        <div className="flex-1 min-h-0">
          {viewMode === 'day' ? (
            <AppointmentDayView
              appointments={dayAppointments}
              selectedDate={selectedDate}
              appointmentsByDate={byDate}
              onSelectDate={setSelectedDate}
              onEdit={openEditor}
              onComplete={handleComplete}
              onCancel={handleCancel}
              onRevert={handleRevert}
              selected={selected}
              onToggleSelect={toggle}
            />
          ) : (
            <AppointmentMonthView
              currentDate={selectedDate}
              appointments={filtered}
              onSelectDate={d => {
                setSelectedDate(d)
                setViewMode('day')
              }}
            />
          )}
        </div>
      </div>

      {/* [026] T14 I-1 修复：内联 Drawer（standalone page 不在 chat 流，必须独立 mount。
          与 TimeboxDrawer 同款 Sheet 模式：复用 <AppointmentFormFields> 公共组件，
          提交走 createAppointment server action → 完整 Nexus → SM create transition。

          [BUG 修复] 保存后用 reload() 重拉（不用 router.refresh()，原因见组件顶部注释）。 */}
      {createOpen && (
        <CreateAppointmentDrawer
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false)
            reload()
          }}
        />
      )}

      {/* [026.02] T9.5 恢复：编辑入口 — editingTarget 命中时挂 EditAppointmentDrawer */}
      {editingTarget && (
        <EditAppointmentDrawer
          target={editingTarget}
          onClose={() => setEditingTarget(null)}
          onSaved={() => {
            setEditingTarget(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

/**
 * 编辑约定 Drawer（[026.02] T9.5 恢复）
 * - Sheet（与 CreateAppointmentDrawer 同款 520px）
 * - <AppointmentFormFields> 公共组件 —— 与新建完全一致字段集合（标题/时间/时长/关系人/详情）
 * - 提交走 updateAppointment server action（直调 mutation service，5 字段可写）。
 *   字段白名单由 updateAppointment 内部强制（APPOINTMENT_UPDATE_ALLOWED），安全。
 */
function EditAppointmentDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: AppointmentSummary
  onClose: () => void
  onSaved: () => void
}) {
  // 初始 draft = 当前约定快照；detail/people 在 AppointmentSummary 已扩字段
  const [draft, setDraft] = useState<AppointmentDraftFields>(() => ({
    id: target.id,
    title: target.title,
    startTime: target.startTime as unknown as string,
    durationMin: target.durationMin,
    detail: target.detail ?? null,
    people: target.people ?? [],
  }))
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    const title = draft.title.trim()
    if (!title || submitting) return
    if (!draft.startTime || draft.durationMin <= 0) return
    setSubmitting(true)
    try {
      const r = await updateAppointment(target.id as any, {
        title,
        startTime: new Date(draft.startTime).toISOString(),
        durationMin: draft.durationMin,
        detail: draft.detail?.trim() ? draft.detail.trim() : null,
        people: draft.people,
      })
      if (r.status === 'ok') {
        toast.success('约定已更新')
        onSaved()
      } else {
        toast.error(r.message ?? '更新失败')
      }
    } catch (e) {
      console.error('[EditAppointmentDrawer] 提交失败', e)
      toast.error(e instanceof Error ? e.message : '更新失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [draft, submitting, target.id, onSaved])

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="w-[520px] sm:max-w-[520px] gap-0 p-0"
        aria-label={`编辑约定：${target.title}`}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
        }}
      >
        <SheetHeader className="flex flex-row items-center justify-between shrink-0 space-y-0 px-5 py-3 border-b border-hairline-soft">
          <SheetTitle className="text-sm font-semibold text-ink">编辑约定</SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only">编辑约定</SheetDescription>

        <div className="flex-1 overflow-y-auto p-5">
          <AppointmentFormFields
            draft={draft}
            onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
            disabled={submitting}
          />
        </div>

        <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={!draft.title.trim() || draft.durationMin <= 0 || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1 size-3 animate-spin" />
                保存中
              </>
            ) : (
              '保存修改'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * 新建约定 Drawer（[026] T14 I-1）
 * - Sheet（右侧 520px，devx 同 TimeboxDrawer）
 * - <AppointmentFormFields> 公共组件（D4 决议 A 落地物）
 * - 提交走 createAppointment server action（非 raw mutation service —— 走 Nexus 流水线）
 * - needs_confirm 二次确认用 AlertDialog 原语（同 TimeboxDrawer）
 */
function CreateAppointmentDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<AppointmentDraftFields>(defaultDraft)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState<{
    message: string
    action: () => Promise<void>
  } | null>(null)

  const handleSubmit = useCallback(async (confirmed?: boolean) => {
    const title = draft.title.trim()
    if (!title || submitting) return
    if (!draft.startTime || draft.durationMin <= 0) return
    setSubmitting(true)
    try {
      const input: CreateAppointmentInput = {
        title,
        startTime: new Date(draft.startTime).toISOString(),
        durationMin: draft.durationMin,
        detail: draft.detail?.trim() ? draft.detail.trim() : null,
        people: draft.people,
      }
      const r = await createAppointment(input, confirmed)
      if (r.status === 'needs_confirm') {
        setConfirming({
          message: r.message,
          action: () => handleSubmit(true),
        })
      } else {
        toast.success('约定已创建')
        onSaved()
      }
    } catch (e) {
      console.error('[CreateAppointmentDrawer] 提交失败', e)
      toast.error(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [draft, submitting, onSaved])

  return (
    <>
      <Sheet open onOpenChange={o => { if (!o) onClose() }}>
        <SheetContent
          side="right"
          className="w-[520px] sm:max-w-[520px] gap-0 p-0"
          aria-label="新建约定"
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
          }}
        >
          <SheetHeader className="flex flex-row items-center justify-between shrink-0 space-y-0 px-5 py-3 border-b border-hairline-soft">
            <SheetTitle className="text-sm font-semibold text-ink">新建约定</SheetTitle>
          </SheetHeader>
          <SheetDescription className="sr-only">新建约定</SheetDescription>

          <div className="flex-1 overflow-y-auto p-5">
            <AppointmentFormFields
              draft={draft}
              onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
              disabled={submitting}
            />
          </div>

          <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={!draft.title.trim() || draft.durationMin <= 0 || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  保存中
                </>
              ) : (
                '保存约定'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirming} onOpenChange={o => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认创建</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirming?.action}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}