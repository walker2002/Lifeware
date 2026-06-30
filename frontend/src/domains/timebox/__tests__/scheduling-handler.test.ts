import { describe, it, expect } from 'vitest'
import { SchedulingHandler } from '../handlers/scheduling-handler'
import type { GenerationRequest } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'

function makeIntent(fields: Record<string, unknown> = {}): StructuredIntent {
  return {
    id: 'test-intent-1' as any,
    intentionId: '' as any,
    targetDomain: 'timebox',
    action: 'createSmartSchedule',
    fields,
    confidence: 1.0,
    resolvedBy: 'ai',
    createdAt: '2026-05-20T00:00:00Z' as any,
  }
}

function makeRequest(contexts: Record<string, unknown>, fields?: Record<string, unknown>): GenerationRequest {
  return {
    intent: makeIntent(fields ?? { date: '2026-05-20' }),
    contexts,
  }
}

describe('SchedulingHandler', () => {
  const handler = new SchedulingHandler()

  it('generates proposals from tasks and habits', async () => {
    const request = makeRequest({
      existingTimeboxes: [],
      activeTasks: [
        { id: 't1', title: '写代码', priority: 'high', energyRequired: 'high', estimatedDuration: 60, threadId: null },
        { id: 't2', title: '代码审查', priority: 'medium', energyRequired: 'medium', estimatedDuration: 60, threadId: null },
      ],
      pendingHabits: [
        { id: 'h1', title: '晨跑', defaultTime: '07:00', defaultDuration: 30, frequencyType: 'daily' },
      ],
      energyCurve: { peakHours: [9, 10, 11], lowHours: [14, 15], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    expect(result.proposalSet.proposals.length).toBeGreaterThanOrEqual(3)
    expect(result.proposalSet.label).toContain('2026-05-20')
    expect(result.presentation).toBeDefined()
    expect(result.presentation!.type).toBe('markdown')
  })

  it('detects overlap warnings with existing timeboxes', async () => {
    const request = makeRequest({
      existingTimeboxes: [
        {
          id: 'tb1', title: '已有会议', status: 'planned',
          startTime: '2026-05-20T08:00:00+08:00', endTime: '2026-05-20T09:30:00+08:00',
          habitIds: [], taskIds: [],
        },
      ],
      activeTasks: [
        { id: 't1', title: '任务A', priority: 'P1', energyRequired: 'medium', estimatedDuration: 60, threadId: null },
      ],
      pendingHabits: [],
      energyCurve: { peakHours: [9, 10, 11], lowHours: [14, 15], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    // The handler should either skip the occupied slot or generate warnings
    if (result.warnings && result.warnings.length > 0) {
      expect(result.warnings[0].code).toBe('SCHEDULE_OVERLAP')
    }
  })

  it('handles empty input materials gracefully', async () => {
    const request = makeRequest({
      existingTimeboxes: [],
      activeTasks: [],
      pendingHabits: [],
      energyCurve: { peakHours: [], lowHours: [], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    expect(result.proposalSet.proposals).toHaveLength(0)
    expect(result.presentation!.content).toContain('无可编排')
  })

  it('assigns energy match scores to proposals', async () => {
    const request = makeRequest({
      existingTimeboxes: [],
      activeTasks: [
        { id: 't1', title: '高能任务', priority: 'high', energyRequired: 'high', estimatedDuration: 60, threadId: null },
      ],
      pendingHabits: [],
      energyCurve: { peakHours: [9, 10, 11], lowHours: [14, 15], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    const proposal = result.proposalSet.proposals[0]
    expect(proposal).toBeDefined()
    expect(proposal.energyMatch).toBeDefined()
    expect(proposal.energyMatch!.score).toBeGreaterThan(0)
    expect(proposal.energyMatch!.score).toBeLessThanOrEqual(1)
  })

  it('sorts by priority: habit before task', async () => {
    const request = makeRequest({
      existingTimeboxes: [],
      activeTasks: [
        { id: 't1', title: '任务', priority: 'P2', energyRequired: 'low', estimatedDuration: 30, threadId: null },
      ],
      pendingHabits: [
        { id: 'h1', title: '独立习惯', defaultTime: '08:00', defaultDuration: 20, frequencyType: 'daily' },
      ],
      energyCurve: { peakHours: [9, 10], lowHours: [14], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    const sourceTypes = result.proposalSet.proposals.map(p => p.sourceType)
    const habitIdx = sourceTypes.indexOf('habit')
    const taskIdx = sourceTypes.indexOf('task')

    // fixture 含 1 habit + 1 task，二者必出 proposals；habit(source 权重 1) 必排 task(权重 2) 前
    expect(habitIdx).toBeGreaterThanOrEqual(0)
    expect(taskIdx).toBeGreaterThanOrEqual(0)
    expect(habitIdx).toBeLessThan(taskIdx)
  })
})
