"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ImportPreview } from "@/lib/task-import/task-extractor"

interface TaskImportPanelProps {
  preview: ImportPreview
  onImport: (preview: ImportPreview) => Promise<void>
  onBack: () => void
}

export function TaskImportPanel({ preview, onImport, onBack }: TaskImportPanelProps) {
  const [projectName, setProjectName] = useState(preview.project?.name ?? "")
  const [isLoading, setIsLoading] = useState(false)

  const handleImport = async () => {
    setIsLoading(true)
    try {
      await onImport({
        project: { ...preview.project, name: projectName || preview.project?.name || '' },
        tasks: preview.tasks,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted/30 rounded-md p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-project-name">项目名称</Label>
          <Input
            id="import-project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={preview.project?.name ?? "输入项目名称"}
          />
        </div>
        {preview.project?.priority && (
          <p className="text-xs text-muted-foreground mt-2">优先级: {preview.project.priority}</p>
        )}
        {preview.project?.defaultEarliestTime && (
          <p className="text-xs text-muted-foreground">默认最早时间: {preview.project.defaultEarliestTime}</p>
        )}
        {preview.project?.defaultLatestStartTime && (
          <p className="text-xs text-muted-foreground">默认最晚时间: {preview.project.defaultLatestStartTime}</p>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto">
        <p className="text-xs text-muted-foreground mb-2">将导入 {preview.tasks.length} 个任务：</p>
        {preview.tasks.map((t) => (
          <div key={t.tempId} className="flex items-center gap-2 text-sm py-1" style={{ paddingLeft: `${t.depth * 20}px` }}>
            {t.depth === 1 ? '↳ ' : ''}
            <span className="flex-1 truncate">{t.title}</span>
            {t.estimatedDuration && <span className="text-xs text-muted-foreground shrink-0">{t.estimatedDuration}分钟</span>}
            {t.priority && (
              <span className="text-xs px-1 rounded bg-muted shrink-0">{t.priority}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          重新选择
        </Button>
        <Button size="sm" disabled={isLoading} onClick={handleImport}>
          {isLoading ? "导入中..." : "确认导入"}
        </Button>
      </div>
    </div>
  )
}
