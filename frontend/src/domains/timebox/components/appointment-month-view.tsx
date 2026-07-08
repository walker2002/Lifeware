/**
 * @file appointment-month-view
 * @brief [026.02] T8 — /appointments 月视图（全月日历网格）
 *
 * 7 列 × 6 行 = 42 天格；每格显示日期数字 + 当日约定计数 + 状态色（红=过期/蓝=未过期/灰=无）。
 * 点击日期触发 onSelectDate，父组件负责切换 viewMode='day'（跳日视图）。
 * 邻月日期淡灰 + 不打点。
 */

'use client'

import { cn } from '@/lib/utils'
import type { AppointmentSummary } from '@/usom/types/summaries'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function ymdKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  currentDate: Date
  appointments: AppointmentSummary[]
  onSelectDate: (date: Date) => void
}

export function AppointmentMonthView({ currentDate, appointments, onSelectDate }: Props) {
  const now = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const firstDow = (firstDay.getDay() + 6) % 7

  const cells: Array<{ date: Date; inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstDow
    const d = new Date(year, month, 1 + dayOffset)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }

  // 按 Y-M-D 聚合
  const dayMap = new Map<string, { count: number; hasExpired: boolean; hasFuture: boolean }>()
  for (const a of appointments) {
    if (a.status !== 'scheduled') continue
    const t = new Date(a.startTime)
    const key = ymdKey(t)
    const cur = dayMap.get(key) ?? { count: 0, hasExpired: false, hasFuture: false }
    cur.count += 1
    if (t.getTime() < now.getTime()) cur.hasExpired = true
    else cur.hasFuture = true
    dayMap.set(key, cur)
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-2 text-sm font-medium text-ink">
        {year} 年 {month + 1} 月
      </div>
      <div role="grid" aria-label={`${year} 年 ${month + 1} 月日历`} className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} role="columnheader" className="py-1 text-center text-body/70">
            {label}
          </div>
        ))}
        {cells.map(({ date, inMonth }, idx) => {
          const key = ymdKey(date)
          const info = dayMap.get(key)
          const color = info
            ? info.hasExpired
              ? 'bg-error/10 text-error'
              : 'bg-primary/10 text-primary'
            : ''
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              data-day-cell={key}
              onClick={() => onSelectDate(date)}
              className={cn(
                'min-h-[60px] flex flex-col items-center justify-start rounded-md border border-hairline p-1 text-left transition-colors',
                inMonth ? 'bg-canvas text-ink' : 'bg-canvas/50 text-body/40',
                color,
                'hover:bg-hover-overlay',
              )}
            >
              <span className="text-sm font-medium">{date.getDate()}</span>
              {info && (
                <span data-count className="text-xs">
                  {info.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}