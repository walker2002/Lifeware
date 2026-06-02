/**
 * @file status-badge
 * @brief 状态徽章组件
 * 
 * 展示对象的状态（进行中/已暂停/已归档），使用不同颜色区分
 */

import { Badge } from "@/components/ui/badge"

/**
 * 状态类型
 */
type StatusType = "active" | "suspended" | "archived"

/**
 * StatusBadge 组件属性
 */
interface StatusBadgeProps {
  /** 状态类型 */
  status: StatusType
  /** 自定义标签（可选，默认使用预置标签） */
  label?: string
  /** 尺寸大小 */
  size?: "sm" | "md"
}

const STATUS_CONFIG: Record<StatusType, { label: string; className: string }> = {
  active: {
    label: "进行中",
    className: "bg-success-soft text-success border-success",
  },
  suspended: {
    label: "已暂停",
    className: "bg-warning-soft text-warning border-warning",
  },
  archived: {
    label: "已归档",
    className: "bg-surface-soft text-muted-foreground border-hairline",
  },
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge
      variant="outline"
      className={`rounded-pill border ${config.className} ${size === "sm" ? "text-xs px-2" : "text-xs px-2.5"}`}
    >
      {label ?? config.label}
    </Badge>
  )
}
