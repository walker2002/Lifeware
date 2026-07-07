/**
 * @file timebox-list
 * @brief 时间盒列表组件（[026] A3.2 适配 kind 分支 / [023.05] PR2 T9 kind='appointment' / [023.13] T7 批量多选）
 *
 * compact=false: 响应式网格展示。
 * compact=true: 单列紧凑列表。
 * 列表为空时显示空状态提示。
 *
 * [026] A3.2 适配：props 由 TimeboxSummary[] → TimeboxesEvent[]。
 * - kind='timebox' 走 TimeboxCard（**与改动前字节级一致**，IRON RULE 守护）
 * - kind='appointment' 走新的 AppointmentLockedCard（锁定约定卡）
 *
 * [023.03] T4：route /schedule → /timeboxes，类型 ScheduleEvent → TimeboxesEvent。
 *
 * [023.05] PR2 T9：kind='itinerary' → 'appointment'（运行时判别）+ ItineraryLockedCard
 * → AppointmentLockedCard。kind === 'timebox' 保留；注释「行程」→「约定」。
 *
 * [023.13] T7：批量多选模式（selectMode=true）——每张 timebox 卡左侧显示 checkbox，
 * 仅 planned 卡可选（cancelled/logged 走单独单卡操作）；appointment 走 CNUI 不参与多选。
 *
 * 拆分规则：调用方传 TimeboxesEvent[]，本组件按 e.kind 分支渲染。
 * 排序已在 mergeEvents()（timeboxes-event.ts）完成；本组件不再排序。
 */
"use client";

import { TimeboxCard } from "./timebox-card";
import { AppointmentLockedCard } from "./appointment-locked-card";
import type { TimeboxesEvent } from "./timeboxes-event";
import type { TimeboxSummary } from "@/usom/types/summaries";

interface TimeboxListProps {
  events: TimeboxesEvent[];
  /** 紧凑模式：单列列表，用于今日模式左列 */
  compact?: boolean;
  /** 状态转换操作回调（仅对 timebox 生效，appointment 走 CNUI） */
  onAction?: (timeboxId: string, action: string) => void;
  /** [023] A2 C1：卡片标题点击进入编辑 Drawer（仅 timebox） */
  onEdit?: (tb: TimeboxSummary) => void;
  /** [023.13] T7：批量多选模式开关 */
  selectMode?: boolean;
  /** [023.13] T7：当前选中的 timebox id 列表 */
  selectedIds?: string[];
  /** [023.13] T7：切换单个 timebox 选中状态回调 */
  onToggleSelect?: (id: string) => void;
}

/**
 * TimeboxList — 时间盒/约定联合列表组件
 *
 * [026] A3.2 IRON RULE：纯 timebox-only 输入（含空 appointment）时，
 * 渲染输出与 T13 改动前字节级一致——T15 回归测试会守护。
 */
export function TimeboxList({
  events,
  compact = false,
  onAction,
  onEdit,
  selectMode = false,
  selectedIds = [],
  onToggleSelect,
}: TimeboxListProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-12">
        <p className="text-sm text-body">还没有时间盒</p>
      </div>
    );
  }

  // [023.13] T7：批量多选 — selectMode 时 timebox 卡左侧加 checkbox（planned 才可选中）
  const renderTimeboxRow = (e: Extract<TimeboxesEvent, { kind: "timebox" }>) => {
    const tb = e.source
    const isPlanned = tb.status === "planned"
    const checked = selectedIds.includes(tb.id)
    if (!selectMode) {
      return (
        <TimeboxCard
          key={e.id}
          timebox={tb}
          compact={compact}
          onAction={onAction}
          onEdit={onEdit}
        />
      )
    }
    return (
      <div key={e.id} className="flex items-start gap-2">
        <label className="flex items-center pt-3 pl-1 shrink-0">
          <input
            type="checkbox"
            checked={checked}
            disabled={!isPlanned}
            onChange={() => onToggleSelect?.(tb.id)}
            aria-label={`选择 ${tb.title}`}
            data-testid={`select-checkbox-${tb.id}`}
            className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
        <div className="flex-1 min-w-0">
          <TimeboxCard timebox={tb} compact={compact} onAction={onAction} onEdit={onEdit} />
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {events.map((e) =>
          e.kind === "timebox" ? (
            renderTimeboxRow(e)
          ) : (
            <AppointmentLockedCard key={e.id} appointment={e.source} compact />
          ),
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((e) =>
        e.kind === "timebox" ? (
          renderTimeboxRow(e)
        ) : (
          <AppointmentLockedCard key={e.id} appointment={e.source} />
        ),
      )}
    </div>
  );
}
