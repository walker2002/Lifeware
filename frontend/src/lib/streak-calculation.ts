/**
 * @file streak-calculation
 * @brief Streak（连续打卡）计算逻辑
 * 
 * 打卡时自动更新 streak/longestStreak/completionRate7d
 */

/**
 * Streak 计算输入接口
 */
interface StreakInput {
  /** 当前连续天数 */
  currentStreak: number
  /** 最后打卡日期（YYYY-MM-DD） */
  lastLogDate: string
  /** 今天日期（YYYY-MM-DD） */
  today: string
  /** 今日是否已打卡 */
  loggedToday: boolean
  /** 最长连续天数记录 */
  longestStreak: number
}

/**
 * Streak 计算输出接口
 */
interface StreakOutput {
  /** 当前连续天数 */
  streak: number
  /** 最长连续天数记录 */
  longestStreak: number
}

/**
 * 计算两个日期之间的天数差
 * @param a - 日期 a（YYYY-MM-DD）
 * @param b - 日期 b（YYYY-MM-DD）
 * @returns 天数差
 */
function dateDiffDays(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * 计算连续打卡天数
 * @param input - Streak 计算输入
 * @returns Streak 计算输出
 */
export function calculateStreak(input: StreakInput): StreakOutput {
  const { currentStreak, lastLogDate, today, loggedToday, longestStreak } = input

  if (!loggedToday) {
    return { streak: currentStreak, longestStreak }
  }

  const diff = dateDiffDays(today, lastLogDate)

  let newStreak: number
  if (diff === 1) {
    // 昨日已打卡，连续
    newStreak = currentStreak + 1
  } else {
    // 断了，从 1 开始
    newStreak = 1
  }

  const newLongest = Math.max(longestStreak, newStreak)

  return { streak: newStreak, longestStreak: newLongest }
}

/**
 * 计算7天完成率
 * @param loggedDays - 已打卡天数
 * @param totalDays - 总天数
 * @returns 完成率（0-1）
 */
export function calculateCompletionRate7d(loggedDays: number, totalDays: number): number {
  if (totalDays === 0) return 0
  return loggedDays / totalDays
}
