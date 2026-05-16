import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { tasksPlugin } from '../index'
import { onValidate, onEvent, onActionSurfaceRequest } from '../hooks'
import { taskTransitions, projectTransitions, findTransition } from '../transitions'

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

  it('lifecycle 应包含 task 和 project 两个对象定义', () => {
    // 验证 task 对象
    const taskMatch = manifestContent.match(/\btask:\s*\n\s+states:/)
    expect(taskMatch).not.toBeNull()
    // 验证 project 对象
    const projectMatch = manifestContent.match(/\bproject:\s*\n\s+states:/)
    expect(projectMatch).not.toBeNull()
  })

  it('intent_triggers 应包含 view_list 和 view_detail 的 view_route', () => {
    expect(manifestContent).toMatch(/view_route:\s*\/projects/)
  })
})

describe('T016: Tasks hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入', async () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle|repository)/)
    expect(hooksContent).not.toMatch(/import.*[Rr]epository/)
  })

  it('onValidate 应从 hooks.ts 导出', () => {
    expect(typeof onValidate).toBe('function')
  })

  it('onEvent 应从 hooks.ts 导出', () => {
    expect(typeof onEvent).toBe('function')
  })

  it('onActionSurfaceRequest 应从 hooks.ts 导出', () => {
    expect(typeof onActionSurfaceRequest).toBe('function')
  })

  it('onValidate 创建任务时 title 为空应返回错误', () => {
    const result = onValidate(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: {}, confidence: 1, resolvedBy: 'template_form', createdAt: '' },
      { currentTime: '', currentDate: '', dayOfWeek: 1, timeOfDay: 'morning', energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' }, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [] } as any,
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('任务标题必填')
  })
})

describe('T017: Tasks transitions.ts 转换表验证', () => {
  it('taskTransitions 应有 4 条转换', () => {
    expect(Array.isArray(taskTransitions)).toBe(true)
    expect(taskTransitions.length).toBe(4)
  })

  it('projectTransitions 应有 6 条转换', () => {
    expect(Array.isArray(projectTransitions)).toBe(true)
    expect(projectTransitions.length).toBe(6)
  })

  it('taskTransitions: findTransition(null, "create") 返回 { to: "draft", eventType: "TaskCreated" }', () => {
    const t = findTransition(taskTransitions, null, 'create')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('draft')
    expect(t!.eventType).toBe('TaskCreated')
  })

  it('taskTransitions: findTransition("draft", "activate") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'draft', 'activate')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('active')
    expect(t!.eventType).toBe('TaskActivated')
  })

  it('taskTransitions: findTransition("active", "complete") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'active', 'complete')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('completed')
    expect(t!.eventType).toBe('TaskCompleted')
  })

  it('taskTransitions: findTransition("active", "archive") 返回正确转换', () => {
    const t = findTransition(taskTransitions, 'active', 'archive')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('archived')
    expect(t!.eventType).toBe('TaskArchived')
  })

  it('projectTransitions: findTransition(null, "create") 返回 { to: "planning", eventType: "ProjectCreated" }', () => {
    const t = findTransition(projectTransitions, null, 'create')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('planning')
    expect(t!.eventType).toBe('ProjectCreated')
  })

  it('projectTransitions: findTransition("planning", "activate") 返回正确转换', () => {
    const t = findTransition(projectTransitions, 'planning', 'activate')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('active')
    expect(t!.eventType).toBe('ProjectActivated')
  })

  it('projectTransitions: findTransition("active", "pause") 返回正确转换', () => {
    const t = findTransition(projectTransitions, 'active', 'pause')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('paused')
    expect(t!.eventType).toBe('ProjectPaused')
  })

  it('projectTransitions: findTransition("paused", "resume") 返回正确转换', () => {
    const t = findTransition(projectTransitions, 'paused', 'resume')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('active')
    expect(t!.eventType).toBe('ProjectResumed')
  })

  it('projectTransitions: findTransition("active", "complete") 返回正确转换', () => {
    const t = findTransition(projectTransitions, 'active', 'complete')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('completed')
    expect(t!.eventType).toBe('ProjectCompleted')
  })

  it('projectTransitions: findTransition("completed", "archive") 返回正确转换', () => {
    const t = findTransition(projectTransitions, 'completed', 'archive')
    expect(t).not.toBeNull()
    expect(t!.to).toBe('archived')
    expect(t!.eventType).toBe('ProjectArchived')
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
