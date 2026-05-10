// 纯函数：习惯 streak 指标计算
// 输入为日期数组（来自 habit_logs），输出为 streak / longestStreak / completionCount7d

/** 将 DateOnly 字符串 (YYYY-MM-DD) 转为可比较的整数 YYYYMMDD */
function dateToDay(d: string): number {
  return Number(d.replace(/-/g, ''))
}

/** 获取两个日期之间的天数差 */
function dayDiff(a: string, b: string): number {
  const da = dateToDay(a)
  const db = dateToDay(b)
  return db - da
}

/**
 * 从已排序的打卡日期列表中计算当前连续天数
 * @param completedDates 按 ASC 排序的已完成日期 (YYYY-MM-DD)
 * @param today 今天的日期 (YYYY-MM-DD)
 * @returns 当前连续天数（今天有打卡则 >= 1，今天没打卡但昨天有则为 0）
 */
export function calculateStreak(completedDates: string[], today: string): number {
  if (completedDates.length === 0) return 0

  const todayDay = dateToDay(today)
  const latestDay = dateToDay(completedDates[completedDates.length - 1])

  // 最近一次打卡不是今天 → 连续已中断（指标只在打卡时触发，正常情况今天必有记录）
  if (latestDay < todayDay) return 0

  // 从今天往前数连续天数
  let streak = 1
  for (let i = completedDates.length - 1; i > 0; i--) {
    const diff = dayDiff(completedDates[i - 1], completedDates[i])
    if (diff === 1) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/**
 * 计算历史最长连续天数
 * @param completedDates 按 ASC 排序的已完成日期 (YYYY-MM-DD)
 * @returns 历史最长连续天数
 */
export function calculateLongestStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0

  let longest = 1
  let current = 1
  for (let i = 1; i < completedDates.length; i++) {
    if (dayDiff(completedDates[i - 1], completedDates[i]) === 1) {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }
  return longest
}

/**
 * 计算最近 7 天内的完成次数
 * @param completedDates 按 ASC 排序的已完成日期 (YYYY-MM-DD)
 * @param today 今天的日期 (YYYY-MM-DD)
 * @returns 最近 7 天（含今天）的 completed 记录数
 */
export function calculateCompletion7d(completedDates: string[], today: string): number {
  const todayDay = dateToDay(today)
  const windowStart = todayDay - 6 // 含今天共 7 天
  return completedDates.filter(d => dateToDay(d) >= windowStart).length
}
