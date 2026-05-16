"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, startOfWeek, endOfWeek, addDays } from "date-fns"
import { zhCN } from "date-fns/locale"
import type { DateViewMode } from "./types"

interface DateNavProps {
  mode: DateViewMode
  currentDate: Date
  onModeChange: (mode: DateViewMode) => void
  onNavigate: (direction: 'prev' | 'next') => void
}

function formatNavLabel(date: Date, mode: DateViewMode): string {
  switch (mode) {
    case 'day':
      return format(date, 'yyyy年M月d日', { locale: zhCN })
    case 'week': {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
      return `${format(weekStart, 'M月d日', { locale: zhCN })} - ${format(weekEnd, 'M月d日', { locale: zhCN })}`
    }
    case 'month':
      return format(date, 'yyyy年M月', { locale: zhCN })
  }
}

const MODES: { value: DateViewMode; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
]

export function DateNav({ mode, currentDate, onModeChange, onNavigate }: DateNavProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('prev')}
          className="rounded-md p-1.5 text-body hover:bg-surface-soft hover:text-ink transition-colors"
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-sm font-medium text-ink">
          {formatNavLabel(currentDate, mode)}
        </span>
        <button
          type="button"
          onClick={() => onNavigate('next')}
          className="rounded-md p-1.5 text-body hover:bg-surface-soft hover:text-ink transition-colors"
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex gap-1 rounded-md bg-surface-soft p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors max-md:hidden ${
              m.value === 'week' ? 'md:block' : ''
            } ${
              mode === m.value
                ? "bg-surface-card text-ink shadow-sm"
                : "text-body hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
