/**
 * @file time-input-helpers 测试
 * @brief [023-01+ v2] ISO 串 ↔ datetime-local 输入互转（用户本地时区）
 *        + [023.08] T2 HH:MM + date → ISO UTC
 */

import { describe, it, expect } from 'vitest'
import {
  isoToLocalDatetimeInput,
  localDatetimeInputToIso,
  hhmmToIso,
  isoToHhmmInShanghai,
  isoOrHhmmToHhmmInShanghai,
} from '../time-input-helpers'

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

// ─── [028.2] T2-fix: isoToHhmmInShanghai + isoOrHhmmToHhmmInShanghai ─────────
// /browse 抓 P0:AIOrchestratePanel proposal 卡片显示「 – 」空时间,根因是
// generateProposals payload.startTime 实际是 HH:MM(非 ISO),旧 isoToHhmmInShanghai
// 把 "09:00" 当 ISO 解析 → Invalid Date → 返 '' → 显示空。
// 新增 isoOrHhmmToHhmmInShanghai 同时支持 HH:MM 直通 + ISO 转 Asia/Shanghai。

describe('[028.2] T2-fix isoToHhmmInShanghai + isoOrHhmmToHhmmInShanghai', () => {
  describe('isoToHhmmInShanghai', () => {
    it('UTC ISO → Asia/Shanghai HH:MM（08:00Z → 16:00）', () => {
      expect(isoToHhmmInShanghai('2026-07-12T08:00:00.000Z')).toBe('16:00')
    })

    it('空串 → 空串', () => {
      expect(isoToHhmmInShanghai('')).toBe('')
    })

    it('非法 ISO → 空串(不抛)', () => {
      expect(isoToHhmmInShanghai('not-a-date')).toBe('')
    })

    it('HH:MM(非 ISO) 被当 ISO 解析 → 返空(P0 根因演示)', () => {
      // [028.2] /browse 抓的 bug: '09:00' 走 new Date('09:00') → Invalid Date → 返 ''
      // 这条测试锁定旧行为作为对照,新 helper 修这个。
      expect(isoToHhmmInShanghai('09:00')).toBe('')
    })
  })

  describe('isoOrHhmmToHhmmInShanghai', () => {
    it('HH:MM 直通(两位数)— generateProposals payload 实际格式', () => {
      expect(isoOrHhmmToHhmmInShanghai('08:00')).toBe('08:00')
      expect(isoOrHhmmToHhmmInShanghai('22:30')).toBe('22:30')
    })

    it('HH:MM 规范化(一位数补零)— 兼容 formatTime 边界', () => {
      expect(isoOrHhmmToHhmmInShanghai('9:30')).toBe('09:30')
      expect(isoOrHhmmToHhmmInShanghai('9:00')).toBe('09:00')
    })

    it('ISO UTC → Asia/Shanghai(与 isoToHhmmInShanghai 一致)— 兼容含 T/LLM mock 路径', () => {
      expect(isoOrHhmmToHhmmInShanghai('2026-07-12T01:00:00.000Z')).toBe('09:00')
      expect(isoOrHhmmToHhmmInShanghai('2026-07-12T03:00:00.000Z')).toBe('11:00')
    })

    it('空串 → 空串', () => {
      expect(isoOrHhmmToHhmmInShanghai('')).toBe('')
    })

    it('非法输入 → 空串(不抛)', () => {
      expect(isoOrHhmmToHhmmInShanghai('not-a-date')).toBe('')
    })

    it('与 isoToHhmmInShanghai 反向差异:HH:MM 不被空吃掉', () => {
      // 这是 [028.2] T2-fix 核心:旧行为返 '',新行为返 '08:00'
      expect(isoToHhmmInShanghai('08:00')).toBe('')
      expect(isoOrHhmmToHhmmInShanghai('08:00')).toBe('08:00')
    })
  })
})
