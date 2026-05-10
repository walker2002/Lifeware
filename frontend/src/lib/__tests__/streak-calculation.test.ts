// Streak 计算逻辑 — 单元测试
import { describe, it, expect } from 'vitest'
import { calculateStreak, calculateCompletionRate7d } from '@/lib/streak-calculation'

describe('calculateStreak', () => {
  it('昨日已打卡且 streak=5，今日打卡 → streak 更新为 6', () => {
    const result = calculateStreak({
      currentStreak: 5,
      lastLogDate: '2026-05-08',
      today: '2026-05-09',
      loggedToday: true,
      longestStreak: 5,
    })
    expect(result.streak).toBe(6)
    expect(result.longestStreak).toBe(6)
  })

  it('昨日未打卡且 streak=3，今日打卡 → streak 重置为 1', () => {
    const result = calculateStreak({
      currentStreak: 3,
      lastLogDate: '2026-05-07',
      today: '2026-05-09',
      loggedToday: true,
      longestStreak: 5,
    })
    expect(result.streak).toBe(1)
    expect(result.longestStreak).toBe(5)
  })

  it('今日已打卡，连续第 10 天 → streak=10, longestStreak=10', () => {
    const result = calculateStreak({
      currentStreak: 9,
      lastLogDate: '2026-05-08',
      today: '2026-05-09',
      loggedToday: true,
      longestStreak: 8,
    })
    expect(result.streak).toBe(10)
    expect(result.longestStreak).toBe(10)
  })
})

describe('calculateCompletionRate7d', () => {
  it('7 天打卡 5 次 → 0.71', () => {
    expect(calculateCompletionRate7d(5, 7)).toBeCloseTo(0.714, 1)
  })

  it('7 天打卡 0 次 → 0', () => {
    expect(calculateCompletionRate7d(0, 7)).toBe(0)
  })
})
