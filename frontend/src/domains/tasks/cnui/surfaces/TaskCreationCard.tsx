'use client'

import { useState } from 'react'
import { CnuiFormAdapter } from '@/components/cnui/cnui-form-adapter'

interface TaskCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function TaskCreationCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: TaskCreationCardProps) {
  const [serverErrors, setServerErrors] = useState<string[]>([])

  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">任务创建</div>
      <CnuiFormAdapter
        domainId="tasks"
        action="createTask"
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
