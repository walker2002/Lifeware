// 习惯默认值自动推断 — 单元测试
import { describe, it, expect } from 'vitest'
import { inferHabitDefaults } from '@/domains/habits/habit-defaults'

describe('inferHabitDefaults', () => {
  it('根据 defaultTime 和 defaultDuration 计算时间窗口', () => {
    const result = inferHabitDefaults({ defaultTime: '07:00', defaultDuration: 30 })
    expect(result.earliestTime).toBe('06:30')
    expect(result.latestStartTime).toBe('07:30')
    expect(result.minDuration).toBe(30)
  })

  it('defaultDuration=60 → minDuration=60', () => {
    const result = inferHabitDefaults({ defaultTime: '12:00', defaultDuration: 60 })
    expect(result.minDuration).toBe(60)
    expect(result.latestStartTime).toBe('12:30')
  })

  it('defaultDuration=15 → minDuration=15', () => {
    const result = inferHabitDefaults({ defaultTime: '07:00', defaultDuration: 15 })
    expect(result.minDuration).toBe(15)
  })

  it('标题含"午餐"关键词 → trackable=false', () => {
    const result = inferHabitDefaults({ defaultTime: '12:00', defaultDuration: 60, title: '午餐' })
    expect(result.trackable).toBe(false)
  })

  it('标题含"晚餐"关键词 → trackable=false', () => {
    const result = inferHabitDefaults({ defaultTime: '18:00', defaultDuration: 60, title: '晚餐' })
    expect(result.trackable).toBe(false)
  })

  it('标题含"睡眠"关键词 → trackable=false', () => {
    const result = inferHabitDefaults({ defaultTime: '22:00', defaultDuration: 480, title: '睡眠' })
    expect(result.trackable).toBe(false)
  })

  it('普通标题 → trackable=true', () => {
    const result = inferHabitDefaults({ defaultTime: '07:00', defaultDuration: 30, title: '晨跑' })
    expect(result.trackable).toBe(true)
  })

  it('earliestTime 不低于 00:00', () => {
    const result = inferHabitDefaults({ defaultTime: '00:15', defaultDuration: 30 })
    expect(result.earliestTime).toBe('00:00')
  })
})
