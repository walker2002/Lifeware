"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ProjectTemplate } from "@/usom/types/objects"

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyTemplate: (templateId: string) => Promise<void>
  onSaveCurrentAsTemplate?: () => Promise<void>
  templates: ProjectTemplate[]
  loading?: boolean
}

export function TemplateDialog({ open, onOpenChange, onApplyTemplate, onSaveCurrentAsTemplate, templates, loading = false }: TemplateDialogProps) {
  const [applying, setApplying] = useState<string | null>(null)

  const handleApply = async (templateId: string) => {
    setApplying(templateId)
    try {
      await onApplyTemplate(templateId)
      onOpenChange(false)
    } finally {
      setApplying(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从模板创建项目</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-hairline animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">暂无保存的模板</p>
            {onSaveCurrentAsTemplate && (
              <Button variant="outline" size="sm" onClick={onSaveCurrentAsTemplate}>
                保存当前项目为模板
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={applying === t.id}
                  onClick={() => handleApply(t.id)}
                >
                  {applying === t.id ? "创建中..." : "使用"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
