/**
 * @file appointment-locked-card
 * @brief /timeboxes 上 appointment 锁定卡（[026] A3.2 / [023.03] T4 重命名 / [023.05] PR2 T9 itinerary→appointment / [023.12] T10 派生 badge）
 *
 * 与 TimeboxCard 同构（compact + 完整模式），但 appointment **只读**：
 * - 无 onAction / onEdit 回调
 * - 视觉用 border-l-primary（"锁定"语义）区分 timebox 的"可执行"卡
 * - 持久状态徽章来自 AppointmentStatus 3 态（scheduled / completed / cancelled），
 *   时间态（in_progress / expired）由 deriveAppointmentDisplayStatus 读时派生
 *   （同 T8 timebox-card 的 running/overtime 派生模式）。
 *
 * [023.12] T10：STATUS_STYLES 从 5 态收敛到 3 态（删除 in_progress / expired 键），
 * 新增派生 display badge（执行中/已过期/计划）—— 与持久 badge 并列显示。
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";
import type { AppointmentSummary } from "@/usom/types/summaries";
import type { AppointmentStatus } from "@/usom/types/primitives";
import { useEffect, useState } from "react";
import { deriveAppointmentDisplayStatus } from "@/domains/timebox/status/derive-display-status";
import { useUserTz } from "@/contexts/user-timezone-context";

/** AppointmentStatus 3 态 → Badge 变体 + 中文 label（[023.12] T10：收敛 5→3） */
const STATUS_STYLES: Record<
  AppointmentStatus,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  scheduled: { variant: "outline", label: "计划" },
  completed: { variant: "secondary", label: "已完成" },
  cancelled: { variant: "outline", label: "已取消" },
};

/** HH:MM 格式化（[TZ-2] tz 参数化，替代硬编码 'Asia/Shanghai'） */
function formatTime(timestamp: string, tz: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

interface AppointmentLockedCardProps {
  appointment: AppointmentSummary;
  /** 紧凑模式：与 TimeboxCard compact 保持同尺寸 */
  compact?: boolean;
}

/**
 * AppointmentLockedCard — 约定只读卡（timeboxes 视图）。
 *
 * [026] A3.2：不可执行（无 onAction / onEdit）。点击行为：
 * - T14 阶段接 GrowthMenu 触发 CNUI surface 'editAppointment'（与既有 timeboxes
 *   action 模式同模型）。当前 click 行为 = noop（占位 div 不可点）。
 *
 * [023.03] T4：route /schedule → /timeboxes 命名同步。
 *
 * [023.05] PR2 T9：ItineraryLockedCard → AppointmentLockedCard；
 * itinerary: ItinerarySummary → appointment: AppointmentSummary。
 *
 * [023.12] T10：派生 displayStatus 徽章（与持久 badge 并列）。
 *   - scheduled + today → 执行中（default）
 *   - scheduled + past calendar day → 已过期（destructive）
 *   - scheduled + future → null（不渲染，避免与「计划」持久 badge 重复）
 *   - cancelled/completed → null（终态不再派生）
 *
 * 视觉规范：border-l-4 border-primary（锁定）+ bg-canvas（与 timebox 的
 * surface-card 区分），用 token 颜色，禁 Tailwind 默认色。
 */
export function AppointmentLockedCard({ appointment, compact = false }: AppointmentLockedCardProps) {
  // [TZ-2] user_tz 注入（替代硬编码 'Asia/Shanghai'）
  const { tz } = useUserTz();
  // [023.12] T10：per-minute now state（与 appointment-workspace 同源约定）
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const statusStyle = STATUS_STYLES[appointment.status] ?? STATUS_STYLES.scheduled;
  // [TZ-2.2] 透传 useUserTz().tz 给派生函数（修 [TZ-2] 漏改的边角）
  const displayStatus = deriveAppointmentDisplayStatus(appointment.status, appointment.startTime, now, tz);

  if (compact) {
    return (
      <div className="flex flex-col rounded-md border border-hairline bg-canvas border-l-4 border-l-primary">
        {/* 第一行：时间 + 标题 + 时长 + 持久状态徽章 + 派生徽章 */}
        <div className="flex items-center gap-2 px-3 py-2">
          <MapPin className="size-3 shrink-0 text-primary" />
          <span className="text-xs text-body whitespace-nowrap">
            {formatTime(appointment.startTime, tz)} · {appointment.durationMin}分钟
          </span>
          <span className="flex-1 truncate text-sm font-medium text-ink">
            {appointment.title}
          </span>
          <Badge variant={statusStyle.variant} className="text-xs shrink-0">
            {statusStyle.label}
          </Badge>
          {displayStatus === "in_progress" && (
            <Badge variant="default" className="text-xs shrink-0">执行中</Badge>
          )}
          {displayStatus === "expired" && (
            <Badge variant="destructive" className="text-xs shrink-0">已过期</Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline border-l-4 border-l-primary bg-canvas p-4">
      {/* 第一行：图标 + 时间 + 标题 + 持久状态 + 派生徽章 */}
      <div className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="text-sm text-body whitespace-nowrap">
          {formatTime(appointment.startTime, tz)} · {appointment.durationMin}分钟
        </span>
        <h3 className="flex-1 truncate font-display text-base font-medium text-ink">
          {appointment.title}
        </h3>
        <Badge variant={statusStyle.variant} className="shrink-0">
          {statusStyle.label}
        </Badge>
        {displayStatus === "in_progress" && (
          <Badge variant="default" className="shrink-0">执行中</Badge>
        )}
        {displayStatus === "expired" && (
          <Badge variant="destructive" className="shrink-0">已过期</Badge>
        )}
      </div>
      {/* 第二行：锁定提示 + 时长说明 */}
      <div className="flex items-center gap-1 text-xs text-muted">
        <Clock className="size-3 shrink-0" />
        <span>约定已锁定 · {appointment.durationMin} 分钟</span>
      </div>
    </div>
  );
}
