"use client"

import { useCallback, useRef } from "react"

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
      className="rounded-md p-2 text-body hover:bg-surface-soft transition-colors"
      aria-label="上传文件"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
      </svg>
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
