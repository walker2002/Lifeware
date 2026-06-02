/**
 * @file TimePicker
 * @brief CN-UI 时间选择组件
 * 
 * 提供时间输入功能
 */

'use client'

import { Input } from '@/components/ui/input'

/**
 * TimePicker 组件属性
 */
interface TimePickerProps {
  /** 当前值（HH:mm 格式） */
  value: string
  /** 值变更回调 */
  onChange: (value: string) => void
  /** 标签文本 */
  label?: string
}

export function TimePicker({ value, onChange, label }: TimePickerProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
