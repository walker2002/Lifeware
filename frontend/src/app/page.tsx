"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { IntentInput } from "@/components/intent-input";
import { TimeboxList } from "@/components/timebox-list";
import type { TimeboxSummary } from "@/usom/types/summaries";
import { submitIntent } from "./actions/intent";

// ─── 初始数据（服务端加载会在 hydration 后覆盖） ──────────────────

const INITIAL_TIMEBOXES: TimeboxSummary[] = [];

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

  const handleSubmit = useCallback(async (rawInput: string) => {
    // 清除上一次的错误
    setError(undefined);
    setIsLoading(true);

    try {
      const result = await submitIntent(rawInput);

      // 无论成功失败都刷新时间盒列表
      setTimeboxes(result.timeboxes);

      if (!result.success) {
        setError(result.error ?? "提交失败，请重试");
      } else if (result.warnings && result.warnings.length > 0) {
        // 有警告但不阻塞，可后续展示
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
          <IntentInput
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />
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
