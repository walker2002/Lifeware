"use client";

import { useState, useCallback, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TilesBanner } from "@/components/layout/tiles-banner";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import type { TemplateFormFields } from "@/components/intent-form";
import { DateNav } from "@/components/timebox/date-nav";
import type { DateViewMode } from "@/components/timebox/types";
import { DayView } from "@/components/timebox/day-view";
import { WeekView } from "@/components/timebox/week-view";
import { MonthView } from "@/components/timebox/month-view";
import { TracePanel } from "@/components/trace-panel";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { ActionSurface } from "@/usom/types/process";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";
import { submitIntent, submitTemplateIntent, getTimeboxesByRange } from "./actions/intent";
import type { IntentSubmissionResult } from "./actions/intent";
import { setTraceConfig, getTraceConfig } from "@/lib/config/trace-config";
import { Button } from "@/components/ui/button";
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from "date-fns";

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];
type InputMode = "ai" | "form";

/** 根据视图模式计算日期范围 */
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

/** 翻页导航 */
function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1;
  switch (mode) {
    case 'day': return addDays(date, delta);
    case 'week': return addWeeks(date, delta);
    case 'month': return addMonths(date, delta);
  }
}

export default function Home() {
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mode, setMode] = useState<InputMode>("ai");
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>();
  const [dateMode, setDateMode] = useState<DateViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // 追踪日志状态
  const [traceVisible, setTraceVisible] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(getTraceConfig().enabled);
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([]);

  const [confirmation, setConfirmation] = useState<{
    message: string;
    rawInput?: string;
    formFields?: TemplateFormFields;
  } | null>(null);

  // 按日期范围加载时间盒
  const loadTimeboxes = useCallback(async (modeParam?: DateViewMode, dateParam?: Date) => {
    const m = modeParam ?? dateMode;
    const d = dateParam ?? currentDate;
    const { start, end } = getDateRange(m, d);
    try {
      const data = await getTimeboxesByRange(start, end);
      setTimeboxes(data);
    } catch {
      // 静默失败，保持当前数据
    }
  }, [dateMode, currentDate]);

  // 初始加载 + 日期/模式变化时重新加载
  useEffect(() => {
    loadTimeboxes();
  }, [dateMode, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleResult(result: IntentSubmissionResult) {
    setTimeboxes(result.timeboxes);
    setActionSurface(result.actionSurface);

    // 收集追踪会话
    if (result.traceSession) {
      setTraceSessions((prev) => [...prev, result.traceSession!]);
    }

    if (result.needsConfirmation && result.confirmationMessage) {
      setConfirmation({ message: result.confirmationMessage });
      return;
    }

    setConfirmation(null);

    if (!result.success) {
      const errorMsg = result.error ?? "提交失败，请重试";
      const isAiParseError = /解析|AI|无法理解|无法识别/.test(errorMsg) && mode === "ai";
      if (isAiParseError) {
        setError(`${errorMsg} — 解析失败，请尝试表单模式`);
      } else {
        setError(errorMsg);
      }
    } else {
      setError(undefined);
    }
  }

  const handleSubmit = useCallback(async (rawInput: string, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);
    try {
      const result = await submitIntent(rawInput, confirmed, traceEnabled);
      if (result.needsConfirmation) {
        setConfirmation({ message: result.confirmationMessage ?? "", rawInput });
      }
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [traceEnabled]);

  const handleFormSubmit = useCallback(async (fields: TemplateFormFields, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);
    try {
      const result = await submitTemplateIntent(fields, confirmed, traceEnabled);
      if (result.needsConfirmation) {
        setConfirmation({ message: result.confirmationMessage ?? "", formFields: fields });
      }
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return;
    setError(undefined);
    setIsLoading(true);
    try {
      if (confirmation.rawInput) {
        const result = await submitIntent(confirmation.rawInput, true, traceEnabled);
        handleResult(result);
      } else if (confirmation.formFields) {
        const result = await submitTemplateIntent(confirmation.formFields, true, traceEnabled);
        handleResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [confirmation, traceEnabled]);

  const handleCancelConfirmation = useCallback(() => {
    setConfirmation(null);
    setError(undefined);
  }, []);

  const handleModeToggle = useCallback((newMode: InputMode) => {
    setMode(newMode);
    setError(undefined);
    setConfirmation(null);
  }, []);

  const handleSettingsClick = useCallback(() => {
    const newEnabled = !traceEnabled;
    setTraceEnabled(newEnabled);
    setTraceConfig({ enabled: newEnabled });
    if (newEnabled) {
      setTraceVisible(true);
    }
  }, [traceEnabled]);

  const handleDateModeChange = useCallback((newMode: DateViewMode) => {
    setDateMode(newMode);
  }, []);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate((prev) => navigateDate(dateMode, prev, direction));
  }, [dateMode]);

  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date);
    setDateMode('day');
  }, []);

  return (
    <AppShell
      onSettingsClick={handleSettingsClick}
      tilesBanner={
        actionSurface && actionSurface.tiles.length > 0 ? (
          <TilesBanner candidates={actionSurface.tiles} />
        ) : undefined
      }
      aiPanel={
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-medium text-ink">
            AI 助手
          </h2>
          <p className="text-sm text-body">
            在这里与 AI 对话，管理你的时间安排。
          </p>

          {/* 追踪状态提示 */}
          {traceEnabled && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 px-2 py-1 text-xs text-success">
              <span className="size-1.5 rounded-full bg-success" />
              追踪日志已开启
            </div>
          )}

          <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => handleModeToggle("ai")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              AI 对话
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle("form")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "form"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              表单填写
            </button>
          </div>

          {confirmation && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
              <p className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                {confirmation.message}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={handleConfirm} disabled={isLoading}>
                  {isLoading ? "处理中..." : "确认继续"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelConfirmation} disabled={isLoading}>
                  取消
                </Button>
              </div>
            </div>
          )}

          {mode === "ai" ? (
            <IntentInput onSubmit={handleSubmit} isLoading={isLoading} error={error} />
          ) : (
            <IntentForm onSubmit={handleFormSubmit} isLoading={isLoading} error={error} />
          )}
        </div>
      }
      mainContent={
        <div className="flex flex-col gap-4">
          <DateNav
            mode={dateMode}
            currentDate={currentDate}
            onModeChange={handleDateModeChange}
            onNavigate={handleNavigate}
          />

          {dateMode === "day" && (
            <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={handleDateSelect} />
          )}
          {dateMode === "week" && (
            <WeekView timeboxes={timeboxes} currentDate={currentDate} />
          )}
          {dateMode === "month" && (
            <MonthView timeboxes={timeboxes} currentDate={currentDate} />
          )}
        </div>
      }
      tracePanel={
        <TracePanel
          sessions={traceSessions}
          visible={traceVisible}
          onToggle={() => setTraceVisible(false)}
        />
      }
    />
  );
}
