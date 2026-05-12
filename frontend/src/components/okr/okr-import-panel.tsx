"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import type { ImportReport } from "@/lib/okr-import/types"

interface OKRImportPanelProps {
  initialMarkdown: string
  report: ImportReport
  onSave: (markdown: string) => Promise<{ success: boolean; error?: string; savedCount?: number }>
  onCancel: () => void
}

export function OKRImportPanel({ initialMarkdown, report, onSave, onCancel }: OKRImportPanelProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')
  const [currentObjIndex, setCurrentObjIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const objectiveCount = useMemo(() => {
    const matches = markdown.match(/^## Objective:/gm)
    return matches ? matches.length : 0
  }, [markdown])

  const handlePrev = () => {
    setCurrentObjIndex(Math.max(0, currentObjIndex - 1))
    scrollToObjective(currentObjIndex - 1)
  }

  const handleNext = () => {
    setCurrentObjIndex(Math.min(objectiveCount - 1, currentObjIndex + 1))
    scrollToObjective(currentObjIndex + 1)
  }

  const scrollToObjective = (index: number) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-okr-import-editor]')
    if (!textarea) return

    const lines = markdown.split('\n')
    let objCount = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## Objective:')) {
        objCount++
        if (objCount === index) {
          const charsBefore = lines.slice(0, i).join('\n').length
          textarea.scrollTop = charsBefore * 0.6
          break
        }
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    const result = await onSave(markdown)
    if (!result.success) {
      setSaveError(result.error ?? '保存失败')
    }
    setIsSaving(false)
  }

  const bannerStyle = report.confidence === 'high'
    ? 'bg-green-50 text-green-800 border-green-200'
    : report.confidence === 'medium'
      ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
      : 'bg-red-50 text-red-800 border-red-200'

  return (
    <div className="flex flex-col h-full">
      {/* 提取报告 Banner */}
      <div className={`mx-4 mt-4 mb-2 rounded-md border p-3 text-sm ${bannerStyle}`}>
        <div className="font-medium">
          识别到 {report.totalObjectives} 个目标、{report.totalKRs} 个关键结果
          {report.confidence !== 'high' && `（置信度: ${report.confidence === 'medium' ? '中' : '低'}）`}
        </div>
        {report.missingFields.length > 0 && (
          <div className="mt-1 text-xs">
            缺失信息: {report.missingFields.join('；')}
          </div>
        )}
        {report.warnings.length > 0 && (
          <div className="mt-1 text-xs">
            注意: {report.warnings.join('；')}
          </div>
        )}
      </div>

      {/* 模式切换 */}
      <div className="px-4 pb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setViewMode('code')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'code' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          代码
        </button>
        <button
          type="button"
          onClick={() => setViewMode('preview')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          预览
        </button>
      </div>

      {/* 编辑器/预览区 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {viewMode === 'code' ? (
          <textarea
            data-okr-import-editor
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            className="w-full h-full min-h-[400px] p-3 rounded-md border font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="OKR Markdown 内容..."
          />
        ) : (
          <div className="prose prose-sm max-w-none p-3 rounded-md border bg-background">
            <MarkdownPreview content={markdown} />
          </div>
        )}
      </div>

      {/* 保存错误提示 */}
      {saveError && (
        <div className="mx-4 mb-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="border-t px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentObjIndex <= 0}>
            ← 上一个
          </Button>
          <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
            {objectiveCount > 0 ? `${currentObjIndex + 1}/${objectiveCount}` : '0/0'}
          </span>
          <Button variant="outline" size="sm" onClick={handleNext} disabled={currentObjIndex >= objectiveCount - 1}>
            下一个 →
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving || objectiveCount === 0}>
            {isSaving ? '保存中...' : `保存全部 (${objectiveCount})`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const [ReactMarkdownComp, setReactMarkdownComp] = useState<React.ComponentType<{ children: string }> | null>(null)

  useEffect(() => {
    import('react-markdown').then(mod => {
      setReactMarkdownComp(() => mod.default)
    })
  }, [])

  if (!ReactMarkdownComp) {
    return <pre className="whitespace-pre-wrap text-sm">{content}</pre>
  }

  return <ReactMarkdownComp>{content}</ReactMarkdownComp>
}
