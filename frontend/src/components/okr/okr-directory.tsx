"use client"

import type { Objective } from "@/usom/types/objects"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import { Button } from "@/components/ui/button"
import { ObjectiveCard } from "./objective-card"

interface OKRDirectoryProps {
  objectives: Objective[]
  selectedId: string | null
  statusFilter: ObjectiveStatus | "all"
  onStatusFilterChange: (filter: ObjectiveStatus | "all") => void
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
}

const STATUS_TABS: { key: ObjectiveStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "active", label: "进行中" },
  { key: "paused", label: "已暂停" },
  { key: "completed", label: "已完成" },
  { key: "discarded", label: "已废弃" },
]

const PERIOD_ORDER = ['annual', 'semi_annual', 'quarterly', 'monthly']
const PERIOD_LABELS: Record<string, string> = {
  annual: '年度',
  semi_annual: '半年度',
  quarterly: '季度',
  monthly: '月度',
}

export function OKRDirectory({
  objectives, selectedId, statusFilter,
  onStatusFilterChange, onSelect, onEdit, onDelete, onCreate,
}: OKRDirectoryProps) {
  // 按周期类型分组
  const grouped = PERIOD_ORDER
    .map(pt => ({
      periodType: pt,
      label: PERIOD_LABELS[pt] ?? pt,
      items: objectives.filter(o => o.period.type === pt),
    }))
    .filter(g => g.items.length > 0)

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">OKR 目标</h2>
        <Button size="sm" onClick={onCreate}>+ 新建</Button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} type="button"
            onClick={() => onStatusFilterChange(tab.key)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="text-center text-muted-foreground text-xs py-6">
          暂无 OKR，点击右上角创建
        </div>
      )}

      {grouped.map(group => (
        <div key={group.periodType}>
          <div className="text-xs font-medium text-muted-foreground mb-1">{group.label}</div>
          <div className="space-y-1">
            {group.items.map(obj => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                onClick={() => onSelect(obj.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
