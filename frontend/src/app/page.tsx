"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import type { TemplateFormFields } from "@/components/intent-form";
import { TimeboxList } from "@/components/timebox-list";
import { DynamicTile } from "@/components/dynamic-tile";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { ActionSurface } from "@/usom/types/process";
import { submitIntent, submitTemplateIntent } from "./actions/intent";
import type { IntentSubmissionResult } from "./actions/intent";
import { Button } from "@/components/ui/button";

// ─── 初始数据（服务端加载会在 hydration 后覆盖） ──────────────────

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];

/** 输入模式：AI 自然语言 或 表单 */
type InputMode = "ai" | "form";

/**
 * Home — 主页面（客户端组件）
 *
 * 管理时间盒列表状态和意图提交交互。
 * - 用户输入意图 → 调用 submitIntent Server Action
 * - 成功后更新时间盒列表
 * - 需要确认时显示确认提示
 * - 失败时显示错误信息
 */
export default function Home() {
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mode, setMode] = useState<InputMode>("ai");
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>();

  // 确认对话框状态
  const [confirmation, setConfirmation] = useState<{
    message: string;
    /** 待重新提交的 AI 输入文本 */
    rawInput?: string;
    /** 待重新提交的表单字段 */
    formFields?: TemplateFormFields;
  } | null>(null);

  /** 处理提交结果（通用） */
  function handleResult(result: IntentSubmissionResult) {
    setTimeboxes(result.timeboxes);
    setActionSurface(result.actionSurface);

    if (result.needsConfirmation && result.confirmationMessage) {
      // 显示确认对话框
      setConfirmation({ message: result.confirmationMessage });
      return;
    }

    // 清除确认状态
    setConfirmation(null);

    if (!result.success) {
      // 检测 AI 解析失败，建议切换到表单模式
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

  /** AI 模式提交处理 */
  const handleSubmit = useCallback(async (rawInput: string, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await submitIntent(rawInput, confirmed);
      // 保存 rawInput 以便确认时重新提交
      if (result.needsConfirmation) {
        setConfirmation({ message: result.confirmationMessage ?? "", rawInput });
      }
      handleResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "网络错误，请重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 表单模式提交处理 */
  const handleFormSubmit = useCallback(async (fields: TemplateFormFields, confirmed?: boolean) => {
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await submitTemplateIntent(fields, confirmed);
      // 保存 formFields 以便确认时重新提交
      if (result.needsConfirmation) {
        setConfirmation({ message: result.confirmationMessage ?? "", formFields: fields });
      }
      handleResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "网络错误，请重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 确认冲突并重新提交 */
  const handleConfirm = useCallback(async () => {
    if (!confirmation) return;

    setError(undefined);
    setIsLoading(true);

    try {
      if (confirmation.rawInput) {
        const result = await submitIntent(confirmation.rawInput, true);
        handleResult(result);
      } else if (confirmation.formFields) {
        const result = await submitTemplateIntent(confirmation.formFields, true);
        handleResult(result);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "网络错误，请重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, [confirmation]);

  /** 取消确认 */
  const handleCancelConfirmation = useCallback(() => {
    setConfirmation(null);
    setError(undefined);
  }, []);

  /** 切换输入模式 */
  const handleModeToggle = useCallback((newMode: InputMode) => {
    setMode(newMode);
    setError(undefined);
    setConfirmation(null);
  }, []);

  return (
    <AppShell
      aiPanel={
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-medium text-ink">
            AI 助手
          </h2>
          <p className="text-sm text-muted">
            在这里与 AI 对话，管理你的时间安排。
          </p>

          {/* 模式切换按钮 */}
          <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => handleModeToggle("ai")}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              表单填写
            </button>
          </div>

          {/* 确认对话框 */}
          {confirmation && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
              <p className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                {confirmation.message}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConfirm}
                  disabled={isLoading}
                >
                  {isLoading ? "处理中..." : "确认继续"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelConfirmation}
                  disabled={isLoading}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* 根据模式渲染不同输入组件 */}
          {mode === "ai" ? (
            <IntentInput
              onSubmit={handleSubmit}
              isLoading={isLoading}
              error={error}
            />
          ) : (
            <IntentForm
              onSubmit={handleFormSubmit}
              isLoading={isLoading}
              error={error}
            />
          )}

          {/* Dynamic Tiles — 动作面建议 */}
          {actionSurface && actionSurface.tiles.length > 0 && (
            <div className="mt-2">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                建议动作
              </h3>
              <DynamicTile candidates={actionSurface.tiles} />
            </div>
          )}
        </div>
      }
      mainContent={
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-2xl font-medium text-ink">
            时间盒
          </h1>
          <TimeboxList timeboxes={timeboxes} />
        </div>
      }
    />
  );
}
