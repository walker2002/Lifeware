/**
 * @file appointment-workspace
 * @brief 约定管理 Workspace（[026] A3 D2 reversal + T14 I-1 修复 / [023.05] PR2 T9 itinerary→appointment / [023.12] T10 按钮化）
 *
 * server component 加载时已调 reconcileAndAdvanceAppointments 推进非终态约定；
 * 此处纯客户端渲染 + 多选删除 + 内联「新建约定」Drawer。
 *
 * 列表筛 {scheduled}（已过期/已完成/已取消不显示）：
 *   - getAppointmentsByRange 服务端已按 AppointmentRepository.findActiveByRange
 *     过滤（终态排除），client 再 filter 保险（双层防御）。
 *   - server/client 双层是 [026] D2 reversal 的明示约定（brief §Step 2 注释）。
 *
 * 写入口:
 *   - 多选删除走 deleteAppointment server action（[026] T7 落地），走 Nexus
 *     流水线（submitDynamicIntent → Orchestrator → RuleEngine → SM）。
 *   - 新建约定走内联 CreateAppointmentDrawer → createAppointment server action
 *     （同 TimeboxDrawer 范式，[026] T14 I-1 修复）。
 *   - 完成 / 取消 / 回退走 [023.12] T5 server actions：completeAppointment /
 *     deleteAppointment / revertAppointment，调用后 reload() 重拉（与 delete
 *     模式同源）。
 *   - workspace 不直调 repo —— R-01 仓储隔离 + T-02 多租户透传。
 *
 * [023.12] T10 按钮化：
 *   - 派生 badge（执行中/已过期/计划）来自 deriveAppointmentDisplayStatus
 *     （T3 纯函数）；per-minute 刷新 now（无需每秒——约定按日历日算）。
 *   - OQ-1：当前无 appointment↔task/habit junction（design OQ-1 决定），
 *     取消/完成按钮无条件放行；`// TODO [027]: appointment task/habit guard`
 *     标注于 handler 上 + 按钮 title tooltip。
 *
 * [026] T14 I-1 修复：原 hash trigger `window.location.hash = 'createAppointment'`
 *   死链（standalone page 不在 chat 流，useIntentHandler 不监听 hash，且 surface
 *   必须由 ConversationView 挂载才能渲染）。改为内联 Sheet drawer，调
 *   createAppointment server action（走完整 Nexus 流水线 + SM create transition）。
 */
