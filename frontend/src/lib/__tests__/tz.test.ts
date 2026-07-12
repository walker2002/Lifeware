/**
 * @file tz.test.ts
 * @brief [TZ-2.2] getUserTzYear/Month/Date 三个 Intl-based helper 单元测试
 *
 * 验证跨 Node/browser 一致（不依赖运行时 process.env.TZ）：
 * - 同一 Date + 不同 tz → Y/M/D 按 tz 解算（不按 UTC 也不按 OS TZ）
 * - 与已有 getUserTzHour/Minute 同 Intl 模式（保证对称性）
 */

import { describe, it, expect } from 'vitest'
import { getUserTzYear, getUserTzMonth, getUserTzDate } from '../tz'

describe('[TZ-2.2] getUserTzYear/Month/Date — 跨 TZ 日期分量派生', () => {
  // 关键 fixture：UTC 2026-07-12T16:00:00Z 跨多个 tz 的日期分量
  // - Asia/Shanghai (UTC+8): 7/13 00:00 → year=2026, month=7, date=13
  // - Asia/Tokyo (UTC+9):   7/13 01:00 → year=2026, month=7, date=13
  // - America/New_York (UTC-4 EDT): 7/12 12:00 → year=2026, month=7, date=12
  // - UTC:                   7/12 16:00 → year=2026, month=7, date=12
  // - Pacific/Auckland (UTC+12): 7/13 04:00 → year=2026, month=7, date=13
  const utcDate = new Date('2026-07-12T16:00:00.000Z')

  describe('getUserTzYear', () => {
    it('Asia/Shanghai: 2026', () => {
      expect(getUserTzYear(utcDate, 'Asia/Shanghai')).toBe(2026)
    })
    it('Asia/Tokyo: 2026', () => {
      expect(getUserTzYear(utcDate, 'Asia/Tokyo')).toBe(2026)
    })
    it('America/New_York: 2026', () => {
      expect(getUserTzYear(utcDate, 'America/New_York')).toBe(2026)
    })
    it('UTC: 2026', () => {
      expect(getUserTzYear(utcDate, 'UTC')).toBe(2026)
    })
  })

  describe('getUserTzMonth（1-12）', () => {
    it('Asia/Shanghai: 7', () => {
      expect(getUserTzMonth(utcDate, 'Asia/Shanghai')).toBe(7)
    })
    it('Asia/Tokyo: 7', () => {
      expect(getUserTzMonth(utcDate, 'Asia/Tokyo')).toBe(7)
    })
    it('America/New_York: 7', () => {
      expect(getUserTzMonth(utcDate, 'America/New_York')).toBe(7)
    })
    it('UTC: 7', () => {
      expect(getUserTzMonth(utcDate, 'UTC')).toBe(7)
    })

    // 跨年边界：UTC 2026-12-31T20:00:00Z → Shanghai 2027-01-01 04:00（+1 年）
    it('Asia/Shanghai 跨年：UTC 12/31 20:00 → 2027-01-01 04:00 → year=2027 month=1', () => {
      const crossYearUtc = new Date('2026-12-31T20:00:00.000Z')
      expect(getUserTzYear(crossYearUtc, 'Asia/Shanghai')).toBe(2027)
      expect(getUserTzMonth(crossYearUtc, 'Asia/Shanghai')).toBe(1)
      expect(getUserTzDate(crossYearUtc, 'Asia/Shanghai')).toBe(1)
    })
  })

  describe('getUserTzDate（1-31）', () => {
    it('Asia/Shanghai: 13（UTC 16:00 = Shanghai 7/13 00:00）', () => {
      expect(getUserTzDate(utcDate, 'Asia/Shanghai')).toBe(13)
    })
    it('Asia/Tokyo: 13（UTC 16:00 = Tokyo 7/13 01:00）', () => {
      expect(getUserTzDate(utcDate, 'Asia/Tokyo')).toBe(13)
    })
    it('America/New_York: 12（UTC 16:00 = NY 7/12 12:00）', () => {
      expect(getUserTzDate(utcDate, 'America/New_York')).toBe(12)
    })
    it('UTC: 12', () => {
      expect(getUserTzDate(utcDate, 'UTC')).toBe(12)
    })
    it('Pacific/Auckland: 13（UTC 16:00 = Auckland 7/13 04:00）', () => {
      expect(getUserTzDate(utcDate, 'Pacific/Auckland')).toBe(13)
    })
  })

  describe('不依赖 process.env.TZ（与 OS TZ 解耦）', () => {
    // 即使 CI runner TZ=America/Los_Angeles，下面 3 个 tz 各自返回正确值
    it('Asia/Tokyo 跨日界：UTC 7/12 16:00 → 7/13（Tokyo 早 UTC+9）', () => {
      const d = new Date('2026-07-12T16:00:00.000Z')
      expect(getUserTzDate(d, 'Asia/Tokyo')).toBe(13)
    })
    it('America/New_York 跨日界反向：UTC 7/12 16:00 → 7/12（NY 晚 UTC-4）', () => {
      const d = new Date('2026-07-12T16:00:00.000Z')
      expect(getUserTzDate(d, 'America/New_York')).toBe(12)
    })
    it('Pacific/Auckland 跨日界：UTC 7/12 16:00 → 7/13（Auckland 早 UTC+12）', () => {
      const d = new Date('2026-07-12T16:00:00.000Z')
      expect(getUserTzDate(d, 'Pacific/Auckland')).toBe(13)
    })
  })
})