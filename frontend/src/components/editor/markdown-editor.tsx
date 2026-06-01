"use client"

import { useState, useCallback } from "react"

interface MarkdownEditorProps {
  initialContent?: string
  onSubmit: (content: string) => void
  onCancel: () => void
  isLoading?: boolean
}

export function MarkdownEditor({ initialContent = '', onSubmit, onCancel, isLoading }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent)

  const handleSubmit = useCallback(() => {
    if (content.trim()) onSubmit(content)
  }, [content, onSubmit])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 p-3">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="h-full w-full resize-none rounded-md border border-hairline bg-background p-3 font-mono text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          placeholder="在此编辑 Markdown 内容..."
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm text-body hover:text-ink"
          disabled={isLoading}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !content.trim()}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? '处理中...' : '确认执行'}
        </button>
      </div>
    </div>
  )
}
