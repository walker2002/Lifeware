/**
 * @file use-timebox
 * @brief 时间盒管理 Hook
 *
 * 提供时间盒的加载、导航、状态转换等功能
 *
 * [TZ-2.3] getDateRange / navigateDate 加 `tz` 参数，所有 date-fns 调用
 *   通过 `{ in: tz(tzName) }` 按 user_tz 算 startOfDay / endOfDay /
 *   startOfWeek / endOfWeek / startOfMonth / endOfMonth / addDays /
 *   addWeeks / addMonths。`@date-fns/tz` v1.4.1 提供 `tz()` factory。
 *
 * 之前 date-fns 默认按浏览器本地时区算，Tokyo user 在 Shanghai 浏览器
 * 下用 `startOfWeek(currentDate)` 拿的是 Shanghai 周一（UTC 时间偏移），
 * 而 rbc 渲染 user_tz（Tokyo）周界 — 范围查询与渲染不一致 → 跨日 /
 * 跨月边界事件可能漏报。本步统一为 user_tz。
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { useAppLoading } from "@/contexts/app-context";
import { useAutoTrigger } from "@/hooks/use-auto-trigger";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { ActionSurface } from "@/usom/types/process";
import type { ExecutionRecord } from "@/usom/types/objects";
import type { DateViewMode } from "@/domains/timebox/components/types";
import { getTimeboxesByRange, transitionTimebox } from "@/app/actions/intent";
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from "date-fns";
import { tz } from "@date-fns/tz";
import { useUserTz } from "@/contexts/user-timezone-context";

/** 初始时间盒列表 */
const INITIAL_TIMEBOXES: TimeboxSummary[] = [];

/**
 * 获取日期范围
 *
 * [TZ-2.3] `tz` 参数：用 date-fns `in: tz(tzName)` option 让 start/end
 *   按 user_tz 算（Tokyo user 在 Shanghai 浏览器下拿 Tokyo 日界，与 rbc
 *   渲染一致）。默认 'Asia/Shanghai'（与 schema default + 系统 TZ 兜底对齐）。
 *
 * @param mode - 日期视图模式
 * @param date - 基准日期（absolute moment；时区解读由 tz 决定）
 * @param tz - IANA 时区（[TZ-1] lib/timezone-config: getEffectiveTimezone）
 * @returns 日期范围
 */
// [023.06] C1 fix: 升格为 export，供 timeboxes-workspace 等其他消费者复用，避免行为漂移
export function getDateRange(
  mode: DateViewMode,
  date: Date,
  tzName: string = "Asia/Shanghai",
): { start: Date; end: Date } {
  switch (mode) {
    case 'day':
      return {
        start: startOfDay(date, { in: tz(tzName) }),
        end: endOfDay(date, { in: tz(tzName) }),
      };
    case 'week':
      return {
        start: startOfWeek(date, { weekStartsOn: 1, in: tz(tzName) }),
        end: endOfWeek(date, { weekStartsOn: 1, in: tz(tzName) }),
      };
    case 'month':
      return {
        start: startOfMonth(date, { in: tz(tzName) }),
        end: endOfMonth(date, { in: tz(tzName) }),
      };
  }
}

/**
 * [TZ-2.3] `tz` 参数：addDays/addWeeks/addMonths 都接受 `in` option，
 *   按 user_tz "自然日"加减（跨 DST 边界正确处理）。
 */
export function navigateDate(
  mode: DateViewMode,
  date: Date,
  direction: 'prev' | 'next',
  tzName: string = "Asia/Shanghai",
): Date {
  const delta = direction === 'next' ? 1 : -1;
  switch (mode) {
    case 'day': return addDays(date, delta, { in: tz(tzName) });
    case 'week': return addWeeks(date, delta, { in: tz(tzName) });
    case 'month': return addMonths(date, delta, { in: tz(tzName) });
  }
}

export function useTimebox() {
  const { setIsLoading, setError } = useAppLoading();
  // [TZ-2.3] user_tz：所有 date-fns 调用通过 tz(tz) 包装
  const { tz: userTz } = useUserTz();

  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [dateMode, setDateMode] = useState<DateViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>();
  const [transitionConfirm, setTransitionConfirm] = useState<{
    timeboxId: string; action: string; message: string;
  } | null>(null);
  const [logTarget, setLogTarget] = useState<string | null>(null);

  const loadTimeboxes = useCallback(async (modeParam?: DateViewMode, dateParam?: Date) => {
    const m = modeParam ?? dateMode;
    const d = dateParam ?? currentDate;
    // [TZ-2.3] 传 user_tz 给 getDateRange
    const { start, end } = getDateRange(m, d, userTz);
    try {
      const data = await getTimeboxesByRange(start, end);
      setTimeboxes(data);
    } catch {}
  }, [dateMode, currentDate, userTz]);

  useEffect(() => { loadTimeboxes(); }, [dateMode, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutoTrigger({
    timeboxes,
    onTransition: async (id, action) => {
      const result = await transitionTimebox(id, action as any);
      if (result.success) await loadTimeboxes();
    },
  });

  const handleTimeboxAction = useCallback(async (timeboxId: string, action: string) => {
    if (action === "log" || action === "viewLog") { setLogTarget(timeboxId); return; }
    if (action === "cancel") { setTransitionConfirm({ timeboxId, action, message: "确认取消这个时间盒？" }); return; }
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, action as any);
      if (result.success) await loadTimeboxes();
      else if (result.needsConfirmation) setTransitionConfirm({ timeboxId, action, message: result.confirmationMessage ?? "确认继续？" });
      else setError(result.error ?? "操作失败");
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setIsLoading(false); }
  }, [loadTimeboxes]);

  const handleTransitionConfirm = useCallback(async () => {
    if (!transitionConfirm) return;
    setIsLoading(true);
    try {
      const result = await transitionTimebox(transitionConfirm.timeboxId, transitionConfirm.action as any);
      if (result.success) await loadTimeboxes();
      else setError(result.error ?? "操作失败");
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setIsLoading(false); setTransitionConfirm(null); }
  }, [transitionConfirm, loadTimeboxes]);

  const handleLogSubmit = useCallback(async (timeboxId: string, executionRecord: ExecutionRecord) => {
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, 'log', executionRecord);
      if (result.success) await loadTimeboxes();
      else setError(result.error ?? "记录失败");
    } catch (err) { setError(err instanceof Error ? err.message : "记录失败"); }
    finally { setIsLoading(false); setLogTarget(null); }
  }, [loadTimeboxes]);

  const handleDateSelect = useCallback((date: Date) => { setCurrentDate(date); setDateMode('day'); }, []);

  const handleDateModeChange = useCallback((newMode: DateViewMode) => { setDateMode(newMode); }, []);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    // [TZ-2.3] 传 user_tz 给 navigateDate（避免 setState 函数 deps 缺漏，改用 prev 回调）
    setCurrentDate((prev) => navigateDate(dateMode, prev, direction, userTz));
  }, [dateMode, userTz]);

  const logTargetTimebox = logTarget ? timeboxes.find(t => t.id === logTarget) : null;

  return {
    timeboxes, setTimeboxes, dateMode, currentDate, actionSurface, setActionSurface,
    transitionConfirm, setTransitionConfirm, logTarget, setLogTarget, logTargetTimebox,
    loadTimeboxes, handleTimeboxAction, handleTransitionConfirm,
    handleLogSubmit, handleDateSelect, handleDateModeChange, handleNavigate,
  };
}