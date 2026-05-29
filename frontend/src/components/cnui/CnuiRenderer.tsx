'use client'

import type { CnuiComponentType } from '@/nexus/ai-runtime/cnui/types'
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

interface CnuiRendererProps {
  surfaceType: CnuiComponentType
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CnuiRendererProps) {
  const reg = cnuiRegistry.get(surfaceType)

  if (!reg) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  const Component = reg.component
  return (
    <Component
      surfaceType={surfaceType}
      dataModel={dataModel}
      onDataChange={onDataChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      isDone={isDone}
    />
  )
}
