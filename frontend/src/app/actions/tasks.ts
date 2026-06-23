/**
 * @file tasks
 * @brief Tasks Domain 服务端操作
 *
 * 所有 Repository 调用封装为 'use server' 函数，确保数据库访问仅在服务端执行。
 * 页面/组件通过调用这些 actions 获取和修改数据，而非直接 import Repository，
 * 避免 Node.js 模块（tls/net/fs）被打包到浏览器端导致构建失败。
 *
 * 架构说明（宪法 §III 1.11.0 业务事实写入口）：
 * - 读操作：直接调用 Repository（设计规格允许）
 * - 写操作（创建/状态转换）：通过 submitDynamicIntent 走完整 Nexus 链路（SM lifecycle）
 * - 字段写（updateTask/updateThread）：经 createTasksMutationService.execute
 *   单事务聚合写——所有非 undefined 字段构造为 field steps 原子写入，任一字段校验
 *   失败整体回滚（修复「逐字段 service.update 无事务」半截改动 bug）。字段步内部
 *   FactField 走字段执行器（字段级校验 + updateFields + TaskFieldUpdated），
 *   ContentField 直走 repo.updateFields；不再直接 repo.update 写 FactField。
 * - 完成任务（completeTask）：字段（actualDuration/notes）+ 状态（complete）在
 *   写入口 execute() 单事务内原子完成（消除两阶段写）。
 * - 提升为主线（promoteToThread）：建主线 + 迁子任务 threadId + 软删原任务，
 *   聚合事务 execute() 内原子完成（失败回滚）。
 * - 删除主线（deleteThread）：走 SM（thread lifecycle 含 archived→deleted），
 *   非硬删；需先归档再删除（lifecycle 约束）。
 */

'use server'

import { submitDynamicIntent } from './intent'
import { createTasksMutationService } from './tasks/mutation-service'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository, type ThreadWithCount } from '@/domains/tasks/repository/thread'
import type { Task, Thread } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import type { CreateTaskInput, UpdateTaskInput, TaskFilters, CreateThreadInput, UpdateThreadInput } from '@/usom/interfaces/irepository'

// ─── MVP 常量 ──────────────────────────────────────────────────────────────

/** MVP 阶段固定用户 ID */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

// ═══════════════════════════════════════════════════════════════════════════
// Task 操作
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 获取任务列表
 * @param filters - 筛选条件（可选）
 * @returns 任务数组
 */
export async function getTasks(filters?: TaskFilters & { parentId?: USOM_ID | null; threadId?: string }): Promise<Task[]> {
  const repo = new TaskRepository()
  return repo.findByUserId(MVP_USER_ID as USOM_ID, filters as TaskFilters)
}

/**
 * 根据 ID 获取单个任务
 * @param taskId - 任务 ID
 * @returns 任务或 null
 */
export async function getTaskById(taskId: string): Promise<Task | null> {
  const repo = new TaskRepository()
  return repo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
}

/**
 * 批量获取子任务数量
 * @param parentIds - 父任务 ID 列表
 * @returns parentId → count 映射
 */
export async function getChildCounts(parentIds: string[]): Promise<Record<string, number>> {
  const repo = new TaskRepository()
  const map = await repo.getChildCounts(parentIds as USOM_ID[], MVP_USER_ID as USOM_ID)
  return Object.fromEntries(map)
}

/**
 * 获取子任务列表
 * @param parentId - 父任务 ID
 * @returns 子任务数组
 */
export async function getSubtasks(parentId: string): Promise<Task[]> {
  const repo = new TaskRepository()
  return repo.findByParent(parentId as USOM_ID, MVP_USER_ID as USOM_ID)
}

/**
 * 创建新任务
 * @param input - 创建输入
 * @returns 新创建的任务
 */
export async function createTask(input: CreateTaskInput & { title: string }): Promise<Task> {
  const result = await submitDynamicIntent('tasks', 'createTask', input as unknown as Record<string, unknown>)
  if (!result.success) {
    throw new Error(result.error ?? '创建任务失败')
  }
  return result.object as Task
}

