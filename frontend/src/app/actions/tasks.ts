/**
 * @file tasks
 * @brief Tasks Domain 服务端操作
 *
 * 所有 Repository 调用封装为 'use server' 函数，确保数据库访问仅在服务端执行。
 * 页面/组件通过调用这些 actions 获取和修改数据，而非直接 import Repository，
 * 避免 Node.js 模块（tls/net/fs）被打包到浏览器端导致构建失败。
 *
 * 架构说明：
 * - 读操作：直接调用 Repository（设计规格允许）
 * - 写操作：通过 submitDynamicIntent 走完整 Nexus 链路（SM lifecycle）
 * - 字段更新（updateTask/updateThread）：保持直接 repo 调用（SM 不支持字段更新）
 * - deletTthread：硬删除，保持直接 repo 调用（Thread 生命周期不支持 deleted 状态）
 */

'use server'

import { submitDynamicIntent } from './intent'
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
 * 更新任务字段（直接 repo 调用）
 *
 * 注意：SM 只支持 create/updateStatus，不支持字段更新。
 * 字段更新不是状态转换，保留直接 repo 调用。
 * TODO: 待 SM 扩展字段更新能力后迁移至 Nexus 链路。
 *
 * @param taskId - 任务 ID
 * @param input - 更新数据
 * @returns 更新后的任务
 */
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const repo = new TaskRepository()
  return repo.update(taskId as USOM_ID, input, MVP_USER_ID as USOM_ID)
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
 * 完成任务：先保存额外字段，再通过 Nexus 链路执行状态转换
 *
 * 两阶段模式：先通过 repo.update() 持久化非破坏性字段，
 * 再调用 submitDynamicIntent 走 SM 状态转换。
 * 若状态转换失败，字段数据至少已持久化。
 *
 * @param taskId - 任务 ID
 * @param extraFields - 额外字段（actualDuration, notes 等）
 * @returns 更新后的任务
 */
export async function completeTask(taskId: string, extraFields?: Record<string, unknown>): Promise<Task> {
  // 第一阶段：保存额外字段（直接 repo 调用——SM 不支持字段更新）
  if (extraFields && Object.keys(extraFields).length > 0) {
    const repo = new TaskRepository()
    await repo.update(taskId as USOM_ID, extraFields as UpdateTaskInput, MVP_USER_ID as USOM_ID)
  }
  // 第二阶段：状态转换（通过 Nexus SM）
  const result = await submitDynamicIntent('tasks', 'completeTask', { taskId })
  if (!result.success) {
    throw new Error(result.error ?? '完成任务失败')
  }
  return result.object as Task
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
 * 更新主线字段（直接 repo 调用）
 *
 * 注意：SM 只支持 create/updateStatus，不支持字段更新。
 * 字段更新不是状态转换，保留直接 repo 调用。
 * TODO: 待 SM 扩展字段更新能力后迁移至 Nexus 链路。
 *
 * @param threadId - 主线 ID
 * @param input - 更新数据
 * @returns 更新后的主线
 */
export async function updateThread(threadId: string, input: UpdateThreadInput): Promise<Thread> {
  const repo = new ThreadRepository()
  return repo.update(threadId as USOM_ID, input, MVP_USER_ID as USOM_ID)
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
 * 将任务提升为主线
 *
 * 四阶段操作：
 * 1. 读取原任务获取名称、描述等上下文
 * 2. 通过 Nexus 创建新主线（走 SM lifecycle，触发 ThreadCreated 事件）
 * 3. 子任务关联到新主线（仅更新 threadId，保持层级不变）
 * 4. 软删除原任务（status → deleted），因为它已提升为主线不再需要
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

  const threadInput: CreateThreadInput & { name: string } = {
    name: threadFields?.name ?? task.title,
    description: threadFields?.description ?? (task.description as string | undefined),
    color: threadFields?.color,
    priority: threadFields?.priority ?? (task.priority as CreateThreadInput['priority']),
    startDate: threadFields?.startDate,
    endDate: threadFields?.endDate,
    tags: threadFields?.tags,
  }
  const result = await submitDynamicIntent('tasks', 'createThread', threadInput as unknown as Record<string, unknown>)
  if (!result.success) {
    throw new Error(result.error ?? '提升为主线失败')
  }
  const newThread = result.object as Thread

  // ── 子任务关联到新主线 ──
  // 原任务的子任务保持层级结构（不改变 parentId），但全部关联到新主线
  const subtasks = await taskRepo.findByParent(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
  for (const subtask of subtasks) {
    await taskRepo.update(subtask.id as USOM_ID, {
      threadId: newThread.id,
    } as UpdateTaskInput, MVP_USER_ID as USOM_ID)
  }

  // 删除原任务（已提升为主线，不再需要保留）
  // 使用 repo 直接软删除，将 status 设为 'deleted'
  await taskRepo.update(taskId as USOM_ID, {
    status: 'deleted',
  } as UpdateTaskInput, MVP_USER_ID as USOM_ID)

  return newThread
}

/**
 * 彻底删除主线（不可恢复）
 *
 * 注意：Thread 生命周期不支持 deleted 状态（与 Task/Habit 不同）。
 * 删除操作保留直接 repo 硬删除。
 * TODO Phase C: 评估是否需要为 Thread 添加软删除支持。
 *
 * @param threadId - 主线 ID
 */
export async function deleteThread(threadId: string): Promise<void> {
  const repo = new ThreadRepository()
  return repo.delete(threadId as USOM_ID, MVP_USER_ID as USOM_ID)
}
