/**
 * @file okr-import-panel
 * @brief OKR 模板导入后的编辑/保存面板
 *
 * 代码视图直接展示整个 Markdown（无分页）：textarea 固定 60vh 高度 + 内部滚动，
 * 取代旧的「上一个/下一个 目标」目标级翻页导航。底部仅保留 取消 / 保存全部。
 */

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
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 保存按钮标签与禁用态依赖的目标数（## Objective: 计数）
  const objectiveCount = useMemo(() => {
    const matches = markdown.match(/^## Objective:/gm)
    return matches ? matches.length : 0
  }, [markdown])

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
    ? 'bg-success-soft text-success border-success'
    : report.confidence === 'medium'
      ? 'bg-warning-soft text-warning border-warning'
      : 'bg-error-soft text-error border-error'

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

      {/* 编辑器/预览区：代码视图固定 60vh，内部滚动浏览整个 .md */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {viewMode === 'code' ? (
          <textarea
            data-okr-import-editor
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            className="w-full h-[60vh] p-3 rounded-md border font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring overflow-y-auto"
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

      {/* 底部操作栏：仅取消 / 保存全部（已取消目标级分页导航） */}
      <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          取消
        </Button>
        <Button onClick={handleSave} disabled={isSaving || objectiveCount === 0}>
          {isSaving ? '保存中...' : `保存全部 (${objectiveCount})`}
        </Button>
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