/**
 * 更新任务字段（经业务事实写入口，单事务聚合写）
 *
 * 把 input 的所有非 undefined 字段构造为 field steps，在 service.execute 单事务内
 * 原子写入（对齐 updateHabit intent.ts:910）。任一字段校验失败 → 整体回滚，不留
 * 半截改动（修复「逐字段 service.update 无事务」bug，revisit 存档案题1 实案）。
 *
 * 字段写均经字段执行器（字段级校验 + updateFields + TaskFieldUpdated），不直接
 * repo.update 写 FactField（消除 repo-bypass 违宪）。
 *
 * @param taskId - 任务 ID
 * @param input - 更新数据（仅值非 undefined 的字段落库）
 * @returns 更新后的任务
 */
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  // 每个值非 undefined 的字段构造一个 field step，单事务原子写
  const fieldSteps = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({ kind: 'field' as const, field, value }))

  // 无字段可写：直接读回当前任务
  if (fieldSteps.length === 0) {
    const repo = new TaskRepository()
    const task = await repo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!task) throw new Error('任务不存在')
    return task
  }

  const service = createTasksMutationService()
  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId: 'tasks',
      objectType: 'task',
      targetId: taskId as USOM_ID,
      steps: fieldSteps,
    },
    MVP_USER_ID as USOM_ID,
  )

  if (!res.success) {
    throw new Error(res.error ?? '更新任务失败')
  }

  // 纯 field steps 路径下 res.object 为 undefined（execute 仅 state step 设 lastObject），
  // 兜底 findById 读回更新后的任务
  const repo = new TaskRepository()
  const updated = await repo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!updated) throw new Error('任务不存在')
  return updated
}

/**
 * 更新任务状态（通过 Nexus 链路）
 *
 * 将目标状态映射为 manifest lifecycle action：
 * - planned → planTask (SM action: plan)
 * - in_progress → startTask (SM action: start)
 * - completed → completeTask (SM action: complete)
 * - archived → archiveTask (SM action: archive)
 * - deleted → deleteTask (SM action: delete)
 *
 * @param taskId - 任务 ID
 * @param status - 新状态
 * @returns 更新后的任务
 */
export async function updateTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
  const STATUS_TO_ACTION: Record<string, string> = {
    planned: 'planTask',
    in_progress: 'startTask',
    completed: 'completeTask',
    archived: 'archiveTask',
    deleted: 'deleteTask',
  }
  const action = STATUS_TO_ACTION[status]
  if (!action) {
    throw new Error(`不支持的目标状态: ${status}`)
  }
  const result = await submitDynamicIntent('tasks', action, { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '状态更新失败')
  }
  return result.object as Task
}

/**
 * 归档任务（通过 Nexus 链路）
 * @param taskId - 任务 ID
 */
export async function archiveTask(taskId: string): Promise<void> {
  const result = await submitDynamicIntent('tasks', 'archiveTask', { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '归档任务失败')
  }
}

/**
 * 删除任务（通过 Nexus 链路，软删除 → status = 'deleted'）
 *
 * 注意：删除操作走 SM lifecycle 转换，将 status 设为 'deleted'（非硬删除）。
 * deleted 状态的任务不会出现在任何常规查询中。
 * 已归档（archived）的任务不可直接删除，需先取消归档到其他状态后再删除。
 * @param taskId - 任务 ID
 */
export async function deleteTask(taskId: string): Promise<void> {
  const result = await submitDynamicIntent('tasks', 'deleteTask', { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '删除任务失败')
  }
}

/**
 * 完成任务：字段 + 状态在写入口单事务内原子完成
 *
 * 步骤：先字段（actualDuration/notes 等），后状态（complete）。
 * 整体在 createTasksMutationService().execute() 单事务内，任一步失败整体回滚
 * （消除旧版「先 repo 存字段、再走 SM 状态转换」的两阶段写）。
 *
 * @param taskId - 任务 ID
 * @param extraFields - 额外字段（actualDuration, notes 等）
 * @returns 更新后的任务
 */
