'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TextInput } from '../components/TextInput'
import { CnuiSelect } from '../components/Select'
import { TimePicker } from '../components/TimePicker'
import { Toggle } from '../components/Toggle'
import { CnuiButton } from '../components/Button'

interface HabitCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'custom', label: '自定义' },
]

export function HabitCreationCard({ dataModel, onDataChange, onConfirm }: HabitCreationCardProps) {
  const name = (dataModel.name as string) ?? ''
  const defaultTime = (dataModel.defaultTime as string) ?? '08:00'
  const duration = (dataModel.defaultDuration as number) ?? 30
  const frequency = (dataModel.frequencyType as string) ?? 'daily'
  const trackable = (dataModel.trackable as boolean) ?? true

  function update(patch: Record<string, unknown>) {
    onDataChange({ ...dataModel, ...patch })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>习惯创建</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextInput
          label="习惯名称"
          value={name}
          onChange={(v) => update({ name: v })}
          placeholder="例：每天跑步"
        />
        <TimePicker
          label="默认时间"
          value={defaultTime}
          onChange={(v) => update({ defaultTime: v })}
        />
        <CnuiSelect
          label="频率"
          value={frequency}
          onChange={(v) => update({ frequencyType: v })}
          options={FREQUENCY_OPTIONS}
        />
        <Toggle
          label="可追踪"
          value={trackable}
          onChange={(v) => update({ trackable: v })}
        />
        <div className="flex gap-2 pt-2">
          <CnuiButton label="确认创建" onClick={() => onConfirm(dataModel)} />
        </div>
      </CardContent>
    </Card>
  )
}
