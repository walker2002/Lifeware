/**
 * @file HabitCreationCard
 * @brief 习惯创建卡片 Surface（[019.1] 手写化：弃 CnuiFormAdapter，直引 HabitForm）
 *
 * CNUI Surface 组件——tasks 同款手写范式：直接渲染 HabitForm 并把 serverErrors
 * 直传进去（接 useServerErrorBackfill）。默认值由 HabitForm 自身 useState fallback 提供。
 */
'use client'

import { HabitForm } from '@/domains/habits/components/habit-form'
import type { HabitFormFields } from '@/domains/habits/components/habit-form'

/**
 * 习惯创建卡片属性
 */
interface HabitCreationCardProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型（含服务端 open 返回的初始字段，如 startDate） */
  dataModel: Record<string, unknown>
  /** 数据变更回调（框架契约，当前不逐键回传——与旧 adapter 行为一致） */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调（接收 HabitForm 提交的 HabitFormFields） */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否加载中 */
  isLoading?: boolean
  /** 是否完成 */
  isDone?: boolean
  /** [019.1] 服务端 submit 失败的 errors，直传 HabitForm 回填 */
  serverErrors?: string[]
}

export function HabitCreationCard({ dataModel, onConfirm, onCancel, isLoading, serverErrors }: HabitCreationCardProps) {
  return (
    <HabitForm
      initial={dataModel as Partial<HabitFormFields>}
      onSubmit={(fields) => onConfirm(fields as unknown as Record<string, unknown>)}
      onCancel={onCancel}
      isLoading={isLoading}
      serverErrors={serverErrors}
    />
  )
}
