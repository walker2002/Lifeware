/**
 * @file use-timebox.test
 * @brief [TD-039] 验证 getDateRange 返回 ISO string 合约，规避 TZDate 跨 RSC boundary 序列化丢 class 陷阱
 *
 * 根因（见 docs/tech-debt/TD-039-tzdate-rsc-serialization.md）：
 * - getDateRange 之前返回 `@date-fns/tz v1.4.1` 的 `tz(tzName)` 包出的 TZDate（Date subclass）
 * - 跨 Next.js 16 RSC boundary 时 Next.js 不识别 TZDate 的 prototype，序列化为 plain object
 * - server action 收到 plain object 后 `start.toISOString()` 抛 TypeError，页面 500
 *
 * 修复后合约：getDateRange 返回 `{ start: string; end: string }`（ISO 8601 UTC 字符串）
 * - string 是 RSC boundary 安全的 primitive，下游 server action 零额外转换
 * - 已对调用 getTimeboxesByRange/getAppointmentsByRange 的 server action 同步改 string 类型
 *
 * 之前 `timeboxes-workspace.range.test.tsx:18-39` 的 day/week/month 模式形状断言（start.getHours() 等）
 * 仍通过：因为 fix 前后 `startOfDay(...)` 内部的 timezone 行为未变，只是出口多一次 `.toISOString()`。
 * 本文件新增 string 出口断言，确保 fix 后的契约不被未来重构悄悄回退。
 */

import { describe, it, expect } from 'vitest'
import { getDateRange } from '../use-timebox'
import type { DateViewMode } from '@/domains/timebox/components/types'

/**
 * 校验 ISO 8601 字符串格式（包含 UTC 'Z' 或 tz-aware offset）
 * 关键是 Date.parse(string) 能解析为合法 absolute moment，跨 RSC boundary 安全的 primitive。
 * TZDate.toISOString() 在 user_tz 下输出 `2026-07-12T23:59:59.999+08:00`，UTC Date 输出 `...Z`，
 * 都是合规 ISO 8601。`Date.parse` 接受两种格式。
 */
function expectIsoUtc(s: unknown): asserts s is string {
  expect(typeof s).toBe('string')
  const str = s as string
  expect(str).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:?\d{2})$/)
  const ms = Date.parse(str)
  expect(Number.isFinite(ms)).toBe(true)
}

describe('[TD-039] getDateRange 出口合约：返回 ISO 8601 UTC string', () => {
  // 选 noon UTC 时刻作为基准，避免 DST / 时区字面读歧义
  const noon = new Date('2026-07-08T12:00:00.000Z')

  it.each<{ mode: DateViewMode }>([
    { mode: 'day' },
    { mode: 'week' },
    { mode: 'month' },
  ])('$mode 模式 → start 是 ISO string（含日期与时间分量）', ({ mode }) => {
    const { start } = getDateRange(mode, noon, 'Asia/Shanghai')
    expectIsoUtc(start)
  })

  it.each<{ mode: DateViewMode }>([
    { mode: 'day' },
    { mode: 'week' },
    { mode: 'month' },
  ])('$mode 模式 → end 是 ISO string（含日期与时间分量）', ({ mode }) => {
    const { end } = getDateRange(mode, noon, 'Asia/Shanghai')
    expectIsoUtc(end)
  })

  it('day 模式 → start 比 end 早', () => {
    const { start, end } = getDateRange('day', noon, 'Asia/Shanghai')
    expect(Date.parse(start)).toBeLessThan(Date.parse(end))
  })

  it('week 模式 → start 与 end 跨度约 7 天（≥ 6 天 ≤ 7 天）', () => {
    const { start, end } = getDateRange('week', noon, 'Asia/Shanghai')
    const spanDays = (Date.parse(end) - Date.parse(start)) / (24 * 3600 * 1000)
    expect(spanDays).toBeGreaterThanOrEqual(6)
    expect(spanDays).toBeLessThanOrEqual(7)
  })

  it('day 模式 → start<end<下一天 day mode 的 start（day→next day 边界正确）', () => {
    const { start } = getDateRange('day', noon, 'Asia/Shanghai')
    const nextDay = new Date(noon.getTime() + 24 * 3600 * 1000)
    const { start: nextStart } = getDateRange('day', nextDay, 'Asia/Shanghai')
    expect(Date.parse(start)).toBeLessThan(Date.parse(nextStart))
  })
})
