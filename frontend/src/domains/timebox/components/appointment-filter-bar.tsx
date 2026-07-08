/**
 * @file appointment-filter-bar
 * @brief [026.02] T5 — /appointments 筛选条
 *
 * 状态筛选（all / scheduled / completed / cancelled）+ 日期范围快捷（本周 / 本月）。
 * 复用 shadcn Select（保持与 /timeboxes FilterBar 一致）。
 */

'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { AppointmentFilterStatus, AppointmentDateRange } from '@/domains/timebox/lib/appointment-filter'

const STATUS_OPTIONS: Array<{ value: AppointmentFilterStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'scheduled', label: '计划' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

interface Props {
  status: AppointmentFilterStatus
  range: AppointmentDateRange
  onStatusChange: (s: AppointmentFilterStatus) => void
  onRangeChange: (r: AppointmentDateRange) => void
}

function rangeThisWeek(): AppointmentDateRange {
  const now = new Date()
  const dow = now.getDay() || 7  // 周日 getDay()=0, 转为 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function rangeThisMonth(): AppointmentDateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export function AppointmentFilterBar({ status, range, onStatusChange, onRangeChange }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline">
      <label className="flex items-center gap-1 text-xs text-ink">
        状态
        <Select value={status} onValueChange={v => onStatusChange(v as AppointmentFilterStatus)}>
          <SelectTrigger aria-label="状态" className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex items-center gap-1 text-xs text-ink">
        <span>日期</span>
        <Button size="sm" variant="secondary" aria-label="本周" onClick={() => onRangeChange(rangeThisWeek())}>
          本周
        </Button>
        <Button size="sm" variant="secondary" aria-label="本月" onClick={() => onRangeChange(rangeThisMonth())}>
          本月
        </Button>
        <span className="ml-2 text-body/70">
          {range.start.toLocaleDateString('zh-CN')} ~ {range.end.toLocaleDateString('zh-CN')}
        </span>
      </div>
    </div>
  )
}