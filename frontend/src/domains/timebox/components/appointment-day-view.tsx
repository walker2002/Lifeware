/**
 * @file appointment-day-view
 * @brief [026.02] T7 — /appointments 日视图（左列表 + 右本月日历）
 *
 * 两栏布局：
 *   - 左：选中日的约定列表（按 startTime 升序）
 *   - 右：AppointmentMiniCalendar（带过期/未过期双色标记 + 跨月邻日）
 * 选中日期由父 AppointmentWorkspace 的 selectedDate state 控制。
 */

'use client'

import { AppointmentMiniCalendar } from './appointment-mini-calendar'
import { EmptyState } from '@/components/empty-state'
import { CalendarOff } from 'lucide-react'
import type { AppointmentSummary } from '@/usom/types/summaries'

interface Props {
  appointments: AppointmentSummary[]
  selectedDate: Date
  appointmentsByDate: Map<string, AppointmentSummary[]>
  onSelectDate: (date: Date) => void
}

export function AppointmentDayView({
  appointments,
  selectedDate,
  appointmentsByDate,
  onSelectDate,
}: Props) {
  // 把 byDate 平铺为右侧日历需要的形式（标记只看 status+startTime）
  const calendarItems: AppointmentSummary[] = []
  for (const list of appointmentsByDate.values()) calendarItems.push(...list)

  // 按 startTime 升序
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  return (
    <div className="flex h-full">
      {/* 左：列表 */}
      <div data-day-list className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="该日无约定"
            description="在右侧日历选其他日期，或新建约定"
          />
        ) : (
          <div className="space-y-2">
            {sorted.map(it => (
              <div
                key={it.id}
                className="rounded-md border border-hairline bg-canvas p-3"
              >
                <div className="text-sm font-medium text-ink">{it.title}</div>
                <div className="text-xs text-body/70">
                  {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin} 分钟
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右：日历 */}
      <div data-day-calendar className="w-72 shrink-0 border-l border-hairline p-3">
        <AppointmentMiniCalendar
          currentDate={selectedDate}
          appointments={calendarItems}
          selectedDate={selectedDate}
          onDateSelect={onSelectDate}
        />
      </div>
    </div>
  )
}
