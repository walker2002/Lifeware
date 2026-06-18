/**
 * @file generic-repo-adapter.test
 * @brief Tasks 域 GenericRepo 适配器单元测试
 */

import { describe, it, expect, vi } from 'vitest'
import { createTasksGenericRepo } from '../generic-repo-adapter'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── Mock 仓储工厂 ──────────────────────────────────────────────

function makeMockRepo() {
  return {
    findById: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateFields: vi.fn(),
  }
}

const userId = 'user-001' as USOM_ID

// ─── 测试 ────────────────────────────────────────────────────────

describe('createTasksGenericRepo', () => {
  it('返回包含 task 和 thread 两个键的映射', () => {
    const taskRepo = makeMockRepo()
    const threadRepo = makeMockRepo()
    const repos = createTasksGenericRepo({ taskRepo, threadRepo })

    expect(repos).toHaveProperty('task')
    expect(repos).toHaveProperty('thread')
    expect(Object.keys(repos)).toHaveLength(2)
  })

  describe('task adapter', () => {
    it('findById 委托到 taskRepo.findById', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const expected = { id: 't-1', status: 'todo' }
      taskRepo.findById.mockResolvedValue(expected)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.task.findById('t-1' as USOM_ID, userId)

      expect(taskRepo.findById).toHaveBeenCalledWith('t-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('save 委托到 taskRepo.save', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const obj = { id: 't-1', status: 'todo', title: '测试任务' }
      taskRepo.save.mockResolvedValue(undefined)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      await repos.task.save(obj, userId)

      expect(taskRepo.save).toHaveBeenCalledWith(obj, userId, undefined)
    })

    it('create 委托到 taskRepo.create', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const fields = { title: '新任务', priority: 'medium' }
      const created = { id: 't-2', status: 'todo', ...fields }
      taskRepo.create.mockResolvedValue(created)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.task.create(fields, userId)

      expect(taskRepo.create).toHaveBeenCalledWith(fields, userId, undefined)
      expect(result).toEqual(created)
    })

    it('updateStatus 委托到 taskRepo.updateStatus', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const updated = { id: 't-1', status: 'completed' }
      taskRepo.updateStatus.mockResolvedValue(updated)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.task.updateStatus('t-1' as USOM_ID, 'completed', userId)

      expect(taskRepo.updateStatus).toHaveBeenCalledWith('t-1', 'completed', userId, undefined)
      expect(result).toEqual(updated)
    })
  })

  describe('thread adapter', () => {
    it('findById 委托到 threadRepo.findById', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const expected = { id: 'th-1', status: 'active', name: '测试主线' }
      threadRepo.findById.mockResolvedValue(expected)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.thread.findById('th-1' as USOM_ID, userId)

      expect(threadRepo.findById).toHaveBeenCalledWith('th-1', userId, undefined)
      expect(result).toEqual(expected)
    })

    it('save 委托到 threadRepo.save', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const obj = { id: 'th-1', status: 'active', name: '主线' }
      threadRepo.save.mockResolvedValue(undefined)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      await repos.thread.save(obj, userId)

      expect(threadRepo.save).toHaveBeenCalledWith(obj, userId, undefined)
    })

    it('create 委托到 threadRepo.create', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const fields = { name: '新主线' }
      const created = { id: 'th-2', status: 'active', ...fields }
      threadRepo.create.mockResolvedValue(created)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.thread.create(fields, userId)

      expect(threadRepo.create).toHaveBeenCalledWith(fields, userId, undefined)
      expect(result).toEqual(created)
    })

    it('updateStatus 委托到 threadRepo.updateStatus', async () => {
      const taskRepo = makeMockRepo()
      const threadRepo = makeMockRepo()
      const updated = { id: 'th-1', status: 'completed' }
      threadRepo.updateStatus.mockResolvedValue(updated)

      const repos = createTasksGenericRepo({ taskRepo, threadRepo })
      const result = await repos.thread.updateStatus('th-1' as USOM_ID, 'completed', userId)

      expect(threadRepo.updateStatus).toHaveBeenCalledWith('th-1', 'completed', userId, undefined)
      expect(result).toEqual(updated)
    })
  })

  it('task 和 thread 适配器互不干扰', async () => {
    const taskRepo = makeMockRepo()
    const threadRepo = makeMockRepo()
    taskRepo.findById.mockResolvedValue({ id: 't-1', type: 'task' })
    threadRepo.findById.mockResolvedValue({ id: 'th-1', type: 'thread' })

    const repos = createTasksGenericRepo({ taskRepo, threadRepo })
    const taskResult = await repos.task.findById('t-1' as USOM_ID, userId)
    const threadResult = await repos.thread.findById('th-1' as USOM_ID, userId)

    expect(taskRepo.findById).toHaveBeenCalledTimes(1)
    expect(threadRepo.findById).toHaveBeenCalledTimes(1)
    expect(taskResult).toEqual({ id: 't-1', type: 'task' })
    expect(threadResult).toEqual({ id: 'th-1', type: 'thread' })
  })
})
