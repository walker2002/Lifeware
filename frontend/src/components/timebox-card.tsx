"use client";

import { Badge } from "@/components/ui/badge";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { TimeboxStatus } from "@/usom/types/primitives";

// ─── 状态徽章样式映射 ───────────────────────────────────────────

const STATUS_STYLES: Record<
  TimeboxStatus,
  { variant: "default" | "secondary" | "outline"; label: string }
> = {
  planned: { variant: "outline", label: "已规划" },
  running: { variant: "default", label: "进行中" },
  paused: { variant: "secondary", label: "已暂停" },
  ended: { variant: "outline", label: "已结束" },
  logged: { variant: "secondary", label: "已记录" },
};

// ─── 辅助函数 ───────────────────────────────────────────────────

/**
 * 将 ISO 时间戳格式化为 HH:MM 显示
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── 组件 ───────────────────────────────────────────────────────

interface TimeboxCardProps {
  timebox: TimeboxSummary;
}

/**
 * TimeboxCard — 时间盒卡片组件
 *
 * 显示时间盒的标题、时间范围和状态徽章。
 * 使用 bg-surface-card 背景，圆角卡片样式。
 */
export function TimeboxCard({ timebox }: TimeboxCardProps) {
  const statusStyle = STATUS_STYLES[timebox.status] ?? STATUS_STYLES.planned;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">
          {timebox.title}
        </h3>
        <Badge variant={statusStyle.variant}>{statusStyle.label}</Badge>
      </div>
      <p className="text-sm text-muted">
        {formatTime(timebox.startTime)} - {formatTime(timebox.endTime)}
      </p>
    </div>
  );
}
