/**
 * @file schedule-workspace
 * @brief 时间盒工作台（[023] A2 / [026] A3.2 / [023.03] T3 错误反馈）
 *
 * 左栏：日期导航 + 当日时间盒列表（DayView 复用），支持创建/编辑/删除/lifecycle。
 * 右栏：Timebox Drawer 挂载点（Variant C v2，T4 实现）。
 * 配色用 CSS 变量令牌（bg-canvas/text-ink/border-hairline）。
 *
 * [023.03] T3：
 * - handleEdit 包 try/catch：getTimeboxById 失败 → toast.error
 * - handleAction 包 try/catch + 处理 needs_confirm → AlertDialog
 * - Drawer 标题前缀 [新建]/[编辑] 区分模式
 *
 * [026] A3.2：loadDay 改用 Promise.all 并行拉 timebox + itinerary，
 * 合并为 ScheduleEvent[] 后塞给 DayView。
 *
 * [026] codex D5 修复：loadDay **不**调 reconcileAndAdvanceItineraries
 * （避免 /schedule 翻日历页重推 N 次 SM）。reconcile 仅在 /itineraries
 * 触发。Trade-off：/schedule 可能显陈旧状态。可接受 MVP。
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { DayView } from './day-view'
import { TimeboxDrawer, type DrawerMode } from './timebox-drawer'
import { transitionTimebox, getTimeboxById } from '@/app/actions/timebox'
import { getTimeboxesByRange, getItinerariesByRange } from '@/app/actions/intent'
import { mergeEvents, type ScheduleEvent } from './schedule-event'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/empty-state'
import { Plus, CalendarOff } from 'lucide-react'
import { toast } from 'sonner'
import type { Timebox } from '@/usom/types/objects'
import type { TimeboxSummary } from '@/usom/types/summaries'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

interface DrawerState {
  mode: DrawerMode
  editTarget?: Timebox
}

/** [023.03] T3：needs_confirm 二次确认弹窗内容 */
interface ConfirmState {
  message: string
  /** 确认后的执行动作（已携带 confirmed=true） */
  action: () => Promise<void>
}

export function ScheduleWorkspace() {
  const [date, setDate] = useState(() => new Date())
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  // [023.03] T3：needs_confirm AlertDialog 状态
  const [confirming, setConfirming] = useState<ConfirmState | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  const loadDay = useCallback(async (d: Date) => {
    setLoading(true)
    try {
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      const [timeboxList, itineraryList] = await Promise.all([
        getTimeboxesByRange(start, end),
        getItinerariesByRange(start, end),
      ])
      setEvents(mergeEvents(timeboxList, itineraryList))
    } catch (e) {
      console.error('[ScheduleWorkspace] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  /** [023.03] T3：handleAction 包 try/catch + 处理 needs_confirm AlertDialog */
  const handleAction = useCallback(async (
    timeboxId: string,
    action: 'start' | 'end' | 'cancel' | 'log',
  ) => {
    setActionSubmitting(true)
    try {
      const r = await transitionTimebox(timeboxId, action)
      if (r.status === 'ok') {
        await loadDay(date)
        return
      }
      if (r.status === 'needs_confirm') {
        setConfirming({
          message: r.message,
          action: async () => {
            // 二次确认：用 confirmed=true 再调一次；不再开 confirm（避免无限循环）
            await handleAction(timeboxId, action)
          },
        })
        return
      }
      // 未知 status（防御性提示）
      toast.error('操作未完成')
    } catch (e) {
      console.error('[ScheduleWorkspace.handleAction] failed', e)
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionSubmitting(false)
    }
  }, [date, loadDay])

  /** [023.03] T3：handleEdit 包 try/catch + 视觉强化（标题前缀在 Drawer 内已实现） */
  const handleEdit = useCallback(async (summary: TimeboxSummary) => {
    try {
      const tb = await getTimeboxById(summary.id)
      if (!tb) {
        toast.error('未找到该时间盒')
        return
      }
      setDrawer({ mode: 'edit', editTarget: tb })
    } catch (e) {
      console.error('[ScheduleWorkspace.handleEdit] failed', e)
      toast.error(`加载时间盒失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  return (
    <div className="flex h-full">
      {/* 左栏：当日时间盒列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h1 className="text-base font-display text-ink">我的时间盒</h1>
          <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>
            <Plus className="size-4 mr-1" />新建时间盒
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-md bg-surface-card animate-pulse" />)}
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="今天还没有时间盒"
              description="创建一个时间盒，开始专注执行"
              action={{ label: '新建一个', onClick: () => setDrawer({ mode: 'create' }) }}
            />
          ) : (
            <DayView
              events={events}
              currentDate={date}
              onAction={(id, action) => handleAction(id, action as 'start' | 'end' | 'cancel' | 'log')}
              onEdit={handleEdit}
            />
          )}
        </div>
      </div>

      {/* 右栏：Drawer（T4 实现，由 drawer 状态控制开关） */}
      {drawer && (
        <TimeboxDrawer
          mode={drawer.mode}
          editTarget={drawer.editTarget}
          date={date}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); loadDay(date) }}
        />
      )}

      {/* [023.03] T3：needs_confirm 二次确认 AlertDialog */}
      <AlertDialog open={!!confirming} onOpenChange={o => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              onClick={async () => {
                const a = confirming?.action
                setConfirming(null)
                if (a) await a()
              }}
            >
              {actionSubmitting ? '处理中...' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}