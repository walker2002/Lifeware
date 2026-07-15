/** @file lib/logical-day/resolver.ts
 *  @brief [029] 逻辑日归属规则：显式指定日期优先，否则默认 date(startTime, user_tz)。 */

import { getUserTzYear, getUserTzMonth, getUserTzDate } from '@/lib/tz'
import type { DateOnly, Timestamp } from '@/usom/types/primitives'

/** Date（任意时刻）→ user_tz 日历日标签 YYYY-MM-DD */
export function formatDateLabel(date: Date, tz: string): DateOnly {
  const y = getUserTzYear(date, tz)
  const mo = getUserTzMonth(date, tz)
  const d = getUserTzDate(date, tz)
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` as DateOnly
}

/** 归属规则：explicitLabel 非空则用之，否则 date(startTime, tz)。 */
export function resolveLogicalDayLabel(args: {
  startTime: Timestamp
  explicitLabel?: DateOnly | string | null
  tz: string
}): DateOnly {
  const { startTime, explicitLabel, tz } = args
  if (explicitLabel && typeof explicitLabel === 'string' && explicitLabel.length > 0) {
    return explicitLabel as DateOnly
  }
  return formatDateLabel(new Date(startTime), tz)
}
