/**
 * @file timeboxes-workspace
 * @brief 时间盒工作台（[023] A2 / [026] A3.2 / [023.03] T3 错误反馈 / [023.03] T4 重命名 /schedule→/timeboxes）
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
 * [023.03] T4：route /schedule → /timeboxes 重命名，类型/组件标识同步。
 * 函数名/类型名 改为 TimeboxesWorkspace / TimeboxesEvent；
 * 文件路径在时间盒域内统一为 timeboxes-* 前缀。
 *
 * [026] A3.2：loadDay 改用 Promise.all 并行拉 timebox + itinerary，
 * 合并为 TimeboxesEvent[] 后塞给 DayView。
 *
 * [026] codex D5 修复：loadDay **不**调 reconcileAndAdvanceItineraries
 * （避免 /timeboxes 翻日历页重推 N 次 SM）。reconcile 仅在 /itineraries
 * 触发。Trade-off：/timeboxes 可能显陈旧状态。可接受 MVP。
 *
 * [023.06] T2：注入视图模式状态 dateMode，渲染 <DateNav> 切换日/周/月。
 * 范围拉取统一用 getDateRange(mode, date)，复用 T1 已抽出的纯函数。
 * 本任务**保持只渲染 <DayView>**（保守基线），T3 才接 WeekView/MonthView。
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { DayView } from './day-view'
import { DateNav } from './date-nav'
import { TimeboxDrawer, type DrawerMode } from './timebox-drawer'
import { transitionTimebox, getTimeboxById } from '@/app/actions/timebox'
import { getTimeboxesByRange, getItinerariesByRange } from '@/app/actions/intent'
import { mergeEvents, type TimeboxesEvent } from './timeboxes-event'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/empty-state'
import { Plus, CalendarOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from 'date-fns'
import type { Timebox } from '@/usom/types/objects'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { DateViewMode } from './types'

/**
 * [023.06] 按视图模式计算日期范围（与 hooks/use-timebox.ts 同源，避免行为漂移）
 */
export function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'day':
      return { start: startOfDay(date), end: endOfDay(date) }
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) }
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) }
  }
}

/**
 * [023.06] 按视图模式步进日期
 */
function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  switch (mode) {
    case 'day': return addDays(date, delta)
    case 'week': return addWeeks(date, delta)
    case 'month': return addMonths(date, delta)
  }
}

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

export function TimeboxesWorkspace() {
  // [023.06] T2：视图模式 state + 当前浏览日期
  const [dateMode, setDateMode] = useState<DateViewMode>('day')
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [dateLoadKey, setDateLoadKey] = useState(0) // 触发 reload（避免 compare 不全）
  const [events, setEvents] = useState<TimeboxesEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  // [023.03] T3：needs_confirm AlertDialog 状态
  const [confirming, setConfirming] = useState<ConfirmState | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // [023.06] T2：范围拉取（替代 loadDay，行为对齐 T1 getDateRange）
  const loadRange = useCallback(async (mode: DateViewMode, d: Date) => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(mode, d)
      const [timeboxList, itineraryList] = await Promise.all([
        getTimeboxesByRange(start, end),
        getItinerariesByRange(start, end),
      ])
      setEvents(mergeEvents(timeboxList, itineraryList))
    } catch (e) {
      console.error('[TimeboxesWorkspace] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRange(dateMode, currentDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, currentDate, dateLoadKey])

  // [023.06] T2：DateNav 上 / 下导航（按当前 mode 步进日/周/月）
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => navigateDate(dateMode, prev, direction))
  }, [dateMode])

  // [023.06] T2：DateNav 切换视图模式
  const handleDateModeChange = useCallback((newMode: DateViewMode) => {
    if (newMode === dateMode) return
    setDateMode(newMode)
  }, [dateMode])

  // [023.06] T2：DayView mini-calendar 选日期 → 切回日视图并跳到该日
  const handleDateSelect = useCallback((d: Date) => {
    setCurrentDate(d)
    setDateMode('day')
  }, [])

  /** [023.03] T3：handleAction 包 try/catch + 处理 needs_confirm AlertDialog */
  const handleAction = useCallback(async (
    timeboxId: string,
    action: 'start' | 'end' | 'cancel' | 'log',
    confirmed = false,
  ) => {
    setActionSubmitting(true)
    try {
      const r = await transitionTimebox(timeboxId, action, {}, confirmed)
      if (r.status === 'ok') {
        await loadRange(dateMode, currentDate)
        return
      }
      if (r.status === 'needs_confirm') {
        setConfirming({
          message: r.message,
          action: async () => {
            // 二次确认：用 confirmed=true 再调一次；二次调用 SM 应当返回 ok，不再开 confirm
            await handleAction(timeboxId, action, true)
          },
        })
        return
      }
      // 未知 status（防御性提示）
      toast.error('操作未完成')
    } catch (e) {
      console.error('[TimeboxesWorkspace.handleAction] failed', e)
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionSubmitting(false)
    }
  }, [dateMode, currentDate, loadRange])

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
      console.error('[TimeboxesWorkspace.handleEdit] failed', e)
      toast.error(`加载时间盒失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  return (
    <div className="flex h-full">
      {/* 左栏：当日时间盒列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* [023.03] UI 统一：去重标题。PageBanner 已在主页 context 显示"我的时间盒"，
            独立 /timeboxes 路由的 PageBanner 同样提供标题。本组件不再重复。 */}
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
          {/* [023.06] T2：顶栏左侧 DateNav 视图模式切换 */}
          <DateNav
            mode={dateMode}
            currentDate={currentDate}
            onModeChange={handleDateModeChange}
            onNavigate={handleNavigate}
          />
          <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>
            <Plus className="size-4 mr-1" />新建时间盒
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-md bg-surface-card animate-pulse" />)}
            </div>
          ) : events.length === 0 && dateMode === 'day' ? (
            <EmptyState
              icon={CalendarOff}
              title="今天还没有时间盒"
              description="创建一个时间盒，开始专注执行"
              action={{ label: '新建一个', onClick: () => setDrawer({ mode: 'create' }) }}
            />
          ) : (
            <DayView
              events={events}
              currentDate={currentDate}
              onDateSelect={handleDateSelect}
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
          date={currentDate}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); loadRange(dateMode, currentDate) }}
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