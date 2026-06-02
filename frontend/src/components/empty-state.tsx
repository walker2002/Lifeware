/**
 * @file empty-state
 * @brief 空状态展示组件
 * 
 * 用于展示空列表、无数据等场景，提供图标、标题、描述和可选操作按钮
 */

"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { LucideIcon } from "lucide-react"

/**
 * EmptyState 组件属性
 */
interface EmptyStateProps {
  /** 图标组件（48px） */
  icon: LucideIcon
  /** 标题 */
  title: string
  /** 描述文字 */
  description?: string
  /** 可选操作按钮 */
  action?: {
    /** 按钮标签 */
    label: string
    /** 点击回调 */
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <Icon className="size-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-base font-medium text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-body">{description}</p>
      )}
      {action && (
        <Button
          variant="default"
          size="sm"
          onClick={action.onClick}
          className="mt-4"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
