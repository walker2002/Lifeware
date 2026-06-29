"use client";

import { TimeboxCard } from "./timebox-card";
import type { TimeboxSummary } from "@/usom/types/summaries";

interface TimeboxListProps {
  timeboxes: TimeboxSummary[];
  /** 紧凑模式：单列列表，用于今日模式左列 */
  compact?: boolean;
  /** 状态转换操作回调 */
  onAction?: (timeboxId: string, action: string) => void;
  /** [023] A2 C1：卡片标题点击进入编辑 Drawer */
  onEdit?: (tb: TimeboxSummary) => void;
}

/**
 * TimeboxList — 时间盒列表组件
 *
 * compact=false: 响应式网格展示 TimeboxCard。
 * compact=true: 单列紧凑列表。
 * 列表为空时显示空状态提示。
 */
export function TimeboxList({ timeboxes, compact = false, onAction, onEdit }: TimeboxListProps) {
  if (timeboxes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-12">
        <p className="text-sm text-body">还没有时间盒</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {timeboxes.map((timebox) => (
          <TimeboxCard key={timebox.id} timebox={timebox} compact onAction={onAction} onEdit={onEdit} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {timeboxes.map((timebox) => (
        <TimeboxCard key={timebox.id} timebox={timebox} onAction={onAction} onEdit={onEdit} />
      ))}
    </div>
  );
}
