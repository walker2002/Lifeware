import { Badge } from "@/components/ui/badge"

type StatusType = "active" | "suspended" | "archived"

interface StatusBadgeProps {
  status: StatusType
  label?: string
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
