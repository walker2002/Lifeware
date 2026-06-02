/**
 * @file use-auto-trigger
 * @brief 自动触发 Hook
 * 
 * 自动检查时间盒状态，满足条件时自动触发状态转换
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { TimeboxSummary } from "@/usom/types/summaries";

/**
 * 自动触发选项
 */
interface UseAutoTriggerOptions {
  /** 时间盒列表 */
  timeboxes: TimeboxSummary[]
  /** 状态转换回调 */
  onTransition: (timeboxId: string, action: string) => Promise<void>
  /** 检查间隔（毫秒），默认 60000 */
  intervalMs?: number
}

/**
 * 自动触发 Hook：检查 planned/running 时间盒是否满足自动触发条件。
 * - planned + startTime <= now → 自动 start
 * - running + endTime <= now → 自动 overtime
 */
export function useAutoTrigger({ timeboxes, onTransition, intervalMs = 60000 }: UseAutoTriggerOptions) {
  const onTransitionRef = useRef(onTransition);
  useEffect(() => {
    onTransitionRef.current = onTransition;
  });

  const check = useCallback(async () => {
    const now = Date.now();

    for (const tb of timeboxes) {
      const startTime = new Date(tb.startTime).getTime();
      const endTime = new Date(tb.endTime).getTime();

      // planned + 已到开始时间 → 自动 start
      if (tb.status === "planned" && startTime <= now) {
        try {
          await onTransitionRef.current(tb.id, "start");
        } catch {
          // 静默失败，下次间隔重试
        }
      }

      // running + 已到结束时间 → 自动 overtime
      if (tb.status === "running" && endTime <= now) {
        try {
          await onTransitionRef.current(tb.id, "overtime");
        } catch {
          // 静默失败
        }
      }
    }
  }, [timeboxes]);

  // 页面加载时立即检查一次
  useEffect(() => {
    check();
  }, [check]); // eslint-disable-line react-hooks/exhaustive-deps

  // 定时检查
  useEffect(() => {
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [check, intervalMs]);
}
