import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'tasks',
      version: '1.1.0',
      name: '任务管理',
      description: '任务与项目管理',
      intent_triggers: [],
      lifecycle: {
        task: {
          states: ['draft', 'active', 'in_progress', 'completed', 'archived'],
          initial_state: 'draft',
          transitions: [
            { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
            { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'TaskActivated' },
            { from: 'active', to: 'in_progress', trigger: 'intent', action: 'start', event_type: 'TaskStarted' },
            { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
            { from: 'active', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'TaskArchived' },
          ],
          terminal_states: ['completed', 'archived'],
        },
        project: {
          states: ['planning', 'active', 'paused', 'completed', 'archived'],
          initial_state: 'planning',
          transitions: [
            { from: null, to: 'planning', trigger: 'intent', action: 'create', event_type: 'ProjectCreated' },
            { from: 'planning', to: 'active', trigger: 'intent', action: 'activate', event_type: 'ProjectActivated' },
            { from: 'active', to: 'paused', trigger: 'intent', action: 'pause', event_type: 'ProjectPaused' },
            { from: 'paused', to: 'active', trigger: 'intent', action: 'resume', event_type: 'ProjectResumed' },
            { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'ProjectCompleted' },
            { from: 'completed', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'ProjectArchived' },
          ],
          terminal_states: ['archived'],
        },
      },
      field_metadata: {},
      list_actions: [],
      required_fields: { createTask: [
        { name: 'title', label: '标题', type: 'text', required: true },
      ] },
      subscribed_events: ['TimeboxStarted', 'TimeboxEnded', 'ProjectCreated', 'ProjectActivated', 'ProjectPaused', 'ProjectResumed', 'ProjectCompleted', 'ProjectArchived', 'TaskCreated', 'TaskActivated', 'TaskCompleted', 'TaskArchived'],
    },
  }),
}))

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

  it('创建项目时名称必填', async () => {
    const intent = makeIntent({ action: 'createProject', fields: {} })
    const snapshot = makeSnapshot()
    const result = await onValidate(intent, snapshot as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('项目名称必填')
    }
  })

  it('创建项目时名称不为空则通过', async () => {
    const intent = makeIntent({ action: 'createProject', fields: { name: '测试项目' } })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Passed')
  })

  it('创建任务时标题必填', async () => {
    const intent = makeIntent({ action: 'createTask', fields: {} })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
  })

  it('创建任务时预估时长必须大于 0', async () => {
    const intent = makeIntent({ action: 'createTask', fields: { title: '测试', estimatedDuration: 0 } })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('预估时长必须大于 0')
    }
  })

  it('项目状态 active → paused 是合法转换', async () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'active',
        targetStatus: 'paused',
        targetType: 'project',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Passed')
  })

  it('completed 状态的项目不能重新激活', async () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'completed',
        targetStatus: 'active',
        targetType: 'project',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors[0]).toContain('completed')
    }
  })

  it('任务状态 active → in_progress 是合法转换', async () => {
    const intent = makeIntent({
      action: 'updateTask',
      fields: {
        currentStatus: 'active',
        targetStatus: 'in_progress',
        targetType: 'task',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Passed')
  })
})
