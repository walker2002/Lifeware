/** @file templates-provider.test @brief [028] T1 时间盒模板上下文 provider 测试 */
import { describe, it, expect, vi } from 'vitest'
import { TemplatesProvider } from '../providers/templates-provider'

describe('TemplatesProvider', () => {
  it('flatMaps t.rows（非 t 本身）+ 按 daysOfWeek 过滤当日', async () => {
    // fold-in T1-fix：findByUser 返 TimeboxTemplate[]（含 rows: TemplateRow[]）；
    // 周三(3)只返 daysOfWeek 含 3 的模板行
    const repo = {
      findByUser: vi.fn().mockResolvedValue([
        { id: 't1', name: '工作日', daysOfWeek: [1,2,3,4,5], rows: [
          { id: 'r1', activityName: '深度工作', defaultStart: '09:00', defaultDuration: 120,
            earliestStart: '08:00', latestStart: '11:00', shortestDuration: 60,
            activityArchetypeId: 'ar1', source: 'custom' },
        ]},
        { id: 't2', name: '周末', daysOfWeek: [0,6], rows: [
          { id: 'r2', activityName: '休闲', defaultStart: '10:00', defaultDuration: 60, source: 'custom' },
        ]},
      ]),
    } as any
    const provider = new TemplatesProvider(repo)
    // 2026-07-15 是周三（getUTCDay()=3）
    const result = (await provider.provide('templates_for_date', { date: '2026-07-15', userId: 'u1' })) as any[]
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')  // 只 r1（工作日含周三）
    expect(result[0]).toHaveProperty('shortestDuration')  // 非 minDuration
  })

  it('earliestStart/latestStart 透传为 HH:MM string（T2 转 UTC hour）', async () => {
    const repo = { findByUser: vi.fn().mockResolvedValue([
      { id: 't1', daysOfWeek: [3], rows: [{ id: 'r1', activityName: 'x', defaultStart: '09:00',
        defaultDuration: 120, earliestStart: '08:00', latestStart: '11:00', source: 'custom' }] },
    ]) } as any
    const result = (await new TemplatesProvider(repo).provide('templates_for_date', { date: '2026-07-15', userId: 'u1' })) as any[]
    expect(result[0].earliestStart).toBe('08:00')  // string，T2 buildTimeboxItems 转 number
    expect(result[0].latestStart).toBe('11:00')
  })
})
