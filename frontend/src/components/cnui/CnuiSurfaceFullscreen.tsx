/**
 * @file CnuiSurfaceFullscreen
 * @brief CN-UI Surface 全屏展开容器
 *
 * 桌面端：Dialog 覆盖主显示区
 * 移动端：Dialog 全屏
 */

'use client'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

/** 全屏容器属性 */
interface CnuiSurfaceFullscreenProps {
  /** 是否打开 */
  open: boolean
  /** 标题 */
  title: string
  /** 关闭回调 */
  onClose: () => void
  /** 子组件（Surface 内容） */
  children: React.ReactNode
}

export function CnuiSurfaceFullscreen({
  open,
  title,
  onClose,
  children,
}: CnuiSurfaceFullscreenProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="flex flex-col gap-0 p-0 w-full max-w-3xl h-[85vh] max-h-[85vh] sm:max-w-3xl"
      >
        {/* ── 顶部栏 ─────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-primary hover:text-primary-active transition-colors"
          >
            ← 返回对话
          </button>
          <DialogTitle className="text-sm font-medium text-ink">
            {title}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-ink transition-colors"
            title="缩小回对话"
          >
            ↙
          </button>
        </div>

        {/* ── 内容区：全量展示 + 滚动 ─────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}