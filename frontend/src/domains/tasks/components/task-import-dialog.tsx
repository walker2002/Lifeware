/**
 * @file task-import-dialog
 * @brief 任务导入对话框
 * 
 * 支持从文件导入任务模板
 */

"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { validateFile, parseFileToText, isTaskTemplate } from "@/lib/task-import/file-parser"
import { extractTasks, type ImportPreview } from "@/lib/task-import/task-extractor"

/**
 * 任务导入对话框属性
 */
interface TaskImportDialogProps {
  /** 是否打开 */
  open: boolean
  /** 打开状态变更回调 */
  onOpenChange: (open: boolean) => void
  /** 导入回调 */
  onImport: (preview: ImportPreview) => Promise<void>
}

export function TaskImportDialog({ open, onOpenChange, onImport }: TaskImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'preview'>('upload')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) {
      setError(validation.error ?? "文件无效")
      return
    }

    setStep('analyzing')
    setError(null)

    try {
      const text = await parseFileToText(file)
      if (!isTaskTemplate(text)) {
        setError("未检测到任务模板格式（缺少 '## 项目:' 标记）")
        setStep('upload')
        return
      }

      const result = await extractTasks(text)
      setPreview(result)
      setStep('preview')
    } catch (e) {
      setError("解析文件失败，请确认文件格式正确")
      setStep('upload')
    }
  }

  const handleImport = async () => {
    if (!preview) return
    await onImport(preview)
    onOpenChange(false)
    reset()
  }

  const reset = () => {
    setStep('upload')
    setPreview(null)
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入任务模板</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className="flex flex-col items-center gap-4 py-8 border-2 border-dashed border-muted-foreground/25 rounded-lg"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <p className="text-sm text-muted-foreground">拖拽 .md/.txt 文件到此处</p>
            <p className="text-xs text-muted-foreground">或</p>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              选择文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.docx,.xlsx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">正在分析模板...</p>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-md p-3">
              <h3 className="text-sm font-medium">{preview.project?.name ?? "独立任务"}</h3>
              {preview.project?.priority && (
                <p className="text-xs text-muted-foreground mt-1">优先级: {preview.project.priority}</p>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">将导入 {preview.tasks.length} 个任务：</p>
              {preview.tasks.map((t) => (
                <div key={t.tempId} className="text-sm py-1" style={{ paddingLeft: `${t.depth * 20}px` }}>
                  {t.depth === 1 ? '↳ ' : ''}{t.title}
                  {t.estimatedDuration && <span className="text-xs text-muted-foreground ml-2">{t.estimatedDuration}分钟</span>}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setPreview(null) }}>
                重新选择
              </Button>
              <Button size="sm" onClick={handleImport}>
                确认导入
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
