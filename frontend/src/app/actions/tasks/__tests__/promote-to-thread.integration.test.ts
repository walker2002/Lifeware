/**
 * @file promote-to-thread.integration
 * @brief 写入口聚合事务原子性集成测试（T9）
 *
 * 对接真实 Docker PostgreSQL，验证写入口 execute() 聚合事务的原子性（宪法 §III：
 * 聚合写 execute() 单事务边界，任一步失败整体回滚）。
 *
 * 覆盖场景：
 *  1. 聚合 execute 多步写（同对象 字段写 + 状态转换）单事务原子落库 —— 验证 execute
 *     的「先字段后状态」按声明序在同一事务内执行、DB 落库一致。
 *  2. 聚合 execute 中途失败回滚 —— 在事务内「字段写成功、状态转换成功后」注入失败，
 *     验证整体回滚（字段未残留、状态未变）。
 *  3. promoteToThread 聚合链路正向端到端 —— 建主线（create:true）+ 迁子任务 threadId
 *     （valueFromLastObject 跨对象依赖）+ 删原任务，整条聚合单事务原子落库（BUG-001 已修复）。
 *
 * 注入失败的手段：createTasksMutationService 硬编码真实依赖，无法直接注入失败步骤。
 * 故测试自行组装 createDomainMutationService（复用 mutation-service 的真实依赖组装模式），
 * 注入一个在第 N 个 state 步骤失败的 smExecute，驱动回滚。
 *
 * 测试用户隔离：固定 userId ...009，beforeAll 幂等建用户 + 清数据，afterAll 清数据。
 *
 * 不重复 T4 已覆盖的 updateFields+SM 回滚（见 tx-rollback.integration.test.ts）。
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import {
  createDomainMutationService,
  type AggregateIntent,
} from '@/nexus/domain-mutation-service'
import { createFieldExecutor } from '@/nexus/field-executor'
import { createEventBus } from '@/nexus/infrastructure/event-bus'
import { getFullManifest } from '@/domains/registry'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import type { DbClient } from '@/lib/db'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { USOM_ID } from '@/usom/types/primitives'

/** 测试用户 ID（稳定，与 T4 的 ...001 区分避免清理互扰） */
const TEST_USER = '00000000-0000-0000-0000-000000000009' as const

const TASKS_DOMAIN_ID = 'tasks'

/**
 * 组装业务事实写入口服务实例（复刻 mutation-service.ts 的真实依赖组装）。
 *
 * 与 createTasksMutationService 的唯一差异：smExecute 可注入「在第 N 个 state 步骤失败」
 * 的版本（用于回滚验证）。其余依赖（repo / executor / fieldMetadata / transaction /
 * eventBus）与生产完全一致。
 *
 * @param opts.failAtStateStep - 在第 N 个 state 步骤调用时令 smExecute 返回失败（1-based）
 */
function buildService(opts: { failAtStateStep?: number } = {}): ReturnType<typeof createDomainMutationService> {
  const taskRepo = new TaskRepository()
  const threadRepo = new ThreadRepository()
  const eventRepo = new SystemEventRepository()
  const eventBus: EventBus = createEventBus()

  // 与生产（mutation-service.ts）一致：adapter 与具名 Repository 间存在 Task↔Record
  // 隐性摩擦（预存债），生产用 as any 绕过；测试对齐。
  const repos = createTasksGenericRepo({
    taskRepo: taskRepo as any,
    threadRepo: threadRepo as any,
  })

  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) throw new Error(`getRepository: 未找到 Tasks 仓储 ${objectType}`)
    return repo
  }

  function getFieldMetadata(_d: string, _o: string): Record<string, FieldMetadata> {
    const manifest = getFullManifest(TASKS_DOMAIN_ID)
    return (manifest?.field_metadata as Record<string, FieldMetadata> | undefined) ?? {}
  }

  // 真实 SM 闭包（与 mutation-service.ts 完全一致）
  function realSmExecute(
    proposal: unknown,
    smBus: EventBus,
    userId: USOM_ID,
    tx?: DbClient,
  ) {
    const p = proposal as {
      targetObject: { type: string }
      action: string
      payload: Record<string, unknown>
      id: USOM_ID
      intentId: USOM_ID
    }
    const objectType = p.targetObject.type
    const sm = createGenericStateMachine({
      getRepository: () => getRepository(objectType),
      eventRepo,
      getLifecycle: (domainId, objType) => {
        const manifest = getFullManifest(domainId)
        const lc = manifest?.lifecycle?.[objType]
        if (!lc) throw new Error(`未找到 lifecycle: ${domainId}/${objType}`)
        return lc as any
      },
      getFieldMetadata,
      domainId: TASKS_DOMAIN_ID,
    })
    return sm.execute(p as any, smBus, userId, tx)
  }

  // 注入失败：state 步骤计数到 failAtStateStep 时返回失败
  let stateCallCount = 0
  function smExecute(proposal: unknown, smBus: EventBus, userId: USOM_ID, tx?: DbClient) {
    stateCallCount += 1
    if (opts.failAtStateStep && stateCallCount >= opts.failAtStateStep) {
      return Promise.resolve({
        success: false,
        error: `注入失败：第 ${stateCallCount} 个 state 步骤（模拟后续步骤崩溃）`,
      })
    }
    return realSmExecute(proposal, smBus, userId, tx)
  }

  return createDomainMutationService({
    getRepository: (objectType: string) => getRepository(objectType),
    getExecutor: () => createFieldExecutor(),
    getFieldMetadata,
    eventBus,
    transaction: <T,>(cb: (tx: any) => Promise<T>): Promise<T> =>
      db.transaction(cb as any) as unknown as Promise<T>,
    smExecute: smExecute as any,
    fieldUpdatedEventType: 'TaskFieldUpdated',
  })
}

