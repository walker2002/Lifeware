/**
 * @file time-input-helpers 测试
 * @brief [023-01+ v2] ISO 串 ↔ datetime-local 输入互转（用户本地时区）
 *        + [023.08] T2 HH:MM + date → ISO UTC
 */

import { describe, it, expect } from 'vitest'
import { isoToLocalDatetimeInput, localDatetimeInputToIso, hhmmToIso } from '../time-input-helpers'

describe('[023.08] T2 hhmmToIso（HH:MM + date → ISO UTC）', () => {
  it('converts HH:MM on a date to UTC ISO 8601', () => {
    expect(hhmmToIso('08:00', '2026-07-05')).toBe('2026-07-05T08:00:00.000Z')
  })

  it('handles end-of-day HH:MM', () => {
    expect(hhmmToIso('22:00', '2026-07-05')).toBe('2026-07-05T22:00:00.000Z')
  })

  it('throws on malformed HH:MM (invalid hour)', () => {
    expect(() => hhmmToIso('24:00', '2026-07-05')).toThrow(/invalid hour/i)
  })

  it('throws on malformed HH:MM (wrong length)', () => {
    expect(() => hhmmToIso('8:00', '2026-07-05')).toThrow(/hh:mm format/i)
  })

  it('throws on malformed date', () => {
    expect(() => hhmmToIso('08:00', 'not-a-date')).toThrow(/invalid date/i)
  })

  // [G10 fold] boundary tests
  it('handles start-of-day 00:00', () => {
    expect(hhmmToIso('00:00', '2026-07-05')).toBe('2026-07-05T00:00:00.000Z')
  })
  it('handles end-of-day 23:59', () => {
    expect(hhmmToIso('23:59', '2026-07-05')).toBe('2026-07-05T23:59:00.000Z')
  })
  it('handles cross-year 2024-12-31', () => {
    expect(hhmmToIso('08:00', '2024-12-31')).toBe('2024-12-31T08:00:00.000Z')
  })
})

describe('[023-01+ v2] time-input-helpers（用户本地时区输入/显示）', () => {
  describe('isoToLocalDatetimeInput', () => {
    it('ISO 串 → 合法 datetime-local 格式 YYYY-MM-DDTHH:MM', () => {
      const out = isoToLocalDatetimeInput('2026-07-01T13:00:00.000Z')
      // 格式断言（不依赖跑测机器的时区）
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('空串 → 空串', () => {
      expect(isoToLocalDatetimeInput('')).toBe('')
    })

    it('非法 ISO → 空串（不抛）', () => {
      expect(isoToLocalDatetimeInput('not-a-date')).toBe('')
      expect(isoToLocalDatetimeInput('2026-07-01T25:99:00')).toBe('')
    })
  })

  describe('localDatetimeInputToIso', () => {
    it('datetime-local → 合法 ISO 串（以 Z 结尾）', () => {
      const out = localDatetimeInputToIso('2026-07-01T21:00')
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/)
    })

    it('空串 → 空串', () => {
      expect(localDatetimeInputToIso('')).toBe('')
    })

    it('非法输入 → 空串（不抛）', () => {
      expect(localDatetimeInputToIso('not-a-date')).toBe('')
    })
  })

  describe('往返一致性（时区无关，核心不变量）', () => {
    it('datetime-local → ISO → datetime-local 等于原值', () => {
      const original = '2026-07-01T21:00'
      const roundTrip = isoToLocalDatetimeInput(localDatetimeInputToIso(original))
      expect(roundTrip).toBe(original)
    })

    it('ISO（整分钟）→ datetime-local → ISO 等于原值（秒级精度）', () => {
      const original = '2026-07-01T13:00:00.000Z'
      const roundTrip = localDatetimeInputToIso(isoToLocalDatetimeInput(original))
      expect(roundTrip).toBe(original)
    })
  })
})
