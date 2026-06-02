/**
 * @file dynamic-form
 * @brief 动态表单组件
 * 
 * 根据 FieldPrompt 配置动态渲染表单字段
 */

'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 表单字段配置
 */
export interface FieldPrompt {
  /** 字段名 */
  name: string
  /** 显示标签 */
  label: string
  /** 字段类型 */
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'multiselect' | 'toggle'
  /** 是否必填 */
  required: boolean
  /** 选项列表（select/multiselect 类型用） */
  options?: string[]
  /** 默认值 */
  default_value?: unknown
  /** 占位符文本 */
  placeholder?: string
}

/**
 * DynamicForm 组件属性
 */
interface DynamicFormProps {
  /** 字段配置列表 */
  fields: FieldPrompt[]
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 提交回调 */
  onSubmit: (values: Record<string, unknown>) => void
  /** 取消回调 */
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