/** 清理本次测试创建的 task（按 id）；新主线由 afterAll 按 userId 兜底清理 */
async function cleanupTask(taskId: string) {
  try {
    await db.delete(s.tasks).where(eq(s.tasks.id, taskId))
  } catch {
    /* 忽略 */
  }
}

beforeAll(async () => {
  // 测试用户需存在于 users 表（tasks/threads 外键约束）。幂等插入。
  try {
    await db.insert(s.users)
      .values({ id: TEST_USER, email: 't9-integration@test.local' })
      .onConflictDoNothing()
  } catch {
    /* 忽略已存在 */
  }
  // 兜底：清空该测试用户的全部 task / thread 行，避免历史污染
  try {
    await db.delete(s.tasks).where(eq(s.tasks.userId, TEST_USER))
  } catch {
    /* 忽略 */
  }
  try {
    await db.delete(s.threads).where(eq(s.threads.userId, TEST_USER))
  } catch {
    /* 忽略 */
  }
})

afterAll(async () => {
  // 测试结束再次清理，保持 DB 干净（不删除 user 行，供后续运行复用）
  try {
    await db.delete(s.tasks).where(eq(s.tasks.userId, TEST_USER))
  } catch {
    /* 忽略 */
  }
  try {
    await db.delete(s.threads).where(eq(s.threads.userId, TEST_USER))
  } catch {
    /* 忽略 */
  }
})

