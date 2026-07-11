/**
 * @file nl-parser.test @brief [028] T5 NL 结构化输出 + 结构性置信度
 *
 * 测试矩阵：
 *   - parseNL：LLM 返回合法 JSON → 四类结构 (matchedTasks/Templates/Appointments + newEvents) + timeExpressions
 *   - parseNL：LLM 返回非法 JSON → 降级空 + 低置信（< 0.5）
 *   - deriveConfidence：entityId 在 catalog 存在 → 高置信（≥ 0.8）
 *   - deriveConfidence：newEvent 不引用任何已有 → 高置信（明确新建，≥ 0.8）
 *   - deriveConfidence：引用实体但时间撞 Tier0 → 强制低置信（< 0.5，走 needConfirm）
 *
 * 设计依据：docs/superpowers/plans/2026-07-11-028-schedule-proposal.md T5
 */

import { describe, it, expect, vi } from 'vitest'
import { parseNL, deriveConfidence } from '../lib/nl-parser'

describe('parseNL', () => {
  it('NL 解析为四类结构（matched/new/time）', async () => {
    const aiRuntime = { generate: vi.fn().mockResolvedValue({ content: JSON.stringify({
      matchedTasks: [{ id: 't1', title: '写报告' }],
      matchedTemplates: [], matchedAppointments: [],
      newEvents: [{ title: '下午开会', time: '15:00' }],
      timeExpressions: [{ raw: '下午3点', hour: 15 }],
    }) }) } as any
    const catalog = { tasks: [{ id: 't1', title: '写报告' }], templates: [], appointments: [] }
    const result = await parseNL('今天要写报告，下午3点开会', catalog, aiRuntime)
    expect(result.matchedTasks).toHaveLength(1)
    expect(result.newEvents).toHaveLength(1)
    expect(result.timeExpressions[0].hour).toBe(15)
  })

  it('LLM 返回非法 JSON → 降级 + 低置信', async () => {
    const aiRuntime = { generate: vi.fn().mockResolvedValue({ content: 'not json' }) } as any
    const result = await parseNL('xxx', { tasks: [], templates: [], appointments: [] }, aiRuntime)
    expect(result.confidence).toBeLessThan(0.5)
  })
})

describe('deriveConfidence 结构性置信度（不信 LLM 自报）', () => {
  it('entityId 在 catalog 存在 → 高置信', () => {
    const c = deriveConfidence(
      { matchedTasks: [{ id: 't1' }], matchedTemplates: [], matchedAppointments: [], newEvents: [] },
      { tasks: [{ id: 't1' }], templates: [], appointments: [] },
    )
    expect(c).toBeGreaterThanOrEqual(0.8)
  })
  it('newEvent 不引用任何已有 → 高置信（明确新建）', () => {
    const c = deriveConfidence(
      { matchedTasks: [], matchedTemplates: [], matchedAppointments: [], newEvents: [{ title: '新事' }] },
      { tasks: [], templates: [], appointments: [] },
    )
    expect(c).toBeGreaterThanOrEqual(0.8)
  })
  it('引用实体但时间撞 Tier0 → 强制低置信（走 needConfirm）', () => {
    const c = deriveConfidence(
      { matchedAppointments: [{ id: 'a1', conflictsTier0: true }], matchedTasks: [], matchedTemplates: [], newEvents: [] },
      { tasks: [], templates: [], appointments: [{ id: 'a1' }] },
      { tier0Slots: [{ startHour: 2, endHour: 3 }] },
    )
    expect(c).toBeLessThan(0.5)
  })
})
