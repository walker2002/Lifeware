/**
 * @file HabitListCard
 * @brief 习惯列表卡片 Surface
 * 
 * CNUI Surface 组件，展示活跃习惯列表
 */

'use client'

import { cn } from '@/lib/utils'

/**
 * 习惯项
 */
interface HabitItem {
  /** ID */
  id: string
  /** 标题 */
  title: string
  /** 默认时间 */
  defaultTime: string
  /** 默认时长 */
  defaultDuration: number
  /** 连续天数 */
  streak: number
  /** 频率类型 */
  frequencyType?: string
  /** 状态 */
  status: string
}

/**
 * 习惯列表卡片属性
 */
interface HabitListCardProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否加载中 */
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
                habit.status === 'active' && 'bg-success-soft text-success',
                habit.status === 'suspended' && 'bg-warning-soft text-warning',
                habit.status === 'draft' && 'bg-surface-card text-muted-foreground',
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
