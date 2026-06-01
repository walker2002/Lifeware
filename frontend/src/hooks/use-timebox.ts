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

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];

function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'day':
      return { start: startOfDay(date), end: endOfDay(date) };
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1;
  switch (mode) {
    case 'day': return addDays(date, delta);
    case 'week': return addWeeks(date, delta);
    case 'month': return addMonths(date, delta);
  }
}

export function useTimebox() {
  const { setIsLoading, setError } = useAppLoading();

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
    const { start, end } = getDateRange(m, d);
    try {
      const data = await getTimeboxesByRange(start, end);
      setTimeboxes(data);
    } catch {}
  }, [dateMode, currentDate]);

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
    setCurrentDate((prev) => navigateDate(dateMode, prev, direction));
  }, [dateMode]);

  const logTargetTimebox = logTarget ? timeboxes.find(t => t.id === logTarget) : null;

  return {
    timeboxes, setTimeboxes, dateMode, currentDate, actionSurface, setActionSurface,
    transitionConfirm, setTransitionConfirm, logTarget, setLogTarget, logTargetTimebox,
    loadTimeboxes, handleTimeboxAction, handleTransitionConfirm,
    handleLogSubmit, handleDateSelect, handleDateModeChange, handleNavigate,
  };
}
