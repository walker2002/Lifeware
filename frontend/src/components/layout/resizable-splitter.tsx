/**
 * @file resizable-splitter
 * @brief 可调整宽度的分隔条组件
 * 
 * 提供面板宽度拖拽调整功能
 */

"use client"

/**
 * ResizableSplitter 组件属性
 */
interface ResizableSplitterProps {
  /** 鼠标按下回调 */
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
