import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { tasksPlugin } from '../index'
import { createTasksHooks } from '../hooks'
import { taskTransitions, threadTransitions, findTransition } from '../transitions'

const MANIFEST_PATH = resolve(__dirname, '../manifest.yaml')

describe('T015: Tasks manifest.yaml 六区块完整性', () => {
  let manifestContent: string

  beforeAll(() => {
    manifestContent = readFileSync(MANIFEST_PATH, 'utf-8')
  })

  it('应包含 intent_triggers 区块 (A)', () => {
    expect(manifestContent).toContain('intent_triggers:')
  })

  it('应包含 lifecycle 区块 (B)', () => {
    expect(manifestContent).toContain('lifecycle:')
  })

  it('应包含 field_metadata 区块 (C)', () => {
    expect(manifestContent).toContain('field_metadata:')
  })

  it('应包含 list_actions 区块 (D)', () => {
    expect(manifestContent).toContain('list_actions:')
  })

  it('应包含 required_fields 区块 (E)', () => {
    expect(manifestContent).toContain('required_fields:')
  })

  it('应包含 subscribed_events 区块 (F)', () => {
    expect(manifestContent).toContain('subscribed_events:')
  })

  it('lifecycle 应包含 task 和 thread 两个对象定义', () => {
    // 验证 task 对象
    const taskMatch = manifestContent.match(/\btask:\s*\n\s+states:/)
    expect(taskMatch).not.toBeNull()
    // 验证 thread 对象
    const threadMatch = manifestContent.match(/\bthread:\s*\n\s+states:/)
    expect(threadMatch).not.toBeNull()
  })

  it('intent_triggers 应包含 /tasks 和 /threads 的 view_route', () => {
    expect(manifestContent).toMatch(/view_route:\s*\/tasks/)
    expect(manifestContent).toMatch(/view_route:\s*\/threads\/\[id\]/)
  })
})

