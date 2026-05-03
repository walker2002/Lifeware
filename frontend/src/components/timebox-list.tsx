"use client";

import { TimeboxCard } from "@/components/timebox-card";
import type { TimeboxSummary } from "@/usom/types/summaries";

interface TimeboxListProps {
  /** 时间盒列表 */
  timeboxes: TimeboxSummary[];
}

/**
 * TimeboxList — 时间盒列表组件
 *
 * 以响应式网格展示 TimeboxCard。
 * 列表为空时显示"还没有时间盒"空状态提示。
 */
export function TimeboxList({ timeboxes }: TimeboxListProps) {
  if (timeboxes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-12">
        <p className="text-sm text-muted">还没有时间盒</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {timeboxes.map((timebox) => (
        <TimeboxCard key={timebox.id} timebox={timebox} />
      ))}
    </div>
  );
}
