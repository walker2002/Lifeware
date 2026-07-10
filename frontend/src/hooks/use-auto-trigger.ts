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
 *
 * 分支互斥（[026.02.4-r3-preland] TD-031 实际修复）：
 * - planned + startTime <= now → 自动 start
 * - planned + endTime  <= now → 自动 overtime（else if，**单 cycle 内 start 与 overtime 不会同发**）
 *
 * 原写两个独立 `if` 时，对于已 overdue 的 planned timebox
 * （startTime <= now && endTime <= now 同时成立）会在同一次 check 周期内
 * 连续触发 `start` 和 `overtime` 两次 onTransition，触发 server-action storm
 * 并留下状态机时序隐患。改为 `else if` 保证同一周期只发一次。
 *
 * overtime 仍可在下次周期再触发：start 后 status 从 'planned' 翻成 running（读时派生），
 * 下一周期 status 不再 === 'planned'，overtime 分支不再命中；如 start 实际未达 DB（罕见），
 * 下次周期 endTime <= now 仍为真 → 走 overtime（用户语义：超时未启动也按 overtime 兜底）。
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
      // [026.02.4] TD-028: 'running' 不持久化（[023.12] 读时派生）。
      // 自动 overtime 条件：status='planned'（即未显式 start，且已结束）。
      // planned + 已到结束时间 → 自动 overtime（与原「running+endTime<=now」语义对齐：
      // 实际持久化层面只要没 start 就还是 planned，所以这条件命中即视为超时未启动）
      //
      // [026.02.4-r3-preland] TD-031: else if 互斥 — 避免同周期 start+overtime 双 fire
      else if (tb.status === "planned" && endTime <= now) {
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
