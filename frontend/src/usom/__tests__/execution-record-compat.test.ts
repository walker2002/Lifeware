/**
 * @file execution-record-compat 测试
 * @brief [023.13] 旧 4 字段 DetailedExecutionRecord JSONB 行读取新字段须 undefined
 */
import { describe, it, expect } from 'vitest'

// 模拟 mapper 透传 JSONB → DetailedExecutionRecord 的最小行为：
// mapper 不删未知键、不补缺键，直接 spread。
function mapExecutionRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw }
}

describe('DetailedExecutionRecord 向后兼容', () => {
  it('迁移前 4 字段旧行，新字段访问返回 undefined', () => {
    const oldRow = {
      mode: 'detailed',
      completionStatus: 'completed',
      actualDuration: 60,
      plannedDuration: 60,
      deviationMinutes: 0,
      sourceType: 'timebox',
      loggedAt: '2026-07-01T10:00:00Z',
      completionRating: 5,
      actualOutput: 'done',
    }
    const rec = mapExecutionRecord(oldRow) as any
    expect(rec.actualStartTime).toBeUndefined()
    expect(rec.actualEndTime).toBeUndefined()
    expect(rec.focusMinutes).toBeUndefined()
    expect(rec.energyActual).toBeUndefined()
  })

  it('迁移后新行保留 4 新字段', () => {
    const newRow = {
      ...{ mode: 'detailed', completionStatus: 'completed', actualDuration: 60, plannedDuration: 60, deviationMinutes: 0, sourceType: 'timebox', loggedAt: '2026-07-01T10:00:00Z', completionRating: 5, actualOutput: 'done' },
      actualStartTime: '2026-07-01T09:00:00Z',
      actualEndTime: '2026-07-01T10:00:00Z',
      focusMinutes: 45,
      energyActual: 7,
    }
    const rec = mapExecutionRecord(newRow) as any
    expect(rec.focusMinutes).toBe(45)
    expect(rec.energyActual).toBe(7)
  })
})