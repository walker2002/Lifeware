'use client'

import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
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
