/**
 * @file timeboxes-workspace.range.test
 * @brief [023.06] T1: getDateRange 按模式返回正确日期范围（与 hooks/use-timebox.ts 同源）
 */

import { describe, it, expect } from 'vitest'

// [023.06] 故意把测试文件紧贴 workspace，但只 import 纯函数
// 我们在 task 末尾会从 workspace 导出 getDateRange
import { getDateRange } from '../timeboxes-workspace'

describe('[023.06] getDateRange', () => {
  it('day 模式 → startOfDay ~ endOfDay（00:00:00 ~ 23:59:59.999）', () => {
    const d = new Date('2026-07-05T12:00:00Z')
    const { start, end } = getDateRange('day', d)
    expect(start.getHours()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMilliseconds()).toBeGreaterThan(990)
  })

  it('week 模式 → 周一到周日 (weekStartsOn: 1)', () => {
    const d = new Date('2026-07-05T12:00:00Z') // 周日
    const { start, end } = getDateRange('week', d)
    expect(start.getDay()).toBe(1)
    expect(end.getDay()).toBe(0)
  })

  it('month 模式 → 1 号 ~ 月末', () => {
    const d = new Date('2026-07-05')
    const { start, end } = getDateRange('month', d)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(6) // 0-indexed: 6 = July
  })
})
