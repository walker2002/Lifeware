/**
 * @file timebox-card
 * @brief 时间盒卡片组件
 * 
 * 展示单个时间盒的摘要信息和操作按钮
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { TimeboxStatus } from "@/usom/types/primitives";
import { getCardBorderColor, getCompletionIcon } from "@/lib/color-coding";
import { MessageSquare } from "lucide-react";

/** 时间盒状态样式映射 */
const STATUS_STYLES: Record<
  TimeboxStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  planned: { variant: "outline", label: "已规划" },
  running: { variant: "default", label: "进行中" },
  overtime: { variant: "destructive", label: "已超时" },
  ended: { variant: "outline", label: "已结束" },
  cancelled: { variant: "outline", label: "已取消" },
  logged: { variant: "secondary", label: "已记录" },
};

/**
 * 格式化时间戳为 HH:MM
 * 
 * @param timestamp - ISO 时间戳
 * @returns 格式化的时间字符串
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function formatDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** note 中换行替换为空格，超出宽度截断 */
function formatNotePreview(note?: string): string | null {
  if (!note || note.trim().length === 0) return null;
  return note.replace(/\n+/g, " ").trim();
}

interface TimeboxCardProps {
  timebox: TimeboxSummary;
  compact?: boolean;
  onAction?: (timeboxId: string, action: string) => void;
  /** [023] A2 C1：标题点击进入编辑 Drawer */
  onEdit?: (tb: TimeboxSummary) => void;
}