export async function completeTask(taskId: string, extraFields?: Record<string, unknown>): Promise<Task> {
  const service = createTasksMutationService()
  const fieldSteps = Object.entries(extraFields ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({ kind: 'field' as const, field, value }))

  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId: 'tasks',
      objectType: 'task',
      targetId: taskId as USOM_ID,
      steps: [...fieldSteps, { kind: 'state', action: 'complete' }],
    },
    MVP_USER_ID as USOM_ID,
  )
  if (!res.success) {
    throw new Error(res.error ?? '完成任务失败')
  }
  // SM 状态步返回更新后的对象；兜底读回
  if (res.object) return res.object as Task
  const repo = new TaskRepository()
  const updated = await repo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!updated) throw new Error('任务不存在')
  return updated
}

/**
 * 获取任务的祖先链（沿 parentId 向上递归）
 * @param taskId - 任务 ID
 * @returns 祖先数组（从最近父级到最远根级）
 */
export async function getTaskAncestors(taskId: string): Promise<Array<{ id: string; title: string }>> {
  const repo = new TaskRepository()
  const ancestors: Array<{ id: string; title: string }> = []

  // 首次查询：获取起始任务以确定 parentId
  let current = await repo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!current?.parentId) return ancestors

  // 后续每步只查一次：当前 parentId 的父任务
  for (let i = 0; i < 10 && current?.parentId; i++) {
    const parent = await repo.findById(current.parentId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!parent) break
    ancestors.push({ id: parent.id, title: parent.title })
    current = parent
  }

  return ancestors
}

/**
 * 搜索任务并返回祖先路径（支持搜索深层子任务）
 * @param query - 搜索关键词
 * @param filters - 额外筛选条件
 * @returns 匹配任务 + 祖先映射（可序列化的 Record 格式）
 */
export async function searchTasks(
  query: string,
  filters?: { threadId?: string; clarity?: string[]; status?: string[] },
): Promise<{
  matches: Task[]
  ancestorMap: Record<string, Array<{ id: string; title: string }>>
}> {
  // 输入清理：截断 + 去首尾空白
  const sanitized = query.trim().slice(0, 200)
  if (!sanitized) {
    return { matches: [], ancestorMap: {} }
  }

  const repo = new TaskRepository()
  const { matches, ancestorMap } = await repo.findMatchingWithAncestors(
    sanitized,
    MVP_USER_ID as USOM_ID,
    filters,
  )
  // 将 Map<Task[]> 转换为可序列化的 Record<string, {id, title}[]>
  const serializableAncestorMap: Record<string, Array<{ id: string; title: string }>> = {}
  for (const [taskId, ancestors] of ancestorMap.entries()) {
    serializableAncestorMap[taskId] = ancestors.map(a => ({ id: a.id, title: a.title }))
  }
  return { matches, ancestorMap: serializableAncestorMap }
}

// ═══════════════════════════════════════════════════════════════════════════
// Thread 操作
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 获取所有主线（含任务计数）
 * @returns 主线列表（含 taskCount、completedTaskCount）
 */
export async function getThreads(): Promise<ThreadWithCount[]> {
  const repo = new ThreadRepository()
  return repo.findAllWithCount(MVP_USER_ID as USOM_ID)
}

/**
 * 获取无主线（orphan）任务计数
 *
 * findAllWithCount 以 threads LEFT JOIN tasks 关联，漏掉 thread_id 为空的任务；
 * 此 action 单独统计 orphan 任务数，供侧栏「普通任务」计数与「全部任务」合计使用。
 * @returns 未归档的 orphan 任务数
 */
export async function getOrphanTaskCount(): Promise<number> {
  const repo = new TaskRepository()
  return repo.countOrphanTasks(MVP_USER_ID as USOM_ID)
}

/**
 * 根据 ID 获取单个主线
 * @param threadId - 主线 ID
 * @returns 主线或 null
 */