describe('T016: Tasks hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入', async () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle|repository)/)
    expect(hooksContent).not.toMatch(/import.*[Rr]epository/)
  })

  it('createTasksHooks 工厂函数应从 hooks.ts 导出', () => {
    expect(typeof createTasksHooks).toBe('function')
  })

  it('createTasksHooks 应返回三个钩子函数', () => {
    const mockManifest = {
      id: 'tasks',
      version: '1.1.0',
      name: '任务管理',
      description: '',
      intent_triggers: [],
      lifecycle: {
        task: {
          states: ['todo', 'planned', 'in_progress', 'completed', 'archived'],
          initial_state: 'todo',
          transitions: [
            { from: null, to: 'todo', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
            { from: 'todo', to: 'planned', trigger: 'intent', action: 'plan', event_type: 'TaskPlanned' },
            { from: 'planned', to: 'in_progress', trigger: 'intent', action: 'start', event_type: 'TaskStarted' },
            { from: 'in_progress', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
            { from: 'completed', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'TaskArchived' },
          ],
          terminal_states: ['completed', 'archived'],
        },
        thread: {
          states: ['active', 'paused', 'completed', 'archived'],
          initial_state: 'active',
          transitions: [
            { from: null, to: 'active', trigger: 'intent', action: 'create', event_type: 'ThreadCreated' },
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
      required_fields: {},
      subscribed_events: ['ThreadCreated', 'ThreadPaused', 'ThreadResumed', 'ThreadCompleted', 'ThreadArchived', 'TaskCreated', 'TaskPlanned', 'TaskStarted', 'TaskCompleted', 'TaskArchived'],
    }
    const hooks = createTasksHooks(mockManifest as any)
    expect(typeof hooks.onValidate).toBe('function')
    expect(typeof hooks.onEvent).toBe('function')
    expect(typeof hooks.onActionSurfaceRequest).toBe('function')
  })

  it('onValidate 创建任务时 title 为空应返回错误', () => {
    const mockManifest = {
      id: 'tasks',
      version: '1.1.0',
      name: '任务管理',
      description: '',
      intent_triggers: [],
      lifecycle: {
        task: {
          states: ['todo', 'planned', 'in_progress', 'completed', 'archived'],
          initial_state: 'todo',
          transitions: [
            { from: null, to: 'todo', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
            { from: 'todo', to: 'planned', trigger: 'intent', action: 'plan', event_type: 'TaskPlanned' },
            { from: 'planned', to: 'in_progress', trigger: 'intent', action: 'start', event_type: 'TaskStarted' },
            { from: 'in_progress', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
            { from: 'completed', to: 'archived', trigger: 'intent', action: 'archive', event_type: 'TaskArchived' },
          ],
          terminal_states: ['completed', 'archived'],
        },
        thread: {
          states: ['active', 'paused', 'completed', 'archived'],
          initial_state: 'active',
          transitions: [
            { from: null, to: 'active', trigger: 'intent', action: 'create', event_type: 'ThreadCreated' },
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
      required_fields: {},
      subscribed_events: ['ThreadCreated', 'ThreadPaused', 'ThreadResumed', 'ThreadCompleted', 'ThreadArchived', 'TaskCreated', 'TaskPlanned', 'TaskStarted', 'TaskCompleted', 'TaskArchived'],
    }
    const { onValidate } = createTasksHooks(mockManifest as any)
    const result = onValidate(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: {}, confidence: 1, resolvedBy: 'template_form', createdAt: '' },
      { currentTime: '', currentDate: '', dayOfWeek: 1, timeOfDay: 'morning', energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' }, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [] } as any,
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
  })
})

describe('T017: Tasks transitions.ts 转换表验证', () => {
  it('taskTransitions 应有 6 条转换', () => {
    expect(Array.isArray(taskTransitions)).toBe(true)
    expect(taskTransitions.length).toBe(6)
  })

  it('threadTransitions 应有 5 条转换', () => {
    expect(Array.isArray(threadTransitions)).toBe(true)
    expect(threadTransitions.length).toBe(5)
  })

  it('taskTransitions: findTransition(null, "create") 返回 { to: "todo", eventType: "TaskCreated" }', () => {
    const t = findTransition(taskTransitions, null, 'create')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('todo')
    expect(t!.eventType).toBe('TaskCreated')
  })

  it('taskTransitions: findTransition("todo", "plan") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'todo', 'plan')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('planned')
    expect(t!.eventType).toBe('TaskPlanned')
  })

  it('taskTransitions: findTransition("in_progress", "complete") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'in_progress', 'complete')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('completed')
    expect(t!.eventType).toBe('TaskCompleted')
  })

  it('taskTransitions: findTransition("completed", "archive") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'completed', 'archive')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('archived')
    expect(t!.eventType).toBe('TaskArchived')
  })

  it('threadTransitions: findTransition(null, "create") 返回 { to: "active", eventType: "ThreadCreated" }', () => {
    const t = findTransition(threadTransitions, null, 'create')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('active')
    expect(t!.eventType).toBe('ThreadCreated')
  })

  it('threadTransitions: findTransition("active", "pause") 返回正确转换', () => {
    const t = findTransition(threadTransitions, 'active', 'pause')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('paused')
    expect(t!.eventType).toBe('ThreadPaused')
  })

  it('threadTransitions: findTransition("paused", "resume") 返回正确转换', () => {
    const t = findTransition(threadTransitions, 'paused', 'resume')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('active')
    expect(t!.eventType).toBe('ThreadResumed')
  })

  it('threadTransitions: findTransition("active", "complete") 返回正确转换', () => {
    const t = findTransition(threadTransitions, 'active', 'complete')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('completed')
    expect(t!.eventType).toBe('ThreadCompleted')
  })

  it('threadTransitions: findTransition("completed", "archive") 返回正确转换', () => {
    const t = findTransition(threadTransitions, 'completed', 'archive')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('archived')
    expect(t!.eventType).toBe('ThreadArchived')
  })
})

describe('T018: Tasks index.ts 插件入口', () => {
  it('tasksPlugin.manifest 应存在', () => {
    expect(tasksPlugin.manifest).toBeDefined()
  })

  it('tasksPlugin.onValidate 应为函数', () => {
    expect(typeof tasksPlugin.onValidate).toBe('function')
  })

  it('tasksPlugin.onEvent 应为函数', () => {
    expect(typeof tasksPlugin.onEvent).toBe('function')
  })

  it('tasksPlugin.onActionSurfaceRequest 应为函数', () => {
    expect(typeof tasksPlugin.onActionSurfaceRequest).toBe('function')
  })

  it('manifest.domainId 应为 tasks', () => {
    expect(tasksPlugin.manifest.domainId).toBe('tasks')
  })
})
