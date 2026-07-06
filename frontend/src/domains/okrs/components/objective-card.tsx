/**
 * @file objective-card
 * @brief Objective 卡片组件
 *
 * 展示单个 Objective 的摘要信息和进度。
 * [022.01] Phase 3：删除 STATUS_LABELS / statusColor / status Badge——
 * Objective 状态语义由 Cycle 承载。
 * [023.12] T9：若传入 cycleStatus === 'reviewed'，点击交互被锁定——
 *   与 guard.ts ALLOWED['reviewed'] = {} 对齐（UI 层乐观检查，
 *   server 写路径由 assertEditable 兜底）。
 */

"use client"

import type { Objective, KeyResult, Cycle } from "@/usom/types/objects"
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
  /** [023.12] T9：父周期状态；reviewed 时点击交互被锁定 */
  cycleStatus?: Cycle["status"]
}

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "outline"> = {
  P0: "destructive",
  P1: "default",
  P2: "outline",
}

export function ObjectiveCard({ objective, keyResults, onClick, cycleStatus }: ObjectiveCardProps) {
  // [022.01] Phase 3：KR 列表不再按 kr.status 过滤（findAll 已返回非软删行）。
  const activeKRs = keyResults ?? []
  const avgProgress = activeKRs.length > 0
    ? Math.round(activeKRs.reduce((sum, kr) => sum + kr.progressRate * 100, 0) / activeKRs.length)
    : 0

  // [023.12] T9：reviewed 状态点击交互被锁定（与 guard.ts ALLOWED[reviewed] = {} 对齐）。
  // UI 层乐观检查；server 写路径由 assertEditable 兜底。
  const isLocked = cycleStatus === "reviewed"

  return (
    <Card
      className={
        isLocked
          ? "border-l-4 border-l-primary opacity-60 cursor-not-allowed"
          : "cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-primary"
      }
      onClick={isLocked ? undefined : () => onClick?.(objective.id)}
      title={isLocked ? "该周期已复盘，目标已锁定" : undefined}
      aria-disabled={isLocked || undefined}
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
            {/* [023.12] T9：reviewed 状态标记 badge */}
            {isLocked && (
              <Badge variant="outline" className="text-xs">已复盘</Badge>
            )}
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
