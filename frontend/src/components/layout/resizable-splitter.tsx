"use client"

interface ResizableSplitterProps {
  onMouseDown: (e: React.MouseEvent) => void
}

export function ResizableSplitter({ onMouseDown }: ResizableSplitterProps) {
  return (
    <div
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-border active:bg-primary/30 transition-colors"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整宽度"
    />
  )
}
