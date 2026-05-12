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
  onImport?: () => void
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
  onStatusFilterChange, onSelect, onEdit, onDelete, onCreate, onImport,
}: OKRDirectoryProps) {
  // 按周期类型分组
  const grouped = PERIOD_ORDER
    .map(pt => ({
      periodType: pt,
      label: PERIOD_LABELS[pt] ?? pt,
      items: objectives.filter(o => o.period.type === pt),
    }))
    .filter(g => g.items.length > 0)

  const downloadTemplate = () => {
    const template = `# OKR 导入模板

> **字段说明**
> - **类型**: 承诺型（完成型目标）| 愿景型（挑战型目标）
> - **优先级**: P0（必须完成）| P1（应该完成，默认）| P2（有余力则做）
> - **周期类型**: 周 | 月 | 季 | 半年 | 年
> - **周期格式**: <type>标识 或 起始日期 ~ 结束日期

---

## Objective: 目标标题
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 目标的详细说明

### KR 1: 关键结果标题
- **目标值**: 100
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 关键结果标题
- **目标值**: 50
- **单位**: 个
- **截止日期**: 2026-06-30
`
    const blob = new Blob([template], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'okr-import-template.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">OKR 目标</h2>
        <div className="flex gap-1">
          {onImport && (
            <Button variant="outline" size="sm" onClick={onImport}>导入</Button>
          )}
          <Button variant="ghost" size="sm" onClick={downloadTemplate} title="下载导入模板">
            模板
          </Button>
          <Button size="sm" onClick={onCreate}>+ 新建</Button>
        </div>
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
