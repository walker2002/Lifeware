// Habit 冲突规则
// 检测新建习惯的默认时间是否与已有习惯重叠

import type { Rule, RuleResult } from '../evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

/** 将 HH:MM 转换为分钟数 */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 检测两个时间段是否重叠 */
function overlaps(
  start1: number, end1: number,
  start2: number, end2: number,
): boolean {
  return start1 < end2 && start2 < end1
}

export const HabitConflictRule: Rule = {
  name: 'HabitConflictRule',

  evaluate(intent: StructuredIntent, snapshot: ContextSnapshot): RuleResult {
    if (intent.targetDomain !== 'habits') return { severity: 'pass' }
    if (intent.action !== 'createHabit') return { severity: 'pass' }

    const newTime = intent.fields['defaultTime'] as string | undefined
    const newDuration = intent.fields['defaultDuration'] as number | undefined

    if (!newTime || !newDuration) return { severity: 'pass' }

    const newStart = toMinutes(newTime)
    const newEnd = newStart + newDuration

    const habits = snapshot.pendingHabits ?? []

    for (const habit of habits) {
      const existingTime = habit.defaultTime
      if (!existingTime) continue

      // 使用 HabitSummary 中的 defaultTime，假设默认时长 30 分钟（summary 没有时长信息）
      const existingStart = toMinutes(existingTime)
      const existingEnd = existingStart + 30 // 默认 30 分钟

      if (overlaps(newStart, newEnd, existingStart, existingEnd)) {
        return {
          severity: 'warning',
          message: `新习惯时间与已有习惯"${habit.title}"重叠`,
        }
      }
    }

    return { severity: 'pass' }
  },
}