'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
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
import { Plus, CalendarOff, Trash2, Loader2, Pencil, Check, RotateCcw } from 'lucide-react'
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
import { deriveAppointmentDisplayStatus } from '@/domains/timebox/status/derive-display-status'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  // [026] 编辑入口：editingTarget = 正在被编辑的约定 summary；null = Drawer 关闭。
  // 不放在 selected set 中——多选删除语义 ≠ 编辑触发，避免与 toggle 选中冲突。
  const [editingTarget, setEditingTarget] = useState<AppointmentSummary | null>(null)
  // [BUG 修复] 列表创建/删除后不刷新：useState(initialItems) 在 mount 后不会因
  //   router.refresh() / RSC payload 变化而 reset（React 行为：useState 初值仅 mount 取一次）。
  //   改用显式 reload() 客户端重拉，覆盖两种入口（独立 page + GrowthMenu ActionView）。
  const [, startReload] = useTransition()

  // [023.12] T10：now state（per-minute 刷新）。deriveAppointmentDisplayStatus 按日历日算
  //  （localDayKey）——分钟粒度足够，不需要 timebox-card 那种 per-second。
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // 列表筛 {scheduled}（D2 reversal: server 已 filter，client 也再 filter 保险）
  //   [023.12] T10：in_progress 已不持久化（status 3 态: scheduled/cancelled/completed）。
  //   终态 cancelled/completed 当前不进列表（server `findByDateRange` 用 NON_TERMINAL
  //   过滤为 `['scheduled']`）—— 回退按钮仅在终态 item 出现时渲染（结构性，暂未触达）。
  const active = items.filter(i => i.status === 'scheduled')
  // 按 startTime 升序（最近未来在前）；Date 转毫秒可比较，TSO 兼容任意时区
  const sorted = [...active].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  const toggle = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // 重新拉取窗口内约定（与 /appointments/page.tsx 同步：-7d / +90d）
  const reload = useCallback(() => {
    startReload(async () => {
      const start = new Date()
      start.setDate(start.getDate() - 7)
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

  const handleDelete = async () => {
    // 快照 selected 防止 await 期间 setSelected 状态变更
    const ids = Array.from(selected)
    for (const id of ids) {
      try {
        // [026] deleteAppointment 走 submitDynamicIntent → Orchestrator → SM transition
        await deleteAppointment(id as any)
      } catch (e) {
        // 单条失败不阻断剩余删除（与 reconcileAndAdvanceAppointments 同款错误隔离）
        console.error('[AppointmentWorkspace] deleteAppointment failed', id, e)
      }
    }
    setSelected(new Set())
    // [026] 统一走 client reload —— 涵盖其他客户端并发变更；
    //   独立 page 路径 mount 时已触发 reconcile，删除无需再触发。
    reload()
  }

  // [023.12] T10：完成/取消/回退三个动作。
  //   调 [023.12] T5 server actions（submitDynamicIntent → Orchestrator → SM）：
  //     - completeAppointment：scheduled → completed
  //     - deleteAppointment（cancel 语义）：scheduled → cancelled
  //     - revertAppointment：{cancelled, completed} → scheduled
  //   OQ-1：当前无 appointment↔task/habit junction（design OQ-1 决定），
  //     取消/完成无条件放行；guard 留 [027]（junction 落地时一起做）。
  // TODO [027]: appointment task/habit guard
  const handleComplete = useCallback(async (id: string) => {
    try {
      // TODO [027]: appointment task/habit guard
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

  // TODO [027]: appointment task/habit guard
  const handleCancel = useCallback(async (id: string) => {
    try {
      // TODO [027]: appointment task/habit guard
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

  // [026] 编辑入口：从列表项触发 → 设 editingTarget（不切 selected，避免与多选态打架）。
  const openEditor = (it: AppointmentSummary) => {
    setSelected(new Set())
    setEditingTarget(it)
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h1 className="text-base font-display text-ink">我的约定</h1>
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
        <div className="flex-1 overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="还没有约定"
              description="创建一个约定，把它钉到未来的日历上"
              action={{
                label: '新建一个',
                onClick: () => setCreateOpen(true),
              }}
            />
          ) : (
            <div className="space-y-2">
              {sorted.map(it => {
                const checked = selected.has(it.id)
                // 终止态不可编辑（避免越权改，已设计如此——AppointmentRepository 端也禁）
                //   [023.12] T10：in_progress 不再持久化（status 3 态: scheduled/cancelled/completed）。
                const editable = it.status === 'scheduled'
                // [023.12] T10：派生 badge（执行中/已过期/计划）—— 替代原 in_progress 字面量分支
                const displayStatus = deriveAppointmentDisplayStatus(it.status, it.startTime, now)
                const statusLabel =
                  displayStatus === 'in_progress'
                    ? '执行中'
                    : displayStatus === 'expired'
                      ? '已过期'
                      : '计划'
                const statusClass =
                  displayStatus === 'in_progress'
                    ? 'text-primary'
                    : displayStatus === 'expired'
                      ? 'text-error'
                      : 'text-body/70'
                return (
                  <div
                    key={it.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`约定：${it.title}`}
                    onClick={() => toggle(it.id)}
                    onDoubleClick={() => editable && openEditor(it)}
                    onKeyDown={e => {
                      if (editable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        openEditor(it)
                      }
                    }}
                    className={`w-full text-left rounded-md border p-3 cursor-pointer ${
                      checked ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'
                    } hover:bg-hover-overlay`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink truncate flex-1">{it.title}</span>
                      <span className={`text-xs shrink-0 ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {editable && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`编辑约定：${it.title}`}
                          onClick={e => {
                            e.stopPropagation() // 不触发父 div 的选中 toggle
                            openEditor(it)
                          }}
                          className="text-body/70 hover:text-ink"
                        >
                          <Pencil />
                        </Button>
                      )}
                      {/* [023.12] T10：完成按钮（scheduled only）—— OQ-1 TODO: appointment task/habit guard */}
                      {editable && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`完成约定：${it.title}`}
                          title="标记为已完成（[027] 后续接入 task/habit 关联守卫）"
                          onClick={e => {
                            e.stopPropagation()
                            handleComplete(it.id)
                          }}
                          className="text-body/70 hover:text-success"
                        >
                          <Check />
                        </Button>
                      )}
                      {/* [023.12] T10：取消按钮（scheduled only）—— OQ-1 TODO: appointment task/habit guard */}
                      {editable && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`取消约定：${it.title}`}
                          title="取消此约定（[027] 后续接入 task/habit 关联守卫）"
                          onClick={e => {
                            e.stopPropagation()
                            handleCancel(it.id)
                          }}
                          className="text-body/70 hover:text-error"
                        >
                          <CalendarOff />
                        </Button>
                      )}
                      {/* [023.12] T10：回退按钮（cancelled/completed only）—— 清掉终态时间戳 */}
                      {(it.status === 'cancelled' || it.status === 'completed') && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`回退约定：${it.title}`}
                          title="回退到计划状态（清空完成/取消时间戳）"
                          onClick={e => {
                            e.stopPropagation()
                            handleRevert(it.id)
                          }}
                          className="text-body/70 hover:text-ink"
                        >
                          <RotateCcw />
                        </Button>
                      )}
                    </div>
                    <div className="text-xs text-body/70">
                      {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分钟
                    </div>
                  </div>
                )
              })}
            </div>
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

      {/* [026] 编辑入口：列表项「编辑按钮 / 双击 / 键盘 Enter」都会设 editingTarget，
          命中后挂 EditAppointmentDrawer。形态与 CreateAppointmentDrawer 同款 Sheet，
          提交走 updateAppointment（不走 submitDynamicIntent——updateAppointment 已封装
          mutation service + SM 状态守护；field_steps 模式天然支持单字段局部写）。 */}
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
 * 编辑约定 Drawer（[026] 编辑入口）
 * - Sheet（与 CreateAppointmentDrawer 同款 520px）
 * - <AppointmentFormFields> 公共组件 —— 与新建完全一致字段集合（标题/时间/时长/关系人/详情）
 * - 提交走 updateAppointment server action（直调 mutation service，5 字段可写）。
 *   字段白名单由 updateAppointment 内部强制（APPOINTMENT_UPDATE_ALLOWED），安全。
 * - needs_confirm 不适用：updateAppointment 不返回 needs_confirm（无 rule warning 路径）。
 *   若 server 抛错（SM 拒终态 / validation 失败），用 toast.error 兜底。
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
  // 初始 draft = 当前约定快照；detail/people 在 AppointmentSummary 已扩字段（schema 维度）。
  // 编辑期间若其他客户端改了同一约定，本地 draft 与 DB 可能短暂发散——用户保存时直接覆盖
  // （符合个人工具假设，不引入乐观锁；多客户端同写场景罕见）。
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
      // F4 contract: createAppointment/updateAppointment 返回 { status:'ok', appointment }
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
        // needs_confirm 不来自 updateAppointment（server action 直路径），防御性兜底
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
