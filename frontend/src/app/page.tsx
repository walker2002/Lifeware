"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { IntentInput } from "@/components/intent-input";
import { IntentForm } from "@/components/intent-form";
import type { TemplateFormFields } from "@/components/intent-form";
import { TimeboxList } from "@/components/timebox-list";
import type { TimeboxSummary } from "@/usom/types/summaries";
import { submitIntent, submitTemplateIntent } from "./actions/intent";

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
 * - 失败时显示错误信息
 */
export default function Home() {
  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [mode, setMode] = useState<InputMode>("ai");

  /** AI 模式提交处理 */
  const handleSubmit = useCallback(async (rawInput: string) => {
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await submitIntent(rawInput);
      setTimeboxes(result.timeboxes);

      if (!result.success) {
        setError(result.error ?? "提交失败，请重试");
      } else if (result.warnings && result.warnings.length > 0) {
        setError(undefined);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "网络错误，请重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 表单模式提交处理 */
  const handleFormSubmit = useCallback(async (fields: TemplateFormFields) => {
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await submitTemplateIntent(fields);
      setTimeboxes(result.timeboxes);

      if (!result.success) {
        setError(result.error ?? "提交失败，请重试");
      } else if (result.warnings && result.warnings.length > 0) {
        setError(undefined);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "网络错误，请重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 切换输入模式 */
  const handleModeToggle = useCallback((newMode: InputMode) => {
    setMode(newMode);
    setError(undefined);
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
