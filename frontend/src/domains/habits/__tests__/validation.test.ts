import { describe, it, expect } from 'vitest'
import { validateHabitFields } from '../validation'

describe('validateHabitFields', () => {
  it('createHabit 标题为空时返回 error', () => {
    const result = validateHabitFields({ title: '' }, 'createHabit')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('标题必填')
  })

  it('updateHabit 标题为空时允许通过', () => {
    const result = validateHabitFields({ title: '' }, 'updateHabit')
    expect(result.valid).toBe(true)
  })

  it('时间格式无效时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '25:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时间必须是有效的 HH:MM 格式')
  })

  it('默认时间在窗口外时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '05:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时间必须在最早开始时间和最迟开始时间之间')
  })

  it('默认时间在窗口内时通过', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00' },
      'createHabit'
    )
    expect(result.valid).toBe(true)
  })

  it('默认时长 <= 0 时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0 },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('默认时长必须大于 0')
  })

  it('默认时长 >= 180 时返回 warning', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 180 },
      'createHabit'
    )
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('默认时长较长（≥180分钟），建议拆分为多个习惯')
  })

  it('最短时长 > 默认时长时返回 error', () => {
    const result = validateHabitFields(
      { title: 'test', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 60 },
      'createHabit'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('最短时长不能大于默认时长')
  })

  it('完整有效数据通过', () => {
    const result = validateHabitFields(
      { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15 },
      'createHabit'
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
