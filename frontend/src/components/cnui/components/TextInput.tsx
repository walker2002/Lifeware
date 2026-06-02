/**
 * @file TextInput
 * @brief CN-UI 文本输入组件
 * 
 * 提供单行文本输入功能
 */

'use client'

import { Input } from '@/components/ui/input'

/**
 * TextInput 组件属性
 */
interface TextInputProps {
  /** 当前值 */
  value: string
  /** 值变更回调 */
  onChange: (value: string) => void
  /** 占位符文本 */
  placeholder?: string
  /** 标签文本 */
  label?: string
}

export function TextInput({ value, onChange, placeholder, label }: TextInputProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
