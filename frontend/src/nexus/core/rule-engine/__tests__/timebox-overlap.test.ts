/**
 * @file timebox-overlap.test
 * @brief [023.04][023.12] T1 timebox-overlap rule 改 endTime 单测
 *
 * 修后行为（[023] A2 OV#P1-#1 后：duration 已撤，由 client 折成 endTime）：
 * - endTime 缺失 → pass（兼容）
 * - 与 planned 重叠 → confirm（[023.12] T7 (AM9) 收窄 activeStatuses）
 * - 与 cancelled/logged 重叠 → pass（不阻断）
 *
 * [023.12] T7 (AM9) 修订：原 running/overtime 2 测改为 planned（status union
 *   收敛后 running/overtime 不再持久化，读时派生显示，对应实际持久化是 planned）。
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

  it('endTime 与 running timebox 重叠 → confirm', async () => {
    // [023.12] T7 (AM9)：running 不再持久化，read-time 派生；DB 侧 status
    //   始终是 planned。测用 planned 模拟「正在跑（planned 且 now ∈ [start,end])」
    //   的时间盒——仍应触发 confirm（[planned] 永远参与冲突检测）。
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '进行中', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('confirm')
    if (r.severity !== 'pass') {
      expect(r.message).toContain('进行中')
    } else {
      throw new Error('expected confirm, got pass')
    }
  })

  it('endTime 与 overtime timebox 重叠 → confirm', async () => {
    // [023.12] T7 (AM9)：同 running 测 — overtime 不再持久化，DB 侧 status 是 planned。
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: '超时', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:30:00Z',
      endTime: '2026-07-04T10:30:00Z',
    }), snapshot)
    expect(r.severity).toBe('confirm')
    if (r.severity !== 'pass') {
      expect(r.message).toContain('超时')
    } else {
      throw new Error('expected confirm, got pass')
    }
  })

  it('endTime 格式非法 → pass（由 StartTimeInFutureRule 负责）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: 'A', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T09:00:00Z',
      endTime: '不是合法时间',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })

  it('endTime<=startTime → pass（由 EndTimeAfterStartRule 负责）', async () => {
    const rule = createTimeOverlapRule(mockRepo([
      { startTime: '2026-07-04T09:00:00Z', endTime: '2026-07-04T10:00:00Z', title: 'A', status: 'planned' },
    ]), userId as any)
    const r = await rule.evaluate(intent({
      startTime: '2026-07-04T10:00:00Z',
      endTime: '2026-07-04T09:00:00Z',
    }), snapshot)
    expect(r.severity).toBe('pass')
  })
})
