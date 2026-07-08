/**
 * @file appointment-view-toggle
 * @brief [026.02] T4 — 日/月视图切换按钮组
 *
 * 2 个 icon button，参照 [023.06] view-mode-switcher 范式。
 * aria-pressed 表达当前激活态（a11y 必填）。
 */

'use client'

import { Calendar, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppointmentViewMode = 'day' | 'month'

interface Props {
  viewMode: AppointmentViewMode
  onChange: (mode: AppointmentViewMode) => void
}

export function AppointmentViewToggle({ viewMode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="视图模式"
      className="inline-flex rounded-md border border-hairline bg-canvas"
    >
      <button
        type="button"
        aria-pressed={viewMode === 'day'}
        aria-label="日视图"
        onClick={() => onChange('day')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 text-xs text-ink',
          viewMode === 'day' && 'bg-primary text-primary-foreground',
          viewMode !== 'day' && 'hover:bg-hover-overlay',
        )}
      >
        <Calendar className="size-3.5" />
        日
      </button>
      <button
        type="button"
        aria-pressed={viewMode === 'month'}
        aria-label="月视图"
        onClick={() => onChange('month')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 text-xs text-ink',
          viewMode === 'month' && 'bg-primary text-primary-foreground',
          viewMode !== 'month' && 'hover:bg-hover-overlay',
        )}
      >
        <CalendarDays className="size-3.5" />
        月
      </button>
    </div>
  )
}