export function TimeboxCard({ timebox, compact = false, onAction, onEdit }: TimeboxCardProps) {
  const statusStyle = STATUS_STYLES[timebox.status] ?? STATUS_STYLES.planned;
  const borderColor = getCardBorderColor(timebox.executionRecord);
  const completionIcon = getCompletionIcon(timebox.executionRecord);
  const notePreview = formatNotePreview(
    timebox.executionRecord?.mode === "detailed" ? timebox.executionRecord.notes : undefined
  );

  // 计时器：running / overtime 状态下每秒更新
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (timebox.status !== "running" && timebox.status !== "overtime") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timebox.status]);

  const startedAt = timebox.startedAt ? new Date(timebox.startedAt).getTime() : null;
  const plannedEnd = new Date(timebox.endTime).getTime();
  const plannedDuration = plannedEnd - new Date(timebox.startTime).getTime();

  const elapsed = startedAt ? now - startedAt : 0;
  const progressPercent = startedAt ? Math.min((elapsed / plannedDuration) * 100, 100) : 0;
  const overtimeMs = timebox.status === "overtime" && startedAt ? now - plannedEnd : 0;

  const handleAction = useCallback((action: string) => {
    onAction?.(timebox.id, action);
  }, [onAction, timebox.id]);

  // ─── 紧凑模式 ─────────────────────────────────────────────
  if (compact) {
    return (
      <div className={`flex flex-col rounded-md border border-hairline bg-canvas border-l-4 ${borderColor} ${
        timebox.status === "cancelled" ? "opacity-50" : ""
      }`}>
        {/* 第一行：完成图标 + 时间 + 标题 + 计时器/时长 + 状态 + 按钮 */}
        <div className="flex items-center gap-2 px-3 py-2">
          {completionIcon && (
            <span className="text-xs shrink-0 w-4 text-center">{completionIcon}</span>
          )}
          <span className="text-xs text-body whitespace-nowrap">
            {formatTime(timebox.startTime)}-{formatTime(timebox.endTime)}
          </span>
          <button
            type="button"
            onClick={() => onEdit?.(timebox)}
            className={`flex-1 truncate text-left text-sm font-medium bg-transparent p-0 cursor-pointer hover:underline ${
              timebox.status === "cancelled" ? "text-body line-through" : "text-ink"
            }`}
          >
            {timebox.title}
          </button>
          {timebox.archetypeName && (
            <span className="text-xs text-muted whitespace-nowrap">· {timebox.archetypeName}</span>
          )}
          {timebox.status === "running" && (
            <span className="text-xs font-mono text-success whitespace-nowrap">
              {formatElapsed(elapsed)}
            </span>
          )}
          {timebox.status === "overtime" && (
            <span className="text-xs font-mono text-error whitespace-nowrap">
              +{formatElapsed(overtimeMs)}
            </span>
          )}
          {!["running", "overtime"].includes(timebox.status) && (
            <span className="text-xs text-body whitespace-nowrap">
              {formatDuration(timebox.startTime, timebox.endTime)}
            </span>
          )}
          <Badge variant={statusStyle.variant} className="text-xs shrink-0">
            {statusStyle.label}
          </Badge>
          {timebox.status === "planned" && (
            <Button size="sm" variant="default" className="h-6 px-2 text-xs shrink-0" onClick={() => handleAction("start")}>开始</Button>
          )}
          {timebox.status === "running" && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0" onClick={() => handleAction("end")}>结束</Button>
          )}
          {timebox.status === "overtime" && (
            <Button size="sm" variant="destructive" className="h-6 px-2 text-xs shrink-0" onClick={() => handleAction("end")}>确认结束</Button>
          )}
          {timebox.status === "ended" && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0" onClick={() => handleAction("log")}>记录</Button>
          )}
          {timebox.status === "logged" && timebox.executionRecord && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-body shrink-0" onClick={() => handleAction("viewLog")}>查看</Button>
          )}
        </div>

        {/* 第二行：note 预览（条件渲染） */}
        {notePreview && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-3 pb-2 text-xs text-body cursor-default">
                <MessageSquare className="size-3 shrink-0" />
                <span className="truncate">{notePreview}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs">
              <p className="whitespace-pre-wrap text-xs">{timebox.executionRecord?.mode === "detailed" ? timebox.executionRecord.notes : notePreview}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // ─── 完整模式 ─────────────────────────────────────────────
  return (
    <div className={`flex flex-col gap-2 rounded-lg p-4 border-l-4 ${borderColor} ${
      timebox.status === "cancelled"
        ? "bg-surface-card opacity-60"
        : timebox.status === "overtime"
          ? "bg-error-soft border border-error border-l-4"
          : "bg-surface-card"
    }`}>
      {/* 第一行：完成图标 + 时间 + 标题 + 状态 */}
      <div className="flex items-center gap-2">
        {completionIcon && (
          <span className="text-sm shrink-0 w-5 text-center font-medium">{completionIcon}</span>
        )}
        <span className="text-sm text-body whitespace-nowrap">
          {formatTime(timebox.startTime)}-{formatTime(timebox.endTime)}
        </span>
        <h3 className={`flex-1 truncate font-display text-base font-medium ${
          timebox.status === "cancelled" ? "text-body line-through" : "text-ink"
        }`}>
          <button
            type="button"
            onClick={() => onEdit?.(timebox)}
            className={`bg-transparent p-0 m-0 border-0 text-inherit font-inherit cursor-pointer hover:underline ${
              timebox.status === "cancelled" ? "text-body line-through" : "text-ink"
            }`}
          >
            {timebox.title}
          </button>
        </h3>
        {timebox.archetypeName && (
          <span className="text-xs text-muted whitespace-nowrap">· {timebox.archetypeName}</span>
        )}
        <Badge variant={statusStyle.variant} className="shrink-0">{statusStyle.label}</Badge>
        {/* 操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          {timebox.status === "planned" && (
            <>
              <Button size="sm" onClick={() => handleAction("start")}>开始</Button>
              <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction("cancel")}>取消</Button>
            </>
          )}
          {timebox.status === "running" && (
            <Button size="sm" variant="outline" onClick={() => handleAction("end")}>结束</Button>
          )}
          {timebox.status === "overtime" && (
            <Button size="sm" variant="destructive" onClick={() => handleAction("end")}>确认结束</Button>
          )}
          {timebox.status === "ended" && (
            <Button size="sm" variant="outline" onClick={() => handleAction("log")}>记录</Button>
          )}
          {timebox.status === "logged" && timebox.executionRecord && (
            <Button size="sm" variant="ghost" className="text-body" onClick={() => handleAction("viewLog")}>查看记录</Button>
          )}
        </div>
      </div>

      {/* 进度条 + 计时器 */}
      {(timebox.status === "running" || timebox.status === "overtime") && startedAt && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className={timebox.status === "overtime" ? "font-mono text-error" : "font-mono text-success"}>
              {timebox.status === "overtime" ? `超时 +${formatElapsed(overtimeMs)}` : formatElapsed(elapsed)}
            </span>
            <span className="text-body">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                timebox.status === "overtime" ? "bg-error" : "bg-success"
              }`}
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 第二行：note 预览（条件渲染） */}
      {notePreview && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-body cursor-default">
              <MessageSquare className="size-3 shrink-0" />
              <span className="truncate">{notePreview}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs">
            <p className="whitespace-pre-wrap text-xs">{timebox.executionRecord?.mode === "detailed" ? timebox.executionRecord.notes : notePreview}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