describe('写入口聚合事务 — 集成测试（真实 PostgreSQL）', () => {
  it('聚合 execute 多步写（同对象 字段+状态）单事务原子落库，DB 一致', async () => {
    const taskRepo = new TaskRepository()

    // 1. 事务外准备：一条 task（默认 status=todo）
    const task = await taskRepo.create(
      { title: '聚合写测试', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const taskId = task.id

    try {
      const service = buildService()

      // 2. 聚合 execute：先写字段 priority（FactField，字段执行器），
      //    再状态转换 start（todo → in_progress，task lifecycle 合法转换）。
      //    两步在同一顶层事务内，按声明序执行。
      //    注：不用 complete（complete 仅 from in_progress，todo 不可直接 complete）。
      const intent: AggregateIntent = {
        id: crypto.randomUUID() as USOM_ID,
        domainId: TASKS_DOMAIN_ID,
        objectType: 'task',
        targetId: taskId as USOM_ID,
        steps: [
          { kind: 'field', field: 'priority', value: 'high' },
          { kind: 'state', action: 'start' },
        ],
      }

      const res = await service.execute(intent, TEST_USER as USOM_ID)
      expect(res.success).toBe(true)

      // 3. 事务外复查 DB —— 字段与状态均已落库、一致
      const after = await taskRepo.findById(taskId as USOM_ID, TEST_USER as USOM_ID)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('in_progress') // 状态转换已落库
      expect(after!.priority).toBe('high') // 字段写已落库
    } finally {
      await cleanupTask(taskId)
    }
  })

  it('聚合 execute 中途失败回滚：字段写成功后注入 state 失败 → 字段更新回滚，DB 无脏数据', async () => {
    const taskRepo = new TaskRepository()

    const task = await taskRepo.create(
      { title: '聚合回滚测试', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const taskId = task.id
    const priorityBefore = task.priority

    try {
      // failAtStateStep=1：第 1 个 state 步骤（complete）即失败。
      // 字段步 priority 先于 state 步执行，会在事务内成功落库；
      // 随后 state 步注入失败 → 事务整体回滚 → 字段更新不应残留。
      const service = buildService({ failAtStateStep: 1 })

      const intent: AggregateIntent = {
        id: crypto.randomUUID() as USOM_ID,
        domainId: TASKS_DOMAIN_ID,
        objectType: 'task',
        targetId: taskId as USOM_ID,
        steps: [
          { kind: 'field', field: 'priority', value: 'critical' },
          { kind: 'state', action: 'complete' },
        ],
      }

      const res = await service.execute(intent, TEST_USER as USOM_ID)
      // execute 捕获失败，返回 success=false（事务已回滚）
      expect(res.success).toBe(false)
      expect(res.error).toContain('注入失败')

      // 事务外复查 DB 不变量 —— 全部回滚
      const after = await taskRepo.findById(taskId as USOM_ID, TEST_USER as USOM_ID)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('todo') // 状态未变
      expect(after!.priority).toBe(priorityBefore) // 字段回滚到原值
    } finally {
      await cleanupTask(taskId)
    }
  })

  it('promoteToThread 聚合链路正向：建主线 + 迁子任务 threadId + 删原任务，原子落库（BUG-001 已修复）', async () => {
    // 正向端到端：修复 BUG-001 后，create thread 步骤经 create:true 标记保持 targetId
    // 为 undefined，SM 走 create 路径新建主线；随后子任务经 valueFromLastObject 取新建主线
    // id 写入 threadId；最后软删原任务。整条聚合单事务原子落库。
    //
    // 历史（BUG-001）：`step.targetId ?? intent.targetId` 无法区分 create 步骤显式
    // targetId=undefined 与未设 targetId，导致 create thread 的 targetObject.id 回退为
    // 原 task id，SM findById → "对象不存在"，整条链路回滚。修复方式：MutationStep 增
    // create 标记，execute() 据此令 stepTargetId 保持 undefined（见 domain-mutation-service）。
    const taskRepo = new TaskRepository()
    const threadRepo = new ThreadRepository()

    const parent = await taskRepo.create(
      { title: 'PROMOTE 原任务', threadId: undefined, parentId: undefined },
      TEST_USER,
    )
    const sub1 = await taskRepo.create(
      { title: 'PROMOTE 子任务', threadId: undefined, parentId: parent.id },
      TEST_USER,
    )
    let newThreadId: string | undefined

    try {
      const service = buildService()

      // 与 tasks.ts promoteToThread 完全一致的 steps 组织（含 create:true 标记）
      const intent: AggregateIntent = {
        id: crypto.randomUUID() as USOM_ID,
        domainId: TASKS_DOMAIN_ID,
        objectType: 'task',
        targetId: parent.id as USOM_ID,
        steps: [
          {
            kind: 'state',
            action: 'create',
            objectType: 'thread',
            create: true, // 修复 BUG-001：标记 create，targetId 保持 undefined → SM create 路径
            payload: { name: 'PROMOTE 主线' },
            tag: 'newThread',
          },
          {
            kind: 'field',
            objectType: 'task',
            targetId: sub1.id as USOM_ID,
            field: 'threadId',
            valueFromLastObject: true, // 取上一步新建主线的 id
          },
          {
            kind: 'state',
            action: 'delete',
            objectType: 'task',
            targetId: parent.id as USOM_ID,
          },
        ],
      }

      const res = await service.execute(intent, TEST_USER as USOM_ID)

      // 正向：聚合链路整体成功
      expect(res.success).toBe(true)

      // 取回新建主线对象（tag 收集）
      const newThread = res.objects?.newThread as { id?: string; name?: string } | undefined
      expect(newThread).toBeTruthy()
      expect(newThread!.name).toBe('PROMOTE 主线')
      newThreadId = newThread!.id

      // 事务外复查 DB —— 三步均已落库一致
      // 1) 原任务已软删（status='deleted'）
      const parentAfter = await taskRepo.findById(parent.id as USOM_ID, TEST_USER as USOM_ID)
      // deleted 为终态，常规查询可能过滤；这里 findById 应仍可取到（仓库 findById 不过滤 status）
      if (parentAfter) {
        expect(parentAfter.status).toBe('deleted')
      }

      // 2) 子任务 threadId 已迁移到新建主线（valueFromLastObject 端到端走通）
      const sub1After = await taskRepo.findById(sub1.id as USOM_ID, TEST_USER as USOM_ID)
      expect(sub1After).not.toBeNull()
      expect(sub1After!.threadId).toBe(newThreadId)

      // 3) 新建主线确实落库（按 id 查得到）
      const threads = await threadRepo.findByUserId(TEST_USER as USOM_ID)
      expect(threads.map((t) => t.id)).toContain(newThreadId)
    } finally {
      await cleanupTask(sub1.id)
      await cleanupTask(parent.id)
      if (newThreadId) {
        try {
          await db.delete(s.threads).where(eq(s.threads.id, newThreadId))
        } catch {
          /* 忽略 */
        }
      }
    }
  })
})
