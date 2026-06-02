/**
 * @file color-coding
 * @brief 颜色编码工具函数
 * 
 * 提供执行记录相关的颜色和图标映射
 */

import type { ExecutionRecord } from "@/usom/types/objects";

/**
 * 根据执行记录中的评分/能量等级返回卡片左侧边框颜色类名
 * 
 * 优先级：rating > energyLevel。均为默认值或无记录时返回透明
 * @param record - 执行记录
 * @returns 边框颜色类名
 */
export function getCardBorderColor(record?: ExecutionRecord): string {
  if (!record) return "border-l-transparent";

  const completionRating = record.mode === "detailed" ? record.completionRating : undefined;
  const energyLevel = record.mode === "detailed" ? record.energyLevel : undefined;

  // 评分颜色（优先）
  if (completionRating !== undefined && completionRating > 3) return "border-l-coral-400";
  if (completionRating !== undefined && completionRating < 3) return "border-l-slate-400";

  // 能量颜色
  if (energyLevel !== undefined && energyLevel > 3) return "border-l-amber-400";
  if (energyLevel !== undefined && energyLevel < 3) return "border-l-gray-400";

  return "border-l-transparent";
}

/**
 * 根据执行记录返回完成状态图标。
 */
export function getCompletionIcon(record?: ExecutionRecord): string | null {
  if (!record || !record.completionStatus) return null;
  switch (record.completionStatus) {
    case "completed":
      return "✓";
    case "partially_completed":
      return "◐";
    case "not_completed":
      return "○";
    default:
      return null;
  }
}
