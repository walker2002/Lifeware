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
          states: ['todo', 'planned', 'in_progress', 'completed', 'archived', 'deleted'],
          initial_state: 'todo',
          transitions: [
            { from: null, to: 'todo', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
            { from: 'todo', to: 'planned', trigger: 'intent', action: 'plan', event_type: 'TaskPlanned' },
            { from: 'planned', to: 'in_progress', trigger: 'intent', action: 'start', event_type: 'TaskStarted' },
            { from: 'todo', to: 'in_progress', trigger: 'intent', action: 'start', event_type: 'TaskStarted' },
            { from: 'in_progress', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
            { from: 'completed', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'TaskArchived' },
          ],
          terminal_states: ['completed', 'archived', 'deleted'],
        },
        thread: {
          states: ['planning', 'active', 'paused', 'completed', 'archived'],
          initial_state: 'planning',
          transitions: [
            { from: null, to: 'planning', trigger: 'intent', action: 'create', event_type: 'ThreadCreated' },
            { from: 'planning', to: 'active', trigger: 'intent', action: 'activate', event_type: 'ThreadActivated' },
            { from: 'active', to: 'paused', trigger: 'intent', action: 'pause', event_type: 'ThreadPaused' },
            { from: 'paused', to: 'active', trigger: 'intent', action: 'resume', event_type: 'ThreadResumed' },
            { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'ThreadCompleted' },
            { from: 'completed', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'ThreadArchived' },
          ],
          terminal_states: ['archived'],
        },
      },
      field_metadata: {},
      list_actions: [],
      required_fields: { createTask: [
        { name: 'title', label: '标题', type: 'text', required: true },
      ] },
      rules: [
        { id: 'task_action_fields_valid', phase: 'submit', fields: [], message: '任务/主线字段校验失败' },
        { id: 'task_estimated_duration_positive', phase: 'both', fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
        { id: 'task_estimated_duration_max', phase: 'both', fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
        { id: 'task_priority_valid', phase: 'both', fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
        { id: 'task_energy_required_valid', phase: 'both', fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
        { id: 'task_due_date_format', phase: 'both', fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
        { id: 'thread_color_format', phase: 'both', fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
      ],
      subscribed_events: ['ThreadCreated', 'ThreadPaused', 'ThreadResumed', 'ThreadCompleted', 'ThreadArchived', 'TaskCreated', 'TaskStarted', 'TaskCompleted', 'TaskArchived'],
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
    userId: 'u',
    ...overrides,
  }
}

describe('tasksPlugin.onValidate', () => {
  const { onValidate } = tasksPlugin

  it('创建主线时名称必填', async () => {
    const intent = makeIntent({ action: 'createThread', fields: {} })
    const snapshot = makeSnapshot()
    const result = await onValidate(intent, snapshot as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('主线名称必填')
    }
  })

  it('创建主线时名称不为空则通过', async () => {
    const intent = makeIntent({ action: 'createThread', fields: { name: '测试主线' } })
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

  it('主线状态 active → paused 是合法转换', async () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'active',
        targetStatus: 'paused',
        targetType: 'thread',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Passed')
  })

  it('completed 状态的线程不能重新激活', async () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'completed',
        targetStatus: 'active',
        targetType: 'thread',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors[0]).toContain('completed')
    }
  })

  it('任务状态 planned → in_progress 是合法转换', async () => {
    const intent = makeIntent({
      action: 'updateTask',
      fields: {
        currentStatus: 'planned',
        targetStatus: 'in_progress',
        targetType: 'task',
      },
    })
    const result = await onValidate(intent, makeSnapshot() as any)
    expect(result.kind).toBe('Passed')
  })
})
