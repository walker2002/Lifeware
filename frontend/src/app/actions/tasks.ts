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
 * - 写操作：TODO: 后续通过 createOrchestrator → executeIntent 走完整 Nexus 链
 *   (当前 orchestrator 尚未实现 tasks 域处理，暂时直接调用 Repository)
 */

'use server'

import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository, type ThreadWithCount } from '@/domains/tasks/repository/thread'
import type { Task, Thread } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import type { CreateTaskInput, UpdateTaskInput, TaskFilters, CreateThreadInput } from '@/usom/interfaces/irepository'

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
  const repo = new TaskRepository()
  return repo.create(input, MVP_USER_ID as USOM_ID)
}

/**
 * 更新任务字段
 * @param taskId - 任务 ID
 * @param input - 更新数据
 * @returns 更新后的任务
 */
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const repo = new TaskRepository()
  return repo.update(taskId as USOM_ID, input, MVP_USER_ID as USOM_ID)
}

/**
 * 更新任务状态
 * @param taskId - 任务 ID
 * @param status - 新状态
 * @returns 更新后的任务
 */
export async function updateTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
  const repo = new TaskRepository()
  return repo.updateStatus(taskId as USOM_ID, status, MVP_USER_ID as USOM_ID)
}

/**
 * 归档任务
 * @param taskId - 任务 ID
 */
export async function archiveTask(taskId: string): Promise<void> {
  const repo = new TaskRepository()
  return repo.archive(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
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
  const all = await repo.findAllWithCount(MVP_USER_ID as USOM_ID)
  return all.find(wc => wc.thread.id === threadId) ?? null
}

/**
 * 创建新主线
 * @param input - 创建输入
 * @returns 新创建的主线
 */
export async function createThread(input: CreateThreadInput): Promise<Thread> {
  const repo = new ThreadRepository()
  return repo.create(input, MVP_USER_ID as USOM_ID)
}

/**
 * 更新主线状态
 * @param threadId - 主线 ID
 * @param status - 新状态
 * @returns 更新后的主线
 */
export async function updateThreadStatus(threadId: string, status: Thread['status']): Promise<Thread> {
  const repo = new ThreadRepository()
  return repo.updateStatus(threadId as USOM_ID, status, MVP_USER_ID as USOM_ID)
}
