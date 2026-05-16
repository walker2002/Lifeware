"use client"

import { useState } from "react"
import type { Objective } from "@/usom/types/objects"
import type { ObjectiveStatus } from "@/usom/types/primitives"
import { Button } from "@/components/ui/button"

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

function getPeriodGroupKey(period: { type: string; start: string }): string {
  const d = new Date(period.start)
  const y = d.getFullYear() % 100
  switch (period.type) {
    case 'annual': return `${y}Y`
    case 'semi_annual': return `${y}H${d.getMonth() < 6 ? 1 : 2}`
    case 'quarterly': return `${y}Q${Math.floor(d.getMonth() / 3) + 1}`
    case 'monthly': return `${y}M${String(d.getMonth() + 1).padStart(2, '0')}`
    default: return `${y}`
  }
}

export function OKRDirectory({
  objectives, selectedId, statusFilter,
  onStatusFilterChange, onSelect, onEdit, onDelete, onCreate, onImport,
}: OKRDirectoryProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groupMap = new Map<string, Objective[]>()
  for (const obj of objectives) {
    const key = getPeriodGroupKey(obj.period)
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(obj)
  }
  const groups = Array.from(groupMap.entries())
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => b.key.localeCompare(a.key))

  const downloadTemplate = () => {
    const template = `# OKR 导入模板

> **字段说明**
> - **类型**: \`承诺型\`（完成型目标）| \`愿景型\`（挑战型目标）
> - **优先级**: \`P0\`（必须完成）| \`P1\`（应该完成，默认）| \`P2\`（有余力则做）
> - **周期类型**: \`周\` | \`月\` | \`季\` | \`半年\` | \`年\`
> - **周期格式**: \`<type>标识\` 或 \`起始日期 ~ 结束日期\`
>   - 年: \`2026\` 或 \`2026-01-01 ~ 2026-12-31\`
>   - 半年: \`2026-H1\` 或 \`2026-H2\`
>   - 季: \`2026-Q1\` ~ \`2026-Q4\`
>   - 月: \`2026-M01\` ~ \`2026-M12\`
>   - 周: \`2026-W01\` ~ \`2026-W52\`

---

## Objective: 提升产品质量
<!-- 类型: 承诺型 | 愿景型 -->
<!-- 优先级: P0 | P1 | P2 -->
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 通过系统化质量管理提升产品整体质量

### KR 1: 代码覆盖率提升至 85%
- **目标值**: 85
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 客户满意度评分达到 4.5
- **目标值**: 4.5
- **单位**: 分
- **截止日期**: 2026-06-30

---

## Objective: 建立用户增长体系
<!-- 类型: 承诺型 | 愿景型 -->
<!-- 优先级: P0 | P1 | P2 -->
- **类型**: 愿景型
- **优先级**: P2
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 探索并建立可持续的用户增长机制

### KR 1: 月活用户达到 10000
- **目标值**: 10000
- **单位**: 人
- **截止日期**: 2026-06-30

---
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

      {groups.length === 0 && (
        <div className="text-center text-muted-foreground text-xs py-6">
          暂无 OKR，点击右上角创建
        </div>
      )}

      {groups.map(group => (
        <div key={group.key}>
          <button type="button"
            onClick={() => toggleGroup(group.key)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground py-1 w-full hover:bg-muted/50 rounded px-1 transition-colors">
            <span className="text-[10px] leading-none">
              {collapsedGroups.has(group.key) ? '▸' : '▾'}
            </span>
            {group.key}
            <span className="font-normal text-muted-foreground/60">({group.items.length})</span>
          </button>
          {!collapsedGroups.has(group.key) && (
            <div className="space-y-0.5">
              {group.items.map(obj => (
                <button key={obj.id} type="button"
                  onClick={() => onSelect(obj.id)}
                  title={obj.title}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-muted/80 transition-colors ${
                    selectedId === obj.id ? 'bg-muted font-medium' : ''
                  }`}>
                  {obj.objectiveNumber && (
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{obj.objectiveNumber}</span>
                  )}
                  <span className="truncate min-w-0">{obj.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
