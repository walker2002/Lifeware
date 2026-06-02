/**
 * @file register-form
 * @brief TaskForm CN-UI 注册
 * 
 * 由 tasks/index.ts（服务端）和客户端入口导入
 */

import { TaskForm } from './components/task-form'
import { FormRegistry } from '@/lib/form-registry'
import type { ComponentType } from 'react'

/**
 * TaskForm 适配器组件
 */
function TaskFormAdapter({ initial, onSubmit, onCancel, isLoading }: {
  /** 初始数据 */
  initial?: Record<string, unknown>
  /** 提交回调 */
  onSubmit: (fields: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 是否加载中 */
  isLoading?: boolean
}) {
  return (
    <TaskForm
      task={initial?.task as any}
      onSave={async (data) => { onSubmit(data as unknown as Record<string, unknown>) }}
      onCancel={() => onCancel?.()}
    />
  )
}

FormRegistry.register('tasks', 'createTask', {
  component: TaskFormAdapter as unknown as ComponentType<any>,
  fieldMapping: {
    title: 'title',
    description: 'description',
    priority: 'priority',
    energyRequired: 'energyRequired',
    estimatedDuration: 'estimatedDuration',
    frequencyType: 'frequencyType',
    daysOfWeek: 'daysOfWeek',
    startDate: 'startDate',
    endDate: 'endDate',
  },
  defaults: {
    priority: 'medium',
    energyRequired: 'medium',
    estimatedDuration: 60,
    frequencyType: 'once',
  },
})
