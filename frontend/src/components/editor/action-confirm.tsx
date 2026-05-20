'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ActionConfirmProps {
  domainId: string
  action: string
  description: string
  targetSummary?: { name: string; status?: string; [key: string]: unknown }
  onConfirm: () => void
  onCancel: () => void
}

export function ActionConfirm({
  action,
  description,
  targetSummary,
  onConfirm,
  onCancel,
}: ActionConfirmProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{description || action}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {targetSummary && (
          <div className="rounded-md border p-3 bg-muted/50 space-y-1">
            <p className="font-medium">{targetSummary.name}</p>
            {targetSummary.status && (
              <p className="text-sm text-muted-foreground">
                当前状态：{String(targetSummary.status)}
              </p>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          确认执行此操作？此操作将通过意图引擎执行。
        </p>
        <div className="flex gap-2">
          <Button onClick={onConfirm}>确认</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  )
}
