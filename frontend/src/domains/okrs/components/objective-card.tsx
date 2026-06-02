/**
 * @file objective-card
 * @brief Objective 卡片组件
 * 
 * 展示单个 Objective 的摘要信息和进度
 */

"use client"

import type { Objective, KeyResult } from "@/usom/types/objects"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * Objective 卡片属性
 */
interface ObjectiveCardProps {
  /** Objective 对象 */
  objective: Objective
  /** 关联的 KeyResults */
  keyResults?: KeyResult[]
  /** 点击回调 */
  onClick?: (id: string) => void
}

/** 状态标签映射 */
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", active: "进行中", paused: "已暂停",
  completed: "已完成", discarded: "已废弃", archived: "已归档",
}

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "outline"> = {
  P0: "destructive",
  P1: "default",
  P2: "outline",
}

export function ObjectiveCard({ objective, keyResults, onClick }: ObjectiveCardProps) {
  const activeKRs = (keyResults ?? []).filter(kr => kr.status !== "discarded" && kr.status !== "archived")
  const avgProgress = activeKRs.length > 0
    ? Math.round(activeKRs.reduce((sum, kr) => sum + kr.progressRate * 100, 0) / activeKRs.length)
    : 0

  const statusColor: Record<string, string> = {
    draft: "border-l-gray-400", active: "border-l-primary",
    paused: "border-l-yellow-500", completed: "border-l-green-500",
    discarded: "border-l-gray-300", archived: "border-l-gray-400",
  }

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${statusColor[objective.status] ?? ""}`}
      onClick={() => onClick?.(objective.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            {objective.objectiveNumber && (
              <span className="text-xs font-mono text-muted-foreground shrink-0">{objective.objectiveNumber}</span>
            )}
            <CardTitle className="text-sm font-medium leading-tight truncate">{objective.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Badge variant={PRIORITY_VARIANT[objective.priority] ?? "default"} className="text-xs">{objective.priority}</Badge>
            <Badge variant={objective.status === "active" ? "default" : "secondary"} className="text-xs">
              {STATUS_LABELS[objective.status] ?? objective.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(avgProgress, 100)}%` }} />
          </div>
          <span className="font-mono">{avgProgress}%</span>
          <span>{activeKRs.length} KR</span>
        </div>
      </CardContent>
    </Card>
  )
}
