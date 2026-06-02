/**
 * @file Toggle
 * @brief CN-UI 开关组件
 * 
 * 提供布尔值切换功能
 */

'use client'

import { Switch } from '@/components/ui/switch'

/**
 * Toggle 组件属性
 */
interface ToggleProps {
  /** 当前值 */
  value: boolean
  /** 值变更回调 */
  onChange: (value: boolean) => void
  /** 标签文本 */
  label?: string
}

export function Toggle({ value, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={value} onCheckedChange={onChange} />
      {label && <label className="text-sm font-medium">{label}</label>}
    </div>
  )
}
