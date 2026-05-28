'use client'

interface HabitCheckinPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
}

export function HabitCheckinPanel({ dataModel }: HabitCheckinPanelProps) {
  return (
    <div className="rounded border border-dashed border-muted p-4 text-sm text-muted-foreground">
      HabitCheckinPanel — 待实现 (data: {JSON.stringify(dataModel)})
    </div>
  )
}
