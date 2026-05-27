'use client'

import type { CnuiComponentType } from '@/nexus/ai-runtime/cnui/types'
import { HabitCreationCard } from './surfaces/HabitCreationCard'
import { TimeboxList } from './surfaces/TimeboxList'

interface CnuiRendererProps {
  surfaceType: CnuiComponentType
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  isLoading?: boolean
}

const SURFACE_RENDERERS: Record<string, React.ComponentType<CnuiRendererProps>> = {
  'habit-creation-card': HabitCreationCard,
  'timebox-list': TimeboxList,
}

export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, isLoading }: CnuiRendererProps) {
  const Renderer = SURFACE_RENDERERS[surfaceType]

  if (!Renderer) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  return <Renderer surfaceType={surfaceType} dataModel={dataModel} onDataChange={onDataChange} onConfirm={onConfirm} isLoading={isLoading} />
}
