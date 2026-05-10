"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface HabitCardProps {
  /** 习惯标题 */
  title: string
  /** 是否可追踪 */
  trackable: boolean
  /** 默认时间 HH:MM */
  defaultTime: string
  /** 最早开始时间 HH:MM */
  earliestTime: string
  /** 最迟开始时间 HH:MM */
  latestStartTime: string
  /** 默认时长（分钟） */
  defaultDuration: number
  /** 最短时长（分钟） */
  minDuration: number
  /** 连续完成天数 */
  streak: number
  /** 习惯描述 */
  description?: string
  /** 最长连续天数 */
  longestStreak?: number
  /** 近7天完成次数 */
  completionRate7d?: number
  /** 习惯状态 */
  status?: string
  /** 频率类型 */
  frequencyType?: string
  /** 编辑回调 */
  onEdit?: () => void
  /** 状态切换回调（暂停/恢复/归档/删除） */
  onStatusChange?: (action: string) => void
  /** 今日是否已打卡 */
  todayLogged?: boolean
  /** 打卡回调 */
  onLog?: () => void
}

/** 时间窗口条: earliestTime ── defaultTime ── latestStartTime（最迟开始） */
function TimeWindowBar({
  earliestTime,
  defaultTime,
  latestStartTime,
}: {
  earliestTime: string
  defaultTime: string
  latestStartTime: string
}) {
  // 将 HH:MM 转换为分钟数，用于定位
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }

  const earliest = toMin(earliestTime)
  const default_ = toMin(defaultTime)
  const latest = toMin(latestStartTime)

  // 处理跨午夜: latestStartTime < earliestTime 表示次日
  const latestAdj = latest < earliest ? latest + 24 * 60 : latest
  const range = latestAdj - earliest || 1

  const defaultPos = ((default_ - earliest) / range) * 100
  const defaultPosAdj = default_ < earliest ? ((default_ + 24 * 60 - earliest) / range) * 100 : defaultPos

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0 tabular-nums">{earliestTime}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="absolute top-0 h-full rounded-full bg-primary/60"
          style={{ left: 0, right: `${100 - (defaultPosAdj || 50)}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-primary"
          style={{ left: `${defaultPosAdj || 50}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums">{latestStartTime}</span>
    </div>
  )
}

export function HabitCard({
  title,
  trackable,
  defaultTime,
  earliestTime,
  latestStartTime,
  defaultDuration,
  minDuration,
  streak,
  description,
  longestStreak = 0,
  completionRate7d = 0,
  status = "active",
  frequencyType,
  onEdit,
  onStatusChange,
  todayLogged,
  onLog,
}: HabitCardProps) {
  const isSuspended = status === "suspended"
  const isArchived = status === "archived"
  const isDraft = status === "draft"

  // 判断是否显示统计指标行：只要有一项有意义就显示
  const showStats = streak > 0 || longestStreak > 0 || completionRate7d > 0

  return (
    <Card className={cn("transition-opacity", isSuspended && "opacity-60", isArchived && "opacity-40")}>
      <CardContent className="flex flex-col gap-3">
        {/* 顶栏: 标题 + 标记 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{title}</span>
            <Badge variant={trackable ? "default" : "secondary"}>
              {trackable ? "可追踪" : "仅占时"}
            </Badge>
            {frequencyType && frequencyType !== "daily" && (
              <Badge variant="outline">{frequencyType === "weekly" ? "每周" : "自定义"}</Badge>
            )}
            {/* 状态标签 */}
            {isDraft && (
              <Badge variant="outline">草稿</Badge>
            )}
            {isSuspended && (
              <Badge variant="secondary">已暂停</Badge>
            )}
            {isArchived && (
              <Badge variant="secondary">已归档</Badge>
            )}
          </div>
          {streak > 0 && (
            <span className="text-sm font-medium text-primary">
              {streak} 天连续
            </span>
          )}
        </div>

        {/* 描述 */}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}

        {/* 时间窗口条 */}
        <TimeWindowBar
          earliestTime={earliestTime}
          defaultTime={defaultTime}
          latestStartTime={latestStartTime}
        />

        {/* 时长信息 */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>默认 {defaultDuration} 分钟</span>
          <span>最短 {minDuration} 分钟</span>
          <span className="tabular-nums">默认 {defaultTime}</span>
        </div>

        {/* 统计指标行 */}
        {showStats && (
          <div className="text-xs text-muted-foreground">
            连续 {streak} 天 · 最长 {longestStreak} 天 · 近7天 {completionRate7d} 次
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {trackable && onLog && !todayLogged && status === "active" && (
            <Button size="sm" onClick={onLog}>
              打卡
            </Button>
          )}
          {trackable && todayLogged && (
            <span className="text-xs font-medium text-success">今日已打卡</span>
          )}
          {/* 编辑按钮：所有状态都显示 */}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              编辑
            </Button>
          )}
          {/* active: [暂停] */}
          {onStatusChange && status === "active" && (
            <Button variant="outline" size="sm" onClick={() => onStatusChange("suspend")}>
              暂停
            </Button>
          )}
          {/* draft: [激活] [删除] */}
          {onStatusChange && isDraft && (
            <Button variant="outline" size="sm" onClick={() => onStatusChange("activate")}>
              激活
            </Button>
          )}
          {onStatusChange && isDraft && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange("delete")}>
              删除
            </Button>
          )}
          {/* suspended: [恢复] [归档] [删除] */}
          {onStatusChange && isSuspended && (
            <Button variant="outline" size="sm" onClick={() => onStatusChange("reactivate")}>
              恢复
            </Button>
          )}
          {onStatusChange && isSuspended && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange("archive")}>
              归档
            </Button>
          )}
          {onStatusChange && isSuspended && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange("delete")}>
              删除
            </Button>
          )}
          {/* archived: 仅编辑按钮（已在上方渲染），不显示其他按钮 */}
        </div>
      </CardContent>
    </Card>
  )
}
