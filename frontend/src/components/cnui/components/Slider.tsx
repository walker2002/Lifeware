/**
 * @file Slider
 * @brief CN-UI 滑块组件
 * 
 * 提供数值范围选择功能
 */

'use client'

import { Slider as ShadcnSlider } from '@/components/ui/slider'

/**
 * Slider 组件属性
 */
interface SliderProps {
  /** 当前值 */
  value: number
  /** 值变更回调 */
  onChange: (value: number) => void
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 步进值 */
  step?: number
  /** 标签文本 */
  label?: string
}

export function CnuiSlider({ value, onChange, min = 0, max = 100, step = 1, label }: SliderProps) {
  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <ShadcnSlider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  )
}
