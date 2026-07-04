/**
 * @file timebox-overlap.test
 * @brief [023.04] T1 timebox-overlap rule 改 endTime 单测
 *
 * 修后行为（[023] A2 OV#P1-#1 后：duration 已撤，由 client 折成 endTime）：
 * - endTime 缺失 → pass（兼容）
 * - 与 planned/running/overtime 重叠 → confirm
 * - 与 ended/cancelled/logged 重叠 → pass（不阻断）
 */

import { describe, it, expect, vi } from 'vitest'
import { createTimeOverlapRule } from '../rules/timebox-overlap'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

const userId = '00000000-0000-0000-0000-000000000001'

function mockRepo(byDate: Array<{ startTime: string; endTime: string; title: string; status: string }>) {
  return {
    findByDateRange: vi.fn().mockResolvedValue(byDate),
  } as any
}

const intent = (fields: Record<string, unknown>): StructuredIntent =>
  ({ fields } as unknown as StructuredIntent)

const snapshot = {} as ContextSnapshot

describe('[023.04] TimeOverlapRule — endTime-based', () => {
  it('endTime 缺失 → pass（兼容历史 intent）', async () => {
    const rule = createTimeOverlapRule(mockRepo([]), userId as any)
    const r = await rule.evaluate(intent({ startTime: '2026-07-04T09:00:00Z' }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('endTime 与 planned 重叠 → confirm', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:30:00Z', endTime: '2026-07-04T10:30:00Z', title: '晨会', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:00:00Z',
      endTime: '2026-07-04T10:00:00Z',
    }), snapshot)
    expect(r.severity).toBe('confirm')
    if (r.severity !== 'pass') {
      expect(r.message).toContain('晨会')
    } else {
      throw new Error('expected confirm, got pass')
    }
  })

  it('endTime 与 ended timebox 重叠 → pass（不阻断）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '已结束', status: 'ended' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('endTime 与 cancelled timebox 重叠 → pass', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '已取消', status: 'cancelled' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('边界相切 end==start → pass（半开区间）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T10:00:00Z', endTime: '2026-07-04T11:00:00Z', title: 'A', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:00:00Z',
      endTime: '2026-07-04T10:00:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })
})
