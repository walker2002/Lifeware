'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CnuiButton } from '../components/Button'

interface TimeboxItem {
  title: string
  startTime: string
  endTime: string
  color?: string
}

interface TimeboxListProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isDone?: boolean
}

export function TimeboxList({ dataModel, onDataChange, onConfirm, onCancel, isDone }: TimeboxListProps) {
  const items = (dataModel.items as TimeboxItem[]) ?? []

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    onDataChange({ ...dataModel, items: updated })
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>智能编排方案 ({items.length} 项)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无时间盒</p>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border p-2"
            style={{ borderLeftColor: item.color ?? '#6366f1', borderLeftWidth: 4 }}
          >
            <div className="flex-1">
              <span className="text-sm font-medium">{item.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {item.startTime} - {item.endTime}
              </span>
            </div>
            <button
              onClick={() => removeItem(i)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              移除
            </button>
          </div>
        ))}
        <div className="pt-2">
          <CnuiButton label="确认全部" onClick={() => onConfirm(dataModel)} />
        </div>
      </CardContent>
    </Card>
  )
}
