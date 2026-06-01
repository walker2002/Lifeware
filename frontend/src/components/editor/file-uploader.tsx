"use client"

import { useCallback, useRef } from "react"
import { Paperclip } from "lucide-react"

interface FileUploaderProps {
  onFileContent: (content: string, filename: string) => void
  accept?: string
}

export function FileUploader({ onFileContent, accept = '.md,.txt,.csv' }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    onFileContent(text, file.name)

    if (inputRef.current) inputRef.current.value = ''
  }, [onFileContent])

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="rounded-md p-2 text-body hover:bg-hover-overlay transition-colors"
      aria-label="上传文件"
    >
      <Paperclip className="size-4" />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </button>
  )
}
