/**
 * @file time-input-helpers 测试
 * @brief [023-01+ v2] ISO 串 ↔ datetime-local 输入互转（用户本地时区）
 */

import { describe, it, expect } from 'vitest'
import { isoToLocalDatetimeInput, localDatetimeInputToIso } from '../time-input-helpers'

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
