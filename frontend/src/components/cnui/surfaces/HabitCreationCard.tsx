'use client'

import { useState } from 'react'
import { CnuiFormAdapter } from '../cnui-form-adapter'

interface HabitCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function HabitCreationCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: HabitCreationCardProps) {
  const [serverErrors, setServerErrors] = useState<string[] | undefined>(undefined)

  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">习惯创建</div>
      <CnuiFormAdapter
        domainId="habits"
        action="createHabit"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isLoading={isLoading}
        isDone={isDone}
        serverErrors={serverErrors}
      />
    </div>
  )
}
