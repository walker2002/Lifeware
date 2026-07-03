/**
 * @file itinerary-workspace
 * @brief 行程管理 Workspace（[026] A3 D2 reversal + T14 I-1 修复）
 *
 * server component 加载时已调 reconcileAndAdvanceItineraries 推进非终态行程；
 * 此处纯客户端渲染 + 多选删除 + 内联「新建行程」Drawer。
 *
 * 列表筛 {scheduled, in_progress}（已过期/已完成/已取消不显示）：
 *   - getItinerariesByRange 服务端已按 ItineraryRepository.findActiveByRange
 *     过滤（终态排除），client 再 filter 保险（双层防御）。
 *   - server/client 双层是 [026] D2 reversal 的明示约定（brief §Step 2 注释）。
 *
 * 写入口:
 *   - 多选删除走 deleteItinerary server action（[026] T7 落地），走 Nexus
 *     流水线（submitDynamicIntent → Orchestrator → RuleEngine → SM）。
 *   - 新建行程走内联 CreateItineraryDrawer → createItinerary server action
 *     （同 TimeboxDrawer 范式，[026] T14 I-1 修复）。
 *   - workspace 不直调 repo —— R-01 仓储隔离 + T-02 多租户透传。
 *
 * [026] T14 I-1 修复：原 hash trigger `window.location.hash = 'createItinerary'`
 *   死链（standalone page 不在 chat 流，useIntentHandler 不监听 hash，且 surface
 *   必须由 ConversationView 挂载才能渲染）。改为内联 Sheet drawer，调
 *   createItinerary server action（走完整 Nexus 流水线 + SM create transition）。
 */
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
import { Plus, CalendarOff, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteItinerary, createItinerary, type CreateItineraryInput } from '@/app/actions/timebox'
import { ItineraryFormFields, type ItineraryDraftFields } from '@/domains/timebox/cnui/surfaces/ItineraryFormFields'
import type { ItinerarySummary } from '@/usom/types/summaries'

/** 新建行程 Drawer 默认草稿（明日 9:00 + 1h，与 A2.5 handler 空 draft 同形） */
function defaultDraft(): ItineraryDraftFields {
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

export function ItineraryWorkspace({ initialItems }: { initialItems: ItinerarySummary[] }) {
  const router = useRouter()
  const [items, setItems] = useState<ItinerarySummary[]>(initialItems)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  // 列表筛 {scheduled, in_progress}（D2 reversal: server 已 filter，client 也再 filter 保险）
  const active = items.filter(i => i.status === 'scheduled' || i.status === 'in_progress')
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

  const handleDelete = async () => {
    // 快照 selected 防止 await 期间 setSelected 状态变更
    const ids = Array.from(selected)
    for (const id of ids) {
      try {
        // [026] deleteItinerary 走 submitDynamicIntent → Orchestrator → SM transition
        await deleteItinerary(id as any)
      } catch (e) {
        // 单条失败不阻断剩余删除（与 reconcileAndAdvanceItineraries 同款错误隔离）
        console.error('[ItineraryWorkspace] deleteItinerary failed', id, e)
      }
    }
    setSelected(new Set())
    // [026] T14 I-1：多选删除后用 router.refresh() 触发 server component 重跑，
    // 让 reconcileAndAdvanceItineraries + getItinerariesByRange 重读 DB（dedup stale）。
    // 比 setItems 本地 filter 更可靠（涵盖其他客户端/server 端变更）。
    router.refresh()
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h1 className="text-base font-display text-ink">我的行程</h1>
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
              aria-label="新建行程"
            >
              <Plus className="size-4 mr-1" />
              新建行程
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="还没有行程"
              description="创建一个行程，把它钉到未来的日历上"
              action={{
                label: '新建一个',
                onClick: () => setCreateOpen(true),
              }}
            />
          ) : (
            <div className="space-y-2">
              {sorted.map(it => {
                const checked = selected.has(it.id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={`w-full text-left rounded-md border p-3 ${
                      checked ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'
                    } hover:bg-hover-overlay`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                      <span className="text-xs text-body/70">
                        {it.status === 'in_progress' ? '执行中' : '计划'}
                      </span>
                    </div>
                    <div className="text-xs text-body/70">
                      {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分钟
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* [026] T14 I-1 修复：内联 Drawer（standalone page 不在 chat 流，必须独立 mount。
          与 TimeboxDrawer 同款 Sheet 模式：复用 <ItineraryFormFields> 公共组件，
          提交走 createItinerary server action → 完整 Nexus → SM create transition。 */}
      {createOpen && <CreateItineraryDrawer onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); router.refresh() }} />}
    </div>
  )
}

/**
 * 新建行程 Drawer（[026] T14 I-1）
 * - Sheet（右侧 520px，devx 同 TimeboxDrawer）
 * - <ItineraryFormFields> 公共组件（D4 决议 A 落地物）
 * - 提交走 createItinerary server action（非 raw mutation service —— 走 Nexus 流水线）
 * - needs_confirm 二次确认用 AlertDialog 原语（同 TimeboxDrawer）
 */
function CreateItineraryDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<ItineraryDraftFields>(defaultDraft)
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
      const input: CreateItineraryInput = {
        title,
        startTime: new Date(draft.startTime).toISOString(),
        durationMin: draft.durationMin,
        detail: draft.detail?.trim() ? draft.detail.trim() : null,
        people: draft.people,
      }
      const r = await createItinerary(input, confirmed)
      if (r.status === 'needs_confirm') {
        setConfirming({
          message: r.message,
          action: () => handleSubmit(true),
        })
      } else {
        toast.success('行程已创建')
        onSaved()
      }
    } catch (e) {
      console.error('[CreateItineraryDrawer] 提交失败', e)
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
          aria-label="新建行程"
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
          }}
        >
          <SheetHeader className="flex flex-row items-center justify-between shrink-0 space-y-0 px-5 py-3 border-b border-hairline-soft">
            <SheetTitle className="text-sm font-semibold text-ink">新建行程</SheetTitle>
          </SheetHeader>
          <SheetDescription className="sr-only">新建行程</SheetDescription>

          <div className="flex-1 overflow-y-auto p-5">
            <ItineraryFormFields
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
                '保存行程'
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
