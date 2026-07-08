/**
 * @file appointment-mini-calendar
 * @brief [026.02] T6 — 约定专属 MiniCalendar（与 timebox MiniCalendar 完全独立）
 *
 * 派生规则：
 *   - 过期 = startTime < now AND status === 'scheduled' → text-error 红点
 *   - 未过期 = startTime >= now AND status === 'scheduled' → text-primary 蓝点
 *   - 终态（cancelled/completed）不打点（避免误导）
 *
 * 不复用 timebox MiniCalendar（[026] T15 IRON RULE 锁定 timebox-only）。
 * a11y：role="grid" + role="gridcell" + aria-selected。
 */

'use client'

import { cn } from '@/lib/utils'
import type { AppointmentSummary } from '@/usom/types/summaries'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  currentDate: Date
  appointments: AppointmentSummary[]
  selectedDate?: Date
  onDateSelect?: (date: Date) => void
}

export function AppointmentMiniCalendar({
  currentDate,
  appointments,
  selectedDate,
  onDateSelect,
}: Props) {
  const now = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // 当月第一天
  const firstDay = new Date(year, month, 1)
  // 周一为周首：getDay()=0(周日) → 6
  const firstDow = (firstDay.getDay() + 6) % 7

  // 生成 42 天网格（6 周 × 7 列）
  const cells: Array<{ date: Date; inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstDow
    const d = new Date(year, month, 1 + dayOffset)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }

  // 按 Y-M-D 索引标记
  const markers = new Map<string, 'expired' | 'future'>()
  for (const a of appointments) {
    if (a.status !== 'scheduled') continue  // 终态不打点
    const t = new Date(a.startTime)
    const key = ymd(t)
    const isExpired = t.getTime() < now.getTime()
    markers.set(key, isExpired ? 'expired' : 'future')
  }

  const selectedKey = selectedDate ? ymd(selectedDate) : null

  return (
    <div className="w-full">
      <div className="mb-1 text-sm font-medium text-ink">
        {year} 年 {month + 1} 月
      </div>
      <div role="grid" aria-label={`${year} 年 ${month + 1} 月日历`} className="grid grid-cols-7 gap-0.5 text-xs">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} role="columnheader" className="py-1 text-center text-body/70">
            {label}
          </div>
        ))}
        {cells.map(({ date, inMonth }, idx) => {
          const key = ymd(date)
          const marker = markers.get(key)
          const isSelected = key === selectedKey
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              data-day-cell={key}
              onClick={() => onDateSelect?.(date)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-md py-1.5 transition-colors',
                inMonth ? 'text-ink' : 'text-body/40',
                isSelected && 'ring-2 ring-primary',
                !isSelected && 'hover:bg-hover-overlay',
              )}
            >
              <span>{date.getDate()}</span>
              {marker && (
                <span
                  data-marker={marker}
                  className={cn(
                    'absolute bottom-0.5 size-1 rounded-full',
                    marker === 'expired' ? 'bg-error' : 'bg-primary',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}