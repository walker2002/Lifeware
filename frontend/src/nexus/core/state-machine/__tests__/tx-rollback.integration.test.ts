/**
 * @file tx-rollback.integration
 * @brief 事务回滚集成测试（T4 — GenericRepo tx 管道）
 *
 * 对接真实 Docker PostgreSQL，验证：
 * 1. updateFields 在事务内成功后，若同事务后续步骤抛错，整体回滚（字段未残留）。
 * 2. SM.execute 接收 tx 句柄后，其 repo 写操作在同一事务内执行，
 *    事务回滚时状态转换不落库。
 *
 * 这是 TDD 先写的失败测试：当前 updateFields 尚未实现、SM.execute 尚未接 tx，
 * 预期本文件在实现前为红。
 */

import { describe, it, expect, afterAll } from 'vitest'
import { db, type DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { LifecycleDefinition } from '@/usom/types/domain-types'

/** 测试用户 ID（任意稳定 UUID） */
const TEST_USER = '00000000-0000-0000-0000-000000000001' as const

/** task 生命周期（与 generic-state-machine.test 保持一致） */
const taskLifecycle: LifecycleDefinition = {
  states: ['draft', 'active', 'completed', 'archived'],
  initial_state: 'draft',
  transitions: [
    { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'TaskCreated' },
    { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'TaskActivated' },
    { from: 'active', to: 'completed', trigger: 'intent', action: 'complete', event_type: 'TaskCompleted' },
  ],
  terminal_states: ['archived'],
}

/** 极简 mock eventBus */
const eventBus: EventBus = { publish: () => {} } as unknown as EventBus

/** mock eventRepo（不接 tx，仅记录调用） */
const appended: unknown[] = []
const eventRepo: ISystemEventRepository = {
  append: async (event: unknown) => { appended.push(event) },
  findByUserInRange: async () => [],
  findUnprocessed: async () => [],
  markProcessed: async () => {},
} as unknown as ISystemEventRepository

/** 清理：删除本次测试创建的所有 task 行 */
async function cleanupTask(taskId: string) {
  try {
    await db.delete(s.tasks).where(eq(s.tasks.id, taskId))
  } catch {
    /* 忽略 */
  }
}

afterAll(async () => {
  // 兜底清理可能残留的测试数据（按 userId）
  try {
    await db.delete(s.tasks).where(eq(s.tasks.userId, TEST_USER))
  } catch {
    /* 忽略 */
  }
})

describe('GenericRepo tx 管道 — 集成测试（真实 PostgreSQL）', () => {
  it('updateFields 在事务内成功、事务随后抛错 → 字段更新回滚，DB 无脏数据', async () => {
    const taskRepo = new TaskRepository()
    const threadRepo = new ThreadRepository()
    // 与生产 (app/actions/intent.ts) 一致：adapter 结构类型与具名 Repository 间存在
    // Task↔Record 隐性摩擦（预存债），生产用 as any 绕过；测试对齐。
    const repos = createTasksGenericRepo({ taskRepo: taskRepo as any, threadRepo: threadRepo as any })
    const taskRepoAdapter = repos['task']!

    // 1. 先在事务外创建一条 task
    const created = await taskRepo.create(
      { title: '原始标题', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const taskId = created.id

    try {
      // 2. 在事务内 updateFields 改标题（成功），随后人为抛错
      await expect(
        db.transaction(async (tx: DbClient) => {
          // [TD-003] T2 临时兼容：tasks 域未实施 OCC，传 0 即可（透传给底层 repo）
          await taskRepoAdapter.updateFields(taskId, { title: '事务内修改的标题' }, TEST_USER, 0, tx)
          // 模拟后续状态转换步骤失败
          throw new Error('模拟后续步骤失败，触发整体回滚')
        }),
      ).rejects.toThrow('模拟后续步骤失败')

      // 3. 事务外复查：标题应保持原值（未被事务内的修改污染）
      const after = await taskRepo.findById(taskId, TEST_USER)
      expect(after).not.toBeNull()
      expect(after!.title).toBe('原始标题')
    } finally {
      await cleanupTask(taskId)
    }
  })

  it('updateFields 单条 UPDATE 成功落库（无事务、正常路径）', async () => {
    const taskRepo = new TaskRepository()
    const threadRepo = new ThreadRepository()
    // 与生产 (app/actions/intent.ts) 一致：adapter 结构类型与具名 Repository 间存在
    // Task↔Record 隐性摩擦（预存债），生产用 as any 绕过；测试对齐。
    const repos = createTasksGenericRepo({ taskRepo: taskRepo as any, threadRepo: threadRepo as any })
    const taskRepoAdapter = repos['task']!

    const created = await taskRepo.create(
      { title: '待更新', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const taskId = created.id

    try {
      const updated = await taskRepoAdapter.updateFields(
        taskId,
        { title: '已更新', description: '新描述' },
        TEST_USER,
        0,
      )
      expect(updated.title).toBe('已更新')
      expect(updated.description).toBe('新描述')

      // 复查 DB
      const after = await taskRepo.findById(taskId, TEST_USER)
      expect(after!.title).toBe('已更新')
      expect(after!.description).toBe('新描述')
    } finally {
      await cleanupTask(taskId)
    }
  })

  it('SM.execute 接收 tx 句柄：事务回滚时状态转换不落库', async () => {
    const taskRepo = new TaskRepository()
    const threadRepo = new ThreadRepository()
    // 与生产 (app/actions/intent.ts) 一致：adapter 结构类型与具名 Repository 间存在
    // Task↔Record 隐性摩擦（预存债），生产用 as any 绕过；测试对齐。
    const repos = createTasksGenericRepo({ taskRepo: taskRepo as any, threadRepo: threadRepo as any })

    // 用激活的 task 来测试状态转换（draft → active 需要先有 draft）
    const created = await taskRepo.create(
      { title: '状态机事务测试', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const taskId = created.id

    const sm = createGenericStateMachine({
      getRepository: (_objectType: string) => repos['task']!,
      eventRepo,
      getLifecycle: () => taskLifecycle,
      domainId: 'tasks',
    })

    try {
      // 在事务内执行状态转换 activate，随后抛错
      await expect(
        db.transaction(async (tx: DbClient) => {
          await sm.execute(
            {
              id: 'prop-1' as never,
              intentId: 'intent-1' as never,
              action: 'activate',
              targetObject: { type: 'task', id: taskId },
              payload: {},
            } as never,
            eventBus,
            TEST_USER,
            tx,
          )
          throw new Error('状态转换后抛错，触发回滚')
        }),
      ).rejects.toThrow('状态转换后抛错')

      // 事务外复查：status 应仍为初始值 'todo'（task.create 默认），未被改成 active
      const after = await taskRepo.findById(taskId, TEST_USER)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('todo')
    } finally {
      await cleanupTask(taskId)
    }
  })
})
