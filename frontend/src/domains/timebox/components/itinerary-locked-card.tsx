/**
 * @file itinerary-locked-card
 * @brief /timeboxes 上 itinerary 锁定卡（[026] A3.2 / [023.03] T4 重命名）
 *
 * 与 TimeboxCard 同构（compact + 完整模式），但 itinerary **只读**：
 * - 无 onAction / onEdit 回调
 * - 视觉用 border-l-primary（"锁定"语义）区分 timebox 的"可执行"卡
 * - 状态徽章来自 ItineraryStatus 5 态（scheduled / in_progress / expired / completed / cancelled）
 *
 * status 直接来自 DB（D2 reversal），不读时算。
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";
import type { ItinerarySummary } from "@/usom/types/summaries";
import type { ItineraryStatus } from "@/usom/types/primitives";

/** ItineraryStatus 5 态 → Badge 变体 + 中文 label */
const STATUS_STYLES: Record<
  ItineraryStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  scheduled: { variant: "outline", label: "计划" },
  in_progress: { variant: "default", label: "执行中" },
  expired: { variant: "destructive", label: "已过期" },
  completed: { variant: "secondary", label: "已完成" },
  cancelled: { variant: "outline", label: "已取消" },
};

/** HH:MM 格式化（与 TimeboxCard.formatTime 行为一致，Asia/Shanghai） */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

interface ItineraryLockedCardProps {
  itinerary: ItinerarySummary;
  /** 紧凑模式：与 TimeboxCard compact 保持同尺寸 */
  compact?: boolean;
}

/**
 * ItineraryLockedCard — 行程只读卡（timeboxes 视图）。
 *
 * [026] A3.2：不可执行（无 onAction / onEdit）。点击行为：
 * - T14 阶段接 GrowthMenu 触发 CNUI surface 'editItinerary'（与既有 timeboxes
 *   action 模式同模型）。当前 click 行为 = noop（占位 div 不可点）。
 *
 * [023.03] T4：route /schedule → /timeboxes 命名同步。
 *
 * 视觉规范：border-l-4 border-primary（锁定）+ bg-canvas（与 timebox 的
 * surface-card 区分），用 token 颜色，禁 Tailwind 默认色。
 */
export function ItineraryLockedCard({ itinerary, compact = false }: ItineraryLockedCardProps) {
  const statusStyle = STATUS_STYLES[itinerary.status] ?? STATUS_STYLES.scheduled;

  if (compact) {
    return (
      <div className="flex flex-col rounded-md border border-hairline bg-canvas border-l-4 border-l-primary">
        {/* 第一行：时间 + 标题 + 时长 + 状态徽章 */}
        <div className="flex items-center gap-2 px-3 py-2">
          <MapPin className="size-3 shrink-0 text-primary" />
          <span className="text-xs text-body whitespace-nowrap">
            {formatTime(itinerary.startTime)} · {itinerary.durationMin}分钟
          </span>
          <span className="flex-1 truncate text-sm font-medium text-ink">
            {itinerary.title}
          </span>
          <Badge variant={statusStyle.variant} className="text-xs shrink-0">
            {statusStyle.label}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline border-l-4 border-l-primary bg-canvas p-4">
      {/* 第一行：图标 + 时间 + 标题 + 状态 */}
      <div className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="text-sm text-body whitespace-nowrap">
          {formatTime(itinerary.startTime)} · {itinerary.durationMin}分钟
        </span>
        <h3 className="flex-1 truncate font-display text-base font-medium text-ink">
          {itinerary.title}
        </h3>
        <Badge variant={statusStyle.variant} className="shrink-0">
          {statusStyle.label}
        </Badge>
      </div>
      {/* 第二行：锁定提示 + 时长说明 */}
      <div className="flex items-center gap-1 text-xs text-muted">
        <Clock className="size-3 shrink-0" />
        <span>行程已锁定 · {itinerary.durationMin} 分钟</span>
      </div>
    </div>
  );
}
