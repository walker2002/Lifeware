'use client'

import { Input } from '@/components/ui/input'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
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
