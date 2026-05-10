// Streak 计算器单元测试 — TDD 先写测试
import { describe, it, expect } from 'vitest'
import { calculateStreak, calculateLongestStreak, calculateCompletion7d } from '../streak-calculator'

const TODAY = '2026-05-10'

describe('calculateStreak', () => {
  it('空记录返回 0', () => {
    expect(calculateStreak([], TODAY)).toBe(0)
  })

  it('今天打卡返回 1', () => {
    expect(calculateStreak(['2026-05-10'], TODAY)).toBe(1)
  })

  it('昨天打卡今天未打卡返回 0', () => {
    expect(calculateStreak(['2026-05-09'], TODAY)).toBe(0)
  })

  it('连续 3 天（含今天）返回 3', () => {
    expect(calculateStreak(['2026-05-08', '2026-05-09', '2026-05-10'], TODAY)).toBe(3)
  })

  it('连续 5 天后中断 1 天再连续 3 天（含今天）返回 3', () => {
    const dates = [
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      // 05-06 中断
      '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10',
    ]
    expect(calculateStreak(dates, TODAY)).toBe(4)
  })

  it('最近打卡是前天（连续已中断）返回 0', () => {
    expect(calculateStreak(['2026-05-07', '2026-05-08'], TODAY)).toBe(0)
  })
})

describe('calculateLongestStreak', () => {
  it('空记录返回 0', () => {
    expect(calculateLongestStreak([])).toBe(0)
  })

  it('单条记录返回 1', () => {
    expect(calculateLongestStreak(['2026-05-10'])).toBe(1)
  })

  it('连续 5 天返回 5', () => {
    const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05']
    expect(calculateLongestStreak(dates)).toBe(5)
  })

  it('5天连续 + 中断 + 3天连续 返回 5', () => {
    const dates = [
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-05-07', '2026-05-08', '2026-05-09',
    ]
    expect(calculateLongestStreak(dates)).toBe(5)
  })

  it('3天连续 + 中断 + 7天连续 返回 7', () => {
    const dates = [
      '2026-05-01', '2026-05-02', '2026-05-03',
      '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11',
    ]
    expect(calculateLongestStreak(dates)).toBe(7)
  })
})

describe('calculateCompletion7d', () => {
  it('空记录返回 0', () => {
    expect(calculateCompletion7d([], TODAY)).toBe(0)
  })

  it('最近 7 天有 4 条记录返回 4', () => {
    const dates = ['2026-05-04', '2026-05-05', '2026-05-08', '2026-05-10']
    expect(calculateCompletion7d(dates, TODAY)).toBe(4)
  })

  it('7 天以外的记录不计入', () => {
    const dates = ['2026-04-30', '2026-05-02', '2026-05-10']
    // 04-30 和 05-02 都在 windowStart(05-04) 之前，不计入
    expect(calculateCompletion7d(dates, TODAY)).toBe(1)
  })

  it('全部 7 天都有记录返回 7', () => {
    const dates = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10']
    expect(calculateCompletion7d(dates, TODAY)).toBe(7)
  })

  it('只有今天打卡返回 1', () => {
    expect(calculateCompletion7d(['2026-05-10'], TODAY)).toBe(1)
  })
})
