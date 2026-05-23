'use client'

import { Switch } from '@/components/ui/switch'

interface ToggleProps {
  value: boolean
  onChange: (value: boolean) => void
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