export async function getThreadById(threadId: string): Promise<Thread | null> {
  const repo = new ThreadRepository()
  return repo.findById(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
}

/**
 * 获取单个主线及其任务计数
 * @param threadId - 主线 ID
 * @returns 主线 + 计数，或 null
 */
export async function getThreadWithCount(threadId: string): Promise<ThreadWithCount | null> {
  const repo = new ThreadRepository()
  return repo.findByIdWithCount(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
}

/**
 * 创建新主线（通过 Nexus 链路）
 * @param input - 创建输入
 * @returns 新创建的主线
 */
export async function createThread(input: CreateThreadInput & { name: string }): Promise<Thread> {
  const result = await submitDynamicIntent('tasks', 'createThread', input as unknown as Record<string, unknown>)
  if (!result.success) {
    throw new Error(result.error ?? '创建主线失败')
  }
  return result.object as Thread
}

/**
 * 更新主线字段（经业务事实写入口，单事务聚合写）
 *
 * 把 input 的所有非 undefined 字段构造为 field steps，在 service.execute 单事务内
 * 原子写入（对齐 updateTask tasks.ts:110）。任一字段校验失败 → 整体回滚，不留
 * 半截改动（修复「逐字段 service.update 无事务」bug，revisit 存档案题1 实案，
 * 与 updateTask 同病）。objectType='thread' 使字段步路由到 thread 仓储 + 字段执行器。
 *
 * @param threadId - 主线 ID
 * @param input - 更新数据（仅值非 undefined 的字段落库）
 * @returns 更新后的主线
 */
export async function updateThread(threadId: string, input: UpdateThreadInput): Promise<Thread> {
  // 每个值非 undefined 的字段构造一个 field step，单事务原子写
  const fieldSteps = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({ kind: 'field' as const, field, value }))

  // 无字段可写：直接读回当前主线
  if (fieldSteps.length === 0) {
    const repo = new ThreadRepository()
    const thread = await repo.findById(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!thread) throw new Error('主线不存在')
    return thread
  }

  const service = createTasksMutationService()
  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId: 'tasks',
      objectType: 'thread',
      targetId: threadId as USOM_ID,
      steps: fieldSteps,
    },
    MVP_USER_ID as USOM_ID,
  )

  if (!res.success) {
    throw new Error(res.error ?? '更新主线失败')
  }

  // 纯 field steps 路径下 res.object 为 undefined（execute 仅 state step 设 lastObject），
  // 兜底 findById 读回更新后的主线
  const repo = new ThreadRepository()
  const updated = await repo.findById(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!updated) throw new Error('主线不存在')
  return updated
}

/**
 * 更新主线状态（通过 Nexus 链路）
 *
 * 将目标状态映射为 manifest lifecycle action：
 * - active → resumeThread (paused → active)
 * - paused → pauseThread (active → paused)
 * - completed → completeThread (active → completed)
 * - archived → archiveThread (completed → archived)
 *
 * @param threadId - 主线 ID
 * @param status - 新状态
 * @returns 更新后的主线
 */
export async function updateThreadStatus(threadId: string, status: Thread['status']): Promise<Thread> {
  const THREAD_STATUS_TO_ACTION: Record<string, string> = {
    active: 'resumeThread',
    paused: 'pauseThread',
    completed: 'completeThread',
    archived: 'archiveThread',
  }
  const action = THREAD_STATUS_TO_ACTION[status]
  if (!action) {
    throw new Error(`不支持的线程目标状态: ${status}`)
  }
  const result = await submitDynamicIntent('tasks', action, { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '线程状态更新失败')
  }
  return result.object as Thread
}

/**
 * 暂停主线（通过 Nexus 链路）
 * @param threadId - 主线 ID
 * @returns 更新后的主线
 */
export async function pauseThread(threadId: string): Promise<Thread> {
  const result = await submitDynamicIntent('tasks', 'pauseThread', { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '暂停主线失败')
  }
  return result.object as Thread
}

/**
 * 恢复主线（通过 Nexus 链路）
 * @param threadId - 主线 ID
 * @returns 更新后的主线
 */
export async function resumeThread(threadId: string): Promise<Thread> {
  const result = await submitDynamicIntent('tasks', 'resumeThread', { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '恢复主线失败')
  }
  return result.object as Thread
}

/**
 * 完成主线（通过 Nexus 链路）
 * @param threadId - 主线 ID
 * @returns 更新后的主线
 */
export async function completeThread(threadId: string): Promise<Thread> {
  const result = await submitDynamicIntent('tasks', 'completeThread', { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '完成主线失败')
  }
  return result.object as Thread
}

