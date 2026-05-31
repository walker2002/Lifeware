"use client";

import { Check, Clock, ListTodo, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomeBannerProps {
  /** 今日待办总数 */
  totalTodos?: number;
  /** 今日已完成数 */
  completedTodos?: number;
  /** 习惯打卡进度（如 "3/5"） */
  habitProgress?: string;
  /** 习惯连续天数 */
  habitStreak?: number;
  /** 完成百分比（0-100），用于进度条 */
  completionPercent?: number;
  /** 快捷操作回调 */
  onAction: (domainId: string, action: string) => void;
}

const QUICK_ACTIONS = [
  { label: "创建时间盒", icon: Clock, domainId: "timebox", action: "createTimebox" },
  { label: "打卡习惯", icon: Check, domainId: "habits", action: "checkinHabits" },
  { label: "新建任务", icon: ListTodo, domainId: "tasks", action: "createTask" },
  { label: "开始复盘", icon: RotateCcw, domainId: "timebox", action: "review" },
] as const;

export function HomeBanner({
  totalTodos = 0,
  completedTodos = 0,
  habitProgress = "--",
  habitStreak = 0,
  completionPercent = 0,
  onAction,
}: HomeBannerProps) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekDay = weekDays[today.getDay()];

  return (
    <div className="border-b border-hairline bg-surface-soft px-6 py-4 max-md:px-4 max-md:py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-3">
        {/* 左侧：今日概览 */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {dateStr} {weekDay}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-body">
            <span>
              今日待办 <strong className="font-medium text-ink">{totalTodos}</strong> · 已完成{" "}
              <strong className="font-medium text-ink">{completedTodos}</strong>
            </span>
            <span>
              习惯打卡 <strong className="font-medium text-ink">{habitProgress}</strong>
              {habitStreak > 0 && <> · 连续 <strong className="font-medium text-ink">{habitStreak}</strong> 天</>}
            </span>
          </div>
          {/* 进度条 */}
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-hairline">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, completionPercent))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{completionPercent}%</span>
          </div>
        </div>

        {/* 右侧：快捷操作 */}
        <div className="flex flex-wrap gap-2 max-md:hidden">
          {QUICK_ACTIONS.map((act) => (
            <Button
              key={act.action}
              variant="outline"
              size="sm"
              onClick={() => onAction(act.domainId, act.action)}
            >
              <act.icon className="size-3.5" />
              {act.label}
            </Button>
          ))}
        </div>
        {/* 移动端：2 个主操作 */}
        <div className="hidden gap-2 max-md:flex">
          {QUICK_ACTIONS.slice(0, 2).map((act) => (
            <Button
              key={act.action}
              variant="outline"
              size="default"
              onClick={() => onAction(act.domainId, act.action)}
            >
              <act.icon className="size-3.5" />
              {act.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
