import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'okrs',
      version: '1.0.0',
      name: 'OKR管理',
      description: '目标与关键结果管理',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {
        okrType: { type: 'enum', label: 'OKR类型', required: false, options: ['visionary', 'committed'] },
      },
      list_actions: [],
      required_fields: { createObjective: [
        { name: 'title', label: '标题', type: 'text', required: true },
      ] },
      subscribed_events: ['ObjectiveCreated', 'ObjectiveActivated', 'ObjectivePaused', 'ObjectiveResumed', 'ObjectiveCompleted', 'ObjectiveDiscarded', 'ObjectiveArchived', 'KeyResultUpdated', 'KeyResultCompleted', 'KeyResultProgressUpdated', 'TaskCompleted', 'HabitLogged'],
    },
  }),
}))

import { okrsPlugin } from '../index'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOMSnapshot, SystemEvent } from '@/usom/types/process'

function mockSnapshot(): USOMSnapshot {
  return {
    userId: 'test-user' as any,
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: new Date().toISOString() as any,
    currentDate: new Date().toISOString().slice(0, 10) as any,
    dayOfWeek: 1,
    timeOfDay: 'morning' as const,
    energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' },
    sourceSnapshotId: 'snap-id' as any,
  }
}

function makeIntent(action: string, fields: Record<string, unknown>): StructuredIntent {
  return {
    id: 'test-intent-id' as any,
    intentionId: 'test-intention-id' as any,
    targetDomain: 'objective',
    action,
    fields,
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: new Date().toISOString() as any,
  }
}

describe('OKR Domain Plugin', () => {
  describe('manifest', () => {
    it('应包含正确的 domainId', async () => {
      expect(okrsPlugin.manifest.domainId).toBe('okrs')
    })

    it('应订阅 OKR 和外部事件', async () => {
      const events = okrsPlugin.manifest.subscribedEvents
      expect(events).toContain('ObjectiveCreated')
      expect(events).toContain('ObjectiveActivated')
      expect(events).toContain('TaskCompleted')
      expect(events).toContain('HabitLogged')
    })
  })

  describe('onValidate', () => {
    it('createObjective 缺少 title 应校验失败', async () => {
      const result = await okrsPlugin.onValidate(makeIntent('createObjective', { title: '' }), mockSnapshot())
      expect(result.kind).toBe('Rejected')
      if (result.kind === 'Rejected') {
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })

    it('createObjective 有 title 应校验通过', async () => {
      const result = await okrsPlugin.onValidate(makeIntent('createObjective', { title: '提升产品质量' }), mockSnapshot())
      expect(result.kind).toBe('Passed')
    })

    it('createObjective title 超过 200 字符应校验失败', async () => {
      const result = await okrsPlugin.onValidate(makeIntent('createObjective', { title: 'x'.repeat(201) }), mockSnapshot())
      expect(result.kind).toBe('Rejected')
    })

    it('createKeyResult targetValue <= 0 应校验失败', async () => {
      const result = await okrsPlugin.onValidate(
        makeIntent('createKeyResult', { title: 'KR1', targetValue: 0, unit: '%' }),
        mockSnapshot(),
      )
      expect(result.kind).toBe('Rejected')
    })

    it('createKeyResult 缺少 unit 应校验失败', async () => {
      const result = await okrsPlugin.onValidate(
        makeIntent('createKeyResult', { title: 'KR1', targetValue: 100 }),
        mockSnapshot(),
      )
      expect(result.kind).toBe('Rejected')
    })

    it('createKeyResult 有效输入应校验通过', async () => {
      const result = await okrsPlugin.onValidate(
        makeIntent('createKeyResult', { title: 'KR1', targetValue: 100, unit: '%' }),
        mockSnapshot(),
      )
      expect(result.kind).toBe('Passed')
    })

    it('updateKeyResultProgress currentValue < 0 应校验失败', async () => {
      const result = await okrsPlugin.onValidate(
        makeIntent('updateKeyResultProgress', { keyResultId: 'kr-1', currentValue: -1 }),
        mockSnapshot(),
      )
      expect(result.kind).toBe('Rejected')
    })

    it('activateObjective 缺少 objectiveId 应校验失败', async () => {
      const result = await okrsPlugin.onValidate(
        makeIntent('activateObjective', {}),
        mockSnapshot(),
      )
      expect(result.kind).toBe('Rejected')
    })
  })

  describe('onEvent', () => {
    it('ObjectiveCreated 应返回创建建议', async () => {
      const event: SystemEvent = {
        id: 'e1' as any,
        type: 'ObjectiveCreated',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { title: '新目标' },
        snapshotId: 'snap' as any,
      }
      const result = await okrsPlugin.onEvent(event, mockSnapshot())
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions[0].actionType).toBe('review_okr')
    })

    it('ObjectiveCompleted 应返回完成指标', async () => {
      const event: SystemEvent = {
        id: 'e2' as any,
        type: 'ObjectiveCompleted',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: { title: '已完成的目标' },
        snapshotId: 'snap' as any,
      }
      const result = await okrsPlugin.onEvent(event, mockSnapshot())
      expect(result.metrics.length).toBeGreaterThan(0)
      expect(result.metrics[0].metricKey).toBe('objective_completed')
    })

    it('未订阅事件应返回空', async () => {
      const event: SystemEvent = {
        id: 'e3' as any,
        type: 'TaskCreated',
        occurredAt: new Date().toISOString() as any,
        triggeredBy: 'state_machine',
        payload: {},
        snapshotId: 'snap' as any,
      }
      const result = await okrsPlugin.onEvent(event, mockSnapshot())
      expect(result.metrics).toEqual([])
      expect(result.suggestions).toEqual([])
    })
  })
})
