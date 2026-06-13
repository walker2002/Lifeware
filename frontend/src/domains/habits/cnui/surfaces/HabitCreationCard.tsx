/**
 * @file HabitCreationCard
 * @brief 习惯创建卡片 Surface
 * 
 * CNUI Surface 组件，通过表单创建新习惯
 */

'use client'

import { useState } from 'react'
import { CnuiFormAdapter } from '@/components/cnui/cnui-form-adapter'

/**
 * 习惯创建卡片属性
 */
interface HabitCreationCardProps {
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
  /** 是否完成 */
  isDone?: boolean
}

export function HabitCreationCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: HabitCreationCardProps) {
  const [serverErrors, setServerErrors] = useState<string[]>([])

  return (
    <>
      <CnuiFormAdapter
        domainId="habits"
        action="createHabit"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isLoading={isLoading}
        isDone={isDone}
        serverErrors={serverErrors}
      />
    </>
  )
}
