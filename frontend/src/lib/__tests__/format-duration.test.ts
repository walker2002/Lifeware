import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  parseDurationToMinutes,
  durationHours,
  durationMinutes,
} from '@/lib/format-duration'

describe('formatDuration', () => {
  it('分钟数转中文时长', () => {
    expect(formatDuration(90)).toBe('1小时30分钟')
    expect(formatDuration(45)).toBe('45分钟')
    expect(formatDuration(120)).toBe('2小时')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
  })
})

describe('parseDurationToMinutes', () => {
  it('小时+分钟字符串合并为总分钟', () => {
    expect(parseDurationToMinutes('2', '30')).toBe(150)
    expect(parseDurationToMinutes('1', '0')).toBe(60)
    expect(parseDurationToMinutes('', '45')).toBe(45)
    expect(parseDurationToMinutes('', '')).toBe(0)
  })
})

describe('durationHours / durationMinutes', () => {
  it('从总分钟拆出小时与分钟字符串', () => {
    expect(durationHours(150)).toBe('2')
    expect(durationMinutes(150)).toBe('30')
    expect(durationHours(45)).toBe('0')
    expect(durationMinutes(45)).toBe('45')
    expect(durationHours(null)).toBe('')
    expect(durationMinutes(undefined)).toBe('')
  })
})
