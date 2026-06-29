/**
 * @file schedule-workspace
 * @brief 时间盒工作台（[023] A2）— standalone 模式
 *
 * 左栏：日期导航 + 当日时间盒列表（DayView 复用），支持创建/编辑/删除/lifecycle。
 * 右栏：Timebox Drawer 挂载点（Variant C v2，T4 实现）。
 * 配色用 CSS 变量令牌（bg-canvas/text-ink/border-hairline）。
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { DayView } from './day-view'
import { TimeboxDrawer, type DrawerMode } from './timebox-drawer'
import { transitionTimebox, getTimeboxById } from '@/app/actions/timebox'
import { getTimeboxesByRange } from '@/app/actions/intent'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Plus, CalendarOff } from 'lucide-react'
import type { Timebox } from '@/usom/types/objects'
import type { TimeboxSummary } from '@/usom/types/summaries'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** Drawer 打开状态 */
interface DrawerState {
  mode: DrawerMode
  editTarget?: Timebox
}

export function ScheduleWorkspace() {
  const [date, setDate] = useState(() => new Date())
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const loadDay = useCallback(async (d: Date) => {
    setLoading(true)
    try {
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      // 走 server action（客户端禁止直 import db repo / drizzle）；返回 TimeboxSummary[]
      const list = await getTimeboxesByRange(start, end)
      setTimeboxes(list)
    } catch (e) {
      console.error('[ScheduleWorkspace] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  const handleAction = useCallback(async (timeboxId: string, action: 'start' | 'end' | 'cancel' | 'log') => {
    const r = await transitionTimebox(timeboxId, action)
    if (r.status === 'ok') await loadDay(date)
    // needs_confirm 由 T4 Drawer/弹窗处理（此处简化：reload）
  }, [date, loadDay])

  // 编辑：列表只有 summary（无 activityArchetypeId/notes），按 id 取完整 Timebox 再开 Drawer
  const handleEdit = useCallback(async (summary: TimeboxSummary) => {
    const tb = await getTimeboxById(summary.id)
    if (tb) setDrawer({ mode: 'edit', editTarget: tb })
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
          ) : timeboxes.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="今天还没有时间盒"
              description="创建一个时间盒，开始专注执行"
              action={{ label: '新建一个', onClick: () => setDrawer({ mode: 'create' }) }}
            />
          ) : (
            <DayView
              timeboxes={timeboxes}
              currentDate={date}
              onAction={(id, action) => handleAction(id, action as any)}
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
    </div>
  )
}