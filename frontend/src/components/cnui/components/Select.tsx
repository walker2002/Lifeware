/**
 * @file Select
 * @brief CN-UI 下拉选择组件
 * 
 * 提供下拉选项选择功能
 */

'use client'

import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Select 组件属性
 */
interface SelectProps {
  /** 当前值 */
  value: string
  /** 值变更回调 */
  onChange: (value: string) => void
  /** 选项列表 */
  options: Array<{ value: string; label: string }>
  /** 占位符文本 */
  placeholder?: string
  /** 标签文本 */
  label?: string
}

export function CnuiSelect({ value, onChange, options, placeholder, label }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <ShadcnSelect value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadcnSelect>
    </div>
  )
}
