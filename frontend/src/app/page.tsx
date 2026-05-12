"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { submitIntent, submitTemplateIntent, getTimeboxesByRange, transitionTimebox, submitExecutionIntent, submitBatchIntent } from "./actions/intent";
import type { IntentSubmissionResult, ExecutionIntentResult, BatchIntentResult } from "./actions/intent";
import { setTraceConfig, getTraceConfig } from "@/lib/config/trace-config";
import { Button } from "@/components/ui/button";
import { ExecutionLogDialog } from "@/components/execution-log-dialog";
import type { ExecutionRecord } from "@/usom/types/objects";
import { useAutoTrigger } from "@/hooks/use-auto-trigger";
import { HabitLibraryView } from "@/components/habit-library-view";
import { HabitTemplateManager } from "@/components/habit-template-manager";
import { OKRWorkspace } from "@/components/okr/okr-workspace";
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from "date-fns";

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];
type InputMode = "ai" | "form";
type MainView = "schedule" | "habits" | "templates" | "okrs";

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
  const router = useRouter();
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mode, setMode] = useState<InputMode>("ai");
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>();
  const [dateMode, setDateMode] = useState<DateViewMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [mainView, setMainView] = useState<MainView>("schedule");

  // 追踪日志状态
  const [traceVisible, setTraceVisible] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(getTraceConfig().enabled);
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([]);

  const [logTarget, setLogTarget] = useState<string | null>(null);

  const [transitionConfirm, setTransitionConfirm] = useState<{
    timeboxId: string;
    action: string;
    message: string;
  } | null>(null);

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

  // 自动触发：planned→running / running→overtime
  useAutoTrigger({
    timeboxes,
    onTransition: async (id, action) => {
      const result = await transitionTimebox(id, action as any);
      if (result.success) await loadTimeboxes();
    },
  });

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

  // 检测执行意图关键词
  const isExecutionIntent = (input: string): boolean => {
    return /^(开始|结束|取消|记录|复盘|启动|完成|停止)/.test(input.trim());
  };

  // 检测批量创建意图：多个时间模式或显式分隔符
  const isBatchIntent = (input: string): boolean => {
    const timePattern = /\d{1,2}[:：]\d{2}/g;
    const timeMatches = input.match(timePattern);
    if (timeMatches && timeMatches.length >= 2) return true;
    if (/[;；\n]/.test(input) && input.length > 20) return true;
    return false;
  };

  const handleSubmit = useCallback(async (rawInput: string, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);
    try {
      // 执行意图走专用路径
      if (isExecutionIntent(rawInput)) {
        const result = await submitExecutionIntent(rawInput);
        setTimeboxes(result.timeboxes);
        if (!result.success) {
          setError(result.error ?? "执行失败");
        }
        return;
      }

      // 批量意图：多任务拆分创建
      if (isBatchIntent(rawInput)) {
        const batchResult = await submitBatchIntent(rawInput);
        await loadTimeboxes();
        const batchErrors = batchResult.results
          .filter(r => r.error)
          .map(r => `第${r.index + 1}个任务"${r.title}"：${r.error}`);
        if (batchErrors.length > 0) {
          setError(batchErrors.join("；"));
        } else {
          setError(undefined);
        }
        return;
      }

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
  }, [traceEnabled, loadTimeboxes]);

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

  const handleTimeboxAction = useCallback(async (timeboxId: string, action: string) => {
    if (action === "log" || action === "viewLog") {
      // log 和 viewLog 由 ExecutionLogDialog 处理，此处仅触发打开
      setLogTarget(timeboxId);
      return;
    }

    // cancel 和 end 需要确认
    if (action === "cancel") {
      setTransitionConfirm({ timeboxId, action, message: "确认取消这个时间盒？" });
      return;
    }

    // start / end / overtime 直接执行
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, action as any);
      if (result.success) {
        await loadTimeboxes();
      } else if (result.needsConfirmation) {
        setTransitionConfirm({ timeboxId, action, message: result.confirmationMessage ?? "确认继续？" });
      } else {
        setError(result.error ?? "操作失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setIsLoading(false);
    }
  }, [loadTimeboxes]);

  const handleTransitionConfirm = useCallback(async () => {
    if (!transitionConfirm) return;
    setIsLoading(true);
    try {
      const result = await transitionTimebox(
        transitionConfirm.timeboxId,
        transitionConfirm.action as any,
      );
      if (result.success) {
        await loadTimeboxes();
      } else {
        setError(result.error ?? "操作失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setIsLoading(false);
      setTransitionConfirm(null);
    }
  }, [transitionConfirm, loadTimeboxes]);

  const handleLogSubmit = useCallback(async (timeboxId: string, executionRecord: ExecutionRecord) => {
    setIsLoading(true);
    try {
      const result = await transitionTimebox(timeboxId, 'log', executionRecord);
      if (result.success) {
        await loadTimeboxes();
      } else {
        setError(result.error ?? "记录失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "记录失败");
    } finally {
      setIsLoading(false);
      setLogTarget(null);
    }
  }, [loadTimeboxes]);

  const logTargetTimebox = logTarget ? timeboxes.find(t => t.id === logTarget) : null;

  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date);
    setDateMode('day');
  }, []);

  return (
    <>
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
        <div className="flex w-full flex-col gap-4">
          {/* 视图切换标签 */}
          <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => setMainView("schedule")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mainView === "schedule"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              时间安排
            </button>
            <button
              type="button"
              onClick={() => setMainView("habits")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mainView === "habits"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              习惯库
            </button>
            <button
              type="button"
              onClick={() => setMainView("templates")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mainView === "templates"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              模板
            </button>
            <button
              type="button"
              onClick={() => setMainView("okrs")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mainView === "okrs"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-body hover:text-foreground"
              }`}
            >
              OKR
            </button>
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors text-body hover:text-foreground"
            >
              项目/任务
            </button>
          </div>

          {mainView === "schedule" ? (
            <>
              <DateNav
                mode={dateMode}
                currentDate={currentDate}
                onModeChange={handleDateModeChange}
                onNavigate={handleNavigate}
              />

              {dateMode === "day" && (
                <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={handleDateSelect} onAction={handleTimeboxAction} />
              )}
              {dateMode === "week" && (
                <WeekView timeboxes={timeboxes} currentDate={currentDate} />
              )}
              {dateMode === "month" && (
                <MonthView timeboxes={timeboxes} currentDate={currentDate} />
              )}
            </>
          ) : mainView === "habits" ? (
            <HabitLibraryView />
          ) : mainView === "okrs" ? (
            <OKRWorkspace />
          ) : (
            <HabitTemplateManager />
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
        {/* 状态转换确认对话框 */}
        {transitionConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg">
              <p className="mb-4 text-sm font-medium text-ink">{transitionConfirm.message}</p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setTransitionConfirm(null)} disabled={isLoading}>
                  取消
                </Button>
                <Button size="sm" onClick={handleTransitionConfirm} disabled={isLoading}>
                  {isLoading ? "处理中..." : "确认"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* 执行记录对话框 */}
        {logTargetTimebox && (
          <ExecutionLogDialog
            timebox={logTargetTimebox}
            open={!!logTarget}
            onClose={() => setLogTarget(null)}
            onSubmit={handleLogSubmit}
          />
        )}
    </>
  );
}
