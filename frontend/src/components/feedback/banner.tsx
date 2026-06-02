/**
 * @file banner
 * @brief 横幅提示组件
 * 
 * 提供信息、警告、错误三种类型的横幅提示
 */

"use client"

import { X } from "lucide-react"

/**
 * 横幅变体类型
 */
type BannerVariant = "info" | "warning" | "error"

/**
 * Banner 组件属性
 */
interface BannerProps {
  /** 变体类型 */
  variant: BannerVariant
  /** 标题 */
  title: string
  /** 描述文字 */
  description?: string
  /** 关闭回调 */
  onClose: () => void
}

/**
 * 变体样式映射
 */
const VARIANT_STYLES: Record<BannerVariant, { bar: string; bg: string }> = {
  info: {
    bar: "bg-info",
    bg: "bg-info-soft",
  },
  warning: {
    bar: "bg-warning",
    bg: "bg-warning-soft",
  },
  error: {
    bar: "bg-error",
    bg: "bg-error-soft",
  },
}

export function Banner({ variant, title, description, onClose }: BannerProps) {
  const styles = VARIANT_STYLES[variant]
  return (
    <div
      className={`relative flex items-start gap-3 rounded-md border border-hairline ${styles.bg} p-3 pl-4`}
      role="alert"
    >
      {/* 左侧语义色竖条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${styles.bar}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs text-body">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-sm p-1 text-body/40 hover:text-body transition-colors"
        aria-label="关闭"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
