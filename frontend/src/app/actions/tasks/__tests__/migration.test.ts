/**
 * @file migration.test
 * @brief T7 — tasks.ts 迁移到业务事实写入口的行为测试
 *
 * 验证违宪写法已消除、改走写入口：
 *  - updateTask(priority) → 经 service.update（字段执行器路径），不直写 repo.update
 *  - completeTask → 经 service.execute 单事务（字段先 + 状态后），不两阶段 repo.update
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

  it('updateTask(priority) 经 service.update（不直写 repo.update）', async () => {
    taskFindByIdMock.mockResolvedValue({ id: 'task-1', priority: 'high' })

    await updateTask('task-1', { priority: 'high' } as any)

    // 经写入口 update，objectType='task'，字段 priority
    expect(updateMock).toHaveBeenCalledWith(
      'task-1', 'priority', 'high', expect.any(String), 'tasks', 'task',
    )
  })

  it('updateThread(name) 经 service.update（objectType=thread）', async () => {
    threadFindByIdMock.mockResolvedValue({ id: 'thread-1', name: '新名称' })

    await updateThread('thread-1', { name: '新名称' } as any)

    expect(updateMock).toHaveBeenCalledWith(
      'thread-1', 'name', '新名称', expect.any(String), 'tasks', 'thread',
    )
  })

  it('completeTask 字段+状态在 service.execute 单事务内（先字段后状态）', async () => {
    executeMock.mockResolvedValue({
      success: true,
      object: { id: 'task-1', status: 'completed' },
    })

    await completeTask('task-1', { actualDuration: 30, notes: '完成' })

    // 经 execute，单次调用（单事务），不再两阶段 repo.update + submit
    expect(executeMock).toHaveBeenCalledTimes(1)
    const [intent] = executeMock.mock.calls[0]
    // 字段先于状态：字段步在前、状态步在后
    const fieldIdx = intent.steps.findIndex((s: any) => s.kind === 'field')
    const stateIdx = intent.steps.findIndex((s: any) => s.kind === 'state')
    expect(fieldIdx).toBeLessThan(stateIdx)
    // 状态步动作 = complete
    expect(intent.steps[stateIdx]).toMatchObject({ kind: 'state', action: 'complete' })
    // 字段步含 actualDuration / notes
    const fields = intent.steps.filter((s: any) => s.kind === 'field').map((s: any) => s.field)
    expect(fields).toEqual(expect.arrayContaining(['actualDuration', 'notes']))
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
