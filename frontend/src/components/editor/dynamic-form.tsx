'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface FieldPrompt {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'multiselect' | 'toggle'
  required: boolean
  options?: string[]
  default_value?: unknown
  placeholder?: string
}

interface DynamicFormProps {
  fields: FieldPrompt[]
  domainId: string
  action: string
  onSubmit: (values: Record<string, unknown>) => void
  onCancel: () => void
}

export function DynamicForm({ fields, domainId, action, onSubmit, onCancel }: DynamicFormProps) {
  const initialValues: Record<string, unknown> = {}
  for (const f of fields) {
    initialValues[f.name] = f.default_value ?? (f.type === 'toggle' ? false : '')
  }

  const [values, setValues] = useState<Record<string, unknown>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setValue = useCallback((name: string, value: unknown) => {
    setValues(prev => ({ ...prev, [name]: value }))
    setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
  }, [])

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (f.required) {
        const v = values[f.name]
        if (v === '' || v === undefined || v === null) {
          errs[f.name] = `${f.label} 不能为空`
        }
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [fields, values])

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onSubmit(values)
    }
  }, [validate, onSubmit, values])

  function renderField(f: FieldPrompt) {
    const val = values[f.name]

    switch (f.type) {
      case 'textarea':
        return (
          <Textarea
            value={val as string}
            onChange={e => setValue(f.name, e.target.value)}
            placeholder={f.placeholder}
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            value={val as number | ''}
            onChange={e => setValue(f.name, e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={f.placeholder}
          />
        )

      case 'date':
        return (
          <Input
            type="date"
            value={val as string}
            onChange={e => setValue(f.name, e.target.value)}
          />
        )

      case 'time':
        return (
          <Input
            type="time"
            value={val as string}
            onChange={e => setValue(f.name, e.target.value)}
          />
        )

      case 'select':
        return (
          <Select value={val as string} onValueChange={v => setValue(f.name, v)}>
            <SelectTrigger><SelectValue placeholder={f.placeholder ?? '请选择'} /></SelectTrigger>
            <SelectContent>
              {f.options?.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'toggle':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={val as boolean}
              onCheckedChange={checked => setValue(f.name, checked)}
            />
            <span className="text-sm text-muted-foreground">
              {val ? '是' : '否'}
            </span>
          </div>
        )

      default: // text + unknown types fallback
        return (
          <Input
            type="text"
            value={val as string}
            onChange={e => setValue(f.name, e.target.value)}
            placeholder={f.placeholder}
          />
        )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{action}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(f => (
          <div key={f.name} className="space-y-1.5">
            <Label>
              {f.label}
              {f.required && <span className="text-error ml-0.5">*</span>}
            </Label>
            {renderField(f)}
            {errors[f.name] && (
              <p className="text-xs text-error">{errors[f.name]}</p>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit}>确认</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  )
}
