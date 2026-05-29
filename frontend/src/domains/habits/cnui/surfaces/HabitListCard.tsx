'use client'

import { cn } from '@/lib/utils'

interface HabitItem {
  id: string
  title: string
  defaultTime: string
  defaultDuration: number
  streak: number
  frequencyType?: string
  status: string
}

interface HabitListCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}

export function HabitListCard({ dataModel }: HabitListCardProps) {
  const items = (dataModel.items as HabitItem[]) ?? []

  if (items.length === 0) {
    return (
      <div className="w-full max-w-lg py-8 text-center text-sm text-muted-foreground">
        暂无活跃习惯
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">活跃习惯</div>
      <div className="flex flex-col gap-2">
        {items.map(habit => (
          <div
            key={habit.id}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {habit.streak > 0 ? habit.streak : '—'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{habit.title}</div>
              <div className="text-xs text-muted-foreground">
                {habit.defaultTime}
                {habit.defaultDuration > 0 && ` · ${habit.defaultDuration} 分钟`}
                {habit.streak > 0 && (
                  <span className="ml-1 text-primary font-medium">
                    · 连续 {habit.streak} 天
                  </span>
                )}
              </div>
            </div>
            <div
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                habit.status === 'active' && 'bg-green-100 text-green-700',
                habit.status === 'suspended' && 'bg-yellow-100 text-yellow-700',
                habit.status === 'draft' && 'bg-gray-100 text-gray-600',
              )}
            >
              {habit.status === 'active' ? '进行中' : habit.status === 'suspended' ? '已暂停' : '草稿'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
