import { describe, it, expect } from 'vitest'
import { tasksPlugin } from '../index'
import type { StructuredIntent } from '@/usom/types/objects'

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'int-1',
    intentionId: 'intent-1',
    targetDomain: 'tasks',
    action: 'createProject',
    fields: {},
    confidence: 1,
    resolvedBy: 'template_form',
    createdAt: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

function makeSnapshot(overrides = {}) {
  return {
    currentTime: '2026-05-12T08:00:00Z',
    currentDate: '2026-05-12',
    dayOfWeek: 2,
    timeOfDay: 'morning',
    energyState: {
      inferredLevel: 7,
      calibratedLevel: null,
      activeLevel: 7,
      source: 'system',
    },
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    currentTimebox: null,
    upcomingTimeboxes: [],
    pendingIntentions: [],
    ...overrides,
  }
}

describe('tasksPlugin.onValidate', () => {
  const { onValidate } = tasksPlugin

  it('创建项目时名称必填', () => {
    const intent = makeIntent({ action: 'createProject', fields: {} })
    const snapshot = makeSnapshot()
    const result = onValidate(intent, snapshot as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('项目名称必填')
  })

  it('创建项目时名称不为空则通过', () => {
    const intent = makeIntent({ action: 'createProject', fields: { name: '测试项目' } })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })

  it('创建任务时标题必填', () => {
    const intent = makeIntent({ action: 'createTask', fields: {} })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('任务标题必填')
  })

  it('创建任务时预估时长必须大于 0', () => {
    const intent = makeIntent({ action: 'createTask', fields: { title: '测试', estimatedDuration: 0 } })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('预估时长必须大于 0')
  })

  it('项目状态 active → paused 是合法转换', () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'active',
        targetStatus: 'paused',
        targetType: 'project',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })

  it('completed 状态的项目不能重新激活', () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'completed',
        targetStatus: 'active',
        targetType: 'project',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('completed')
  })

  it('任务状态 active → in_progress 是合法转换', () => {
    const intent = makeIntent({
      action: 'updateTask',
      fields: {
        currentStatus: 'active',
        targetStatus: 'in_progress',
        targetType: 'task',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })
})
