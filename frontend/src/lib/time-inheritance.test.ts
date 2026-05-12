import { describe, it, expect } from 'vitest'
import { resolveTaskTime } from '../domains/projects/time-inheritance'
import type { Task } from '../usom/types/objects'
import type { Project } from '../usom/types/objects'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    status: 'draft',
    title: '测试任务',
    priority: 'medium',
    energyRequired: 'medium',
    estimatedDuration: 60,
    tags: [],
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    ...overrides,
  } as Task
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: '测试项目',
    status: 'active',
    tags: [],
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

describe('resolveTaskTime', () => {
  it('子任务显式设置时间时，应返回子任务自身值', () => {
    const task = makeTask({ earliestTime: '07:00' })
    const parent = makeTask({ earliestTime: '08:00' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('07:00')
  })

  it('子任务未设时间时，应从父任务继承', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: '08:00' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('08:00')
  })

  it('子任务和父任务都未设时间时，应从项目继承', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('09:00')
  })

  it('所有层级都未设时间时，应返回 undefined', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: undefined })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBeUndefined()
  })

  it('父任务 earliestTime 为空字符串时，子任务不应继承空字符串', () => {
    const task = makeTask({ earliestTime: undefined })
    const parent = makeTask({ earliestTime: '' })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, parent, project)
    expect(result.earliestTime).toBe('09:00')
  })

  it('应正确解析所有时间字段', () => {
    const task = makeTask({
      earliestTime: undefined,
      latestStartTime: undefined,
      defaultTime: undefined,
      defaultDuration: undefined,
    })
    const parent = makeTask({
      earliestTime: '08:00',
      latestStartTime: '18:00',
      defaultTime: '09:00',
      defaultDuration: 45,
    })

    const result = resolveTaskTime(task, parent, null)
    expect(result).toEqual({
      earliestTime: '08:00',
      latestStartTime: '18:00',
      defaultTime: '09:00',
      defaultDuration: 45,
    })
  })

  it('parent 为 null/undefined 时不应崩溃', () => {
    const task = makeTask({ earliestTime: undefined })
    const project = makeProject({ defaultEarliestTime: '09:00' })

    const result = resolveTaskTime(task, null, project)
    expect(result.earliestTime).toBe('09:00')
  })
})
