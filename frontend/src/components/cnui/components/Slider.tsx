'use client'

import { Slider as ShadcnSlider } from '@/components/ui/slider'

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
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
