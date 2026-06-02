/**
 * @file TimeboxList
 * @brief 智能编排时间盒列表 Surface
 * 
 * CNUI Surface 组件，展示智能编排方案中的时间盒列表
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CnuiButton } from '@/components/cnui/components/Button'

/**
 * 时间盒项
 */
interface TimeboxItem {
  /** 标题 */
  title: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 颜色 */
  color?: string
}

/**
 * 时间盒列表属性
 */
interface TimeboxListProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 是否完成 */
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
              className="text-xs text-error/70 hover:text-error"
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
