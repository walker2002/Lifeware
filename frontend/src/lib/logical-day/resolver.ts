/**
 * @file logical-day/resolver
 * @brief [029] 逻辑日归属规则 —— 把事件日期映射到 logical_day 标签。
 *
 * 核心规则（来自 [029] design spec）：
 * - 显式 logicalDayId > 派生 date(startTime, tz)
 * - 派生 = 用 user_tz 把 startTime 折算到日历日 YYYY-MM-DD
 *
 * PR1（本次 T4 实现）只需 formatDateLabel(Date, tz) → 'YYYY-MM-DD'：
 * LogicalDayRepository.findCurrentByDate（AC-5）按 user_tz 派生 today label。
 * 完整 resolveLogicalDayId() 与 explicit > derived 优先级判定留待 T7 (PR2)。
 */

import type { DateOnly } from '@/usom/types/primitives'
import { getUserTzYear, getUserTzMonth, getUserTzDate } from '@/lib/tz'

/**
 * 把 Date 按 user_tz 折算到日历日标签 YYYY-MM-DD（[029] 派生通道）。
 *
 * 与 localDayKey 同算法：getUserTz{Year,Month,Date} 而非 Date#getXxx
 * （后者用浏览器本地时区，与 user_tz 不一致；这是 [TZ-2.2] 治本点）。
 *
 * @param date - 任意时刻（UTC ms）
 * @param tz - IANA 时区名（如 'Asia/Shanghai'）
 * @returns YYYY-MM-DD（如 '2026-07-15'）
 */
export function formatDateLabel(date: Date, tz: string): DateOnly {
  const y = getUserTzYear(date, tz)
  const mo = getUserTzMonth(date, tz)
  const d = getUserTzDate(date, tz)
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` as DateOnly
}