"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { validateFile, parseFileToText } from "@/lib/okr-import/file-parser"
import { importOKRFromFile } from "@/app/actions/okr-import"
import { okrExportTemplatesToMarkdown } from "./okr-form"
import type { ImportResult } from "@/lib/okr-import/types"

interface OKRImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: (result: ImportResult) => void
}

const ACCEPT_TYPES = ".md,.txt,.xlsx,.docx"

export function OKRImportDialog({ open, onOpenChange, onImportComplete }: OKRImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsProcessing(true)
    try {
      const text = await parseFileToText(file)
      const result = await importOKRFromFile(text, file.name)

      if (!result.markdown && result.parsedOKRs.length === 0) {
        setError(result.report.warnings[0] ?? 'AI 未能从文件中提取任何 OKR，请检查文件内容')
        return
      }

      onImportComplete(result)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件处理失败')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * [024.1] T3：触发浏览器下载 OKR 模板 Markdown 文件。
   * 用户在文件中填写 Objective/KR 后可再次上传导入。
   */
  const handleDownloadTemplate = () => {
    const markdown = okrExportTemplatesToMarkdown()
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const date = new Date().toISOString().slice(0, 10)
    const a = document.createElement("a")
    a.href = url
    a.download = `okr-模板-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导入 OKR</DialogTitle>
          <DialogDescription>
            上传包含 OKR 的文件，AI 将自动识别并提取目标与关键结果。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            支持格式: Markdown (.md)、纯文本 (.txt)、Excel (.xlsx)、Word (.docx)，文件大小限制 5MB
          </p>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleDownloadTemplate}
          >
            下载模板
          </Button>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            onChange={handleFileChange}
            disabled={isProcessing}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
          />
        </div>

        {isProcessing && (
          <div className="text-sm text-muted-foreground text-center py-2">
            AI 正在分析文件内容...
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
