/**
 * @file resolver.test.ts
 * @brief [029] LogicalDayResolver 单元测试（formatDateLabel + resolveLogicalDayLabel）
 *
 * 归属规则优先级：显式标签 > date(startTime, user_tz)。
 * 期望 tz=Asia/Shanghai 下，UTC 16:00 是次日 00:00；UTC 15:00 是当日 23:00。
 */

import { describe, it, expect } from 'vitest'
import { resolveLogicalDayLabel, formatDateLabel } from '../resolver'

const tz = 'Asia/Shanghai'

describe('[029] formatDateLabel (user_tz 日历日)', () => {
  it('UTC 16:00 → Shanghai 次日 00:00', () => {
    expect(formatDateLabel(new Date('2026-07-13T16:00:00Z'), tz)).toBe('2026-07-14')
  })
  it('UTC 15:00 → Shanghai 当日 23:00', () => {
    expect(formatDateLabel(new Date('2026-07-13T15:00:00Z'), tz)).toBe('2026-07-13')
  })
})

describe('[029] resolveLogicalDayLabel（显式 > 默认）', () => {
  it('无显式 → date(startTime, tz)', () => {
    const label = resolveLogicalDayLabel({ startTime: '2026-07-13T16:00:00Z', tz })
    expect(label).toBe('2026-07-14')
  })
  it('有显式 → 用显式（即使与 startTime 不同日）', () => {
    const label = resolveLogicalDayLabel({
      startTime: '2026-07-13T16:00:00Z',
      explicitLabel: '2026-07-13',
      tz,
    })
    expect(label).toBe('2026-07-13')
  })
  it('explicitLabel 空串视同未提供', () => {
    const label = resolveLogicalDayLabel({
      startTime: '2026-07-13T16:00:00Z',
      explicitLabel: '',
      tz,
    })
    expect(label).toBe('2026-07-14')
  })
})
