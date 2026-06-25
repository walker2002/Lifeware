/**
 * @file migration.test
 * @brief T7 — tasks.ts 迁移到业务事实写入口的行为测试
 *
 * 验证违宪写法已消除、改走写入口：
 *  - updateTask(priority) → 经 service.execute 单事务聚合写（不逐字段、不直写 repo.update，
 *    修复「逐字段 service.update 无事务」半截改动 bug）
 *  - updateThread(name) → 同走 service.execute 单事务聚合写（objectType='thread'，
 *    与 updateTask 同病同修）
 *  - completeTask → [025] D3 起全走 Orchestrator（submitDynamicIntent），字段+taskId
 *    透传，cascadeCheck 在 Orchestrator 内执行（不再直调 mutation service.execute）
 *  - promoteToThread → 经 service.execute 聚合事务（create thread + 迁子任务 + 删原任务），
 *    不直写 repo.update(status='deleted')
 *  - deleteThread → 经 submitDynamicIntent(SM)，不 repo.delete 硬删
 *
 * 通过 mock createTasksMutationService / submitDynamicIntent / Repository 隔离 DB，
 * 断言「走的路径」而非数据落库细节。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock 写入口服务工厂（拦截 service.update / service.execute） ─────
const updateMock = vi.fn()
const executeMock = vi.fn()
vi.mock('../mutation-service', () => ({
  createTasksMutationService: () => ({
    update: updateMock,
    execute: executeMock,
  }),
}))

// ─── Mock submitDynamicIntent（deleteThread 走 SM 路径） ─────────────
const submitDynamicIntentMock = vi.fn()
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: (...args: unknown[]) => submitDynamicIntentMock(...args),
}))

// ─── Mock Repository（隔离 DB） ──────────────────────────────────────
const taskFindByIdMock = vi.fn()
const taskFindByParentMock = vi.fn()
vi.mock('@/domains/tasks/repository/task', () => ({
  TaskRepository: vi.fn(function (this: any) {
    this.findById = taskFindByIdMock
    this.findByParent = taskFindByParentMock
    this.findByUserId = vi.fn()
  }),
}))
const threadFindByIdMock = vi.fn()
vi.mock('@/domains/tasks/repository/thread', () => ({
  ThreadRepository: vi.fn(function (this: any) {
    this.findById = threadFindByIdMock
  }),
}))

import {
  updateTask,
  updateThread,
  completeTask,
  promoteToThread,
  deleteThread,
} from '@/app/actions/tasks'

describe('T7 tasks.ts 迁移 — 写入口路径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMock.mockResolvedValue({ success: true })
    executeMock.mockResolvedValue({ success: true, object: undefined, objects: {} })
    submitDynamicIntentMock.mockResolvedValue({ success: true, object: { id: 'thread-1' } })
  })

  it('updateTask(priority) 经 service.execute 单事务聚合写（不逐字段、不直写 repo.update）', async () => {
    taskFindByIdMock.mockResolvedValue({ id: 'task-1', priority: 'high' })

    await updateTask('task-1', { priority: 'high' } as any)

    // 经写入口 execute 单事务聚合写（修复逐字段无事务 bug），objectType='task'
    expect(executeMock).toHaveBeenCalledTimes(1)
    const [intent] = executeMock.mock.calls[0]
    expect(intent.objectType).toBe('task')
    expect(intent.targetId).toBe('task-1')
    // priority 作为单个 field step（聚合写，非逐字段多次 update）
    expect(intent.steps.map((s: any) => s.field)).toEqual(['priority'])
    // 不再走逐字段 service.update
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('updateThread(name) 经 service.execute 单事务聚合写（objectType=thread，不逐字段）', async () => {
    threadFindByIdMock.mockResolvedValue({ id: 'thread-1', name: '新名称' })

    await updateThread('thread-1', { name: '新名称' } as any)

    // 经写入口 execute 单事务聚合写，objectType='thread'
    expect(executeMock).toHaveBeenCalledTimes(1)
    const [intent] = executeMock.mock.calls[0]
    expect(intent.objectType).toBe('thread')
    expect(intent.targetId).toBe('thread-1')
    // name 作为单个 field step（聚合写，非逐字段多次 update）
    expect(intent.steps.map((s: any) => s.field)).toEqual(['name'])
    // 不再走逐字段 service.update
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('completeTask 全走 Orchestrator（submitDynamicIntent），字段+taskId 透传（[025] D3）', async () => {
    // [025] D3：completeTask 不再直调 mutation service.execute，改走 submitDynamicIntent
    // → cascadeCheck 在 Orchestrator 内执行；字段+状态经 executeFieldStateWrite 原子写。
    // mutation service 的字段+状态原子写由 executeFieldStateWrite 回调保证（Task 2 覆盖），
    // 此处仅验证 completeTask 透传到 Orchestrator 的入参正确。
    submitDynamicIntentMock.mockResolvedValue({
      success: true,
      object: { id: 'task-1', status: 'completed' },
    })

    const result = await completeTask('task-1', { actualDuration: 30, notes: '完成' })

    // 走 submitDynamicIntent（不再走 mutation service.execute）
    expect(submitDynamicIntentMock).toHaveBeenCalledTimes(1)
    expect(executeMock).not.toHaveBeenCalled()
    // 入参：domain='tasks', action='completeTask', fields 含 taskId + 业务字段
    const [domain, action, fields] = submitDynamicIntentMock.mock.calls[0]
    expect(domain).toBe('tasks')
    expect(action).toBe('completeTask')
    expect(fields).toMatchObject({ taskId: 'task-1', actualDuration: 30, notes: '完成' })
    // 返回判别联合 ok 分支
    expect(result).toEqual({ status: 'ok', task: { id: 'task-1', status: 'completed' } })
  })

  it('promoteToThread 经 service.execute 聚合事务（create thread + 迁子任务 + 删原任务）', async () => {
    taskFindByIdMock.mockResolvedValue({ id: 'task-1', title: '原任务' })
    taskFindByParentMock.mockResolvedValue([
      { id: 'sub-1' },
      { id: 'sub-2' },
    ])
    executeMock.mockResolvedValue({
      success: true,
      object: { id: 'task-1', status: 'deleted' },
      objects: { newThread: { id: 'thread-new', name: '原任务' } },
    })

    const result = await promoteToThread('task-1')

    expect(executeMock).toHaveBeenCalledTimes(1)
    const [intent] = executeMock.mock.calls[0]
    // 含 create(thread) 步 + delete(task) 步
    const createStep = intent.steps.find((s: any) => s.action === 'create' && s.objectType === 'thread')
    const deleteStep = intent.steps.find((s: any) => s.action === 'delete' && s.objectType === 'task')
    expect(createStep).toBeDefined()
    expect(deleteStep).toBeDefined()
    // 每个子任务一个 field:threadId 步，valueFromLastObject=true
    const fieldSteps = intent.steps.filter((s: any) => s.kind === 'field' && s.field === 'threadId')
    expect(fieldSteps).toHaveLength(2)
    expect(fieldSteps.every((s: any) => s.valueFromLastObject === true)).toBe(true)
    // 顺序：create 先于迁子任务，迁子任务先于删原任务
    const idxOf = (pred: (s: any) => boolean) => intent.steps.findIndex(pred)
    expect(idxOf((s: any) => s.action === 'create')).toBeLessThan(idxOf((s: any) => s.kind === 'field'))
    expect(idxOf((s: any) => s.kind === 'field')).toBeLessThan(idxOf((s: any) => s.action === 'delete'))
    // 返回新建主线
    expect(result.id).toBe('thread-new')
  })

  it('deleteThread 经 submitDynamicIntent(SM)，不 repo.delete 硬删', async () => {
    await deleteThread('thread-1')

    expect(submitDynamicIntentMock).toHaveBeenCalledTimes(1)
    expect(submitDynamicIntentMock).toHaveBeenCalledWith('tasks', 'deleteThread', { threadId: 'thread-1' })
  })
})
