/**
 * @file TaskSplitCard
 * @brief 任务拆分卡片 CNUI Surface
 *
 * CNUI 表面 — 用于 AI 建议拆分可拆分任务
 */

'use client'

/**
 * TaskSplitCard 组件属性
 */
interface TaskSplitCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/**
 * 任务拆分卡片组件
 * @description AI 对话内展示的任务拆分建议
 */
export function TaskSplitCard(_props: TaskSplitCardProps) {
  // TODO: 实现任务拆分卡片 UI — AI 分析任务复杂度，建议拆分为多个子任务
  return null
}
