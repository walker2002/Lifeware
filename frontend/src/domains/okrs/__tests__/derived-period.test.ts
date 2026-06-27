/**
 * @file derived-period
 * @brief objectiveRowToUSOM period 派生（join cycle）单元测试
 *
 * [022] 1A-T5：mapper 的 period 不再读 row.periodType/periodStart/periodEnd，
 * 改为从 joined cycle 字段（cycleType/cyclePeriodStart/cyclePeriodEnd）派生；
 * cycleId 直接透传 row.cycleId（替换 T3 占位的 ''）。
 */
import { describe, it, expect } from 'vitest'
import { objectiveRowToUSOM } from '@/lib/db/repositories/mappers'

describe('objectiveRowToUSOM 派生 period', () => {
  it('period 从 joined cycle 字段派生（type/start/end 来自 cycle）', () => {
    const row = {
      id: 'o1', status: 'active', title: 'T', description: null,
      cycleId: 'c1',
      cycleType: 'quarterly',
      cyclePeriodStart: '2026-04-01',
      cyclePeriodEnd: '2026-06-30',
      parentId: null, okrType: 'committed', objectiveNumber: '26Q2-O1', priority: 'P1', tags: [],
      createdAt: new Date(), updatedAt: new Date(),
      discardedAt: null, completedAt: null, archivedAt: null,
    } as any
    const obj = objectiveRowToUSOM(row, [])
    expect(obj.cycleId).toBe('c1')
    expect(obj.period).toEqual({
      type: 'quarterly',
      start: '2026-04-01',
      end: '2026-06-30',
    })
  })

  it('cycleId 直接透传 row.cycleId（替换 [022-T3] 占位）', () => {
    const row = {
      id: 'o2', status: 'draft', title: 'X', description: null,
      cycleId: 'cycle-xyz',
      cycleType: 'annual',
      cyclePeriodStart: '2026-01-01',
      cyclePeriodEnd: '2026-12-31',
      parentId: null, okrType: 'visionary', objectiveNumber: null, priority: 'P2', tags: [],
      createdAt: new Date(), updatedAt: new Date(),
      discardedAt: null, completedAt: null, archivedAt: null,
    } as any
    const obj = objectiveRowToUSOM(row, ['kr-1', 'kr-2'])
    expect(obj.cycleId).toBe('cycle-xyz')
    expect(obj.keyResultIds).toEqual(['kr-1', 'kr-2'])
    expect(obj.period.type).toBe('annual')
  })
})
