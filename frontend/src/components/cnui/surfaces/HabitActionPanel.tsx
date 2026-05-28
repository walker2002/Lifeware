'use client'

interface HabitActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
}

export function HabitActionPanel({ dataModel }: HabitActionPanelProps) {
  return (
    <div className="rounded border border-dashed border-muted p-4 text-sm text-muted-foreground">
      HabitActionPanel — 待实现 (data: {JSON.stringify(dataModel)})
    </div>
  )
}
