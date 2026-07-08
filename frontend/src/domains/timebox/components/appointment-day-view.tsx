/**
 * @file appointment-day-view
 * @brief [026.02] T7 — /appointments 日视图（左列表 + 右本月日历）+ [026.02] T9.5 — 可选动作按钮
 *
 * 两栏布局：
 *   - 左：选中日的约定列表（按 startTime 升序）
 *   - 右：AppointmentMiniCalendar（带过期/未过期双色标记 + 跨月邻日）
 * 选中日期由父 AppointmentWorkspace 的 selectedDate state 控制。
 *
 * [026.02] T9.5 修复：
 *   - 加 6 个 optional props：onEdit / onComplete / onCancel / onRevert + selected / onToggleSelect
 *   - 提供时按 status 条件渲染 Edit/Complete/Cancel/Revert 4 个动作按钮 + 多选 toggle
 *   - 默认行为是纯展示（向后兼容：existing tests / future 静态复用）
 */

'use client'

import { Button } from '@/components/ui/button'
import { AppointmentMiniCalendar } from './appointment-mini-calendar'
import { EmptyState } from '@/components/empty-state'
import { CalendarOff, Pencil, Check, RotateCcw } from 'lucide-react'
import type { AppointmentSummary } from '@/usom/types/summaries'

interface Props {
  appointments: AppointmentSummary[]
  selectedDate: Date
  appointmentsByDate: Map<string, AppointmentSummary[]>
  onSelectDate: (date: Date) => void
  /** [026.02] T9.5: 4 个可选动作 + 2 个可选多选. 全 optional → 纯展示 fallback. */
  onEdit?: (it: AppointmentSummary) => void
  onComplete?: (id: string) => void
  onCancel?: (id: string) => void
  onRevert?: (id: string) => void
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
}

export function AppointmentDayView({
  appointments,
  selectedDate,
  appointmentsByDate,
  onSelectDate,
  onEdit,
  onComplete,
  onCancel,
  onRevert,
  selected,
  onToggleSelect,
}: Props) {
  // 把 byDate 平铺为右侧日历需要的形式（标记只看 status+startTime）
  const calendarItems: AppointmentSummary[] = []
  for (const list of appointmentsByDate.values()) calendarItems.push(...list)

  // 按 startTime 升序
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  // 是否有任何动作/多选接入 — 控制整列 wrapper 的交互行为
  const interactive = !!onToggleSelect || !!onEdit || !!onComplete || !!onCancel || !!onRevert

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
            {sorted.map(it => {
              const checked = selected?.has(it.id) ?? false
              // [026.02] T9.5：与原 inline 列表语义一致 — scheduled 可编辑/完成/取消；终态只可回退
              const isScheduled = it.status === 'scheduled'
              const isTerminal = it.status === 'cancelled' || it.status === 'completed'

              return (
                <div
                  key={it.id}
                  data-day-item={it.id}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? `约定：${it.title}` : undefined}
                  aria-pressed={selected ? checked : undefined}
                  onClick={onToggleSelect ? () => onToggleSelect(it.id) : undefined}
                  className={`rounded-md border p-3 ${
                    interactive ? 'cursor-pointer' : ''
                  } ${
                    checked ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'
                  } hover:bg-hover-overlay`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink truncate flex-1">
                      {it.title}
                    </span>
                    {/* [026.02] T9.5：scheduled 状态三动作（仅在 handler 提供时渲染） */}
                    {isScheduled && onEdit && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        data-action="edit"
                        aria-label={`编辑约定：${it.title}`}
                        onClick={e => {
                          e.stopPropagation()
                          onEdit(it)
                        }}
                        className="text-body/70 hover:text-ink"
                      >
                        <Pencil />
                      </Button>
                    )}
                    {isScheduled && onComplete && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        data-action="complete"
                        aria-label={`完成约定：${it.title}`}
                        onClick={e => {
                          e.stopPropagation()
                          onComplete(it.id)
                        }}
                        className="text-body/70 hover:text-success"
                      >
                        <Check />
                      </Button>
                    )}
                    {isScheduled && onCancel && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        data-action="cancel"
                        aria-label={`取消约定：${it.title}`}
                        onClick={e => {
                          e.stopPropagation()
                          onCancel(it.id)
                        }}
                        className="text-body/70 hover:text-error"
                      >
                        <CalendarOff />
                      </Button>
                    )}
                    {/* [026.02] T9.5：终态回退（cancelled/completed only） */}
                    {isTerminal && onRevert && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        data-action="revert"
                        aria-label={`回退约定：${it.title}`}
                        onClick={e => {
                          e.stopPropagation()
                          onRevert(it.id)
                        }}
                        className="text-body/70 hover:text-ink"
                      >
                        <RotateCcw />
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-body/70">
                    {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin} 分钟
                  </div>
                </div>
              )
            })}
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