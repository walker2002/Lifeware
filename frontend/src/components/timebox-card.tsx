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

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

// ─── 组件 ───────────────────────────────────────────────────────

interface TimeboxCardProps {
  timebox: TimeboxSummary;
  /** 紧凑模式：单行显示，用于今日模式左列 */
  compact?: boolean;
}

export function TimeboxCard({ timebox, compact = false }: TimeboxCardProps) {
  const statusStyle = STATUS_STYLES[timebox.status] ?? STATUS_STYLES.planned;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2">
        <span className="text-xs text-body whitespace-nowrap">
          {formatTime(timebox.startTime)}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-ink">
          {timebox.title}
        </span>
        <span className="text-xs text-body whitespace-nowrap">
          {formatDuration(timebox.startTime, timebox.endTime)}
        </span>
        <Badge variant={statusStyle.variant} className="text-xs">
          {statusStyle.label}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-medium text-ink">
          {timebox.title}
        </h3>
        <Badge variant={statusStyle.variant}>{statusStyle.label}</Badge>
      </div>
      <p className="text-sm text-body">
        {formatTime(timebox.startTime)} - {formatTime(timebox.endTime)}
      </p>
    </div>
  );
}
