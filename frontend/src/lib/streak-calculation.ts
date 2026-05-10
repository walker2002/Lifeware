// Streak 计算逻辑
// 打卡时自动更新 streak/longestStreak/completionRate7d

interface StreakInput {
  currentStreak: number
  lastLogDate: string // YYYY-MM-DD
  today: string // YYYY-MM-DD
  loggedToday: boolean
  longestStreak: number
}

interface StreakOutput {
  streak: number
  longestStreak: number
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24))
}

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

export function calculateCompletionRate7d(loggedDays: number, totalDays: number): number {
  if (totalDays === 0) return 0
  return loggedDays / totalDays
}
