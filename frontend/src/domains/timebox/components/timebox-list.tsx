/**
 * @file timebox-list
 * @brief 时间盒列表组件（[026] A3.2 适配 kind 分支）
 *
 * compact=false: 响应式网格展示。
 * compact=true: 单列紧凑列表。
 * 列表为空时显示空状态提示。
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → ScheduleEvent[]。
 * - kind='timebox' 走 TimeboxCard（**与改动前字节级一致**，IRON RULE 守护）
 * - kind='itinerary' 走新的 ItineraryLockedCard（锁定行程卡）
 *
 * 拆分规则：调用方传 ScheduleEvent[]，本组件按 e.kind 分支渲染。
 * 排序已在 mergeEvents()（schedule-event.ts）完成；本组件不再排序。
 */
"use client";

import { TimeboxCard } from "./timebox-card";
import { ItineraryLockedCard } from "./itinerary-locked-card";
import type { ScheduleEvent } from "./schedule-event";

interface TimeboxListProps {
  events: ScheduleEvent[];
  /** 紧凑模式：单列列表，用于今日模式左列 */
  compact?: boolean;
  /** 状态转换操作回调（仅对 timebox 生效，itinerary 走 CNUI） */
  onAction?: (timeboxId: string, action: string) => void;
  /** [023] A2 C1：卡片标题点击进入编辑 Drawer（仅 timebox） */
  onEdit?: (tb: import("@/usom/types/summaries").TimeboxSummary) => void;
}

/**
 * TimeboxList — 时间盒/行程联合列表组件
 *
 * [026] A3.2 IRON RULE：纯 timebox-only 输入（含空 itinerary）时，
 * 渲染输出与 T13 改动前字节级一致——T15 回归测试会守护。
 */
export function TimeboxList({ events, compact = false, onAction, onEdit }: TimeboxListProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-12">
        <p className="text-sm text-body">还没有时间盒</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {events.map((e) =>
          e.kind === "timebox" ? (
            <TimeboxCard key={e.id} timebox={e.source} compact onAction={onAction} onEdit={onEdit} />
          ) : (
            <ItineraryLockedCard key={e.id} itinerary={e.source} compact />
          ),
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((e) =>
        e.kind === "timebox" ? (
          <TimeboxCard key={e.id} timebox={e.source} onAction={onAction} onEdit={onEdit} />
        ) : (
          <ItineraryLockedCard key={e.id} itinerary={e.source} />
        ),
      )}
    </div>
  );
}