/**
 * 归档主线（通过 Nexus 链路）
 * @param threadId - 主线 ID
 * @returns 更新后的主线
 */
export async function archiveThread(threadId: string): Promise<Thread> {
  const result = await submitDynamicIntent('tasks', 'archiveThread', { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '归档主线失败')
  }
  return result.object as Thread
}

/**
 * 将任务提升为主线（聚合事务，单事务原子）
 *
 * 单事务内有序步骤：
 *   1. state:create（thread）—— 建新主线（SM create 路径，触发 ThreadCreated）
 *   2. field:threadId（每个子任务）—— 子任务关联到新主线（字段执行器，
 *      valueFromLastObject 取新建主线 ID），保持 parentId 层级不变
 *   3. state:delete（task）—— 软删除原任务（SM delete，触发 TaskDeleted）
 *
 * 任一步失败整体回滚。旧版分别用 repo.update 写 threadId / 直写 status='deleted'
 * 的 repo-bypass 违宪代码已消除。
 *
 * @param taskId - 要提升的任务 ID
 * @param threadFields - 可选的主线字段覆盖
 * @returns 新创建的主线
 */
export async function promoteToThread(
  taskId: string,
  threadFields?: Partial<CreateThreadInput>,
): Promise<Thread> {
  const taskRepo = new TaskRepository()
  const task = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!task) throw new Error('任务不存在')

  // 读取子任务列表（读操作允许直接 repo 调用），用于构造迁移步骤
  const subtasks = await taskRepo.findByParent(taskId as USOM_ID, MVP_USER_ID as USOM_ID)

  // 建主线的初始字段（SM create 的 payload）
  const createPayload: Record<string, unknown> = {
    name: threadFields?.name ?? task.title,
    description: threadFields?.description ?? (task.description as string | undefined),
    color: threadFields?.color,
    priority: threadFields?.priority ?? (task.priority as CreateThreadInput['priority']),
    startDate: threadFields?.startDate,
    endDate: threadFields?.endDate,
    tags: threadFields?.tags,
  }

  const service = createTasksMutationService()
  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId: 'tasks',
      objectType: 'task',
      targetId: taskId as USOM_ID,
      steps: [
        // 1. 建主线（新对象，create:true → SM create 路径，targetId 保持 undefined
        //    不回退到 intent.targetId；修复 BUG-001），tag 供取回
        {
          kind: 'state',
          action: 'create',
          objectType: 'thread',
          create: true,
          payload: createPayload,
          tag: 'newThread',
        },
        // 2. 子任务关联到新主线（threadId 取上一步新建主线的 ID）
        ...subtasks.map((subtask) => ({
          kind: 'field' as const,
          objectType: 'task' as const,
          targetId: subtask.id as USOM_ID,
          field: 'threadId',
          valueFromLastObject: true,
        })),
        // 3. 软删除原任务（SM delete，走生命周期，不再直写 status）
        {
          kind: 'state',
          action: 'delete',
          objectType: 'task',
          targetId: taskId as USOM_ID,
        },
      ],
    },
    MVP_USER_ID as USOM_ID,
  )
  if (!res.success) {
    throw new Error(res.error ?? '提升为主线失败')
  }
  // 取回新建主线对象（由 tag 收集）
  const newThread = res.objects?.newThread as Thread | undefined
  if (!newThread) throw new Error('提升为主线失败：未取得新建主线')
  return newThread
}

/**
 * 删除主线（走 SM lifecycle，软删除 → status='deleted'）
 *
 * Thread 生命周期已声明 archived → deleted 转换。删除经 Nexus SM（submitDynamicIntent
 * → deleteThread → SM action=delete），不再 repo 硬删（消除 repo-bypass 违宪）。
 * 需主线处于 archived 状态；其它状态需先归档。deleted 为终态、不可恢复。
 *
 * @param threadId - 主线 ID
 */
export async function deleteThread(threadId: string): Promise<void> {
  const result = await submitDynamicIntent('tasks', 'deleteThread', { threadId })
  if (!result.success) {
    throw new Error(result.error ?? '删除主线失败')
  }
}
